"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search, Loader2, Check, AlertTriangle, FileText, Wand2, Copy,
  ChevronDown, ChevronRight, Download,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { getAiCreds, getSerpCreds, getFirecrawlKey, getSeoModel, loadPolicies, getActivePolicyName } from "@/lib/seo/keys";

// ─── small primitives (shared classes from globals.css) ──────────────────────────
const card = "panel";
const inputStyle = "tool-input";

function Field({ l, children }: { l: string; children: React.ReactNode }) {
  return <div><span className="tool-field-label">{l}</span>{children}</div>;
}

const SITE_TYPE_COLOR: Record<string, string> = {
  aggregator: "#ff9f0a", forum_ugc: "#34c759", editorial: "#2997ff", monobrand: "#bf5af2",
};

type SerpItem = { position: number; url: string; title: string; snippet: string; domain: string; site_type: string | null };
type Scraped = { url: string; ok: boolean; via: string; title: string; metaDescription: string; headings: string[]; wordCount: number; hasPriceTable: boolean; hasFaq: boolean; error?: string };

export default function OutlinePage() {
  const { t } = useLanguage();
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

  const [loading, setLoading] = useState<"" | "serp" | "outline" | "text">("");
  const [err, setErr] = useState("");
  const [outline, setOutline] = useState<any>(null);
  const [article, setArticle] = useState("");

  const ai = typeof window !== "undefined" ? getAiCreds() : { provider: "", apiKey: "" };
  const serpCreds = typeof window !== "undefined" ? getSerpCreds() : { provider: "", apiKey: "" };

  async function runSerp() {
    setErr(""); setOutline(null); setArticle(""); setSerp([]); setSelected(new Set());
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
      setSelected(new Set((data.results || []).slice(0, 5).map((r: SerpItem) => r.url)));
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setLoading("");
  }

  function toggle(url: string) {
    setSelected(s => { const n = new Set(s); n.has(url) ? n.delete(url) : n.add(url); return n; });
  }

  async function generate() {
    setErr(""); setArticle("");
    const { provider, apiKey } = getAiCreds();
    if (!apiKey) { setErr(t("seoErrNoAiKey")); return; }
    const urls = serp.filter(s => selected.has(s.url)).map(s => s.url);
    if (!urls.length) { setErr(t("seoErrSelectComp")); return; }
    setLoading("outline");
    try {
      const sc = await fetch("/api/seo/scrape", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, firecrawlKey: getFirecrawlKey() }),
      });
      const scData = await sc.json();
      const pages: Scraped[] = scData.pages || [];

      const competitors = serp.filter(s => selected.has(s.url)).map(s => {
        const p = pages.find(x => x.url === s.url);
        return {
          position: s.position, url: s.url, site_type: s.site_type || undefined, intent: undefined,
          title: p?.title || s.title, headings: p?.headings || [],
          word_count: p?.wordCount || 0, has_price_table: !!p?.hasPriceTable, has_faq: !!p?.hasFaq,
        };
      });

      const policies = loadPolicies();
      const policy = policies.find(p => p.name === getActivePolicyName()) || policies[0];
      const res = await fetch("/api/seo/outline", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword, language, country, competitors,
          aiProvider: provider, aiApiKey: apiKey, model: getSeoModel() || undefined,
          policy, paa, related,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error === "parse_failed" ? t("seoErrParseJson") : (data.error || t("seoErrGen"))); setLoading(""); return; }
      setOutline(data.outline);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setLoading("");
  }

  async function generateText() {
    if (!outline) return;
    const { provider, apiKey } = getAiCreds();
    if (!apiKey) { setErr(t("seoErrNoAiKeyShort")); return; }
    setLoading("text"); setErr("");
    try {
      const policies = loadPolicies();
      const policy = policies.find(p => p.name === getActivePolicyName()) || policies[0];
      const res = await fetch("/api/seo/text", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outline, policy, language, aiProvider: provider, aiApiKey: apiKey, model: getSeoModel() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || t("seoErrText")); setLoading(""); return; }
      setArticle(data.text);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setLoading("");
  }

  const noSerpKey = !serpCreds.apiKey;
  const noAiKey = !ai.apiKey;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {(noSerpKey || noAiKey) && (
        <div className={card} style={{ borderColor: "rgba(255,159,10,0.35)", background: "rgba(255,159,10,0.06)", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <AlertTriangle size={18} color="var(--color-accent-orange)" style={{ flexShrink: 0, marginTop: "1px" }} />
          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
            {t("seoNeedKeysPrefix")} {noSerpKey && <b>{t("seoSerpProviderLabel")}</b>}{noSerpKey && noAiKey && " + "}{noAiKey && <b>{t("seoAiProviderLabel")}</b>}.{" "}
            <Link href="/settings" style={{ color: "var(--color-accent-blue)" }}>{t("seoOpenSettings")}</Link>
          </div>
        </div>
      )}

      {/* Input */}
      <div className={card}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <Field l={t("seoKeyword")}>
            <input className={inputStyle} value={keyword} onChange={e => setKeyword(e.target.value)} placeholder={t("seoKeywordPh")} onKeyDown={e => e.key === "Enter" && runSerp()} />
          </Field>
          <Field l={t("seoCountryGl")}><input className={inputStyle} value={country} onChange={e => setCountry(e.target.value)} placeholder="us / gr / ru" /></Field>
          <Field l={t("seoLanguageHl")}><input className={inputStyle} value={language} onChange={e => setLanguage(e.target.value)} placeholder="en / ru" /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: "12px", alignItems: "end" }}>
          <Field l={t("seoLocationOpt")}><input className={inputStyle} value={location} onChange={e => setLocation(e.target.value)} placeholder="Thessaloniki, Greece" /></Field>
          <Field l={t("seoEngine")}>
            <select className={inputStyle} value={engine} onChange={e => setEngine(e.target.value as any)}>
              <option value="google">Google</option>
              <option value="bing">{t("seoEngineBing")}</option>
            </select>
          </Field>
          <Field l="Top N">
            <select className={inputStyle} value={topN} onChange={e => setTopN(Number(e.target.value))}>
              {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <button onClick={runSerp} disabled={loading === "serp"} style={{
            padding: "9px 18px", borderRadius: "8px", border: "none", cursor: "pointer",
            background: "var(--color-accent-purple)", color: "#fff", fontSize: "13px", fontWeight: 600,
            display: "flex", alignItems: "center", gap: "7px", height: "38px",
          }}>
            {loading === "serp" ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
            {t("seoAnalyzeSerp")}
          </button>
        </div>
      </div>

      {err && (
        <div className={card} style={{ borderColor: "rgba(255,69,58,0.35)", background: "rgba(255,69,58,0.06)", color: "var(--color-accent-red)", fontSize: "13px", display: "flex", gap: "8px", alignItems: "center" }}>
          <AlertTriangle size={16} /> {err}
        </div>
      )}

      {/* SERP results */}
      {serp.length > 0 && (
        <div className={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "var(--color-text-primary)" }}>
              {t("seoCompetitors")} ({selected.size}/{serp.length} {t("seoSelectedWord")})
            </h3>
            <button onClick={generate} disabled={loading === "outline"} style={{
              padding: "9px 18px", borderRadius: "8px", border: "none", cursor: "pointer",
              background: "var(--color-accent-blue)", color: "#fff", fontSize: "13px", fontWeight: 600,
              display: "flex", alignItems: "center", gap: "7px",
            }}>
              {loading === "outline" ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />}
              {t("seoGenStructure")}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {serp.map(s => {
              const on = selected.has(s.url);
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
                  {s.site_type && (
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "20px", flexShrink: 0,
                      color: SITE_TYPE_COLOR[s.site_type] || "var(--color-text-secondary)",
                      background: `${SITE_TYPE_COLOR[s.site_type] || "#888"}1a` }}>
                      {s.site_type}
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
        </div>
      )}

      {outline && <OutlineView outline={outline} onGenText={generateText} genTextLoading={loading === "text"} />}

      {article && (
        <div className={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "var(--color-text-primary)" }}>{t("seoGeneratedText")}</h3>
            <button onClick={() => navigator.clipboard.writeText(article)} style={iconBtn}><Copy size={14} /> {t("seoCopy")}</button>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: 1.6, color: "var(--color-text-primary)", margin: 0, fontFamily: "inherit" }}>{article}</pre>
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "5px", padding: "6px 11px", borderRadius: "7px",
  border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)",
  fontSize: "12px", cursor: "pointer",
};

// ─── Outline renderer ────────────────────────────────────────────────────────────
function OutlineView({ outline, onGenText, genTextLoading }: { outline: any; onGenText: () => void; genTextLoading: boolean }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const meta = outline.meta || {};
  const cardS = "panel";

  function download() {
    const blob = new Blob([JSON.stringify(outline, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `outline-${(meta.keyword || "seo").replace(/\s+/g, "-")}.json`; a.click();
  }

  return (
    <div className={cardS}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
            <FileText size={18} color="var(--color-accent-purple)" /> {t("seoArticleStructure")}
          </h3>
          {meta.target_word_count ? <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: "4px 0 0" }}>{t("seoTargetPrefix")} ~{meta.target_word_count} {t("seoWords")}</p> : null}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={download} style={iconBtn}><Download size={14} /> JSON</button>
          <button onClick={onGenText} disabled={genTextLoading} style={{ ...iconBtn, background: "var(--color-accent-purple)", color: "#fff", border: "none" }}>
            {genTextLoading ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />} {t("seoGenText")}
          </button>
        </div>
      </div>

      {meta.title_options?.length > 0 && (
        <Block title={t("seoTitleOptions")}>
          {meta.title_options.map((x: string, i: number) => <Pill key={i} text={x} />)}
        </Block>
      )}
      {meta.description_options?.length > 0 && (
        <Block title={t("seoDescOptions")}>
          {meta.description_options.map((x: string, i: number) => <Pill key={i} text={x} />)}
        </Block>
      )}
      {outline.sub_intents?.length > 0 && (
        <Block title={t("seoSubIntents")}>
          {outline.sub_intents.map((x: string, i: number) => <Pill key={i} text={x} />)}
        </Block>
      )}
      {outline.entities?.length > 0 && (
        <Block title={t("seoEntityChecklist")}>
          {outline.entities.map((e: any, i: number) => <Pill key={i} text={`${e.name}${e.type ? ` · ${e.type}` : ""}`} />)}
        </Block>
      )}

      {outline.sections?.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <div className="tool-section-label">{t("seoSections")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {outline.sections.map((sec: any, i: number) => (
              <div key={i} style={{ border: "1px solid var(--color-border)", borderRadius: "8px", overflow: "hidden" }}>
                <div onClick={() => setOpen(o => ({ ...o, [i]: !o[i] }))} style={{ display: "flex", alignItems: "center", gap: "9px", padding: "10px 12px", cursor: "pointer" }}>
                  {open[i] ? <ChevronDown size={15} color="var(--color-text-secondary)" /> : <ChevronRight size={15} color="var(--color-text-secondary)" />}
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-accent-blue)", background: "rgba(41,151,255,0.12)", padding: "2px 7px", borderRadius: "5px" }}>{sec.h_level}</span>
                  <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>{sec.heading}</span>
                  {Array.isArray(sec.word_count) && <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>{sec.word_count[0]}–{sec.word_count[1]} {t("seoWordsShort")}</span>}
                  {sec.needs_real_experience && <span title={t("seoNeedExperience")} style={{ fontSize: "10px", color: "var(--color-accent-orange)" }}>● {t("seoNeedExperience")}</span>}
                </div>
                {open[i] && (
                  <div style={{ padding: "0 12px 12px 36px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                    {sec.key_point && <div><b>{t("seoReveal")}</b> {sec.key_point}</div>}
                    {sec.keywords?.length > 0 && <div><b>{t("seoKeysLabel")}</b> {sec.keywords.join(", ")}</div>}
                    {sec.entities_to_cover?.length > 0 && <div><b>{t("seoEntitiesLabel")}</b> {sec.entities_to_cover.join(", ")}</div>}
                    {sec.visual_elements?.length > 0 && <div><b>{t("seoVisualLabel")}</b> {sec.visual_elements.join(", ")}</div>}
                    {sec.notes && <div style={{ fontStyle: "italic", marginTop: "4px" }}>{sec.notes}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {outline.faq?.length > 0 && (
        <Block title={t("seoFaq")}>
          {outline.faq.map((f: any, i: number) => (
            <div key={i} style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "4px" }}>
              <b style={{ color: "var(--color-text-primary)" }}>{f.question}</b> — {f.answer_guideline}
            </div>
          ))}
        </Block>
      )}

      {outline.authority_fields_to_fill_by_user?.length > 0 && (
        <div style={{ marginTop: "14px", padding: "12px 14px", borderRadius: "8px", background: "rgba(255,159,10,0.06)", border: "1px solid rgba(255,159,10,0.22)" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-accent-orange)", marginBottom: "5px" }}>{t("seoFillManually")}</div>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
            {outline.authority_fields_to_fill_by_user.map((a: string, i: number) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: "14px" }}>
      <div className="tool-section-label">{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>{children}</div>
    </div>
  );
}

function Pill({ text }: { text: string }) {
  return <span className="pill">{text}</span>;
}
