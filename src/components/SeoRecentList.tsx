"use client";

// Compact "recent items" mini-list for a given history type (outline / analysis / text),
// so you can reopen a recent result without switching to the History tab.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Clock } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { loadHistory, HistoryItem, HistoryType } from "@/lib/seo/history";

export default function SeoRecentList({ type, limit = 6 }: { type: HistoryType; limit?: number }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    setItems(loadHistory().filter(h => h.type === type && h.status !== "processing").slice(0, limit));
  }, [type, limit]);

  if (!items.length) return null;

  return (
    <div className="panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
          <Clock size={15} color="var(--color-text-secondary)" /> {t("seoRecentTitle")}
        </div>
        <button onClick={() => router.push("/seo-tools/history")} style={{ fontSize: "12px", color: "var(--color-accent-blue)", background: "none", border: "none", cursor: "pointer" }}>{t("seoRecentAll")}</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {items.map(it => (
          <button key={it.id} onClick={() => router.push(`/seo-tools/history/${it.id}`)}
            style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 16px", borderRadius: "10px", border: "1px solid var(--color-border)", background: "var(--color-bg)", cursor: "pointer", textAlign: "left", width: "100%" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0, background: "var(--color-accent-green)" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.keyword}</div>
              <div style={{ fontSize: "12px", color: "var(--color-text-tertiary)", marginTop: "2px" }}>{t("seoCreatedAt")}: {new Date(it.createdAt).toLocaleString()}</div>
            </div>
            <Eye size={16} color="var(--color-accent-blue)" style={{ flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  );
}
