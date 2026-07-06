"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface StrikingKeyword {
  query: string; page: string; fullUrl: string;
  impressions: number; clicks: number; ctr: number; position: number;
}

type SortKey = "impressions" | "clicks" | "position" | "ctr";

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtK(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }

function posColor(p: number) {
  if (p <= 5)  return "#10B981";
  if (p <= 10) return "#F59E0B";
  if (p <= 15) return "#F97316";
  return "#EF4444";
}

// Position "closeness" badge: how many positions away from page 1 top-10
function proximityLabel(pos: number): { label: string; color: string; bg: string } {
  if (pos <= 5)  return { label: "Top 5 🎯",  color: "#10B981", bg: "rgba(16,185,129,0.1)" };
  if (pos <= 10) return { label: "Page 1",     color: "#3B82F6", bg: "rgba(59,130,246,0.1)" };
  if (pos <= 15) return { label: "~Page 2",    color: "#F97316", bg: "rgba(249,115,22,0.1)" };
  return             { label: "Page 2+",       color: "#EF4444", bg: "rgba(239,68,68,0.1)"  };
}

// ─── Info block ────────────────────────────────────────────────────────────────
function InfoBlock({
  posFrom, setPosFrom, posTo, setPosTo, days, setDays,
}: {
  posFrom: number; setPosFrom: (v: number) => void;
  posTo: number;   setPosTo:   (v: number) => void;
  days: number;    setDays:    (v: number) => void;
}) {
  const { t } = useLanguage();
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px",
      padding: "24px 28px", borderBottom: "1px solid var(--color-border)",
      background: "var(--color-card)",
    }}>
      {/* Position range + period */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "rgba(245,158,11,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="20" x2="12" y2="10"/><line x1="12" y1="6" x2="12" y2="6"/>
              <polyline points="8 14 12 10 16 14"/>
            </svg>
          </div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("sdkPosRange")}</span>
        </div>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: "1.6", margin: "0 0 16px" }}>
          {t("sdkPosRangeDesc")}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>{t("sdkFrom")}</span>
          <input type="number" value={posFrom} min={1} max={100}
            onChange={e => setPosFrom(Math.max(1, Number(e.target.value)))}
            style={{ width: "70px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)", fontSize: "14px", fontWeight: 600, outline: "none", textAlign: "center" }} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>{t("sdkTo")}</span>
          <input type="number" value={posTo} min={1} max={100}
            onChange={e => setPosTo(Math.max(1, Number(e.target.value)))}
            style={{ width: "70px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)", fontSize: "14px", fontWeight: 600, outline: "none", textAlign: "center" }} />
        </div>
        <div style={{ marginTop: "14px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "13px", color: "var(--color-text-secondary)", fontWeight: 500 }}>Period:</span>
          {([30, 60, 90, 180] as const).map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: "4px 11px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
              border: `1px solid ${days === d ? "#F59E0B" : "var(--color-border)"}`,
              background: days === d ? "rgba(245,158,11,0.1)" : "transparent",
              color: days === d ? "#F59E0B" : "var(--color-text-secondary)",
              cursor: "pointer", transition: "all 0.15s",
            }}>{d}d</button>
          ))}
        </div>
      </div>

      {/* What to do */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("cdmWhatToDo")}</span>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
          {[t("sdkWhatToDo1"), t("sdkWhatToDo2")].map((text, i) => (
            <li key={i} style={{ display: "flex", gap: "10px", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: "1.55" }}>
              <span style={{ width: "18px", height: "18px", borderRadius: "50%", background: "rgba(16,185,129,0.1)", color: "#10B981", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>{i + 1}</span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Table ─────────────────────────────────────────────────────────────────────
function KeywordsTable({ data, loading, siteDbId }: { data: StrikingKeyword[]; loading: boolean; siteDbId: string }) {
  const { t } = useLanguage();
  const [search,  setSearch]  = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("impressions");

  // Rank tracker integration: one-click "Track" per keyword
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!siteDbId) return;
    fetch(`/api/rank/keywords?siteId=${encodeURIComponent(siteDbId)}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.keywords)) setTracked(new Set(d.keywords.map((k: any) => String(k.keyword).toLowerCase()))); })
      .catch(() => {});
  }, [siteDbId]);

  const track = (query: string) => {
    const kw = query.trim().toLowerCase();
    if (!kw || tracked.has(kw) || !siteDbId) return;
    setTracked(prev => new Set(prev).add(kw));
    fetch("/api/rank/keywords", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: siteDbId, keywords: [kw] }),
    })
      .then(() => fetch("/api/rank/check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: siteDbId }),
      }))
      .catch(() => {});
  };

  const filtered = useMemo(() =>
    data
      .filter(k => !search || k.query.toLowerCase().includes(search.toLowerCase()) || k.page.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => sortKey === "position" ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]),
    [data, search, sortKey]
  );

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button onClick={() => setSortKey(k)} style={{
      padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
      border: `1px solid ${sortKey === k ? "#3B82F6" : "var(--color-border)"}`,
      background: sortKey === k ? "rgba(59,130,246,0.1)" : "transparent",
      color: sortKey === k ? "#3B82F6" : "var(--color-text-secondary)",
      cursor: "pointer", transition: "all 0.15s",
    }}>{label}</button>
  );

  return (
    <div style={{ padding: "20px 28px" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: "320px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t("sdkSearch")}
            style={{ width: "100%", padding: "7px 12px 7px 30px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{t("kcSortBy")}</span>
          <SortBtn k="impressions" label={t("impressions")} />
          <SortBtn k="clicks"      label={t("clicks")} />
          <SortBtn k="position"    label={t("position")} />
          <SortBtn k="ctr"         label="CTR" />
        </div>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-text-secondary)" }}>
            <div style={{ width: "14px", height: "14px", border: "2px solid var(--color-border)", borderTopColor: "#F59E0B", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
      </div>

      {/* Summary badge */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: "20px", background: "rgba(245,158,11,0.1)", fontSize: "12px", fontWeight: 600, color: "#F59E0B" }}>
          {filtered.length} {t("sdkBadge")}
        </div>
      </div>

      {/* Table header */}
      <div style={{
        display: "grid", gridTemplateColumns: "1.5fr 1fr 100px 90px 90px 80px 90px",
        padding: "8px 14px", background: "var(--color-bg)",
        borderRadius: "8px 8px 0 0", border: "1px solid var(--color-border)", borderBottom: "none",
        fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)",
        textTransform: "uppercase", letterSpacing: "0.05em", gap: "10px",
      }}>
        <div>{t("sdkColQuery")}</div>
        <div>{t("cdmPage")}</div>
        <div>Proximity</div>
        <div style={{ textAlign: "right" }}>{t("impressions")}</div>
        <div style={{ textAlign: "right" }}>{t("clicks")}</div>
        <div style={{ textAlign: "right" }}>CTR</div>
        <div style={{ textAlign: "right" }}>{t("position")}</div>
      </div>

      {/* Rows */}
      {!loading && filtered.length === 0 ? (
        <div style={{ border: "1px solid var(--color-border)", borderRadius: "0 0 8px 8px", padding: "60px 32px", textAlign: "center", background: "var(--color-card)" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>🎯</div>
          <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 6px" }}>
            No keywords in this range
          </p>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0 }}>
            Try adjusting the position range or syncing GSC data first.
          </p>
        </div>
      ) : (
        <div style={{ border: "1px solid var(--color-border)", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
          {filtered.map((item, i) => {
            const prox = proximityLabel(item.position);
            return (
              <div key={`${item.query}-${item.page}-${i}`} style={{
                display: "grid", gridTemplateColumns: "1.5fr 1fr 100px 90px 90px 80px 90px",
                padding: "11px 14px", gap: "10px",
                borderBottom: i < filtered.length - 1 ? "1px solid var(--color-border)" : "none",
                background: i % 2 === 0 ? "var(--color-card)" : "rgba(255,255,255,0.02)",
                alignItems: "center", fontSize: "13px",
              }}>
                {/* Query */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                  {tracked.has(item.query.toLowerCase()) ? (
                    <span title={t("rankTracked")} style={{ color: "#10B981", flexShrink: 0, fontSize: "12px" }}>✓</span>
                  ) : (
                    <button onClick={() => track(item.query)} title={t("rankTrack")}
                      style={{ width: "17px", height: "17px", borderRadius: "4px", border: "1px solid var(--color-border)", background: "none", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: "12px", lineHeight: 1, padding: 0, flexShrink: 0 }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#3B82F6"; e.currentTarget.style.borderColor = "#3B82F6"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--color-text-secondary)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}>+</button>
                  )}
                  <span style={{ fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.query}>
                    {item.query}
                  </span>
                </div>
                {/* Page */}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", overflow: "hidden" }}>
                  <a href={item.fullUrl} target="_blank" rel="noreferrer"
                    style={{ color: "#3B82F6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textDecoration: "none" }}
                    title={item.fullUrl}
                    onMouseOver={e => (e.currentTarget.style.textDecoration = "underline")}
                    onMouseOut={e => (e.currentTarget.style.textDecoration = "none")}
                  >{item.page}</a>
                  <ExternalLink size={11} style={{ flexShrink: 0, opacity: 0.4 }} />
                </div>
                {/* Proximity badge */}
                <div>
                  <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "20px", color: prox.color, background: prox.bg, whiteSpace: "nowrap" }}>
                    {prox.label}
                  </span>
                </div>
                {/* Metrics */}
                <div style={{ textAlign: "right", fontWeight: 600 }}>{fmtK(item.impressions)}</div>
                <div style={{ textAlign: "right", color: "var(--color-text-secondary)" }}>{item.clicks}</div>
                <div style={{ textAlign: "right", color: "var(--color-text-secondary)" }}>{item.ctr}%</div>
                <div style={{ textAlign: "right", fontWeight: 700, color: posColor(item.position) }}>
                  {item.position.toFixed(1)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────
export default function StrikingDistanceKeywords({ siteDbId }: { siteDbId: string }) {
  const [posFrom, setPosFrom] = useState(4);
  const [posTo,   setPosTo]   = useState(20);
  const [days,    setDays]    = useState(90);

  const [keywords, setKeywords] = useState<StrikingKeyword[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async (from: number, to: number, d: number) => {
    if (!siteDbId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(
        `/api/gsc/striking?siteId=${encodeURIComponent(siteDbId)}&posFrom=${from}&posTo=${to}&days=${d}&minImpressions=10&limit=200`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setKeywords(data.keywords ?? []);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [siteDbId]);

  // Debounce position changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(posFrom, posTo, days), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [posFrom, posTo, days, fetchData]);

  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "12px", overflow: "hidden", marginTop: "20px", background: "var(--color-card)" }}>
      {error && (
        <div style={{ padding: "10px 20px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontSize: "12px", color: "#f87171" }}>
          {error}
        </div>
      )}
      <InfoBlock posFrom={posFrom} setPosFrom={setPosFrom} posTo={posTo} setPosTo={setPosTo} days={days} setDays={setDays} />
      <KeywordsTable data={keywords} loading={loading} siteDbId={siteDbId} />
    </div>
  );
}
