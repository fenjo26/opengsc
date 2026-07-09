// Core SEO generation logic, factored out of the API routes so it can be reused by both
// the synchronous routes and the background-job runner. No HTTP / auth here — pure work.

import { fetchLLM, fetchLLMDetailed } from "@/lib/llm";
import { runSerp } from "@/lib/seo/serp";
import { scrapeMany } from "@/lib/seo/scrape";
import {
  buildOutlinePrompt, buildTextPrompt, buildAnalysisPrompt, buildFactScrubPrompt, buildSourceExtractPrompt,
  buildAutoFactCleanPrompt, buildWireframePrompt, buildSectionEnrichPrompt, buildStructureExpandPrompt,
  buildHeadingLocalizePrompt, buildTextExpandPrompt, buildTextTrimPrompt, buildSectionTextPrompt,
  enforceLinkPolicy, redactBannedWords, extractJson, CompetitorInput,
} from "@/lib/seo/prompts";
import { findRagFacts } from "@/lib/seo/rag";
import { decodeHtmlEntities } from "@/lib/seo/outlineFormat";

// Apply fn to every string value IN PLACE (existing references like `meta` stay valid).
function deepMapStringsInPlace(obj: any, fn: (s: string) => string): void {
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => { if (typeof v === "string") obj[i] = fn(v); else deepMapStringsInPlace(v, fn); });
    return;
  }
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "string") obj[k] = fn(v);
      else deepMapStringsInPlace(v, fn);
    }
  }
}

export type GenResult = { ok: true; data: any } | { ok: false; error: string };

// Run async tasks with bounded concurrency (avoid hammering the provider with 20 parallel calls).
async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]); }
  });
  await Promise.all(workers);
}

// Render a compact per-source facts object (from the map stage) into a short text block.
function renderExtract(j: any): string {
  const lines: string[] = [];
  if (j?.specs && typeof j.specs === "object" && !Array.isArray(j.specs)) {
    const s = Object.entries(j.specs).map(([k, v]) => `${k}=${v}`).join("; ");
    if (s) lines.push(`Спеки: ${s}`);
  }
  if (Array.isArray(j?.prices) && j.prices.length) lines.push(`Цены: ${j.prices.slice(0, 10).join("; ")}`);
  if (Array.isArray(j?.key_facts) && j.key_facts.length) lines.push(`Факты: ${j.key_facts.slice(0, 12).join("; ")}`);
  if (Array.isArray(j?.entities) && j.entities.length) lines.push(`Сущности: ${j.entities.slice(0, 12).join(", ")}`);
  if (Array.isArray(j?.headings_covered) && j.headings_covered.length) lines.push(`Темы: ${j.headings_covered.slice(0, 12).join("; ")}`);
  return lines.join("\n").slice(0, 1600);
}

// MAP stage: extract compact facts from each source separately (small, reliable, parallel calls),
// so the REDUCE stage (outline) builds from clean per-source facts instead of raw 20-page HTML.
async function mapExtractFacts(competitors: CompetitorInput[], keyword: string, country: string, provider: string, apiKey: string, model?: string, baseUrl?: string): Promise<void> {
  const targets = competitors.filter((c) => c.text_sample && String(c.text_sample).trim().length > 80).slice(0, 12);
  await runPool(targets, 2, async (c) => { // low concurrency — parallel bursts trip provider TPM limits (429)
    try {
      const raw = await fetchLLM(buildSourceExtractPrompt({ url: c.url, title: c.title || c.url, text: String(c.text_sample), keyword, country }), provider, apiKey, 1200, model, baseUrl);
      const j = extractJson(raw);
      const rendered = j ? renderExtract(j) : "";
      if (rendered) c.extracted = rendered;
    } catch { /* per-source extraction is best-effort */ }
  });
}

// Apply find→replace corrections over an object's STRING VALUES only (keys/structure untouched).
// Safe against JSON corruption because we never touch keys and rebuild the object in place.
function applyCorrections(obj: any, corrections: { find: string; replace: string }[]): any {
  if (typeof obj === "string") {
    let s = obj;
    for (const c of corrections) if (c.find) s = s.split(c.find).join(c.replace);
    return s;
  }
  if (Array.isArray(obj)) return obj.map((x) => applyCorrections(x, corrections));
  if (obj && typeof obj === "object") {
    const o: any = {};
    for (const k of Object.keys(obj)) o[k] = applyCorrections(obj[k], corrections);
    return o;
  }
  return obj;
}

// ─── Volume guard: make per-section word budgets actually sum to the target ──────
// Models sometimes copy the schema's example numbers into every section (e.g. [130,160]),
// so a 2500-word plan silently becomes ~1000 words of budgets — and the text step then
// honors those small budgets. Deterministic fix: if the sum of section budgets is far
// off the target, scale every section's word_count proportionally.
function toWcRange(v: any): [number, number] | null {
  if (Array.isArray(v) && v.length >= 2 && isFinite(+v[0]) && isFinite(+v[1]) && +v[1] > 0) return [+v[0], +v[1]];
  if (typeof v === "number" && isFinite(v) && v > 0) return [v, v];
  if (typeof v === "string") {
    const m = v.match(/\d+/g);
    if (m?.length) { const a = +m[0], b = +(m[1] ?? m[0]); if (b > 0) return [a, b]; }
  }
  return null;
}
// Each section's OWN contribution to the article: childless section → total; parent →
// self (its intro paragraphs) since a parent's total conventionally includes subsections.
function ownRanges(secs: any[]): ([number, number] | null)[] {
  const depth = (s: any) => (s?.h_level === "H4" ? 4 : s?.h_level === "H3" ? 3 : 2);
  const hasKids = (i: number) => i + 1 < secs.length && depth(secs[i + 1]) > depth(secs[i]);
  return secs.map((s: any, i: number) => {
    const total = toWcRange(s?.word_count_total);
    const self = toWcRange(s?.word_count_self);
    return hasKids(i) ? (self || (total ? [Math.round(total[0] * 0.3), Math.round(total[1] * 0.3)] as [number, number] : null)) : (total || self);
  });
}

// Sum of the outline's own per-section budgets — the volume the outline would really produce.
export function ownBudgetSum(outline: any): number {
  const secs: any[] = Array.isArray(outline?.sections) ? outline.sections : [];
  if (!secs.length) return 0;
  return Math.round(ownRanges(secs).reduce((acc, r) => acc + (r ? (r[0] + r[1]) / 2 : 0), 0));
}

export function normalizeWordBudgets(outline: any, target: number): boolean {
  if (!target || !Array.isArray(outline?.sections) || !outline.sections.length) return false;
  const secs: any[] = outline.sections;
  const depth = (s: any) => (s?.h_level === "H4" ? 4 : s?.h_level === "H3" ? 3 : 2);
  const hasKids = (i: number) => i + 1 < secs.length && depth(secs[i + 1]) > depth(secs[i]);
  const own = ownRanges(secs);
  const sum = own.reduce((acc: number, r: [number, number] | null) => acc + (r ? (r[0] + r[1]) / 2 : 0), 0);
  if (!sum) return false;
  const k = target / sum;
  if (k > 0.98 && k < 1.02) return false; // close enough
  // Scale every section's OWN budget…
  for (let i = 0; i < secs.length; i++) {
    const r = own[i]; if (!secs[i] || !r) continue;
    const scaled: [number, number] = [Math.round(r[0] * k), Math.round(r[1] * k)];
    secs[i].word_count_self = scaled;
    if (!hasKids(i)) secs[i].word_count_total = scaled;
  }
  // …then rebuild parents' totals as self + descendants' totals (bottom-up).
  for (let i = secs.length - 1; i >= 0; i--) {
    if (!hasKids(i)) continue;
    const self = toWcRange(secs[i].word_count_self) || [0, 0];
    let lo = self[0], hi = self[1];
    for (let j = i + 1; j < secs.length && depth(secs[j]) > depth(secs[i]); j++) {
      if (depth(secs[j]) === depth(secs[i]) + 1) {
        const t = toWcRange(secs[j].word_count_total);
        if (t) { lo += t[0]; hi += t[1]; }
      }
    }
    secs[i].word_count_total = [lo, hi];
  }
  return true;
}

