// Core SEO generation logic, factored out of the API routes so it can be reused by both
// the synchronous routes and the background-job runner. No HTTP / auth here — pure work.

import { fetchLLM } from "@/lib/llm";
import { runSerp } from "@/lib/seo/serp";
import { scrapeMany } from "@/lib/seo/scrape";
import {
  buildOutlinePrompt, buildTextPrompt, buildAnalysisPrompt, buildFactScrubPrompt, buildSourceExtractPrompt,
  buildAutoFactCleanPrompt, buildWireframePrompt, buildSectionEnrichPrompt, buildStructureExpandPrompt,
  buildHeadingLocalizePrompt, enforceLinkPolicy, redactBannedWords, extractJson, CompetitorInput,
} from "@/lib/seo/prompts";
import { findRagFacts } from "@/lib/seo/rag";

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
  await runPool(targets, 4, async (c) => {
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
  if (k > 0.85 && k < 1.15) return false; // close enough — keep the model's distribution
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
}): Promise<boolean> {
  const sections: any[] = Array.isArray(outline?.sections) ? outline.sections : [];
  if (!sections.length || sections.length >= 26) return false;
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
    sections.splice(at, 0, ...newbies);
    added += newbies.length;
    if (sections.length >= 34) break;
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
  await runPool(batches, 3, async (batch) => {
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
  });

  let raw = await fetchLLM(prompt, provider, apiKey, 16000, model, baseUrl);
  let outline = extractJson(raw);
  if (!outline) {
    raw = await fetchLLM(prompt + "\n\nПредыдущий ответ не распарсился. Верни ТОЛЬКО валидный JSON, без текста и без markdown-обёрток.", provider, apiKey, 16000, model, baseUrl);
    outline = extractJson(raw);
  }
  if (!outline) return { ok: false, error: "parse_failed" };

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
    if (normalizeWordBudgets(outline, targetWc)) (outline as any)._wc_rescaled = true;
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
  // RAG facts join the facts bank FIRST (highest trust) so both the text step and the
  // auto fact-clean verify against the knowledge base, not only scraped competitors.
  if (rag?.bankEntry) factsBank.unshift(rag.bankEntry as any);
  if (factsBank.length) (meta as any).facts_bank = factsBank;
  if (b.useRag) (meta as any).use_rag = true;
  return { ok: true, data: outline };
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
  const slimOutline = {
    meta: metaSlim,
    sections: full.sections,
    faq: full.faq,
    price_table_template: full.price_table_template,
  };
  // Volume guard for outlines saved before this fix (or edited by hand): if the sum of
  // section budgets is far below the target word count, rescale so the writer isn't
  // silently capped at a fraction of the plan. Implausibly small targets (junk emitted
  // by the model into meta) are ignored rather than shrinking a healthy outline.
  const textTargetWc = Number(b.targetWordCount) || Number(metaSlim?.target_word_count) || 0;
  if (textTargetWc >= 500) normalizeWordBudgets(slimOutline, textTargetWc);
  else if (textTargetWc > 0) (slimOutline.meta as any).target_word_count = ownBudgetSum(slimOutline) || textTargetWc;

  // Casino RAG: re-retrieve knowledge-base facts for the text step (fresh + full-length),
  // honoring either the explicit flag or the outline generated with RAG enabled.
  let ragFacts: string | undefined;
  if (b.useRag === true || (b.useRag !== false && full.meta?.use_rag)) {
    const rag = await findRagFacts(keyword || String(full.meta?.keyword ?? ""));
    if (rag) ragFacts = rag.rendered;
  }

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
  const model = b.model ? String(b.model) : undefined;
  const baseUrl = b.aiBaseUrl ? String(b.aiBaseUrl) : undefined;

  let text = await fetchLLM(prompt, provider, apiKey, 12000, model, baseUrl);
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
  // confirms). Best-effort: if it fails, keep the original text. Toggle off with autoFactCheck:false.
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

  // Guarantee the SEO meta block is present (deterministic — don't trust the model to emit it).
  text = ensureMetaBlock(text, b.outline?.meta);

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
