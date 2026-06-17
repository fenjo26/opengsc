"use client";

import { useEffect, useState } from "react";
import { Save, Plus, Trash2, Check, ScrollText, Eye } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { EditorialPolicy, DEFAULT_POLICY, renderPolicy } from "@/lib/seo/policy";
import { loadPolicies, savePolicies, getActivePolicyName, setActivePolicyName } from "@/lib/seo/keys";

const card = "panel";
const inputStyle = "tool-input";

function Field({ l, children }: { l: string; children: React.ReactNode }) { return <div style={{ marginBottom: "12px" }}><span className="tool-field-label">{l}</span>{children}</div>; }
function Toggle({ on, set, l }: { on: boolean; set: (v: boolean) => void; l: string }) {
  return (
    <button onClick={() => set(!on)} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "6px 11px", borderRadius: "7px", border: `1px solid ${on ? "var(--color-accent-green)" : "var(--color-border)"}`, background: on ? "rgba(52,199,89,0.1)" : "var(--color-bg)", color: on ? "var(--color-accent-green)" : "var(--color-text-secondary)", fontSize: "12px", cursor: "pointer" }}>
      <span style={{ width: 14, height: 14, borderRadius: "4px", border: `1.5px solid ${on ? "var(--color-accent-green)" : "var(--color-border)"}`, background: on ? "var(--color-accent-green)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{on && <Check size={10} color="#fff" />}</span>
      {l}
    </button>
  );
}