// ─── Structure-expansion pass: deterministically graft model-proposed H3s under thin H2s ──
// Runs when the outline is flat (H2s with <2 child H3s) — typical with user templates, where
// models are too conservative to add their own subsections despite instructions.
async function expandOutlineStructure(outline: any, ctx: {
  keyword: string; language: string; country: string; provider: string; apiKey: string;
  model?: string; baseUrl?: string; pageGoal?: "informational" | "commercial" | "mixed"; paa?: string[];
  targetWc?: number;
}): Promise<boolean> {
  const sections: any[] = Array.isArray(outline?.sections) ? outline.sections : [];
  // Section count is BOUND to the word target (~100 words/section): more sections than the
  // budget supports = every section becomes a 70-word stub and the article overshoots.
  const maxSections = ctx.targetWc && ctx.targetWc >= 500
    ? Math.max(10, Math.min(34, Math.round(ctx.targetWc / 100)))
    : 26;
  if (!sections.length || sections.length >= maxSections) return false;
  // Count H3 children per H2; skip expansion when the outline is already deep.
  let thinH2 = 0, h2Count = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i]?.h_level !== "H2") continue;
    h2Count++;
    let kids = 0;
    for (let j = i + 1; j < sections.length && sections[j]?.h_level !== "H2"; j++) kids++;
    if (kids < 2) thinH2++;
  }
  if (!h2Count || thinH2 < Math.ceil(h2Count / 2)) return false;

  const prompt = buildStructureExpandPrompt({
    keyword: ctx.keyword, language: ctx.language, country: ctx.country,
    pageGoal: ctx.pageGoal, paa: ctx.paa,
    maxAdd: maxSections - sections.length,
    sections: sections.map((s: any) => ({ h_level: s.h_level, heading: s.heading })),
  });
  const raw = await fetchLLM(prompt, ctx.provider, ctx.apiKey, 4000, ctx.model, ctx.baseUrl);
  const parsed: any = extractJson(raw);
  const insertions: any[] = Array.isArray(parsed?.insertions) ? parsed.insertions : [];
  if (!insertions.length) return false;

  const have = new Set(sections.map((s: any) => String(s.heading || "").trim().toLowerCase()));
  let added = 0;
  for (const ins of insertions) {
    const anchor = String(ins?.after_heading || "").trim().toLowerCase();
    const idx = sections.findIndex((s: any) => String(s.heading || "").trim().toLowerCase() === anchor && s.h_level === "H2");
    if (idx === -1) continue;
    // Insert AFTER the anchor H2's existing H3 block (i.e. right before the next H2).
    let at = idx + 1;
    while (at < sections.length && sections[at]?.h_level !== "H2") at++;
    const newbies = (Array.isArray(ins.sections) ? ins.sections : [])
      .filter((n: any) => n?.heading && !have.has(String(n.heading).trim().toLowerCase()))
      .slice(0, 4)
      .map((n: any) => ({
        h_level: "H3", heading: String(n.heading).trim(),
        word_count_total: toWcRange(n.word_count_total) || [80, 160],
        word_count_self: toWcRange(n.word_count_total) || [80, 160],
        entities_to_cover: [], keywords: [], summary: String(n.summary || ""),
        visual_elements: [], copywriter_notes: "", entity_connections: [],
        needs_real_experience: false,
      }));
    newbies.forEach((n: any) => have.add(n.heading.trim().toLowerCase()));
    sections.splice(at, 0, ...newbies.slice(0, Math.max(0, maxSections - sections.length)));
    added += newbies.length;
    if (sections.length >= maxSections) break;
  }
  return added > 0;
}

// ─── Heading localization pass: apply model-proposed renames deterministically ─────
// Template headings arrive in English and models keep them verbatim; this pass translates
// them into the article language and applies the narration voice, without touching order,
// structure or budgets. Renames are matched exactly and deduplicated before applying.
async function localizeOutlineHeadings(outline: any, ctx: {
  keyword: string; language: string; country: string; provider: string; apiKey: string;
  model?: string; baseUrl?: string; pageGoal?: "informational" | "commercial" | "mixed";
}): Promise<boolean> {
  const sections: any[] = Array.isArray(outline?.sections) ? outline.sections : [];
  if (!sections.length) return false;
  const prompt = buildHeadingLocalizePrompt({
    keyword: ctx.keyword, language: ctx.language, country: ctx.country,
    narration: outline?.meta?.narration === "first" ? "first" : outline?.meta?.narration === "third" ? "third" : undefined,
    pageGoal: ctx.pageGoal, h1: outline?.meta?.h1,
    titleOptions: Array.isArray(outline?.meta?.title_options) ? outline.meta.title_options : undefined,
    descriptionOptions: Array.isArray(outline?.meta?.description_options) ? outline.meta.description_options : undefined,
    headings: sections.map((s: any) => ({ h_level: s.h_level, heading: s.heading })),
  });
  const raw = await fetchLLM(prompt, ctx.provider, ctx.apiKey, 3000, ctx.model, ctx.baseUrl);
  const parsed: any = extractJson(raw);
  if (!parsed) return false;

  let changed = false;
  const have = new Set(sections.map((s: any) => String(s.heading || "").trim().toLowerCase()));
  const renames: any[] = Array.isArray(parsed.renames) ? parsed.renames : [];
  for (const r of renames) {
    const from = String(r?.from || "").trim();
    const to = String(r?.to || "").trim();
    if (!from || !to || from === to) continue;
    if (have.has(to.toLowerCase())) continue; // never create duplicate headings
    const sec = sections.find((s: any) => String(s.heading || "").trim() === from);
    if (!sec) continue;
    have.delete(from.toLowerCase());
    have.add(to.toLowerCase());
    sec.heading = to;
    changed = true;
  }
  const newH1 = String(parsed.h1 || "").trim();
  if (newH1 && newH1 !== String(outline?.meta?.h1 || "").trim()) {
    (outline.meta ||= {}).h1 = newH1;
    changed = true;
  }
  // Localized meta tags (Title/Description) — applied only when the model returned non-empty ones.
  const titles = (Array.isArray(parsed.title_options) ? parsed.title_options : []).map((x: any) => String(x || "").trim()).filter(Boolean);
  if (titles.length) { (outline.meta ||= {}).title_options = titles; changed = true; }
  const descs = (Array.isArray(parsed.description_options) ? parsed.description_options : []).map((x: any) => String(x || "").trim()).filter(Boolean);
  if (descs.length) { (outline.meta ||= {}).description_options = descs; changed = true; }
  return changed;
}

