// Serializers for a generated outline → markdown / HTML / heading list / summary.
// Used by the task-detail toolbar (copy, download, view HTML, headings panel).

export interface Heading { level: string; text: string }

function wc(sec: any): string {
  const t = sec.word_count_total || sec.word_count;
  const s = sec.word_count_self;
  if (Array.isArray(t) && Array.isArray(s)) return `${t[0]}-${t[1]} words total / ${s[0]}-${s[1]} for this heading`;
  if (Array.isArray(t)) return `${t[0]}-${t[1]} words`;
  return "";
}
const entName = (e: any) => typeof e === "string" ? e : `${e.name}${e.weight != null ? ` [${e.weight}]` : ""}`;

export function outlineHeadings(o: any): Heading[] {
  if (!o) return [];
  const list: Heading[] = [];
  const title = o.meta?.h1 || o.meta?.title_options?.[0] || o.meta?.keyword;
  if (title) list.push({ level: "H1", text: title });
  (o.sections || []).forEach((s: any) => { if (s.heading) list.push({ level: s.h_level || "H2", text: s.heading }); });
  return list;
}

export function outlineSummary(o: any) {
  const headings = outlineHeadings(o);
  const target = Number(o?.meta?.target_word_count) || 0;
  const faqCount = (o?.faq || []).length;
  const faqReserved = faqCount * 50;
  return {
    keyword: o?.meta?.keyword || "",
    targetWords: target,
    available: target ? Math.max(0, target - faqReserved) : 0,
    faqReserved,
    faqCount,
    headingCount: headings.length,
  };
}

