"use client";

// Client helpers for server-side background generation jobs.
// A job runs on the server and persists its result, so the user can close the tab and
// pick the finished task up later from History. Completed jobs are imported into the
// local (localStorage) History so the existing detail/render pages work unchanged.

import { addHistory, HistoryItem, HistoryType } from "@/lib/seo/history";

export interface SeoJobRec {
  id: string;
  type: HistoryType;
  keyword: string;
  status: "processing" | "completed" | "error";
  result?: string | null;
  error?: string | null;
  meta?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function startJob(type: HistoryType, payload: any, meta?: any): Promise<{ jobId?: string; error?: string }> {
  try {
    const keyword = payload?.keyword || payload?.outline?.meta?.keyword || "";
    const res = await fetch("/api/seo/jobs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, keyword, payload, meta }),
    });
    const d = await res.json();
    if (!res.ok) return { error: d.error || "job_failed" };
    return { jobId: d.jobId };
  } catch (e: any) { return { error: String(e?.message ?? e) }; }
}

export async function getJob(id: string): Promise<SeoJobRec | null> {
  try {
    const res = await fetch(`/api/seo/jobs/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()).job ?? null;
  } catch { return null; }
}

export async function listJobs(): Promise<SeoJobRec[]> {
  try {
    const res = await fetch("/api/seo/jobs", { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()).jobs ?? [];
  } catch { return []; }
}

export async function deleteJob(id: string): Promise<void> {
  try { await fetch(`/api/seo/jobs/${id}`, { method: "DELETE" }); } catch {}
}

function safeParse(s?: string | null): any { if (!s) return undefined; try { return JSON.parse(s); } catch { return undefined; } }

// Map a completed job's result into a local History item, then drop the server copy.
// Always removes the server job afterwards (even if unparseable) to avoid re-import loops.
export async function importJob(job: SeoJobRec): Promise<HistoryItem | null> {
  if (job.status !== "completed") return null;
  const result = safeParse(job.result);
  let rec: HistoryItem | null = null;
  if (result != null) {
    const data = job.type === "text" ? (result.text ?? result) : result;
    rec = addHistory({ type: job.type, keyword: job.keyword || "—", data, meta: safeParse(job.meta) });
  }
  await deleteJob(job.id);
  return rec;
}
