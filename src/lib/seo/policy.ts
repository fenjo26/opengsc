// Editorial Policy — reusable system-prompt constructor (spec §10).
// Canonical schema (matches the reference project's JSON export). Stored client-side
// (localStorage) and injected whole into outline / text prompts via renderPolicy.
// Critical rule: skip empty fields when rendering — never emit "undefined".

import { toneToPrompt } from "./tones";

export interface PolicyElements {
  bold: boolean; italics: boolean; lists: boolean; tables: boolean;
  quotes: boolean; examples: boolean; images: boolean;
}

export interface EditorialPolicy {
  name: string;          // policy identity / "Project name"
  createdAt?: number;
  brand: {
    name: string; url: string; description: string; values: string;
    competitors: string[];
  };
  audience: {
    customerProfile: string;
    expertiseLevel: string;   // beginner | intermediate | expert
    industryNiche: string;
  };
  voice: {
    authorPersona: string;
    toneOfVoice: string;      // conversational | neutral | business | official
    formalityLevel: number;   // 0-100, derived from tone but kept for export
  };
  structure: {
    headingStyle: string;          // questions | statements | how-to | mixed
    headingCapitalization: string; // sentence | title | upper
    paragraphLength: string;       // short | medium | long
    elements: PolicyElements;
  };
  quality: {
    citationStyle: string;     // inline | footnotes | none
    requireSourceLinks: boolean;
    eeatRequirements: string;
    factCheckingNotes: string;
  };
  restrictions: {
    wordsToAvoid: string;
    topicsToAvoid: string;
    complianceRequirements: string;
  };
  variables: Record<string, string>;
}

export const DEFAULT_POLICY: EditorialPolicy = {
  name: "Default",
  brand: { name: "", url: "", description: "", values: "", competitors: [] },
  audience: { customerProfile: "", expertiseLevel: "intermediate", industryNiche: "" },
  voice: { authorPersona: "", toneOfVoice: "expert", formalityLevel: 70 },
  structure: {
    headingStyle: "mixed",
    headingCapitalization: "title",
    paragraphLength: "medium",
    elements: { bold: true, italics: true, lists: true, tables: true, quotes: true, examples: true, images: false },
  },
  quality: { citationStyle: "inline", requireSourceLinks: false, eeatRequirements: "", factCheckingNotes: "" },
  restrictions: {
    wordsToAvoid: "",
    topicsToAvoid: "",
    // Cross-cutting rule (spec §0): never invent licenses/credentials.
    complianceRequirements: "Не указывать лицензии/регалии, которых нет — оставлять плейсхолдер под ручное заполнение.",
  },
  variables: {},
};

// Backfill any missing fields on a loaded/partial policy so the whole app can rely
// on the full canonical shape (e.g. policies saved before a field existed, or AI drafts).
export function normalizePolicy(p: Partial<EditorialPolicy> & { name?: string }): EditorialPolicy {
  const d = DEFAULT_POLICY;
  return {
    name: p.name || "Untitled",
    createdAt: p.createdAt,
    brand: { ...d.brand, ...(p.brand as any) },
    audience: { ...d.audience, ...(p.audience as any) },
    voice: { ...d.voice, ...(p.voice as any) },
    structure: {
      ...d.structure, ...(p.structure as any),
      elements: { ...d.structure.elements, ...((p.structure as any)?.elements) },
    },
    quality: { ...d.quality, ...(p.quality as any) },
    restrictions: { ...d.restrictions, ...(p.restrictions as any) },
    variables: { ...(p.variables as any) },
  };
}

// Export = canonical sub-objects only (drops our internal name/createdAt bookkeeping).
export function toExportJson(p: EditorialPolicy): Record<string, unknown> {
  const { name, createdAt, ...rest } = p; void name; void createdAt;
  return rest;
}

