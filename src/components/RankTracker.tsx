"use client";

// Rank Tracker tab ("Positions") for the site detail page.
// Tracked keywords are checked via the user's SERP provider (Serper / DataForSEO /
// ScrapingRobot — configured in SEO Tools → Settings) by the in-app daily scheduler,
// or on demand with "Check now". Each keyword can be expanded into a history chart
// that overlays the scraped SERP position with the GSC average position.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Plus, RefreshCw, Trash2, ChevronDown, ChevronUp, ExternalLink, Search } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { usePrivacy } from "@/lib/PrivacyContext";

const COUNTRIES = ["us","gb","de","fr","es","it","nl","pl","cz","ua","ru","kz","tr","pt","br","mx","ca","au","in","jp","gr","cy","ro","bg","hu","se","no","fi","dk","ch","at","be","ie","il","ae","sg","id","th","vn","az","ge","am"];
const LANGS = ["en","ru","uk","de","fr","es","it","pl","cs","tr","pt","nl","el","ro","bg","hu","sv","no","fi","da","he","ar","id","th","vi","ja","kk","az","ka","hy"];

type KwRow = {
  id: string; keyword: string; country: string; lang: string; device: string;
  createdAt: string; lastCheckedAt: string | null;
  position: number | null; prevPosition: number | null; bestPosition: number | null;
  url: string | null; lastError: string | null;
  history: { date: string; position: number | null }[];
  gsc: { pos: number; clicks: number; impressions: number } | null;
};

function PosDelta({ position, prev }: { position: number | null; prev: number | null }) {
  if (position === null || prev === null || position === prev) return null;
  const up = position < prev; // lower = better
  const diff = Math.abs(prev - position);
  return (
    <span style={{ fontSize: "11px", fontWeight: 700, color: up ? "#10B981" : "#EF4444", marginLeft: "5px" }}>
      {up ? "▲" : "▼"}{diff}
    </span>
  );
}