const SECTION_TITLE: React.CSSProperties = { fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 12px" };

export default function PolicyPage() {
  const { t } = useLanguage();
  const [policies, setPolicies] = useState<EditorialPolicy[]>([DEFAULT_POLICY]);
  const [activeName, setActiveName] = useState("Default");
  const [draft, setDraft] = useState<EditorialPolicy>(DEFAULT_POLICY);
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const p = loadPolicies();
    setPolicies(p);
    const an = getActivePolicyName();
    setActiveName(an);
    setDraft(p.find(x => x.name === an) || p[0]);
  }, []);

  function selectPolicy(name: string) {
    const p = policies.find(x => x.name === name);
    if (p) { setDraft(structuredClone(p)); setActiveName(name); setActivePolicyName(name); }
  }

  function save() {
    const others = policies.filter(p => p.name !== draft.name);
    const next = [...others, draft].sort((a, b) => a.name.localeCompare(b.name));
    setPolicies(next); savePolicies(next); setActivePolicyName(draft.name); setActiveName(draft.name);
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  }

  function addNew() {
    const name = `Policy ${policies.length + 1}`;
    const np = { ...structuredClone(DEFAULT_POLICY), name };
    const next = [...policies, np];
    setPolicies(next); savePolicies(next); setDraft(np); setActiveName(name); setActivePolicyName(name);
  }

  function removePolicy() {
    if (policies.length <= 1) return;
    const next = policies.filter(p => p.name !== draft.name);
    setPolicies(next); savePolicies(next); setDraft(next[0]); setActiveName(next[0].name); setActivePolicyName(next[0].name);
  }

  // helpers to update nested draft
  const up = (fn: (d: EditorialPolicy) => void) => setDraft(d => { const n = structuredClone(d); fn(n); return n; });
  const csv = (arr?: string[]) => (arr || []).join(", ");
  const toArr = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);

  return (
    <div style={{ display: "flex", gap: "18px", alignItems: "flex-start" }}>
      {/* Left: list */}
      <div className={card} style={{ width: "220px", flexShrink: 0 }}>
        <div className="tool-section-label" style={{ marginBottom: "10px" }}>{t("seoPolicies")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {policies.map(p => (
            <button key={p.name} onClick={() => selectPolicy(p.name)} style={{ textAlign: "left", padding: "8px 10px", borderRadius: "7px", border: "none", cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", gap: "7px", background: p.name === draft.name ? "rgba(191,90,242,0.12)" : "transparent", color: p.name === draft.name ? "var(--color-accent-purple)" : "var(--color-text-secondary)", fontWeight: p.name === draft.name ? 700 : 500 }}>
              <ScrollText size={14} /> {p.name}{p.name === activeName && <span style={{ marginLeft: "auto", fontSize: "9px", background: "var(--color-accent-green)", color: "#fff", padding: "1px 5px", borderRadius: "10px" }}>ACTIVE</span>}
            </button>
          ))}
        </div>
        <button onClick={addNew} style={{ marginTop: "10px", width: "100%", padding: "8px", borderRadius: "7px", border: "1px dashed var(--color-border)", background: "transparent", color: "var(--color-text-secondary)", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}><Plus size={14} /> {t("seoNew")}</button>
      </div>

      {/* Right: editor */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "14px", minWidth: 0 }}>
        <div className={card}>
          <div style={{ display: "flex", gap: "10px", alignItems: "end", marginBottom: "4px" }}>
            <div style={{ flex: 1 }}>
              <Field l={t("seoPolicyName")}><input className={inputStyle} value={draft.name} onChange={e => up(d => { d.name = e.target.value; })} /></Field>
            </div>
            <button onClick={() => setShowPreview(p => !p)} style={{ height: "38px", padding: "0 14px", marginBottom: "12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}><Eye size={14} /> {t("seoPromptBtn")}</button>
            <button onClick={save} style={{ height: "38px", padding: "0 16px", marginBottom: "12px", borderRadius: "8px", border: "none", background: saved ? "rgba(52,199,89,0.2)" : "var(--color-accent-purple)", color: saved ? "var(--color-accent-green)" : "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>{saved ? <><Check size={14} /> {t("seoSaved")}</> : <><Save size={14} /> {t("seoSave")}</>}</button>
            {policies.length > 1 && <button onClick={removePolicy} style={{ height: "38px", padding: "0 12px", marginBottom: "12px", borderRadius: "8px", border: "1px solid rgba(255,69,58,0.25)", background: "rgba(255,69,58,0.08)", color: "var(--color-accent-red)", cursor: "pointer", display: "flex", alignItems: "center" }}><Trash2 size={14} /></button>}
          </div>
        </div>

        {showPreview && (
          <div className={card} style={{ background: "var(--color-bg)" }}>
            <div className="tool-section-label" style={{ marginBottom: "8px" }}>{t("seoPromptRender")}</div>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px", lineHeight: 1.55, color: "var(--color-text-primary)", margin: 0, fontFamily: "monospace" }}>{renderPolicy(draft)}</pre>
          </div>
        )}

        {/* Restrictions — самое ценное, ставим первым */}
        <div className={card}>
          <h3 style={SECTION_TITLE}>🛡 {t("seoRestrictions")} <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)", fontSize: "11px" }}>{t("seoRestrictionsSub")}</span></h3>
          <Field l={t("seoBannedWords")}><input className={inputStyle} value={csv(draft.restrictions?.banned_words)} onChange={e => up(d => { (d.restrictions ||= {}).banned_words = toArr(e.target.value); })} /></Field>
          <Field l={t("seoBannedTopics")}><input className={inputStyle} value={csv(draft.restrictions?.banned_topics)} onChange={e => up(d => { (d.restrictions ||= {}).banned_topics = toArr(e.target.value); })} /></Field>
          <Field l={t("seoComplianceField")}><textarea className={inputStyle} style={{ minHeight: "60px", resize: "vertical" }} value={draft.restrictions?.compliance_requirements || ""} onChange={e => up(d => { (d.restrictions ||= {}).compliance_requirements = e.target.value; })} /></Field>
        </div>

        {/* Quality */}
        <div className={card}>
          <h3 style={SECTION_TITLE}>✅ {t("seoQualityStandards")}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Field l={t("seoCitationStyle")}>
              <select className={inputStyle} value={draft.quality?.citation_style || ""} onChange={e => up(d => { (d.quality ||= {}).citation_style = e.target.value; })}>
                <option value="">—</option><option value="inline">inline</option><option value="footnotes">footnotes</option><option value="none">none</option>
              </select>
            </Field>
            <div style={{ display: "flex", alignItems: "end", paddingBottom: "12px" }}>
              <Toggle on={!!draft.quality?.require_sources} set={v => up(d => { (d.quality ||= {}).require_sources = v; })} l={t("seoRequireSources")} />
            </div>
          </div>
          <Field l={t("seoEeatReq")}><textarea className={inputStyle} style={{ minHeight: "54px", resize: "vertical" }} value={draft.quality?.eeat_requirements || ""} onChange={e => up(d => { (d.quality ||= {}).eeat_requirements = e.target.value; })} /></Field>
          <Field l={t("seoFactChecking")}><textarea className={inputStyle} style={{ minHeight: "54px", resize: "vertical" }} value={draft.quality?.fact_checking || ""} onChange={e => up(d => { (d.quality ||= {}).fact_checking = e.target.value; })} /></Field>
        </div>

        {/* Formatting */}
        <div className={card}>
          <h3 style={SECTION_TITLE}>✍️ {t("seoFormatting")} <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)", fontSize: "11px" }}>{t("seoFormattingSub")}</span></h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <Field l={t("seoHeadingStyle")}><select className={inputStyle} value={draft.formatting?.heading_style || ""} onChange={e => up(d => { (d.formatting ||= {}).heading_style = e.target.value; })}><option value="">—</option><option value="questions">questions</option><option value="statements">statements</option><option value="how-to">how-to</option><option value="mixed">mixed</option></select></Field>
            <Field l={t("seoHeadingCase")}><select className={inputStyle} value={draft.formatting?.heading_case || ""} onChange={e => up(d => { (d.formatting ||= {}).heading_case = e.target.value; })}><option value="">—</option><option value="sentence">sentence</option><option value="title">title</option><option value="upper">upper</option></select></Field>
            <Field l={t("seoParaLength")}><select className={inputStyle} value={draft.formatting?.paragraph_length || ""} onChange={e => up(d => { (d.formatting ||= {}).paragraph_length = e.target.value; })}><option value="">—</option><option value="short">short</option><option value="medium">medium</option><option value="long">long</option></select></Field>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "6px" }}>
            {(["bold", "italic", "tables", "quotes", "lists", "examples"] as const).map(k => (
              <Toggle key={k} l={k} on={!!draft.formatting?.use?.[k]} set={v => up(d => { ((d.formatting ||= {}).use ||= {})[k] = v; })} />
            ))}
          </div>
        </div>

        {/* Audience / voice */}
        <div className={card}>
          <h3 style={SECTION_TITLE}>🎯 {t("seoAudienceVoice")}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Field l={t("seoExpertise")}><select className={inputStyle} value={draft.audience?.expertise || ""} onChange={e => up(d => { (d.audience ||= {}).expertise = e.target.value; })}><option value="">—</option><option value="beginner">beginner</option><option value="intermediate">intermediate</option><option value="expert">expert</option></select></Field>
            <Field l={`${t("seoFormality")}: ${draft.voice?.formality ?? 50}/100`}><input type="range" min={0} max={100} value={draft.voice?.formality ?? 50} onChange={e => up(d => { (d.voice ||= {}).formality = Number(e.target.value); })} style={{ width: "100%", marginTop: "8px" }} /></Field>
          </div>
        </div>
      </div>
    </div>
  );
}
