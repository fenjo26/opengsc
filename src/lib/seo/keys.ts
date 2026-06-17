// Client-side helpers to read API keys / settings from localStorage.
// Mirrors the app convention: keys live in the browser and are sent per-request.
"use client";

import { EditorialPolicy, DEFAULT_POLICY } from "./policy";

export function getAiCreds(): { provider: string; apiKey: string } {
  if (typeof window === "undefined") return { provider: "anthropic", apiKey: "" };
  const provider = localStorage.getItem("aiProvider") || "anthropic";
  const apiKey = localStorage.getItem(`aiKey_${provider}`) || localStorage.getItem("aiApiKey") || "";
  return { provider, apiKey };
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
    return Array.isArray(arr) && arr.length ? arr : [DEFAULT_POLICY];
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
