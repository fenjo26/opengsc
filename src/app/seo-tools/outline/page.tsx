"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, Loader2, Check, AlertTriangle, Wand2, Copy, Plus, X,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { OutlineView } from "@/components/SeoRenderers";
import SeoJobProgress from "@/components/SeoJobProgress";
import SeoRecentList from "@/components/SeoRecentList";
import { getSeoGenCreds, getSerpCreds, getFirecrawlKey, getDataForSeoKey, loadPolicies, getActivePolicyName } from "@/lib/seo/keys";
import { COUNTRIES, LANGUAGES } from "@/lib/seo/regions";
import { TONES, toneToPrompt } from "@/lib/seo/tones";
import { OUTLINE_TEMPLATES } from "@/lib/seo/templates";
import { addHistory, takeView } from "@/lib/seo/history";
import { startJob, importJob } from "@/lib/seo/jobs";

const card = "panel";
const inputStyle = "tool-input";

function Field({ l, children }: { l: string; children: React.ReactNode }) {
  return <div><span className="tool-field-label">{l}</span>{children}</div>;
}

// Page goal (structure/titles) is derived from the chosen narrative tone — the tone labels
// already say "for commercial content" / "for informational articles", so one control drives both.
function domainOf(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } }

function goalFromTone(toneValue: string): "informational" | "commercial" | "mixed" {
  const v = (toneValue || "").toLowerCase();
  if (v === "professional" || v === "business") return "commercial";
  if (v === "expert" || v === "analytical" || v === "neutral") return "informational";
  return "mixed"; // friendly / inspiring / practical / custom / default
}

const SITE_TYPE_COLOR: Record<string, string> = {
  official_store: "#10A37F", aggregator: "#ff9f0a", forum_ugc: "#34c759", editorial: "#2997ff", monobrand: "#bf5af2",
};
const SITE_TYPE_KEY: Record<string, string> = {
  official_store: "seoStOfficial", aggregator: "seoStAggregator", forum_ugc: "seoStForum", editorial: "seoStEditorial", monobrand: "seoStMonobrand",
};

type SerpItem = { position: number; url: string; title: string; snippet: string; domain: string; site_type: string | null; intent?: string };
type Scraped = { url: string; ok: boolean; via: string; title: string; metaDescription: string; textSample?: string; headings: string[]; wordCount: number; hasPriceTable: boolean; hasFaq: boolean; error?: string };

