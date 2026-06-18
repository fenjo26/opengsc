// Shared narrative-tone vocabulary for the SEO Tools (outline + text generation + policy).
// `value` is stored; `labelKey` is the i18n key for the UI; `prompt` is the clear
// descriptor injected into the LLM prompt so generation actually adapts to the tone.

export interface ToneOption {
  value: string;
  labelKey: string;   // i18n key
  prompt: string;     // descriptor sent to the model
  formality: number;  // 0-100, kept for the policy export's formalityLevel
}

export const TONES: ToneOption[] = [
  { value: "expert",       labelKey: "seoToneExpert",       prompt: "expert, authoritative voice — first-person experience and confident recommendations (best for informational articles)", formality: 70 },
  { value: "professional", labelKey: "seoToneProfessional", prompt: "professional, corporate voice (best for commercial content)", formality: 80 },
  { value: "friendly",     labelKey: "seoToneFriendly",     prompt: "friendly, conversational voice", formality: 30 },
  { value: "inspiring",    labelKey: "seoToneInspiring",    prompt: "inspiring, motivational voice", formality: 50 },
  { value: "analytical",   labelKey: "seoToneAnalytical",   prompt: "analytical, informative voice — data-forward and neutral", formality: 60 },
  { value: "practical",    labelKey: "seoTonePractical",    prompt: "practical, advisory voice — actionable, step-by-step", formality: 55 },
];

// Descriptor map incl. legacy values from earlier versions (backward compatibility).
export const TONE_PROMPT: Record<string, string> = {
  ...Object.fromEntries(TONES.map(t => [t.value, t.prompt])),
  // legacy → closest descriptor
  conversational: "friendly, conversational voice",
  neutral: "analytical, informative voice — data-forward and neutral",
  business: "professional, corporate voice",
  official: "official, formal voice",
};

export const TONE_FORMALITY: Record<string, number> = {
  ...Object.fromEntries(TONES.map(t => [t.value, t.formality])),
  conversational: 30, neutral: 50, business: 80, official: 90,
};

// Resolve a tone value (preset, legacy or custom free-text) to a prompt descriptor.
export function toneToPrompt(value?: string): string {
  if (!value) return "";
  return TONE_PROMPT[value] ?? value; // unknown → treat as custom free text
}
