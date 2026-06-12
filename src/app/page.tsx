"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Search, Eye, EyeOff, Star, ExternalLink,
  ArrowUpDown, SlidersHorizontal, Sparkles, Percent, MoveUp,
  Globe, Monitor, FileText, ChevronDown, Check,
  Image, Video, Newspaper, Compass,
  Download, Tag, X,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { usePrivacy } from "@/lib/PrivacyContext";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { useHealthStatus } from "@/components/SiteHealthPanel";

// ─── Types ────────────────────────────────────────────────────────────────────
type Metric = "clicks" | "impressions" | "ctr" | "position";
type SortBy = "az" | "total" | "growth" | "growth_pct" | "decline" | "decline_imp" | "decline_pos" | "tags";
type Comparison = "disabled" | "previous" | "yoy" | "prev_month" | "custom";
type PeriodView = "day" | "week" | "month";
type SearchType = "web" | "discover" | "news" | "image" | "video";
type BrandedFilter = "all" | "branded" | "nonbranded";

// ─── Metric config ────────────────────────────────────────────────────────────
const MC = {
  clicks:      { color: "#3B82F6", bg: "rgba(59,130,246,0.12)"  },
  impressions: { color: "#8B5CF6", bg: "rgba(139,92,246,0.12)" },
  ctr:         { color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  position:    { color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
} as const;

// ─── Mock data ────────────────────────────────────────────────────────────────
interface Pt {
  date: string;
  clicks: number; impressions: number; ctr: number; position: number;
  clicksC: number; impressionsC: number; ctrC: number; positionC: number;
  cN: number; iN: number; tN: number; pN: number;
  cCN: number; iCN: number; tCN: number; pCN: number;
}

function norm(arr: number[]): number[] {
  const lo = Math.min(...arr), hi = Math.max(...arr);
  return hi === lo ? arr.map(() => 50) : arr.map(v => Math.round(((v - lo) / (hi - lo)) * 85 + 5));
}

function periodToDays(period: string): number {
  const today = new Date();
  const map: Record<string, number> = {
    yesterday:    1,
    "7d":         7,
    "14d":        14,
    "28d":        28,
    last_week:    7,
    this_month:   today.getDate(),
    last_month:   new Date(today.getFullYear(), today.getMonth(), 0).getDate(),
    this_quarter: 90,
    last_quarter: 90,
    ytd:          Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 86400000),
    "3m":         90,
    "6m":         180,
    "8m":         240,
    "12m":        365,
    "16m":        480,
    "2y":         730,
    "3y":         1095,
  };
  return map[period] ?? 28;
}

function makeSiteData(n = 14, startDate?: Date): { data: Pt[]; summary: Record<Metric, { value: number; change: number }> } {
  let c = 20 + Math.random() * 150,
      im = c * (12 + Math.random() * 25),
      t  = 2 + Math.random() * 12,
      p  = 5 + Math.random() * 35;

  const rc: number[] = [], ri: number[] = [], rt: number[] = [], rp: number[] = [];
  const rcC: number[] = [], riC: number[] = [], rtC: number[] = [], rpC: number[] = [];

  for (let i = 0; i < n; i++) {
    c  = Math.max(1,   c  + (Math.random() - 0.47) * 25);
    im = Math.max(10,  im + (Math.random() - 0.47) * 300);
    t  = Math.max(0.1, Math.min(50, t + (Math.random() - 0.5) * 2));
    p  = Math.max(1,   Math.min(100, p + (Math.random() - 0.5) * 3));
    rc.push(Math.round(c));   ri.push(Math.round(im));
    rt.push(+t.toFixed(1));   rp.push(+p.toFixed(1));
    const f = 0.45 + Math.random() * 0.65;
    rcC.push(Math.round(c * f));  riC.push(Math.round(im * f));
    rtC.push(+(t * f).toFixed(1)); rpC.push(+Math.min(100, p / f).toFixed(1));
  }

  const nC = norm(rc), nI = norm(ri), nT = norm(rt), nP = norm(rp);
  const nCC = norm(rcC), nIC = norm(riC), nTC = norm(rtC), nPC = norm(rpC);

  const base = startDate ? new Date(startDate) : (() => { const d = new Date(); d.setDate(d.getDate() - n); return d; })();

  const data: Pt[] = rc.map((_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: n > 365 ? "numeric" : undefined });
    return {
      date: dateStr,
      clicks: rc[i], impressions: ri[i], ctr: rt[i], position: rp[i],
      clicksC: rcC[i], impressionsC: riC[i], ctrC: rtC[i], positionC: rpC[i],
      cN: nC[i], iN: nI[i], tN: nT[i], pN: nP[i],
      cCN: nCC[i], iCN: nIC[i], tCN: nTC[i], pCN: nPC[i],
    };
  });

  const last = n - 1, mid = Math.floor(n / 2);
  const pct = (a: number, b: number) => b === 0 ? 0 : Math.round(((a - b) / b) * 100);
  return {
    data,
    summary: {
      clicks:      { value: rc[last],  change: pct(rc[last],  rc[mid]) },
      impressions: { value: ri[last],  change: pct(ri[last],  ri[mid]) },
      ctr:         { value: rt[last],  change: pct(rt[last],  rt[mid]) },
      position:    { value: rp[last],  change: pct(rp[last],  rp[mid]) },
    },
  };
}

function fmtK(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }
function fmtVal(m: Metric, v: number) {
  if (m === "ctr") return `${v}%`;
  if (m === "impressions") return fmtK(v);
  return String(v);
}
function pctStr(curr: number, prev: number, invert = false) {
  if (prev === 0) return "";           // no prev data — show nothing
  if (curr === 0 && prev === 0) return "";
  const p = Math.round(((curr - prev) / prev) * 100);
  const up = invert ? p < 0 : p >= 0;
  return `${up ? "↑" : "↓"}${Math.abs(p)}%`;
}

function getDomain(url: string) {
  return url.replace("sc-domain:", "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// Deterministic branded ratio per site (0–1) based on URL hash
function brandedRatio(url: string): number {
  let h = 0;
  for (const c of url) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 100) / 100;
}

// ─── Filter chip ──────────────────────────────────────────────────────────────
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "3px 10px 3px 12px", borderRadius: "20px", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", fontSize: "12px", color: "#3B82F6", whiteSpace: "nowrap" }}>
      {label}
      <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#60a5fa", padding: "0 0 0 2px", lineHeight: 1, fontSize: "14px", display: "flex", alignItems: "center" }}>×</button>
    </div>
  );
}

// ─── Export helpers ───────────────────────────────────────────────────────────
const EXPORT_COLS = [
  { key: "date",    rows: 7   },
  { key: "page",    rows: 35  },
  { key: "query",   rows: 200 },
  { key: "country", rows: 56  },
  { key: "device",  rows: 3   },
] as const;
type ExportCol = typeof EXPORT_COLS[number]["key"];

function generateCSV(domain: string, cols: Set<ExportCol>): string {
  const dimCols = EXPORT_COLS.filter(c => cols.has(c.key)).map(c => c.key);
  const header = [...dimCols, "Clicks", "Impressions", "CTR", "Avg Position"].join(",");
  const devices = ["MOBILE", "DESKTOP", "TABLET"];
  const countries = ["grc", "usa", "gbr", "deu", "fra"];
  const rows: string[] = [header];
  const today = new Date();
  const n = cols.has("query") ? 200 : cols.has("page") ? 35 : cols.has("country") ? 56 : 7;
  for (let i = 0; i < n; i++) {
    const d = new Date(today); d.setDate(today.getDate() - Math.floor(Math.random() * 90));
    const row: string[] = [];
    if (cols.has("date"))    row.push(`"${d.toISOString().split("T")[0]}"`);
    if (cols.has("page"))    row.push(`"https://${domain}/page-${i+1}/"`);
    if (cols.has("query"))   row.push(`"keyword ${i+1}"`);
    if (cols.has("country")) row.push(`"${countries[i % countries.length]}"`);
    if (cols.has("device"))  row.push(`"${devices[i % devices.length]}"`);
    const clicks = Math.floor(Math.random() * 50);
    const impr   = clicks * (5 + Math.floor(Math.random() * 20));
    const ctr    = impr > 0 ? +((clicks / impr) * 100).toFixed(2) : 0;
    const pos    = +(1 + Math.random() * 50).toFixed(1);
    row.push(String(clicks), String(impr), String(ctr), String(pos));
    rows.push(row.join(","));
  }
  return rows.join("\n");
}

