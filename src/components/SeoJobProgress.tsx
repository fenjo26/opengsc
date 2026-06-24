"use client";

// Live progress for a server-side background generation job. Polls the job and surfaces a
// "you can minimize this page" note — the task keeps running server-side and lands in History.

import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, Info } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { getJob, SeoJobRec } from "@/lib/seo/jobs";

export default function SeoJobProgress({ jobId, keyword, onDone, onError }: {
  jobId: string;
  keyword?: string;
  onDone: (job: SeoJobRec) => void;
  onError?: (msg: string) => void;
}) {
  const { t } = useLanguage();
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(6);
  const [err, setErr] = useState("");
  const stop = useRef(false);

  useEffect(() => {
    stop.current = false;
    const t0 = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
      setProgress(p => (p < 92 ? p + Math.max(0.5, (92 - p) * 0.015) : p));
    }, 1000);
    let poll: any;
    async function tick() {
      const job = await getJob(jobId);
      if (stop.current) return;
      if (job?.status === "completed") { stop.current = true; clearInterval(timer); setProgress(100); onDone(job); return; }
      if (job?.status === "error") { stop.current = true; clearInterval(timer); const m = job.error || "error"; setErr(m); onError?.(m); return; }
      poll = setTimeout(tick, 2500);
    }
    poll = setTimeout(tick, 2000);
    return () => { stop.current = true; clearInterval(timer); clearTimeout(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (err) {
    return (
      <div className="panel" style={{ borderColor: "rgba(255,69,58,0.35)", background: "rgba(255,69,58,0.06)", color: "var(--color-accent-red)", fontSize: "13px", display: "flex", gap: "8px", alignItems: "center" }}>
        <AlertTriangle size={16} /> {err}
      </div>
    );
  }

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <h3 style={{ fontSize: "17px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
          <Loader2 size={18} className="spin" /> {t("seoJobRunning")}
        </h3>
        <span className="pill">processing</span>
      </div>
      {keyword && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "12px" }}>{t("seoCaKeyword")}: {keyword}</div>}
      <div style={{ height: "10px", borderRadius: "6px", background: "var(--color-bg)", overflow: "hidden", marginBottom: "8px" }}>
        <div style={{ width: `${progress}%`, height: "100%", background: "var(--color-accent-purple)", transition: "width 0.6s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--color-text-secondary)" }}>
        <span>{Math.round(progress)}%</span>
        <span>{t("seoCaElapsed")}: {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
      </div>
      <div style={{ marginTop: "16px", padding: "13px 15px", borderRadius: "10px", background: "rgba(41,151,255,0.06)", border: "1px solid rgba(41,151,255,0.25)", fontSize: "13px", color: "var(--color-text-secondary)", display: "flex", gap: "9px", alignItems: "flex-start" }}>
        <Info size={16} color="var(--color-accent-blue)" style={{ flexShrink: 0, marginTop: "1px" }} /> {t("seoJobMinimizeNote")}
      </div>
    </div>
  );
}
