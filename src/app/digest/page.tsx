"use client";

// Digest tab — build a Markdown summary over all sites or one tag (a site network),
// preview it on screen, send it to Telegram, and configure the recurring schedule.
// Building happens server-side from the local metric store; the optional AI paragraph
// uses the user's own AI key (server-side backup).

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Send, Eye, Trash2, AlertTriangle, Newspaper, Save } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { markdownToHtml } from "@/lib/seo/outlineFormat";

const btn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "7px", padding: "10px 16px", borderRadius: "9px", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
const input: React.CSSProperties = { padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-text-primary)", fontSize: "12px" };

export default function DigestPage() {
  const { t, language } = useLanguage() as any;
  const [tags, setTags] = useState<string[]>([]);
  const [telegram, setTelegram] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  const [tag, setTag] = useState("");
  const [days, setDays] = useState(7);
  const [ai, setAi] = useState(false);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState<"" | "preview" | "send" | "save">("");
  const [msg, setMsg] = useState("");

  const reload = async () => {
    try {
      const d = await fetch("/api/digest").then(r => r.json());
      setTags(d.tags || []);
      setTelegram(!!d.telegram);
      setHistory(d.digests || []);
      setSettings(d.settings || null);
      if (d.settings) { setTag(d.settings.tag ?? ""); setDays(d.settings.days ?? 7); setAi(!!d.settings.ai); }
    } catch {}
  };
  useEffect(() => { reload(); }, []);

  const run = async (action: "preview" | "send") => {
    setBusy(action); setMsg("");
    try {
      const d = await fetch("/api/digest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, tag, days, ai, lang: language }),
      }).then(r => r.json());
      if (d.content) setPreview(d.content);
      if (action === "send") {
        setMsg(d.sent ? t("digestSentOk") : t("digestSentFail"));
        reload();
      }
    } catch (e: any) { setMsg(String(e?.message ?? e)); }
    setBusy("");
  };

  const saveSchedule = async (patch: any) => {
    const next = { ...settings, ...patch, lang: language };
    setSettings(next);
    setBusy("save");
    try {
      await fetch("/api/digest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", settings: next }),
      });
    } catch {}
    setBusy("");
  };

  const removeDigest = async (id: string) => {
    await fetch(`/api/digest?id=${id}`, { method: "DELETE" }).catch(() => {});
    setHistory(h => h.filter(x => x.id !== id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "24px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Newspaper size={22} style={{ color: "#34c759" }} />
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}>{t("digestTitle")}</h1>
          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{t("digestSubtitle")}</div>
        </div>
      </div>

      {!telegram && (
        <div style={{ padding: "12px 16px", borderRadius: "8px", border: "1px solid rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.06)", fontSize: "13px", color: "#FCD34D", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <AlertTriangle size={14} /> {t("digestNoTelegram")}
          <Link href="/settings?tab=notifications" style={{ color: "var(--color-accent-blue)" }}>{t("digestConnectLink")}</Link>
        </div>
      )}

      {/* Builder */}
      <div className="panel" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <select value={tag} onChange={e => setTag(e.target.value)} style={{ ...input, minWidth: "160px" }}>
          <option value="">{t("digestAllSites")}</option>
          {tags.map(x => <option key={x} value={x}>{t("digestTagPrefix")} {x}</option>)}
        </select>
        <select value={days} onChange={e => setDays(parseInt(e.target.value))} style={input}>
          {[7, 14, 30].map(n => <option key={n} value={n}>{n} {t("digestDaysUnit")}</option>)}
        </select>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={ai} onChange={e => setAi(e.target.checked)} /> {t("digestAiToggle")}
        </label>
        <span style={{ flex: 1 }} />
        <button onClick={() => run("preview")} disabled={!!busy} style={{ ...btn, background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
          {busy === "preview" ? <Loader2 size={14} className="spin" /> : <Eye size={14} />} {t("digestPreview")}
        </button>
        <button onClick={() => run("send")} disabled={!!busy || !telegram} style={{ ...btn, background: telegram ? "var(--color-accent-blue)" : "rgba(255,255,255,0.08)", color: telegram ? "#fff" : "var(--color-text-secondary)" }}>
          {busy === "send" ? <Loader2 size={14} className="spin" /> : <Send size={14} />} {t("digestSend")}
        </button>
      </div>
      {msg && <div style={{ fontSize: "12px", color: msg === t("digestSentOk") ? "#34c759" : "#f87171" }}>{msg}</div>}

      {/* Preview */}
      {preview && (
        <div className="panel">
          <div dangerouslySetInnerHTML={{ __html: markdownToHtml(preview.replace(/^\*(.+)\*$/gm, "**$1**")) }}
            style={{ fontSize: "13px", lineHeight: 1.7, color: "var(--color-text-primary)" }} />
        </div>
      )}

      {/* Schedule */}
      {settings && (
        <div className="panel">
          <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "12px" }}>{t("digestScheduleTitle")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--color-text-primary)", cursor: "pointer" }}>
              <input type="checkbox" checked={!!settings.enabled} onChange={e => saveSchedule({ enabled: e.target.checked })} /> {t("digestScheduleEnable")}
            </label>
            <select value={settings.frequency} onChange={e => saveSchedule({ frequency: e.target.value })} style={input}>
              <option value="weekly">{t("digestWeekly")}</option>
              <option value="daily">{t("digestDaily")}</option>
            </select>
            <select value={settings.hourUtc} onChange={e => saveSchedule({ hourUtc: parseInt(e.target.value) })} style={input}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00 UTC</option>)}
            </select>
            <select value={settings.tag ?? ""} onChange={e => saveSchedule({ tag: e.target.value })} style={{ ...input, minWidth: "140px" }}>
              <option value="">{t("digestAllSites")}</option>
              {tags.map(x => <option key={x} value={x}>{t("digestTagPrefix")} {x}</option>)}
            </select>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-text-secondary)", cursor: "pointer" }}>
              <input type="checkbox" checked={!!settings.ai} onChange={e => saveSchedule({ ai: e.target.checked })} /> {t("digestAiToggle")}
            </label>
            {busy === "save" ? <Loader2 size={13} className="spin" style={{ color: "var(--color-text-secondary)" }} /> : <Save size={13} style={{ color: "#34c759" }} />}
          </div>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "8px" }}>{t("digestScheduleNote")}</div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="panel">
          <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "10px" }}>{t("digestHistory")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {history.map(d => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", borderRadius: "8px", cursor: "pointer" }}
                onClick={() => setPreview(d.content)}>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", minWidth: "140px" }}>{new Date(d.createdAt).toLocaleString()}</span>
                <span style={{ fontSize: "12px", color: "var(--color-text-primary)", fontWeight: 600 }}>{d.tag ? `${t("digestTagPrefix")} ${d.tag}` : t("digestAllSites")}</span>
                <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>{d.days}d</span>
                {d.sentTo === "telegram" && <span style={{ fontSize: "11px", color: "#34c759" }}>✓ Telegram</span>}
                <span style={{ flex: 1 }} />
                <button onClick={e => { e.stopPropagation(); removeDigest(d.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", padding: "2px" }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
