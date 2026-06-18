// Local history of SEO Tools generations (outline / text / analysis).
// Stored in localStorage — same browser-only convention as keys/policies.
"use client";

export type HistoryType = "outline" | "text" | "analysis";
export type HistoryStatus = "processing" | "completed" | "error";

export interface HistoryItem {
  id: string;
  type: HistoryType;
  keyword: string;
  createdAt: number;
  status: HistoryStatus;
  data: any; // outline object | article string | gap report object
  meta?: { tone?: string; promptType?: string; version?: string; error?: string; outlineId?: string; factcheck?: any; images?: any };
}

const KEY = "seoHistory";
const MAX = 100;

export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function addHistory(item: { type: HistoryType; keyword: string; data: any; status?: HistoryStatus; meta?: HistoryItem["meta"] }): HistoryItem {
  const rec: HistoryItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: item.type,
    keyword: item.keyword || "—",
    createdAt: Date.now(),
    status: item.status ?? "completed",
    data: item.data,
    meta: item.meta,
  };
  if (typeof window !== "undefined") {
    const next = [rec, ...loadHistory()].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  }
  return rec;
}

export function patchHistory(id: string, patch: Partial<Pick<HistoryItem, "status" | "data">> & { meta?: HistoryItem["meta"] }) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(loadHistory().map(h =>
    h.id === id ? { ...h, ...patch, meta: { ...h.meta, ...patch.meta } } : h
  )));
}

export function getHistoryItem(id: string): HistoryItem | undefined {
  return loadHistory().find(h => h.id === id);
}

export function updateHistory(id: string, data: any) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(loadHistory().map(h => h.id === id ? { ...h, data } : h)));
}

export function removeHistory(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(loadHistory().filter(h => h.id !== id)));
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

// Hand a history item to its tool page for viewing (read on that page's mount).
export function stashForView(item: HistoryItem) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("seoView", JSON.stringify({ type: item.type, data: item.data, keyword: item.keyword }));
}

export function takeView(): { type: HistoryType; data: any; keyword: string } | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("seoView");
  if (!raw) return null;
  sessionStorage.removeItem("seoView");
  try { return JSON.parse(raw); } catch { return null; }
}