export default function OutlinePage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("us");
  const [language, setLanguage] = useState("en");
  const [location, setLocation] = useState("");
  const [engine, setEngine] = useState<"google" | "bing">("google");
  const [topN, setTopN] = useState(10);

  const [serp, setSerp] = useState<SerpItem[]>([]);
  const [paa, setPaa] = useState<string[]>([]);
  const [related, setRelated] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scraped, setScraped] = useState<Record<string, Scraped>>({});
  const [keywordsData, setKeywordsData] = useState<{ keyword: string; volume: number; cpc: number; competition: number }[]>([]);
  const [kwLoading, setKwLoading] = useState(false);

  // step-2 config
  const [tone, setTone] = useState("");        // "" = default from policy
  const [customTone, setCustomTone] = useState("");
  const [persona, setPersona] = useState("");
  const [narration, setNarration] = useState<"" | "first" | "third">("");
  const [customTemplate, setCustomTemplate] = useState("");
  const [structureRules, setStructureRules] = useState("");
  const [addKeywords, setAddKeywords] = useState("");
  const [targetWords, setTargetWords] = useState("");
  const [manualUrl, setManualUrl] = useState("");

  const [loading, setLoading] = useState<"" | "serp" | "outline" | "text" | "avg">("");
  const [err, setErr] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [outline, setOutline] = useState<any>(null);
  const [article, setArticle] = useState("");

  const ai = typeof window !== "undefined" ? getSeoGenCreds() : { provider: "", apiKey: "", model: "" };
  const serpCreds = typeof window !== "undefined" ? getSerpCreds() : { provider: "", apiKey: "" };
  const activePolicy = typeof window !== "undefined" ? (loadPolicies().find(p => p.name === getActivePolicyName()) || loadPolicies()[0]) : null;

  const resolveTone = () => tone === "custom" ? customTone
    : tone ? toneToPrompt(tone)
    : toneToPrompt(activePolicy?.voice?.toneOfVoice || "");

  // Load an item handed over from History (eye → view).
  useEffect(() => {
    const v = takeView();
    if (!v) return;
    if (v.type === "outline") { setOutline(v.data); if (v.keyword) setKeyword(v.keyword); }
    else if (v.type === "text") { setArticle(typeof v.data === "string" ? v.data : v.data?.article || ""); if (v.keyword) setKeyword(v.keyword); }
  }, []);

  const stepNum = outline ? 3 : serp.length > 0 ? 2 : 1;

  async function ensureScraped(urls: string[]): Promise<Record<string, Scraped>> {
    const missing = urls.filter(u => !scraped[u]);
    if (!missing.length) return scraped;
    const res = await fetch("/api/seo/scrape", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: missing, firecrawlKey: getFirecrawlKey() }),
    });
    const data = await res.json();
    const next = { ...scraped };
    (data.pages || []).forEach((p: Scraped) => { next[p.url] = p; });
    setScraped(next);
    return next;
  }

  async function fetchKeywords() {
    const dfsKey = getDataForSeoKey();
    if (!dfsKey || !keyword.trim()) { setKeywordsData([]); return; }
    setKwLoading(true);
    try {
      const res = await fetch("/api/seo/keywords", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, dfsKey, gl: country, hl: language, limit: 60 }),
      });
      const data = await res.json();
      setKeywordsData(res.ok ? (data.items || []) : []);
    } catch { setKeywordsData([]); }
    setKwLoading(false);
  }

  async function runSerp() {
    setErr(""); setOutline(null); setArticle(""); setSerp([]); setSelected(new Set()); setScraped({}); setKeywordsData([]);
    if (!keyword.trim()) { setErr(t("seoErrEnterKeyword")); return; }
    const { provider, apiKey } = getSerpCreds();
    if (!apiKey) { setErr(t("seoErrNoSerpKey")); return; }
    setLoading("serp");
    try {
      const res = await fetch("/api/seo/serp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, provider, apiKey, gl: country, hl: language, location, num: topN, engine }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || t("seoErrSerp")); setLoading(""); return; }
      setSerp(data.results || []);
      setPaa(data.peopleAlsoAsk || []);
      setRelated(data.relatedSearches || []);
      setSelected(new Set((data.results || []).map((r: SerpItem) => r.url)));
      fetchKeywords(); // grounding keywords with real volumes (DataForSEO), if key present
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setLoading("");
  }

  function toggle(url: string) {
    setSelected(s => { const n = new Set(s); n.has(url) ? n.delete(url) : n.add(url); return n; });
  }

  async function useAverage() {
    const urls = serp.filter(s => selected.has(s.url)).map(s => s.url);
    if (!urls.length) return;
    setLoading("avg");
    try {
      const cache = await ensureScraped(urls);
      const counts = urls.map(u => cache[u]?.wordCount || 0).filter(Boolean);
      if (counts.length) setTargetWords(String(Math.round(counts.reduce((a, b) => a + b, 0) / counts.length)));
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setLoading("");
  }

  function addCompetitorUrls() {
    const urls = manualUrl.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!urls.length) return;
    setSerp(prev => {
      const have = new Set(prev.map(s => s.url));
      const additions: SerpItem[] = [];
      const sel = new Set(selected);
      for (const u of urls) {
        let url = u; try { url = new URL(u.startsWith("http") ? u : `https://${u}`).toString(); } catch { continue; }
        if (have.has(url)) { sel.add(url); continue; }
        have.add(url);
        additions.push({ position: prev.length + additions.length + 1, url, title: domainOf(url), snippet: "", domain: domainOf(url), site_type: "manual" });
        sel.add(url);
      }
      setSelected(sel);
      return [...prev, ...additions];
    });
    setManualUrl("");
  }

  async function generate() {
    setErr(""); setArticle("");
    const { provider, apiKey, model } = getSeoGenCreds();
    if (!apiKey) { setErr(t("seoErrNoAiKey")); return; }
    const urls = serp.filter(s => selected.has(s.url)).map(s => s.url);
    if (!urls.length) { setErr(t("seoErrSelectComp")); return; }
    setLoading("outline");
    try {
      const cache = await ensureScraped(urls);
      const competitors = serp.filter(s => selected.has(s.url)).map(s => {
        const p = cache[s.url];
        return {
          position: s.position, url: s.url, site_type: s.site_type || undefined, intent: s.intent,
          title: p?.title || s.title, headings: p?.headings || [],
          word_count: p?.wordCount || 0, has_price_table: !!p?.hasPriceTable, has_faq: !!p?.hasFaq,
          text_sample: p?.textSample || undefined,
        };
      });
      const resolvedTone = resolveTone();
      const resolvedPersona = persona || activePolicy?.voice?.authorPersona || "";
      const pageGoal = goalFromTone(tone || activePolicy?.voice?.toneOfVoice || "");
      const { jobId: jid, error } = await startJob("outline", {
        keyword, language, country, competitors,
        aiProvider: provider, aiApiKey: apiKey, model: model || undefined,
        policy: activePolicy, paa, related,
        tone: resolvedTone, persona: resolvedPersona,
        additionalKeywords: addKeywords.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).join(", "),
        targetWordCount: targetWords ? Number(targetWords) : undefined,
        keywordsData, pageGoal,
        narration: narration || undefined,
        customTemplate: customTemplate.trim() || undefined,
        structureRules: structureRules.trim() || undefined,
      });
      if (error || !jid) { setErr(error === "parse_failed" ? t("seoErrParseJson") : (error || t("seoErrGen"))); setLoading(""); return; }
      setJobId(jid); // background job started — render live progress; user can leave
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setLoading("");
  }

  async function generateText() {
    if (!outline) return;
    const { provider, apiKey, model } = getSeoGenCreds();
    if (!apiKey) { setErr(t("seoErrNoAiKeyShort")); return; }
    setLoading("text"); setErr("");
    try {
      const res = await fetch("/api/seo/text", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outline, policy: activePolicy, language, tone: resolveTone() || undefined, aiProvider: provider, aiApiKey: apiKey, model: model || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || t("seoErrText")); setLoading(""); return; }
      setArticle(data.text);
      const rec = addHistory({ type: "text", keyword: outline?.meta?.keyword || keyword, data: data.text });
      router.push(`/seo-tools/history/${rec.id}`); // open the rich rendered-HTML text page (no raw markdown markers)
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setLoading("");
  }

  const noSerpKey = !serpCreds.apiKey;
  const noAiKey = !ai.apiKey;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {/* progress */}
      <Stepper step={stepNum} t={t} />

      {!jobId && (noSerpKey || noAiKey) && (
        <div className={card} style={{ borderColor: "rgba(255,159,10,0.35)", background: "rgba(255,159,10,0.06)", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <AlertTriangle size={18} color="var(--color-accent-orange)" style={{ flexShrink: 0, marginTop: "1px" }} />
          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
            {t("seoNeedKeysPrefix")} {noSerpKey && <b>{t("seoSerpProviderLabel")}</b>}{noSerpKey && noAiKey && " + "}{noAiKey && <b>{t("seoAiProviderLabel")}</b>}.{" "}
            <Link href="/settings" style={{ color: "var(--color-accent-blue)" }}>{t("seoOpenSettings")}</Link>
          </div>
        </div>
      )}

      {/* Step 1: params (hidden while a job runs) */}
      {!jobId && (
      <div className={card}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <Field l={t("seoKeyword")}>
            <input className={inputStyle} value={keyword} onChange={e => setKeyword(e.target.value)} placeholder={t("seoKeywordPh")} onKeyDown={e => e.key === "Enter" && runSerp()} />
          </Field>
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
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: "12px", alignItems: "end" }}>
          <Field l={t("seoLocationOpt")}><input className={inputStyle} value={location} onChange={e => setLocation(e.target.value)} placeholder={t("seoLocationPh")} /></Field>
          <Field l={t("seoEngine")}>
            <select className={inputStyle} value={engine} onChange={e => setEngine(e.target.value as any)}>
              <option value="google">Google</option>
              <option value="bing">{t("seoEngineBing")}</option>
            </select>
          </Field>
          <Field l="Top N">
            <select className={inputStyle} value={topN} onChange={e => setTopN(Number(e.target.value))}>
              {[10, 20, 30].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <button onClick={runSerp} disabled={loading === "serp"} style={btnPurple}>
            {loading === "serp" ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
            {serp.length > 0 ? t("seoAnalyzeSerp") : t("seoNextCompetitors")}
          </button>
        </div>
      </div>
      )}

      {err && (
        <div className={card} style={{ borderColor: "rgba(255,69,58,0.35)", background: "rgba(255,69,58,0.06)", color: "var(--color-accent-red)", fontSize: "13px", display: "flex", gap: "8px", alignItems: "center" }}>
          <AlertTriangle size={16} /> {err}
        </div>
      )}

      {jobId && !outline && (
        <SeoJobProgress
          jobId={jobId}
          keyword={keyword}
          onDone={async (job) => { const rec = await importJob(job); setJobId(null); if (rec) router.push(`/seo-tools/history/${rec.id}`); }}
          onError={(m) => { setErr(m === "parse_failed" ? t("seoErrParseJson") : m); setJobId(null); }}
          onCancel={() => setJobId(null)}
        />
      )}

      {/* Step 2: competitors + config (hidden while a job runs) */}
      {!jobId && serp.length > 0 && (
        <div className={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "var(--color-text-primary)" }}>
              {t("seoCompetitors")} ({selected.size}/{serp.length} {t("seoSelectedWord")})
            </h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {serp.map(s => {
              const on = selected.has(s.url);
              const wc = scraped[s.url]?.wordCount;
              return (
                <div key={s.url} onClick={() => toggle(s.url)} style={{
                  display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px",
                  borderRadius: "8px", cursor: "pointer",
                  background: on ? "rgba(41,151,255,0.08)" : "transparent",
                  border: `1px solid ${on ? "rgba(41,151,255,0.3)" : "var(--color-border)"}`,
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "5px", flexShrink: 0,
                    border: `1.5px solid ${on ? "var(--color-accent-blue)" : "var(--color-border)"}`,
                    background: on ? "var(--color-accent-blue)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{on && <Check size={12} color="#fff" />}</div>
                  <span style={{ fontSize: "12px", color: "var(--color-text-tertiary)", width: "22px", flexShrink: 0 }}>#{s.position}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                    <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.domain}</div>
                  </div>
                  {wc ? <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)", flexShrink: 0 }}>{wc} {t("seoWords")}</span> : null}
                  {s.intent && (
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "20px", flexShrink: 0,
                      color: s.intent === "buy" ? "#10A37F" : "var(--color-text-secondary)",
                      background: s.intent === "buy" ? "rgba(16,163,127,0.12)" : "var(--color-bg)" }}>
                      {t(s.intent === "buy" ? "seoIntentBuy" : "seoIntentInfo")}
                    </span>
                  )}
                  {s.site_type && (
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "20px", flexShrink: 0,
                      color: SITE_TYPE_COLOR[s.site_type] || "var(--color-text-secondary)",
                      background: `${SITE_TYPE_COLOR[s.site_type] || "#888"}1a` }}>
                      {t((SITE_TYPE_KEY[s.site_type] || "") as any) || s.site_type}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {(paa.length > 0 || related.length > 0) && (
            <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--color-border)", fontSize: "12px", color: "var(--color-text-secondary)" }}>
              {paa.length > 0 && <div style={{ marginBottom: "6px" }}><b>People Also Ask:</b> {paa.join(" · ")}</div>}
              {related.length > 0 && <div><b>Related:</b> {related.join(" · ")}</div>}
            </div>
          )}

          {(kwLoading || keywordsData.length > 0) && (
            <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--color-border)" }}>
              <div className="tool-section-label">{t("seoKwBlockTitle")}</div>
              {kwLoading ? (
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "7px" }}><Loader2 size={13} className="spin" /> {t("seoKwLoading")}</div>
              ) : (
                <>
                  <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginBottom: "8px" }}>{t("seoKwFeedNote")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", maxHeight: "240px", overflow: "auto" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 60px 80px", gap: "8px", fontSize: "10px", fontWeight: 700, color: "var(--color-text-tertiary)", textTransform: "uppercase", padding: "4px 0", borderBottom: "1px solid var(--color-border)" }}>
                      <span>{t("seoKeyword")}</span><span style={{ textAlign: "right" }}>{t("seoKwVolume")}</span><span style={{ textAlign: "right" }}>{t("seoKwCpc")}</span><span style={{ textAlign: "right" }}>{t("seoKwComp")}</span>
                    </div>
                    {keywordsData.slice(0, 40).map((k, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 60px 80px", gap: "8px", fontSize: "12px", padding: "4px 0", color: "var(--color-text-secondary)" }}>
                        <span style={{ color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.keyword}</span>
                        <span style={{ textAlign: "right", fontWeight: 600, color: "var(--color-text-primary)" }}>{k.volume.toLocaleString()}</span>
                        <span style={{ textAlign: "right" }}>{k.cpc ? `$${k.cpc.toFixed(2)}` : "—"}</span>
                        <span style={{ textAlign: "right" }}>{k.competition ? `${Math.round(k.competition * 100)}%` : "—"}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* config */}
          <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: "1px solid var(--color-border)" }}>
            <div className="tool-section-label">{t("seoConfigTitle")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "4px" }}>
              <Field l={t("seoCfgTone")}>
                <select className={inputStyle} value={tone} onChange={e => setTone(e.target.value)}>
                  <option value="">{t("seoTonePolicyDefault")}</option>
                  {TONES.map(tn => <option key={tn.value} value={tn.value}>{t(tn.labelKey as any)}</option>)}
                  <option value="custom">{t("seoToneCustom")}</option>
                </select>
              </Field>
              <Field l={t("seoCfgPersona")}>
                <input className={inputStyle} value={persona} onChange={e => setPersona(e.target.value)} placeholder={activePolicy?.voice?.authorPersona || t("seoCfgPersonaPh")} />
              </Field>
            </div>
            {tone === "custom" && (
              <div style={{ marginTop: "12px" }}>
                <Field l={t("seoToneCustom")}>
                  <input className={inputStyle} value={customTone} onChange={e => setCustomTone(e.target.value)} placeholder={t("seoToneCustomPh")} />
                </Field>
              </div>
            )}
            <div style={{ marginTop: "12px" }}>
              <Field l={t("seoCfgNarration")}>
                <select className={inputStyle} value={narration} onChange={e => setNarration(e.target.value as any)}>
                  <option value="">{t("seoNarrationDefault")}</option>
                  <option value="first">{t("seoNarrationFirst")}</option>
                  <option value="third">{t("seoNarrationThird")}</option>
                </select>
              </Field>
            </div>
            <div style={{ marginTop: "12px" }}>
              <Field l={t("seoCfgAddKeywords")}>
                <textarea className={inputStyle} style={{ minHeight: "54px", resize: "vertical" }} value={addKeywords} onChange={e => setAddKeywords(e.target.value)} placeholder={t("seoCfgAddKeywordsPh")} />
              </Field>
            </div>
            <div style={{ marginTop: "12px" }}>
              <span className="tool-field-label">{t("seoCfgTargetWords")}</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <input className={inputStyle} style={{ flex: 1 }} type="number" value={targetWords} onChange={e => setTargetWords(e.target.value)} placeholder="2500" />
                <button onClick={useAverage} disabled={loading === "avg" || !selected.size} style={btnGhost}>
                  {loading === "avg" ? <Loader2 size={13} className="spin" /> : null} {t("seoCfgUseAverage")}
                </button>
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "4px" }}>{t("seoCfgAverageNote")}</div>
            </div>

            {/* add competitor URL — appends to the SERP list above (for rising sites not yet in top) */}
            <div style={{ marginTop: "14px" }}>
              <span className="tool-field-label">{t("seoCfgAddCompUrl")}</span>
              <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginBottom: "8px" }}>{t("seoCfgAddCompUrlSub")}</div>
              <div style={{ display: "flex", gap: "6px" }}>
                <input className={inputStyle} style={{ flex: 1 }} value={manualUrl} onChange={e => setManualUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && addCompetitorUrls()} placeholder="https://competitor.com/page" />
                <button onClick={addCompetitorUrls} disabled={!manualUrl.trim()} style={{ ...btnGhost, opacity: manualUrl.trim() ? 1 : 0.5 }}><Plus size={13} /> {t("seoCfgAddCompUrlBtn")}</button>
              </div>
            </div>

            {/* custom structure template + ready-made presets (incl. iGaming) */}
            <div style={{ marginTop: "14px" }}>
              <span className="tool-field-label">{t("seoCfgCustomTemplate")} <span style={{ textTransform: "none", fontWeight: 400, color: "var(--color-text-tertiary)" }}>· {t("seoCfgOptional")}</span></span>
              <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginBottom: "8px" }}>{t("seoCfgCustomTemplateSub")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                {OUTLINE_TEMPLATES.map(tpl => (
                  <button key={tpl.id} onClick={() => setCustomTemplate(tpl.body.replace(/\{year\}/g, String(new Date().getFullYear())))} style={{ ...btnGhost, padding: "6px 11px" }}>{t(tpl.labelKey as any)}</button>
                ))}
                {customTemplate && <button onClick={() => setCustomTemplate("")} style={{ ...btnGhost, padding: "6px 11px", color: "var(--color-accent-red)" }}><X size={12} /> {t("seoCfgClear")}</button>}
              </div>
              <textarea className={inputStyle} style={{ minHeight: "90px", resize: "vertical", fontFamily: "monospace", fontSize: "12px" }} value={customTemplate} onChange={e => setCustomTemplate(e.target.value)} placeholder={"H1: ...\nH2: ...\nH3: ..."} />
            </div>

            {/* free-form structure rules (e.g. "FAQ at the end", "price table in pricing", "more H3") */}
            <div style={{ marginTop: "14px" }}>
              <span className="tool-field-label">{t("seoCfgStructureRules")} <span style={{ textTransform: "none", fontWeight: 400, color: "var(--color-text-tertiary)" }}>· {t("seoCfgOptional")}</span></span>
              <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginBottom: "8px" }}>{t("seoCfgStructureRulesSub")}</div>
              <textarea className={inputStyle} style={{ minHeight: "70px", resize: "vertical", fontSize: "13px" }} value={structureRules} onChange={e => setStructureRules(e.target.value)} placeholder={t("seoCfgStructureRulesPh")} />
            </div>

            <button onClick={generate} disabled={loading === "outline"} style={{ ...btnDark, width: "100%", justifyContent: "center", marginTop: "16px", padding: "12px" }}>
              {loading === "outline" ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />}
              {t("seoGenStructure")}
            </button>
          </div>
        </div>
      )}

      {outline && <OutlineView outline={outline} onGenText={generateText} genTextLoading={loading === "text"} />}

      {article && (
        <div className={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "var(--color-text-primary)" }}>{t("seoGeneratedText")}</h3>
            <button onClick={() => navigator.clipboard.writeText(article)} style={btnGhost}><Copy size={14} /> {t("seoCopy")}</button>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: 1.6, color: "var(--color-text-primary)", margin: 0, fontFamily: "inherit" }}>{article}</pre>
        </div>
      )}

      {!outline && <SeoRecentList type="outline" />}
    </div>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ step, t }: { step: number; t: any }) {
  const steps = [t("seoStepParams"), t("seoStepCompetitors"), t("seoStepResults")];
  return (
    <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      {steps.map((label, i) => {
        const n = i + 1; const active = step === n; const done = step > n;
        return (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: "10px", flex: i < 2 ? 1 : "0 0 auto" }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700,
              background: active ? "var(--color-text-primary)" : done ? "var(--color-accent-green)" : "var(--color-border)",
              color: active || done ? "var(--color-bg)" : "var(--color-text-secondary)",
            }}>{done ? <Check size={14} /> : n}</div>
            <span style={{ fontSize: "13px", fontWeight: active ? 700 : 500, color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>{label}</span>
            {i < 2 && <div style={{ flex: 1, height: "1px", background: "var(--color-border)", margin: "0 6px" }} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Outline renderer (rich / EAV) ───────────────────────────────────────────────
// ─── buttons ──────────────────────────────────────────────────────────────────
const btnGhost: React.CSSProperties = { display: "flex", alignItems: "center", gap: "6px", padding: "8px 13px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)", fontSize: "12px", fontWeight: 600, cursor: "pointer" };
const btnPurple: React.CSSProperties = { display: "flex", alignItems: "center", gap: "7px", padding: "9px 18px", borderRadius: "8px", border: "none", background: "var(--color-accent-purple)", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", height: "38px" };
const btnDark: React.CSSProperties = { display: "flex", alignItems: "center", gap: "7px", padding: "9px 18px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-bg)", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
