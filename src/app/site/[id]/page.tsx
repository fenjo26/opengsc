"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import ContentDecayMap from "@/components/ContentDecayMap";
import KeywordCannibalization from "@/components/KeywordCannibalization";
import StrikingDistanceKeywords from "@/components/StrikingDistanceKeywords";
import SiteSettingsTab from "@/components/SiteSettingsTab";
import CtrBenchmark from "@/components/CtrBenchmark";
import { SiteHealthPanel } from "@/components/SiteHealthPanel";
import { useParams, useRouter } from "next/navigation";
import { usePrivacy } from "@/lib/PrivacyContext";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import {
  ArrowLeft, Sparkles, Eye, Percent, MoveUp,
  SlidersHorizontal, ChevronDown, Smartphone, Monitor, Tablet,
  Users, Activity, Zap, DollarSign, Link2, Check,
  FileText, Globe, Search, ArrowLeftRight, BookmarkCheck, Calendar, X,
} from "lucide-react";
import {
  ComposedChart, LineChart, AreaChart, Area, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
type Metric = "clicks" | "impressions" | "ctr" | "position";

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  clicks:      "#3B82F6",
  impressions: "#8B5CF6",
  ctr:         "#10B981",
  position:    "#F59E0B",
};

// ─── Period options (module-level so all sub-components can reference) ────────
const PERIOD_OPTIONS: { key: string; label: string }[] = [
  { key: "yesterday",    label: "1 day (latest)" },
  { key: "7d",           label: "7 days"         },
  { key: "14d",          label: "14 days"         },
  { key: "28d",          label: "28 days"        },
  { key: "last_week",    label: "Last Week"      },
  { key: "this_month",   label: "This Month"     },
  { key: "last_month",   label: "Last Month"     },
  { key: "this_quarter", label: "This Quarter"   },
  { key: "last_quarter", label: "Last Quarter"   },
  { key: "ytd",          label: "Year to Date"   },
  { key: "3m",           label: "3 months"       },
  { key: "6m",           label: "6 months"       },
  { key: "8m",           label: "8 months"       },
  { key: "12m",          label: "12 months"      },
  { key: "16m",          label: "16 months"      },
  { key: "2y",           label: "2 years"        },
  { key: "3y",           label: "3 years"        },
];

const PERIOD_GROUPS = [
  ["7d", "14d", "28d", "last_week", "this_month", "last_month"],
  ["this_quarter", "last_quarter", "ytd", "3m", "6m", "8m", "12m", "16m"],
  ["2y", "3y"],
];

// ─── Known Google algorithm updates ──────────────────────────────────────────
const GOOGLE_UPDATES: { date: string; label: string; color: string }[] = [
  { date: "2023-10-05", label: "Oct 2023 Core",         color: "#F59E0B" },
  { date: "2023-11-02", label: "Nov 2023 Core",         color: "#F59E0B" },
  { date: "2024-03-05", label: "Mar 2024 Core",         color: "#EF4444" },
  { date: "2024-06-20", label: "Jun 2024 Core",         color: "#F59E0B" },
  { date: "2024-08-15", label: "Aug 2024 Core",         color: "#F59E0B" },
  { date: "2024-11-11", label: "Nov 2024 Core",         color: "#F59E0B" },
  { date: "2025-03-13", label: "Mar 2025 Core",         color: "#EF4444" },
  { date: "2025-06-30", label: "Jun 2025 Core",         color: "#F59E0B" },
];

// ─── Country code helpers (GSC returns ISO 3166-1 alpha-3 codes) ──────────────
const ISO3_TO_ISO2: Record<string, string> = {
  grc:"gr", usa:"us", cyp:"cy", tur:"tr", mkd:"mk", swe:"se", ita:"it",
  srb:"rs", irl:"ie", gbr:"gb", deu:"de", fra:"fr", esp:"es", pol:"pl",
  rou:"ro", nld:"nl", bel:"be", aut:"at", che:"ch", prt:"pt", nor:"no",
  dnk:"dk", fin:"fi", cze:"cz", hun:"hu", bgr:"bg", hrv:"hr", svk:"sk",
  svn:"si", alb:"al", bih:"ba", mne:"me", mda:"md", ltu:"lt", lva:"lv",
  est:"ee", rus:"ru", ukr:"ua", blr:"by", geo:"ge", arm:"am", aze:"az",
  aus:"au", can:"ca", bra:"br", arg:"ar", mex:"mx", chn:"cn", jpn:"jp",
  kor:"kr", ind:"in", idn:"id", pak:"pk", sau:"sa", are:"ae", isr:"il",
  egy:"eg", zaf:"za", nga:"ng", ken:"ke", mar:"ma", col:"co", chl:"cl",
  per:"pe", tha:"th", vnm:"vn", phl:"ph", mys:"my", sgp:"sg", nzl:"nz",
  irn:"ir", irq:"iq", lbn:"lb", jor:"jo", kwt:"kw", qat:"qa", bhr:"bh",
  omn:"om", dza:"dz", tun:"tn", lby:"ly", sdn:"sd", eth:"et", tza:"tz",
  uga:"ug", gha:"gh", cmr:"cm", ven:"ve", ecu:"ec", ury:"uy", pry:"py",
  bol:"bo", gtm:"gt", cri:"cr", pan:"pa", dom:"do", cub:"cu", hti:"ht",
  twn:"tw", hkg:"hk", lka:"lk", bgd:"bd", npl:"np", mmr:"mm", khm:"kh",
  lao:"la", mnl:"ph", uzb:"uz", kaz:"kz", tkm:"tm", tad:"tj", kgz:"kg",
  afg:"af", pse:"ps", yem:"ye", syr:"sy",
};

const ISO3_NAMES: Record<string, string> = {
  grc:"Greece", usa:"United States", cyp:"Cyprus", tur:"Türkiye",
  mkd:"North Macedonia", swe:"Sweden", ita:"Italy", srb:"Serbia",
  irl:"Ireland", gbr:"United Kingdom", deu:"Germany", fra:"France",
  esp:"Spain", pol:"Poland", rou:"Romania", nld:"Netherlands",
  bel:"Belgium", aut:"Austria", che:"Switzerland", prt:"Portugal",
  nor:"Norway", dnk:"Denmark", fin:"Finland", cze:"Czech Republic",
  hun:"Hungary", bgr:"Bulgaria", hrv:"Croatia", svk:"Slovakia",
  svn:"Slovenia", alb:"Albania", bih:"Bosnia", mne:"Montenegro",
  mda:"Moldova", ltu:"Lithuania", lva:"Latvia", est:"Estonia",
  rus:"Russia", ukr:"Ukraine", blr:"Belarus", geo:"Georgia",
  arm:"Armenia", aze:"Azerbaijan", aus:"Australia", can:"Canada",
  bra:"Brazil", arg:"Argentina", mex:"Mexico", chn:"China",
  jpn:"Japan", kor:"South Korea", ind:"India", idn:"Indonesia",
  pak:"Pakistan", sau:"Saudi Arabia", are:"UAE", isr:"Israel",
  egy:"Egypt", zaf:"South Africa", nga:"Nigeria", ken:"Kenya",
  mar:"Morocco", col:"Colombia", chl:"Chile", per:"Peru",
  tha:"Thailand", vnm:"Vietnam", phl:"Philippines", mys:"Malaysia",
  sgp:"Singapore", nzl:"New Zealand", irn:"Iran", irq:"Iraq",
  lbn:"Lebanon", jor:"Jordan", kwt:"Kuwait", qat:"Qatar",
  dza:"Algeria", tun:"Tunisia", ven:"Venezuela",
};

function iso3ToFlag(code: string): string {
  const iso2 = ISO3_TO_ISO2[code.toLowerCase()];
  if (!iso2) return "🌐";
  return [...iso2.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
}

function iso3ToName(code: string): string {
  return ISO3_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

// ─── Mock data ────────────────────────────────────────────────────────────────
function rnd(lo: number, hi: number) { return lo + Math.random() * (hi - lo); }
function rndInt(lo: number, hi: number) { return Math.round(rnd(lo, hi)); }

function makeChartData(days = 7) {
  const today = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - days + i);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const clicks = rndInt(5, 30);
    const impr   = rndInt(100, 500);
    return {
      date: label,
      clicks, impressions: impr,
      ctr:      +((clicks / impr) * 100).toFixed(1),
      position: +rnd(4, 20).toFixed(1),
      clicksC:      rndInt(3, 25),
      impressionsC: rndInt(80, 400),
      ctrC:      +rnd(2, 12).toFixed(1),
      positionC: +rnd(5, 22).toFixed(1),
    };
  });
}

const QUERIES = [
  "μασαζ στο σπιτι θεσσαλονικη","λεμφικο μασαζ θεσσαλονικη","μασαζ κατοικον θεσσαλονίκη",
  "erotic massage thessaloniki","μασαζ κατοικον θεσσαλονικη","relaxing massage thessaloniki",
  "therapeutic massage","thai massage thessaloniki","deep tissue massage","sports massage greece",
];
const PAGES = [
  "/masaz-kat-oikon-thessaloniki/","/en/massage-thessaloniki/",
  "/masaz-sto-spiti-thessaloniki-kat-oikon-therapeia/","/",
  "/to-kalytero-lemfiko-masaz-thessaloniki/","/sports-massage/",
  "/thai-massage/","/deep-tissue-massage/",
];
const COUNTRIES = [
  { name: "Greece", flag: "🇬🇷" },{ name: "Cyprus", flag: "🇨🇾" },
  { name: "Türkiye", flag: "🇹🇷" },{ name: "North Macedonia", flag: "🇲🇰" },
  { name: "Sweden", flag: "🇸🇪" },{ name: "Italy", flag: "🇮🇹" },
  { name: "Serbia", flag: "🇷🇸" },{ name: "Ireland", flag: "🇮🇪" },
];

function makeRows(labels: string[], baseClicks: number) {
  return labels.map((label, i) => {
    const clicks = Math.max(0, Math.round(baseClicks * Math.exp(-i * 0.3) * (0.7 + Math.random() * 0.6)));
    const impr   = clicks * rndInt(5, 25);
    const ctr    = impr > 0 ? +((clicks / impr) * 100).toFixed(1) : 0;
    const pos    = +rnd(1, 30).toFixed(1);
    const cPct   = rndInt(-20, 300);
    const iPct   = rndInt(-10, 200);
    return { label, clicks, impr, ctr, pos, cPct, iPct };
  });
}

function makeCountryRows() {
  return COUNTRIES.map(({ name, flag }, i) => {
    const clicks = Math.max(0, rndInt(1, 130) * Math.exp(-i * 0.3) | 0);
    const impr   = clicks * rndInt(8, 20);
    const ctr    = impr > 0 ? +((clicks / impr) * 100).toFixed(1) : 0;
    const pos    = +rnd(4, 25).toFixed(1);
    return { name, flag, clicks, impr, ctr, pos, cPct: rndInt(0, 200), iPct: rndInt(10, 400) };
  });
}

// ─── Shared components ────────────────────────────────────────────────────────
function Change({ pct, invert = false }: { pct: number; invert?: boolean }) {
  const good = invert ? pct <= 0 : pct >= 0;
  const color = good ? "#10B981" : "#EF4444";
  const sign = pct >= 0 ? "+" : "";
  return (
    <span style={{ fontSize: "11px", color, fontWeight: 500, marginLeft: "3px" }}>
      {sign}{pct}%
    </span>
  );
}

function fmtK(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }

