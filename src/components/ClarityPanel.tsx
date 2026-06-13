"use client";

import { useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import {
  MousePointerClick, AlertCircle, ArrowLeft, ScrollText,
  Users, Clock, Code2, RefreshCw, ExternalLink, ChevronDown,
  ChevronUp, Sparkles, BookOpen, Info, Save, Eye, EyeOff,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClarityMetric {
  name: string;
  value: string | number;
  unit?: string;
}

interface PageRow {
  url: string;
  deadClicks: number;
  rageClicks: number;
  scrollDepth: number;
  sessions: number;
}

interface SnapshotData {
  traffic: any[];
  ux: any[];
  fetchedWith: { days: number };
}

interface Snapshot {
  fetchedAt: string;
  periodDays: number;
  data: SnapshotData;
}

// ─── Parse raw Clarity API response into summary metrics + page rows ──────────
function parseSnapshot(snapshot: Snapshot): { metrics: ClarityMetric[]; pages: PageRow[] } {
  const { traffic, ux } = snapshot.data;
  const all: any[] = [...(traffic || []), ...(ux || [])];

  let totalSessions = 0;
  let totalDeadClicks = 0;
  let totalRageClicks = 0;
  let totalQuickback = 0;
  let totalScrollDepth = 0;
  let scrollCount = 0;
  let totalEngagement = 0;
  let engagementCount = 0;
  let totalErrors = 0;

  const pageMap: Record<string, PageRow> = {};

  for (const metric of all) {
    const name: string = metric.metricName ?? "";
    const info: any[] = metric.information ?? [];

    for (const row of info) {
      const url: string = row.URL ?? row.url ?? "";
      if (!pageMap[url] && url) {
        pageMap[url] = { url, deadClicks: 0, rageClicks: 0, scrollDepth: 0, sessions: 0 };
      }

      if (name === "Traffic") {
        const s = Number(row.totalSessionCount ?? 0);
        totalSessions += s;
        if (url && pageMap[url]) pageMap[url].sessions += s;
      }
      if (name === "Dead Click Count") {
        const d = Number(row.DeadClickCount ?? row.deadClickCount ?? 0);
        totalDeadClicks += d;
        if (url && pageMap[url]) pageMap[url].deadClicks += d;
      }
      if (name === "Rage Click Count") {
        const r = Number(row.RageClickCount ?? row.rageClickCount ?? 0);
        totalRageClicks += r;
        if (url && pageMap[url]) pageMap[url].rageClicks += r;
      }
      if (name === "Quickback Click") {
        totalQuickback += Number(row.QuickbackClickCount ?? row.quickbackClickCount ?? 0);
      }
      if (name === "Scroll Depth") {
        const sd = Number(row.ScrollDepthPercentage ?? row.scrollDepthPercentage ?? 0);
        if (sd > 0) { totalScrollDepth += sd; scrollCount++; }
        if (url && pageMap[url]) pageMap[url].scrollDepth = sd;
      }
      if (name === "Engagement Time") {
        const et = Number(row.EngagementTime ?? row.engagementTime ?? 0);
        if (et > 0) { totalEngagement += et; engagementCount++; }
      }
      if (name === "Script Error Count") {
        totalErrors += Number(row.ScriptErrorCount ?? row.scriptErrorCount ?? 0);
      }
    }
  }

  const avgScroll = scrollCount > 0 ? Math.round(totalScrollDepth / scrollCount) : 0;
  const avgEngagement = engagementCount > 0 ? Math.round(totalEngagement / engagementCount) : 0;

  const metrics: ClarityMetric[] = [
    { name: "dead",       value: totalDeadClicks },
    { name: "rage",       value: totalRageClicks },
    { name: "quickback",  value: totalQuickback },
    { name: "scroll",     value: avgScroll,     unit: "%" },
    { name: "sessions",   value: totalSessions },
    { name: "engagement", value: avgEngagement, unit: "s" },
    { name: "errors",     value: totalErrors },
  ];

  const pages = Object.values(pageMap)
    .filter(p => p.url && (p.deadClicks > 0 || p.rageClicks > 0 || p.sessions > 0))
    .sort((a, b) => (b.deadClicks + b.rageClicks) - (a.deadClicks + a.rageClicks))
    .slice(0, 20);

  return { metrics, pages };
}

// ─── Small metric card ────────────────────────────────────────────────────────
function MetricCard({
  icon, label, desc, value, unit, warn,
}: {
  icon: React.ReactNode; label: string; desc: string;
  value: number; unit?: string; warn?: boolean;
}) {
  const color = warn && value > 0 ? "var(--color-accent-red)" : "var(--color-text-primary)";
  const bg    = warn && value > 0 ? "rgba(var(--color-accent-red-rgb,239,68,68),0.07)" : "var(--color-card)";

  return (
    <div style={{
      background: bg, border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-lg)", padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: "6px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--color-text-secondary)", fontSize: "12px" }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.5px", color }}>
        {value.toLocaleString()}{unit && <span style={{ fontSize: "14px", fontWeight: 400, marginLeft: "2px" }}>{unit}</span>}
      </div>
      <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: 1.4 }}>{desc}</div>
    </div>
  );
}

