"use client";

// Comprehensive Content Analysis result view — 4 tabs (Dashboard / Guideline /
// Competitor Gaps / Task Constructor). Falls back to the legacy GapReport for
// old-shape history items. All UI labels go through i18n; LLM content is data.

import { useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ScatterChart, Scatter, ResponsiveContainer, ZAxis,
} from "recharts";
import {
  LayoutDashboard, ListChecks, GitCompareArrows, Wrench, Target, TrendingUp,
  AlertCircle, FileText, Flag, Copy, Check, ExternalLink, Link2,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { GapReport } from "@/components/SeoRenderers";

const GREEN = "var(--color-accent-green)";
const ORANGE = "var(--color-accent-orange)";
const RED = "var(--color-accent-red)";
const BLUE = "var(--color-accent-blue)";
const PURPLE = "var(--color-accent-purple)";
const INK = "var(--color-text-primary)";

const TYPE_LABEL: Record<string, string> = {
  new_h2: "NEW H2", new_h3: "NEW H3", expand: "EXPAND", enhance: "ENHANCE", reduce: "REDUCE",
};
const REC_COLOR: Record<string, string> = { add: GREEN, skip: "var(--color-text-tertiary)", merge: BLUE, expand: PURPLE };

type Tab = "dashboard" | "guideline" | "gaps" | "constructor";

export default function SeoContentAnalysis({ report }: { report: any }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("dashboard");

  // Legacy shape (old history items) → render the old gap report.
  const isNew = report && (Array.isArray(report.recommendations) || Array.isArray(report.entities));
  if (!isNew) return <GapReport report={report} />;

  const keyword = report.main_keyword || report.keyword || "—";

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: "dashboard", label: t("seoCaTabDashboard"), icon: LayoutDashboard },
    { key: "guideline", label: t("seoCaTabGuideline"), icon: ListChecks },
    { key: "gaps", label: t("seoCaTabGaps"), icon: GitCompareArrows },
    { key: "constructor", label: t("seoCaTabConstructor"), icon: Wrench },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, color: INK, margin: "0 0 3px" }}>{t("seoCaTitle")}</h2>
        <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{t("seoCaKeyword")}: <b style={{ color: INK }}>{keyword}</b></div>
      </div>

      {/* segmented tabs */}
      <div style={{ display: "flex", gap: "4px", padding: "4px", borderRadius: "12px", background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const on = tab === key;
          return (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
              padding: "9px 10px", borderRadius: "9px", fontSize: "13px", fontWeight: on ? 700 : 500, cursor: "pointer",
              border: "none", background: on ? "var(--color-card)" : "transparent",
              color: on ? INK : "var(--color-text-secondary)",
              boxShadow: on ? "0 1px 3px rgba(0,0,0,0.18)" : "none",
            }}><Icon size={15} /> {label}</button>
          );
        })}
      </div>

      {tab === "dashboard" && <Dashboard report={report} t={t} />}
      {tab === "guideline" && <Guideline report={report} keyword={keyword} t={t} />}
      {tab === "gaps" && <Gaps report={report} keyword={keyword} t={t} />}
      {tab === "constructor" && <Constructor report={report} t={t} />}
    </div>
  );
}