// Tab values are always English internally; TabBar translates display labels
function TabBar({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  const { t } = useLanguage();
  const labelMap: Record<string, string> = {
    "All":        t("tabAll"),
    "Growing":    t("tabGrowing"),
    "Decaying":   t("tabDecaying"),
    "Trend":      t("tabTrend"),
    "Comparison": t("tabComparison"),
    "Total":      t("tabTotal"),
    "By Ranking": t("tabByRanking"),
    "Queries":    t("queriesTable"),
    "Pages":      t("pagesTable"),
  };
  return (
    <div style={{ display: "flex", gap: "2px", background: "var(--color-card)", borderRadius: "8px", padding: "3px", border: "1px solid var(--color-border)" }}>
      {tabs.map(tab => (
        <button key={tab} onClick={() => onChange(tab)} style={{
          padding: "4px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500, cursor: "pointer",
          background: active === tab ? "var(--color-bg)" : "transparent",
          color: active === tab ? "var(--color-text-primary)" : "var(--color-text-secondary)",
          border: "none", boxShadow: active === tab ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
          transition: "all 0.15s",
        }}>{labelMap[tab] ?? tab}</button>
      ))}
    </div>
  );
}

function DataTable({ title, rows, tabs, blur = false }: {
  title: string;
  rows: { label: string; clicks: number; impr: number; ctr: number; pos: number; cPct: number; iPct: number }[];
  tabs?: string[];
  blur?: boolean;
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState("All");
  const sorted = tab === "Growing"
    ? [...rows].sort((a, b) => b.cPct - a.cPct)
    : tab === "Decaying"
    ? [...rows].sort((a, b) => a.cPct - b.cPct)
    : rows;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>{title}</h3>
        {tabs && <TabBar tabs={tabs} active={tab} onChange={setTab} />}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
            {/* first column: label (no header text) */}
            <th style={{ textAlign: "left", padding: "8px 0", color: "var(--color-text-secondary)", fontWeight: 500 }}></th>
            <th style={{ textAlign: "left", padding: "8px 8px", color: C.clicks, fontWeight: 600 }}>{t("clicks")}</th>
            <th style={{ textAlign: "left", padding: "8px 8px", color: C.impressions, fontWeight: 600 }}>{t("impressions")}</th>
            <th style={{ textAlign: "left", padding: "8px 8px", color: C.ctr, fontWeight: 600 }}>CTR</th>
            <th style={{ textAlign: "left", padding: "8px 0", color: C.position, fontWeight: 600 }}>{t("position")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 8).map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--color-border)", background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}>
              <td style={{ padding: "8px 8px 8px 0", color: "var(--color-text-primary)", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={blur ? { filter: "blur(5px)", userSelect: "none", transition: "filter 0.25s", display: "inline-block" } : { transition: "filter 0.25s" }}>
                  {r.label}
                </span>
              </td>
              <td style={{ padding: "8px 8px", color: "var(--color-text-primary)", fontWeight: 500 }}>
                {r.clicks}<Change pct={r.cPct} />
              </td>
              <td style={{ padding: "8px 8px", color: "var(--color-text-secondary)" }}>{fmtK(r.impr)}<Change pct={r.iPct} /></td>
              <td style={{ padding: "8px 8px", color: "var(--color-text-secondary)" }}>{r.ctr}%</td>
              <td style={{ padding: "8px 0", color: "var(--color-text-secondary)" }}>{r.pos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type CountryRow = { name: string; flag?: string; clicks: number; impr: number; ctr: number; pos: number; cPct: number; iPct: number };
function CountryTable({ rows }: { rows: CountryRow[] }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState("All");
  const sorted = tab === "Growing" ? [...rows].sort((a, b) => b.cPct - a.cPct)
    : tab === "Decaying" ? [...rows].sort((a, b) => a.cPct - b.cPct) : rows;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("countries")}</h3>
        <TabBar tabs={["All", "Growing", "Decaying"]} active={tab} onChange={setTab} />
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
            <th style={{ textAlign: "left", padding: "8px 0", color: "var(--color-text-secondary)", fontWeight: 500 }}></th>
            <th style={{ textAlign: "left", padding: "8px 8px", color: C.clicks, fontWeight: 600 }}>{t("clicks")}</th>
            <th style={{ textAlign: "left", padding: "8px 8px", color: C.impressions, fontWeight: 600 }}>{t("impressions")}</th>
            <th style={{ textAlign: "left", padding: "8px 8px", color: C.ctr, fontWeight: 600 }}>CTR</th>
            <th style={{ textAlign: "left", padding: "8px 0", color: C.position, fontWeight: 600 }}>{t("position")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            // Support both pre-resolved (flag + name) and raw GSC ISO-3 codes
            const flag = r.flag || iso3ToFlag(r.name);
            const label = r.flag ? r.name : iso3ToName(r.name);
            return (
              <tr key={i} style={{ borderBottom: "1px solid var(--color-border)", background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}>
                <td style={{ padding: "8px 8px 8px 0", color: "var(--color-text-primary)" }}>{flag} {label}</td>
                <td style={{ padding: "8px 8px", fontWeight: 500, color: "var(--color-text-primary)" }}>{r.clicks}<Change pct={r.cPct} /></td>
                <td style={{ padding: "8px 8px", color: "var(--color-text-secondary)" }}>{fmtK(r.impr)}<Change pct={r.iPct} /></td>
                <td style={{ padding: "8px 8px", color: "var(--color-text-secondary)" }}>{r.ctr}%</td>
                <td style={{ padding: "8px 0", color: "var(--color-text-secondary)" }}>{r.pos}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type DeviceRow = { name: string; clicks: number; impr: number; ctr: number; pos: number; cPct: number; iPct: number; ctrPct: number; posDelta: number };
function DeviceTable({ rows }: { rows: DeviceRow[] }) {
  const { t } = useLanguage();
  const iconFor = (name: string) => {
    const n = name.toLowerCase();
    if (n === "mobile")  return <Smartphone size={14} />;
    if (n === "tablet")  return <Tablet size={14} />;
    return <Monitor size={14} />;
  };
  const labelFor = (name: string) => {
    const n = name.toLowerCase();
    if (n === "mobile")  return t("deviceMobile");
    if (n === "tablet")  return t("deviceTablet");
    if (n === "desktop") return t("deviceDesktop");
    return name;
  };
  const devices = rows.length > 0 ? rows : [];
  const [tab, setTab] = useState("All");
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("devices")}</h3>
        <TabBar tabs={["All", "Growing", "Decaying"]} active={tab} onChange={setTab} />
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
            <th style={{ textAlign: "left", padding: "8px 0", color: "var(--color-text-secondary)", fontWeight: 500 }}></th>
            <th style={{ textAlign: "left", padding: "8px 8px", color: C.clicks, fontWeight: 600 }}>{t("clicks")}</th>
            <th style={{ textAlign: "left", padding: "8px 8px", color: C.impressions, fontWeight: 600 }}>{t("impressions")}</th>
            <th style={{ textAlign: "left", padding: "8px 8px", color: C.ctr, fontWeight: 600 }}>CTR</th>
            <th style={{ textAlign: "left", padding: "8px 0", color: C.position, fontWeight: 600 }}>{t("position")}</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--color-border)", background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}>
              <td style={{ padding: "8px 8px 8px 0", display: "flex", alignItems: "center", gap: "6px", color: "var(--color-text-primary)" }}>
                {iconFor(d.name)} {labelFor(d.name)}
              </td>
              <td style={{ padding: "8px 8px", fontWeight: 500, color: "var(--color-text-primary)" }}>{d.clicks}<Change pct={d.cPct} /></td>
              <td style={{ padding: "8px 8px", color: "var(--color-text-secondary)" }}>{fmtK(d.impr)}<Change pct={d.iPct} /></td>
              <td style={{ padding: "8px 8px", color: "var(--color-text-secondary)" }}>{d.ctr}%<Change pct={d.ctrPct} /></td>
              <td style={{ padding: "8px 0", color: "var(--color-text-secondary)" }}>{d.pos}<Change pct={d.posDelta} invert /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Placeholder({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick?: () => void }) {
  return (
    <div style={{ border: "1px dashed var(--color-border)", borderRadius: "12px", padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", background: "var(--color-card)" }}>
      <div style={{ color: "var(--color-text-secondary)" }}>{icon}</div>
      <p style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: "14px" }}>{title}</p>
      <p style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
        <span style={{ color: "#3B82F6", cursor: onClick ? "pointer" : "default" }} onClick={onClick}>{desc}</span>
      </p>
    </div>
  );
}

// ─── Cluster Table ────────────────────────────────────────────────────────────
type ClusterRow = {
  id: string; name: string;
  clicks: number; impressions: number; ctr: number; position: number;
  clicksChange: number; impressionsChange: number; ctrChange: number; positionChange: number;
};

function ClusterTable({ title, data, blur = false }: { title: string; data: ClusterRow[]; blur?: boolean }) {
  const [tab, setTab]     = useState<'All' | 'Growing' | 'Decaying'>('All');
  const [sortBy, setSortBy] = useState<'clicks' | 'impressions' | 'ctr' | 'position'>('clicks');
  const blurStyle: React.CSSProperties = blur ? { filter: 'blur(6px)', userSelect: 'none' } : {};

  const visible = data
    .filter(r => tab === 'All' || (tab === 'Growing' ? r.clicksChange > 0 : r.clicksChange < 0))
    .sort((a, b) => {
      if (sortBy === 'position') return a.position - b.position;
      return (b as any)[sortBy] - (a as any)[sortBy];
    });

  const fmtN = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const badge = (chg: number, invert = false) => {
    if (chg === 0) return null;
    const good = invert ? chg < 0 : chg > 0;
    return (
      <span style={{ fontSize: '10px', fontWeight: 600, color: good ? '#10B981' : '#EF4444', marginLeft: '4px' }}>
        {chg > 0 ? '↑' : '↓'}{Math.abs(chg)}%
      </span>
    );
  };

  const th = (label: string, key: typeof sortBy) => (
    <th
      onClick={() => setSortBy(key)}
      style={{ padding: '6px 8px', fontSize: '11px', fontWeight: 600, color: sortBy === key ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'right', userSelect: 'none' }}
    >
      <span style={{ color: sortBy === key ? '#3B82F6' : undefined }}>{label}</span>
    </th>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{title}</h3>
        <div style={{ display: 'flex', gap: '2px', background: 'var(--color-bg)', borderRadius: '8px', padding: '2px', border: '1px solid var(--color-border)' }}>
          {(['All', 'Growing', 'Decaying'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '3px 10px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 500, cursor: 'pointer', background: tab === t ? 'var(--color-card)' : 'transparent', color: tab === t ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', borderRadius: '10px' }}>No data</div>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Name</th>
                {th('Clicks', 'clicks')}
                {th('Impressions', 'impressions')}
                {th('CTR', 'ctr')}
                {th('Position', 'position')}
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--color-border)', background: i % 2 === 0 ? 'var(--color-card)' : 'var(--color-bg)' }}>
                  <td style={{ padding: '7px 10px', fontSize: '12px', fontWeight: 500, color: 'var(--color-text-primary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...blurStyle }}>{r.name}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: '12px', color: 'var(--color-text-primary)', ...blurStyle }}>{fmtN(r.clicks)}{badge(r.clicksChange)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: '12px', color: 'var(--color-text-secondary)', ...blurStyle }}>{fmtN(r.impressions)}{badge(r.impressionsChange)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: '12px', color: 'var(--color-text-secondary)', ...blurStyle }}>{r.ctr}%{badge(r.ctrChange)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: '12px', color: 'var(--color-text-secondary)', ...blurStyle }}>{r.position || '—'}{badge(r.positionChange, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── One-Click Setup Modal ────────────────────────────────────────────────────
type SetupItem = { name: string; rules: string; count: number; selected: boolean; editingName?: boolean };

// ─── Editable item card (cluster or group) ────────────────────────────────────
function SetupCard({ item, index, onToggle, onRename, onDelete, onPatternChange, ruleType }: {
  item: SetupItem; index: number;
  onToggle: () => void; onRename: (name: string) => void;
  onDelete: () => void; onPatternChange: (val: string) => void;
  ruleType: 'cluster' | 'group';
}) {
  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal]   = useState(item.name);

  let patterns: string[] = [];
  let patternType = 'contains';
  try { const r = JSON.parse(item.rules); patterns = r[0]?.values ?? []; patternType = r[0]?.type ?? 'contains'; } catch {}
  const patternStr = patterns.join(' | ');

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', padding: '12px 14px', background: item.selected ? 'var(--color-bg)' : 'transparent', opacity: item.selected ? 1 : 0.55, transition: 'opacity 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <input type="checkbox" checked={item.selected} onChange={onToggle} style={{ accentColor: '#3B82F6', width: '15px', height: '15px', flexShrink: 0 }} />
        {editName ? (
          <input
            autoFocus value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={() => { onRename(nameVal || item.name); setEditName(false); }}
            onKeyDown={e => { if (e.key === 'Enter') { onRename(nameVal || item.name); setEditName(false); } if (e.key === 'Escape') setEditName(false); }}
            style={{ flex: 1, fontSize: '13px', fontWeight: 600, border: '1px solid #3B82F6', borderRadius: '6px', padding: '2px 8px', background: 'var(--color-card)', color: 'var(--color-text-primary)', outline: 'none' }}
          />
        ) : (
          <span
            onClick={() => { setEditName(true); setNameVal(item.name); }}
            title="Click to edit name"
            style={{ fontSize: '13px', fontWeight: 600, cursor: 'text', flex: 1, borderBottom: '1px dashed transparent' }}
            onMouseEnter={e => (e.currentTarget.style.borderBottomColor = 'var(--color-text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
          >
            {item.name}
          </span>
        )}
        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{item.count} {ruleType === 'cluster' ? 'queries' : 'pages'}</span>
        <button onClick={onDelete} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: '2px', display: 'flex', opacity: 0.6, flexShrink: 0 }}>
          <X size={13} />
        </button>
      </div>
      <div style={{ paddingLeft: '23px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{patternType}: </span>
        <input
          value={patternStr}
          onChange={e => onPatternChange(e.target.value)}
          placeholder={ruleType === 'cluster' ? 'keyword1 | keyword2 | keyword3' : '/url-path | /other-path'}
          style={{ fontSize: '11px', color: 'var(--color-text-secondary)', background: 'transparent', border: 'none', outline: 'none', width: 'calc(100% - 70px)', cursor: 'text', fontFamily: 'monospace' }}
        />
      </div>
    </div>
  );
}

function makeEmptyCluster(): SetupItem {
  return { name: 'New Cluster', rules: JSON.stringify([{ type: 'contains', values: [] }]), count: 0, selected: true };
}
function makeEmptyGroup(): SetupItem {
  return { name: 'New Group', rules: JSON.stringify([{ type: 'contains', values: [] }]), count: 0, selected: true };
}

function updateRules(item: SetupItem, patternStr: string): SetupItem {
  const values = patternStr.split('|').map(s => s.trim()).filter(Boolean);
  try {
    const r = JSON.parse(item.rules);
    r[0].values = values;
    return { ...item, rules: JSON.stringify(r) };
  } catch {
    return { ...item, rules: JSON.stringify([{ type: 'contains', values }]) };
  }
}

// ─── Branded Chart ────────────────────────────────────────────────────────────
function BrandedChart({ siteDbId, period, keywords }: { siteDbId: string; period: string; keywords: string[] }) {
  const [tab, setTab] = useState<'Trend' | 'Comparison'>('Trend');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!siteDbId) return;
    setLoading(true);
    fetch(`/api/gsc/branded-report?siteId=${siteDbId}&period=${period}`)
      .then(r => r.json())
      .then(d => setRows(d.rows ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [siteDbId, period]);

  const fmt = (d: string) => { const dt = new Date(d); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };

  const totalBranded = rows.reduce((s, r) => s + r.branded, 0);
  const totalNon = rows.reduce((s, r) => s + r.nonBranded, 0);
  const total = totalBranded + totalNon;
  const brandedPct = total > 0 ? Math.round((totalBranded / total) * 100) : 0;

  if (loading) return <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>Загрузка данных GSC…</div>;

  if (rows.length === 0) return (
    <div style={{ border: '1px dashed var(--color-border)', borderRadius: 12, padding: '32px 24px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
      Нет данных за этот период.<br/>Ключи: {keywords.join(', ')}
    </div>
  );

  const chartData = rows.map(r => ({ date: fmt(r.date), branded: r.branded, nonBranded: r.nonBranded }));

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '16px', background: 'var(--color-card)' }}>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          <span style={{ color: '#818cf8', fontWeight: 700 }}>{totalBranded.toLocaleString()}</span> брендовых кликов ({brandedPct}%)
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          <span style={{ color: '#10b981', fontWeight: 700 }}>{totalNon.toLocaleString()}</span> небрендовых ({100 - brandedPct}%)
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {(['Trend', 'Comparison'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: `1px solid ${tab === t ? '#3B82F6' : 'var(--color-border)'}`, background: tab === t ? 'rgba(59,130,246,0.1)' : 'transparent', color: tab === t ? '#3B82F6' : 'var(--color-text-secondary)' }}>{t}</button>
        ))}
      </div>

      {tab === 'Trend' ? (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} width={32} />
            <Tooltip formatter={(v: any, name: any) => [v, name === 'branded' ? 'Брендовые' : 'Небрендовые']} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="branded" stroke="#818cf8" strokeWidth={2} dot={false} name="branded" />
            <Line type="monotone" dataKey="nonBranded" stroke="#10b981" strokeWidth={2} dot={false} name="nonBranded" />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={[{ name: 'Клики', branded: totalBranded, nonBranded: totalNon }]} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip formatter={(v: any, name: any) => [v.toLocaleString(), name === 'branded' ? 'Брендовые' : 'Небрендовые']} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="branded" fill="#818cf8" name="branded" radius={[4,4,0,0]} />
            <Bar dataKey="nonBranded" fill="#10b981" name="nonBranded" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Branded Keywords Modal ───────────────────────────────────────────────────
function BrandedKeywordsModal({ siteDbId, domain, initial, onClose, onSaved }: {
  siteDbId: string; domain: string; initial: string[];
  onClose: () => void; onSaved: (kws: string[]) => void;
}) {
  const { t } = useLanguage();
  const [keywords, setKeywords] = useState<string[]>(initial.length > 0 ? initial : [domain.split('.')[0].toLowerCase()]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  const addKeyword = (kw: string) => {
    const clean = kw.trim().toLowerCase();
    if (clean && !keywords.includes(clean)) setKeywords(p => [...p, clean]);
    setInput('');
  };

  const removeKeyword = (kw: string) => setKeywords(p => p.filter(k => k !== kw));

  const suggestWithAI = async () => {
    setLoading(true);
    const provider = localStorage.getItem('aiProvider') || 'anthropic';
    const apiKey = localStorage.getItem(`aiKey_${provider}`) || localStorage.getItem('aiApiKey') || '';
    try {
      const res = await fetch(`/api/gsc/branded?siteId=${siteDbId}&suggest=1&aiProvider=${encodeURIComponent(provider)}&aiApiKey=${encodeURIComponent(apiKey)}`);
      const data = await res.json();
      if (data.branded?.length) {
        setKeywords(data.branded);
        setAiGenerated(!!data.aiGenerated);
      }
    } catch {}
    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    await fetch('/api/gsc/branded', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: siteDbId, keywords }),
    });
    setSaving(false);
    onSaved(keywords);
  };

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
  const box: React.CSSProperties = { background: 'var(--color-card)', borderRadius: '16px', width: '480px', maxWidth: '95vw', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid var(--color-border)' };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            🏷️ {t('setBrandedKw')}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          {t('setBrandedDesc3')}
        </p>

        {/* AI suggest button */}
        <button onClick={suggestWithAI} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', cursor: loading ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 600, width: 'fit-content' }}>
          <span>✨</span>
          {loading ? 'Анализирую запросы...' : 'Предложить ИИ'}
        </button>
        {aiGenerated && <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '-12px' }}>✓ Сгенерировано ИИ — проверьте и отредактируйте при необходимости</p>}

        {/* Keyword chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '40px' }}>
          {keywords.map(kw => (
            <span key={kw} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', padding: '4px 12px', borderRadius: '20px', background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
              {kw}
              <button onClick={() => removeKeyword(kw)} style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '0 0 0 2px' }}>×</button>
            </span>
          ))}
        </div>

        {/* Manual input */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(input); } }}
            placeholder={t('setEnterKw')}
            style={{ flex: 1, padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)', fontSize: '13px' }}
          />
          <button onClick={() => addKeyword(input)} style={{ padding: '9px 16px', borderRadius: '8px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', color: '#3B82F6', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>{t('setAdd')}</button>
        </div>

        {/* Save */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '10px', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '13px' }}>Отмена</button>
          <button onClick={save} disabled={saving || keywords.length === 0} style={{ padding: '10px 24px', borderRadius: '10px', background: '#3B82F6', border: 'none', color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 600 }}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SetupModal({ domain, siteDbId, onClose, onApplied }: {
  domain: string; siteDbId: string;
  onClose: () => void; onApplied: () => void;
}) {
  const { t } = useLanguage();
  const [step, setStep]         = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading]   = useState(false);
  const [clusters, setClusters] = useState<SetupItem[]>([]);
  const [groups, setGroups]     = useState<SetupItem[]>([]);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [aiUsed, setAiUsed]     = useState(false);

  const [aiProvider, setAiProvider] = useState<string>('anthropic');
  const [aiApiKey, setAiApiKey] = useState<string>('');
  const [providerStatuses, setProviderStatuses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const provider = localStorage.getItem('aiProvider') || 'anthropic';
    const key = localStorage.getItem('aiApiKey') || '';
    setAiProvider(provider);
    setAiApiKey(key);

    // Check all provider keys
    const statuses: Record<string, boolean> = {};
    for (const id of ['anthropic','openai','gemini','openrouter','zai']) {
      const k = localStorage.getItem(`aiKey_${id}`) || '';
      statuses[id] = k.trim().length > 6;
    }
    // Also check the legacy key
    if (key.trim().length > 6) statuses[provider] = true;
    setProviderStatuses(statuses);
  }, []);

  const generate = async () => {
    setStep(2); setLoading(true); setError('');
    // Resolve the key: prefer per-provider key, fall back to legacy key
    const resolvedKey = localStorage.getItem(`aiKey_${aiProvider}`) || aiApiKey;
    try {
      const res = await fetch('/api/gsc/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: siteDbId, aiProvider, aiApiKey: resolvedKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setClusters((data.clusters ?? []).map((c: any) => ({ ...c, selected: true })));
      setGroups((data.groups ?? []).map((g: any) => ({ ...g, selected: true })));
      setAiUsed(data.clusters?.[0]?.aiGenerated ?? false);
      setStep(3);
    } catch (e: any) { setError(e.message); setStep(1); }
    finally { setLoading(false); }
  };

  const apply = async () => {
    setSaving(true);
    try {
      await Promise.all([
        fetch('/api/gsc/clusters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId: siteDbId, clusters: clusters.filter(c => c.selected) }) }),
        fetch('/api/gsc/groups',   { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId: siteDbId, groups: groups.filter(g => g.selected) }) }),
      ]);
      onApplied();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const updCluster = (i: number, fn: (x: SetupItem) => SetupItem) => setClusters(p => p.map((x, j) => j === i ? fn(x) : x));
  const updGroup   = (i: number, fn: (x: SetupItem) => SetupItem) => setGroups(p => p.map((x, j) => j === i ? fn(x) : x));

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const modal: React.CSSProperties   = { background: 'var(--color-card)', borderRadius: '16px', width: '740px', maxWidth: '95vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.35)', border: '1.5px solid rgba(59,130,246,0.35)' };

  const stepTitle = ['', t("selectSite"), t("generating"), t("topicClusters"), t("contentGroups")][step];
  const totalSelected = (step === 3 ? clusters : groups).filter(x => x.selected).length;

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={17} color="#3B82F6" />
            <span style={{ fontSize: '15px', fontWeight: 700 }}>{t("oneClickSetup")}</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 400 }}>— {stepTitle}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {aiUsed && step >= 3 && (
              <span style={{ fontSize: '11px', background: 'rgba(139,92,246,0.12)', color: '#8B5CF6', borderRadius: '20px', padding: '3px 10px', fontWeight: 600 }}>✦ AI</span>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: '4px' }}><X size={17} /></button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px' }}>
          {/* Step 1 */}
          {step === 1 && (
            <div>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                {t("setupDesc")}
              </p>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-bg)', marginBottom: '16px' }}>
                <input type="checkbox" defaultChecked readOnly style={{ accentColor: '#3B82F6', width: '16px', height: '16px', flexShrink: 0 }} />
                <Globe size={14} color="var(--color-text-secondary)" />
                <span style={{ fontSize: '13px', fontWeight: 500 }}>{domain}</span>
              </div>

              {/* AI provider info box */}
              {(() => {
                const anyConfigured = Object.values(providerStatuses).some(Boolean);
                const PROVIDERS = [
                  { id: 'anthropic', name: 'Anthropic', color: '#CF6B4A' },
                  { id: 'openai',    name: 'OpenAI',    color: '#10A37F' },
                  { id: 'gemini',    name: 'Gemini',    color: '#4285F4' },
                  { id: 'openrouter',name: 'OpenRouter', color: '#7C3AED' },
                  { id: 'zai',       name: 'Z.AI',      color: '#0EA5E9' },
                ];
                return (
                  <div style={{ border: `1px solid ${anyConfigured ? 'rgba(139,92,246,0.3)' : 'rgba(245,158,11,0.35)'}`, borderRadius: '10px', padding: '14px 16px', background: anyConfigured ? 'rgba(139,92,246,0.06)' : 'rgba(245,158,11,0.05)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={14} color={anyConfigured ? '#8B5CF6' : '#F59E0B'} />
                      {anyConfigured ? 'AI Clustering Enabled' : 'Connect AI for Better Clustering'}
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px', lineHeight: 1.6 }}>
                      {anyConfigured
                        ? 'Your AI provider will analyze your top GSC queries and URLs to create semantically meaningful clusters — far better than keyword matching alone.'
                        : 'Without an AI key, clustering falls back to keyword frequency matching. Connect a provider for intelligent, semantic topic grouping that understands query intent.'
                      }
                    </p>

                    {/* Provider status pills */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: anyConfigured ? '0' : '12px' }}>
                      {PROVIDERS.map(p => {
                        const ok = providerStatuses[p.id];
                        return (
                          <div key={p.id} style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                            background: ok ? `${p.color}18` : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${ok ? `${p.color}40` : 'rgba(255,255,255,0.1)'}`,
                            color: ok ? p.color : 'var(--color-text-secondary)',
                          }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: ok ? p.color : 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                            {p.name}
                            {ok && <Check size={10} />}
                          </div>
                        );
                      })}
                    </div>

                    {!anyConfigured && (
                      <a
                        href="/settings#ai"
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: '#F59E0B', textDecoration: 'none', padding: '6px 12px', borderRadius: '8px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}
                      >
                        <Sparkles size={12} /> Add API key in Settings
                      </a>
                    )}

                    {/* Active provider selector (only when at least one is configured) */}
                    {anyConfigured && (
                      <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Use:</span>
                        <select
                          value={aiProvider}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAiProvider(v);
                            localStorage.setItem('aiProvider', v);
                            const k = localStorage.getItem(`aiKey_${v}`) || localStorage.getItem('aiApiKey') || '';
                            setAiApiKey(k);
                            localStorage.setItem('aiApiKey', k);
                          }}
                          style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-text-primary)', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
                        >
                          {PROVIDERS.filter(p => providerStatuses[p.id]).map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                          · or{' '}
                          <a href="/settings" target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent-blue)', textDecoration: 'none' }}>manage keys in Settings</a>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {error && <p style={{ marginTop: '12px', fontSize: '12px', color: '#EF4444' }}>{error}</p>}
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '16px' }}>
              <div style={{ width: '40px', height: '40px', border: '3px solid var(--color-border)', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>{t("generating")}</p>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {/* Step 3 — clusters */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                {t("renameHintCluster")}
              </p>
              {clusters.map((c, i) => (
                <SetupCard key={i} item={c} index={i} ruleType="cluster"
                  onToggle={() => updCluster(i, x => ({ ...x, selected: !x.selected }))}
                  onRename={name => updCluster(i, x => ({ ...x, name }))}
                  onDelete={() => setClusters(p => p.filter((_, j) => j !== i))}
                  onPatternChange={val => updCluster(i, x => updateRules(x, val))}
                />
              ))}
              <button
                onClick={() => setClusters(p => [...p, makeEmptyCluster()])}
                style={{ marginTop: '4px', padding: '8px', borderRadius: '10px', border: '1px dashed var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                {t("addClusterManual")}
              </button>
            </div>
          )}

          {/* Step 4 — groups */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                {t("renameHintGroup")}
              </p>
              {groups.map((g, i) => (
                <SetupCard key={i} item={g} index={i} ruleType="group"
                  onToggle={() => updGroup(i, x => ({ ...x, selected: !x.selected }))}
                  onRename={name => updGroup(i, x => ({ ...x, name }))}
                  onDelete={() => setGroups(p => p.filter((_, j) => j !== i))}
                  onPatternChange={val => updGroup(i, x => updateRules(x, val))}
                />
              ))}
              <button
                onClick={() => setGroups(p => [...p, makeEmptyGroup()])}
                style={{ marginTop: '4px', padding: '8px', borderRadius: '10px', border: '1px dashed var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                {t("addGroupManual")}
              </button>
              {error && <p style={{ fontSize: '12px', color: '#EF4444' }}>{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <button
            onClick={() => step > 1 && step !== 2 && setStep(s => (s - 1) as any)}
            disabled={step <= 1 || step === 2}
            style={{ padding: '7px 18px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: 500, cursor: step <= 1 || step === 2 ? 'not-allowed' : 'pointer', opacity: step <= 1 || step === 2 ? 0.4 : 1 }}
          >
            {t("btnPrevious")}
          </button>
          {step >= 3 && (
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              {totalSelected} {t("selectedCount")}
            </span>
          )}
          {step < 3 ? (
            <button onClick={step === 1 ? generate : undefined} disabled={loading}
              style={{ padding: '7px 20px', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {t("btnNext")}
            </button>
          ) : step === 3 ? (
            <button onClick={() => setStep(4)}
              style={{ padding: '7px 20px', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              {t("btnNextArrow")}
            </button>
          ) : (
            <button onClick={apply} disabled={saving}
              style={{ padding: '7px 20px', borderRadius: '8px', border: 'none', background: '#3B82F6', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? t("btnSaving") : t("btnApplySetup")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Custom Chart Tooltip ─────────────────────────────────────────────────────
function SiteTooltip({ active, payload, label }: any) {
  const { t } = useLanguage();
  if (!active || !payload?.length) return null;
  const d = payload.reduce((acc: any, p: any) => { acc[p.dataKey] = p.value; return acc; }, {} as any);
  return (
    <div style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "10px", padding: "10px 14px", fontSize: "12px", color: "var(--color-text-primary)", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
      <p style={{ fontWeight: 600, marginBottom: "6px", color: "var(--color-text-primary)" }}>{label}</p>
      {[
        { key: "clicks",      label: t("clicks"),      color: C.clicks },
        { key: "impressions", label: t("impressions"),  color: C.impressions },
        { key: "ctr",         label: "CTR",             color: C.ctr, suffix: "%" },
        { key: "position",    label: t("avgPosition"),  color: C.position },
      ].map(({ key, label, color, suffix = "" }) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
          <span style={{ color: "var(--color-text-secondary)", flex: 1 }}>{label}</span>
          <span style={{ fontWeight: 600 }}>{d[key]}{suffix}</span>
        </div>
      ))}
    </div>
  );
}

// ─── GA4 metric types ─────────────────────────────────────────────────────────
type GA4Metric = "sessions" | "engagement" | "events" | "revenue";

const GA4_METRICS: { key: GA4Metric; icon: React.ReactNode; label: string; color: string; bg: string }[] = [
  { key: "sessions",   icon: <Users size={13} />,      label: "Sessions",        color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  { key: "engagement", icon: <Activity size={13} />,   label: "Engagement Rate", color: "#8B5CF6", bg: "rgba(139,92,246,0.12)" },
  { key: "events",     icon: <Zap size={13} />,        label: "Key Events",      color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  { key: "revenue",    icon: <DollarSign size={13} />, label: "Revenue",         color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
];

// Simple dropdown for re-use
function SimpleDropdown({ trigger, children, align = "right" }: { trigger: React.ReactNode; children: React.ReactNode; align?: "left"|"right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={() => setOpen(o => !o)}>{trigger}</div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", [align === "right" ? "right" : "left"]: 0, background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 200, minWidth: "180px", overflow: "hidden" }}
          onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Period Dropdown ─────────────────────────────────────────────────────────
function PeriodDropdown({ period, onChange }: { period: string; onChange: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const label = PERIOD_OPTIONS.find(o => o.key === period)?.label ?? period;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: open ? "rgba(255,255,255,0.07)" : "var(--color-card)", color: "var(--color-text-primary)", fontSize: "13px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
        {label} <ChevronDown size={13} style={{ color: "var(--color-text-secondary)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 300, minWidth: "170px", overflow: "hidden", maxHeight: "420px", overflowY: "auto" }}>
          {PERIOD_GROUPS.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div style={{ height: "1px", background: "var(--color-border)", margin: "4px 0" }} />}
              {group.map(key => {
                const opt = PERIOD_OPTIONS.find(o => o.key === key);
                if (!opt) return null;
                const active = period === key;
                return (
                  <button key={key} onClick={() => { onChange(key); setOpen(false); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", fontSize: "13px", width: "100%", background: active ? "rgba(59,130,246,0.12)" : "transparent", color: active ? "#3B82F6" : "var(--color-text-primary)", border: "none", cursor: "pointer", fontWeight: active ? 600 : 400 }}
                    onMouseOver={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseOut={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    {opt.label}
                    {active && <Check size={12} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Notes Dropdown ───────────────────────────────────────────────────────────
function NotesDd({ onAddNote, googleUpdates, siteNotes, onToggleGoogleUpdates, onToggleSiteNotes }: {
  onAddNote: () => void;
  googleUpdates: boolean; siteNotes: boolean;
  onToggleGoogleUpdates: () => void; onToggleSiteNotes: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const Toggle = ({ on }: { on: boolean }) => (
    <div style={{ width: "28px", height: "16px", borderRadius: "8px", background: on ? "#3B82F6" : "var(--color-border)", position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
      <div style={{ position: "absolute", top: "2px", left: on ? "14px" : "2px", width: "12px", height: "12px", borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
    </div>
  );
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", padding: "6px 8px", borderRadius: "8px", border: "1px solid var(--color-border)", background: open ? "rgba(255,255,255,0.07)" : "var(--color-card)", color: "var(--color-text-secondary)", cursor: "pointer" }}
        title="Notes & Annotations">
        <FileText size={14} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 300, minWidth: "210px", overflow: "hidden" }}>
          <button onClick={() => { onAddNote(); setOpen(false); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 16px", fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)", background: "transparent", border: "none", cursor: "pointer" }}
            onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
            onMouseOut={e => e.currentTarget.style.background = "transparent"}>
            Add Note
          </button>
          <button style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 16px", fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)", background: "transparent", border: "none", cursor: "pointer" }}
            onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
            onMouseOut={e => e.currentTarget.style.background = "transparent"}>
            Manage Notes
          </button>
          <div style={{ height: "1px", background: "var(--color-border)", margin: "4px 0" }} />
          <div style={{ padding: "8px 16px 4px", fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Chart Annotations</div>
          <button onClick={() => onToggleGoogleUpdates()}
            style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "9px 16px", fontSize: "13px", color: "var(--color-text-primary)", background: "transparent", border: "none", cursor: "pointer" }}
            onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
            onMouseOut={e => e.currentTarget.style.background = "transparent"}>
            <GoogleIcon size={14} /> <span style={{ flex: 1 }}>Google Updates</span> <Toggle on={googleUpdates} />
          </button>
          <button onClick={() => onToggleSiteNotes()}
            style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "9px 16px", fontSize: "13px", color: "var(--color-text-primary)", background: "transparent", border: "none", cursor: "pointer" }}
            onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
            onMouseOut={e => e.currentTarget.style.background = "transparent"}>
            <FileText size={14} /> <span style={{ flex: 1 }}>Site Notes</span> <Toggle on={siteNotes} />
          </button>
          <div style={{ height: "8px" }} />
        </div>
      )}
    </div>
  );
}

// ─── Filter Dropdown (Dashboard) ─────────────────────────────────────────────
function FilterDd({ positionFilter, onPositionFilter, filterDimension, filterText, onDimension, onFilterText, preset, onPreset }: {
  positionFilter: number | null; onPositionFilter: (v: number | null) => void;
  filterDimension: string | null; filterText: string;
  onDimension: (v: string | null) => void; onFilterText: (v: string) => void;
  preset: string | null; onPreset: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const activeCount = [positionFilter !== null, filterDimension !== null && filterText.trim() !== "", preset !== null].filter(Boolean).length;
  const isActive = activeCount > 0;

  const divider = <div style={{ height: "1px", background: "var(--color-border)", margin: "4px 0" }} />;
  const sec = (label: string) => (
    <div style={{ padding: "10px 14px 4px", fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
  );

  const dims = [
    { icon: <Search size={14}/>,        v: "query",   label: "Query" },
    { icon: <FileText size={14}/>,       v: "page",    label: "Page" },
    { icon: <Globe size={14}/>,          v: "country", label: "Country" },
    { icon: <Monitor size={14}/>,        v: "device",  label: "Device" },
    { icon: <BookmarkCheck size={14}/>,  v: "",        label: "Content Group", disabled: true },
    { icon: <ArrowLeftRight size={14}/>, v: "",        label: "Compare Filters", disabled: true },
  ];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "8px", border: `1px solid ${isActive ? "#3B82F6" : "var(--color-border)"}`, background: isActive ? "rgba(59,130,246,0.1)" : open ? "rgba(255,255,255,0.07)" : "var(--color-card)", color: isActive ? "#3B82F6" : "var(--color-text-secondary)", fontSize: "12px", fontWeight: 500, cursor: "pointer" }}>
        <SlidersHorizontal size={13} />
        Filter
        {isActive && <span style={{ fontSize: "10px", background: "#3B82F6", color: "#fff", borderRadius: "10px", padding: "1px 6px", fontWeight: 700 }}>{activeCount}</span>}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 300, minWidth: "260px", overflow: "hidden" }}>
          {/* Dimension */}
          {dims.map(({ icon, v, label, disabled }: any) => (
            <button key={label} disabled={disabled}
              onClick={() => { if (disabled) return; const same = filterDimension === v; onDimension(same ? null : v); onFilterText(""); }}
              style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", fontSize: "13px", cursor: disabled ? "default" : "pointer", width: "100%", background: filterDimension === v && !disabled ? "rgba(59,130,246,0.1)" : "transparent", color: disabled ? "var(--color-text-secondary)" : filterDimension === v ? "#3B82F6" : "var(--color-text-primary)", border: "none", opacity: disabled ? 0.4 : 1 }}
              onMouseOver={e => { if (!disabled && filterDimension !== v) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseOut={e => { if (filterDimension !== v) e.currentTarget.style.background = "transparent"; }}>
              {icon} {label}
              {filterDimension === v && <Check size={12} style={{ marginLeft: "auto" }} />}
            </button>
          ))}

          {/* Text input for Query / Page / Country */}
          {filterDimension && filterDimension !== "device" && (
            <div style={{ padding: "4px 14px 12px" }}>
              <input autoFocus value={filterText} onChange={e => onFilterText(e.target.value)}
                placeholder={filterDimension === "query" ? "e.g. casino, massage…" : filterDimension === "page" ? "e.g. /blog, /product…" : "e.g. gr, de, us…"}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "rgba(255,255,255,0.06)", color: "var(--color-text-primary)", fontSize: "12px", outline: "none", boxSizing: "border-box" }} />
            </div>
          )}

          {/* Device pills */}
          {filterDimension === "device" && (
            <div style={{ padding: "4px 14px 12px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {["all", "MOBILE", "DESKTOP", "TABLET"].map(v => (
                <button key={v} onClick={() => onFilterText(v === "all" ? "" : v)}
                  style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 500, cursor: "pointer", border: `1px solid ${filterText === (v === "all" ? "" : v) ? "#3B82F6" : "var(--color-border)"}`, background: filterText === (v === "all" ? "" : v) ? "rgba(59,130,246,0.1)" : "transparent", color: filterText === (v === "all" ? "" : v) ? "#3B82F6" : "var(--color-text-secondary)" }}>
                  {v === "all" ? "All" : v[0] + v.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          )}

          {divider}
          {sec("Position Filter")}
          <div style={{ padding: "4px 14px 10px", display: "flex", gap: "8px" }}>
            {([10, 20] as const).map(v => {
              const active = positionFilter === v;
              return (
                <button key={v} onClick={() => onPositionFilter(active ? null : v)}
                  style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: `1px solid ${active ? "#F59E0B" : "var(--color-border)"}`, background: active ? "rgba(245,158,11,0.12)" : "transparent", color: "#F59E0B" }}>
                  <MoveUp size={12} /> Top {v}
                </button>
              );
            })}
          </div>

          {divider}
          {sec("Preset Filters")}
          {[
            { v: "paa",      label: "People Also Ask",  hint: "queries with ?" },
            { v: "longtail", label: "Long Tail Keywords", hint: "3+ words" },
          ].map(({ v, label, hint }) => (
            <button key={v} onClick={() => { onPreset(preset === v ? null : v); onDimension(null); onFilterText(""); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "9px 14px", fontSize: "13px", fontWeight: preset === v ? 700 : 600, cursor: "pointer", background: preset === v ? "rgba(59,130,246,0.1)" : "transparent", color: preset === v ? "#3B82F6" : "var(--color-text-primary)", border: "none" }}
              onMouseOver={e => { if (preset !== v) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseOut={e => { if (preset !== v) e.currentTarget.style.background = "transparent"; }}>
              <span>{label}</span>
              <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", fontWeight: 400 }}>{hint}</span>
            </button>
          ))}

          {/* Reset */}
          {isActive && (
            <>
              {divider}
              <button onClick={() => { onPositionFilter(null); onDimension(null); onFilterText(""); onPreset(null); }}
                style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "9px 14px", fontSize: "12px", color: "#EF4444", background: "transparent", border: "none", cursor: "pointer", fontWeight: 500 }}
                onMouseOver={e => e.currentTarget.style.background = "rgba(239,68,68,0.07)"}
                onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                <X size={12} /> Reset filters
              </button>
            </>
          )}
          <div style={{ height: "4px" }} />
        </div>
      )}
    </div>
  );
}

// ─── GA4 Tab ──────────────────────────────────────────────────────────────────
function GA4Tab({ domain, period, setPeriod, periodOptions }: {
  domain: string;
  period: string;
  setPeriod: (p: string) => void;
  periodOptions: string[];
}) {
  const [ga4Linked, setGA4Linked] = useState(false);
  const [activeMetrics, setActiveMetrics] = useState<Set<GA4Metric>>(new Set(["sessions", "engagement", "events", "revenue"]));
  const [selectedProp, setSelectedProp] = useState("");

  const mockProps = [
    `${domain} - GA4`,
    `${domain} (All Web Site Data)`,
    `${domain} - Prod`,
  ];

  const toggleMetric = (m: GA4Metric) => setActiveMetrics(p => {
    const n = new Set(p); n.has(m) ? n.delete(m) : n.add(m); return n;
  });

  return (
    <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* GA4 top controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {/* Metric toggles */}
        <div style={{ display: "flex", gap: "4px" }}>
          {GA4_METRICS.map(({ key, icon, label, color, bg }) => {
            const active = activeMetrics.has(key);
            return (
              <button key={key} title={label} onClick={() => toggleMetric(key)} style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "34px", height: "34px", borderRadius: "8px", cursor: "pointer",
                border: `1px solid ${active ? color : "var(--color-border)"}`,
                background: active ? bg : "var(--color-card)",
                color: active ? color : "var(--color-text-secondary)",
                transition: "all 0.15s",
              }}>
                {icon}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Period selector */}
        <SimpleDropdown
          align="right"
          trigger={
            <button style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 13px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-text-secondary)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}>
              {period} <ChevronDown size={13} />
            </button>
          }
        >
          {periodOptions.map(p => {
            const lbl = PERIOD_OPTIONS.find(o => o.key === p)?.label ?? p;
            return (
              <button key={p} onClick={() => setPeriod(p)} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 14px", fontSize: "13px", cursor: "pointer", width: "100%", background: period === p ? "rgba(59,130,246,0.12)" : "transparent", color: period === p ? "#3B82F6" : "var(--color-text-primary)", border: "none" }}>
                {lbl} {period === p && <Check size={12} style={{ marginLeft: "auto" }} />}
              </button>
            );
          })}
        </SimpleDropdown>
      </div>

      {/* Onboarding card */}
      {!ga4Linked ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", padding: "64px 32px", background: "var(--color-card)", borderRadius: "16px", border: "1px solid var(--color-border)", textAlign: "center" }}>
          {/* GA logo */}
          <div style={{ width: "56px", height: "56px", borderRadius: "14px", background: "linear-gradient(135deg, #e8710a 0%, #f9a825 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", boxShadow: "0 4px 16px rgba(232,113,10,0.3)" }}>
            📊
          </div>
          <div style={{ maxWidth: "420px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "10px" }}>
              Link your GA4 property
            </h2>
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", lineHeight: "1.6" }}>
              Unlock the Google Analytics data you know and love, right here in OpenGSC.
            </p>
          </div>

          {/* Property selector */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", maxWidth: "380px" }}>
            <select
              value={selectedProp}
              onChange={e => setSelectedProp(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: selectedProp ? "var(--color-text-primary)" : "var(--color-text-secondary)", fontSize: "14px", outline: "none", cursor: "pointer" }}
            >
              <option value="">Select GA4 Property…</option>
              {mockProps.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button
              onClick={() => { if (selectedProp) setGA4Linked(true); }}
              style={{ width: "100%", padding: "10px 20px", borderRadius: "10px", border: "none", background: selectedProp ? "#3B82F6" : "var(--color-border)", color: selectedProp ? "#fff" : "var(--color-text-secondary)", fontSize: "14px", fontWeight: 600, cursor: selectedProp ? "pointer" : "not-allowed", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
            >
              <Link2 size={15} /> Link Property
            </button>
          </div>

          <p style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
            You can always unlink your GA4 property later.
          </p>
        </div>
      ) : (
        /* Linked state — placeholder chart area */
        <div style={{ background: "var(--color-card)", borderRadius: "16px", border: "1px solid var(--color-border)", padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {GA4_METRICS.filter(m => activeMetrics.has(m.key)).map(m => (
              <div key={m.key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: m.color }}>{m.icon}</span>
                <span style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-text-primary)" }}>
                  {m.key === "sessions" ? "4.2k" : m.key === "engagement" ? "61.3%" : m.key === "events" ? "128" : "$0"}
                </span>
                <span style={{ fontSize: "12px", color: "#10B981", fontWeight: 600 }}>+18%</span>
              </div>
            ))}
          </div>
          <div style={{ height: "200px", borderRadius: "12px", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)", fontSize: "13px" }}>
            GA4 chart will appear here
          </div>
          <button onClick={() => setGA4Linked(false)} style={{ alignSelf: "flex-end", fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Unlink GA4
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Indexing Tab ─────────────────────────────────────────────────────────────
function statusColor(s: string): string {
  if (/submitted and indexed/i.test(s))           return "#4ADE80";
  if (/crawled.*not indexed/i.test(s))            return "#FBBF24";
  if (/discovered.*not indexed/i.test(s))         return "#F97316";
  if (/unknown/i.test(s))                         return "#60A5FA";
  if (/excluded|blocked|not found|404|noindex/i.test(s)) return "#F87171";
  return "#94a3b8";
}

function statusCategory(s: string): string {
  if (/submitted and indexed/i.test(s))           return "indexed";
  if (/crawled.*not indexed/i.test(s))            return "notIndexed";
  if (/discovered.*not indexed/i.test(s))         return "discovered";
  return "other";
}

function timeAgo(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins  = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days  = Math.floor(ms / 86400000);
  if (mins < 2)   return "just now";
  if (hours < 1)  return `${mins}m ago`;
  if (days < 1)   return `${hours}h ago`;
  return `${days}d ago`;
}

function IndexingTab({ siteDbId, domain }: { siteDbId: string; domain: string }) {
  const [rows, setRows]           = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [error, setError]         = useState("");
  const [inspectedCount, setInspectedCount] = useState<number | null>(null);

  // Load cached inspections on mount / siteDbId change
  const load = async () => {
    if (!siteDbId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/gsc/inspect?siteId=${encodeURIComponent(siteDbId)}`);
      const data = await res.json();
      setRows(data.inspections ?? []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [siteDbId]);

  // Run fresh inspection via API
  const runInspection = async (forceRefresh = false) => {
    if (!siteDbId || inspecting) return;
    setInspecting(true); setError(""); setInspectedCount(null);
    try {
      const res = await fetch("/api/gsc/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: siteDbId, forceRefresh }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setRows(data.inspections ?? []);
      setInspectedCount(data.inspected ?? 0);
    } catch (e: any) { setError(e.message); }
    setInspecting(false);
  };

  // Summary counts
  const counts = rows.reduce((acc: Record<string, number>, r) => {
    const k = statusCategory(r.status);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const SUMMARY = [
    { key: "indexed",    color: "#4ADE80", label: "Indexed" },
    { key: "notIndexed", color: "#FBBF24", label: "Crawled – not indexed" },
    { key: "discovered", color: "#F97316", label: "Discovered – not indexed" },
    { key: "other",      color: "#94a3b8", label: "Other / Unknown" },
  ];

  const lastInspectDate = rows.length > 0
    ? new Date(Math.max(...rows.map(r => new Date(r.lastInspect).getTime())))
    : null;

  // Empty state
  const isEmpty = !loading && rows.length === 0;

  return (
    <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "2px" }}>
            Indexing Status
          </h2>
          {lastInspectDate && (
            <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
              Last inspected {timeAgo(lastInspectDate)} · {rows.length} pages
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {rows.length > 0 && (
            <button
              onClick={() => runInspection(true)}
              disabled={inspecting}
              style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "rgba(255,255,255,0.05)", color: "var(--color-text-secondary)", fontSize: "12px", fontWeight: 500, cursor: inspecting ? "not-allowed" : "pointer", opacity: inspecting ? 0.5 : 1 }}
            >
              {inspecting ? "Inspecting…" : "↻ Refresh"}
            </button>
          )}
          <button
            onClick={() => runInspection(false)}
            disabled={inspecting || loading}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 16px", borderRadius: "8px", border: "none", background: "#3B82F6", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: inspecting || loading ? "not-allowed" : "pointer", opacity: inspecting || loading ? 0.6 : 1 }}
          >
            <Search size={13} />
            {isEmpty ? "Inspect Top Pages" : "Update Cache"}
          </button>
        </div>
      </div>

      {/* ── API rate limit note ── */}
      <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.18)", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
        Inspects your top 20 pages by GSC impressions. Results are cached for 24 hours to stay within Google's 2,000 requests/day limit.
        {inspectedCount !== null && (
          <span style={{ color: "#4ADE80", fontWeight: 600 }}> · {inspectedCount} pages freshly inspected.</span>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", fontSize: "12px", color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* ── Loading spinner ── */}
      {(loading || inspecting) && rows.length === 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "40px 0", justifyContent: "center" }}>
          <div style={{ width: "22px", height: "22px", border: "2px solid var(--color-border)", borderTopColor: "#3B82F6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
            {inspecting ? "Calling Google URL Inspection API…" : "Loading…"}
          </span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* ── Empty state ── */}
      {isEmpty && !loading && !inspecting && (
        <div style={{ textAlign: "center", padding: "60px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <Search size={36} color="var(--color-text-secondary)" style={{ opacity: 0.3 }} />
          <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)" }}>No inspection data yet</div>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", maxWidth: "380px", lineHeight: 1.6 }}>
            Click <strong>Inspect Top Pages</strong> to fetch the indexing status of your top 20 pages directly from Google.
            <br />Make sure you've synced GSC data first.
          </p>
        </div>
      )}

      {/* ── Summary counts ── */}
      {rows.length > 0 && (
        <div style={{ display: "flex", gap: "28px", flexWrap: "wrap" }}>
          {SUMMARY.map(({ key, color, label }) => (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
                <span style={{ fontSize: "26px", fontWeight: 700, color: "var(--color-text-primary)" }}>{counts[key] ?? 0}</span>
              </div>
              <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", paddingLeft: "14px" }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Pages table ── */}
      {rows.length > 0 && (
        <div style={{ background: "var(--color-card)", borderRadius: "12px", border: "1px solid var(--color-border)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", background: "rgba(255,255,255,0.02)" }}>
                {["URL", "STATUS", "LAST CRAWL", "RICH RESULTS", "INSPECTED"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "var(--color-text-secondary)", fontWeight: 500, fontSize: "11px", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const path = row.url.replace(/^https?:\/\/[^/]+/, "") || "/";
                const rich: string[] = (() => { try { return JSON.parse(row.richResults ?? "[]"); } catch { return []; } })();
                const crawlDate = row.lastCrawl ? new Date(row.lastCrawl) : null;
                const crawlStr  = crawlDate
                  ? crawlDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : "—";
                return (
                  <tr key={row.id ?? i} style={{ borderBottom: "1px solid var(--color-border)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                    {/* URL */}
                    <td style={{ padding: "10px 14px", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        title={row.url}
                        style={{ color: "#3B82F6", textDecoration: "none", fontSize: "12px" }}
                        onMouseOver={e => (e.currentTarget.style.textDecoration = "underline")}
                        onMouseOut={e => (e.currentTarget.style.textDecoration = "none")}
                      >
                        {path}
                      </a>
                    </td>
                    {/* Status */}
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", color: statusColor(row.status), fontWeight: 500 }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: statusColor(row.status), flexShrink: 0 }} />
                        {row.status}
                      </span>
                    </td>
                    {/* Last crawl */}
                    <td style={{ padding: "10px 14px", fontSize: "12px", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                      {crawlDate ? (
                        <>
                          <div style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{timeAgo(crawlDate)}</div>
                          <div style={{ fontSize: "11px" }}>{crawlStr}</div>
                        </>
                      ) : "—"}
                    </td>
                    {/* Rich results */}
                    <td style={{ padding: "10px 14px" }}>
                      {rich.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {rich.map((r: string) => (
                            <span key={r} style={{ fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "20px", background: "rgba(139,92,246,0.12)", color: "#8B5CF6", border: "1px solid rgba(139,92,246,0.25)", whiteSpace: "nowrap" }}>
                              {r}
                            </span>
                          ))}
                        </div>
                      ) : <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)" }}>—</span>}
                    </td>
                    {/* Inspected */}
                    <td style={{ padding: "10px 14px", fontSize: "11px", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                      {timeAgo(row.lastInspect)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Google G icon ────────────────────────────────────────────────────────────
function GoogleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

// ─── Annotations Filter Dropdown ──────────────────────────────────────────────
function AnnotationsFilterDd({ onSetupBranded }: { onSetupBranded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [activeDim, setActiveDim] = useState<string | null>("Query");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const dims = [
    { icon: <Search size={14}/>,          label: "Query",          disabled: false },
    { icon: <FileText size={14}/>,         label: "Page",           disabled: false },
    { icon: <Globe size={14}/>,            label: "Country",        disabled: false },
    { icon: <Monitor size={14}/>,          label: "Device",         disabled: false },
    { icon: <BookmarkCheck size={14}/>,    label: "Content Group",  disabled: true  },
    { icon: <ArrowLeftRight size={14}/>,   label: "Compare Filters",disabled: false },
  ];

  const divider = <div style={{ height: "1px", background: "var(--color-border)", margin: "4px 0" }} />;
  const sec = (label: string) => (
    <div style={{ padding: "10px 14px 4px", fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 13px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-text-secondary)", fontSize: "13px", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
        <SlidersHorizontal size={13} /> Filter
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 200, minWidth: "240px", overflow: "hidden" }}>
          {/* Dimension filters */}
          {dims.map(({ icon, label, disabled }) => (
            <button key={label} disabled={disabled} onClick={() => { if (!disabled) setActiveDim(label); }} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", fontSize: "13px", cursor: disabled ? "default" : "pointer", width: "100%", background: activeDim === label ? "rgba(59,130,246,0.12)" : "transparent", color: disabled ? "var(--color-text-secondary)" : activeDim === label ? "#3B82F6" : "var(--color-text-primary)", border: "none", opacity: disabled ? 0.45 : 1 }}>
              {icon} {label}
              {activeDim === label && <Check size={12} style={{ marginLeft: "auto" }} />}
            </button>
          ))}

          {divider}
          {sec("Branded Queries")}
          <div style={{ padding: "4px 14px 10px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
            <span style={{ color: "#3B82F6", cursor: "pointer" }} onClick={onSetupBranded}>Define</span> branded keywords<br />to enable branded filters.
          </div>

          {divider}
          {sec("Position Filter")}
          <div style={{ padding: "4px 14px 10px", display: "flex", gap: "8px" }}>
            {["Top 10", "Top 20"].map(v => (
              <button key={v} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "1px solid var(--color-border)", background: "transparent", color: "#F59E0B" }}>
                <MoveUp size={12} /> {v}
              </button>
            ))}
          </div>

          {divider}
          {sec("Saved Filters")}
          <div style={{ padding: "4px 14px 10px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
            Add filters and save them to quickly<br />access them later.
          </div>

          {divider}
          {sec("Preset Filters")}
          {["People Also Ask", "Long Tail Keywords"].map(v => (
            <button key={v} onClick={() => setOpen(false)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: "transparent", color: "var(--color-text-primary)", border: "none" }}>
              {v}
            </button>
          ))}
          <div style={{ height: "6px" }} />
        </div>
      )}
    </div>
  );
}

// ─── Add Note Modal ───────────────────────────────────────────────────────────
function AddNoteModal({ onClose, onSave }: { onClose: () => void; onSave: (note: { date: string; title: string; desc: string; scope: string }) => void }) {
  const today = new Date();
  const todayStr = today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const [title, setTitle] = useState("");
  const [desc, setDesc]   = useState("");
  const [scope, setScope] = useState<"all" | "specific" | "group">("all");

  const scopeOptions = [
    { v: "all",      l: "All Pages" },
    { v: "specific", l: "Specific Page(s)" },
    { v: "group",    l: "Content Group" },
  ] as const;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "32px", width: "90%", maxWidth: "640px", color: "#111", boxShadow: "0 20px 60px rgba(0,0,0,0.4)", position: "relative" }}
        onClick={e => e.stopPropagation()}>
        {/* Close */}
        <button onClick={onClose} style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}><X size={20} /></button>

        {/* Label */}
        <p style={{ fontSize: "12px", color: "#9ca3af", fontWeight: 500, marginBottom: "4px" }}>Note</p>

        {/* Date */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "24px" }}>
          <span style={{ fontSize: "24px", fontWeight: 700 }}>{todayStr}</span>
          <Calendar size={18} color="#9ca3af" />
        </div>

        {/* Title */}
        <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#111", marginBottom: "8px" }}>Title</label>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="What happened on this day?"
          style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: `2px solid ${title ? "#3B82F6" : "#d1d5db"}`, fontSize: "14px", color: "#111", outline: "none", boxSizing: "border-box", marginBottom: "20px" }}
        />

        {/* Description */}
        <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#111", marginBottom: "8px" }}>Description</label>
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          rows={5}
          style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", color: "#111", outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: "20px", fontFamily: "inherit" }}
        />

        {/* Scope */}
        <p style={{ fontSize: "14px", fontWeight: 600, color: "#111", marginBottom: "12px" }}>Which pages have been impacted?</p>
        <div style={{ display: "flex", gap: "20px", marginBottom: "28px" }}>
          {scopeOptions.map(({ v, l }) => (
            <label key={v} style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", fontSize: "14px", color: "#374151" }}>
              <div onClick={() => setScope(v)} style={{ width: "18px", height: "18px", borderRadius: "50%", border: `2px solid ${scope === v ? "#3B82F6" : "#d1d5db"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>
                {scope === v && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3B82F6" }} />}
              </div>
              {l}
            </label>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button onClick={onClose} style={{ padding: "10px 22px", borderRadius: "8px", border: "none", background: "#f3f4f6", color: "#374151", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => { if (title.trim()) { onSave({ date: todayStr, title, desc, scope: scopeOptions.find(o => o.v === scope)!.l }); onClose(); } }}
            style={{ padding: "10px 22px", borderRadius: "8px", border: "none", background: title.trim() ? "#374151" : "#9ca3af", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: title.trim() ? "pointer" : "not-allowed" }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Annotation sparkline ─────────────────────────────────────────────────────
function AnnotationSparkline({ before, after }: { before: number[]; after: number[] }) {
  const data = [...before, ...after].map((v, i) => ({ v, i, isPre: i < before.length }));
  const allData = data.map(d => ({ date: d.i, value: d.v }));
  return (
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={allData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ann-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={1.5} fill="url(#ann-g)" dot={false} isAnimationActive={false} />
        {/* Annotation marker line at midpoint */}
        <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#6b7280" strokeWidth={1} strokeDasharray="3 2" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Annotations Tab ──────────────────────────────────────────────────────────
interface AnnotationNote {
  date: string; title: string; scope: string;
  cBefore: number; cAfter: number; cPct: number;
  iBefore: number; iAfter: number; iPct: number;
  tBefore: number; tAfter: number; tPct: number;
  pBefore: number; pAfter: number; pDelta: number;
  dateRange: string;
  sparkBefore: number[]; sparkAfter: number[];
}

const getMockAnnotations = (t: any): AnnotationNote[] => [
  { date: "Sep 5, 2024",  title: t("annMovedToAstro"),          scope: t("annAllPages"),       cBefore: 1500, cAfter: 2000,  cPct: 36,  iBefore: 49200, iAfter: 176300, iPct: 258, tBefore: 3.1, tAfter: 1.2, tPct: 1.9,  pBefore: 55.3, pAfter: 58,   pDelta: 2.7,  dateRange: "Jul 5 to Sep 3 → Sep 6 to Nov 5",    sparkBefore: [20,22,18,25,23,21,28,30], sparkAfter: [32,38,42,45,50,55,58,62] },
  { date: "Jun 28, 2024", title: t("annRedirectGlossary"),    scope: t("annAllPages"),       cBefore: 683,  cAfter: 1400,  cPct: 118, iBefore: 37900, iAfter: 46400,  iPct: 22,  tBefore: 1.8, tAfter: 3.2, tPct: 1.4,  pBefore: 65.8, pAfter: 55.9, pDelta: 9.9,  dateRange: "Apr 29 to Jun 27 → Jun 28 to Aug 26", sparkBefore: [15,14,16,13,15,14,16,15], sparkAfter: [18,22,25,28,30,32,35,38] },
  { date: "Aug 21, 2024", title: t("annFeaturePostsUpdate"),                    scope: t("annContentGroup"),   cBefore: 16,   cAfter: 80,    cPct: 400, iBefore: 6400,  iAfter: 17100,  iPct: 164, tBefore: 0.2, tAfter: 0.5, tPct: 0.3,  pBefore: 37.4, pAfter: 47.6, pDelta: 10.2, dateRange: "Jun 22 to Aug 20 → Aug 21 to Oct 19", sparkBefore: [5,6,4,7,5,6,5,6],        sparkAfter: [8,12,18,25,32,40,48,55]  },
  { date: "Aug 5, 2024",  title: t("annUpdatedBrandedKw"),      scope: t("annSpecificPages"), cBefore: 4,    cAfter: 32,    cPct: 700, iBefore: 2000,  iAfter: 11200,  iPct: 456, tBefore: 0.2, tAfter: 0.3, tPct: 0.1,  pBefore: 51.3, pAfter: 48.8, pDelta: 2.5,  dateRange: "Jun 6 to Aug 4 → Aug 5 to Oct 3",    sparkBefore: [2,3,2,3,2,3,2,3],        sparkAfter: [4,8,12,18,22,26,30,32]   },
];

function AnnotationsTab({ period, setPeriod, periodOptions, onSetupBranded }: {
  period: string; setPeriod: (p: string) => void; periodOptions: string[]; onSetupBranded?: () => void;
}) {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<"notes" | "updates">("notes");
  const [onboarding, setOnboarding] = useState(true);
  const [showAddNote, setShowAddNote] = useState(false);
  const [notes, setNotes] = useState<AnnotationNote[]>([]);
  const [activeMetrics, setActiveMetrics] = useState<Set<Metric>>(new Set(["clicks", "impressions", "ctr", "position"]));

  const toggleMetric = (m: Metric) => setActiveMetrics(p => { const n = new Set(p); n.has(m) ? n.delete(m) : n.add(m); return n; });

  const displayNotes = notes.length > 0 ? notes : (onboarding ? getMockAnnotations(t) : []);

  const fK = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n);

  return (
    <div style={{ position: "relative" }}>
      {/* ── Sub-header controls ── */}
      <div style={{ padding: "10px 32px", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: "8px", background: "var(--color-card)", flexWrap: "wrap" }}>
        <AnnotationsFilterDd onSetupBranded={onSetupBranded} />

        {/* Notes / Updates toggle */}
        <div style={{ display: "flex", gap: "4px" }}>
          {([
            { key: "notes",   label: t("annNotes"),   icon: <FileText size={13}/> },
            { key: "updates", label: t("annUpdates"), icon: <GoogleIcon size={13}/> },
          ] as const).map(({ key, label, icon }) => (
            <button key={key} onClick={() => setViewMode(key)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: 500, cursor: "pointer", border: `1px solid ${viewMode === key ? "#3B82F6" : "var(--color-border)"}`, background: viewMode === key ? "rgba(59,130,246,0.1)" : "var(--color-bg)", color: viewMode === key ? "#3B82F6" : "var(--color-text-secondary)", transition: "all 0.15s" }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Metric icons */}
        <div style={{ display: "flex", gap: "4px" }}>
          {([
            { m: "clicks" as Metric,      icon: <Sparkles size={13}/>, color: C.clicks,      bg: "rgba(59,130,246,0.12)"  },
            { m: "impressions" as Metric, icon: <Eye size={13}/>,      color: C.impressions, bg: "rgba(139,92,246,0.12)"  },
            { m: "ctr" as Metric,         icon: <Percent size={13}/>,  color: C.ctr,         bg: "rgba(16,185,129,0.12)"  },
            { m: "position" as Metric,    icon: <MoveUp size={13}/>,   color: C.position,    bg: "rgba(245,158,11,0.12)"  },
          ]).map(({ m, icon, color, bg }) => {
            const active = activeMetrics.has(m);
            return (
              <button key={m} onClick={() => toggleMetric(m)} style={{ width: "32px", height: "32px", borderRadius: "8px", cursor: "pointer", border: `1px solid ${active ? color : "var(--color-border)"}`, background: active ? bg : "var(--color-card)", color: active ? color : "var(--color-text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                {icon}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Period */}
        <SimpleDropdown align="right" trigger={
          <button style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 13px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-text-secondary)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}>
            {period} <ChevronDown size={13} />
          </button>
        }>
          {periodOptions.map(p => {
            const lbl = PERIOD_OPTIONS.find(o => o.key === p)?.label ?? p;
            return (
              <button key={p} onClick={() => setPeriod(p)} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 14px", fontSize: "13px", cursor: "pointer", width: "100%", background: period === p ? "rgba(59,130,246,0.12)" : "transparent", color: period === p ? "#3B82F6" : "var(--color-text-primary)", border: "none" }}>
                {lbl} {period === p && <Check size={12} style={{ marginLeft: "auto" }} />}
              </button>
            );
          })}
        </SimpleDropdown>
      </div>

      {/* ── Background content ── */}
      <div style={{ filter: onboarding ? "blur(2px)" : "none", pointerEvents: onboarding ? "none" : "auto", userSelect: onboarding ? "none" : "auto", transition: "filter 0.2s" }}>
        {displayNotes.map((note, idx) => (
          <div key={idx} style={{ display: "grid", gridTemplateColumns: "280px 1fr auto", gap: "0", borderBottom: "1px solid var(--color-border)", alignItems: "center", padding: "0 32px" }}>
            {/* Left: date + title + scope */}
            <div style={{ padding: "18px 24px 18px 0" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "4px" }}>{note.title}</div>
              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                {note.date} · {note.scope}
              </div>
            </div>

            {/* Center: sparkline + date range */}
            <div style={{ padding: "12px 24px" }}>
              <AnnotationSparkline before={note.sparkBefore} after={note.sparkAfter} />
              <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", textAlign: "center", marginTop: "2px" }}>{note.dateRange}</div>
            </div>

            {/* Right: metrics before → after */}
            <div style={{ padding: "18px 0 18px 0", display: "flex", flexDirection: "column", gap: "4px", minWidth: "260px" }}>
              {activeMetrics.has("clicks") && (
                <div style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "5px" }}>
                  <Sparkles size={11} color={C.clicks} />
                  <span style={{ color: "var(--color-text-secondary)" }}>{fK(note.cBefore)}</span>
                  <span style={{ color: "var(--color-text-secondary)" }}>→</span>
                  <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{fK(note.cAfter)} {t("clicks").toLowerCase()}</span>
                  <span style={{ color: "#10B981", fontSize: "11px", fontWeight: 600 }}>+{note.cPct}%</span>
                </div>
              )}
              {activeMetrics.has("impressions") && (
                <div style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "5px" }}>
                  <Eye size={11} color={C.impressions} />
                  <span style={{ color: "var(--color-text-secondary)" }}>{fK(note.iBefore)}</span>
                  <span style={{ color: "var(--color-text-secondary)" }}>→</span>
                  <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{fK(note.iAfter)} {t("impressions").toLowerCase()}</span>
                  <span style={{ color: "#10B981", fontSize: "11px", fontWeight: 600 }}>+{note.iPct}%</span>
                </div>
              )}
              {activeMetrics.has("ctr") && (
                <div style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "5px" }}>
                  <Percent size={11} color={C.ctr} />
                  <span style={{ color: "var(--color-text-secondary)" }}>{note.tBefore}</span>
                  <span style={{ color: "var(--color-text-secondary)" }}>→</span>
                  <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{note.tAfter}</span>
                  <span style={{ color: "#10B981", fontSize: "11px", fontWeight: 600 }}>+{note.tPct}%</span>
                </div>
              )}
              {activeMetrics.has("position") && (
                <div style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "5px" }}>
                  <MoveUp size={11} color={C.position} />
                  <span style={{ color: "var(--color-text-secondary)" }}>{note.pBefore}</span>
                  <span style={{ color: "var(--color-text-secondary)" }}>→</span>
                  <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{note.pAfter} {t("avgPosition")}</span>
                  <span style={{ color: "#6b7280", fontSize: "11px", fontWeight: 600 }}>+{note.pDelta}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Empty state when not onboarding and no notes */}
      {!onboarding && notes.length === 0 && (
        <div style={{ padding: "64px 32px", textAlign: "center" }}>
          <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>{t("annEmptyDesc")}</p>
        </div>
      )}

      {/* ── Onboarding overlay ── */}
      {onboarding && (
        <div style={{ position: "absolute", top: "61px", left: 0, right: 0, bottom: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "24px", zIndex: 10 }}>
          <div style={{ background: "var(--color-card)", borderRadius: "20px", border: "1px solid var(--color-border)", boxShadow: "0 16px 64px rgba(0,0,0,0.45)", width: "100%", maxWidth: "620px", overflow: "hidden", padding: "32px" }}>
            <h2 style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-text-primary)", textAlign: "center", marginBottom: "6px" }}>{t("tabAnnotations")}</h2>
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", textAlign: "center", marginBottom: "24px" }}>{t("annCreateFirstNote")}</p>

            {/* CTA */}
            <button
              onClick={() => { setOnboarding(false); setShowAddNote(true); }}
              style={{ width: "100%", padding: "13px", borderRadius: "10px", border: "none", background: "linear-gradient(90deg, #2563EB 0%, #7C3AED 100%)", color: "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer", marginBottom: "14px", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}>
              {t("annCreateNoteBtn")}
            </button>

            <p style={{ textAlign: "center", fontSize: "13px", color: "var(--color-text-secondary)" }}>
              {t("annOrTryItWith")}{" "}
              <button onClick={() => { setOnboarding(false); setViewMode("updates"); }} style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-primary)", fontWeight: 600, fontSize: "13px", padding: 0 }}>
                <GoogleIcon size={14} /> {t("annUpdates")}
              </button>
            </p>
          </div>
        </div>
      )}

      {/* ── Add Note Modal ── */}
      {showAddNote && (
        <AddNoteModal
          onClose={() => setShowAddNote(false)}
          onSave={note => setNotes(prev => [{ ...note, cBefore: 0, cAfter: 0, cPct: 0, iBefore: 0, iAfter: 0, iPct: 0, tBefore: 0, tAfter: 0, tPct: 0, pBefore: 0, pAfter: 0, pDelta: 0, dateRange: "", sparkBefore: [], sparkAfter: [] }, ...prev])}
        />
      )}

      {/* Add note FAB when onboarding dismissed */}
      {!onboarding && (
        <div style={{ position: "fixed", bottom: "32px", right: "32px", zIndex: 50 }}>
          <button onClick={() => setShowAddNote(true)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", borderRadius: "12px", border: "none", background: "#3B82F6", color: "#fff", fontSize: "14px", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px rgba(59,130,246,0.4)" }}>
            {t("annAddNote")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Optimize Tab ─────────────────────────────────────────────────────────────
const OPTIMIZE_TOOLS = [
  {
    id: "cdm",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
        <polyline points="17 18 23 18 23 12"/>
      </svg>
    ),
    iconBg: "rgba(239,68,68,0.1)",
    titleKey: "optContentDecay",
    descKey: "optContentDecayDesc",
  },
  {
    id: "kc",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    ),
    iconBg: "rgba(59,130,246,0.1)",
    titleKey: "optCannibalization",
    descKey: "optCannibalizationDesc",
  },
  {
    id: "sdk",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="20" x2="12" y2="10"/>
        <line x1="12" y1="6" x2="12" y2="6"/>
        <polyline points="8 14 12 10 16 14"/>
        <circle cx="12" cy="6" r="1" fill="#F59E0B"/>
      </svg>
    ),
    iconBg: "rgba(245,158,11,0.1)",
    titleKey: "optStriking",
    descKey: "optStrikingDesc",
  },
  {
    id: "ctr",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="5" x2="5" y2="19"/>
        <circle cx="6.5" cy="6.5" r="2.5"/>
        <circle cx="17.5" cy="17.5" r="2.5"/>
      </svg>
    ),
    iconBg: "rgba(16,185,129,0.1)",
    titleKey: "optCtr",
    descKey: "optCtrDesc",
  },
];

function OptimizeTab({ siteDbId }: { siteDbId: string }) {
  const [active, setActive] = useState<string | null>(null);
  const { blur } = usePrivacy();
  const { t } = useLanguage();
  // We grab domain from useParams here for ContentDecayMap
  const params = useParams();
  const domain = decodeURIComponent(params.id as string);

  return (
    <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: "0" }}>
      {OPTIMIZE_TOOLS.map(({ id, icon, iconBg, titleKey, descKey }, i) => {
        const isActive = active === id;
        const title = t(titleKey as any);
        const desc = t(descKey as any);
        return (
          <div key={id}>
            {/* Card header row */}
            <div
              onClick={() => setActive(isActive ? null : id)}
              style={{
                display: "flex", alignItems: "center", gap: "18px",
                padding: "22px 20px",
                border: `1px solid ${isActive ? "#3B82F6" : "var(--color-border)"}`,
                borderRadius: isActive
                  ? "12px 12px 0 0"
                  : i === 0
                    ? "12px 12px 0 0"
                    : i === OPTIMIZE_TOOLS.length - 1
                      ? "0 0 12px 12px"
                      : "0",
                borderBottom: isActive
                  ? "none"
                  : i < OPTIMIZE_TOOLS.length - 1
                    ? "1px solid var(--color-border)"
                    : "1px solid var(--color-border)",
                background: isActive ? "rgba(59,130,246,0.07)" : "var(--color-card)",
                cursor: "pointer",
                transition: "all 0.15s",
                position: "relative",
                marginTop: i > 0 && !isActive ? "-1px" : "0",
              }}
              onMouseOver={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"; }}
              onMouseOut={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "var(--color-card)"; }}
            >
              <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: isActive ? iconBg : iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "17px", fontWeight: 700, color: isActive ? "#3B82F6" : "var(--color-text-primary)", marginBottom: "4px" }}>{title}</div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{desc}</div>
              </div>
              <div style={{ color: isActive ? "#3B82F6" : "var(--color-text-secondary)", opacity: isActive ? 1 : 0.4, flexShrink: 0, transform: isActive ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </div>

            {/* Expanded panel */}
            {isActive && (
              <div style={{
                border: "1px solid #3B82F6",
                borderTop: "none",
                borderRadius: "0 0 12px 12px",
                overflow: "hidden",
                marginBottom: "12px",
              }}>
                {id === "cdm" ? (
                  <ContentDecayMap domain={domain} siteDbId={siteDbId} />
                ) : id === "kc" ? (
                  <KeywordCannibalization siteDbId={siteDbId} />
                ) : id === "sdk" ? (
                  <StrikingDistanceKeywords siteDbId={siteDbId} />
                ) : id === "ctr" ? (
                  <CtrBenchmark siteDbId={siteDbId} />
                ) : (
                  <div style={{ padding: "40px 32px", background: "var(--color-card)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                    <div style={{ fontSize: "28px" }}>🚧</div>
                    <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)" }}>{title}</p>
                    <p style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{t("optComingSoon")}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── New Rankings Table ───────────────────────────────────────────────────────
type RankRow = { label: string; clicks: number; impr: number; ctr: number; pos: number; cPct: number; iPct: number };
function NewRankingsTable({ queryRows, pageRows, blur }: { queryRows: RankRow[]; pageRows: RankRow[]; blur: boolean }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"Queries" | "Pages">("Queries");
  const rows = tab === "Queries" ? queryRows : pageRows;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("newRankings")}</h3>
        <TabBar tabs={["Queries", "Pages"]} active={tab} onChange={v => setTab(v as "Queries" | "Pages")} />
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "13px" }}>
          No new rankings this period
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
              <th style={{ textAlign: "left", padding: "8px 0", color: "var(--color-text-secondary)", fontWeight: 500 }}></th>
              <th style={{ textAlign: "left", padding: "8px 8px", color: C.clicks,      fontWeight: 600, fontSize: "12px" }}>{t("clicks")}</th>
              <th style={{ textAlign: "left", padding: "8px 8px", color: C.impressions, fontWeight: 600, fontSize: "12px" }}>{t("impressions")}</th>
              <th style={{ textAlign: "left", padding: "8px 8px", color: C.ctr,         fontWeight: 600, fontSize: "12px" }}>CTR</th>
              <th style={{ textAlign: "left", padding: "8px 0",  color: C.position,     fontWeight: 600, fontSize: "12px" }}>{t("position")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--color-border)", background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}>
                <td style={{ padding: "7px 8px 7px 0", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12px", color: "var(--color-text-primary)" }}>
                  <span style={blur ? { filter: "blur(5px)", userSelect: "none", display: "inline-block" } : {}}>
                    <span style={{ fontSize: "10px", background: "#10B981", color: "#fff", borderRadius: "4px", padding: "1px 5px", marginRight: "5px", fontWeight: 700 }}>NEW</span>
                    {r.label}
                  </span>
                </td>
                <td style={{ padding: "7px 8px", fontSize: "12px", color: "var(--color-text-primary)", fontWeight: 500 }}>{r.clicks}</td>
                <td style={{ padding: "7px 8px", fontSize: "12px", color: "var(--color-text-secondary)" }}>{fmtK(r.impr)}</td>
                <td style={{ padding: "7px 8px", fontSize: "12px", color: "var(--color-text-secondary)" }}>{r.ctr}%</td>
                <td style={{ padding: "7px 0",  fontSize: "12px", color: "var(--color-text-secondary)" }}>{r.pos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Stub tab ──────────────────────────────────────────────────────────────────
function StubTab({ label }: { label: string }) {
  return (
    <div style={{ padding: "80px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
      <div style={{ fontSize: "32px" }}>🚧</div>
      <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-text-primary)" }}>{label}</p>
      <p style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Coming soon</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SitePage() {
  const { t } = useLanguage();
  const params = useParams();
  const router = useRouter();
  const domain = decodeURIComponent(params.id as string);
  const { blur } = usePrivacy();
  const blurStyle: React.CSSProperties = blur
    ? { filter: "blur(6px)", userSelect: "none", transition: "filter 0.25s" }
    : { transition: "filter 0.25s" };

  // Use index so tab state doesn't break on language change
  const TAB_KEYS = ["dashboard", "ga4", "indexing", "annotations", "optimize", "health", "settings"] as const;
  type TabKey = typeof TAB_KEYS[number];
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [period, setPeriod]       = useState("7d");
  const [siteData, setSiteData]   = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const TABS: { key: TabKey; label: string }[] = [
    { key: "dashboard",   label: t("tabDashboard") },
    { key: "ga4",         label: t("tabGA4") },
    { key: "indexing",    label: t("tabIndexing") },
    { key: "annotations", label: t("tabAnnotations") },
    { key: "optimize",    label: t("tabOptimize") },
    { key: "health",      label: "Health" },
    { key: "settings",    label: t("tabSettings") },
  ];

  const [syncing, setSyncing] = useState(false);
  const [activeMetrics, setActiveMetrics] = useState<Set<Metric>>(new Set(["clicks", "impressions", "ctr", "position"]));
  const [positionFilter, setPositionFilter] = useState<number | null>(null);
  const [filterDimension, setFilterDimension] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [filterPreset, setFilterPreset] = useState<string | null>(null);
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [googleUpdates, setGoogleUpdates] = useState(false);
  const [siteNotesOn, setSiteNotesOn] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showBrandedModal, setShowBrandedModal] = useState(false);
  const [brandedKeywords, setBrandedKeywords] = useState<string[]>([]);
  const [clusterMetrics, setClusterMetrics] = useState<{ clusters: ClusterRow[]; groups: ClusterRow[] } | null>(null);
  const [clusterLoading, setClusterLoading] = useState(false);
  const siteDbId = siteData?.siteDbId ?? '';
  const toggleMetric = (m: Metric) => setActiveMetrics(p => { const n = new Set(p); n.has(m) ? n.delete(m) : n.add(m); return n; });

  const fetchClusterMetrics = (p = period) => {
    if (!siteDbId) return;
    setClusterLoading(true);
    fetch(`/api/gsc/cluster-metrics?siteId=${encodeURIComponent(siteDbId)}&period=${p}`)
      .then(r => r.json())
      .then(d => setClusterMetrics(d))
      .catch(() => {})
      .finally(() => setClusterLoading(false));
  };

  const [syncedAt, setSyncedAt] = useState<Date | null>(() => {
    if (typeof window === 'undefined') return null;
    const s = localStorage.getItem('gsc_synced_at');
    return s ? new Date(s) : null;
  });

  const handleSync = () => {
    if (syncing) return;
    setSyncing(true);

    fetch('/api/gsc/sync', { method: 'POST' })
      .then(r => r.json())
      .then(() => {
        // Poll until done, then refresh site data
        const poll = setInterval(() => {
          fetch('/api/gsc/sync')
            .then(r => r.json())
            .then(s => {
              if (!s.syncing) {
                clearInterval(poll);
                const now = new Date();
                setSyncedAt(now);
                localStorage.setItem('gsc_synced_at', now.toISOString());
                fetch(`/api/gsc/site?domain=${encodeURIComponent(domain)}&period=${period}`)
                  .then(r => r.json())
                  .then(d => { if (d?.chartData) setSiteData(d); })
                  .catch(() => {})
                  .finally(() => setSyncing(false));
              }
            })
            .catch(() => {});
        }, 15_000);
        // Safety: stop after 15 min
        setTimeout(() => { clearInterval(poll); setSyncing(false); }, 15 * 60_000);
      })
      .catch(() => setSyncing(false));
  };

  // Fetch data from DB whenever domain or period changes
  useEffect(() => {
    setDataLoading(true);
    fetch(`/api/gsc/site?domain=${encodeURIComponent(domain)}&period=${period}`)
      .then(r => r.json())
      .then(d => setSiteData(d))
      .catch(() => {})
      .finally(() => setDataLoading(false));
  }, [domain, period]);

  // Fetch cluster metrics whenever siteDbId or period changes
  useEffect(() => {
    if (siteDbId) fetchClusterMetrics(period);
  }, [siteDbId, period]);

  // Fetch branded keywords whenever siteDbId changes
  useEffect(() => {
    if (!siteDbId) return;
    fetch(`/api/gsc/branded?siteId=${siteDbId}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.branded)) setBrandedKeywords(d.branded); })
      .catch(() => {});
  }, [siteDbId]);

  // Real data or empty fallback
  const chartData = useMemo(() => {
    if (siteData?.chartData?.length > 0) return siteData.chartData;
    // Empty fallback (no fake numbers)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - 7 + i);
      return { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), clicks: 0, impressions: 0, ctr: 0, position: 0, clicksC: 0, impressionsC: 0, ctrC: 0, positionC: 0 };
    });
  }, [siteData]);

  const applyPreset = (rows: any[]) => {
    if (filterPreset === "paa")      return rows.filter((r: any) => r.label?.includes("?"));
    if (filterPreset === "longtail") return rows.filter((r: any) => (r.label?.split(" ").length ?? 0) >= 3);
    return rows;
  };

  const queryRows = useMemo(() => {
    let rows = siteData?.queries ?? [];
    if (positionFilter)                                  rows = rows.filter((r: any) => r.pos <= positionFilter);
    if (filterDimension === "query" && filterText.trim()) rows = rows.filter((r: any) => r.label?.toLowerCase().includes(filterText.toLowerCase()));
    rows = applyPreset(rows);
    return rows;
  }, [siteData, positionFilter, filterDimension, filterText, filterPreset]);

  const pageRows = useMemo(() => {
    let rows = siteData?.pages ?? [];
    if (positionFilter)                                 rows = rows.filter((r: any) => r.pos <= positionFilter);
    if (filterDimension === "page" && filterText.trim()) rows = rows.filter((r: any) => r.label?.toLowerCase().includes(filterText.toLowerCase()));
    return rows;
  }, [siteData, positionFilter, filterDimension, filterText]);
  const countryRows = useMemo(() => {
    let rows = siteData?.countries ?? [];
    if (filterDimension === "country" && filterText.trim())
      rows = rows.filter((r: any) => r.country?.toLowerCase().includes(filterText.toLowerCase()) || iso3ToName(r.country ?? "").toLowerCase().includes(filterText.toLowerCase()));
    return rows;
  }, [siteData, filterDimension, filterText]);

  const deviceRowsReal = useMemo(() => {
    let rows = siteData?.devices ?? [];
    if (filterDimension === "device" && filterText)
      rows = rows.filter((r: any) => r.device?.toUpperCase() === filterText.toUpperCase());
    return rows;
  }, [siteData, filterDimension, filterText]);
  const newQueryRows   = useMemo(() => siteData?.newQueries     ?? [], [siteData]);
  const newPageRows    = useMemo(() => siteData?.newPages       ?? [], [siteData]);
  const positionBuckets = useMemo(() => siteData?.positionBuckets ?? { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 }, [siteData]);

  // Summary from API (or zeros)
  const summary = siteData?.summary ?? { clicks: { value: 0, change: 0 }, impressions: { value: 0, change: 0 }, ctr: { value: 0, change: 0 }, position: { value: 0, change: 0 } };

  const totalClicks = summary.clicks.value;
  const totalImpr   = summary.impressions.value;
  const avgCtr      = summary.ctr.value;
  const avgPos      = summary.position.value;

  // Query counting: real position distribution from GSC queries
  const qcBuckets = [
    { label: "1-3",   color: "#F59E0B", count: positionBuckets["1-3"]   },
    { label: "4-10",  color: "#1e40af", count: positionBuckets["4-10"]  },
    { label: "11-20", color: "#3B82F6", count: positionBuckets["11-20"] },
    { label: "21+",   color: "#93c5fd", count: positionBuckets["21+"]   },
  ];
  const qcTotal = qcBuckets.reduce((s, b) => s + b.count, 0);

  const periodLabel = PERIOD_OPTIONS.find(o => o.key === period)?.label ?? period;
  const periodOptions = PERIOD_OPTIONS.map(o => o.key);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", color: "var(--color-text-primary)", fontFamily: "Inter, sans-serif" }}>
      {/* Top nav */}
      <div style={{ borderBottom: "1px solid var(--color-border)", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--color-card)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
          {/* Breadcrumb */}
          <button onClick={() => router.push("/")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "16px 0", color: "var(--color-text-secondary)", fontSize: "14px", fontWeight: 600, cursor: "pointer", border: "none", background: "none" }}>
            <span style={{ opacity: 0.6 }}>OpenGSC</span>
          </button>
          <span style={{ color: "var(--color-text-secondary)", margin: "0 8px" }}>/</span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/favicon?domain=${domain}`} width={14} height={14} alt="" style={{ borderRadius: "2px" }} onError={e=>((e.target as HTMLImageElement).style.display="none")} />
            <span style={{ fontSize: "14px", fontWeight: 600, ...blurStyle }}>{domain}</span>
          </div>
          <span style={{ margin: "0 24px", color: "var(--color-border)" }}>|</span>
          {/* Tab nav */}
          <nav style={{ display: "flex", gap: "0" }}>
            {TABS.map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key)} style={{
                padding: "16px 14px", fontSize: "13px", fontWeight: activeTab === key ? 600 : 400,
                color: activeTab === key ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                cursor: "pointer", border: "none",
                borderBottom: activeTab === key ? "2px solid var(--color-text-primary)" : "2px solid transparent",
                background: "none", transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </nav>
        </div>

        {/* Right controls — shown on Dashboard + GA4 tabs */}
        {(activeTab === "dashboard" || activeTab === "ga4") && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {/* Notes button */}
            <NotesDd
              onAddNote={() => setShowAddNoteModal(true)}
              googleUpdates={googleUpdates}
              siteNotes={siteNotesOn}
              onToggleGoogleUpdates={() => setGoogleUpdates(v => !v)}
              onToggleSiteNotes={() => setSiteNotesOn(v => !v)}
            />
            {/* Filter */}
            <FilterDd
              positionFilter={positionFilter} onPositionFilter={setPositionFilter}
              filterDimension={filterDimension} filterText={filterText}
              onDimension={setFilterDimension} onFilterText={setFilterText}
              preset={filterPreset} onPreset={setFilterPreset}
            />
            {/* Metric toggles */}
            {([
              { m: "clicks"      as Metric, icon: <Sparkles size={13}/>, color: C.clicks,      bg: "rgba(59,130,246,0.12)"  },
              { m: "impressions" as Metric, icon: <Eye      size={13}/>, color: C.impressions, bg: "rgba(139,92,246,0.12)"  },
              { m: "ctr"         as Metric, icon: <Percent  size={13}/>, color: C.ctr,         bg: "rgba(16,185,129,0.12)"  },
              { m: "position"    as Metric, icon: <MoveUp   size={13}/>, color: C.position,    bg: "rgba(245,158,11,0.12)"  },
            ]).map(({ m, icon, color, bg }) => {
              const on = activeMetrics.has(m);
              return (
                <button key={m} onClick={() => toggleMetric(m)}
                  title={m}
                  style={{ width: "30px", height: "30px", borderRadius: "6px", border: `1px solid ${on ? color : "var(--color-border)"}`, background: on ? bg : "var(--color-card)", color: on ? color : "var(--color-text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s", opacity: on ? 1 : 0.5 }}>
                  {icon}
                </button>
              );
            })}
            {/* Period */}
            <PeriodDropdown period={period} onChange={setPeriod} />
            {/* Manual sync button */}
            <button
              onClick={handleSync}
              disabled={syncing}
              title={syncedAt ? `Last synced: ${syncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${syncedAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}` : 'Sync GSC data'}
              style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 11px", borderRadius: "8px", border: "1px solid var(--color-border)", background: syncing ? "rgba(59,130,246,0.08)" : "var(--color-card)", color: syncing ? "#3B82F6" : "var(--color-text-secondary)", fontSize: "12px", fontWeight: 500, cursor: syncing ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, animation: syncing ? "spin 1.2s linear infinite" : "none" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              {syncing ? "Syncing…" : syncedAt ? syncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Sync"}
            </button>
          </div>
        )}
      </div>

      {/* ── Branded Keywords modal ── */}
      {showBrandedModal && siteDbId && (
        <BrandedKeywordsModal
          siteDbId={siteDbId}
          domain={domain}
          initial={brandedKeywords}
          onClose={() => setShowBrandedModal(false)}
          onSaved={(kws) => { setBrandedKeywords(kws); setShowBrandedModal(false); }}
        />
      )}

      {/* ── One Click Setup modal ── */}
      {showSetupModal && siteDbId && (
        <SetupModal
          domain={domain}
          siteDbId={siteDbId}
          onClose={() => setShowSetupModal(false)}
          onApplied={() => {
            setShowSetupModal(false);
            fetchClusterMetrics(period);
          }}
        />
      )}

      {/* ── Add Note modal (triggered from toolbar Notes button) ── */}
      {showAddNoteModal && (
        <AddNoteModal onClose={() => setShowAddNoteModal(false)} onSave={_note => { setShowAddNoteModal(false); setActiveTab("annotations"); }} />
      )}


      {/* ── GA4 tab ── */}
      {activeTab === "ga4" && (
        <GA4Tab domain={domain} period={period} setPeriod={setPeriod} periodOptions={periodOptions} />
      )}

      {/* ── Indexing tab ── */}
      {activeTab === "indexing" && <IndexingTab siteDbId={siteDbId} domain={domain} />}

      {/* ── Annotations tab ── */}
      {activeTab === "annotations" && (
        <AnnotationsTab period={period} setPeriod={setPeriod} periodOptions={periodOptions} onSetupBranded={() => setShowSetupModal(true)} />
      )}

      {/* ── Optimize tab ── */}
      {activeTab === "optimize" && <OptimizeTab siteDbId={siteDbId} />}

      {/* ── Health tab ── */}
      {activeTab === "health" && <SiteHealthPanel siteDbId={siteDbId} />}

      {/* ── Settings tab ── */}
      {activeTab === "settings" && (
        <SiteSettingsTab domain={domain} siteDbId={siteDbId} />
      )}

      {/* ── Dashboard tab content ── */}
      {activeTab === "dashboard" && (
      <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: "32px" }}>

        {/* Metric summary */}
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          {[
            { icon: <Sparkles size={14} style={{ color: C.clicks }} />, val: dataLoading ? "…" : fmtK(totalClicks), chg: summary.clicks.change, invert: false },
            { icon: <Eye size={14} style={{ color: C.impressions }} />, val: dataLoading ? "…" : fmtK(totalImpr), chg: summary.impressions.change, invert: false },
            { icon: <Percent size={14} style={{ color: C.ctr }} />, val: dataLoading ? "…" : `${avgCtr}%`, chg: summary.ctr.change, invert: false },
            { icon: <MoveUp size={14} style={{ color: C.position }} />, val: dataLoading ? "…" : String(avgPos), chg: summary.position.change, invert: true },
          ].map(({ icon, val, chg, invert }, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              {icon}
              <span style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-text-primary)" }}>{val}</span>
              {!dataLoading && chg !== 0 && <Change pct={chg} invert={invert} />}
            </div>
          ))}
        </div>

        {/* Main chart */}
        <div style={{ background: "var(--color-card)", borderRadius: "12px", padding: "16px", border: "1px solid var(--color-border)" }}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 50, left: 0, bottom: 0 }}>
              <defs>
                {(["clicks", "impressions", "ctr", "position"] as const).map(m => (
                  <linearGradient key={m} id={`sg-${m}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C[m]} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={C[m]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} />
              <YAxis yAxisId="left"  axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} />
              <Tooltip content={<SiteTooltip />} cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }} />
              {activeMetrics.has("clicks")      && <Line yAxisId="left"  type="monotone" dataKey="clicksC"      stroke={C.clicks}       strokeWidth={1}   strokeDasharray="4 3" dot={false} legendType="none" />}
              {activeMetrics.has("impressions") && <Line yAxisId="right" type="monotone" dataKey="impressionsC" stroke={C.impressions}   strokeWidth={1}   strokeDasharray="4 3" dot={false} legendType="none" />}
              {activeMetrics.has("ctr")         && <Line yAxisId="left"  type="monotone" dataKey="ctrC"         stroke={C.ctr}           strokeWidth={1}   strokeDasharray="4 3" dot={false} legendType="none" />}
              {activeMetrics.has("position")    && <Line yAxisId="left"  type="monotone" dataKey="positionC"    stroke={C.position}      strokeWidth={1}   strokeDasharray="4 3" dot={false} legendType="none" />}
              {activeMetrics.has("clicks")      && <Area yAxisId="left"  type="monotone" dataKey="clicks"      stroke={C.clicks}       strokeWidth={2}   fill={`url(#sg-clicks)`}      dot={false} />}
              {activeMetrics.has("impressions") && <Area yAxisId="right" type="monotone" dataKey="impressions" stroke={C.impressions}   strokeWidth={2}   fill={`url(#sg-impressions)`} dot={false} />}
              {activeMetrics.has("ctr")         && <Line yAxisId="left"  type="monotone" dataKey="ctr"         stroke={C.ctr}           strokeWidth={1.5} dot={false} />}
              {activeMetrics.has("position")    && <Line yAxisId="left"  type="monotone" dataKey="position"    stroke={C.position}      strokeWidth={1.5} dot={false} />}
              {/* Google Update markers */}
              {googleUpdates && GOOGLE_UPDATES
                .filter(u => chartData.some((d: any) => d.date === u.date))
                .map(u => (
                  <ReferenceLine key={u.date} x={u.date} yAxisId="left"
                    stroke={u.color} strokeWidth={1.5} strokeDasharray="3 3"
                    label={{ value: u.label, position: "top", fontSize: 9, fill: u.color, fontWeight: 600 }} />
                ))
              }
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Topic Clusters + Content Groups */}
        <div>
          {/* Header row with One Click Setup button */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
              {clusterLoading ? "Loading…" : (clusterMetrics?.clusters?.length ?? 0) + (clusterMetrics?.groups?.length ?? 0) > 0 ? "" : "No clusters configured yet"}
            </span>
            <button
              onClick={() => setShowSetupModal(true)}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "8px", border: "1.5px solid rgba(59,130,246,0.5)", background: "rgba(59,130,246,0.08)", color: "#3B82F6", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
            >
              <Sparkles size={13} />
              One Click Setup
            </button>
          </div>

          {/* Tables or placeholders */}
          {(clusterMetrics?.clusters?.length ?? 0) > 0 || (clusterMetrics?.groups?.length ?? 0) > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              <ClusterTable
                title={t("topicClusters")}
                data={clusterMetrics?.clusters ?? []}
                blur={blur}
              />
              <ClusterTable
                title={t("contentGroups")}
                data={clusterMetrics?.groups ?? []}
                blur={blur}
              />
            </div>
          ) : !clusterLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              <div>
                <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px", color: "var(--color-text-primary)" }}>{t("topicClusters")}</h3>
                <Placeholder icon={<MoveUp size={28} />} title={t("missingTopicClusters")} desc="Click One Click Setup to generate clusters automatically" />
              </div>
              <div>
                <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px", color: "var(--color-text-primary)" }}>{t("contentGroups")}</h3>
                <Placeholder icon={
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="8" y="8" width="8" height="8" rx="1"/><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><rect x="16" y="16" width="5" height="5" rx="1"/></svg>
                } title={t("missingContentGroups")} desc="Click One Click Setup to generate groups automatically" />
              </div>
            </div>
          ) : null}
        </div>

        {/* Queries + Pages */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>
          <DataTable title={t("queriesTable")} rows={queryRows} tabs={["All", "Growing", "Decaying"]} blur={blur} />
          <DataTable title={t("pagesTable")}   rows={pageRows}  tabs={["All", "Growing", "Decaying"]} blur={blur} />
        </div>

        {/* Branded + Query Counting */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("brandedVsNonBranded")}</h3>
              {brandedKeywords.length > 0 && (
                <button onClick={() => setShowBrandedModal(true)} style={{ fontSize: "11px", color: "#3B82F6", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "6px", cursor: "pointer", padding: "2px 8px" }}>✎ ключи</button>
              )}
            </div>
            {brandedKeywords.length > 0 ? (
              <BrandedChart siteDbId={siteDbId} period={period} keywords={brandedKeywords} />
            ) : (
              <Placeholder icon={
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><path d="M9 9h1.5a1.5 1.5 0 0 1 0 3H9v3m3-6h1.5"/></svg>
              } title={t("missingBrandedKeywords")} desc={`${t("define")} ${t("activateReportDesc")}`} onClick={() => setShowBrandedModal(true)} />
            )}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("queryCounting")}</h3>
              {qcTotal > 0 && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{qcTotal} {t("queriesTable").toLowerCase()}</span>}
            </div>
            {qcTotal === 0 ? (
              <div style={{ height: "160px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)", fontSize: "13px" }}>
                {dataLoading ? "Loading…" : "No data yet"}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {qcBuckets.map(({ label, color, count }) => {
                  const barPct = qcTotal > 0 ? Math.round((count / qcTotal) * 100) : 0;
                  return (
                    <div key={label}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ width: "10px", height: "10px", background: color, borderRadius: "2px", flexShrink: 0 }} />
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-primary)" }}>Position {label}</span>
                        </div>
                        <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{count} <span style={{ color }}>{barPct}%</span></span>
                      </div>
                      <div style={{ height: "8px", background: "var(--color-border)", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${barPct}%`, background: color, borderRadius: "4px", transition: "width 0.6s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Countries + New Rankings */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>
          <CountryTable rows={countryRows} />
          <NewRankingsTable queryRows={newQueryRows} pageRows={newPageRows} blur={blur} />
        </div>

        {/* Devices */}
        <DeviceTable rows={deviceRowsReal} />

        {/* Footer */}
        <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "20px", height: "20px", borderRadius: "4px", background: "#8B5CF6" }} />
              <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)" }}>OpenGSC</span>
            </div>
            <span style={{ fontSize: "13px", color: "var(--color-text-secondary)", cursor: "pointer" }}>{t("changelog")}</span>
          </div>
          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{t("copyright")}</span>
        </div>
      </div>
      )}
    </div>
  );
}
