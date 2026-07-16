"use client";

// Detail view for a "cluster" history item: SERP-overlap keyword clusters → page plan.
// Each cluster = one future page; the button hands the cluster to the Outline tool.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Boxes, Copy, Check, Wand2, Download } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { HistoryItem } from "@/lib/seo/history";

const INTENT_COLOR: Record<string, string> = { buy: "#10A37F", review: "#2997ff", listicle: "#ff9f0a", use_case: "#8e8e93", info: "#8e8e93" };
const btnGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 13px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)", fontSize: "12px", fontWeight: 600, cursor: "pointer" };

export default function SeoClusterDetail({ item }: { item: HistoryItem }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [copied, setCopied] = useState<string>("");
  const data = item.data || {};
  const clusters: any[] = Array.isArray(data.clusters) ? data.clusters : [];
  const p = data.params || {};

  function toOutline(c: any) {
    // Hand the cluster to the Outline tool: main keyword + the rest as additional keywords.
    sessionStorage.setItem("seoClusterSeed", JSON.stringify({
      keyword: c.name,
      additional: c.keywords.slice(1).map((k: any) => k.keyword).join(", "),
      gl: p.gl, hl: p.hl,
    }));
    router.push("/seo-tools/outline");
  }

  function copyCluster(c: any) {
    navigator.clipboard.writeText(c.keywords.map((k: any) => k.keyword).join("\n"));
    setCopied(c.name); setTimeout(() => setCopied(""), 1200);
  }

  function exportCsv() {
    const rows = [["cluster", "intent", "keyword", "volume", "overlap"]];
    for (const c of clusters) for (const k of c.keywords) rows.push([c.name, c.intent, k.keyword, String(k.volume ?? 0), String(k.overlap ?? "")]);
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = `clusters-${item.keyword || "keywords"}.csv`;
    a.click();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div className="panel" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <button onClick={() => router.push("/seo-tools/history")} style={btnGhost}><ArrowLeft size={15} /> {t("seoBackToHistory")}</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <Boxes size={17} color="var(--color-accent-purple)" /> {t("seoClusterResult")}: {item.keyword}
          </h2>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
            {clusters.length} {t("seoClustersWord")} · {p.clustered ?? "?"}/{p.total_keywords ?? "?"} {t("seoClusterKwProcessed")} · {t("seoClusterThreshold")}: {p.threshold}
          </div>
        </div>
        <button onClick={exportCsv} style={btnGhost}><Download size={13} /> CSV</button>
      </div>

      {clusters.map((c, i) => (
        <div key={i} className="panel">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
            <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>{c.name}</span>
            <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 9px", borderRadius: "20px", color: INTENT_COLOR[c.intent] || "var(--color-text-secondary)", background: `${INTENT_COLOR[c.intent] || "#888"}1a` }}>{c.intent}</span>
            <span style={{ fontSize: "12px", color: "var(--color-text-tertiary)" }}>{c.keywords.length} {t("seoClusterKws")} · {Number(c.volume).toLocaleString()} {t("seoKwVolume").toLowerCase()}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
              <button onClick={() => copyCluster(c)} style={btnGhost}>{copied === c.name ? <Check size={12} /> : <Copy size={12} />}</button>
              <button onClick={() => toOutline(c)} style={{ ...btnGhost, color: "var(--color-accent-purple)", borderColor: "rgba(191,90,242,0.4)" }}><Wand2 size={12} /> {t("seoClusterToOutline")}</button>
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {c.keywords.map((k: any, j: number) => (
              <span key={j} title={`overlap: ${k.overlap}`} style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "16px", border: "1px solid var(--color-border)", color: "var(--color-text-primary)", background: j === 0 ? "rgba(191,90,242,0.08)" : "transparent" }}>
                {k.keyword}{k.volume ? <span style={{ color: "var(--color-text-tertiary)" }}> · {Number(k.volume).toLocaleString()}</span> : null}
              </span>
            ))}
          </div>
          {Array.isArray(c.top_domains) && c.top_domains.length > 0 && (
            <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "8px" }}>SERP: {c.top_domains.join(" · ")}</div>
          )}
        </div>
      ))}

      {Array.isArray(p.failed) && p.failed.length > 0 && (
        <div className="panel" style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
          ⚠️ {t("seoClusterFailedKws")}: {p.failed.slice(0, 20).join(", ")}{p.failed.length > 20 ? "…" : ""}
        </div>
      )}
    </div>
  );
}