// ─── Section-enrichment pass: deepen per-section EAV detail in parallel batches ────
// A single outline call compresses detail when there are 15-30 sections (output-token
// budget), yielding one-entity sections and one-line summaries/notes. This pass re-runs
// sections through the model in batches of 5 (3 parallel workers), merging back the
// enriched fields — total outline size is no longer capped by one response.
async function enrichOutlineSections(outline: any, ctx: {
  keyword: string; language: string; country: string; provider: string; apiKey: string;
  model?: string; baseUrl?: string; tone?: string; persona?: string; ragFacts?: string;
  pageGoal?: "informational" | "commercial" | "mixed";
}): Promise<boolean> {
  const sections: any[] = Array.isArray(outline?.sections) ? outline.sections : [];
  if (!sections.length) return false;
  const globalEntities = (Array.isArray(outline?.entities) ? outline.entities : [])
    .map((e: any) => (typeof e === "string" ? e : e?.name)).filter(Boolean);
  const BATCH = 5;
  const batches: { start: number; items: any[] }[] = [];
  for (let i = 0; i < sections.length; i += BATCH) batches.push({ start: i, items: sections.slice(i, i + BATCH) });

  let enrichedAny = false;
  await runPool(batches, 2, async (batch) => { // low concurrency — parallel bursts trip provider TPM limits (429)
    try {
      const prompt = buildSectionEnrichPrompt({
        keyword: ctx.keyword, language: ctx.language, country: ctx.country,
        tone: ctx.tone, persona: ctx.persona, pageGoal: ctx.pageGoal,
        narration: outline?.meta?.narration === "first" ? "first" : outline?.meta?.narration === "third" ? "third" : undefined,
        h1: outline?.meta?.h1, globalEntities, ragFacts: ctx.ragFacts, sections: batch.items,
      });
      const raw = await fetchLLM(prompt, ctx.provider, ctx.apiKey, 8000, ctx.model, ctx.baseUrl);
      const parsed: any = extractJson(raw);
      const out: any[] = Array.isArray(parsed?.sections) ? parsed.sections : [];
      out.forEach((es: any, j: number) => {
        const target = sections[batch.start + j];
        if (!target || !es) return;
        // Heading sanity: merge only when it's clearly the same section (or model kept it).
        if (es.heading && target.heading && String(es.heading).trim() !== String(target.heading).trim()) return;
        // Merge ONLY the enrichable fields; structure and word budgets stay untouched.
        if (Array.isArray(es.entities_to_cover) && es.entities_to_cover.length) target.entities_to_cover = es.entities_to_cover;
        if (Array.isArray(es.keywords) && es.keywords.length) target.keywords = es.keywords;
        if (typeof es.summary === "string" && es.summary.trim().length > String(target.summary || "").length) target.summary = es.summary.trim();
        if (typeof es.copywriter_notes === "string" && es.copywriter_notes.trim().length > String(target.copywriter_notes || "").length) target.copywriter_notes = es.copywriter_notes.trim();
        if (Array.isArray(es.entity_connections) && es.entity_connections.length) target.entity_connections = es.entity_connections;
        if (Array.isArray(es.visual_elements) && es.visual_elements.length && !(target.visual_elements || []).length) target.visual_elements = es.visual_elements;
        enrichedAny = true;
      });
    } catch { /* per-batch enrichment is best-effort */ }
  });
  return enrichedAny;
}

// ─── Outline (structure) ─────────────────────────────────────────────────────────
export async function genOutline(b: any): Promise<GenResult> {
  const keyword = String(b.keyword ?? "").trim();
  if (!keyword) return { ok: false, error: "no_keyword" };
  const provider = String(b.aiProvider ?? "anthropic");
  const apiKey = String(b.aiApiKey ?? "");
  if (!apiKey) return { ok: false, error: "no_ai_key" };

  const competitors: CompetitorInput[] = Array.isArray(b.competitors) ? b.competitors : [];
  const model = b.model ? String(b.model) : undefined;
  const baseUrl = b.aiBaseUrl ? String(b.aiBaseUrl) : undefined;

  // MAP stage: extract compact facts per source (parallel) before assembling the outline.
  if (b.mapExtract !== false && competitors.length) {
    try { await mapExtractFacts(competitors, keyword, String(b.country ?? "us"), provider, apiKey, model, baseUrl); } catch { /* fall back to raw text grounding */ }
  }

  // Casino RAG: pull verified entity facts (slots/casinos/providers) from the knowledge base.
  const rag = b.useRag ? await findRagFacts(keyword) : null;

  const prompt = buildOutlinePrompt({
    keyword,
    language: String(b.language ?? "en"),
    country: String(b.country ?? "us"),
    competitors,
    policy: b.policy,
    paa: b.paa,
    related: b.related,
    tone: b.tone ? String(b.tone) : undefined,
    persona: b.persona ? String(b.persona) : undefined,
    additionalKeywords: b.additionalKeywords ? String(b.additionalKeywords) : undefined,
    lsiKeywords: b.lsiKeywords ? String(b.lsiKeywords) : undefined,
    targetWordCount: b.targetWordCount ? Number(b.targetWordCount) : undefined,
    manualTexts: Array.isArray(b.manualTexts) ? b.manualTexts : undefined,
    keywordsData: Array.isArray(b.keywordsData) ? b.keywordsData : undefined,
    pageGoal: b.pageGoal === "commercial" || b.pageGoal === "informational" ? b.pageGoal : "mixed",
    narration: b.narration === "first" || b.narration === "third" ? b.narration : undefined,
    customTemplate: b.customTemplate ? String(b.customTemplate) : undefined,
    structureRules: b.structureRules ? String(b.structureRules) : undefined,
    ragFacts: rag?.rendered,
    // Enrichment (default on) deepens every section afterwards — keep the skeleton lean so
    // one call fits the token budget and finishes well within the LLM timeout.
    lightSections: b.enrich !== false,
  });

  let raw = await fetchLLM(prompt, provider, apiKey, 16000, model, baseUrl);
  let outline = extractJson(raw);
  if (!outline) {
    raw = await fetchLLM(prompt + (raw ? "\n\nПредыдущий ответ не распарсился. Верни ТОЛЬКО валидный JSON, без текста и без markdown-обёрток." : ""), provider, apiKey, 16000, model, baseUrl);
    outline = extractJson(raw);
  }
  // Distinguish provider failure/timeout (raw null) from an actual JSON parse problem.
  if (!outline) return { ok: false, error: raw == null ? "generation_failed" : "parse_failed" };

  // Knowledge-based fact scrub: actively correct wrong/fabricated specifics baked into the outline
  // (e.g. "8-inch" → "7.9-inch", invented colors → generalized) BEFORE the text inherits them.
  if (b.factScrub !== false) {
    try {
      const scrubPrompt = buildFactScrubPrompt({ outline, keyword, country: String(b.country ?? "us") });
      const scrubRaw = await fetchLLM(scrubPrompt, provider, apiKey, 4000, model, baseUrl);
      const parsed: any = extractJson(scrubRaw);
      const corrections = Array.isArray(parsed?.corrections)
        ? parsed.corrections
            .filter((c: any) => c && typeof c.find === "string" && c.find.trim() && typeof c.replace === "string" && c.find !== c.replace)
            .slice(0, 40)
        : [];
      if (corrections.length) {
        outline = applyCorrections(outline, corrections);
        (outline as any)._scrub = { applied: corrections.length };
      }
    } catch { /* scrub is best-effort; never block outline on it */ }
  }

  // Deterministically stamp region/voice into meta so the text step inherits them reliably.
  const meta = ((outline as any).meta ||= {});
  meta.country = String(b.country ?? "us");
  meta.language = String(b.language ?? "en");
  if (b.narration === "first" || b.narration === "third") meta.narration = b.narration;
  if (b.structureRules && String(b.structureRules).trim()) meta.structureRules = String(b.structureRules).trim();
  // EXPAND pass (default on): if the outline is flat (most H2s have <2 child H3s — typical
  // with user templates), graft model-proposed H3 subsections deterministically. Runs BEFORE
  // the volume guard so budgets are redistributed across the new sections too. Off with expand:false.
  if (b.expand !== false) {
    try {
      const grown = await expandOutlineStructure(outline, {
        keyword, language: String(b.language ?? "en"), country: String(b.country ?? "us"),
        provider, apiKey, model, baseUrl,
        pageGoal: b.pageGoal === "commercial" || b.pageGoal === "informational" ? b.pageGoal : "mixed",
        paa: Array.isArray(b.paa) ? b.paa : undefined,
        targetWc: Number(b.targetWordCount) || Number(meta.target_word_count) || 0,
      });
      if (grown) (outline as any)._expanded = true;
    } catch { /* expansion is best-effort */ }
  }

  // LOCALIZE pass (default on): translate/style headings into the article language with the
  // chosen narration voice — template skeletons arrive in English and models keep them
  // verbatim otherwise. Runs before enrichment so opening lines match the final headings.
  if (b.localizeHeadings !== false) {
    try {
      const renamed = await localizeOutlineHeadings(outline, {
        keyword, language: String(b.language ?? "en"), country: String(b.country ?? "us"),
        provider, apiKey, model, baseUrl,
        pageGoal: b.pageGoal === "commercial" || b.pageGoal === "informational" ? b.pageGoal : "mixed",
      });
      if (renamed) (outline as any)._localized = true;
    } catch { /* localization is best-effort */ }
  }

  // Volume guard: stamp the requested target and rescale section budgets if the model
  // under-budgeted them. The USER's explicit target is authoritative; a MODEL-emitted
  // meta.target_word_count is distrusted when implausible (e.g. junk like 247) — in that
  // case we adopt the sum of the outline's own budgets instead of shrinking a healthy outline.
  const explicitWc = Number(b.targetWordCount) || 0;
  let targetWc = explicitWc;
  if (!targetWc) {
    const modelWc = Number(meta.target_word_count) || 0;
    targetWc = modelWc >= 500 ? modelWc : (ownBudgetSum(outline) || modelWc);
  }
  if (targetWc > 0) {
    meta.target_word_count = targetWc;
    // FAQ answers are written ON TOP of the sections — reserve their words (~50/question)
    // out of the section budgets, reference-tool style ("Available for Content").
    const faqReserve = Math.min(Math.round(targetWc * 0.25), (Array.isArray((outline as any).faq) ? (outline as any).faq.length : 0) * 50);
    if (normalizeWordBudgets(outline, Math.max(300, targetWc - faqReserve))) (outline as any)._wc_rescaled = true;
  }

  // ENRICH pass (default on): deepen every section's EAV detail in parallel batches —
  // role-annotated entities, 4-6 sentence summaries, rich copywriter notes with a
  // ready opening line, weighted triplets. Off with enrich:false.
  if (b.enrich !== false) {
    try {
      const ok = await enrichOutlineSections(outline, {
        keyword, language: String(b.language ?? "en"), country: String(b.country ?? "us"),
        provider, apiKey, model, baseUrl,
        tone: b.tone ? String(b.tone) : undefined,
        persona: b.persona ? String(b.persona) : undefined,
        ragFacts: rag?.rendered,
        pageGoal: b.pageGoal === "commercial" || b.pageGoal === "informational" ? b.pageGoal : "mixed",
      });
      if (ok) (outline as any)._enriched = true;
    } catch { /* enrichment is best-effort */ }
  }
  // Persist the real competitor facts that grounded the outline, so the TEXT step is built on the
  // SAME sources (fact-check then just confirms, instead of cleaning up). Kept compact for size.
  const carriedSources = competitors
    .filter((c) => c.text_sample && String(c.text_sample).trim())
    .sort((a, b) => (b.site_type === "official_store" ? 1 : 0) - (a.site_type === "official_store" ? 1 : 0))
    .slice(0, 6)
    .map((c) => ({
      title: (c.site_type === "official_store" ? "[ОФИЦИАЛЬНЫЙ] " : "") + (c.title || c.url),
      url: c.url,
      domain: (c.url.match(/^https?:\/\/([^/]+)/)?.[1] || "").replace(/^www\./, ""),
      snippet: String(c.text_sample).replace(/\s+/g, " ").trim().slice(0, c.site_type === "official_store" ? 3500 : 2500),
    }));
  if (carriedSources.length) (meta as any).sources = carriedSources;
  // Consolidated FACTS BANK from the map stage — the article is written from it AND the auto
  // fact-clean later verifies against it (so fact-check confirms instead of re-searching).
  const factsBank = competitors
    .filter((c) => c.extracted && String(c.extracted).trim())
    .sort((a, b) => (b.site_type === "official_store" ? 1 : 0) - (a.site_type === "official_store" ? 1 : 0))
    .slice(0, 8)
    .map((c) => ({
      source: c.url,
      domain: (c.url.match(/^https?:\/\/([^/]+)/)?.[1] || "").replace(/^www\./, ""),
      official: c.site_type === "official_store",
      facts: String(c.extracted).trim().slice(0, 1600),
    }));
  // SANITIZE: decode HTML entities the passes occasionally emit (&eacute; → é) and drop
  // stray H1-level sections — the H1 lives in meta, an H1 section duplicates it in every view.
  deepMapStringsInPlace(outline, decodeHtmlEntities);
  if (Array.isArray((outline as any).sections)) {
    const secsAll: any[] = (outline as any).sections;
    for (let i = secsAll.length - 1; i >= 0; i--) {
      if (String(secsAll[i]?.h_level || "").toUpperCase() === "H1") {
        if (!meta.h1 && secsAll[i].heading) meta.h1 = secsAll[i].heading;
        secsAll.splice(i, 1);
      }
    }
  }

  // RAG facts join the facts bank FIRST (highest trust) so both the text step and the
  // auto fact-clean verify against the knowledge base, not only scraped competitors.
  if (rag?.bankEntry) factsBank.unshift(rag.bankEntry as any);
  if (factsBank.length) (meta as any).facts_bank = factsBank;
  if (b.useRag) (meta as any).use_rag = true;
  return { ok: true, data: outline };
}

