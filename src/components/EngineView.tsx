"use client";

// Alternative search-engine view for the site dashboard: when the engine switcher is
// set to Bing or Yandex, this replaces the GSC chart block with LIVE data from that
// engine's webmaster API. Shows everything the APIs give: clicks, impressions, CTR,
// weighted average position, traffic chart, top queries (and top pages + index/crawl
// stats for Bing, SQI + site diagnostics for Yandex). Refetches when the Sync-all
// button bumps refreshKey. Setup guide: docs/SEARCH-ENGINES-SETUP.md.

import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Loader2, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { severityMeta, problemLabel } from "@/lib/yandexDiagnostics";
import { resolveEngineKey } from "@/lib/engineKeys";

export type AltEngine = "bing" | "yandex";

const card: React.CSSProperties = { background: "var(--color-card)", borderRadius: "12px", padding: "16px", border: "1px solid var(--color-border)" };

interface Row { key: string; clicks: number; impressions: number; position?: number }

// Bing's OData JSON dates arrive as "/Date(1610000000000)/" — normalize both formats.
function parseBingDate(v: any): string {
  const m = String(v ?? "").match(/\/Date\((\d+)\)\//);
  const d = m ? new Date(parseInt(m[1], 10)) : new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

const pct = (clicks: number, impr: number) => (impr ? `${(Math.round((clicks / impr) * 1000) / 10).toFixed(1)}%` : "—");

function StatCard({ val, label, hint }: { val: string | number; label: string; hint?: string }) {
  return (
    <div style={card} title={hint}>
      <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--color-text-primary)" }}>{val}</div>
      <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
        {label}
        {hint && <span style={{ width: 13, height: 13, borderRadius: "50%", border: "1px solid var(--color-border)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 700, cursor: "help", flexShrink: 0 }}>i</span>}
      </div>
    </div>
  );
}

function RowsTable({ title, rows, keyLabel, t }: { title: string; rows: Row[]; keyLabel: string; t: any }) {
  if (!rows.length) return null;
  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)", padding: "13px 16px", borderBottom: "1px solid var(--color-border)" }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
            <th style={{ padding: "8px 16px", fontWeight: 500 }}>{keyLabel}</th>
            <th style={{ padding: "8px 8px", fontWeight: 500, textAlign: "right" }}>{t("clicks")}</th>
            <th style={{ padding: "8px 8px", fontWeight: 500, textAlign: "right" }}>{t("impressions")}</th>
            <th style={{ padding: "8px 8px", fontWeight: 500, textAlign: "right" }}>CTR</th>
            <th style={{ padding: "8px 16px", fontWeight: 500, textAlign: "right" }}>{t("avgPosition")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} style={{ borderTop: "1px solid var(--color-border)" }}>
              <td style={{ padding: "7px 16px", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text-primary)" }}>{r.key}</td>
              <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600, color: "var(--color-text-primary)" }}>{r.clicks.toLocaleString()}</td>
              <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--color-text-secondary)" }}>{r.impressions.toLocaleString()}</td>
              <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--color-text-secondary)" }}>{pct(r.clicks, r.impressions)}</td>
              <td style={{ padding: "7px 16px", textAlign: "right", color: "var(--color-text-secondary)" }}>{r.position != null ? Number(r.position).toFixed(1) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EngineView({ engine, domain, siteDbId, refreshKey }: { engine: AltEngine; domain: string; siteDbId: string; refreshKey: number }) {
  const { t, language } = useLanguage() as any;
  const lang = (language === "ru" || language === "uk" ? language : "en") as "en" | "ru" | "uk";
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [series, setSeries] = useState<{ date: string; clicks: number; impressions: number }[]>([]);
  const [queries, setQueries] = useState<Row[]>([]);
  const [pages, setPages] = useState<Row[]>([]);
  const [meta, setMeta] = useState<Record<string, any>>({});
  const [problems, setProblems] = useState<{ code: string; severity: string }[]>([]);
  const [tab, setTab] = useState<"queries" | "pages">("queries");

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^sc-domain:/, "").replace(/\/.*$/, "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr("");
      try {
        if (engine === "bing") {
          const apiKey = resolveEngineKey("bing", siteDbId);
          if (!apiKey) { setErr(t("seNeedKey")); setLoading(false); return; }
          const d = await fetch(`/api/indexing/bing?siteUrl=${encodeURIComponent(`https://${cleanDomain}/`)}&apiKey=${encodeURIComponent(apiKey)}`).then(r => r.json());
          if (cancelled) return;
          if (d.error) { setErr(String(d.error)); }
          else {
            // Bing's JSON keys are PascalCase but casing/shape has drifted across API
            // versions — read defensively (any-case) so a renamed field never blanks the view.
            const g = (o: any, ...keys: string[]) => { for (const k of keys) { if (o?.[k] != null) return o[k]; const lk = Object.keys(o ?? {}).find(x => x.toLowerCase() === k.toLowerCase()); if (lk != null && o[lk] != null) return o[lk]; } return undefined; };
            const num = (v: any) => { const n = Number(v); return isFinite(n) ? n : 0; };
            setSeries((d.traffic ?? []).map((r: any) => ({ date: parseBingDate(g(r, "Date")), clicks: num(g(r, "Clicks")), impressions: num(g(r, "Impressions")) })));
            setQueries((d.queries ?? []).slice(0, 25).map((q: any) => ({ key: String(g(q, "Query") ?? ""), clicks: num(g(q, "Clicks")), impressions: num(g(q, "Impressions")), position: g(q, "AvgImpressionPosition", "AvgClickPosition", "Position") })));
            setPages((d.pages ?? []).slice(0, 25).map((p: any) => ({ key: String(g(p, "Query", "Page", "Url") ?? "").replace(/^https?:\/\/[^/]+/, "") || "/", clicks: num(g(p, "Clicks")), impressions: num(g(p, "Impressions")), position: g(p, "AvgImpressionPosition", "Position") })));
            const cr = d.crawl;
            const crawlErrors = cr ? num(g(cr, "Code4xx", "Code400")) + num(g(cr, "Code5xx", "Code500")) || g(cr, "CrawlErrors") : undefined;
            setMeta({ inIndex: cr ? g(cr, "InIndex") : undefined, crawlErrors, blockedByRobots: cr ? g(cr, "BlockedByRobotsTxt") : undefined });
            setProblems([]);
          }
        } else {
          const token = resolveEngineKey("yandex", siteDbId);
          if (!token) { setErr(t("seNeedToken")); setLoading(false); return; }
          const d = await fetch(`/api/indexing/yandex?siteUrl=${encodeURIComponent(cleanDomain)}&token=${encodeURIComponent(token)}&days=56`).then(r => r.json());
          if (cancelled) return;
          if (d.error) { setErr(d.error === "host_not_found" ? t("seYandexHostNotFound") : d.error === "host_not_verified" ? t("seYandexHostNotVerified") : String(d.error)); }
          else {
            setSeries(d.series ?? []);
            setQueries((d.queries ?? []).map((q: any) => ({ key: q.query_text, clicks: q.indicators?.TOTAL_CLICKS ?? 0, impressions: q.indicators?.TOTAL_SHOWS ?? 0, position: q.indicators?.AVG_SHOW_POSITION ?? undefined })));
            setPages([]);
            setMeta({ sqi: d.summary?.sqi, inSearch: d.summary?.searchable_pages_count, excluded: d.summary?.excluded_pages_count });
            setProblems(d.problems ?? []);
          }
        }
      } catch (e: any) { if (!cancelled) setErr(String(e?.message ?? e)); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [engine, cleanDomain, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const totClicks = series.reduce((s, r) => s + r.clicks, 0);
  const totImpr = series.reduce((s, r) => s + r.impressions, 0);
  // Weighted average position over the top queries (impression-weighted) — best available
  // approximation, since neither API exposes a sitewide daily position series.
  const posRows = queries.filter(q => q.position != null && q.impressions > 0);
  const wAvgPos = posRows.length ? (posRows.reduce((s, q) => s + (q.position as number) * q.impressions, 0) / posRows.reduce((s, q) => s + q.impressions, 0)) : null;
  const color = engine === "bing" ? "#00809D" : "#FC3F1D";

  if (loading) return <div style={{ ...card, textAlign: "center", padding: "48px" }}><Loader2 size={20} className="spin" style={{ color: "var(--color-text-secondary)" }} /></div>;
  if (err) return (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: "8px", color: "#f87171", fontSize: "13px", flexWrap: "wrap" }}>
      <AlertTriangle size={14} /> {err} — <a href="/settings?tab=indexing-api" style={{ color: "var(--color-accent-blue)" }}>{t("seNeedKey")}</a>
      <a href="https://github.com/fenjo26/opengsc/blob/main/docs/SEARCH-ENGINES-SETUP.md" target="_blank" rel="noreferrer" style={{ color: "var(--color-accent-blue)" }}>{t("seSetupGuide")}</a>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
        <StatCard val={totClicks.toLocaleString()} label={t("clicks")} />
        <StatCard val={totImpr.toLocaleString()} label={t("impressions")} />
        <StatCard val={pct(totClicks, totImpr)} label="CTR" />
        {wAvgPos != null && <StatCard val={`≈ ${wAvgPos.toFixed(1)}`} label={t("avgPosition")} hint={t("seAvgPosNote")} />}
        {meta.sqi != null && <StatCard val={meta.sqi} label={t("seSqiLabel")} />}
        {meta.inSearch != null && <StatCard val={Number(meta.inSearch).toLocaleString()} label={t("seYandexInSearch")} />}
        {meta.excluded != null && <StatCard val={Number(meta.excluded).toLocaleString()} label={t("seYandexExcluded")} />}
        {meta.inIndex != null && <StatCard val={Number(meta.inIndex).toLocaleString()} label={t("seBingInIndex")} />}
        {meta.crawlErrors != null && <StatCard val={Number(meta.crawlErrors).toLocaleString()} label={t("seBingCrawlErrors")} />}
      </div>

      {/* Empty state — connected but no data yet (e.g. freshly verified site) */}
      {!series.length && !queries.length && (
        <div style={{ ...card, textAlign: "center", padding: "28px", color: "var(--color-text-secondary)", fontSize: "13px" }}>
          {t("seEngineNoData")}
        </div>
      )}

      {/* Yandex site diagnostics */}
      {problems.length > 0 && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("seYandexProblems")}</div>
          {problems.map(p => {
            const sev = severityMeta(p.severity, lang);
            return (
              <div key={p.code} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "5px", background: sev.bg, color: sev.color, whiteSpace: "nowrap", flexShrink: 0 }}>{sev.label}</span>
                <span style={{ color: "var(--color-text-primary)" }}>{problemLabel(p.code, lang)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Chart */}
      {series.length > 0 && (
        <div style={{ ...card, height: "280px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id={`eng-${engine}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }} />
              <Area type="monotone" dataKey="impressions" stroke={color} strokeOpacity={0.45} strokeWidth={1.5} fill="none" />
              <Area type="monotone" dataKey="clicks" stroke={color} strokeWidth={2} fill={`url(#eng-${engine})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Queries / Pages */}
      {pages.length > 0 && (
        <div style={{ display: "flex", gap: "2px", background: "rgba(255,255,255,0.06)", borderRadius: "8px", padding: "3px", width: "fit-content" }}>
          {(["queries", "pages"] as const).map(id => (
            <button key={id} onClick={() => setTab(id)}
              style={{ padding: "5px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "none", background: tab === id ? "var(--color-card)" : "transparent", color: tab === id ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>
              {id === "queries" ? t("seTopQueries") : t("seTopPages")}
            </button>
          ))}
        </div>
      )}
      {tab === "queries" || !pages.length
        ? <RowsTable title={`${t("seTopQueries")} — ${engine === "bing" ? "Bing" : t("seEngineYandex")}`} rows={queries} keyLabel={t("seQuery")} t={t} />
        : <RowsTable title={`${t("seTopPages")} — Bing`} rows={pages} keyLabel="URL" t={t} />}
    </div>
  );
}