export function outlineToMarkdown(o: any): string {
  if (!o) return "";
  const L: string[] = [];
  const title = o.meta?.h1 || o.meta?.title_options?.[0] || o.meta?.keyword || "Outline";
  const mTitle = o.meta?.title_options?.[0];
  const mDesc = o.meta?.description_options?.[0];
  const mSlug = o.meta?.slug_options?.[0];
  if (mTitle || mDesc || mSlug) {
    L.push("**SEO meta**");
    if (mTitle) L.push(`- **Title:** ${mTitle}`);
    if (mDesc) L.push(`- **Meta Description:** ${mDesc}`);
    if (mSlug) L.push(`- **URL Slug:** ${mSlug}`);
    L.push("");
  }
  L.push(`# ${title}\n`);
  (o.sections || []).forEach((sec: any) => {
    const hashes = sec.h_level === "H3" ? "###" : sec.h_level === "H4" ? "####" : "##";
    L.push(`${hashes} ${sec.heading}`);
    const w = wc(sec); if (w) L.push(`*Word Count: ${w}*`);
    const ents = (sec.entities_to_cover || []).map(entName).join(", ");
    if (ents) L.push(`**Entities to cover:** ${ents}`);
    if (sec.keywords?.length) L.push(`**Keywords:** ${sec.keywords.join(", ")}`);
    if (sec.summary) L.push(`**Summary:** ${sec.summary}`);
    if (sec.visual_elements?.length) {
      L.push(`**Visual Elements:**`);
      sec.visual_elements.forEach((v: any) => L.push(`- ${typeof v === "string" ? v : `${v.type}${v.title ? ` — ${v.title}` : ""}${v.description ? `: ${v.description}` : ""}`}`));
    }
    if (sec.copywriter_notes) L.push(`**Copywriter Notes:** ${sec.copywriter_notes}`);
    if (sec.entity_connections?.length) {
      L.push(`**Entity Connections:**`);
      sec.entity_connections.forEach((c: any) => L.push(`- ${c.subject} → ${c.predicate} → ${c.object}${c.strength != null ? ` [${c.strength}]` : ""}`));
    }
    L.push("");
  });
  if (o.faq?.length) {
    L.push(`## Frequently Asked Questions`);
    o.faq.forEach((f: any, i: number) => L.push(`${i + 1}. ${f.question}`));
    L.push("");
  }

  // ─── Entity Analysis report (so the exported .md matches the in-app "Entity analysis" tab) ──
  const attrsStr = (a: any) => a ? Object.entries(a).map(([k, v]) => `${k}: ${v}`).join("; ") : "";
  if (o.sub_intents?.length) {
    L.push("## Sub-Intent Coverage");
    o.sub_intents.forEach((si: any, i: number) => {
      L.push(`${i + 1}. **${si.intent || ""}**${si.section ? ` → ${si.section}` : ""}${si.word_count ? ` (${si.word_count})` : ""}`);
      if (si.coverage) L.push(`   ${si.coverage}`);
      if (si.entities?.length) L.push(`   Entities: ${si.entities.join(", ")}`);
    });
    L.push("");
  }
  const ea = o.entity_analysis;
  if (ea) {
    L.push("## Entity Analysis");
    const cs = ea.content_strategy;
    if (cs) {
      const blk = (title: string, arr?: any[]) => { if (arr?.length) { L.push(`### ${title}`); arr.forEach((x: any) => L.push(`- ${typeof x === "string" ? x : JSON.stringify(x)}`)); L.push(""); } };
      blk("Content Structure Advantages", cs.structure_advantages);
      blk("Entity-Based Advantages", cs.entity_advantages);
      blk("Content Structure Superiority", cs.structure_superiority);
      blk("Authority Signal Enhancement", cs.authority_signals);
    }
    const pe = ea.primary_entity;
    if (pe?.name) {
      L.push("### Primary Entity Framework", `**${pe.name}**`);
      if (pe.attributes) L.push(`- Attributes: ${attrsStr(pe.attributes)}`);
      (pe.relationship_triplets || []).forEach((tr: string) => L.push(`- ${tr}`));
      if (pe.authority_validation) L.push(`- Authority: ${pe.authority_validation}`);
      L.push("");
    }
    if (ea.supporting_entities?.length) {
      L.push("### Supporting Entity Network");
      ea.supporting_entities.forEach((se: any) => {
        L.push(`**${se.name}**`);
        if (se.attributes) L.push(`- Attributes: ${attrsStr(se.attributes)}`);
        if (se.relationship_to_primary) L.push(`- Relationship: ${se.relationship_to_primary}`);
        if (se.content_integration) L.push(`- Integration: ${se.content_integration}`);
        L.push("");
      });
    }
    const ks = ea.keyword_strategy;
    if (ks) {
      L.push("### Keyword Strategy");
      const kb = (title: string, arr?: any[]) => { if (arr?.length) { L.push(`**${title}:**`); arr.forEach((x: any) => L.push(`- ${x.keyword || x}${x.usage ? ` — ${x.usage}` : ""}`)); } };
      kb("Primary", ks.primary); kb("LSI", ks.lsi); kb("Long-tail", ks.long_tail);
      L.push("");
    }
    if (ea.visual_elements?.length) {
      L.push("### EAV-Driven Visual Elements");
      ea.visual_elements.forEach((v: any) => {
        L.push(`**${v.name || ""}**`);
        if (v.purpose) L.push(`- Purpose: ${v.purpose}`);
        if (v.eav_data) L.push(`- EAV data: ${v.eav_data}`);
        if (v.prompt) L.push(`- Prompt: ${v.prompt}`);
        L.push("");
      });
    }
  }
  if (o.entities?.length) {
    L.push("### Comprehensive Entity List", "| Entity | Type | Weight | Attributes | Relationship triplets |", "| --- | --- | --- | --- | --- |");
    o.entities.forEach((e: any) => {
      const trip = (e.relationship_triplets || []).join("<br>");
      L.push(`| ${e.name || ""} | ${e.type || ""} | ${e.weight ?? ""} | ${attrsStr(e.attributes)} | ${trip} |`);
    });
    L.push("");
  }

  return L.join("\n");
}

export function outlineToHtml(o: any): string {
  if (!o) return "";
  const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const P: string[] = [];
  const title = o.meta?.h1 || o.meta?.title_options?.[0] || o.meta?.keyword || "Outline";
  P.push(`<h1>${esc(title)}</h1>`);
  (o.sections || []).forEach((sec: any) => {
    const tag = (sec.h_level || "H2").toLowerCase();
    P.push(`<${tag}>${esc(sec.heading)}</${tag}>`);
    if (sec.summary) P.push(`<p>${esc(sec.summary)}</p>`);
    if (sec.copywriter_notes) P.push(`<p><em>${esc(sec.copywriter_notes)}</em></p>`);
  });
  if (o.faq?.length) {
    P.push(`<h2>Frequently Asked Questions</h2><ol>`);
    o.faq.forEach((f: any) => P.push(`<li>${esc(f.question)}</li>`));
    P.push(`</ol>`);
  }
  return P.join("\n");
}

