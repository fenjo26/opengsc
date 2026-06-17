// Editorial Policy — reusable system-prompt constructor (spec §10).
// Stored client-side (localStorage) as JSON, injected into outline / text prompts.
// Critical rule: skip empty fields when rendering — never emit "undefined".

export interface EditorialPolicy {
  name: string;
  audience?: { expertise?: string };
  voice?: { formality?: number };
  formatting?: {
    heading_style?: string; // questions | statements | how-to | mixed
    heading_case?: string;  // sentence | title | upper
    paragraph_length?: string; // short | medium | long
    use?: { bold?: boolean; italic?: boolean; tables?: boolean; quotes?: boolean; lists?: boolean; examples?: boolean };
  };
  quality?: {
    citation_style?: string; // inline | footnotes | none
    require_sources?: boolean;
    eeat_requirements?: string;
    fact_checking?: string;
  };
  restrictions?: {
    banned_words?: string[];
    banned_topics?: string[];
    compliance_requirements?: string;
  };
}

// Default policy for any new project — encodes the cross-cutting rule (spec §0/§10.4):
// never invent licenses/credentials; use placeholders for manual fill-in.
export const DEFAULT_POLICY: EditorialPolicy = {
  name: "Default",
  audience: { expertise: "intermediate" },
  voice: { formality: 50 },
  formatting: {
    heading_style: "mixed",
    heading_case: "sentence",
    paragraph_length: "short",
    use: { bold: true, italic: false, tables: true, quotes: false, lists: true, examples: true },
  },
  quality: {
    citation_style: "inline",
    require_sources: true,
    eeat_requirements: "Use real, verifiable experience. Cite real sources for factual claims.",
    fact_checking: "Prices, times and distances — only confirmed figures.",
  },
  restrictions: {
    banned_words: ["cheap", "guaranteed", "best in the world", "paradise"],
    banned_topics: [],
    compliance_requirements:
      "Never state licenses/credentials that do not exist — leave a placeholder for manual fill-in.",
  },
};

function has(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

// Render policy to the <editorial_policy> block. Skips every empty field (spec §10.3).
export function renderPolicy(p: EditorialPolicy): string {
  const lines: string[] = ["<editorial_policy>"];

  if (has(p.audience?.expertise)) {
    lines.push("## TARGET AUDIENCE", `Expertise level: ${p.audience!.expertise}`);
  }
  if (has(p.voice?.formality)) {
    lines.push("## VOICE & TONE", `Formality: ${p.voice!.formality}/100`);
  }

  const f = p.formatting;
  if (f) {
    const struct: string[] = [];
    if (has(f.heading_style)) struct.push(`heading style: ${f.heading_style}`);
    if (has(f.heading_case)) struct.push(`case: ${f.heading_case}`);
    if (has(f.paragraph_length)) struct.push(`paragraph length: ${f.paragraph_length}`);
    const uses = f.use
      ? Object.entries(f.use).filter(([, on]) => on).map(([k]) => k)
      : [];
    if (struct.length || uses.length) {
      lines.push("## STRUCTURE");
      if (struct.length) lines.push(struct.join("; "));
      if (uses.length) lines.push(`Use: ${uses.join(", ")}`);
    }
  }

  const q = p.quality;
  if (q) {
    const ql: string[] = [];
    if (has(q.citation_style)) ql.push(`citations: ${q.citation_style}`);
    if (q.require_sources != null) ql.push(`require sources: ${q.require_sources ? "yes" : "no"}`);
    if (ql.length || has(q.eeat_requirements) || has(q.fact_checking)) {
      lines.push("## QUALITY STANDARDS");
      if (ql.length) lines.push(ql.join("; "));
      if (has(q.eeat_requirements)) lines.push(`E-E-A-T: ${q.eeat_requirements}`);
      if (has(q.fact_checking)) lines.push(`Fact-checking: ${q.fact_checking}`);
    }
  }

  const r = p.restrictions;
  if (r) {
    const rl: string[] = [];
    if (has(r.banned_words)) rl.push(`Banned words: ${r.banned_words!.join(", ")}`);
    if (has(r.banned_topics)) rl.push(`Banned topics: ${r.banned_topics!.join(", ")}`);
    if (has(r.compliance_requirements)) rl.push(`Compliance: ${r.compliance_requirements}`);
    if (rl.length) {
      lines.push("## RESTRICTIONS");
      lines.push(...rl);
    }
  }

  lines.push("</editorial_policy>");
  return lines.join("\n");
}
