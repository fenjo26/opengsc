"use client";

// Detail view for a "landing" history item: { outline, wireframe?, text? }.
// Stacks the existing OutlineView / WireframeView panels (each self-contained, incl. their
// own JSON download) instead of re-inventing tabs — same convention as the outline/text pages.

import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { OutlineView, WireframeView, SerpIntentPanel } from "@/components/SeoRenderers";
import { HistoryItem } from "@/lib/seo/history";

export default function SeoLandingDetail({ item }: { item: HistoryItem }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const data = (item.data || {}) as { outline?: any; wireframe?: any; text?: string };
  const { outline, wireframe, text } = data;

  function copyText() {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div className="panel" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <button onClick={() => router.push("/seo-tools/history")} style={btnGhost}><ArrowLeft size={15} /> {t("seoBackToHistory")}</button>
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>{item.keyword}</h2>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{t("seoCreatedAt")}: {new Date(item.createdAt).toLocaleString()}</div>
        </div>
      </div>

      {outline && <OutlineView outline={outline} />}
      {item.meta?.serpIntent && <SerpIntentPanel analysis={item.meta.serpIntent} />}
      {wireframe && <WireframeView wireframe={wireframe} />}

      {text && (
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "var(--color-text-primary)" }}>{t("seoGeneratedText")}</h3>
            <button onClick={copyText} style={btnGhost}>{copied ? <Check size={14} /> : <Copy size={14} />} {t("seoCopyShort")}</button>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: 1.6, color: "var(--color-text-primary)", margin: 0, fontFamily: "inherit" }}>{text}</pre>
        </div>
      )}
    </div>
  );
}

const btnGhost: React.CSSProperties = { display: "flex", alignItems: "center", gap: "6px", padding: "8px 13px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)", fontSize: "12px", fontWeight: 600, cursor: "pointer" };
