"use client";

// Client helpers for GEO audits. An audit runs server-side and persists its result,
// so the user can close the tab and re-open it later from the recent list.
import type { GeoReport } from "@/lib/seo/geo";

export interface GeoAuditRec {
  id: string;
  query: string;
  language: string;
  country: string;
  model: string;
  status: "processing" | "completed" | "error";
  error?: string | null;
  report?: string | null;
  createdAt: string;
  updatedAt: string;
}

// The GEO engine uses OpenAI's web_search tool, so it always needs the OpenAI key
// specifically (independent of whichever provider the other SEO tools are set to).
export function getOpenAiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("aiKey_openai") || (localStorage.getItem("aiProvider") === "openai" ? localStorage.getItem("aiApiKey") || "" : "");
}

const GEO_MODEL_KEY = "geoModel";
export function getGeoModel(): string {
  if (typeof window === "undefined") return "gpt-5";
  return localStorage.getItem(GEO_MODEL_KEY) || "gpt-5";
}
export function setGeoModel(m: string) {
  if (typeof window !== "undefined") localStorage.setItem(GEO_MODEL_KEY, m);
}

export async function startGeoAudit(payload: { query: string; language: string; country: string; model: string; apiKey: string }): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch("/api/seo/geo", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (!res.ok) return { error: d.error || "audit_failed" };
    return { id: d.id };
  } catch (e: any) { return { error: String(e?.message ?? e) }; }
}

export async function getGeoAudit(id: string): Promise<GeoAuditRec | null> {
  try {
    const res = await fetch(`/api/seo/geo/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()).audit ?? null;
  } catch { return null; }
}

export async function listGeoAudits(): Promise<GeoAuditRec[]> {
  try {
    const res = await fetch("/api/seo/geo", { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()).audits ?? [];
  } catch { return []; }
}

export async function deleteGeoAudit(id: string): Promise<void> {
  try { await fetch(`/api/seo/geo/${id}`, { method: "DELETE" }); } catch {}
}

export function parseReport(rec: GeoAuditRec | null): GeoReport | null {
  if (!rec?.report) return null;
  try { return JSON.parse(rec.report) as GeoReport; } catch { return null; }
}
