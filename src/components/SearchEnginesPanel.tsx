"use client";

// Search Engines panel (site → Indexing tab): Bing Webmaster, Yandex.Webmaster and
// IndexNow in one row of cards. Until now the Bing/IndexNow/Yandex API routes existed
// with no UI calling them — this panel is that UI. Keys live browser-side
// (seoKey_bing / seoKey_yandex / seoKey_indexnow, synced by SeoKeysSync) and are
// passed per-request, matching the app's key convention.

import { useEffect, useState } from "react";
import { Loader2, Send, RefreshCw, ExternalLink } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

const card: React.CSSProperties = { background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" };
const btn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 13px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)", fontSize: "12px", fontWeight: 600, cursor: "pointer" };
const inputS: React.CSSProperties = { padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-primary)", fontSize: "12px", outline: "none", width: "100%", boxSizing: "border-box" };

function Head({ logo, color, title, connected, hintKey }: { logo: string; color: string; title: string; connected: boolean; hintKey: string }) {
  const { t } = useLanguage();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ width: 28, height: 28, borderRadius: "7px", background: `${color}1f`, border: `1px solid ${color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800, color }}>{logo}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)" }}>{title}</div>
        {!connected && (
          <a href="/settings?tab=indexing-api" style={{ fontSize: "11px", color: "var(--color-accent-blue)", textDecoration: "none" }}>{t(hintKey as any)}</a>
        )}
      </div>
      {connected && <span style={{ fontSize: "11px", color: "#10B981", fontWeight: 600 }}>●</span>}
    </div>
  );
}

export default function SearchEnginesPanel({ siteDbId, domain }: { siteDbId: string; domain: string }) {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^sc-domain:/, "").replace(/\/.*$/, "");
  const bingKey = mounted ? localStorage.getItem("seoKey_bing") || "" : "";
  const yandexToken = mounted ? localStorage.getItem("seoKey_yandex") || "" : "";
  const indexNowKey = mounted ? localStorage.getItem("seoKey_indexnow") || "" : "";

  const [sitemapUrl, setSitemapUrl] = useState("");
  useEffect(() => { setSitemapUrl(`https://${cleanDomain}/sitemap.xml`); }, [cleanDomain]);

  // ── Bing state ──
  const [bingBusy, setBingBusy] = useState("");
  const [bingMsg, setBingMsg] = useState("");
  const [bingStats, setBingStats] = useState<any>(null);

  const bingLoad = async () => {
    setBingBusy("stats"); setBingMsg("");
    try {
      const d = await fetch(`/api/indexing/bing?siteUrl=${encodeURIComponent(`https://${cleanDomain}/`)}&apiKey=${encodeURIComponent(bingKey)}`).then(r => r.json());
      if (d.error) setBingMsg(String(d.error));
      else {
        const last = Array.isArray(d.traffic) && d.traffic.length ? d.traffic[d.traffic.length - 1] : null;
        setBingStats({ clicks: last?.Clicks ?? null, impressions: last?.Impressions ?? null, queries: (d.queries ?? []).slice(0, 5) });
      }
    } catch (e: any) { setBingMsg(String(e?.message ?? e)); }
    setBingBusy("");
  };

  const bingSitemap = async () => {
    setBingBusy("sitemap"); setBingMsg("");
    try {
      const d = await fetch("/api/indexing/bing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl: `https://${cleanDomain}/`, sitemapUrl, apiKey: bingKey || undefined }),
      }).then(r => r.json());
      setBingMsg(d.ok ? `✓ ${t("sePanelSitemapOk")} (${d.method})` : String(d.error ?? "error"));
    } catch (e: any) { setBingMsg(String(e?.message ?? e)); }
    setBingBusy("");
  };

  // ── Yandex state ──
  const [yBusy, setYBusy] = useState("");
  const [yMsg, setYMsg] = useState("");
  const [yStats, setYStats] = useState<any>(null);
  const [recrawlText, setRecrawlText] = useState("");

  const yLoad = async () => {
    setYBusy("stats"); setYMsg("");
    try {
      const d = await fetch(`/api/indexing/yandex?siteUrl=${encodeURIComponent(cleanDomain)}&token=${encodeURIComponent(yandexToken)}`).then(r => r.json());
      if (d.error) setYMsg(d.error === "host_not_found" ? t("seYandexHostNotFound") : d.error === "host_not_verified" ? t("seYandexHostNotVerified") : String(d.error));
      else setYStats(d);
    } catch (e: any) { setYMsg(String(e?.message ?? e)); }
    setYBusy("");
  };

  const yAction = async (action: "sitemap" | "recrawl") => {
    setYBusy(action); setYMsg("");
    try {
      const urls = recrawlText.split("\n").map(s => s.trim()).filter(Boolean);
      const d = await fetch("/api/indexing/yandex", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, siteUrl: cleanDomain, token: yandexToken, sitemapUrl, urls }),
      }).then(r => r.json());
      if (action === "sitemap") setYMsg(d.ok ? `✓ ${t("sePanelSitemapOk")}${d.alreadyAdded ? ` (${t("seYandexAlready")})` : ""}` : String(d.error ?? "error"));
      else {
        const ok = (d.results ?? []).filter((r: any) => r.ok).length;
        setYMsg(d.results ? `✓ ${ok}/${d.results.length} ${t("seYandexRecrawlSent")}` : String(d.error ?? "error"));
        if (ok) setRecrawlText("");
      }
    } catch (e: any) { setYMsg(String(e?.message ?? e)); }
    setYBusy("");
  };

  // ── IndexNow state ──
  const [inBusy, setInBusy] = useState(false);
  const [inMsg, setInMsg] = useState("");
  const [inText, setInText] = useState("");

  const inSubmit = async () => {
    setInBusy(true); setInMsg("");
    try {
      const urls = inText.split("\n").map(s => s.trim()).filter(u => u.startsWith("http"));
      const d = await fetch("/api/indexing/indexnow", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: cleanDomain, key: indexNowKey, urls }),
      }).then(r => r.json());
      setInMsg(d.ok ? `✓ ${t("seIndexNowOk")} (${urls.length})` : String(d.error ?? "error"));
      if (d.ok) setInText("");
    } catch (e: any) { setInMsg(String(e?.message ?? e)); }
    setInBusy(false);
  };

  const msgStyle = (m: string): React.CSSProperties => ({ fontSize: "11px", color: m.startsWith("✓") ? "#10B981" : "#f87171", wordBreak: "break-word" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("sePanelTitle")}</div>
        <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>{t("sePanelSub")}</span>
        <span style={{ flex: 1 }} />
        <input value={sitemapUrl} onChange={e => setSitemapUrl(e.target.value)} style={{ ...inputS, width: "280px", fontFamily: "monospace", fontSize: "11px" }} title="Sitemap URL" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "10px" }}>
        {/* ── Bing ── */}
        <div style={card}>
          <Head logo="B" color="#00809D" title="Bing Webmaster" connected={!!bingKey} hintKey="seNeedKey" />
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button onClick={bingLoad} disabled={!bingKey || !!bingBusy} style={{ ...btn, opacity: bingKey ? 1 : 0.5 }}>
              {bingBusy === "stats" ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} {t("seLoadStats")}
            </button>
            <button onClick={bingSitemap} disabled={!!bingBusy} style={btn}>
              {bingBusy === "sitemap" ? <Loader2 size={12} className="spin" /> : <Send size={12} />} {t("seSubmitSitemap")}
            </button>
          </div>
          {bingStats && (
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              {bingStats.clicks != null && <div>{t("clicks")}: <b style={{ color: "var(--color-text-primary)" }}>{bingStats.clicks}</b> · {t("impressions")}: <b style={{ color: "var(--color-text-primary)" }}>{bingStats.impressions}</b></div>}
              {bingStats.queries.map((q: any, i: number) => (
                <div key={i} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {q.Query ?? q.query} — {q.Clicks ?? q.clicks ?? 0}</div>
              ))}
            </div>
          )}
          {bingMsg && <div style={msgStyle(bingMsg)}>{bingMsg}</div>}
        </div>

        {/* ── Yandex ── */}
        <div style={card}>
          <Head logo="Я" color="#FC3F1D" title="Яндекс.Вебмастер" connected={!!yandexToken} hintKey="seNeedToken" />
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button onClick={yLoad} disabled={!yandexToken || !!yBusy} style={{ ...btn, opacity: yandexToken ? 1 : 0.5 }}>
              {yBusy === "stats" ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />} {t("seLoadStats")}
            </button>
            <button onClick={() => yAction("sitemap")} disabled={!yandexToken || !!yBusy} style={{ ...btn, opacity: yandexToken ? 1 : 0.5 }}>
              {yBusy === "sitemap" ? <Loader2 size={12} className="spin" /> : <Send size={12} />} {t("seSubmitSitemap")}
            </button>
          </div>
          {yStats?.summary && (
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              <div>SQI: <b style={{ color: "var(--color-text-primary)" }}>{yStats.summary.sqi ?? "—"}</b> · {t("seYandexInSearch")}: <b style={{ color: "var(--color-text-primary)" }}>{yStats.summary.searchable_pages_count ?? "—"}</b> · {t("seYandexExcluded")}: <b style={{ color: "var(--color-text-primary)" }}>{yStats.summary.excluded_pages_count ?? "—"}</b></div>
              {yStats.recrawlQuota && <div>{t("seYandexQuota")}: <b style={{ color: "var(--color-text-primary)" }}>{yStats.recrawlQuota.daily_quota - (yStats.recrawlQuota.quota_remainder != null ? yStats.recrawlQuota.daily_quota - yStats.recrawlQuota.quota_remainder : 0)}</b>/{yStats.recrawlQuota.daily_quota}</div>}
              {(yStats.queries ?? []).slice(0, 4).map((q: any, i: number) => (
                <div key={i} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {q.query_text} — {q.indicators?.TOTAL_CLICKS ?? 0} / {q.indicators?.TOTAL_SHOWS ?? 0}</div>
              ))}
            </div>
          )}
          <textarea value={recrawlText} onChange={e => setRecrawlText(e.target.value)} placeholder={t("seYandexRecrawlPh")} rows={2}
            style={{ ...inputS, fontFamily: "monospace", fontSize: "11px", resize: "vertical" }} />
          <button onClick={() => yAction("recrawl")} disabled={!yandexToken || !recrawlText.trim() || !!yBusy} style={{ ...btn, opacity: yandexToken && recrawlText.trim() ? 1 : 0.5, alignSelf: "flex-start" }}>
            {yBusy === "recrawl" ? <Loader2 size={12} className="spin" /> : <Send size={12} />} {t("seYandexRecrawl")}
          </button>
          {yMsg && <div style={msgStyle(yMsg)}>{yMsg}</div>}
        </div>

        {/* ── IndexNow ── */}
        <div style={card}>
          <Head logo="IN" color="#7C3AED" title="IndexNow" connected={!!indexNowKey} hintKey="seNeedKey" />
          <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
            {t("seIndexNowNote")} <code style={{ fontSize: "10px" }}>https://{cleanDomain}/{indexNowKey ? indexNowKey.slice(0, 8) + "…" : "<key>"}.txt</code>
          </div>
          <textarea value={inText} onChange={e => setInText(e.target.value)} placeholder={t("seIndexNowPh")} rows={3}
            style={{ ...inputS, fontFamily: "monospace", fontSize: "11px", resize: "vertical" }} />
          <button onClick={inSubmit} disabled={!indexNowKey || !inText.trim() || inBusy} style={{ ...btn, opacity: indexNowKey && inText.trim() ? 1 : 0.5, alignSelf: "flex-start" }}>
            {inBusy ? <Loader2 size={12} className="spin" /> : <Send size={12} />} {t("seIndexNowSubmit")}
          </button>
          {inMsg && <div style={msgStyle(inMsg)}>{inMsg}</div>}
        </div>
      </div>
    </div>
  );
}
