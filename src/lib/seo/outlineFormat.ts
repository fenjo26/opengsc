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
  const title = o.meta?.title_options?.[0] || o.meta?.keyword;
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
  const title = o.meta?.title_options?.[0] || o.meta?.keyword || "Outline";
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
  return L.join("\n");
}

export function outlineToHtml(o: any): string {
  if (!o) return "";
  const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const P: string[] = [];
  const title = o.meta?.title_options?.[0] || o.meta?.keyword || "Outline";
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
