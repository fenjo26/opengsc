// Client-side helpers to read API keys / settings from localStorage.
// Mirrors the app convention: keys live in the browser and are sent per-request.
"use client";

import { EditorialPolicy, DEFAULT_POLICY, normalizePolicy } from "./policy";

export function getAiCreds(): { provider: string; apiKey: string } {
  if (typeof window === "undefined") return { provider: "anthropic", apiKey: "" };
  const provider = localStorage.getItem("aiProvider") || "anthropic";
  const apiKey = localStorage.getItem(`aiKey_${provider}`) || localStorage.getItem("aiApiKey") || "";
  return { provider, apiKey };
}

export const AI_PROVIDER_IDS = ["anthropic", "openai", "gemini", "openrouter", "zai"] as const;
export const AI_PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic", openai: "OpenAI", gemini: "Google Gemini", openrouter: "OpenRouter", zai: "Z.AI",
};

// Providers the user has configured a key for (for the live model selector).
export function getConfiguredProviders(): { id: string; key: string }[] {
  if (typeof window === "undefined") return [];
  return AI_PROVIDER_IDS
    .map(id => ({ id, key: localStorage.getItem(`aiKey_${id}`) || "" }))
    .filter(p => p.key.trim().length > 4);
}

// Resolved creds for SEO generation: a SEO-specific provider override (seoProvider)
// can differ from the global aiProvider; falls back to it when unset.
export function getSeoGenCreds(): { provider: string; apiKey: string; model: string } {
  if (typeof window === "undefined") return { provider: "anthropic", apiKey: "", model: "" };
  const provider = localStorage.getItem("seoProvider") || localStorage.getItem("aiProvider") || "anthropic";
  const apiKey = localStorage.getItem(`aiKey_${provider}`) || localStorage.getItem("aiApiKey") || "";
  const model = localStorage.getItem("seoModel") || "";
  return { provider, apiKey, model };
}

export function getSerpCreds(): { provider: string; apiKey: string } {
  if (typeof window === "undefined") return { provider: "serper", apiKey: "" };
  const provider = localStorage.getItem("seoSerpProvider") || "serper";
  const apiKey = localStorage.getItem(`seoKey_${provider}`) || "";
  return { provider, apiKey };
}

export function getFirecrawlKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("seoKey_firecrawl") || "";
}

// ─── Fact-check / enrichment preferences ────────────────────────────────────────
export function getAutoFactcheck(): boolean {
  if (typeof window === "undefined") return false;
  return (localStorage.getItem("seoAutoFactcheck") ?? "1") !== "0";
}
export function getAutoImages(): boolean {
  if (typeof window === "undefined") return false;
  return (localStorage.getItem("seoAutoImages") ?? "1") !== "0";
}
export function getHardRedact(): boolean {
  if (typeof window === "undefined") return false;
  return (localStorage.getItem("seoHardRedact") ?? "0") === "1";
}
export function getFactSourceCount(): number {
  if (typeof window === "undefined") return 6;
  const n = parseInt(localStorage.getItem("seoFactSources") ?? "6", 10);
  return isNaN(n) ? 6 : Math.max(0, Math.min(10, n));
}

// Optional stronger model for outline/analysis (Anthropic only). Empty = provider default.
export function getSeoModel(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("seoModel") || "";
}

// ─── Editorial policies (stored as a named list) ────────────────────────────────
const POLICY_KEY = "seoPolicies";

export function loadPolicies(): EditorialPolicy[] {
  if (typeof window === "undefined") return [DEFAULT_POLICY];
  try {
    const raw = localStorage.getItem(POLICY_KEY);
    if (!raw) return [DEFAULT_POLICY];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length ? arr.map(normalizePolicy) : [DEFAULT_POLICY];
  } catch {
    return [DEFAULT_POLICY];
  }
}

export function savePolicies(policies: EditorialPolicy[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(POLICY_KEY, JSON.stringify(policies));
}

export function getActivePolicyName(): string {
  if (typeof window === "undefined") return "Default";
  return localStorage.getItem("seoActivePolicy") || "Default";
}

export function setActivePolicyName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("seoActivePolicy", name);
}
