"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Eye, Trash2, FileText, ScrollText, BarChart3 } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { loadHistory, removeHistory, clearHistory, HistoryItem, HistoryType } from "@/lib/seo/history";

const TYPE_META: Record<HistoryType, { labelKey: string; color: string; icon: any }> = {
  outline: { labelKey: "seoBadgeOutline", color: "#2997ff", icon: FileText },
  text: { labelKey: "seoBadgeText", color: "#bf5af2", icon: ScrollText },
  analysis: { labelKey: "seoBadgeAnalysis", color: "#ff9f0a", icon: BarChart3 },
};

type Filter = "all" | "done" | "progress" | "outline" | "text" | "analysis";

export default function HistoryPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  useEffect(() => { setItems(loadHistory()); }, []);

  const counts = useMemo(() => ({
    all: items.length,
    done: items.filter(i => i.status === "completed").length,
    progress: items.filter(i => i.status === "processing").length,
  }), [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (filter === "outline" || filter === "text" || filter === "analysis") list = list.filter(i => i.type === filter);
    if (filter === "done") list = list.filter(i => i.status === "completed");
    if (filter === "progress") list = list.filter(i => i.status === "processing");
    if (q.trim()) list = list.filter(i => i.keyword.toLowerCase().includes(q.toLowerCase()));
    return list;
  }, [items, filter, q]);

  function view(item: HistoryItem) {
    router.push(`/seo-tools/history/${item.id}`);
  }
  function remove(id: string) { removeHistory(id); setItems(loadHistory()); }

  const FILTERS: { key: Filter; label: string; count?: number }[] = [
    { key: "all", label: t("seoHistFilterAll"), count: counts.all },
    { key: "done", label: t("seoHistFilterDone"), count: counts.done },
    { key: "progress", label: t("seoHistFilterProgress"), count: counts.progress },
    { key: "outline", label: t("seoHistFilterOutlines") },
    { key: "text", label: t("seoHistFilterTexts") },
    { key: "analysis", label: t("seoHistFilterAnalyses") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 4px" }}>{t("seoHistoryTitle")}</h2>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0 }}>{t("seoHistorySub")}</p>
      </div>

      <div className="panel">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>{t("seoHistoryAll")}</h3>
          <div style={{ position: "relative", flex: 1, maxWidth: "320px", minWidth: "180px" }}>
            <Search size={14} style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-tertiary)" }} />
            <input className="tool-input" style={{ paddingLeft: "32px" }} value={q} onChange={e => setQ(e.target.value)} placeholder={t("seoHistorySearch")} />
          </div>
        </div>

        {/* filters */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
          {FILTERS.map(f => {
            const on = filter === f.key;
            return (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: on ? 700 : 500, cursor: "pointer",
                border: "none", background: on ? "var(--color-accent-blue)" : "transparent",
                color: on ? "#fff" : "var(--color-text-secondary)",
              }}>
                {f.label}{f.count != null ? ` (${f.count})` : ""}
              </button>
            );
          })}
        </div>

        <div style={{ borderTop: "1px solid var(--color-border)" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "32px 12px", textAlign: "center", fontSize: "13px", color: "var(--color-text-secondary)" }}>{t("seoHistEmpty")}</div>
          ) : filtered.map(item => {
            const m = TYPE_META[item.type]; const Icon = m.icon;
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 4px", borderBottom: "1px solid var(--color-border)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: item.status === "processing" ? "var(--color-accent-blue)" : item.status === "error" ? "var(--color-accent-red)" : "var(--color-accent-green)" }} />
                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 700, padding: "3px 9px", borderRadius: "6px", color: m.color, background: `${m.color}1a`, flexShrink: 0 }}>
                  <Icon size={12} /> {t(m.labelKey as any)}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: "14px", color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.keyword}</span>
                <span style={{ fontSize: "12px", color: "var(--color-text-tertiary)", flexShrink: 0 }}>{new Date(item.createdAt).toLocaleDateString()}</span>
                <button onClick={() => view(item)} title={t("seoEdit")} style={iconBtn}><Eye size={15} /></button>
                <button onClick={() => remove(item.id)} title={t("seoDelete")} style={{ ...iconBtn, color: "var(--color-accent-red)" }}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>

        {items.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
            <button onClick={() => { clearHistory(); setItems([]); }} style={{ fontSize: "12px", color: "var(--color-accent-red)", background: "none", border: "none", cursor: "pointer" }}>{t("seoHistClear")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", padding: "6px", borderRadius: "7px",
  border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)", cursor: "pointer", flexShrink: 0,
};