/* ─────────────────────────── DASHBOARD ─────────────────────────── */
function Dashboard({ report, t }: { report: any; t: any }) {
  const entities: any[] = report.entities || [];
  const recs: any[] = report.recommendations || [];
  const s = report.summary || {};

  const well = entities.filter(e => e.coverage === "well");
  const under = entities.filter(e => e.coverage === "underdeveloped");
  const missing = entities.filter(e => e.coverage === "missing");

  const totalEntities = s.total_entities ?? entities.length;
  const found = s.entities_found ?? (well.length + under.length);
  const miss = s.entities_missing ?? missing.length;
  const coverage = s.coverage_percent ?? (totalEntities ? Math.round((well.length / totalEntities) * 100) : 0);
  const gaps = s.content_gaps ?? (report.competitor_gaps?.length || 0);
  const recsCount = s.recommendations ?? recs.length;

  const coverageData = [
    { name: t("seoCaAdequate"), value: well.length, color: GREEN },
    { name: t("seoCaUnderdeveloped"), value: under.length, color: RED },
    { name: t("seoCaMissing"), value: missing.length, color: PURPLE },
  ].filter(d => d.value > 0);
  const coreCount = entities.filter(e => e.kind === "core").length;
  const typeData = [
    { name: t("seoCaCore"), value: coreCount, color: BLUE },
    { name: t("seoCaSecondary"), value: entities.length - coreCount, color: ORANGE },
  ].filter(d => d.value > 0);

  const tripletData = entities.slice(0, 8).map(e => ({
    name: e.name, cur: Number(e.triplets_current || 0), comp: Number(e.triplets_competitor_median || 0),
  }));

  const sorted = [...recs].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const top3 = sorted.slice(0, 3);

  // priority buckets
  const bucket = (p: number) => p >= 0.9 ? "top" : p >= 0.8 ? "high" : p >= 0.6 ? "medium" : "low";
  const buckets: Record<string, any[]> = { top: [], high: [], medium: [], low: [] };
  sorted.forEach(r => buckets[bucket(r.priority || 0)].push(r));

  const wordData = sorted.slice(0, 10).map((r, i) => ({ i: i + 1, w: Math.max(0, Number(r.words_to || 0)) }));
  const matrix = sorted.map(r => ({ x: Number(r.words_to || 0) - Number(r.words_from || 0), y: (r.priority || 0) * 10, z: 1 }));

  const scatter = entities.map(e => ({
    x: Number(e.mentions || 0), y: Number(e.triplets_current || 0), z: Number(e.triplets_competitor_median || 0) + 1,
    fill: e.coverage === "well" ? GREEN : e.coverage === "underdeveloped" ? ORANGE : RED,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
        <Kpi label={t("seoCaTotalEntities")} value={totalEntities} sub={`${found} ${t("seoCaFound")} + ${miss} ${t("seoCaMissing")}`} icon={<Target size={18} />} />
        <Kpi label={t("seoCaCoverageStatus")} value={`${coverage}%`} sub={report.summary?.coverage_label || t("seoCaUnderdeveloped")} icon={<TrendingUp size={18} color={ORANGE} />} />
        <Kpi label={t("seoCaContentGaps")} value={gaps} sub={t("seoCaCriticalMissing")} icon={<AlertCircle size={18} color={RED} />} />
        <Kpi label={t("seoCaRecommendations")} value={recsCount} sub={t("seoCaSubIntents")} icon={<FileText size={18} color={BLUE} />} />
      </div>

      {/* top priority actions */}
      {top3.length > 0 && (
        <div className="panel">
          <h3 style={h3}>{t("seoCaTopActions")}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {top3.map((r, i) => (
              <div key={r.id || i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", border: "1px solid var(--color-border)", borderRadius: "10px" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: INK, color: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: INK }}>{r.title}</div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                    <span className="pill" style={{ marginRight: "8px" }}>{TYPE_LABEL[r.type] || r.type}</span>
                    {Math.max(0, Number(r.words_to || 0))} {t("seoCaWords")} · {t("seoCaPriority")}: {((r.priority || 0) * 10).toFixed(1)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* donuts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <Donut title={t("seoCaCoverageDist")} data={coverageData} />
        <Donut title={t("seoCaEntityTypeDist")} data={typeData} />
      </div>

      {/* triplets bar */}
      {tripletData.length > 0 && (
        <div className="panel">
          <h3 style={h3}>{t("seoCaTripletsChart")}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={tripletData} margin={{ bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="cur" name={t("seoCaCurrentTriplets")} fill="#e6b800" radius={[3, 3, 0, 0]} />
              <Bar dataKey="comp" name={t("seoCaCompetitorMedian")} fill={RED} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <Legend items={[[t("seoCaCurrentTriplets"), "#e6b800"], [t("seoCaCompetitorMedian"), RED]]} />
        </div>
      )}

      {/* entity coverage groups */}
      <div className="panel">
        <h3 style={h3}>{t("seoCaEntityCoverage")}</h3>
        <CoverageGroup title={`${t("seoCaWellCovered")} (${well.length})`} color={GREEN} entities={well} t={t} kind="well" />
        <CoverageGroup title={`${t("seoCaUnderdevTitle")} (${under.length})`} color={ORANGE} entities={under} t={t} kind="under" />
        <CoverageGroup title={`${t("seoCaMissingTitle")} (${missing.length})`} color={RED} entities={missing} t={t} kind="missing" />
      </div>

      {/* scatter */}
      {scatter.length > 0 && (
        <div className="panel">
          <h3 style={{ ...h3, marginBottom: "2px" }}>{t("seoCaScatterTitle")}</h3>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "12px" }}>{t("seoCaScatterAxes")}</div>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis type="number" dataKey="x" name={t("seoCaMentions")} tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} label={{ value: t("seoCaMentions"), position: "insideBottom", offset: -3, fontSize: 11 }} />
              <YAxis type="number" dataKey="y" name={t("seoCaTriplets")} allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} />
              <ZAxis type="number" dataKey="z" range={[60, 360]} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={scatter}>
                {scatter.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* roadmap */}
      <div className="panel">
        <h3 style={h3}>{t("seoCaRoadmap")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "14px" }}>
          <RoadmapStat label={t("seoCaTopPriority")} n={buckets.top.length} color={RED} />
          <RoadmapStat label={t("seoCaHighPriority")} n={buckets.high.length} color={ORANGE} />
          <RoadmapStat label={t("seoCaMediumPriority")} n={buckets.medium.length} color="#e6b800" />
          <RoadmapStat label={t("seoCaLowPriority")} n={buckets.low.length} color={BLUE} />
        </div>
        {(["top", "high", "medium", "low"] as const).map(b => buckets[b].length > 0 && (
          <RoadmapBucket key={b} title={`${t(`seoCa${b[0].toUpperCase()}${b.slice(1)}Priority` as any)} (${buckets[b].length})`} items={buckets[b]} t={t} />
        ))}
        {Array.isArray(report.excluded) && report.excluded.length > 0 && (
          <div style={{ marginTop: "14px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: INK, marginBottom: "10px" }}>{t("seoCaExcluded")} ({report.excluded.length})</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
              {report.excluded.map((x: any, i: number) => (
                <div key={i} style={{ padding: "12px 14px", border: "1px solid var(--color-border)", borderRadius: "10px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: INK }}>{x.name}</div>
                  <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <span className="pill" style={{ alignSelf: "flex-start" }}>{x.kind}</span>
                    <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>{x.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* prioritized action list */}
      <div className="panel">
        <h3 style={h3}>{t("seoCaActionList")}</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border)" }}>
                <th style={th}>#</th><th style={th}>{t("seoCaTitleCol")}</th><th style={th}>{t("seoCaType")}</th><th style={th}>{t("seoCaPriority")}</th><th style={th}>{t("seoCaWords")}</th><th style={th}>{t("seoCaRelevance")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const p = (r.priority || 0) * 10;
                const pc = p >= 8 ? RED : p >= 6.5 ? ORANGE : "var(--color-text-secondary)";
                return (
                  <tr key={r.id || i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ ...td, color: "var(--color-text-tertiary)" }}>{i + 1}</td>
                    <td style={{ ...td, color: INK, fontWeight: 600 }}>{r.title}</td>
                    <td style={td}><span className="pill">{TYPE_LABEL[r.type] || r.type}</span></td>
                    <td style={td}><span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 9px", borderRadius: "20px", color: "#fff", background: pc }}>{p.toFixed(1)}</span></td>
                    <td style={td}>{Math.max(0, Number(r.words_to || 0))}</td>
                    <td style={td}>{Math.round((r.relevance ?? r.priority ?? 0) * 100)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* word count + matrix */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div className="panel">
          <h3 style={h3}>{t("seoCaCumWords")}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={wordData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="i" tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="w" fill={INK} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h3 style={{ ...h3, marginBottom: "2px" }}>{t("seoCaPriorityMatrix")}</h3>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "10px" }}>{t("seoCaMatrixAxes")}</div>
          <ResponsiveContainer width="100%" height={230}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis type="number" dataKey="x" name={t("seoCaEffort")} tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} />
              <YAxis type="number" dataKey="y" name={t("seoCaImpact")} domain={[0, 12]} tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={matrix} fill={INK} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function CoverageGroup({ title, color, entities, t, kind }: { title: string; color: string; entities: any[]; t: any; kind: "well" | "under" | "missing" }) {
  if (entities.length === 0) return null;
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ fontSize: "14px", fontWeight: 700, color, marginBottom: "10px" }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
        {entities.map((e, i) => (
          <div key={e.id || i} style={{ padding: "12px 14px", border: `1px solid ${color}40`, borderRadius: "10px", background: `${color}0d` }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: INK, marginBottom: "6px" }}>{e.name}</div>
            <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
              <span className="pill">{e.kind || "core"}</span>
              <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", color: "#fff", background: color }}>{e.importance || (kind === "missing" ? "high" : "")}</span>
            </div>
            {kind === "missing" ? (
              <Row2 a={[t("seoCaSimilarity"), (e.similarity ?? 0).toFixed(2)]} b={[t("seoCaRequiredTriplets"), String(e.required_triplets ?? 0)]} color={color} />
            ) : kind === "under" ? (
              <Row2 a={[t("seoCaTripletsGap"), `±${Math.max(0, Number(e.triplets_competitor_median || 0) - Number(e.triplets_current || 0))} ${t("seoCaNeeded")}`]} b={[t("seoCaCurrent"), `${e.triplets_current ?? 0} / ${e.triplets_competitor_median ?? 0}`]} color={color} />
            ) : (
              <Row2 a={[t("seoCaMentions"), String(e.mentions ?? 0)]} b={[t("seoCaTriplets"), String(e.triplets_current ?? 0)]} color={color} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row2({ a, b, color }: { a: [string, string]; b: [string, string]; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
      <div><div style={{ color: "var(--color-text-secondary)" }}>{a[0]}</div><div style={{ fontWeight: 700, color }}>{a[1]}</div></div>
      <div style={{ textAlign: "right" }}><div style={{ color: "var(--color-text-secondary)" }}>{b[0]}</div><div style={{ fontWeight: 700, color: INK }}>{b[1]}</div></div>
    </div>
  );
}

function RoadmapBucket({ title, items, t }: { title: string; items: any[]; t: any }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ fontSize: "13px", fontWeight: 700, color: INK, marginBottom: "8px", display: "flex", alignItems: "center", gap: "7px" }}><Flag size={14} /> {title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
        {items.map((r, i) => (
          <div key={r.id || i} style={{ padding: "12px 14px", border: "1px solid var(--color-border)", borderRadius: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: INK }}>{r.title}</div>
              <span className="pill" style={{ flexShrink: 0 }}>{TYPE_LABEL[r.type] || r.type}</span>
            </div>
            {r.id && <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "3px" }}>{r.id}</div>}
            <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "6px" }}>{Math.max(0, Number(r.words_to || 0))} {t("seoCaWords")} · {t("seoCaPriority")}: {((r.priority || 0) * 10).toFixed(1)}</div>
            {Array.isArray(r.entities) && r.entities.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "8px" }}>
                {r.entities.map((e: any, j: number) => <span key={j} className="pill">{e.name}</span>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── GUIDELINE ─────────────────────────── */
function Guideline({ report, keyword, t }: { report: any; keyword: string; t: any }) {
  const recs: any[] = [...(report.recommendations || [])].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const spec = useMemo(() => guidelineText(report, keyword, recs, t), [report, keyword, recs, t]);

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
        <CopyBtn text={spec} t={t} />
      </div>
      <div style={{ padding: "18px 20px", borderRadius: "12px", background: "var(--color-bg)", marginBottom: "16px" }}>
        <div style={{ fontSize: "18px", fontWeight: 700, color: INK }}>{t("seoCaGuidelineTitle")}</div>
        <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
          {t("seoCaMainKeyword")}: <b style={{ color: INK }}>{keyword}</b> &nbsp; · &nbsp; {t("seoCaTotalRecs")}: <b style={{ color: INK }}>{recs.length}</b>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {recs.map((r, i) => (
          <div key={r.id || i} style={{ border: "1px solid var(--color-border)", borderRadius: "12px", padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: INK }}>{i + 1}. {r.title}</div>
              <span style={{ flexShrink: 0, fontSize: "11px", fontWeight: 700, padding: "4px 10px", borderRadius: "20px", color: ORANGE, background: `${ORANGE}1a`, border: `1px solid ${ORANGE}55` }}>{t("seoCaPriority")}: {((r.priority || 0) * 10).toFixed(2)}/10</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", margin: "14px 0" }}>
              <Meta label={t("seoCaTargetWords")} value={`${r.words_from ?? 0} → ${r.words_to ?? 0}`} />
              <Meta label={t("seoCaSection")} value={r.section || "—"} />
              <Meta label={t("seoCaStatus")} value={TYPE_LABEL[r.type] || r.type} />
              <Meta label={t("seoCaPlacement")} value={r.placement || "—"} />
            </div>

            {r.copywriter_notes && (
              <div style={{ padding: "13px 15px", borderRadius: "10px", background: `${ORANGE}0d`, border: `1px solid ${ORANGE}33`, marginBottom: "14px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: ORANGE, marginBottom: "6px" }}>📝 {t("seoCaCopyNotes")}</div>
                <div style={{ fontSize: "13px", color: "var(--color-text-primary)", lineHeight: 1.6 }}>{r.copywriter_notes}</div>
              </div>
            )}

            {Array.isArray(r.keywords) && r.keywords.length > 0 && (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: INK, marginBottom: "8px" }}>🔑 {t("seoCaKeywordsLbl")}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>{r.keywords.map((k: string, j: number) => <span key={j} className="pill">{k}</span>)}</div>
              </div>
            )}

            {Array.isArray(r.entities) && r.entities.length > 0 && (
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: INK, marginBottom: "10px" }}>🎯 {t("seoCaEntitiesLbl")} ({r.entities.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {r.entities.map((e: any, j: number) => (
                    <div key={j} style={{ paddingLeft: "12px", borderLeft: `3px solid ${e.role === "primary" ? PURPLE : "var(--color-border)"}` }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: INK }}>{e.name} <span style={{ fontWeight: 500, color: "var(--color-text-secondary)" }}>— {e.role === "primary" ? t("seoCaPrimary") : t("seoCaSupporting")}</span></div>
                      {Array.isArray(e.required_triplets) && e.required_triplets.length > 0 && (
                        <div style={{ margin: "6px 0" }}>
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: "3px" }}>🔗 {t("seoCaRequiredTripletsLbl")}</div>
                          {e.required_triplets.map((tr: string, k: number) => <div key={k} style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{tr}</div>)}
                        </div>
                      )}
                      {e.how_to_cover && (
                        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.6, marginTop: "4px" }}><b style={{ color: INK }}>💡 {t("seoCaHowToCover")}:</b> {e.how_to_cover}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── COMPETITOR GAPS ─────────────────────────── */
function Gaps({ report, keyword, t }: { report: any; keyword: string; t: any }) {
  const gaps: any[] = report.competitor_gaps || [];
  const addN = gaps.filter(g => g.recommendation === "add").length;
  const expandN = gaps.filter(g => g.recommendation === "expand").length;
  const spec = useMemo(() => gapsText(report, keyword, gaps, t), [report, keyword, gaps, t]);

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
        <CopyBtn text={spec} t={t} />
      </div>
      <div style={{ padding: "16px 20px", borderRadius: "12px", background: `${ORANGE}0d`, border: `1px solid ${ORANGE}33`, marginBottom: "16px" }}>
        <div style={{ fontSize: "18px", fontWeight: 700, color: INK, display: "flex", alignItems: "center", gap: "9px" }}><AlertCircle size={20} color={ORANGE} /> {t("seoCaGapTitle")}</div>
        <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "8px" }}>
          {t("seoCaMainKeyword")}: <b style={{ color: INK }}>{keyword}</b> &nbsp;·&nbsp; {t("seoCaTotalGaps")}: <b style={{ color: INK }}>{gaps.length}</b> &nbsp;·&nbsp; {t("seoCaAddRecs")}: <b style={{ color: INK }}>{addN}</b> &nbsp;·&nbsp; {t("seoCaExpandRecs")}: <b style={{ color: INK }}>{expandN}</b>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {gaps.map((g, i) => {
          const rc = REC_COLOR[g.recommendation] || "var(--color-text-secondary)";
          return (
            <div key={g.id || i} style={{ border: "1px solid var(--color-border)", borderRadius: "12px", padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                <div style={{ fontSize: "16px", fontWeight: 700, color: INK }}>{g.title}</div>
                <span style={{ flexShrink: 0, fontSize: "11px", fontWeight: 700, padding: "4px 12px", borderRadius: "20px", color: "#fff", background: rc, textTransform: "uppercase" }}>{g.recommendation}</span>
              </div>

              <div style={{ margin: "12px 0", padding: "12px 14px", borderRadius: "10px", background: "var(--color-bg)", borderLeft: `3px solid ${rc}` }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: INK, display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}><Target size={13} /> {t("seoCaRecommendation")}: <span style={{ textTransform: "capitalize" }}>{g.recommendation}</span></div>
              </div>

              {g.reason && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: INK, marginBottom: "4px" }}>{t("seoCaReason")}:</div>
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{g.reason}</div>
                </div>
              )}

              {Array.isArray(g.found_in_competitors) && g.found_in_competitors.length > 0 && (
                <div style={{ marginBottom: "12px", padding: "12px 14px", borderRadius: "10px", background: `${BLUE}0d`, border: `1px solid ${BLUE}33` }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: INK, display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}><Link2 size={13} /> {t("seoCaFoundIn")}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {g.found_in_competitors.map((u: string, j: number) => (
                      <a key={j} href={u} target="_blank" rel="noreferrer" style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "16px", background: `${BLUE}1f`, color: BLUE, textDecoration: "none", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u} <ExternalLink size={10} style={{ display: "inline", verticalAlign: "middle" }} /></a>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(g.potential_entities) && g.potential_entities.length > 0 && (
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: INK, marginBottom: "8px" }}>{t("seoCaPotentialEntities")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {g.potential_entities.map((e: any, j: number) => (
                      <div key={j} style={{ paddingLeft: "12px", borderLeft: "3px solid var(--color-border)" }}>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: INK }}>{e.name} {e.id && <span style={{ fontWeight: 500, fontSize: "11px", color: "var(--color-text-tertiary)" }}>· {e.id}</span>} {Array.isArray(e.triplets) && <span style={{ fontWeight: 500, fontSize: "11px", color: "var(--color-text-tertiary)" }}>· {e.triplets.length} {t("seoCaTripletsCount")}</span>}</div>
                        {Array.isArray(e.triplets) && e.triplets.map((tr: string, k: number) => <div key={k} style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>• {tr}</div>)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── TASK CONSTRUCTOR ─────────────────────────── */
function Constructor({ report, t }: { report: any; t: any }) {
  const recs: any[] = report.recommendations || [];
  const gaps: any[] = report.competitor_gaps || [];
  const [selSi, setSelSi] = useState<Record<string, boolean>>({});
  const [selGap, setSelGap] = useState<Record<string, boolean>>({});

  const selectedCount = Object.values(selSi).filter(Boolean).length + Object.values(selGap).filter(Boolean).length;
  const spec = useMemo(() => {
    const chosenR = recs.filter(r => selSi[r.id]);
    const chosenG = gaps.filter(g => selGap[g.id]);
    if (!chosenR.length && !chosenG.length) return "";
    return guidelineText(report, report.main_keyword || report.keyword || "", chosenR, t) + (chosenG.length ? "\n\n" + gapsText(report, report.main_keyword || "", chosenG, t) : "");
  }, [selSi, selGap, recs, gaps, report, t]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h3 style={{ ...h3, margin: 0 }}>{t("seoCaSelectSubIntents")}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{t("seoCaSelected")}: <b style={{ color: INK }}>{selectedCount}</b></span>
            {spec && <CopyBtn text={spec} t={t} label={t("seoCaCopySelected")} />}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
          {recs.map((r, i) => {
            const on = !!selSi[r.id];
            return (
              <label key={r.id || i} style={{ ...selCard, borderColor: on ? PURPLE : "var(--color-border)", background: on ? `${PURPLE}0d` : "transparent" }}>
                <input type="checkbox" checked={on} onChange={e => setSelSi(s => ({ ...s, [r.id]: e.target.checked }))} style={{ marginTop: "2px" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: INK }}>{r.title}</div>
                  {r.id && <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "2px" }}>{r.id}</div>}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "7px" }}>
                    <span className="pill">{(r.entities?.length || 0)} {t("seoCaEntitiesCount")}</span>
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", color: INK, background: "#fff", border: "1px solid var(--color-border)", textTransform: "uppercase" }}>{t("seoCaProposed")}</span>
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", color: "#fff", background: INK }}>{t("seoCaPriority")}: {(r.priority || 0).toFixed(2)}</span>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h3 style={h3}>{t("seoCaSelectHeaders")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
          {gaps.map((g, i) => {
            const on = !!selGap[g.id];
            const rc = REC_COLOR[g.recommendation] || "var(--color-text-secondary)";
            return (
              <label key={g.id || i} style={{ ...selCard, borderColor: on ? PURPLE : "var(--color-border)", background: on ? `${PURPLE}0d` : "transparent" }}>
                <input type="checkbox" checked={on} onChange={e => setSelGap(s => ({ ...s, [g.id]: e.target.checked }))} style={{ marginTop: "2px" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: INK }}>{g.title}</div>
                  {g.id && <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "2px" }}>{g.id}</div>}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "7px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", color: "#fff", background: rc, textTransform: "uppercase" }}>{g.recommendation}</span>
                    <span className="pill">{(g.found_in_competitors?.length || 0)} {t("seoCaCompetitorsCount")}</span>
                    {!!(g.potential_entities?.length) && <span className="pill">{g.potential_entities.length} {t("seoCaEntitiesCount")}</span>}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── shared bits ─────────────────────────── */
const h3: React.CSSProperties = { fontSize: "16px", fontWeight: 700, color: INK, margin: "0 0 14px" };
const th: React.CSSProperties = { padding: "10px 8px", fontWeight: 700 };
const td: React.CSSProperties = { padding: "11px 8px" };
const tooltipStyle: React.CSSProperties = { background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px", color: "var(--color-text-primary)" };
const selCard: React.CSSProperties = { display: "flex", gap: "10px", alignItems: "flex-start", padding: "13px 14px", borderRadius: "11px", border: "1px solid var(--color-border)", cursor: "pointer" };

function Kpi({ label, value, sub, icon }: { label: string; value: any; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="panel" style={{ padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{label}</div>
        {icon}
      </div>
      <div style={{ fontSize: "30px", fontWeight: 800, color: INK, margin: "6px 0 2px" }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>{sub}</div>}
    </div>
  );
}

function Donut({ title, data }: { title: string; data: { name: string; value: number; color: string }[] }) {
  return (
    <div className="panel">
      <h3 style={h3}>{title}</h3>
      {data.length === 0 ? <div style={{ fontSize: "12px", color: "var(--color-text-tertiary)" }}>—</div> : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}
              label={(p: any) => `${p.name}: ${p.value}`} labelLine={{ stroke: "var(--color-border)" }} style={{ fontSize: 12 }}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: "flex", gap: "18px", justifyContent: "center", marginTop: "6px" }}>
      {items.map(([l, c], i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-text-secondary)" }}>
          <span style={{ width: 11, height: 11, borderRadius: "3px", background: c }} /> {l}
        </span>
      ))}
    </div>
  );
}

function RoadmapStat({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div style={{ padding: "14px 16px", borderRadius: "11px", border: `1px solid ${color}40`, background: `${color}0d` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{label}</span>
        <Flag size={15} color={color} />
      </div>
      <div style={{ fontSize: "26px", fontWeight: 800, color: INK, marginTop: "4px" }}>{n}</div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
      <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", flexShrink: 0 }}>{label}:</span>
      <span style={{ fontSize: "12px", fontWeight: 700, padding: "2px 9px", borderRadius: "7px", background: "var(--color-bg)", color: INK }}>{value}</span>
    </div>
  );
}

function CopyBtn({ text, t, label }: { text: string; t: any; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
      style={{ display: "flex", alignItems: "center", gap: "7px", padding: "8px 14px", borderRadius: "9px", border: `1px solid ${done ? GREEN : "var(--color-border)"}`, background: done ? "rgba(52,199,89,0.12)" : "var(--color-bg)", color: done ? GREEN : "var(--color-text-secondary)", fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
      {done ? <Check size={15} /> : <Copy size={15} />} {done ? t("seoCopied") : (label || t("seoCaCopy"))}
    </button>
  );
}

/* ─────────────────────────── copy text builders ─────────────────────────── */
function guidelineText(report: any, keyword: string, recs: any[], t: any): string {
  const lines: string[] = [];
  lines.push(t("seoCaGuidelineTitle"));
  lines.push(`${t("seoCaMainKeyword")}: ${keyword}`);
  lines.push(`${t("seoCaTotalRecs")}: ${recs.length}`);
  recs.forEach((r, i) => {
    lines.push("");
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`${t("seoCaPriority")}: ${((r.priority || 0) * 10).toFixed(2)}/10`);
    lines.push(`${t("seoCaTargetWords")}: ${r.words_from ?? 0} → ${r.words_to ?? 0}`);
    lines.push(`${t("seoCaStatus")}: ${TYPE_LABEL[r.type] || r.type}`);
    lines.push(`${t("seoCaSection")}: ${r.section || "—"}`);
    lines.push(`${t("seoCaPlacement")}: ${r.placement || "—"}`);
    if (r.copywriter_notes) lines.push(`${t("seoCaCopyNotes")}: ${r.copywriter_notes}`);
    if (r.keywords?.length) lines.push(`${t("seoCaKeywordsLbl")}: ${r.keywords.join(", ")}`);
    (r.entities || []).forEach((e: any) => {
      lines.push(`  - ${e.name} (${e.role})`);
      (e.required_triplets || []).forEach((tr: string) => lines.push(`    • ${tr}`));
      if (e.how_to_cover) lines.push(`    ${t("seoCaHowToCover")}: ${e.how_to_cover}`);
    });
  });
  return lines.join("\n");
}

function gapsText(report: any, keyword: string, gaps: any[], t: any): string {
  const lines: string[] = [];
  lines.push(t("seoCaGapTitle"));
  lines.push(`${t("seoCaMainKeyword")}: ${keyword}`);
  lines.push(`${t("seoCaTotalGaps")}: ${gaps.length}`);
  gaps.forEach(g => {
    lines.push("");
    lines.push(`${g.title} [${String(g.recommendation).toUpperCase()}]`);
    if (g.reason) lines.push(`${t("seoCaReason")}: ${g.reason}`);
    if (g.found_in_competitors?.length) { lines.push(`${t("seoCaFoundIn")}:`); g.found_in_competitors.forEach((u: string) => lines.push(`  ${u}`)); }
    (g.potential_entities || []).forEach((e: any) => {
      lines.push(`  ${e.name}${e.id ? ` (${e.id})` : ""}`);
      (e.triplets || []).forEach((tr: string) => lines.push(`    • ${tr}`));
    });
  });
  return lines.join("\n");
}
