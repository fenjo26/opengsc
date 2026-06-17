"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Loader2, AlertTriangle, BarChart3 } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { getAiCreds, getSerpCreds, getFirecrawlKey, getSeoModel } from "@/lib/seo/keys";

const card = "panel";
const inputStyle = "tool-input";
const PRI: Record<string, string> = { high: "#ff453a", medium: "#ff9f0a", low: "#34c759" };

function Field({ l, children }: { l: string; children: React.ReactNode }) { return <div><span className="tool-field-label">{l}</span>{children}</div>; }
function Pri({ p }: { p: string }) { return <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", color: PRI[p] || "#888", background: `${PRI[p] || "#888"}1a`, textTransform: "uppercase" }}>{p}</span>; }

export default function AnalysisPage() {
  const { t } = useLanguage();
  const [keyword, setKeyword] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [country, setCountry] = useState("us");
  const [language, setLanguage] = useState("en");
  const [topN, setTopN] = useState(10);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [err, setErr] = useState("");
  const [report, setReport] = useState<any>(null);

  const ai = typeof window !== "undefined" ? getAiCreds() : { provider: "", apiKey: "" };
  const serpCreds = typeof window !== "undefined" ? getSerpCreds() : { provider: "", apiKey: "" };

  async function run() {
    setErr(""); setReport(null);
    if (!keyword.trim() || !targetUrl.trim()) { setErr(t("seoErrFillKwUrl")); return; }
    const { provider: sp, apiKey: sk } = getSerpCreds();
    const { provider: ap, apiKey: ak } = getAiCreds();
    if (!sk) { setErr(t("seoErrNoSerpKey")); return; }
    if (!ak) { setErr(t("seoErrNoAiKey")); return; }
    setLoading(true);
    try {
      setStage(t("seoStageSerp"));
      const serpRes = await fetch("/api/seo/serp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, provider: sp, apiKey: sk, gl: country, hl: language, num: topN }),
      });
      const serpData = await serpRes.json();
      if (!serpRes.ok) { setErr(serpData.error || t("seoErrSerp")); setLoading(false); return; }
      const items = (serpData.results || []).filter((r: any) => r.domain !== new URL(targetUrl).hostname.replace(/^www\./, ""));

      setStage(t("seoStageScrape"));
      const fc = getFirecrawlKey();
      const [compScrape, targetScrape] = await Promise.all([
        fetch("/api/seo/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: items.slice(0, topN).map((r: any) => r.url), firecrawlKey: fc }) }).then(r => r.json()),
        fetch("/api/seo/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: [targetUrl], firecrawlKey: fc }) }).then(r => r.json()),
      ]);
      const pages = compScrape.pages || [];
      const target = (targetScrape.pages || [])[0];

      const competitors = items.slice(0, topN).map((s: any) => {
        const p = pages.find((x: any) => x.url === s.url);
        return { position: s.position, url: s.url, site_type: s.site_type || undefined, title: p?.title || s.title, headings: p?.headings || [], word_count: p?.wordCount || 0, has_price_table: !!p?.hasPriceTable, has_faq: !!p?.hasFaq };
      });
      const targetPage = { url: targetUrl, title: target?.title, meta: target?.metaDescription, headings: target?.headings || [], word_count: target?.wordCount || 0, has_price_table: !!target?.hasPriceTable, has_faq: !!target?.hasFaq, text_sample: target?.textSample };

      setStage(t("seoStageGap"));
      const res = await fetch("/api/seo/analysis", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, targetPage, competitors, aiProvider: ap, aiApiKey: ak, model: getSeoModel() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error === "parse_failed" ? t("seoErrParseJsonShort") : (data.error || t("seoErrAnalysis"))); setLoading(false); return; }
      setReport(data.report);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setLoading(false); setStage("");
  }

  const noKeys = !serpCreds.apiKey || !ai.apiKey;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {noKeys && (
        <div className={card} style={{ borderColor: "rgba(255,159,10,0.35)", background: "rgba(255,159,10,0.06)", display: "flex", gap: "10px", alignItems: "center", fontSize: "13px", color: "var(--color-text-secondary)" }}>
          <AlertTriangle size={18} color="var(--color-accent-orange)" /> {t("seoNeedKeysPrefix")} <b>{t("seoSerpProviderLabel")}</b> + <b>{t("seoAiProviderLabel")}</b>. <Link href="/settings" style={{ color: "var(--color-accent-blue)" }}>{t("seoSettingsShort")}</Link>
        </div>
      )}

      <div className={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <Field l={t("seoYourPageUrl")}><input className={inputStyle} value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder="https://example.com/page" /></Field>
          <Field l={t("seoKeywordRanks")}><input className={inputStyle} value={keyword} onChange={e => setKeyword(e.target.value)} placeholder={t("seoKeywordRanksPh")} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "12px", alignItems: "end" }}>
          <Field l={t("seoCountry")}><input className={inputStyle} value={country} onChange={e => setCountry(e.target.value)} /></Field>
          <Field l={t("seoLanguage")}><input className={inputStyle} value={language} onChange={e => setLanguage(e.target.value)} /></Field>
          <Field l="Top N"><select className={inputStyle} value={topN} onChange={e => setTopN(Number(e.target.value))}>{[5, 10, 15].map(n => <option key={n} value={n}>{n}</option>)}</select></Field>
          <button onClick={run} disabled={loading} style={{ padding: "9px 18px", borderRadius: "8px", border: "none", cursor: "pointer", background: "var(--color-accent-purple)", color: "#fff", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "7px", height: "38px" }}>
            {loading ? <Loader2 size={15} className="spin" /> : <Search size={15} />} {t("seoAnalyze")}
          </button>
        </div>
        {loading && stage && <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "7px" }}><Loader2 size={13} className="spin" /> {stage}</div>}
      </div>

      {err && <div className={card} style={{ borderColor: "rgba(255,69,58,0.35)", background: "rgba(255,69,58,0.06)", color: "var(--color-accent-red)", fontSize: "13px", display: "flex", gap: "8px", alignItems: "center" }}><AlertTriangle size={16} /> {err}</div>}

      {report && (
        <div className={card}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 6px", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <BarChart3 size={18} color="var(--color-accent-purple)" /> {t("seoGapReport")}
          </h3>
          {report.summary && <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: "16px" }}>{report.summary}</p>}

          {report.prioritized_actions?.length > 0 && (
            <Section title={t("seoPriorityActions")}>
              <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "var(--color-text-primary)", lineHeight: 1.8 }}>
                {report.prioritized_actions.map((a: string, i: number) => <li key={i}>{a.replace(/^\d+\.\s*/, "")}</li>)}
              </ol>
            </Section>
          )}

          {report.ai_visibility && (
            <Section title={t("seoAiVisibility")}>
              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                {report.ai_visibility.cited_source_types_in_serp?.length > 0 && <div><b style={{ color: "var(--color-text-primary)" }}>{t("seoWhoAiCites")}</b> {report.ai_visibility.cited_source_types_in_serp.join(", ")}</div>}
                {report.ai_visibility.brand_external_presence && <div><b style={{ color: "var(--color-text-primary)" }}>{t("seoBrandPresence")}</b> {report.ai_visibility.brand_external_presence}</div>}
                {report.ai_visibility.main_gap && <div style={{ marginTop: "4px" }}>🎯 <b style={{ color: "var(--color-text-primary)" }}>{t("seoMainGap")}</b> {report.ai_visibility.main_gap} {report.ai_visibility.priority && <Pri p={report.ai_visibility.priority} />}</div>}
              </div>
            </Section>
          )}

          {report.content_gaps?.length > 0 && (
            <Section title={t("seoContentGaps")}>
              {report.content_gaps.map((g: any, i: number) => (
                <Row key={i} pri={g.priority}><b>{g.type}:</b> {g.item}</Row>
              ))}
            </Section>
          )}

          {report.extractable_fact_gaps?.length > 0 && (
            <Section title={t("seoFactGaps")}>
              {report.extractable_fact_gaps.map((g: any, i: number) => (
                <Row key={i} pri={g.priority}>
                  <b>{g.fact}</b> — {t("seoCompetitorHas")} {g.competitor_has || "—"}; {t("seoYouHave")} {g.target_has || "—"}. {g.fix && <span style={{ color: "var(--color-accent-green)" }}>→ {g.fix}</span>}
                </Row>
              ))}
            </Section>
          )}

          {report.front_loading?.issue && (
            <Section title={t("seoFrontLoading")}>
              <Row pri={report.front_loading.priority}>{report.front_loading.issue}</Row>
            </Section>
          )}

          {report.quality_issues?.length > 0 && (
            <Section title={t("seoQuality")}>
              {report.quality_issues.map((q: any, i: number) => <Row key={i} pri={q.priority}>{q.issue}</Row>)}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--color-border)" }}>
      <div className="tool-section-label" style={{ marginBottom: "10px" }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ pri, children }: { pri?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "9px", padding: "8px 0", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
      {pri && <span style={{ marginTop: "2px" }}><Pri p={pri} /></span>}
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
