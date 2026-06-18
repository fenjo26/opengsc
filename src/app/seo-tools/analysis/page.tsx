"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Loader2, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { GapReport } from "@/components/SeoRenderers";
import { getSeoGenCreds, getSerpCreds, getFirecrawlKey } from "@/lib/seo/keys";
import { COUNTRIES, LANGUAGES } from "@/lib/seo/regions";
import { addHistory, takeView } from "@/lib/seo/history";

const card = "panel";
const inputStyle = "tool-input";

function Field({ l, children }: { l: string; children: React.ReactNode }) { return <div><span className="tool-field-label">{l}</span>{children}</div>; }

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

  const ai = typeof window !== "undefined" ? getSeoGenCreds() : { provider: "", apiKey: "", model: "" };
  const serpCreds = typeof window !== "undefined" ? getSerpCreds() : { provider: "", apiKey: "" };

  useEffect(() => {
    const v = takeView();
    if (v?.type === "analysis") { setReport(v.data); if (v.data?.keyword) setKeyword(v.data.keyword); if (v.data?.target_url) setTargetUrl(v.data.target_url); }
  }, []);

  async function run() {
    setErr(""); setReport(null);
    if (!keyword.trim() || !targetUrl.trim()) { setErr(t("seoErrFillKwUrl")); return; }
    const { provider: sp, apiKey: sk } = getSerpCreds();
    const { provider: ap, apiKey: ak, model: am } = getSeoGenCreds();
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
        body: JSON.stringify({ keyword, targetPage, competitors, aiProvider: ap, aiApiKey: ak, model: am || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error === "parse_failed" ? t("seoErrParseJsonShort") : (data.error || t("seoErrAnalysis"))); setLoading(false); return; }
      setReport(data.report);
      addHistory({ type: "analysis", keyword: keyword || targetUrl, data: data.report });
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
          <Field l={t("seoCountry")}>
            <select className={inputStyle} value={country} onChange={e => setCountry(e.target.value)}>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </Field>
          <Field l={t("seoLanguage")}>
            <select className={inputStyle} value={language} onChange={e => setLanguage(e.target.value)}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </Field>
          <Field l="Top N"><select className={inputStyle} value={topN} onChange={e => setTopN(Number(e.target.value))}>{[5, 10, 15].map(n => <option key={n} value={n}>{n}</option>)}</select></Field>
          <button onClick={run} disabled={loading} style={{ padding: "9px 18px", borderRadius: "8px", border: "none", cursor: "pointer", background: "var(--color-accent-purple)", color: "#fff", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "7px", height: "38px" }}>
            {loading ? <Loader2 size={15} className="spin" /> : <Search size={15} />} {t("seoAnalyze")}
          </button>
        </div>
        {loading && stage && <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "7px" }}><Loader2 size={13} className="spin" /> {stage}</div>}
      </div>

      {err && <div className={card} style={{ borderColor: "rgba(255,69,58,0.35)", background: "rgba(255,69,58,0.06)", color: "var(--color-accent-red)", fontSize: "13px", display: "flex", gap: "8px", alignItems: "center" }}><AlertTriangle size={16} /> {err}</div>}

      {report && <GapReport report={report} />}
    </div>
  );
}