// ─── TOC heading label per language (deterministic — never trust the model for this fixed
// string: the one-shot prompt used to show a literal Russian example `<strong>Содержание</strong>`
// and models copied it verbatim regardless of article language; even the old chunked-path list
// only covered ru/uk/fr). Extend this map rather than relying on the LLM to translate one word.
const TOC_LABELS: Record<string, string> = {
  ru: "Содержание", uk: "Зміст", fr: "Sommaire", es: "Índice", de: "Inhalt", it: "Indice",
  pt: "Índice", pl: "Spis treści", tr: "İçindekiler", nl: "Inhoud", ro: "Cuprins", cs: "Obsah",
  sk: "Obsah", hu: "Tartalom", bg: "Съдържание", el: "Περιεχόμενα", ar: "المحتويات",
  ja: "目次", ko: "목차", zh: "目录", sv: "Innehåll", da: "Indhold", no: "Innhold", fi: "Sisällys",
};
function tocLabelFor(language: string): string {
  const lang = String(language || "").toLowerCase();
  for (const code of Object.keys(TOC_LABELS)) if (lang.startsWith(code)) return TOC_LABELS[code];
  return "Contents";
}

// Guarantee the TOC heading is in the article's own language, whatever the writer produced and
// whatever any later pass (expand/trim/fact-clean) did to it. Runs as a final deterministic
// override, same idea as ensureMetaBlock below.
export function ensureTocLabel(text: string, language: string): string {
  if (!text || !/<div class="toc">/i.test(text)) return text;
  const label = tocLabelFor(language);
  return text.replace(/(<div class="toc">\s*<strong>)([^<]*)(<\/strong>)/i, (_m, pre, _old, post) => `${pre}${label}${post}`);
}