export function htmlDocument(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${bodyHtml}</body></html>`;
}

// Headings parsed from a generated article (markdown).
export function articleHeadings(md: string): Heading[] {
  return (md.match(/^#{1,6}\s.+$/gm) || []).map((line) => {
    const lvl = (line.match(/^#+/)?.[0].length) || 1;
    return { level: `H${lvl}`, text: line.replace(/^#+\s*/, "").trim() };
  });
}

export function countWords(s: string): number {
  const t = (s || "").replace(/[#*_`>\-]/g, " ").trim();
  return t ? t.split(/\s+/).length : 0;
}

// Cost saver: does a section contain verifiable facts worth fact-checking?
// Looks for currency, percentages, units (km/min/kg/…), times, and multi-digit numbers.
// Narrative/intro prose without such signals is skipped (nothing to verify there).
export function hasVerifiableFacts(text: string): boolean {
  if (!text) return false;
  if (/[€$£%]/.test(text)) return true;
  if (/\b\d{1,4}\s?(km|км|m|м|mi|min|мин|h|hr|hrs?|hours?|часов?|час|kg|кг|°|am|pm)\b/i.test(text)) return true;
  if (/\b\d{1,2}[:.]\d{2}\b/.test(text)) return true; // times like 10:30
  if (/\b\d{2,}\b/.test(text)) return true;           // any number with 2+ digits
  return false;
}

// Split a generated article (markdown) into H2/H3 sections for fact-checking.
export function splitArticleSections(md: string): { heading: string; level: string; text: string }[] {
  const lines = (md || "").split(/\r?\n/);
  const out: { heading: string; level: string; text: string }[] = [];
  let cur: { heading: string; level: string; text: string } | null = null;
  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.*)$/);
    if (m) { if (cur) out.push(cur); cur = { heading: m[2].trim(), level: `H${m[1].length}`, text: "" }; continue; }
    if (/^#\s+/.test(line)) continue; // skip H1 title
    if (cur) cur.text += line + "\n";
  }
  if (cur) out.push(cur);
  return out.filter(s => countWords(s.text) >= 25).slice(0, 24);
}

// Minimal, safe-ish Markdown → HTML for rendering the generated article.
export function markdownToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  const lines = (md || "").split(/\r?\n/);
  let html = ""; let inUl = false; let inOl = false;
  const closeLists = () => { if (inUl) { html += "</ul>"; inUl = false; } if (inOl) { html += "</ol>"; inOl = false; } };
  const isTableRow = (s: string) => /^\s*\|.*\|\s*$/.test(s);
  const isDivider = (s: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(s) && s.includes("-");
  const cells = (s: string) => s.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // GitHub-style table: header row + |---| divider + body rows.
    if (isTableRow(raw) && isTableRow(lines[i + 1] || "") && isDivider(lines[i + 1])) {
      closeLists();
      const head = cells(raw);
      let body = ""; let j = i + 2;
      while (j < lines.length && isTableRow(lines[j])) { body += `<tr>${cells(lines[j]).map(c => `<td>${inline(esc(c))}</td>`).join("")}</tr>`; j++; }
      html += `<table><thead><tr>${head.map(c => `<th>${inline(esc(c))}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
      i = j - 1; continue;
    }
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeLists(); html += `<h${h[1].length}>${inline(esc(h[2]))}</h${h[1].length}>`; continue; }
    if (/^\s*[-*]\s+/.test(raw)) { if (!inUl) { closeLists(); html += "<ul>"; inUl = true; } html += `<li>${inline(esc(raw.replace(/^\s*[-*]\s+/, "")))}</li>`; continue; }
    if (/^\s*\d+\.\s+/.test(raw)) { if (!inOl) { closeLists(); html += "<ol>"; inOl = true; } html += `<li>${inline(esc(raw.replace(/^\s*\d+\.\s+/, "")))}</li>`; continue; }
    if (!raw.trim()) { closeLists(); continue; }
    closeLists();
    html += `<p>${inline(esc(raw))}</p>`;
  }
  closeLists();
  return html;
}
