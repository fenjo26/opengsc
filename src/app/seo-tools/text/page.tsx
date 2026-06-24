"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PenLine, Loader2, AlertTriangle, Wand2, Eye } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { getSeoGenCreds, getSerpCreds, getFirecrawlKey, getFactSourceCount, getHardRedact, loadPolicies, getActivePolicyName } from "@/lib/seo/keys";
import { TONES, toneToPrompt } from "@/lib/seo/tones";
import { LANGUAGES } from "@/lib/seo/regions";
import { loadHistory, HistoryItem } from "@/lib/seo/history";
import { startJob, importJob } from "@/lib/seo/jobs";
import SeoJobProgress from "@/components/SeoJobProgress";

const card = "panel";

export default function TextGenPage() {
  const { t } = useLanguage();
  const router = useRouter();

  const [policyName, setPolicyName] = useState("");
  const [tone, setTone] = useState("");
  const [language, setLanguage] = useState("en");
  const [promptType, setPromptType] = useState<"service" | "custom">("service");
  const [sourceMode, setSourceMode] = useState<"off" | "facts" | "cited">("off");
  const [structureId, setStructureId] = useState("");
  const [search, setSearch] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobKeyword, setJobKeyword] = useState("");
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<"all" | "processing" | "error">("all");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [policies, setPolicies] = useState<{ name: string }[]>([]);

  useEffect(() => {
    setPolicies(loadPolicies());
    setPolicyName(getActivePolicyName());
    setHistory(loadHistory());
  }, []);

  const outlines = useMemo(() => loadHistory().filter(h => h.type === "outline"), [history]);
  const filteredOutlines = useMemo(() =>
    outlines.filter(o => !search.trim() || o.keyword.toLowerCase().includes(search.toLowerCase())),
    [outlines, search]);

  const ai = typeof window !== "undefined" ? getSeoGenCreds() : { provider: "", apiKey: "", model: "" };

  const textHistory = useMemo(() => {
    let list = history.filter(h => h.type === "text");
    if (filter === "processing") list = list.filter(h => h.status === "processing");
    if (filter === "error") list = list.filter(h => h.status === "error");
    return list;
  }, [history, filter]);
  const counts = useMemo(() => {
    const t = history.filter(h => h.type === "text");
    return { all: t.length, processing: t.filter(h => h.status === "processing").length, error: t.filter(h => h.status === "error").length };
  }, [history]);

  async function generate() {
    setErr("");
    const outline = outlines.find(o => o.id === structureId);
    if (!outline) { setErr(t("seoSelectStructureFirst")); return; }
    const { provider, apiKey, model } = getSeoGenCreds();
    if (!apiKey) { setErr(t("seoErrNoAiKey")); return; }
    const policy = loadPolicies().find(p => p.name === policyName) || loadPolicies()[0];
    const resolvedTone = tone ? toneToPrompt(tone) : toneToPrompt((policy as any)?.voice?.toneOfVoice || "");

    setLoading(true); setErr("");
    const { jobId: jid, error } = await startJob("text", {
      outline: outline.data, keyword: outline.keyword, policy, language, tone: resolvedTone || undefined,
      custom: useCustom && custom.trim() ? custom : undefined, promptType,
      sourceMode, serpProvider: getSerpCreds().provider, serpKey: getSerpCreds().apiKey || undefined,
      firecrawlKey: getFirecrawlKey() || undefined, scrapeCount: getFactSourceCount(), hardRedact: getHardRedact(),
      aiProvider: provider, aiApiKey: apiKey, model: model || undefined,
    }, { tone: tone || (policy as any)?.voice?.toneOfVoice || "", promptType: promptType === "custom" ? t("seoPromptCustom") : t("seoPromptService"), outlineId: outline.id });
    setLoading(false);
    if (error || !jid) { setErr(error || t("seoErrText")); return; }
    setJobKeyword(outline.keyword); setJobId(jid); // background job — render live progress; user can leave
  }

  const selectStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)", fontSize: "13px", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 4px", display: "flex", alignItems: "center", gap: "9px" }}><PenLine size={20} color="var(--color-accent-purple)" /> {t("seoTextGenTitle")}</h2>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0 }}>{t("seoTextGenSub")}</p>
        </div>
      </div>

      {!ai.apiKey && (
        <div className={card} style={{ borderColor: "rgba(255,159,10,0.35)", background: "rgba(255,159,10,0.06)", display: "flex", gap: "10px", alignItems: "center", fontSize: "13px", color: "var(--color-text-secondary)" }}>
          <AlertTriangle size={18} color="var(--color-accent-orange)" /> {t("seoNeedKeysPrefix")} <b>{t("seoAiProviderLabel")}</b>. <Link href="/settings" style={{ color: "var(--color-accent-blue)" }}>{t("seoSettingsShort")}</Link>
        </div>
      )}

      {/* Settings */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "start" }}>
        {/* left */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className={card}>
            <label className="tool-field-label">{t("seoGenTextPolicy")}</label>
            <select style={selectStyle} value={policyName} onChange={e => setPolicyName(e.target.value)}>
              {policies.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div className={card}>
            <label className="tool-field-label">{t("seoTonePromptLabel")}</label>
            <select style={selectStyle} value={tone} onChange={e => setTone(e.target.value)}>
              <option value="">{t("seoTonePolicyDefault")}</option>
              {TONES.map(tn => <option key={tn.value} value={tn.value}>{t(tn.labelKey as any)}</option>)}
            </select>
          </div>
          <div className={card}>
            <label className="tool-field-label">{t("seoGenTextLang")}</label>
            <select style={selectStyle} value={language} onChange={e => setLanguage(e.target.value)}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>

        {/* right */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className={card}>
            <label className="tool-field-label">{t("seoPromptType")}</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px", marginBottom: "14px" }}>
              {([["service", t("seoPromptService")], ["custom", t("seoPromptCustom")]] as const).map(([v, l]) => (
                <label key={v} style={{ display: "flex", alignItems: "center", gap: "9px", fontSize: "13px", color: "var(--color-text-primary)", cursor: "pointer" }}>
                  <input type="radio" checked={promptType === v} onChange={() => setPromptType(v as any)} />
                  {l}
                </label>
              ))}
            </div>
            <label className="tool-field-label">{t("seoSourcesMode")}</label>
            <select style={selectStyle} value={sourceMode} onChange={e => setSourceMode(e.target.value as any)}>
              <option value="off">{t("seoSourcesOff")}</option>
              <option value="facts">{t("seoSourcesFacts")}</option>
              <option value="cited">{t("seoSourcesCited")}</option>
            </select>
            <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "6px" }}>{t("seoSourcesModeHint")}</div>
          </div>

          <div className={card}>
            <label className="tool-field-label">{t("seoSelectStructure")}</label>
            <input className="tool-input" style={{ marginBottom: "10px" }} value={search} onChange={e => setSearch(e.target.value)} placeholder={t("seoSearchKeywordPh")} />
            {filteredOutlines.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", padding: "10px 0" }}>{t("seoNoStructures")}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "220px", overflow: "auto" }}>
                {filteredOutlines.map(o => {
                  const on = structureId === o.id;
                  return (
                    <button key={o.id} onClick={() => setStructureId(o.id)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: "8px", cursor: "pointer", border: `1.5px solid ${on ? "var(--color-accent-blue)" : "var(--color-border)"}`, background: on ? "rgba(41,151,255,0.08)" : "var(--color-bg)" }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>{o.keyword}</div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>ID: {o.id.slice(0, 18)}…</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className={card}>
            <label style={{ display: "flex", alignItems: "center", gap: "9px", fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)", cursor: "pointer" }}>
              <input type="checkbox" checked={useCustom} onChange={e => setUseCustom(e.target.checked)} /> {t("seoAddCustomInstruction")}
            </label>
            {useCustom && <textarea className="tool-input" style={{ marginTop: "10px", minHeight: "70px", resize: "vertical" }} value={custom} onChange={e => setCustom(e.target.value)} placeholder={t("seoCustomInstructionPh")} />}
          </div>
        </div>
      </div>

      {err && <div className={card} style={{ borderColor: "rgba(255,69,58,0.35)", background: "rgba(255,69,58,0.06)", color: "var(--color-accent-red)", fontSize: "13px", display: "flex", gap: "8px", alignItems: "center" }}><AlertTriangle size={16} /> {err}</div>}

      {!jobId && (
        <button onClick={generate} disabled={loading || !structureId} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "13px", borderRadius: "10px", border: "none", background: "var(--color-accent-purple)", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: structureId ? "pointer" : "not-allowed", opacity: structureId ? 1 : 0.5 }}>
          {loading ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />} {t("seoGenerate")}
        </button>
      )}

      {jobId && (
        <SeoJobProgress
          jobId={jobId}
          keyword={jobKeyword}
          onDone={async (job) => { const rec = await importJob(job); setJobId(null); setHistory(loadHistory()); if (rec) router.push(`/seo-tools/history/${rec.id}`); }}
          onError={(m) => { setErr(m); setJobId(null); }}
        />
      )}

      {/* History */}
      <div className={card}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 14px" }}>{t("seoTextHistory")}</h3>
        <div style={{ display: "flex", gap: "6px", marginBottom: "12px", background: "var(--color-bg)", padding: "4px", borderRadius: "10px", width: "fit-content" }}>
          {([["all", `${t("seoTextFilterAll")} (${counts.all})`], ["processing", `${t("seoTextFilterProcessing")} (${counts.processing})`], ["error", `${t("seoTextFilterErrors")} (${counts.error})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k as any)} style={{ padding: "7px 16px", borderRadius: "7px", fontSize: "13px", fontWeight: filter === k ? 700 : 500, cursor: "pointer", border: "none", background: filter === k ? "var(--color-card)" : "transparent", color: filter === k ? "var(--color-text-primary)" : "var(--color-text-secondary)", boxShadow: filter === k ? "0 1px 3px rgba(0,0,0,0.15)" : "none" }}>{label}</button>
          ))}
        </div>

        {textHistory.length === 0 ? (
          <div style={{ padding: "28px 12px", textAlign: "center", fontSize: "13px", color: "var(--color-text-secondary)" }}>{t("seoHistEmpty")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {textHistory.map(item => (
              <div key={item.id} onClick={() => item.status === "completed" && router.push(`/seo-tools/history/${item.id}`)} style={{ padding: "14px 16px", borderRadius: "10px", border: "1px solid var(--color-border)", background: item.status === "processing" ? "rgba(41,151,255,0.05)" : "var(--color-bg)", cursor: item.status === "completed" ? "pointer" : "default", display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <StatusIcon status={item.status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>{item.keyword}</span>
                    {item.status === "processing" && <Badge text={t("seoStatusProcessing")} color="#2997ff" />}
                    {item.status === "error" && <Badge text={t("seoStatusError")} color="#ff453a" />}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-tertiary)", marginTop: "4px" }}>{t("seoPolCreatedAt")}: {new Date(item.createdAt).toLocaleString()}</div>
                  {item.meta?.tone && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{t("seoTonePromptLabel")}: {item.meta.tone}</div>}
                  {item.meta?.promptType && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{t("seoPromptType")}: {item.meta.promptType}</div>}
                  {item.status === "error" && item.meta?.error && <div style={{ fontSize: "12px", color: "var(--color-accent-red)", marginTop: "2px" }}>{item.meta.error}</div>}
                </div>
                <div style={{ flexShrink: 0, fontSize: "13px", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  {item.status === "processing" ? <span style={{ color: "var(--color-accent-blue)" }}>{t("seoStatusGenerating")}</span>
                    : item.status === "completed" ? <Eye size={16} color="var(--color-accent-blue)" />
                    : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "processing") return <Loader2 size={18} className="spin" color="var(--color-accent-blue)" style={{ marginTop: "1px", flexShrink: 0 }} />;
  if (status === "error") return <AlertTriangle size={18} color="var(--color-accent-red)" style={{ marginTop: "1px", flexShrink: 0 }} />;
  return <span style={{ marginTop: "5px", width: 9, height: 9, borderRadius: "50%", background: "var(--color-accent-green)", flexShrink: 0 }} />;
}
function Badge({ text, color, outline }: { text: string; color: string; outline?: boolean }) {
  return <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 9px", borderRadius: "20px", color: outline ? "var(--color-text-secondary)" : color, background: outline ? "transparent" : `${color}1a`, border: outline ? "1px solid var(--color-border)" : "none" }}>{text}</span>;
}