function has(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

// Render policy to the <editorial_policy> block. Skips every empty field (spec §10.3).
// `toneOverride` (a ready prompt descriptor) wins over the policy's own tone, so the
// per-generation tone selector is the single source of truth — no double/conflicting tone.
export function renderPolicy(p: EditorialPolicy, toneOverride?: string): string {
  const lines: string[] = ["<editorial_policy>"];

  // BRAND
  const b = p.brand ?? ({} as EditorialPolicy["brand"]);
  const brandLines: string[] = [];
  if (has(b.name)) brandLines.push(`Name: ${b.name}`);
  if (has(b.url)) brandLines.push(`URL: ${b.url}`);
  if (has(b.description)) brandLines.push(`Description: ${b.description}`);
  if (has(b.values)) brandLines.push(`Values: ${b.values}`);
  if (has(b.competitors)) brandLines.push(`Competitors: ${b.competitors.join(", ")}`);
  if (brandLines.length) { lines.push("## BRAND", ...brandLines); }

  // AUDIENCE
  const a = p.audience ?? ({} as EditorialPolicy["audience"]);
  const audLines: string[] = [];
  if (has(a.customerProfile)) audLines.push(`Customer profile: ${a.customerProfile}`);
  if (has(a.expertiseLevel)) audLines.push(`Expertise level: ${a.expertiseLevel}`);
  if (has(a.industryNiche)) audLines.push(`Industry / niche: ${a.industryNiche}`);
  if (audLines.length) { lines.push("## TARGET AUDIENCE", ...audLines); }

  // VOICE
  const v = p.voice ?? ({} as EditorialPolicy["voice"]);
  const voiceLines: string[] = [];
  if (has(v.authorPersona)) voiceLines.push(`Author persona: ${v.authorPersona}`);
  const tone = has(toneOverride) ? String(toneOverride) : (has(v.toneOfVoice) ? toneToPrompt(v.toneOfVoice) : "");
  if (tone) voiceLines.push(`Tone: ${tone}`);
  if (voiceLines.length) { lines.push("## VOICE & TONE", ...voiceLines); }

  // STRUCTURE
  const s = p.structure ?? ({} as EditorialPolicy["structure"]);
  const structParts: string[] = [];
  if (has(s.headingStyle)) structParts.push(`heading style: ${s.headingStyle}`);
  if (has(s.headingCapitalization)) structParts.push(`capitalization: ${s.headingCapitalization}`);
  if (has(s.paragraphLength)) structParts.push(`paragraph length: ${s.paragraphLength}`);
  const el = s.elements;
  const usedEls = el ? (Object.keys(el) as (keyof PolicyElements)[]).filter(k => el[k]) : [];
  if (structParts.length || usedEls.length) {
    lines.push("## STRUCTURE");
    if (structParts.length) lines.push(structParts.join("; "));
    if (usedEls.length) lines.push(`Use: ${usedEls.join(", ")}`);
  }

  // QUALITY
  const q = p.quality ?? ({} as EditorialPolicy["quality"]);
  const qParts: string[] = [];
  if (has(q.citationStyle)) qParts.push(`citations: ${q.citationStyle}`);
  qParts.push(`require sources: ${q.requireSourceLinks ? "yes" : "no"}`);
  if (qParts.length || has(q.eeatRequirements) || has(q.factCheckingNotes)) {
    lines.push("## QUALITY STANDARDS");
    if (qParts.length) lines.push(qParts.join("; "));
    if (has(q.eeatRequirements)) lines.push(`E-E-A-T: ${q.eeatRequirements}`);
    if (has(q.factCheckingNotes)) lines.push(`Fact-checking: ${q.factCheckingNotes}`);
  }

  // RESTRICTIONS
  const r = p.restrictions ?? ({} as EditorialPolicy["restrictions"]);
  const rLines: string[] = [];
  if (has(r.wordsToAvoid)) rLines.push(`Words to avoid: ${r.wordsToAvoid}`);
  if (has(r.topicsToAvoid)) rLines.push(`Topics to avoid: ${r.topicsToAvoid}`);
  if (has(r.complianceRequirements)) rLines.push(`Compliance: ${r.complianceRequirements}`);
  if (rLines.length) { lines.push("## RESTRICTIONS", ...rLines); }

  lines.push("</editorial_policy>");
  return lines.join("\n");
}
