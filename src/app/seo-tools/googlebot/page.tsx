"use client";

// Googlebot View — "see" a page as Google's crawler does and spot cloaking / hidden redirects
// / PBN tricks by diffing the Googlebot-UA response against a normal browser response.
// For your OWN verified GSC sites, a "True Google View" panel adds Google's real verdict
// (googleCanonical vs userCanonical). See docs/GOOGLEBOT-VIEW-SPEC.md.

import { useState } from "react";
import Link from "next/link";
import { Loader2, AlertTriangle, Bot, Monitor, ShieldCheck, ShieldAlert, ShieldX, ArrowRight, Globe, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

const card = "panel";
const inputStyle = "tool-input";
const btnPurple: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "7px", padding: "10px 16px", borderRadius: "9px", border: "none", background: "var(--color-accent-purple)", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" };

type Hop = { url: string; status: number; location?: string; redirectType?: string; setCookie?: boolean };
type Signals = { canonicalHtml?: string; metaRobots?: string; hreflang: { lang: string; href: string }[]; title: string; metaDescription?: string; h1?: string; jsRedirects: string[]; indexable: boolean; indexableReasons: string[] };
type View = { ua: string; ok: boolean; blocked?: boolean; hops: Hop[]; finalUrl: string; finalStatus: number; headers: Record<string, string | undefined>; signals: Signals; wordCount: number; error?: string };
type Diff = { verdict: "clean" | "suspicious" | "cloaking"; score: number; flags: string[] };
type Gsc = { verdict?: string | null; coverageState?: string | null; indexingState?: string | null; robotsTxtState?: string | null; pageFetchState?: string | null; crawledAs?: string | null; googleCanonical?: string | null; userCanonical?: string | null; lastCrawlTime?: string | null };
type Result = { url: string; views: View[]; diff: Diff; ownSite?: { id: string; url: string } | null; gsc?: Gsc | null };

const UA_LABEL: Record<string, string> = { gbMobile: "Googlebot (mobile)", gbDesktop: "Googlebot (desktop)", chrome: "Browser" };

export default function GooglebotViewPage() {
  const { t } = useLanguage();
  const [url, setUrl] = useState("");
  const [desktop, setDesktop] = useState(false);
  const [referer, setReferer] = useState(false);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Result | null>(null);

  async function run() {
    if (!url.trim()) return;
    setRunning(true); setErr(""); setRes(null);
    try {
      const r = await fetch("/api/seo/googlebot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), desktop, referer }),
      });
      const d = await r.json();
      if (!r.ok) setErr(d.error === "private_host" ? t("gbvErrPrivate") : d.error === "bad_url" ? t("gbvErrUrl") : d.error || "error");
      else setRes(d);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setRunning(false);
  }

  const gb = res?.views.find(v => v.ua === "gbMobile");
  const br = res?.views.find(v => v.ua === "chrome");

  const verdictUi = {
    clean: { icon: ShieldCheck, color: "var(--color-accent-green)", bg: "rgba(52,199,89,0.08)", bd: "rgba(52,199,89,0.35)", label: t("gbvVerdictClean") },
    suspicious: { icon: ShieldAlert, color: "var(--color-accent-orange)", bg: "rgba(255,159,10,0.08)", bd: "rgba(255,159,10,0.35)", label: t("gbvVerdictSuspicious") },
    cloaking: { icon: ShieldX, color: "var(--color-accent-red)", bg: "rgba(255,69,58,0.08)", bd: "rgba(255,69,58,0.4)", label: t("gbvVerdictCloaking") },
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 4px", display: "flex", alignItems: "center", gap: "9px" }}>
          <Bot size={20} color="var(--color-accent-purple)" /> {t("gbvTitle")}
        </h2>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0 }}>{t("gbvSub")}</p>
      </div>

      {/* Input */}
      <div className={card}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input
            className={inputStyle}
            style={{ flex: 1, minWidth: "260px" }}
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") run(); }}
            placeholder={t("gbvUrlPh")}
          />
          <button onClick={run} disabled={running || !url.trim()} style={{ ...btnPurple, opacity: running || !url.trim() ? 0.6 : 1 }}>
            {running ? <Loader2 size={15} className="spin" /> : <Bot size={15} />} {t("gbvRun")}
          </button>
        </div>
        <div style={{ display: "flex", gap: "16px", marginTop: "10px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-text-secondary)", cursor: "pointer" }}>
            <input type="checkbox" checked={desktop} onChange={e => setDesktop(e.target.checked)} /> {t("gbvOptDesktop")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-text-secondary)", cursor: "pointer" }}>
            <input type="checkbox" checked={referer} onChange={e => setReferer(e.target.checked)} /> {t("gbvOptReferer")}
          </label>
        </div>
        <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "10px", lineHeight: 1.5 }}>{t("gbvDisclaimer")}</div>
      </div>

      {err && <div className={card} style={{ borderColor: "rgba(255,69,58,0.35)", background: "rgba(255,69,58,0.06)", color: "var(--color-accent-red)", fontSize: "12px" }}>{err}</div>}

      {res && (
        <>
          {/* Verdict */}
          {(() => {
            const v = verdictUi[res.diff.verdict];
            const Icon = v.icon;
            return (
              <div className={card} style={{ borderColor: v.bd, background: v.bg }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Icon size={22} color={v.color} />
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: v.color }}>{v.label}</div>
                    <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{t("gbvScore")}: {res.diff.score}/100</div>
                  </div>
                </div>
                {res.diff.flags.length > 0 && (
                  <ul style={{ margin: "10px 0 0", paddingLeft: "18px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                    {res.diff.flags.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
              </div>
            );
          })()}

          {/* Comparison table */}
          {gb && br && (
            <div className={card}>
              <div className="tool-section-label" style={{ marginBottom: "10px" }}>{t("gbvCompare")}</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--color-text-tertiary)", fontSize: "10px", textTransform: "uppercase" }}>
                      <th style={{ padding: "6px 8px" }}></th>
                      <th style={{ padding: "6px 8px" }}><Bot size={13} style={{ verticalAlign: "-2px" }} /> {t("gbvColGooglebot")}</th>
                      <th style={{ padding: "6px 8px" }}><Monitor size={13} style={{ verticalAlign: "-2px" }} /> {t("gbvColBrowser")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRow(t("gbvRowStatus"), String(gb.finalStatus) + (gb.blocked ? ` · ${t("gbvBlocked")}` : ""), String(br.finalStatus) + (br.blocked ? ` · ${t("gbvBlocked")}` : ""), gb.finalStatus !== br.finalStatus)}
                    {compareRow(t("gbvRowFinalUrl"), gb.finalUrl, br.finalUrl, hostOf(gb.finalUrl) !== hostOf(br.finalUrl))}
                    {compareRow(t("gbvCanonicalHtml"), gb.signals.canonicalHtml || "—", br.signals.canonicalHtml || "—", !!gb.signals.canonicalHtml && !!br.signals.canonicalHtml && gb.signals.canonicalHtml !== br.signals.canonicalHtml)}
                    {compareRow(t("gbvMetaRobots"), gb.signals.metaRobots || "—", br.signals.metaRobots || "—", (gb.signals.metaRobots || "") !== (br.signals.metaRobots || ""))}
                    {compareRow(t("gbvXRobots"), gb.headers.xRobotsTag || "—", br.headers.xRobotsTag || "—", (gb.headers.xRobotsTag || "") !== (br.headers.xRobotsTag || ""))}
                    {compareRow(t("gbvRowTitle"), gb.signals.title || "—", br.signals.title || "—", (gb.signals.title || "") !== (br.signals.title || ""))}
                    {compareRow(t("gbvRowWords"), String(gb.wordCount), String(br.wordCount), Math.abs(gb.wordCount - br.wordCount) / Math.max(gb.wordCount, br.wordCount || 1) > 0.4)}
                    {compareRow(t("gbvRowIndexable"), gb.signals.indexable ? "✓" : "noindex", br.signals.indexable ? "✓" : "noindex", gb.signals.indexable !== br.signals.indexable)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Redirect chains */}
          <div className={card}>
            <div className="tool-section-label" style={{ marginBottom: "10px" }}>{t("gbvRedirectChain")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {res.views.map((v, vi) => (
                <div key={vi}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                    {v.ua === "chrome" ? <Monitor size={13} /> : <Bot size={13} />} {UA_LABEL[v.ua] || v.ua}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", fontSize: "11px" }}>
                    {v.hops.map((h, hi) => (
                      <span key={hi} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 8px", borderRadius: "6px", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                          <b style={{ color: statusColor(h.status) }}>{h.status || "×"}</b>
                          <span style={{ maxWidth: "320px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.url}</span>
                          {h.redirectType && h.redirectType !== "http" && <em style={{ color: "var(--color-accent-orange)", fontStyle: "normal" }}>[{h.redirectType}]</em>}
                        </span>
                        {hi < v.hops.length - 1 && <ArrowRight size={12} color="var(--color-text-tertiary)" />}
                      </span>
                    ))}
                    {v.error && <span style={{ color: "var(--color-accent-red)" }}>· {v.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SEO signals (Googlebot view) */}
          {gb && (gb.signals.hreflang.length > 0 || gb.headers.canonicalHeader || gb.signals.jsRedirects.length > 0) && (
            <div className={card}>
              <div className="tool-section-label" style={{ marginBottom: "10px" }}>{t("gbvSignals")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "var(--color-text-secondary)" }}>
                {gb.headers.canonicalHeader && <div><b>{t("gbvCanonicalHeader")}:</b> {gb.headers.canonicalHeader}</div>}
                {gb.signals.jsRedirects.length > 0 && <div><b>{t("gbvJsRedirect")}:</b> {gb.signals.jsRedirects.join(", ")}</div>}
                {gb.signals.hreflang.length > 0 && (
                  <div><b>{t("gbvHreflang")}:</b> {gb.signals.hreflang.map(h => `${h.lang}`).join(", ")}</div>
                )}
              </div>
            </div>
          )}

          {/* True Google View — own verified sites only */}
          {res.ownSite && (
            <div className={card} style={{ borderColor: "rgba(66,133,244,0.35)", background: "rgba(66,133,244,0.05)" }}>
              <div className="tool-section-label" style={{ marginBottom: "10px", display: "flex", alignItems: "center", gap: "7px" }}>
                <Globe size={14} color="#4285F4" /> {t("gbvTrueView")}
              </div>
              {res.gsc ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: "8px", fontSize: "12px" }}>
                  {gscRow(t("gbvGscVerdict"), res.gsc.verdict)}
                  {gscRow(t("gbvGscCoverage"), res.gsc.coverageState)}
                  {gscRow(t("gbvGscIndexing"), res.gsc.indexingState)}
                  {gscRow(t("gbvGscRobots"), res.gsc.robotsTxtState)}
                  {gscRow(t("gbvGscFetch"), res.gsc.pageFetchState)}
                  {gscRow(t("gbvGscCrawledAs"), res.gsc.crawledAs)}
                  {gscRow(t("gbvGscUserCanonical"), res.gsc.userCanonical)}
                  {gscRow(t("gbvGscGoogleCanonical"), res.gsc.googleCanonical)}
                  {gscRow(t("gbvLastCrawl"), res.gsc.lastCrawlTime ? new Date(res.gsc.lastCrawlTime).toLocaleString() : null)}
                  {res.gsc.userCanonical && res.gsc.googleCanonical && res.gsc.userCanonical !== res.gsc.googleCanonical && (
                    <div style={{ gridColumn: "1/-1", color: "var(--color-accent-orange)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <AlertTriangle size={14} /> {t("gbvCanonicalMismatch")}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <CheckCircle2 size={14} color="#4285F4" /> {t("gbvGscUnavailable")} <Link href="/settings" style={{ color: "var(--color-accent-blue)" }}>{t("gbvGscConnect")}</Link>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function compareRow(label: string, a: string, b: string, diff: boolean) {
  return (
    <tr style={{ borderTop: "1px solid var(--color-border)" }}>
      <td style={{ padding: "7px 8px", color: "var(--color-text-tertiary)", whiteSpace: "nowrap", verticalAlign: "top" }}>{label}</td>
      <td style={{ padding: "7px 8px", color: diff ? "var(--color-accent-orange)" : "var(--color-text-primary)", wordBreak: "break-all", fontWeight: diff ? 600 : 400 }}>{a}</td>
      <td style={{ padding: "7px 8px", color: diff ? "var(--color-accent-orange)" : "var(--color-text-primary)", wordBreak: "break-all", fontWeight: diff ? 600 : 400 }}>{b}</td>
    </tr>
  );
}

function gscRow(label: string, value?: string | null) {
  return (
    <div style={{ padding: "7px 9px", borderRadius: "7px", border: "1px solid var(--color-border)", background: "var(--color-bg)" }}>
      <div style={{ fontSize: "10px", textTransform: "uppercase", color: "var(--color-text-tertiary)" }}>{label}</div>
      <div style={{ color: "var(--color-text-primary)", wordBreak: "break-all", marginTop: "2px" }}>{value || "—"}</div>
    </div>
  );
}

function hostOf(u: string): string { try { return new URL(u).host; } catch { return u; } }
function statusColor(s: number): string {
  if (s >= 200 && s < 300) return "var(--color-accent-green)";
  if (s >= 300 && s < 400) return "var(--color-accent-blue)";
  if (s >= 400) return "var(--color-accent-red)";
  return "var(--color-text-tertiary)";
}