// ─── Chunked article writer: H2-units → chunks of ~4 sections → parallel small calls ──
// Returns the assembled article body (H1 + sections + FAQ) or null → caller falls back to
// the single-shot path. Each chunk sees the full article map so nothing gets duplicated.
async function writeTextInChunks(outline: any, ctx: {
  keyword: string; language: string; tone: string; provider: string; apiKey: string;
  model?: string; baseUrl?: string; ragFacts?: string;
  sources?: { title: string; snippet: string; url: string; domain: string }[];
  sourceMode?: "off" | "facts" | "cited"; includeToc?: boolean;
}): Promise<string | null> {
  const secs: any[] = Array.isArray(outline?.sections) ? outline.sections : [];
  if (!secs.length) return null;
  const meta = outline.meta || {};

  // Per-section spec with a SINGLE word_count = the section's OWN contribution (a parent's
  // total includes its children — passing both made models write the intro at full total
  // AND the children at theirs, overshooting the article by ~35-40%).
  const own = ownRanges(secs);
  const specs: any[] = secs.map((s: any, i: number) => ({
    h_level: s.h_level, heading: s.heading,
    word_count: own[i] || [60, 100],
    entities_to_cover: s.entities_to_cover, keywords: s.keywords, summary: s.summary,
    copywriter_notes: s.copywriter_notes, entity_connections: s.entity_connections,
    visual_elements: s.visual_elements, needs_real_experience: s.needs_real_experience,
  }));

  // EDITORIAL FOLDING (reference-tool behavior): the outline is a research artifact — the
  // article doesn't have to render every H3 as a heading. When the outline has more sections
  // than the word target supports (~100 words/heading), the THINNEST H3s are folded into
  // their parent as subtopics covered in prose, so headings stay meaty and volume converges.
  const foldTarget = Number(meta.target_word_count) || 0;
  const maxRender = foldTarget >= 500 ? Math.max(10, Math.min(34, Math.round(foldTarget / 100))) : specs.length;
  if (specs.length > maxRender) {
    const h3idx = specs.map((s, i) => ({ s, i })).filter(x => x.s.h_level !== "H2");
    h3idx.sort((a, b) => (a.s.word_count?.[1] || 0) - (b.s.word_count?.[1] || 0));
    const toFold = new Set(h3idx.slice(0, specs.length - maxRender).map(x => x.i));
    for (let i = specs.length - 1; i >= 0; i--) {
      if (!toFold.has(i)) continue;
      let p = i - 1;
      while (p >= 0 && toFold.has(p)) p--;
      if (p < 0) continue;
      const s = specs[i], parent = specs[p];
      (parent.subtopics ||= []).unshift({ topic: s.heading, summary: s.summary, keywords: s.keywords });
      parent.word_count = [
        (parent.word_count?.[0] || 0) + (s.word_count?.[0] || 0),
        (parent.word_count?.[1] || 0) + (s.word_count?.[1] || 0),
      ];
      if (Array.isArray(s.visual_elements) && s.visual_elements.length && !(parent.visual_elements || []).length) parent.visual_elements = s.visual_elements;
      specs.splice(i, 1);
    }
  }

  // TABLE budget: exactly 1-2 tables per article, never one per section. Keep at most the
  // first 2 table-marked specs (older outlines over-mark), and if none is marked — assign
  // ONE to the most table-natural section by heading. FAQ is Q&A format, not tabular — never
  // let it carry a table, whether the mark came from the enrich pass (which just picks the
  // "most tabular" headings and doesn't know to skip FAQ) or from the keyword fallback below
  // (whose regex includes words like "bonus"/"limit"/"retrait" that commonly appear IN an FAQ
  // heading too, e.g. "FAQ — Bonus & Retraits").
  const isFaqHeading = (h: any) => /\bfaq\b|frequently asked/i.test(String(h || "").trim());
  for (const s of specs) if (isFaqHeading(s.heading)) s.visual_elements = [];
  const hasTableVe = (s: any) => (Array.isArray(s.visual_elements) ? s.visual_elements : [])
    .some((v: any) => typeof v === "object" ? /table/i.test(String(v?.type || "")) : /table|таблиц/i.test(String(v)));
  let tablesKept = 0;
  for (const s of specs) {
    if (!hasTableVe(s)) continue;
    tablesKept++;
    if (tablesKept > 2) s.visual_elements = []; // strip extras — no table spam
  }
  if (tablesKept === 0) {
    const tabular = /bonus|бонус|payment|paiement|paie|dépôt|deposit|депозит|retrait|withdraw|вывод|метод|cotes|коэффициент|odds|rtp|provider|провайдер|logiciel|jeux|games|слот|slot|сравн|compar|таблиц|limit|лимит/i;
    const pick = specs.find(s => !isFaqHeading(s.heading) && tabular.test(String(s.heading || "")));
    if (pick) pick.visual_elements = [{ type: "table", title: "", description: "сводная таблица по данным секции (только реальные значения из спеки/базы знаний/источников)" }];
  }


  // Units = H2 with its H3 children (never split a unit across chunks).
  const units: any[][] = [];
  for (const s of specs) {
    if (s.h_level === "H2" || !units.length) units.push([s]);
    else units[units.length - 1].push(s);
  }
  // Greedy chunks of ~2-3 units / ≤5 sections.
  const chunks: any[][] = [];
  for (const u of units) {
    const last = chunks[chunks.length - 1];
    if (last && last.length + u.length <= 5) last.push(...u);
    else chunks.push([...u]);
  }

  const allHeadings = specs.map((s: any) => ({ h_level: s.h_level, heading: s.heading }));
  const faq = Array.isArray(outline.faq) ? outline.faq : [];
  const verdictRe = /verdict|вердикт|итог|conclusion|заключение|avis final|final|raisons|choisir|pourquoi|почему|avantages|преимуществ/i;

  const parts: (string | null)[] = new Array(chunks.length).fill(null);
  await runPool(chunks.map((c, i) => ({ c, i })), 2, async ({ c, i }) => {
    const lo = c.reduce((a: number, s: any) => a + (s.word_count?.[0] || 0), 0);
    const hi = c.reduce((a: number, s: any) => a + (s.word_count?.[1] || 0), 0);
    const prompt = buildSectionTextPrompt({
      keyword: ctx.keyword, language: ctx.language, country: meta.country,
      tone: ctx.tone, narration: meta.narration === "first" ? "first" : meta.narration === "third" ? "third" : undefined,
      h1: meta.h1, allHeadings, sections: c,
      faq: i === chunks.length - 1 ? faq : undefined,
      ragFacts: ctx.ragFacts, sources: ctx.sources, sourceMode: ctx.sourceMode,
      isVerdictChunk: c.some((s: any) => verdictRe.test(String(s.heading || ""))),
      chunkBudget: hi > 0 ? [lo, hi] : undefined,
    });
    const raw = await fetchLLM(prompt, ctx.provider, ctx.apiKey, 6000, ctx.model, ctx.baseUrl);
    if (!raw) return;
    let md = raw.trim().replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    // Models sometimes prefix a stray H1 / meta block despite instructions — strip anything
    // before the first H2/H3 (the assembler owns H1, TOC and meta).
    const firstH = md.search(/^#{2,3}\s/m);
    if (firstH > 0) md = md.slice(firstH);
    // Per-chunk volume guard: a small chunk trims reliably (unlike a whole article). If the
    // chunk overshot its summed budget by >25%, one scoped trim pass brings it back.
    // The last chunk also carries the FAQ (~55 words/question) — include that in its allowance
    // so the scoped trim doesn't squeeze the sections to make room for FAQ.
    const hiEff = hi + (i === chunks.length - 1 ? faq.length * 55 : 0);
    const cw = md.split(/\s+/).filter(Boolean).length;
    if (hiEff > 0 && cw > hiEff * 1.15) {
      try {
        const cut = await fetchLLM(
          buildTextTrimPrompt({ article: md, targetWords: Math.round((lo + hiEff) / 2), currentWords: cw, language: ctx.language }),
          ctx.provider, ctx.apiKey, 6000, ctx.model, ctx.baseUrl,
        );
        if (cut) {
          const cmd = cut.trim().replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
          const nw = cmd.split(/\s+/).filter(Boolean).length;
          const heads = (s: string) => (s.match(/^#{2,3}\s/gm) || []).length;
          if (nw < cw * 0.95 && heads(cmd) === heads(md)) md = cmd;
        }
      } catch { /* keep the long version */ }
    }
    // Sanity: the chunk must contain at least its first section heading.
    const first = String(c[0]?.heading || "").trim();
    if (first && md.toLowerCase().includes(first.slice(0, Math.min(30, first.length)).toLowerCase())) parts[i] = md;
  });
  if (parts.some(p => p == null)) return null; // a chunk failed even after retries → single-shot fallback

  // FAQ guard: if the last chunk dropped the FAQ (or some questions), render it with a
  // dedicated small call — a scoped prompt reliably produces all questions.
  // Canonical FAQ shape (enforced deterministically below): «## FAQ» → immediately the first
  // «### Question» → answer paragraph → next question… No intro prose inside the section.
  const canonFaq = (md: string) => md
    .replace(/^(##\s*FAQ[^\n]*)\n+[\s\S]*?(?=^###\s)/m, "$1\n\n"); // strip prose between H2 and 1st question
  if (faq.length) {
    const lastMd = parts[parts.length - 1] || "";
    const faqQ = (lastMd.match(/^##\s*FAQ[\s\S]*$/m)?.[0].match(/^###\s/gm) || []).length;
    if (faqQ < faq.length) {
      // Strip a partial FAQ from the last chunk, then regenerate the full section.
      parts[parts.length - 1] = lastMd.replace(/^##\s*FAQ[\s\S]*$/m, "").trim();
      try {
        const faqPrompt = `Ты пишешь FAQ-секцию статьи по теме "${ctx.keyword}" на языке ${ctx.language}. Верни ТОЛЬКО markdown секции строго такой формы: строка «## FAQ», затем СРАЗУ первый вопрос — НИКАКОГО вводного абзаца между ними. Каждый вопрос — «### Вопрос», под ним ответ 40-60 слов по answer_guideline (конкретика, без воды). Все ${faq.length} вопросов, СТРОГО В ЗАДАННОМ ПОРЯДКЕ. Без преамбулы и \`\`\`-обёрток.\nВОПРОСЫ: ${JSON.stringify(faq)}`;
        const faqRaw = await fetchLLM(faqPrompt, ctx.provider, ctx.apiKey, 2500, ctx.model, ctx.baseUrl);
        if (faqRaw) {
          const faqMd = faqRaw.trim().replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
          if (/^##\s*FAQ/m.test(faqMd)) parts.push(canonFaq(faqMd));
        }
      } catch { /* best-effort — article ships without FAQ in the worst case */ }
    } else {
      parts[parts.length - 1] = canonFaq(lastMd); // chunk-written FAQ gets the same canonical shape
    }
  }

  // Deterministic assembly: H1 → (optional TOC) → sections → FAQ came with the last chunk.
  const pick = (v: any) => Array.isArray(v) ? (v.find((x: any) => x && String(x).trim()) || "") : (v || "");
  const h1 = pick(meta.h1) || pick(meta.title_options) || ctx.keyword;
  const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
  const tocLabel = tocLabelFor(ctx.language);
  const hasFaqH2 = secs.some((s: any) => s.h_level === "H2" && /^faq/i.test(String(s.heading || "").trim()));
  const toc = ctx.includeToc
    ? `<div class="toc"><strong>${tocLabel}</strong><ul>${secs.filter((s: any) => s.h_level === "H2").map((s: any) => `<li><a href="#${slug(String(s.heading))}">${s.heading}</a></li>`).join("")}${faq.length && !hasFaqH2 ? `<li><a href="#faq">FAQ</a></li>` : ""}</ul></div>\n\n`
    : "";
  return `# ${h1}\n\n${toc}${parts.join("\n\n")}`;
}

// ─── Volume guard (final word on article length) ──────────────────────────────────
// Models undershoot AND overshoot the target, and the auto-fact-clean pass can also nudge
// length while correcting numbers — so this MUST run after every other content-shaping pass,
// never before. Below ~85% of target → one expansion pass. Above ~115% (the plan's own ±15%
// tolerance, tightened from the previous 1.25x which was looser than what users are told to
// expect) → iterative trim passes, looping until within range or the model stops cooperating.
async function enforceVolumeTarget(text: string, targetWc: number, ctx: {
  language: string; provider: string; apiKey: string; model?: string; baseUrl?: string;
}): Promise<string> {
  if (!targetWc || targetWc < 500 || !text) return text;
  const h2 = (s: string) => (s.match(/^##\s/gm) || []).length;
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < targetWc * 0.85) {
    try {
      let expanded = await fetchLLM(
        buildTextExpandPrompt({ article: text, targetWords: targetWc, currentWords: words, language: ctx.language }),
        ctx.provider, ctx.apiKey, 14000, ctx.model, ctx.baseUrl,
      );
      if (expanded) {
        expanded = expanded.trim().replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
        const newWords = expanded.split(/\s+/).filter(Boolean).length;
        // Accept only a real improvement that didn't mangle the structure (same H2 count ±1).
        if (newWords > words * 1.1 && Math.abs(h2(expanded) - h2(text)) <= 1) {
          text = stripForeignScripts(expanded, ctx.language);
        }
      }
    } catch { /* expansion is best-effort */ }
  } else if (words > targetWc * 1.15) {
    // Verbose models under-cut on the first pass — iterate (max 3, up from 2) until within
    // range. Per-pass acceptance loosened from ≥10% to ≥5% reduction so the guard doesn't give
    // up after one modest cut and ship an article that's still well over budget.
    for (let pass = 0; pass < 3; pass++) {
      const cur = text.split(/\s+/).filter(Boolean).length;
      if (cur <= targetWc * 1.15) break;
      try {
        let trimmed = await fetchLLM(
          buildTextTrimPrompt({ article: text, targetWords: targetWc, currentWords: cur, language: ctx.language }),
          ctx.provider, ctx.apiKey, 14000, ctx.model, ctx.baseUrl,
        );
        if (!trimmed) break;
        trimmed = trimmed.trim().replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
        const newWords = trimmed.split(/\s+/).filter(Boolean).length;
        // Accept any real reduction that kept the FULL structure — H2 AND H3 counts equal
        // (H2-only check let the model "trim" by deleting FAQ ### questions) — and didn't
        // over-cut (still ≥70% of target).
        const allHeads = (s: string) => (s.match(/^#{2,3}\s/gm) || []).length;
        if (newWords < cur * 0.95 && newWords >= targetWc * 0.7 && allHeads(trimmed) === allHeads(text)) {
          text = stripForeignScripts(trimmed, ctx.language);
        } else break; // model refused to cut further / structure changed — stop iterating
      } catch { break; }
    }
  }
  return text;
}

// ─── Article text ─────────────────────────────────────────────────────────────────
export async function genText(b: any): Promise<GenResult> {
  if (!b.outline) return { ok: false, error: "no_outline" };
  const provider = String(b.aiProvider ?? "anthropic");
  const apiKey = String(b.aiApiKey ?? "");
  if (!apiKey) return { ok: false, error: "no_ai_key" };

  const keyword = String(b.keyword ?? b.outline?.meta?.keyword ?? "");
  const sourceMode = (b.sourceMode === "facts" || b.sourceMode === "cited") ? b.sourceMode : "off";

  let sources: { title: string; snippet: string; url: string; domain: string }[] = [];
  let effMode: "off" | "facts" | "cited" = sourceMode;
  if (sourceMode !== "off" && b.serpKey && keyword) {
    try {
      const serp = await runSerp(String(b.serpProvider || "serper"), String(b.serpKey), keyword, { gl: b.gl, hl: b.hl, num: 10, engine: "google" });
      const top = (serp.results || []).slice(0, Math.max(1, Math.min(10, Number(b.scrapeCount ?? 6))));
      let scraped: any[] = [];
      try { scraped = await scrapeMany(top.map(r => r.url), b.firecrawlKey ? String(b.firecrawlKey) : undefined, 4); } catch {}
      sources = top.map(r => {
        const sc = scraped.find(s => s.url === r.url);
        const ev = sc?.ok ? `${sc.metaDescription || ""} ${sc.textSample || ""}`.trim().slice(0, 4000) : "";
        return { title: r.title, url: r.url, domain: r.domain, snippet: ev || r.snippet };
      });
    } catch {}
  }
  // Fallback: if no live sources were gathered, ground the text on the facts the outline was built
  // on. Prefer the consolidated facts bank (clean per-source facts); else the raw carried sources.
  if (!sources.length) {
    const bank = Array.isArray(b.outline?.meta?.facts_bank) ? b.outline.meta.facts_bank : [];
    if (bank.length) {
      sources = bank.map((x: any) => ({ title: (x.official ? "[ОФИЦИАЛЬНЫЙ] " : "") + (x.domain || x.source), url: x.source, domain: x.domain || "", snippet: x.facts }));
      effMode = "facts";
    } else {
      const carried = Array.isArray(b.outline?.meta?.sources) ? b.outline.meta.sources : [];
      if (carried.length) { sources = carried; effMode = "facts"; }
    }
  }

  // Slim the outline the writer actually needs: keep meta + sections + faq + price table; drop the
  // heavy analysis blocks (entity_analysis/sub_intents/entities/…) and the carried sources from meta
  // (they're already fed via the sources block) so we don't bloat/duplicate the prompt → no timeouts.
  const full = (b.outline || {}) as any;
  const { sources: _carried, facts_bank: _bank, ...metaSlim } = (full.meta || {});
  void _carried; void _bank;
  
  // Deep-copy to avoid mutating cached memory
  const slimOutline = {
    meta: metaSlim ? JSON.parse(JSON.stringify(metaSlim)) : {},
    sections: full.sections ? JSON.parse(JSON.stringify(full.sections)) : [],
    faq: full.faq ? JSON.parse(JSON.stringify(full.faq)) : [],
    price_table_template: full.price_table_template,
  };

  const secsList: any[] = slimOutline.sections;
  const depth = (s: any) => (s?.h_level === "H4" ? 4 : s?.h_level === "H3" ? 3 : 2);
  const hasKids = (i: number) => i + 1 < secsList.length && depth(secsList[i + 1]) > depth(secsList[i]);

  // 1. Convert FAQ list to H3 sections under the H2 FAQ section
  const faqList = Array.isArray(slimOutline.faq) ? slimOutline.faq : [];
  if (faqList.length > 0) {
    let faqH2Idx = secsList.findIndex((s: any) => s.h_level === "H2" && (/\bfaq\b|frequently asked|questions\s+fréquentes|часто\s+задаваемые/i.test(s.heading)));
    if (faqH2Idx === -1) {
      const faqTitle = "FAQ";
      secsList.push({
        h_level: "H2",
        heading: faqTitle,
        word_count_self: [30, 50],
        word_count_total: [30, 50],
        summary: "Section de foire aux questions.",
        copywriter_notes: "Introduire brièvement la section FAQ."
      });
      faqH2Idx = secsList.length - 1;
    }
    
    const faqSubsections = faqList.map((f: any) => ({
      h_level: "H3",
      heading: f.question,
      word_count_self: [40, 60],
      word_count_total: [40, 60],
      summary: f.answer_guideline || "Répondre à la question.",
      copywriter_notes: `Répondre à la question de manière concise en 40-60 mots.`
    }));
    
    secsList.splice(faqH2Idx + 1, 0, ...faqSubsections);
    slimOutline.faq = [];
  }

  // 2. Trim parent H2 summaries to prevent duplicate text generation and word count overshoot
  for (let i = 0; i < secsList.length; i++) {
    const s = secsList[i];
    if (s.h_level === "H2" && hasKids(i)) {
      s.summary = "Короткое вводное предложение (1-2 предложения) для перехода к подразделам.";
      s.copywriter_notes = "Напиши ровно один короткий вводный абзац (1-2 предложения), чтобы плавно ввести читателя в тему и подготовить переход к подразделам. Не раскрывай конкретные детали подразделов здесь, пиши максимально лаконично.";
    }
  }

  // Volume guard for outlines saved before this fix (or edited by hand): if the sum of
  // section budgets is far below the target word count, rescale so the writer isn't
  // silently capped at a fraction of the plan. Implausibly small targets (junk emitted
  // by the model into meta) are ignored rather than shrinking a healthy outline.
  const textTargetWc = Number(b.targetWordCount) || Number(metaSlim?.target_word_count) || 0;
  const textFaqReserve = Math.min(Math.round(textTargetWc * 0.25), (Array.isArray(slimOutline.faq) ? slimOutline.faq.length : 0) * 50);
  if (textTargetWc >= 500) normalizeWordBudgets(slimOutline, Math.max(300, textTargetWc - textFaqReserve));
  else if (textTargetWc > 0) (slimOutline.meta as any).target_word_count = ownBudgetSum(slimOutline) || textTargetWc;

  // Casino RAG: re-retrieve knowledge-base facts for the text step (fresh + full-length),
  // honoring either the explicit flag or the outline generated with RAG enabled.
  let ragFacts: string | undefined;
  if (b.useRag === true || (b.useRag !== false && full.meta?.use_rag)) {
    const rag = await findRagFacts(keyword || String(full.meta?.keyword ?? ""));
    if (rag) ragFacts = rag.rendered;
  }

  const model = b.model ? String(b.model) : undefined;
  const baseUrl = b.aiBaseUrl ? String(b.aiBaseUrl) : undefined;

  // CHUNKED writer (default on for 10+ sections, off with chunkedText:false): the article is
  // written 3-5 sections per call — one giant prompt degrades mid-generation (prose decays
  // into lists, tables get invented values). Falls back to single-shot if any chunk fails.
  let text: string | null = null;
  const secCount = Array.isArray(slimOutline.sections) ? slimOutline.sections.length : 0;
  if (b.chunkedText !== false && b.promptType !== "custom" && secCount >= 10) {
    try {
      text = await writeTextInChunks(slimOutline, {
        keyword: keyword || String(slimOutline.meta?.keyword ?? ""),
        language: String(b.language ?? "ru"), tone: String(b.tone ?? "neutral, expert"),
        provider, apiKey, model, baseUrl,
        ragFacts, sources, sourceMode: effMode, includeToc: b.includeToc === true,
      });
    } catch { text = null; }
  }

  if (!text) {
    const prompt = buildTextPrompt({
      outlineJson: slimOutline,
      policy: b.policy,
      tone: String(b.tone ?? "neutral, expert"),
      language: String(b.language ?? "ru"),
      custom: b.custom ? String(b.custom) : undefined,
      promptType: b.promptType === "custom" ? "custom" : "service",
      sources,
      sourceMode: effMode,
      includeToc: b.includeToc === true,
      ragFacts,
    });
    // Detailed variant here (not the plain fetchLLM used elsewhere): this is the last-resort
    // single-shot attempt — if it also fails, its error detail (e.g. a provider content-policy
    // rejection like z.ai's "potentially unsafe or sensitive content") is what we surface below,
    // instead of a bare "generation_failed" that sends users digging through server logs.
    const r = await fetchLLMDetailed(prompt, provider, apiKey, 12000, model, baseUrl);
    text = r.text;
    if (!text) return { ok: false, error: r.error ? `generation_failed: ${r.error}` : "generation_failed" };
  }
  if (!text) return { ok: false, error: "generation_failed" };

  const banned = [
    ...String(b.policy?.restrictions?.wordsToAvoid ?? "").split(","),
    ...String(b.policy?.restrictions?.topicsToAvoid ?? "").split(","),
  ];
  text = enforceLinkPolicy(text, banned, effMode);

  let redacted = 0;
  if (b.hardRedact) { const r = redactBannedWords(text, banned); text = r.text; redacted = r.count; }

  text = stripForeignScripts(text, String(b.language ?? "en"));

  // AUTO fact-clean: verify the finished article against the facts bank and fix contradictions /
  // fabrications / number mismatches in one pass — so the article ships clean (fact-check then just
  // confirms). Runs BEFORE the volume guard (moved from after it): fact-clean can add clarifying
  // words while correcting numbers, and previously ran last with only a floor check on character
  // length (>85%) — nothing stopped it from silently re-inflating an article the guard had just
  // trimmed back to budget. The guard now always gets the last word on length. Best-effort: if it
  // fails, keep the original text. Toggle off with autoFactCheck:false.
  let autoCleaned = false;
  const bank = Array.isArray(b.outline?.meta?.facts_bank) ? b.outline.meta.facts_bank : [];
  if (b.autoFactCheck !== false && bank.length && text) {
    try {
      const bankText = bank.map((x: any, i: number) => `[${i + 1}]${x.official ? " (ОФИЦИАЛЬНЫЙ)" : ""} ${x.domain || x.source}\n${x.facts}`).join("\n\n");
      let cleaned = await fetchLLM(buildAutoFactCleanPrompt({ article: text, factsBank: bankText, language: String(b.language ?? "en") }), provider, apiKey, 12000, model, baseUrl);
      if (cleaned && cleaned.trim().length > text.length * 0.85) {
        cleaned = cleaned.trim().replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
        text = stripForeignScripts(cleaned, String(b.language ?? "en"));
        autoCleaned = true;
      }
    } catch { /* keep original text */ }
  }

  // VOLUME guard (default on, symmetric) — see enforceVolumeTarget() above. Runs LAST, after
  // fact-clean, so it's the final word on article length. Off with expandText:false.
  const finalTargetWc = Number(b.targetWordCount) || Number(slimOutline.meta?.target_word_count) || 0;
  if (b.expandText !== false && finalTargetWc >= 500) {
    text = await enforceVolumeTarget(text, finalTargetWc, { language: String(b.language ?? "en"), provider, apiKey, model, baseUrl });
  }

  // Guarantee the SEO meta block is present (deterministic — don't trust the model to emit it).
  text = ensureMetaBlock(text, b.outline?.meta);
  // Guarantee the TOC label matches the article's language (deterministic — the writer, or any
  // later expand/trim/fact-clean pass, could otherwise leave/reintroduce a wrong-language word).
  text = ensureTocLabel(text, String(b.language ?? "en"));

  return { ok: true, data: { text, usedSources: sources.length, redacted, autoCleaned } };
}

// Safety net: models occasionally leak characters from another writing system into the article
// (e.g. a stray Chinese token in an English text). Strip CJK/kana/hangul runs when the target
// language doesn't use them, then tidy the spacing/punctuation left behind.
// Guarantee the SEO meta block (Title/Description/Slug) sits at the very top of the article.
// The model is asked to emit it, but doesn't always comply — so we add it deterministically from
// the outline meta if it's missing (the data is known, no need to trust the LLM for this).
export function ensureMetaBlock(text: string, meta: any): string {
  if (!text) return text;
  const firstHeading = text.search(/^#{1,6}\s/m);
  const head = firstHeading > 0 ? text.slice(0, firstHeading) : (firstHeading === 0 ? "" : text);
  if (/(^|\n)\s*(```)?\s*title\s*:/i.test(head)) return text; // already has a meta block
  const pick = (v: any) => Array.isArray(v) ? (v.find((x: any) => x && String(x).trim()) || "") : (v || "");
  const title = pick(meta?.title_options) || pick(meta?.title);
  const desc = pick(meta?.description_options) || pick(meta?.description);
  const slug = pick(meta?.slug_options) || pick(meta?.slug);
  if (!title && !desc && !slug) return text;
  const block = "```\nTitle: " + title + "\nMeta Description: " + desc + "\nURL Slug: " + slug + "\n```";
  return block + "\n\n" + text.replace(/^\s+/, "");
}

export function stripForeignScripts(text: string, language: string): string {
  if (/^(zh|ja|ko)/i.test(language || "")) return text; // target language legitimately uses these
  if (!/[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/.test(text)) return text;
  return text
    .replace(/[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.:;!?])/g, "$1")
    .replace(/([:：])\s+([.,;!?])/g, "$2");
}

// ─── Wireframe (Landing-flow block skeleton) ─────────────────────────────────────
export async function genWireframe(b: any): Promise<GenResult> {
  if (!b.outline) return { ok: false, error: "no_outline" };
  const provider = String(b.aiProvider ?? "anthropic");
  const apiKey = String(b.aiApiKey ?? "");
  if (!apiKey) return { ok: false, error: "no_ai_key" };
  const model = b.model ? String(b.model) : undefined;
  const baseUrl = b.aiBaseUrl ? String(b.aiBaseUrl) : undefined;

  const prompt = buildWireframePrompt({
    keyword: String(b.keyword ?? b.outline?.meta?.keyword ?? ""),
    language: String(b.language ?? b.outline?.meta?.language ?? "en"),
    country: String(b.country ?? b.outline?.meta?.country ?? "us"),
    outline: b.outline,
    structureMode: b.structureMode,
    myStructure: Array.isArray(b.myStructure) ? b.myStructure : undefined,
    targetWordCount: b.targetWordCount ? Number(b.targetWordCount) : undefined,
  });

  let raw = await fetchLLM(prompt, provider, apiKey, 8000, model, baseUrl);
  let wireframe = extractJson(raw);
  if (!wireframe || !Array.isArray((wireframe as any).blocks)) {
    raw = await fetchLLM(prompt + "\n\nПредыдущий ответ не распарсился. Верни ТОЛЬКО валидный JSON, без текста и без markdown-обёрток.", provider, apiKey, 8000, model, baseUrl);
    wireframe = extractJson(raw);
  }
  if (!wireframe || !Array.isArray((wireframe as any).blocks)) return { ok: false, error: "parse_failed" };
  return { ok: true, data: wireframe };
}

// ─── Landing-flow orchestrator: ТЗ (+ wireframe) (+ текст), per "что генерировать" ───
// b.generate: "tz" | "tz_text" | "tz_wireframe" | "all" (default "tz_wireframe", matches the
// reference tool's Landing-flow which always ships a wireframe alongside the ТЗ).
export async function genLanding(b: any): Promise<GenResult> {
  const want = String(b.generate || "tz_wireframe");
  const wantsWireframe = want === "tz_wireframe" || want === "all";
  const wantsText = want === "tz_text" || want === "all";

  const outlineRes = await genOutline(b);
  if (!outlineRes.ok) return outlineRes;
  const outline = outlineRes.data;

  const result: any = { outline };

  if (wantsWireframe) {
    const wfRes = await genWireframe({ ...b, outline });
    if (wfRes.ok) result.wireframe = wfRes.data;
    else result.wireframeError = wfRes.error;
  }

  if (wantsText) {
    const textRes = await genText({ ...b, outline });
    if (textRes.ok) result.text = (textRes.data as any)?.text ?? textRes.data;
    else result.textError = textRes.error;
  }

  return { ok: true, data: result };
}

// ─── Content analysis ──────────────────────────────────────────────────────────────
export async function genAnalysis(b: any): Promise<GenResult> {
  const keyword = String(b.keyword ?? "").trim();
  if (!keyword) return { ok: false, error: "no_keyword" };
  if (!b.targetPage) return { ok: false, error: "no_target_page" };
  const provider = String(b.aiProvider ?? "anthropic");
  const apiKey = String(b.aiApiKey ?? "");
  if (!apiKey) return { ok: false, error: "no_ai_key" };

  const competitors: CompetitorInput[] = Array.isArray(b.competitors) ? b.competitors : [];
  const prompt = buildAnalysisPrompt({
    keyword, targetPage: b.targetPage, competitors,
    language: b.language ? String(b.language) : undefined,
    country: b.country ? String(b.country) : undefined,
    policy: b.policy || undefined,
  });
  const model = b.model ? String(b.model) : undefined;
  const baseUrl = b.aiBaseUrl ? String(b.aiBaseUrl) : undefined;

  let raw = await fetchLLM(prompt, provider, apiKey, 16000, model, baseUrl);
  let report = extractJson(raw);
  if (!report) {
    raw = await fetchLLM(prompt + "\n\nПредыдущий ответ не распарсился. Верни ТОЛЬКО валидный JSON.", provider, apiKey, 16000, model, baseUrl);
    report = extractJson(raw);
  }
  if (!report) return { ok: false, error: "parse_failed" };
  return { ok: true, data: report };
}

export function genByType(type: string, payload: any): Promise<GenResult> {
  if (type === "outline") return genOutline(payload);
  if (type === "text") return genText(payload);
  if (type === "analysis") return genAnalysis(payload);
  if (type === "landing") return genLanding(payload);
  return Promise.resolve({ ok: false, error: "unknown_job_type" });
}