function downloadCSV(domain: string, cols: Set<ExportCol>) {
  const csv  = generateCSV(domain, cols);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `${domain}_${[...cols].join("_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Advanced Export Modal ────────────────────────────────────────────────────
function ExportModal({ domain, onClose }: { domain: string; onClose: () => void }) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<Set<ExportCol>>(new Set());

  const colLabel: Record<ExportCol, string> = {
    date:    t("exportColDate"),
    page:    t("filterPage"),
    query:   t("filterQuery"),
    country: t("filterCountry"),
    device:  t("filterDevice"),
  };

  const toggle = (k: ExportCol) => setSelected(p => {
    const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "28px 32px", maxWidth: "640px", width: "90%", color: "#111", boxShadow: "0 20px 60px rgba(0,0,0,0.4)", border: "2px solid #3B82F6", position: "relative" }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", cursor: "pointer", color: "#888" }}>
          <X size={20} />
        </button>
        <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>{t("advancedExport")}</h2>
        <p style={{ fontSize: "14px", color: "#555", marginBottom: "24px" }}>{t("exportDesc")}</p>

        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginBottom: "28px" }}>
          {EXPORT_COLS.map(({ key, rows }) => {
            const active = selected.has(key);
            return (
              <label key={key} style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
                <div onClick={() => toggle(key)} style={{
                  width: "18px", height: "18px", borderRadius: "4px", flexShrink: 0, marginTop: "1px",
                  border: `2px solid ${active ? "#3B82F6" : "#d1d5db"}`,
                  background: active ? "#3B82F6" : "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}>
                  {active && <Check size={11} color="#fff" strokeWidth={3} />}
                </div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600 }}>{colLabel[key]}</div>
                  <div style={{ fontSize: "12px", color: "#999" }}>{rows} {t("rows")}</div>
                </div>
              </label>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <button
            onClick={() => { if (selected.size > 0) { downloadCSV(domain, selected); onClose(); } }}
            style={{
              padding: "10px 22px", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: selected.size > 0 ? "pointer" : "not-allowed",
              background: selected.size > 0 ? "#4b5563" : "#9ca3af", color: "#fff", border: "none",
            }}
          >
            {t("exportToCSV")}
          </button>
          <p style={{ fontSize: "12px", color: "#888", flex: 1 }}>{t("exportWarning")}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload }: any) {
  const { t } = useLanguage();
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as Pt;
  if (!d) return null;
  const metricLabels: Record<Metric, string> = {
    clicks:      t("clicks"),
    impressions: t("impressions"),
    ctr:         "CTR",
    position:    t("avgPosition"),
  };
  const noPrev = (v: number) => v === 0;
  const prevStr = (v: number, fmt: (n: number) => string) => noPrev(v) ? "—" : fmt(v);
  const rows: { m: Metric; curr: string; prev: string; pct: string }[] = [
    { m: "clicks",      curr: String(d.clicks),    prev: prevStr(d.clicksC,     n => String(n)),          pct: pctStr(d.clicks,      d.clicksC) },
    { m: "impressions", curr: fmtK(d.impressions), prev: prevStr(d.impressionsC, n => fmtK(n)),           pct: pctStr(d.impressions, d.impressionsC) },
    { m: "ctr",         curr: `${d.ctr}%`,         prev: noPrev(d.ctrC) ? "—" : `${d.ctrC}%`,            pct: pctStr(d.ctr,         d.ctrC) },
    { m: "position",    curr: String(d.position),  prev: noPrev(d.positionC) ? "—" : String(d.positionC), pct: pctStr(d.position,    d.positionC, true) },
  ];
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px 14px", fontSize: "12px", color: "#111", minWidth: "210px", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 50px", gap: "2px 8px", marginBottom: "6px", paddingBottom: "6px", borderBottom: "1px solid #e5e7eb", color: "#888", fontSize: "11px" }}>
        <div />
        <div style={{ textAlign: "right", fontWeight: 500 }}>{d.date}</div>
        <div style={{ textAlign: "right", borderBottom: "2px dashed #ccc", paddingBottom: "2px" }}>{t("prev")}</div>
      </div>
      {rows.map(({ m, curr, prev, pct }) => (
        <div key={m} style={{ display: "grid", gridTemplateColumns: "1fr 90px 50px", gap: "2px 8px", marginBottom: "3px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: MC[m].color, flexShrink: 0, display: "inline-block" }} />
            <span style={{ color: "#555" }}>{metricLabels[m]}</span>
          </div>
          <div style={{ textAlign: "right", fontWeight: 600 }}>
            {curr}
            {pct && <span style={{ fontSize: "10px", marginLeft: "3px", color: pct.startsWith("↑") ? "#10B981" : "#EF4444" }}> {pct}</span>}
          </div>
          <div style={{ textAlign: "right", color: "#999" }}>{prev}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Multi-metric chart ───────────────────────────────────────────────────────
function MultiMetricChart({ data, activeMetrics, prevTrend = true }: { data: Pt[]; activeMetrics: Set<Metric>; prevTrend?: boolean }) {
  const metrics: { m: Metric; nKey: string; cKey: string }[] = [
    { m: "clicks",      nKey: "cN",  cKey: "cCN" },
    { m: "impressions", nKey: "iN",  cKey: "iCN" },
    { m: "ctr",         nKey: "tN",  cKey: "tCN" },
    { m: "position",    nKey: "pN",  cKey: "pCN" },
  ];
  return (
    <ResponsiveContainer width="100%" height={90}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          {metrics.map(({ m }) => (
            <linearGradient key={m} id={`g-${m}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={MC[m].color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={MC[m].color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#aaa", strokeWidth: 1, strokeDasharray: "3 2" }} />
        {prevTrend && metrics.map(({ m, cKey }) => activeMetrics.has(m) && (
          <Area key={`c-${m}`} type="monotone" dataKey={cKey}
            stroke={MC[m].color} strokeWidth={1} strokeDasharray="4 3"
            fill="none" dot={false} isAnimationActive={false} legendType="none" />
        ))}
        {metrics.map(({ m, nKey }) => activeMetrics.has(m) && (
          <Area key={m} type="monotone" dataKey={nKey}
            stroke={MC[m].color} strokeWidth={1.5}
            fill={`url(#g-${m})`} dot={false} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────
function Dropdown({ trigger, children, align = "left" }: { trigger: React.ReactNode; children: React.ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Clamp panel inside viewport after it renders
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const rect  = panel.getBoundingClientRect();
    const vw    = window.innerWidth;
    if (rect.right > vw - 8) {
      const overflow = rect.right - (vw - 8);
      panel.style.transform = `translateX(-${overflow}px)`;
    } else {
      panel.style.transform = "";
    }
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={() => setOpen(o => !o)}>{trigger}</div>
      {open && (
        <div ref={panelRef} style={{ position: "absolute", top: "calc(100% + 6px)", [align === "right" ? "right" : "left"]: 0, background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.25)", zIndex: 100, minWidth: "200px", maxWidth: "min(360px, calc(100vw - 16px))", clipPath: "inset(0 round 12px)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Style helpers
const mi = (active = false): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: "10px", padding: "9px 14px", fontSize: "13px", cursor: "pointer", width: "100%",
  background: active ? "rgba(59,130,246,0.12)" : "transparent",
  color: active ? "#3B82F6" : "var(--color-text-primary)", transition: "background 0.1s",
});
const ms = (label: string) => (
  <div style={{ padding: "10px 14px 4px", fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
);
const md = <div style={{ height: "1px", background: "var(--color-border)", margin: "4px 0" }} />;
const tbBtn = (active = false): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: "6px", padding: "6px 13px",
  borderRadius: "9999px",                                       /* pill — matches period pills */
  border: `1px solid ${active ? "var(--color-accent-blue)" : "var(--color-border)"}`,
  background: active ? "rgba(var(--color-accent-blue-rgb,0,102,204), 0.12)" : "var(--color-card)",
  color: active ? "var(--color-accent-blue)" : "var(--color-text-secondary)",
  fontSize: "12px", fontWeight: active ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap" as const,
});

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const { t } = useLanguage();
  const [sites, setSites]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const { blur } = usePrivacy();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [siteTags, setSiteTags] = useState<Record<string, string[]>>({});
  const [exportSite, setExportSite] = useState<string | null>(null);

  const [activeMetrics, setActiveMetrics] = useState<Set<Metric>>(new Set(["clicks", "impressions", "ctr", "position"]));
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    if (typeof window !== "undefined") return (localStorage.getItem("gsc_sort") as SortBy) ?? "az";
    return "az";
  });
  const [accounts, setAccounts] = useState<any[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editingTagSiteId, setEditingTagSiteId] = useState<string | null>(null);
  const [editingTagValue, setEditingTagValue]   = useState("");
  const [period, setPeriod]     = useState("7d");
  const [periodView, setPeriodView] = useState<PeriodView>("day");
  const [comparison, setComparison] = useState<Comparison>("previous");
  const [prevTrend, setPrevTrend]   = useState(true);
  const [matchWd, setMatchWd]       = useState(true);
  const [showPct, setShowPct]       = useState(true);
  const [searchType, setSearchType] = useState<SearchType>("web");
  const [branded, setBranded]       = useState<BrandedFilter>("all");
  const [filterDimension, setFilterDimension] = useState<"query"|"page"|"country"|"device"|null>(null);
  const [filterText, setFilterText] = useState("");

  type SyncStatus = "idle" | "syncing" | "done" | "error" | "reauth";
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  useEffect(() => {
    const s = localStorage.getItem('gsc_synced_at');
    if (s) setSyncedAt(new Date(s));
  }, []);

  useEffect(() => {
    fetch('/api/gsc/accounts')
      .then(r => r.json())
      .then(d => { if (d.accounts) setAccounts(d.accounts); })
      .catch(() => {});
  }, []);

  const handleSetSortBy = (s: SortBy) => {
    setSortBy(s);
    localStorage.setItem("gsc_sort", s);
  };

  const [newSitesFound, setNewSitesFound] = useState(0);

  const portfolioUrl = (p = period) =>
    `/api/gsc/portfolio?period=${p}&matchWd=${matchWd}`;

  const refetchPortfolio = (p = period) => {
    fetch(portfolioUrl(p))
      .then(r => r.json())
      .then(d => {
        if (d.sites) {
          setNewSitesFound(prev => Math.max(0, (d.sites as any[]).length - sites.length));
          setSites(d.sites);
        }
      })
      .catch(() => {});
  };

  // On mount: discover sites only (fast, no sync)
  useEffect(() => {
    let ignore = false;
    fetch('/api/gsc/sites')
      .then(r => r.json())
      .then(d => { 
        if (!ignore && d.sites?.length) {
          setSites(prev => {
            // Only update if we don't already have data, to avoid overwriting portfolio metrics
            if (prev.length > 0 && prev[0].hasData) return prev;
            return d.sites;
          });
        }
      })
      .catch(() => {});
    return () => { ignore = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSync = () => {
    if (syncStatus === "syncing") return;
    setSyncStatus("syncing");
    setSyncWarning(null);

    fetch('/api/gsc/sync', { method: 'POST' })
      .then(r => r.json())
      .then(() => {
        // Poll status every 15s until sync finishes, then refresh data
        const poll = setInterval(() => {
          fetch('/api/gsc/sync')
            .then(r => r.json())
            .then(s => {
              if (!s.syncing) {
                clearInterval(poll);
                refetchPortfolio();
                // Check for auth errors in the result
                if (s.lastResult?.needsReauth) {
                  setSyncStatus("reauth");
                  setSyncWarning("reauth");
                  setTimeout(() => setSyncStatus("idle"), 30_000);
                } else if (s.lastResult?.accountErrors > 0 && s.lastResult?.sitesSynced === 0) {
                  setSyncStatus("error");
                  setSyncWarning("error");
                  setTimeout(() => setSyncStatus("idle"), 30_000);
                } else {
                  // Only mark as synced on actual success
                  const now = new Date();
                  setSyncedAt(now);
                  localStorage.setItem('gsc_synced_at', now.toISOString());
                  setSyncStatus("done");
                  setTimeout(() => setSyncStatus("idle"), 5_000);
                }
              }
            })
            .catch(() => {});
        }, 15_000);
        // Safety: stop polling after 15 min
        setTimeout(() => { clearInterval(poll); setSyncStatus("idle"); }, 15 * 60_000);
      })
      .catch(() => setSyncStatus("idle"));
  };

  // Fetch real data from portfolio API whenever period or comparison settings change
  useEffect(() => {
    setLoading(true);
    fetch(portfolioUrl(period))
      .then(r => r.json())
      .then(d => { if (d.sites) setSites(d.sites); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period, matchWd]);

  // sitesWithData = sites already have real .data and .summary from the API
  // Fall back to fake data only if the site has no real metrics yet
  const sitesWithData = useMemo(() => {
    const days = periodToDays(period);
    const maxPoints = 90;
    const n = Math.min(days, maxPoints);
    const yd = new Date(); yd.setDate(yd.getDate() - 1);
    const startDate = new Date(yd);
    startDate.setDate(yd.getDate() - n + 1);

    return sites.map(s => {
      if (s.hasData && s.data?.length > 0) {
        // Real data: normalise chart arrays the same way the fake data does
        return s;
      }
      // No data synced yet — show placeholder zeros instead of fake numbers
      const emptyData = Array.from({ length: n }, (_, i) => {
        const d = new Date(startDate); d.setDate(startDate.getDate() + i);
        return {
          date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          clicks: 0, impressions: 0, ctr: 0, position: 0,
          clicksC: 0, impressionsC: 0, ctrC: 0, positionC: 0,
          cN: 50, iN: 50, tN: 50, pN: 50,
          cCN: 50, iCN: 50, tCN: 50, pCN: 50,
        };
      });
      return {
        ...s,
        data: emptyData,
        summary: {
          clicks:      { value: 0, change: 0 },
          impressions: { value: 0, change: 0 },
          ctr:         { value: 0, change: 0 },
          position:    { value: 0, change: 0 },
        },
      };
    });
  }, [sites, period]);
  const activeFilterCount = [
    branded !== "all",
    filterDimension !== null && filterText.trim() !== "",
  ].filter(Boolean).length;

  const filtered = sitesWithData
    .filter(s => {
      const domain = getDomain(s.url).toLowerCase();
      const tagsStr = (siteTags[s.id] || []).join(" ").toLowerCase();
      const searchLower = search.toLowerCase();
      
      if (!domain.includes(searchLower) && !tagsStr.includes(searchLower)) return false;
      if (branded === "branded"    && brandedRatio(s.url) <  0.45) return false;
      if (branded === "nonbranded" && brandedRatio(s.url) >= 0.45) return false;
      if (filterText.trim() && filterText !== "__longtail__") {
        const txt = filterText.trim().toLowerCase();
        if (filterDimension === "country") {
          const tld = domain.split(".").pop() ?? "";
          if (!tld.includes(txt)) return false;
        } else if (filterDimension === "query" || filterDimension === "page") {
          if (!domain.includes(txt)) return false;
        }
      }
      // Long Tail preset on portfolio: filter sites where avg position > 10 (tail traffic proxy)
      if (filterDimension === "query" && filterText === "__longtail__") {
        const pos = s.summary?.position?.value ?? 0;
        if (pos > 0 && pos <= 10) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Active tag: sites with this tag always float to top
      if (activeTag) {
        const aHas = (siteTags[a.id] || []).includes(activeTag);
        const bHas = (siteTags[b.id] || []).includes(activeTag);
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
      }
      switch (sortBy) {
        case "az":
          return getDomain(a.url).localeCompare(getDomain(b.url));
        case "total":
          return b.summary.clicks.value - a.summary.clicks.value;
        case "growth":
          return (b.summary.clicks.value * b.summary.clicks.change / 100)
               - (a.summary.clicks.value * a.summary.clicks.change / 100);
        case "growth_pct":
          return b.summary.clicks.change - a.summary.clicks.change;
        case "decline":
          // Most negative clicks change first; sites with 0 clicks go last
          if (a.summary.clicks.value === 0 && b.summary.clicks.value === 0) return 0;
          if (a.summary.clicks.value === 0) return 1;
          if (b.summary.clicks.value === 0) return -1;
          return a.summary.clicks.change - b.summary.clicks.change;
        case "decline_imp":
          // Most negative impressions change first; sites with 0 impressions go last
          if (a.summary.impressions.value === 0 && b.summary.impressions.value === 0) return 0;
          if (a.summary.impressions.value === 0) return 1;
          if (b.summary.impressions.value === 0) return -1;
          return a.summary.impressions.change - b.summary.impressions.change;
        case "decline_pos":
          // Biggest position drop first (position increased = got worse); sites with no data go last
          if (a.summary.position.value === 0 && b.summary.position.value === 0) return 0;
          if (a.summary.position.value === 0) return 1;
          if (b.summary.position.value === 0) return -1;
          // Higher change = position got worse (e.g. +5 means dropped 5 spots)
          return b.summary.position.change - a.summary.position.change;
        case "tags": {
          const aTag = siteTags[a.id]?.[0]?.toLowerCase() || "zzz";
          const bTag = siteTags[b.id]?.[0]?.toLowerCase() || "zzz";
          return aTag.localeCompare(bTag) || getDomain(a.url).localeCompare(getDomain(b.url));
        }
        default:
          return 0;
      }
    });
  const favSites    = filtered.filter(s => favorites.has(s.id) && !hidden.has(s.id));
  const restSites   = filtered.filter(s => !favorites.has(s.id) && !hidden.has(s.id));
  const hiddenSites = filtered.filter(s => hidden.has(s.id));

  // ─── Totals from visible (filtered) sites — respects search/tag/branded filters ──
  const visibleForTotals = [...favSites, ...restSites];
  const totalClicks      = visibleForTotals.reduce((s, site) => s + (site.summary?.clicks?.value ?? 0), 0);
  const totalImpressions = visibleForTotals.reduce((s, site) => s + (site.summary?.impressions?.value ?? 0), 0);
  const withCtr = visibleForTotals.filter(s => (s.summary?.ctr?.value ?? 0) > 0);
  const avgCtr  = withCtr.length > 0 ? +(withCtr.reduce((s, site) => s + site.summary.ctr.value, 0) / withCtr.length).toFixed(2) : 0;
  const withPos = visibleForTotals.filter(s => (s.summary?.position?.value ?? 0) > 0);
  const avgPos  = withPos.length > 0 ? +(withPos.reduce((s, site) => s + site.summary.position.value, 0) / withPos.length).toFixed(1) : 0;

  const toggleMetric = (m: Metric) => setActiveMetrics(p => { const n = new Set(p); n.has(m) ? n.delete(m) : n.add(m); return n; });
  const toggleFav    = (id: string) => setFavorites(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleHide   = (id: string) => setHidden(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ─── Period groups (uses t() for labels) ──────────────────────────────────
  const fmt    = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const today     = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const ago   = (n: number) => { const d = new Date(yesterday); d.setDate(yesterday.getDate() - n + 1); return d; };
  const mAgo  = (n: number) => { const d = new Date(yesterday); d.setMonth(d.getMonth() - n); return d; };
  const yAgo  = (n: number) => { const d = new Date(yesterday); d.setFullYear(d.getFullYear() - n); return d; };
  const r     = (a: Date, b: Date) => `${fmt(a)} – ${fmt(b)}`;

  const periodGroups = [
    [
      { label: fmtDay(yesterday), value: "yesterday", desc: "" },
      { label: t("period7d"),   value: "7d",  desc: r(ago(7),  yesterday) },
      { label: t("period14d"),  value: "14d", desc: r(ago(14), yesterday) },
      { label: t("period28d"),  value: "28d", desc: r(ago(28), yesterday) },
    ],
    [
      { label: t("lastWeek"),    value: "last_week",    desc: "" },
      { label: t("thisMonth"),   value: "this_month",   desc: "" },
      { label: t("lastMonth"),   value: "last_month",   desc: "" },
    ],
    [
      { label: t("thisQuarter"), value: "this_quarter", desc: "" },
      { label: t("lastQuarter"), value: "last_quarter", desc: "" },
      { label: t("yearToDate"),  value: "ytd",          desc: "" },
    ],
    [
      { label: t("period3m"),  value: "3m",  desc: r(mAgo(3),  yesterday) },
      { label: t("period6m"),  value: "6m",  desc: r(mAgo(6),  yesterday) },
      { label: t("period8m"),  value: "8m",  desc: r(mAgo(8),  yesterday) },
      { label: t("period12m"), value: "12m", desc: r(mAgo(12), yesterday) },
      { label: t("period16m"), value: "16m", desc: r(mAgo(16), yesterday) },
    ],
    [
      { label: t("period2y"), value: "2y",     desc: r(yAgo(2), yesterday) },
      { label: t("period3y"), value: "3y",     desc: r(yAgo(3), yesterday) },
      { label: t("custom"),   value: "custom", desc: "" },
    ],
  ];

  const getPeriodLabel = (v: string) => {
    for (const g of periodGroups) for (const p of g) if (p.value === v) return p.label;
    return v;
  };

  const metricLabels: Record<Metric, string> = {
    clicks:      t("clicks"),
    impressions: t("impressions"),
    ctr:         "CTR",
    position:    t("avgPosition"),
  };

  const sortLabels: Record<SortBy, string> = {
    "az":          t("sortAZ"),
    "total":       t("sortTotal"),
    "growth":      t("sortGrowth"),
    "growth_pct":  t("sortGrowthPct"),
    "decline":     t("sortDecline"),
    "decline_imp": t("sortDeclineImp"),
    "decline_pos": t("sortDeclinePos"),
    "tags":        t("sortTags"),
  };

  // Sort dropdown
  const SortDd = (
    <Dropdown trigger={<button style={tbBtn()}><ArrowUpDown size={13} /> {t("sort")}</button>}>
      {(["az","total","growth","growth_pct","decline","decline_imp","decline_pos","tags"] as SortBy[]).map(v => (
        <button key={v} style={mi(sortBy===v)} onClick={() => handleSetSortBy(v)}>
          {sortLabels[v]}{sortBy===v && <Check size={12} style={{marginLeft:"auto"}} />}
        </button>
      ))}
      {md}{ms(t("metric"))}
      {(["clicks","impressions","ctr","position"] as Metric[]).map(m => (
        <button key={m} style={mi(activeMetrics.has(m))} onClick={() => toggleMetric(m)}>
          <span style={{color:MC[m].color}}>●</span> {metricLabels[m]}
          {activeMetrics.has(m) && <Check size={12} style={{marginLeft:"auto"}} />}
        </button>
      ))}
    </Dropdown>
  );

  // Filter dropdown
  const filterDims = [
    { v: "query"   as const, l: t("filterQuery"),   i: <Search size={13}/> },
    { v: "page"    as const, l: t("filterPage"),    i: <FileText size={13}/> },
    { v: "country" as const, l: t("filterCountry"), i: <Globe size={13}/> },
    { v: "device"  as const, l: t("filterDevice"),  i: <Monitor size={13}/> },
  ];
  const filterPlaceholders: Record<string, string> = {
    query:   "e.g. casino, shop…",
    page:    "e.g. /blog, /product…",
    country: "e.g. gr, de, com…",
    device:  "",
  };
  const deviceOptions = [
    { v: "all",     l: t("all") },
    { v: "mobile",  l: t("deviceMobile") },
    { v: "desktop", l: t("deviceDesktop") },
    { v: "tablet",  l: t("deviceTablet") },
  ];

  const FilterDd = (
    <Dropdown trigger={
      <button style={tbBtn(activeFilterCount > 0)}>
        <SlidersHorizontal size={13} /> {t("filter")}
        {activeFilterCount > 0 && (
          <span style={{ background: "#3B82F6", color: "#fff", borderRadius: "10px", padding: "0 6px", fontSize: "11px", fontWeight: 700, marginLeft: "2px" }}>
            {activeFilterCount}
          </span>
        )}
      </button>
    }>
      {/* Dimension filters */}
      {ms(t("filter"))}
      {filterDims.map(({ v, l, i }) => (
        <button key={v} style={mi(filterDimension === v)} onClick={() => {
          if (filterDimension === v) { setFilterDimension(null); setFilterText(""); }
          else { setFilterDimension(v); setFilterText(""); }
        }}>
          {i} {l}
          {filterDimension === v && <Check size={12} style={{ marginLeft: "auto" }} />}
        </button>
      ))}

      {/* Text input for Query / Page / Country */}
      {filterDimension && filterDimension !== "device" && (
        <div style={{ padding: "4px 14px 10px" }}>
          <input
            autoFocus
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            placeholder={filterPlaceholders[filterDimension]}
            style={{ width: "100%", padding: "7px 10px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg-secondary)", color: "var(--color-text-primary)", fontSize: "12px", outline: "none", boxSizing: "border-box" }}
          />
        </div>
      )}

      {/* Device pills */}
      {filterDimension === "device" && (
        <div style={{ padding: "4px 14px 10px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {deviceOptions.map(({ v, l }) => (
            <button key={v} onClick={() => setFilterText(v === "all" ? "" : v)} style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 500, cursor: "pointer", border: `1px solid ${filterText === (v === "all" ? "" : v) ? "#3B82F6" : "var(--color-border)"}`, background: filterText === (v === "all" ? "" : v) ? "rgba(59,130,246,0.1)" : "transparent", color: filterText === (v === "all" ? "" : v) ? "#3B82F6" : "var(--color-text-secondary)" }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {md}{ms(t("brandedQueries"))}
      <div style={{ padding: "6px 14px 10px", display: "flex", gap: "6px" }}>
        {(["all", "branded", "nonbranded"] as BrandedFilter[]).map(v => {
          const lbl = v === "all" ? t("all") : v === "branded" ? `✦ ${t("branded")}` : `◎ ${t("nonBranded")}`;
          return (
            <button key={v} onClick={() => setBranded(v)} style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 500, cursor: "pointer", border: `1px solid ${branded === v ? "#3B82F6" : "var(--color-border)"}`, background: branded === v ? "rgba(59,130,246,0.1)" : "transparent", color: branded === v ? "#3B82F6" : "var(--color-text-secondary)" }}>
              {lbl}
            </button>
          );
        })}
      </div>

      {/* Tag filter section — only shown when user has tags */}
      {(() => {
        const allTags = [...new Set(Object.values(siteTags).flat())].sort();
        if (!allTags.length) return null;
        return (
          <>
            {md}{ms(t("tags"))}
            <div style={{ padding: "4px 14px 10px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {allTags.map(tag => {
                const isActive = activeTag === tag;
                return (
                  <button key={tag} onClick={() => setActiveTag(isActive ? null : tag)} style={{
                    padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 500, cursor: "pointer",
                    border: `1px solid ${isActive ? "var(--color-accent-blue)" : "var(--color-border)"}`,
                    background: isActive ? "rgba(var(--color-accent-blue-rgb,0,102,204),0.12)" : "transparent",
                    color: isActive ? "var(--color-accent-blue)" : "var(--color-text-secondary)",
                  }}>
                    🏷 {tag}
                    {isActive && <span style={{ marginLeft: "5px", fontWeight: 700 }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        );
      })()}

      {md}{ms(t("presetFilters"))}
      <button style={mi(filterDimension === "query" && filterText === "?")}
        onClick={() => { setFilterDimension("query"); setFilterText("?"); }}>
        <Search size={13}/> {t("peopleAlsoAsk")}
      </button>
      <button style={mi(filterDimension === "query" && filterText === "__longtail__")}
        onClick={() => { setFilterDimension("query"); setFilterText("__longtail__"); }}>
        <FileText size={13}/> {t("longTailKeywords")}
      </button>

      {/* Reset */}
      {activeFilterCount > 0 && (
        <>
          {md}
          <button style={{ ...mi(), color: "#EF4444" }} onClick={() => { setBranded("all"); setFilterDimension(null); setFilterText(""); }}>
            <X size={13}/> Reset filters
          </button>
        </>
      )}
    </Dropdown>
  );

  // Period dropdown
  const PeriodDd = (
    <Dropdown trigger={<button style={{...tbBtn(),gap:"8px"}}>{getPeriodLabel(period)} <ChevronDown size={13}/></button>} align="right">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",minWidth:"460px"}}>
        {/* Left: comparison */}
        <div style={{borderRight:"1px solid var(--color-border)"}}>
          {ms(t("comparisonPeriod"))}
          {([
            {l: t("compDisabled"),   v:"disabled"},
            {l: t("compPrevious"),   v:"previous"},
            {l: t("compYoy"),        v:"yoy"},
            {l: t("compPrevMonth"),  v:"prev_month"},
            {l: t("custom"),         v:"custom"},
          ] as {l:string;v:Comparison}[]).map(({l,v}) => (
            <button key={v} style={{...mi(comparison===v),fontWeight:comparison===v?600:400,color:comparison===v?"#3B82F6":"var(--color-text-secondary)"}} onClick={()=>setComparison(v)}>{l}</button>
          ))}
          {md}{ms(t("comparisonSettings"))}
          {([
            {l: t("prevTrendLine"), val:prevTrend, set:setPrevTrend},
            {l: t("matchWeekdays"), val:matchWd,   set:setMatchWd},
            {l: t("showChangePct"), val:showPct,   set:setShowPct},
          ]).map(({l,val,set}) => (
            <button key={l} style={mi()} onClick={()=>set(!val)}>
              <div style={{width:"16px",height:"16px",borderRadius:"4px",flexShrink:0,border:`2px solid ${val?"#3B82F6":"var(--color-border)"}`,background:val?"#3B82F6":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {val && <Check size={10} color="#fff" />}
              </div>
              {l}
            </button>
          ))}
          {md}{ms(t("searchType"))}
          {([
            {l: t("searchTypeWeb"),      v:"web",      i:<Globe size={13}/>},
            {l: t("searchTypeDiscover"), v:"discover", i:<Compass size={13}/>},
            {l: t("searchTypeNews"),     v:"news",     i:<Newspaper size={13}/>},
            {l: t("searchTypeImage"),    v:"image",    i:<Image size={13}/>},
            {l: t("searchTypeVideo"),    v:"video",    i:<Video size={13}/>},
          ] as {l:string;v:SearchType;i:React.ReactNode}[]).map(({l,v,i}) => (
            <button key={v} style={mi(searchType===v)} onClick={()=>setSearchType(v)}>{i} {l}{searchType===v&&<Check size={12} style={{marginLeft:"auto"}}/>}</button>
          ))}
        </div>
        {/* Right: periods */}
        <div style={{minWidth:0,display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",borderBottom:"1px solid var(--color-border)",padding:"6px 8px",gap:"4px"}}>
            {([
              {v:"day",   l: t("periodDay")},
              {v:"week",  l: t("periodWeek")},
              {v:"month", l: t("periodMonth")},
            ] as {v:PeriodView;l:string}[]).map(({v,l}) => (
              <button key={v} onClick={()=>setPeriodView(v)} style={{flex:1,padding:"5px 0",borderRadius:"6px",fontSize:"13px",fontWeight:periodView===v?600:400,cursor:"pointer",background:periodView===v?"rgba(59,130,246,0.12)":"transparent",color:periodView===v?"#3B82F6":"var(--color-text-secondary)",border:"none",transition:"all 0.15s"}}>
                {l}
              </button>
            ))}
          </div>
          <div className="period-scroll" style={{maxHeight:"420px",overflowY:"auto",scrollbarGutter:"stable",width:"100%"}}>
            {periodGroups.map((grp, gi) => (
              <div key={gi}>
                {grp.map(({label,value,desc}) => {
                  const active = period===value;
                  return (
                    <button key={value} style={{...mi(active),flexDirection:"column",alignItems:"flex-start",gap:"1px",padding:"8px 16px"}} onClick={()=>setPeriod(value)}>
                      <span style={{fontWeight:active?700:400,fontSize:"13px"}}>{label}</span>
                      {desc && <span style={{fontSize:"11px",color:"var(--color-text-secondary)",marginTop:"1px"}}>{desc}</span>}
                    </button>
                  );
                })}
                {gi < periodGroups.length-1 && md}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dropdown>
  );

  // Site card
  function SiteCard({ site }: { site: any }) {
    const domain = getDomain(site.url);
    const isFav  = favorites.has(site.id);
    const sum: Record<Metric,{value:number;change:number}> = site.summary;
    const healthStatus = useHealthStatus(site.siteDbId ?? null);

    const declineChange =
      sortBy === "decline"     ? sum.clicks.change :
      sortBy === "decline_imp" ? sum.impressions.change :
      sortBy === "decline_pos" ? sum.position.change :
      0;
    const isDeclineMode = sortBy === "decline" || sortBy === "decline_imp" || sortBy === "decline_pos";
    // For position: positive change = got worse, so highlight when change > 0
    const isFalling = isDeclineMode && (
      sortBy === "decline_pos" ? declineChange > 0 : declineChange < 0
    );
    const declineBorder = isFalling
      ? { borderColor: `rgba(239,68,68,${Math.min(0.75, 0.25 + Math.abs(declineChange) / 100 * 0.5)})` }
      : {};

    return (
      <Link href={`/site/${encodeURIComponent(domain)}`} className="card" style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:"8px",cursor:"pointer",textDecoration:"none",color:"inherit",...declineBorder}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"8px"}}>
          {/* Domain */}
          <div style={{display:"flex",alignItems:"center",gap:"6px",minWidth:0}}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/favicon?domain=${domain}`} width={16} height={16} alt=""
              style={{borderRadius:"3px",flexShrink:0,filter:blur?"blur(5px)":"none",transition:"filter 0.25s"}} onError={e=>((e.target as HTMLImageElement).style.display="none")} />
            <span style={{fontWeight:500,fontSize:"13px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",filter:blur?"blur(5px)":"none",transition:"filter 0.25s"}}>
              {domain}
            </span>
            <a href={`https://${domain}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{color:"var(--color-text-secondary)",flexShrink:0}}>
              <ExternalLink size={10}/>
            </a>
            {/* Health dot */}
            {healthStatus && (
              <span
                title={healthStatus === "error" ? "Health issue detected" : healthStatus === "warn" ? "Health warning" : "All checks passed"}
                style={{
                  width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                  background: healthStatus === "error" ? "#EF4444" : healthStatus === "warn" ? "#F59E0B" : "#10B981",
                  boxShadow: `0 0 0 2px ${healthStatus === "error" ? "rgba(239,68,68,0.25)" : healthStatus === "warn" ? "rgba(245,158,11,0.25)" : "rgba(16,185,129,0.25)"}`,
                }}
              />
            )}
          </div>

          {/* Metrics 2×2 */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 14px",flexShrink:0}}>
            {(["clicks","impressions","ctr","position"] as Metric[]).map(m => {
              if (!activeMetrics.has(m)) return null;
              const {value,change} = sum[m];
              const good  = m==="position" ? change<=0 : change>=0;
              const arrow = m==="position" ? (change<0?"↑":"↓") : (change>=0?"↑":"↓");
              return (
                <div key={m} style={{display:"flex",alignItems:"center",gap:"4px",fontSize:"12px",whiteSpace:"nowrap"}}>
                  <span style={{color:MC[m].color,fontSize:"10px",fontWeight:700}}>
                    {m==="clicks"?"✦":m==="impressions"?"◉":m==="ctr"?"%":"↑"}
                  </span>
                  <span style={{fontWeight:600,filter:blur?"blur(5px)":"none",transition:"filter 0.25s"}}>{fmtVal(m,value)}</span>
                  {change !== 0 && showPct && (
                    <span style={{fontSize:"10px",color:good?"#10B981":"#EF4444",fontWeight:500,filter:blur?"blur(5px)":"none",transition:"filter 0.25s"}}>
                      {arrow}{Math.abs(change)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart */}
        <MultiMetricChart data={site.data} activeMetrics={activeMetrics} prevTrend={prevTrend} />

        {/* Footer: tags and 4 action icons */}
        <div style={{display:"flex",flexDirection:"column",gap:"6px",paddingTop:"2px"}} onClick={e=>e.stopPropagation()}>

          {/* Inline tag editor (shown when editing this site) */}
          {editingTagSiteId === site.id && (
            <div style={{display:"flex",gap:"5px",alignItems:"center"}} onClick={e=>e.stopPropagation()}>
              <input
                autoFocus
                value={editingTagValue}
                onChange={e => setEditingTagValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setSiteTags(prev => ({ ...prev, [site.id]: editingTagValue.split(",").map(x => x.trim()).filter(Boolean) }));
                    setEditingTagSiteId(null);
                  }
                  if (e.key === "Escape") setEditingTagSiteId(null);
                }}
                placeholder={t("tagsPrompt") || "тег1, тег2"}
                style={{
                  flex: 1, minWidth: 0, padding: "4px 8px",
                  borderRadius: "6px", border: "1px solid var(--color-accent-blue)",
                  background: "var(--color-bg)", color: "var(--color-text-primary)",
                  fontSize: "12px", outline: "none",
                }}
              />
              <button
                onClick={e => {
                  e.stopPropagation();
                  setSiteTags(prev => ({ ...prev, [site.id]: editingTagValue.split(",").map(x => x.trim()).filter(Boolean) }));
                  setEditingTagSiteId(null);
                }}
                style={{ padding: "4px 8px", borderRadius: "6px", border: "none", background: "var(--color-accent-blue)", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                ✓
              </button>
              <button
                onClick={e => { e.stopPropagation(); setEditingTagSiteId(null); }}
                style={{ padding: "4px 6px", borderRadius: "6px", border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-text-secondary)", fontSize: "12px", cursor: "pointer", flexShrink: 0 }}>
                ✕
              </button>
            </div>
          )}

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            {/* Tags display */}
            <div style={{display:"flex",gap:"4px",flexWrap:"wrap",flex:1,minWidth:0,marginRight:"8px"}}>
              {(siteTags[site.id] || []).map(tag => {
                const isActive = activeTag === tag;
                return (
                  <span key={tag}
                    title={isActive ? t("tagFilterRemove") : t("tagFilterApply")}
                    onClick={e => { e.preventDefault(); e.stopPropagation(); setActiveTag(isActive ? null : tag); }}
                    style={{fontSize:"10px",fontWeight:600,padding:"2px 6px",borderRadius:"4px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"80px",cursor:"pointer",transition:"all 0.15s",
                      background: isActive ? "var(--color-accent-blue)" : "rgba(0,102,204,0.10)",
                      color:      isActive ? "#fff" : "var(--color-accent-blue)",
                      outline:    isActive ? "2px solid var(--color-accent-blue)" : "none",
                      outlineOffset: "1px",
                    }}>
                    {tag}
                  </span>
                );
              })}
            </div>

            {/* Icons */}
            <div style={{display:"flex",gap:"14px",flexShrink:0}}>
              <button title={t("advancedExport")} onClick={()=>setExportSite(domain)}
                style={{color:"var(--color-text-secondary)",opacity:0.5,transition:"all 0.15s",lineHeight:1}}
                onMouseOver={e=>(e.currentTarget.style.opacity="1")} onMouseOut={e=>(e.currentTarget.style.opacity="0.5")}>
                <Download size={13}/>
              </button>
              <button title={t("tags")} onClick={e => {
                e.stopPropagation();
                setEditingTagValue((siteTags[site.id] || []).join(", "));
                setEditingTagSiteId(site.id);
              }}
                style={{color: editingTagSiteId === site.id ? "var(--color-accent-blue)" : "var(--color-text-secondary)", opacity: editingTagSiteId === site.id ? 1 : 0.5, transition:"all 0.15s",lineHeight:1}}
                onMouseOver={e=>(e.currentTarget.style.opacity="1")} onMouseOut={e=>{ if(editingTagSiteId !== site.id) e.currentTarget.style.opacity="0.5"; }}>
                <Tag size={13}/>
              </button>
              <button title={hidden.has(site.id) ? t("unhideSite") : t("hideSite")} onClick={()=>toggleHide(site.id)}
                style={{color:hidden.has(site.id)?"var(--color-accent-blue)":"var(--color-text-secondary)",opacity:hidden.has(site.id)?1:0.5,transition:"all 0.15s",lineHeight:1}}
                onMouseOver={e=>(e.currentTarget.style.opacity="1")} onMouseOut={e=>{if(!hidden.has(site.id))e.currentTarget.style.opacity="0.5";}}>
                <EyeOff size={13}/>
              </button>
              <button title={isFav ? t("removeFromFavorites") : t("addToFavorites")} onClick={()=>toggleFav(site.id)}
                style={{color:isFav?"var(--color-warning)":"var(--color-text-secondary)",opacity:isFav?1:0.5,transition:"all 0.15s",lineHeight:1}}
                onMouseOver={e=>(e.currentTarget.style.opacity="1")} onMouseOut={e=>{if(!isFav)e.currentTarget.style.opacity="0.5";}}>
                <Star size={13} fill={isFav?"var(--color-warning)":"none"}/>
              </button>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="main-content">
      <style>{`
        @keyframes gsc-spin { to { transform: rotate(360deg); } }
        .period-scroll::-webkit-scrollbar { width: 6px; }
        .period-scroll::-webkit-scrollbar-track { background: var(--color-bg-secondary, #1e2130); border-radius: 3px; }
        .period-scroll::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 3px; }
        .period-scroll::-webkit-scrollbar-thumb:hover { background: var(--color-text-secondary); }
      `}</style>

      {/* ─── Accounts bar ─── */}
      {accounts.length > 0 && (
        <div style={{marginBottom:"10px",padding:"10px 14px",borderRadius:"12px",background:"var(--color-card)",border:"1px solid var(--color-border)",display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
          <span style={{fontSize:"11px",fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap",marginRight:"2px"}}>{t("googleAccountsLabel")}</span>
          <div style={{display:"flex",alignItems:"center",gap:"6px",padding:"4px 12px",borderRadius:"20px",fontSize:"12px",fontWeight:600,cursor:"default",border:"1px solid rgba(59,130,246,0.4)",background:"rgba(59,130,246,0.12)",color:"#3B82F6",whiteSpace:"nowrap"}}>
            Все сайты (<span style={{filter:blur?"blur(5px)":"none",transition:"filter 0.25s"}}>{sites.length}</span>)
          </div>
          {accounts.map(acc => (
            <div key={acc.id} style={{display:"flex",alignItems:"center",gap:"5px",padding:"4px 10px",borderRadius:"20px",fontSize:"12px",background:"var(--color-bg-secondary,rgba(255,255,255,0.04))",border:"1px solid var(--color-border)"}}>
              {acc.picture
                ? <img src={acc.picture} width={14} height={14} alt="" style={{borderRadius:"50%",flexShrink:0,filter:blur?"blur(5px)":"none",transition:"filter 0.25s"}} onError={e=>((e.target as HTMLImageElement).style.display="none")} />
                : <span style={{width:14,height:14,borderRadius:"50%",background:"#4b5563",display:"inline-block",flexShrink:0}}/>
              }
              <span style={{color:"var(--color-text-secondary)",maxWidth:"200px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",filter:blur?"blur(5px)":"none",transition:"filter 0.25s"}}>{acc.email}</span>
            </div>
          ))}
          <a href="/settings" style={{display:"flex",alignItems:"center",gap:"4px",padding:"4px 10px",borderRadius:"20px",fontSize:"12px",fontWeight:500,color:"#3B82F6",border:"1px solid rgba(59,130,246,0.25)",background:"transparent",textDecoration:"none",whiteSpace:"nowrap",cursor:"pointer"}}>
            {t("addGoogleAccount")}
          </a>
        </div>
      )}

      {/* ─── Period quick buttons + Metric text toggles ─── */}
      <div style={{display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap",marginBottom:"8px"}}>
        {/* Quick period buttons */}
        {(["7d","28d","3m","6m","12m","16m"] as string[]).map(p => {
          const active = period === p;
          return (
            <button key={p} onClick={() => setPeriod(p)} style={{padding:"6px 13px",borderRadius:"9999px",fontSize:"12px",fontWeight:active?700:500,cursor:"pointer",border:`1px solid ${active?"var(--color-accent-blue)":"var(--color-border)"}`,background:active?"rgba(0,102,204,0.12)":"var(--color-card)",color:active?"var(--color-accent-blue)":"var(--color-text-secondary)",transition:"all 0.15s",whiteSpace:"nowrap"}}>
              {getPeriodLabel(p)}
            </button>
          );
        })}
        {/* More periods */}
        {PeriodDd}

        <div style={{flex:1,minWidth:"8px"}}/>

        {/* Metric toggles with text labels — same icons as on cards */}
        {([
          {m:"clicks"      as Metric, icon:"✦", label:t("clicks"),      color:"#3B82F6", bg:"rgba(59,130,246,0.12)"},
          {m:"impressions" as Metric, icon:"◉", label:t("impressions"), color:"#8B5CF6", bg:"rgba(139,92,246,0.12)"},
          {m:"ctr"         as Metric, icon:"%", label:"CTR",             color:"#10B981", bg:"rgba(16,185,129,0.12)"},
          {m:"position"    as Metric, icon:"↑", label:t("avgPosition"),  color:"#F59E0B", bg:"rgba(245,158,11,0.12)"},
        ]).map(({m, icon, label, color, bg}) => {
          const active = activeMetrics.has(m);
          return (
            <button key={m} onClick={() => toggleMetric(m)} style={{display:"flex",alignItems:"center",gap:"5px",padding:"6px 13px",borderRadius:"20px",fontSize:"12px",fontWeight:active?700:500,cursor:"pointer",border:`1px solid ${active?color:"var(--color-border)"}`,background:active?bg:"var(--color-card)",color:active?color:"var(--color-text-secondary)",transition:"all 0.15s",whiteSpace:"nowrap"}}>
              <span style={{fontWeight:800,fontSize:"11px",lineHeight:1}}>{icon}</span>
              {label}
            </button>
          );
        })}
      </div>

      {/* ─── Search + Sort + Filter + Sync ─── */}
      <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
        <div style={{position:"relative",flex:"1 1 180px"}}>
          <Search size={14} style={{position:"absolute",left:"10px",top:"50%",transform:"translateY(-50%)",color:"var(--color-text-secondary)"}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("searchSites")}
            style={{width:"100%",padding:"7px 12px 7px 32px",borderRadius:"8px",border:"1px solid var(--color-border)",background:"var(--color-card)",color:"#fff",fontSize:"13px",outline:"none"}}/>
        </div>
        {SortDd}
        {FilterDd}

        {/* ── Manual sync button ── */}
        <button
          onClick={handleSync}
          disabled={syncStatus === "syncing"}
          title={syncedAt ? `Последняя синхронизация: ${syncedAt.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })} ${syncedAt.toLocaleDateString("ru", { day: "numeric", month: "short" })}` : "Синхронизировать данные GSC"}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 500,
            border: "1px solid var(--color-border)",
            background: syncStatus === "done" ? "rgba(16,185,129,0.08)" : syncStatus === "syncing" ? "rgba(59,130,246,0.08)" : (syncStatus === "reauth" || syncStatus === "error") ? "rgba(239,68,68,0.08)" : "var(--color-card)",
            color: syncStatus === "done" ? "#10B981" : syncStatus === "syncing" ? "#60a5fa" : (syncStatus === "reauth" || syncStatus === "error") ? "#EF4444" : "var(--color-text-secondary)",
            cursor: syncStatus === "syncing" ? "not-allowed" : "pointer",
            whiteSpace: "nowrap", transition: "all 0.2s",
          }}
        >
          {syncStatus === "done" ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ) : (syncStatus === "reauth" || syncStatus === "error") ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0, animation: syncStatus === "syncing" ? "gsc-spin 1.2s linear infinite" : "none" }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          )}
          {syncStatus === "syncing" ? "Синхронизация…"
            : syncStatus === "done" ? `Готово · ${syncedAt?.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}`
            : syncStatus === "reauth" ? "Требуется вход"
            : syncStatus === "error" ? "Ошибка синхр."
            : syncedAt ? syncedAt.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })
            : "Sync GSC"}
        </button>
      </div>

      {/* ── Sync warning banner ── */}
      {syncWarning && (
        <div style={{ margin: "8px 0 0", padding: "10px 16px", borderRadius: "10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div style={{ flex: 1 }}>
            {syncWarning === "reauth" ? (
              <>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#EF4444" }}>Синхронизация не выполнена — требуется повторная авторизация Google.</span>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginLeft: "6px" }}>
                  Перейди в <a href="/settings" style={{ color: "#3B82F6", textDecoration: "underline" }}>Настройки</a> и переподключи Google аккаунт.
                </span>
              </>
            ) : (
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#EF4444" }}>Синхронизация завершилась с ошибками. Проверь логи сервера.</span>
            )}
          </div>
          <button onClick={() => setSyncWarning(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", padding: "2px" }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Active filter chips */}
      {(activeFilterCount > 0 || activeTag) && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
          {activeTag && (
            <FilterChip
              label={`🏷 ${activeTag}`}
              onRemove={() => setActiveTag(null)}
            />
          )}
          {branded !== "all" && (
            <FilterChip
              label={branded === "branded" ? `✦ ${t("branded")}` : `◎ ${t("nonBranded")}`}
              onRemove={() => setBranded("all")}
            />
          )}
          {filterDimension && filterText.trim() && (
            <FilterChip
              label={`${filterDimension}: ${filterText.trim()}`}
              onRemove={() => { setFilterDimension(null); setFilterText(""); }}
            />
          )}
        </div>
      )}

      {/* ─── Totals row (respects tag/search filter) ─── */}
      {!loading && visibleForTotals.length > 0 && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"8px",marginTop:"12px"}}>
          {([
            {label:t("totalClicks"),      icon:"✦", color:"#3B82F6", bg:"rgba(59,130,246,0.06)", value: fmtK(totalClicks),          sub: t("fromNSites").replace("{n}", String(visibleForTotals.length))},
            {label:t("totalImpressions"), icon:"◉", color:"#8B5CF6", bg:"rgba(139,92,246,0.06)", value: fmtK(totalImpressions),      sub: t("fromNSites").replace("{n}", String(visibleForTotals.length))},
            {label:t("averageCTR"),       icon:"%", color:"#10B981", bg:"rgba(16,185,129,0.06)", value: `${avgCtr}%`,                sub: withCtr.length > 0 ? t("acrossNSites").replace("{n}", String(withCtr.length)) : t("noData")},
            {label:t("averagePosition"),  icon:"↑", color:"#F59E0B", bg:"rgba(245,158,11,0.06)", value: avgPos > 0 ? String(avgPos) : "—", sub: withPos.length > 0 ? t("acrossNSites").replace("{n}", String(withPos.length)) : t("noData")},
          ]).map(({label, icon, color, bg, value, sub}) => (
            <div key={label} style={{padding:"12px 16px",borderRadius:"12px",background:"var(--color-card)",border:"1px solid var(--color-border)"}}>
              <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"6px"}}>
                <span style={{fontWeight:800,fontSize:"12px",color,lineHeight:1}}>{icon}</span>
                <span style={{fontSize:"11px",color:"var(--color-text-secondary)",fontWeight:500}}>{label}</span>
              </div>
              <div style={{fontSize:"22px",fontWeight:700,color:"var(--color-text-primary)",lineHeight:1,letterSpacing:"-0.5px",filter:blur?"blur(6px)":"none",transition:"filter 0.25s"}}>{value}</div>
              <div style={{fontSize:"11px",color:"var(--color-text-secondary)",marginTop:"4px",filter:blur?"blur(5px)":"none",transition:"filter 0.25s"}}>{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div style={{textAlign:"center",color:"var(--color-text-secondary)",padding:"80px 0",fontSize:"14px"}}>{t("loadingSites")}</div>
      ) : sites.length===0 ? (
        <div style={{textAlign:"center",color:"var(--color-text-secondary)",padding:"80px 0",fontSize:"14px"}}>
          {t("noSitesYet")} <a href="/settings" style={{color:"var(--color-accent-purple)"}}>{t("connectGoogleAccount")}</a>
        </div>
      ) : (
        <>
          {favSites.length>0 && (
            <section>
              <div style={{fontSize:"11px",color:"var(--color-text-secondary)",fontWeight:600,marginBottom:"12px",textTransform:"uppercase",letterSpacing:"0.07em"}}>⭐ {t("favoritesSection")} (<span style={{filter:blur?"blur(4px)":"none",transition:"filter 0.25s"}}>{favSites.length}</span>)</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:"12px"}}>
                {favSites.map((s,i)=><SiteCard key={s.id||i} site={s}/>)}
              </div>
            </section>
          )}
          <section>
            <div style={{fontSize:"11px",color:"var(--color-text-secondary)",fontWeight:600,marginBottom:"12px",textTransform:"uppercase",letterSpacing:"0.07em"}}>{t("allSitesSection")} (<span style={{filter:blur?"blur(4px)":"none",transition:"filter 0.25s"}}>{restSites.length}</span>)</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:"12px"}}>
              {restSites.map((s,i)=><SiteCard key={s.id||i} site={s}/>)}
            </div>
          </section>

          {hiddenSites.length>0 && (
            <section>
              <div style={{fontSize:"11px",color:"var(--color-text-secondary)",fontWeight:600,marginBottom:"12px",textTransform:"uppercase",letterSpacing:"0.07em",opacity:0.6}}>🙈 {t("hiddenSection")} ({hiddenSites.length})</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:"12px",opacity:0.5}}>
                {hiddenSites.map((s,i)=><SiteCard key={s.id||i} site={s}/>)}
              </div>
            </section>
          )}
        </>
      )}

      {/* Export modal */}
      {exportSite && <ExportModal domain={exportSite} onClose={()=>setExportSite(null)} />}
    </div>
  );
}