// Tiny inline sparkline of position history (lower position = higher point).
function PosSparkline({ history }: { history: { date: string; position: number | null }[] }) {
  const pts = history.filter(h => h.position !== null) as { date: string; position: number }[];
  if (pts.length < 2) return <span style={{ color: "var(--color-text-secondary)", fontSize: "11px" }}>—</span>;
  const w = 90, h = 24, pad = 2;
  const min = Math.min(...pts.map(p => p.position));
  const max = Math.max(...pts.map(p => p.position));
  const span = Math.max(1, max - min);
  const xy = pts.map((p, i) => {
    const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
    const y = pad + ((p.position - min) / span) * (h - pad * 2); // higher position number → lower on chart
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const improving = pts[pts.length - 1].position <= pts[0].position;
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={xy.join(" ")} fill="none" stroke={improving ? "#10B981" : "#EF4444"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function HistoryChart({ keywordId }: { keywordId: string }) {
  const { t } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/rank/history?keywordId=${encodeURIComponent(keywordId)}&days=90`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [keywordId]);

  const series = useMemo(() => (data?.series ?? []).map((s: any) => ({
    ...s,
    label: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  })), [data]);

  if (loading) return <div style={{ padding: "24px", fontSize: "13px", color: "var(--color-text-secondary)" }}>Loading…</div>;
  if (!series.length) return <div style={{ padding: "24px", fontSize: "13px", color: "var(--color-text-secondary)" }}>{t("wlNoData")}</div>;

  return (
    <div style={{ padding: "12px 8px 4px" }}>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }} />
          <YAxis reversed domain={[1, "dataMax"]} allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }} />
          <Tooltip
            contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
            labelStyle={{ color: "var(--color-text-secondary)" }}
          />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          <Line name={t("rankSerp")} type="monotone" dataKey="serp" stroke="#3B82F6" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          <Line name={t("rankGsc")} type="monotone" dataKey="gsc" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function RankTracker({ siteDbId }: { siteDbId: string; domain?: string }) {
  const { t } = useLanguage();
  const { blur } = usePrivacy();
  const blurStyle: React.CSSProperties = blur ? { filter: "blur(5px)", userSelect: "none" } : {};

  const [rows, setRows] = useState<KwRow[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(true);
  const [loading, setLoading] = useState(true);
  const [kwText, setKwText] = useState("");
  const [country, setCountry] = useState("us");
  const [lang, setLang] = useState("en");
  const [busy, setBusy] = useState<null | "add" | "check">(null);
  const [progress, setProgress] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!siteDbId) return;
    try {
      const r = await fetch(`/api/rank/keywords?siteId=${encodeURIComponent(siteDbId)}&gsc=1`);
      const d = await r.json();
      if (Array.isArray(d.keywords)) {
        setRows(d.keywords);
        setProvider(d.provider ?? null);
        setHasKey(!!d.hasSerpKey);
      }
    } catch { /* ignore */ }
  }, [siteDbId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Run /api/rank/check in a loop until nothing remains (20 keywords per call).
  const runChecks = useCallback(async (body: Record<string, unknown>) => {
    for (let i = 0; i < 30; i++) {
      const r = await fetch("/api/rank/check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: siteDbId, ...body }),
      });
      const d = await r.json();
      if (!r.ok) { setProgress(d?.error === "no_serp_key" ? t("rankNoKey") : (d?.error || "error")); return; }
      await load();
      if (!d.remaining) break;
      setProgress(`${t("rankChecking")} ${d.remaining}…`);
    }
    setProgress("");
  }, [siteDbId, load, t]);

  const addKeywords = async () => {
    const list = kwText.split("\n").map(s => s.trim()).filter(Boolean);
    if (!list.length || busy) return;
    setBusy("add");
    try {
      const r = await fetch("/api/rank/keywords", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: siteDbId, keywords: list, country, lang }),
      });
      if (r.ok) {
        setKwText("");
        await load();
        await runChecks({}); // check new (never-checked) keywords right away
      }
    } finally { setBusy(null); }
  };

  const checkAll = async () => {
    if (busy) return;
    setBusy("check");
    setProgress(t("rankChecking"));
    try { await runChecks({ force: true }); } finally { setBusy(null); setProgress(""); }
  };

  const checkOne = async (id: string) => {
    if (busy) return;
    setBusy("check");
    try { await runChecks({ keywordId: id }); } finally { setBusy(null); }
  };

  const del = async (id: string) => {
    if (!confirm(t("rankDeleteConfirm"))) return;
    await fetch("/api/rank/keywords", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: siteDbId, ids: [id] }),
    });
    setRows(rs => rs.filter(r => r.id !== id));
  };

  const visible = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.keyword.includes(q));
  }, [rows, search]);

  const pathOf = (url: string | null) => {
    if (!url) return "";
    try { const u = new URL(url); return u.pathname === "/" ? "/" : u.pathname; } catch { return url; }
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--color-border)",
    background: "var(--color-card)", color: "var(--color-text-primary)", fontSize: "12px", outline: "none",
  };

  return (
    <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* No key warning */}
      {!loading && !hasKey && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)", color: "#F59E0B", fontSize: "13px" }}>
          ⚠ {t("rankNoKey")}{" "}
          <a href="/seo-tools/settings" style={{ color: "#F59E0B", fontWeight: 700, textDecoration: "underline" }}>SEO Tools → Settings</a>
        </div>
      )}

      {/* Add form + actions */}
      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <textarea
          value={kwText}
          onChange={e => setKwText(e.target.value)}
          placeholder={t("rankAddPlaceholder")}
          rows={2}
          style={{ ...inputStyle, flex: "1 1 320px", minHeight: "38px", resize: "vertical", fontFamily: "inherit" }}
        />
        <select value={country} onChange={e => setCountry(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }} title="Country (gl)">
          {COUNTRIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
        </select>
        <select value={lang} onChange={e => setLang(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }} title="Language (hl)">
          {LANGS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button onClick={addKeywords} disabled={!kwText.trim() || !!busy}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 14px", borderRadius: "8px", border: "1.5px solid rgba(59,130,246,0.5)", background: "rgba(59,130,246,0.08)", color: "#3B82F6", fontSize: "12px", fontWeight: 600, cursor: kwText.trim() && !busy ? "pointer" : "not-allowed", opacity: kwText.trim() && !busy ? 1 : 0.5 }}>
          <Plus size={13} /> {busy === "add" ? "…" : t("rankAddBtn")}
        </button>
        <button onClick={checkAll} disabled={!!busy || !rows.length}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 14px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-text-secondary)", fontSize: "12px", fontWeight: 600, cursor: busy || !rows.length ? "not-allowed" : "pointer" }}>
          <RefreshCw size={13} style={{ animation: busy === "check" ? "spin 1.2s linear infinite" : "none" }} />
          {busy === "check" ? (progress || t("rankChecking")) : t("rankCheckAll")}
        </button>
        {provider && (
          <span style={{ alignSelf: "center", fontSize: "11px", color: "var(--color-text-secondary)", padding: "4px 10px", borderRadius: "999px", border: "1px solid var(--color-border)" }}>
            {provider}
          </span>
        )}
      </div>

      {/* Search */}
      {rows.length > 8 && (
        <div style={{ position: "relative", maxWidth: "280px" }}>
          <Search size={13} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            style={{ ...inputStyle, width: "100%", paddingLeft: "30px", boxSizing: "border-box" }} />
        </div>
      )}

      {/* Table / empty state */}
      {loading ? (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "13px" }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: "48px 24px", textAlign: "center", border: "1px dashed var(--color-border)", borderRadius: "12px" }}>
          <div style={{ fontSize: "28px", marginBottom: "8px" }}>📍</div>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "6px" }}>{t("rankNoKeywords")}</div>
          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{t("rankNoKeywordsDesc")}</div>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
              {[t("rankColKeyword"), t("rankColPos"), t("rankColBest"), t("rankColGsc"), t("rankColUrl"), t("rankColTrend"), t("rankColChecked"), ""].map((h, i) => (
                <th key={i} style={{ textAlign: "left", padding: "8px 8px", color: "var(--color-text-secondary)", fontWeight: 500, fontSize: "11px", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <Fragment key={r.id}>
                <tr style={{ borderBottom: "1px solid var(--color-border)", background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}>
                  <td style={{ padding: "8px", maxWidth: "260px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button onClick={() => setExpanded(e => e === r.id ? null : r.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", padding: 0, display: "flex" }}>
                        {expanded === r.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                      <span style={{ fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...blurStyle }} title={r.keyword}>
                        {r.keyword}
                      </span>
                      <span style={{ fontSize: "10px", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderRadius: "4px", padding: "1px 4px", flexShrink: 0 }}>
                        {r.country.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                    {r.lastError ? (
                      <span title={r.lastError} style={{ color: "#EF4444", fontSize: "12px" }}>error</span>
                    ) : r.lastCheckedAt === null ? (
                      <span style={{ color: "var(--color-text-secondary)" }}>…</span>
                    ) : r.position === null ? (
                      <span style={{ color: "var(--color-text-secondary)", fontSize: "12px" }}>{t("rankNotFound")}</span>
                    ) : (
                      <>
                        <span style={{ fontWeight: 700, fontSize: "15px", color: r.position <= 3 ? "#10B981" : r.position <= 10 ? "#3B82F6" : "var(--color-text-primary)" }}>{r.position}</span>
                        <PosDelta position={r.position} prev={r.prevPosition} />
                      </>
                    )}
                  </td>
                  <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{r.bestPosition ?? "—"}</td>
                  <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                    {r.gsc ? (
                      <span title={`${r.gsc.clicks} clicks / ${r.gsc.impressions} impressions (7d)`} style={{ color: "#F59E0B", fontWeight: 600 }}>{r.gsc.pos}</span>
                    ) : <span style={{ color: "var(--color-text-secondary)" }}>—</span>}
                  </td>
                  <td style={{ padding: "8px", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" title={r.url}
                        style={{ color: "var(--color-text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px", ...blurStyle }}>
                        {pathOf(r.url)} <ExternalLink size={10} />
                      </a>
                    ) : <span style={{ color: "var(--color-text-secondary)" }}>—</span>}
                  </td>
                  <td style={{ padding: "8px" }}><PosSparkline history={r.history} /></td>
                  <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: "11px", whiteSpace: "nowrap" }}>
                    {r.lastCheckedAt ? new Date(r.lastCheckedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                  </td>
                  <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                    <button onClick={() => checkOne(r.id)} disabled={!!busy} title={t("rankCheckAll")}
                      style={{ background: "none", border: "none", cursor: busy ? "not-allowed" : "pointer", color: "var(--color-text-secondary)", padding: "4px" }}>
                      <RefreshCw size={13} />
                    </button>
                    <button onClick={() => del(r.id)} title={t("rankDeleteConfirm")}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: "4px", opacity: 0.7 }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr>
                    <td colSpan={8} style={{ padding: 0, borderBottom: "1px solid var(--color-border)", background: "rgba(255,255,255,0.02)" }}>
                      <HistoryChart keywordId={r.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