// ─── Setup instructions ───────────────────────────────────────────────────────
function SetupGuide() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(true);

  const steps = [
    { n: 1, text: t("clarityStep1"), link: "https://clarity.microsoft.com", linkLabel: "clarity.microsoft.com" },
    { n: 2, text: t("clarityStep2") },
    { n: 3, text: t("clarityStep3") },
    { n: 4, text: t("clarityStep4") },
    { n: 5, text: t("clarityStep5") },
    { n: 6, text: t("clarityStep6") },
  ];

  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: "24px" }}>
      {/* Header */}
      <button onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", padding: "14px 18px",
        background: "var(--color-card)", border: "none", cursor: "pointer",
        color: "var(--color-text-primary)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "14px" }}>
          <BookOpen size={16} color="var(--color-accent-blue)" />
          {t("claritySetupTitle")}
        </div>
        {open ? <ChevronUp size={16} color="var(--color-text-secondary)" /> : <ChevronDown size={16} color="var(--color-text-secondary)" />}
      </button>

      {open && (
        <div style={{ padding: "6px 18px 18px", background: "var(--color-card)", borderTop: "1px solid var(--color-border-soft)" }}>
          {/* What is / Why */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px", marginTop: "12px" }}>
            {[
              { title: t("clarityWhatIsTitle"), text: t("clarityWhatIsText") },
              { title: t("clarityWhyTitle"),    text: t("clarityWhyText") },
            ].map(({ title, text }) => (
              <div key={title} style={{
                background: "var(--color-bg)", border: "1px solid var(--color-border-soft)",
                borderRadius: "var(--radius-md)", padding: "12px 14px",
              }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-accent-blue)", marginBottom: "6px" }}>{title}</div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{text}</div>
              </div>
            ))}
          </div>

          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {steps.map(s => (
              <div key={s.n} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <div style={{
                  minWidth: "22px", height: "22px", borderRadius: "50%",
                  background: "var(--color-accent-blue)", color: "#fff",
                  fontSize: "11px", fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {s.n}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-primary)", lineHeight: 1.5, paddingTop: "2px" }}>
                  {s.text}
                  {s.link && (
                    <> — <a href={s.link} target="_blank" rel="noopener noreferrer"
                      style={{ color: "var(--color-accent-blue)", textDecoration: "none" }}>
                      {s.linkLabel} <ExternalLink size={10} style={{ display: "inline", verticalAlign: "middle" }} />
                    </a></>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* API limit note */}
          <div style={{
            marginTop: "14px", padding: "8px 12px",
            background: "rgba(255,159,10,0.08)", border: "1px solid rgba(255,159,10,0.25)",
            borderRadius: "var(--radius-md)", fontSize: "12px", color: "var(--color-accent-orange)",
            display: "flex", alignItems: "center", gap: "6px",
          }}>
            <Info size={12} /> {t("clarityApiLimit")}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ClarityPanel({ siteDbId }: { siteDbId: string }) {
  const { t } = useLanguage();

  const [configured, setConfigured]     = useState(false);
  const [snapshot, setSnapshot]         = useState<Snapshot | null>(null);
  const [loading, setLoading]           = useState(true);
  const [fetching, setFetching]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [fetchError, setFetchError]     = useState<string | null>(null);

  const [tokenInput, setTokenInput]     = useState("");
  const [projectIdInput, setProjectIdInput] = useState("");
  const [showToken, setShowToken]       = useState(false);
  const [projectId, setProjectId]       = useState<string | null>(null);

  const [aiAnalysis, setAiAnalysis]     = useState<string | null>(null);
  const [aiLoading, setAiLoading]       = useState(false);
  const [aiError, setAiError]           = useState(false);

  // ── Load config + latest snapshot ──────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clarity?siteId=${siteDbId}`);
      if (!res.ok) return;
      const data = await res.json();
      setConfigured(data.configured);
      setProjectId(data.clarityProjectId);
      if (data.clarityProjectId) setProjectIdInput(data.clarityProjectId);
      if (data.snapshot) setSnapshot(data.snapshot);
    } finally {
      setLoading(false);
    }
  }, [siteDbId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Save token + projectId ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!tokenInput.trim() && !projectIdInput.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/clarity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: siteDbId, action: "save",
          clarityToken: tokenInput.trim() || undefined,
          clarityProjectId: projectIdInput.trim() || undefined,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setConfigured(true);
        setProjectId(projectIdInput.trim());
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Fetch fresh Clarity data ────────────────────────────────────────────────
  const handleFetch = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/clarity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: siteDbId, action: "fetch", numOfDays: 3 }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "rate_limit") setFetchError("⚠️ " + data.message);
        else if (data.error === "unauthorized") setFetchError("❌ Invalid token");
        else setFetchError(data.message ?? "Error");
        return;
      }
      if (data.snapshot) setSnapshot(data.snapshot);
      setConfigured(true);
    } finally {
      setFetching(false);
    }
  };

  // ── AI analysis ─────────────────────────────────────────────────────────────
  const handleAiAnalysis = async () => {
    if (!snapshot) return;
    setAiLoading(true);
    setAiError(false);
    setAiAnalysis(null);
    try {
      const parsed = parseSnapshot(snapshot);
      const prompt = `You are a CRO and SEO expert. Analyze this Microsoft Clarity UX data and give actionable insights in 3-5 bullet points. Focus on the most critical issues first. Be specific about which pages need fixing and why. Data: ${JSON.stringify(parsed)}`;

      const res = await fetch("/api/gsc/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) { setAiError(true); return; }
      const data = await res.json();
      setAiAnalysis(data.summary ?? data.result ?? "");
    } catch {
      setAiError(true);
    } finally {
      setAiLoading(false);
    }
  };

  // ── Derived metrics ─────────────────────────────────────────────────────────
  const parsed = snapshot ? parseSnapshot(snapshot) : null;

  const metricDefs = [
    { name: "dead",       icon: <MousePointerClick size={14} />, label: t("clarityMetricDeadClicks"),  desc: t("clarityMetricDeadClicksDesc"),  warn: true },
    { name: "rage",       icon: <AlertCircle size={14} />,       label: t("clarityMetricRageClicks"),   desc: t("clarityMetricRageClicksDesc"),  warn: true },
    { name: "quickback",  icon: <ArrowLeft size={14} />,         label: t("clarityMetricQuickback"),    desc: t("clarityMetricQuickbackDesc"),   warn: true },
    { name: "scroll",     icon: <ScrollText size={14} />,        label: t("clarityMetricScroll"),       desc: t("clarityMetricScrollDesc"),      warn: false },
    { name: "sessions",   icon: <Users size={14} />,             label: t("clarityMetricSessions"),     desc: "",                                warn: false },
    { name: "engagement", icon: <Clock size={14} />,             label: t("clarityMetricEngagement"),   desc: "",                                warn: false },
    { name: "errors",     icon: <Code2 size={14} />,             label: t("clarityMetricErrors"),       desc: "",                                warn: true },
  ];

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "14px" }}>
        <RefreshCw size={20} style={{ animation: "spin 1s linear infinite", marginBottom: "8px" }} />
        <div>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* Page header */}
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.3px", margin: 0 }}>
          {t("clarityTitle")}
        </h2>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: "4px 0 0" }}>
          {t("claritySubtitle")}
        </p>
      </div>

      {/* Setup guide (collapsible) */}
      <SetupGuide />

      {/* Token config form */}
      <div style={{
        background: "var(--color-card)", border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)", padding: "20px", marginBottom: "24px",
      }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
          <Info size={14} color="var(--color-accent-blue)" />
          {configured ? `✅ ${t("clarityConnected")}` : t("clarityNotConfigured")}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
          {/* Token field */}
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {t("clarityTokenLabel")}
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showToken ? "text" : "password"}
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder={t("clarityTokenPlaceholder")}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "8px 36px 8px 10px", borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)", background: "var(--color-bg)",
                  color: "var(--color-text-primary)", fontSize: "13px",
                }}
              />
              <button onClick={() => setShowToken(s => !s)} style={{
                position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", padding: 0,
              }}>
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Project ID field */}
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {t("clarityProjectIdLabel")}
            </label>
            <input
              type="text"
              value={projectIdInput}
              onChange={e => setProjectIdInput(e.target.value)}
              placeholder={t("clarityProjectIdPlaceholder")}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "8px 10px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)", background: "var(--color-bg)",
                color: "var(--color-text-primary)", fontSize: "13px",
              }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={handleSave} disabled={saving || (!tokenInput.trim() && !projectIdInput.trim())} style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "8px 18px", borderRadius: "9999px",
            background: "var(--color-accent-blue)", color: "#fff",
            border: "none", fontSize: "13px", fontWeight: 500, cursor: "pointer",
            opacity: saving || (!tokenInput.trim() && !projectIdInput.trim()) ? 0.5 : 1,
          }}>
            <Save size={13} />
            {saved ? t("claritySaved") : saving ? t("claritySaving") : t("claritySave")}
          </button>

          <button onClick={handleFetch} disabled={fetching || !configured} style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "8px 18px", borderRadius: "9999px",
            background: "transparent", color: "var(--color-text-primary)",
            border: "1px solid var(--color-border)", fontSize: "13px", fontWeight: 500, cursor: "pointer",
            opacity: fetching || !configured ? 0.5 : 1,
          }}>
            <RefreshCw size={13} style={fetching ? { animation: "spin 1s linear infinite" } : {}} />
            {fetching ? t("clarityFetching") : snapshot ? t("clarityRefresh") : t("clarityFetch")}
          </button>

          {projectId && (
            <a href={`https://clarity.microsoft.com/projects/view/${projectId}/dashboard`}
              target="_blank" rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: "5px",
                fontSize: "12px", color: "var(--color-accent-blue)", textDecoration: "none",
              }}>
              <ExternalLink size={12} /> {t("clarityOpen")}
            </a>
          )}

          {snapshot && (
            <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginLeft: "auto" }}>
              {t("clarityLastUpdate")} {new Date(snapshot.fetchedAt).toLocaleString()}
            </span>
          )}
        </div>

        {fetchError && (
          <div style={{ marginTop: "10px", padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--radius-md)", fontSize: "12px", color: "var(--color-accent-red)" }}>
            {fetchError}
          </div>
        )}
      </div>

      {/* No data placeholder */}
      {!snapshot && (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--color-text-secondary)", fontSize: "14px" }}>
          <MousePointerClick size={36} style={{ opacity: 0.3, marginBottom: "12px" }} />
          <div>{configured ? t("clarityNoData") : t("clarityNotConfigured")}</div>
        </div>
      )}

      {/* Metrics grid */}
      {parsed && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px", marginBottom: "24px" }}>
            {metricDefs.map(def => {
              const m = parsed.metrics.find(x => x.name === def.name);
              return (
                <MetricCard
                  key={def.name}
                  icon={def.icon}
                  label={def.label}
                  desc={def.desc}
                  value={Number(m?.value ?? 0)}
                  unit={m?.unit}
                  warn={def.warn}
                />
              );
            })}
          </div>

          {/* Top problem pages table */}
          {parsed.pages.length > 0 && (
            <div style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: "24px" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--color-border-soft)", fontWeight: 600, fontSize: "14px", color: "var(--color-text-primary)" }}>
                {t("clarityTopPages")}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ background: "var(--color-bg)" }}>
                      {[t("clarityColUrl"), t("clarityColDead"), t("clarityColRage"), t("clarityColScroll"), t("clarityColSessions")].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: h === t("clarityColUrl") ? "left" : "right", color: "var(--color-text-secondary)", fontWeight: 500, fontSize: "11px", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.pages.map((p, i) => (
                      <tr key={p.url} style={{ borderTop: "1px solid var(--color-border-soft)", background: i % 2 === 0 ? "transparent" : "var(--color-bg)" }}>
                        <td style={{ padding: "8px 12px", color: "var(--color-text-primary)", maxWidth: "320px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span title={p.url}>{p.url.replace(/^https?:\/\/[^/]+/, "")}</span>
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: p.deadClicks > 0 ? "var(--color-accent-red)" : "var(--color-text-secondary)", fontWeight: p.deadClicks > 0 ? 600 : 400 }}>
                          {p.deadClicks}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: p.rageClicks > 0 ? "var(--color-accent-orange)" : "var(--color-text-secondary)", fontWeight: p.rageClicks > 0 ? 600 : 400 }}>
                          {p.rageClicks}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--color-text-primary)" }}>
                          {p.scrollDepth > 0 ? `${p.scrollDepth}%` : "—"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--color-text-secondary)" }}>
                          {p.sessions.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AI Analysis section */}
          <div style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: aiAnalysis ? "14px" : 0 }}>
              <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Sparkles size={15} color="var(--color-accent-blue)" />
                {t("clarityAnalysisTitle")}
              </div>
              <button onClick={handleAiAnalysis} disabled={aiLoading} style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "7px 16px", borderRadius: "9999px",
                background: "var(--color-accent-blue)", color: "#fff",
                border: "none", fontSize: "12px", fontWeight: 500, cursor: "pointer",
                opacity: aiLoading ? 0.6 : 1,
              }}>
                <Sparkles size={12} />
                {aiLoading ? t("clarityAnalyzing") : t("clarityAnalyzeBtn")}
              </button>
            </div>

            {aiError && (
              <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.08)", borderRadius: "var(--radius-md)", fontSize: "13px", color: "var(--color-accent-red)" }}>
                {t("clarityAnalysisError")}
              </div>
            )}

            {aiAnalysis && (
              <div style={{
                padding: "14px 16px", background: "var(--color-bg)",
                border: "1px solid var(--color-border-soft)", borderRadius: "var(--radius-md)",
                fontSize: "13px", color: "var(--color-text-primary)", lineHeight: 1.7,
                whiteSpace: "pre-wrap",
              }}>
                {aiAnalysis}
              </div>
            )}

            {!aiAnalysis && !aiError && (
              <p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--color-text-secondary)" }}>
                {t("claritySubtitle")}
              </p>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
