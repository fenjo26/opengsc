"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import {
  ArrowLeft, Plus, X, CheckCircle, AlertCircle,
  Users, Settings, Globe, Key, Edit2, Copy,
  ChevronDown, Crown, Zap, Star, Eye, Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import SeoToolsSettings from "@/components/SeoToolsSettings";

type NavItem = "accounts" | "teams" | "api" | "indexing-api" | "seo-tools" | "members" | "preferences" | "supersites";

interface ConnectedAccount {
  id: string; email: string; picture: string | null; connected: boolean; gscAccess: boolean; ga4Access?: boolean;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function UserAvatar({ email, picture, size = 36 }: { email: string; picture?: string | null; size?: number }) {
  const colors = ["#8B5CF6","#3B82F6","#10B981","#F59E0B","#EF4444","#06B6D4"];
  const color = colors[email.charCodeAt(0) % colors.length];
  if (picture) return <img src={picture} alt={email} width={size} height={size} style={{ borderRadius: "50%", flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
      {email[0].toUpperCase()}
    </div>
  );
}

function SectionCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", padding: "24px", ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ icon, title, sub }: { icon?: React.ReactNode; title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: sub ? "6px" : "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {icon && <span style={{ color: "var(--color-text-primary)" }}>{icon}</span>}
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)" }}>{title}</h2>
      </div>
      {sub && <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "4px", marginBottom: "20px" }}>{sub}</p>}
    </div>
  );
}

function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.618 14.115 17.64 11.807 17.64 9.2z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

// ─── Section: My Google Accounts ──────────────────────────────────────────────
function AccountsSection({ user, accounts, loadingAccounts, removing, onAdd, onRemove, onReauth }: {
  user: any; accounts: ConnectedAccount[]; loadingAccounts: boolean;
  removing: string | null; onAdd: () => void; onRemove: (id: string) => void; onReauth: (email: string) => void;
}) {
  const { t } = useLanguage();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "20px", alignItems: "flex-start" }}>
      <SectionCard>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <GoogleIcon size={17} />
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("yourAccount")}</h2>
        </div>
        {user && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
              <UserAvatar email={user.email ?? ""} picture={user.image} size={44} />
              <div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>{user.name}</div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{user.email}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                {t("scStatus")}: <span style={{ color: "#10B981" }}>{t("scConnected")}</span>
              </span>
              <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                {t("ga4Status")}: {accounts.some(a => a.ga4Access) ? (
                  <span style={{ color: "#10B981" }}>{t("scConnected")}</span>
                ) : (
                  <span style={{ color: "#F59E0B" }}>{t("scNotConnected")}</span>
                )}
              </span>
            </div>
            <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              {t("revokeDesc")}{" "}
              <a href="https://myaccount.google.com/" target="_blank" rel="noreferrer" style={{ color: "var(--color-accent-blue)" }}>https://myaccount.google.com/</a>
              {" "}{t("revokeDesc2")}
            </p>
          </>
        )}
      </SectionCard>

      <SectionCard>
        <div style={{ marginBottom: "16px" }}>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <GoogleIcon size={15} />
            <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>{t("linkedAccounts")}</h2>
            {!loadingAccounts && (
              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", background: "rgba(255,255,255,0.06)", borderRadius: "20px", padding: "2px 8px" }}>
                {accounts.length} {accounts.length !== 1 ? t("accounts") : t("account")}
              </span>
            )}
          </div>
          {/* Action buttons row */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => {
              fetch("/api/gsc/sync", { method: "POST" });
              alert(t("syncStarted"));
            }} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "7px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, background: "rgba(16,185,129,0.12)", color: "#10B981", border: "1px solid rgba(16,185,129,0.25)", cursor: "pointer" }}
              onMouseOver={e => e.currentTarget.style.background = "rgba(16,185,129,0.2)"} onMouseOut={e => e.currentTarget.style.background = "rgba(16,185,129,0.12)"}
            ><Globe size={13} /> {t("syncNow")}</button>

            <button onClick={onAdd} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "7px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, background: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.25)", cursor: "pointer" }}
              onMouseOver={e => e.currentTarget.style.background = "rgba(59,130,246,0.2)"} onMouseOut={e => e.currentTarget.style.background = "rgba(59,130,246,0.12)"}
            ><Plus size={13} /> {t("addAccount")}</button>
          </div>
        </div>

        {/* OAuth Test Users warning */}
        <div style={{ padding: "12px 14px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "8px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#F59E0B", marginBottom: "4px" }}>{t("oauthTestModeTitle")}</div>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{t("oauthTestModeDesc")}</div>
        </div>
        {loadingAccounts ? (
          <div style={{ color: "var(--color-text-secondary)", fontSize: "13px", padding: "12px 0" }}>{t("loadingAccounts")}</div>
        ) : accounts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px 0" }}>
            <Globe size={28} style={{ color: "var(--color-text-secondary)", marginBottom: "10px", opacity: 0.4 }} />
            <p style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
              {t("noAccountsLinked")}<br />{t("noAccountsLinkedHint")}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {accounts.map(acc => (
              <div key={acc.id} style={{ borderRadius: "8px", border: confirmDeleteId === acc.id ? "1px solid rgba(239,68,68,0.4)" : acc.gscAccess ? "1px solid transparent" : "1px solid rgba(239,68,68,0.2)", background: confirmDeleteId === acc.id ? "rgba(239,68,68,0.07)" : acc.gscAccess ? "transparent" : "rgba(239,68,68,0.04)", transition: "all 0.15s" }}>

                {/* Main account row */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 8px" }}>
                  <UserAvatar email={acc.email} picture={acc.picture} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.email.split("@")[0]}</div>
                    <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.email}</div>
                  </div>
                  <span style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "3px", color: acc.gscAccess ? "#10B981" : "#f87171", flexShrink: 0 }}>
                    GSC {acc.gscAccess ? <CheckCircle size={11} color="#10B981" /> : <AlertCircle size={11} color="#f87171" />}
                  </span>
                  <span style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "3px", color: acc.ga4Access ? "#10B981" : "var(--color-text-secondary)", flexShrink: 0 }}>
                    GA4 {acc.ga4Access ? <CheckCircle size={11} color="#10B981" /> : <AlertCircle size={11} color="#94a3b8" />}
                  </span>
                  {/* Delete button */}
                  {confirmDeleteId !== acc.id && (
                    <button
                      onClick={() => setConfirmDeleteId(acc.id)}
                      disabled={removing === acc.id}
                      style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 9px", borderRadius: "6px", fontSize: "11px", fontWeight: 500, background: "rgba(255,255,255,0.04)", color: "var(--color-text-secondary)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", flexShrink: 0, opacity: removing === acc.id ? 0.4 : 1 }}
                      onMouseOver={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.color = "#f87171"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.25)"; }}
                      onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "var(--color-text-secondary)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                    >
                      <X size={11} /> {t("remove")}
                    </button>
                  )}
                </div>

                {/* Inline delete confirmation */}
                {confirmDeleteId === acc.id && (
                  <div style={{ padding: "0 8px 10px 50px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px", color: "#f87171", flex: 1 }}>
                      {t("setRemoveAccountQ1")} <strong>{acc.email}</strong>{t("setRemoveAccountQ2")}
                    </span>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: "rgba(255,255,255,0.06)", color: "var(--color-text-secondary)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
                      onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                      onMouseOut={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                    >
                      {t("cancel")}
                    </button>
                    <button
                      onClick={() => { setConfirmDeleteId(null); onRemove(acc.id); }}
                      disabled={removing === acc.id}
                      style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.35)", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, opacity: removing === acc.id ? 0.5 : 1 }}
                      onMouseOver={e => e.currentTarget.style.background = "rgba(239,68,68,0.28)"}
                      onMouseOut={e => e.currentTarget.style.background = "rgba(239,68,68,0.15)"}
                    >
                      <X size={11} /> {t("setConfirmRemove")}
                    </button>
                  </div>
                )}

                {/* GSC re-auth warning */}
                {!acc.gscAccess && confirmDeleteId !== acc.id && (
                  <div style={{ padding: "0 8px 10px 50px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "11px", color: "#f87171", flex: 1 }}>
                      {t("setNoGscAccess")}
                    </span>
                    <button
                      onClick={() => onReauth(acc.email)}
                      style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
                      onMouseOver={e => e.currentTarget.style.background = "rgba(239,68,68,0.22)"}
                      onMouseOut={e => e.currentTarget.style.background = "rgba(239,68,68,0.12)"}
                    >
                      <GoogleIcon size={11} /> {t("setReauthorize")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Section: My Teams ────────────────────────────────────────────────────────
function TeamsSection({ user }: { user: any }) {
  const { t } = useLanguage();
  const teamName = user?.name ? `${user.name.split(" ")[0]}'s Team` : "My Team";
  return (
    <SectionCard>
      <SectionTitle icon={<Users size={17} />} title={t("myTeams")} />
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {[t("teamColTeam"), t("teamColShares"), t("teamColBilling")].map(h => (
              <th key={h} style={{ textAlign: "left", fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 500, paddingBottom: "14px", borderBottom: "1px solid var(--color-border)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: "16px 0 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <UserAvatar email={user?.email ?? "a"} picture={user?.image} size={28} />
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)" }}>{teamName}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                    <Crown size={11} color="#F59E0B" />
                    <span style={{ fontSize: "11px", color: "#F59E0B", fontWeight: 600 }}>{t("owner")}</span>
                  </div>
                </div>
              </div>
            </td>
            <td style={{ padding: "16px 0 0" }}>
              <button style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-text-primary)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}>
                <CheckCircle size={14} color="#10B981" /> {t("yes")} <ChevronDown size={13} color="var(--color-text-secondary)" />
              </button>
            </td>
            <td style={{ padding: "16px 0 0" }}>
              <button style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "13px", color: "var(--color-accent-blue)", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>
                {t("view")} <span style={{ fontSize: "11px" }}>↗</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </SectionCard>
  );
}

// ─── Section: API & MCP Keys ──────────────────────────────────────────────────
function ApiSection() {
  const { t } = useLanguage();
  const [keyName, setKeyName] = useState("");
  const [keys, setKeys] = useState<{ id: string; name: string; key: string; created: string }[]>([]);
  const [os, setOs] = useState<"mac" | "win">("mac");
  const [copied, setCopied] = useState(false);

  const activeKey = keys[0]?.key ?? "REPLACE_WITH_YOUR_KEY";
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const command = os === "mac"
    ? `curl -sSL ${appUrl}/install-mcp.sh | bash -s -- ${activeKey}`
    : `powershell -c "irm ${appUrl}/install-mcp.ps1 | iex" -- ${activeKey}`;

  const createKey = () => {
    if (!keyName.trim()) return;
    const newKey = { id: Date.now().toString(), name: keyName.trim(), key: `sk-${Math.random().toString(36).slice(2,18)}`, created: new Date().toLocaleDateString() };
    setKeys(k => [...k, newKey]);
    setKeyName("");
  };

  const copyCmd = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Beta banner */}
      <div style={{ padding: "12px 16px", borderRadius: "8px", border: "1px solid rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.06)", fontSize: "13px", color: "#FCD34D" }}>
        <strong>{t("mcpBeta")}</strong> {t("mcpBetaText")}
      </div>

      <SectionCard>
        <SectionTitle
          icon={<Zap size={17} />}
          title={t("mcpKeys")}
          sub={t("mcpKeysDesc")}
        />

        {/* Create key input */}
        <div style={{ display: "flex", gap: "0", marginBottom: "24px", border: "1px solid var(--color-border)", borderRadius: "8px", overflow: "hidden" }}>
          <input
            value={keyName} onChange={e => setKeyName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createKey()}
            placeholder={t("mcpKeyName")}
            style={{ flex: 1, padding: "10px 14px", background: "transparent", border: "none", color: "var(--color-text-primary)", fontSize: "13px", outline: "none" }}
          />
          <button onClick={createKey} style={{ padding: "10px 18px", background: "transparent", borderLeft: "1px solid var(--color-border)", color: "var(--color-accent-blue)", fontSize: "13px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
            onMouseOver={e => e.currentTarget.style.background = "rgba(59,130,246,0.08)"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>
            {t("createKey")}
          </button>
        </div>

        {/* Existing keys */}
        {keys.length > 0 && (
          <div style={{ marginBottom: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {keys.map(k => (
              <div key={k.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
                <Key size={14} color="var(--color-text-secondary)" />
                <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>{k.name}</span>
                <code style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontFamily: "monospace" }}>{k.key}</code>
                <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>{k.created}</span>
                <button onClick={() => setKeys(prev => prev.filter(x => x.id !== k.id))} style={{ color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}
                  onMouseOver={e => e.currentTarget.style.color = "#f87171"} onMouseOut={e => e.currentTarget.style.color = "var(--color-text-secondary)"}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* MCP setup guide */}
        <div style={{ border: "1px solid var(--color-border)", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("mcpSetupTitle")}</h3>

          {/* Step 1 */}
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "6px" }}>{t("mcpStep1Title")}</div>
            <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
              {t("mcpStep1Desc")}{" "}
              <a href="https://nodejs.org" target="_blank" rel="noreferrer" style={{ color: "var(--color-accent-blue)" }}>nodejs.org</a>.
            </p>
          </div>

          {/* Step 2 */}
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "12px" }}>{t("mcpStep2Title")}</div>
            {/* OS tabs */}
            <div style={{ display: "flex", gap: "2px", background: "rgba(255,255,255,0.06)", borderRadius: "8px", padding: "3px", width: "fit-content", marginBottom: "14px" }}>
              {([["mac", "🍎  macOS / Linux"], ["win", "⊞  Windows"]] as [string, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setOs(id as "mac" | "win")} style={{ padding: "6px 16px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", background: os === id ? "var(--color-card)" : "transparent", color: os === id ? "#fff" : "var(--color-text-secondary)", border: "none", boxShadow: os === id ? "0 1px 4px rgba(0,0,0,0.3)" : "none", transition: "all 0.15s" }}>
                  {label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "8px", lineHeight: 1.6 }}>
              {keys.length === 0
                ? t("mcpNoKeyYet")
                : <>{t("mcpOpenTerminal")} <strong style={{ color: "var(--color-text-primary)" }}>{t("mcpTerminal")}</strong> {t("mcpTerminalApp")} {os === "mac" && <>(press <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "1px 5px", borderRadius: "4px", fontSize: "11px" }}>⌘ Space</kbd> {t("mcpTerminalPress")} <em>{t("mcpTerminal")}</em>)</>}, {t("mcpTerminalPaste")}</>
              }
            </p>
            {/* Command box */}
            <div style={{ display: "flex", alignItems: "center", gap: "0", background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-border)", borderRadius: "8px", overflow: "hidden" }}>
              <code style={{ flex: 1, padding: "12px 16px", fontSize: "12px", fontFamily: "monospace", color: "var(--color-text-secondary)", wordBreak: "break-all" }}>
                {command}
              </code>
              <button onClick={copyCmd} title="Copy" style={{ padding: "12px 14px", background: "transparent", borderLeft: "1px solid var(--color-border)", color: copied ? "#10B981" : "var(--color-text-secondary)", cursor: "pointer", flexShrink: 0 }}>
                {copied ? <CheckCircle size={15} /> : <Copy size={15} />}
              </button>
            </div>
          </div>

          {/* Step 3 */}
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "6px" }}>{t("mcpStep3Title")}</div>
            <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: "8px" }}>
              {t("mcpStep3Desc")} <em style={{ color: "var(--color-text-primary)" }}>{t("mcpStep3Example")}</em>
            </p>
            <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
              {t("mcpTip")}
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Section: Team Members ────────────────────────────────────────────────────
function MembersSection({ user }: { user: any }) {
  const { t } = useLanguage();
  return (
    <SectionCard>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("members")}</h2>
          <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", background: "rgba(255,255,255,0.06)", borderRadius: "20px", padding: "2px 8px" }}>{t("membersCount")}</span>
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 16px", borderRadius: "8px", background: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.25)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          <Plus size={14} /> {t("invite")}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid var(--color-border)" }}>
        <UserAvatar email={user?.email ?? "a"} picture={user?.image} size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>{user?.name ?? t("yourAccount")}</div>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{user?.email}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "20px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <Crown size={12} color="#F59E0B" />
          <span style={{ fontSize: "12px", color: "#F59E0B", fontWeight: 600 }}>{t("owner")}</span>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Section: Preferences ─────────────────────────────────────────────────────
function PreferencesSection({ user }: { user: any }) {
  const { t, language, setLanguage } = useLanguage();
  const teamName = user?.name ? `${user.name.split(" ")[0]}'s Team` : "My Team";
  const [shareWithTeam, setShareWithTeam] = useState(true);
  const [useAI, setUseAI] = useState(true);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Sharing */}
      <SectionCard>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("sharingTitle")}</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>{teamName}</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{t("sharingDesc")}</div>
          </div>
          <button onClick={() => setShareWithTeam(s => !s)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-text-primary)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}>
            {shareWithTeam ? <CheckCircle size={14} color="#10B981" /> : <X size={14} color="#6b7280" />}
            {shareWithTeam ? t("yes") : t("no")}
            <ChevronDown size={13} color="var(--color-text-secondary)" />
          </button>
        </div>
      </SectionCard>

      {/* Language */}
      <SectionCard>
        <SectionTitle title={t("language")} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>{t("language")}</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>English / Русский / Українська</div>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {(["en", "ru", "uk"] as const).map(lang => (
              <button key={lang} onClick={() => setLanguage(lang)} style={{ padding: "6px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: language === lang ? "rgba(139,92,246,0.15)" : "transparent", color: language === lang ? "#8B5CF6" : "var(--color-text-secondary)", border: `1px solid ${language === lang ? "rgba(139,92,246,0.3)" : "var(--color-border)"}`, transition: "all 0.15s" }}>
                {lang === "en" ? "🇬🇧 EN" : lang === "ru" ? "🇷🇺 RU" : "🇺🇦 UK"}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Team Preferences */}
      <SectionCard>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("teamPreferences")}</h2>
          <button style={{ fontSize: "13px", color: "var(--color-accent-blue)", background: "none", border: "none", cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: "4px" }}>
            <Edit2 size={13} /> {t("edit")}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>{t("useAI")}</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{t("useAIDesc")}</div>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {[t("yes"), t("no")].map((opt, idx) => {
              const isActive = idx === 0 ? useAI : !useAI;
              return (
                <button key={opt} onClick={() => setUseAI(idx === 0)} style={{ padding: "6px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: isActive ? "rgba(59,130,246,0.15)" : "transparent", color: isActive ? "#3B82F6" : "var(--color-text-secondary)", border: `1px solid ${isActive ? "rgba(59,130,246,0.3)" : "var(--color-border)"}`, transition: "all 0.15s" }}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>
      <AIConfigSection />
      <HealthApiKeysSection />
    </div>
  );
}

// ─── AI Configuration Section Component ───────────────────────────────────────
const AI_PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic",
    model: "Claude Haiku",
    placeholder: "sk-ant-api03-...",
    hint: "Fastest and most affordable Claude model",
    docsUrl: "https://console.anthropic.com/settings/keys",
    docsLabel: "console.anthropic.com",
    color: "#CF6B4A",
    logo: "A",
  },
  {
    id: "openai",
    name: "OpenAI",
    model: "GPT-4o Mini",
    placeholder: "sk-...",
    hint: "Fast and cost-effective GPT model",
    docsUrl: "https://platform.openai.com/api-keys",
    docsLabel: "platform.openai.com",
    color: "#10A37F",
    logo: "O",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    model: "Gemini 1.5 Flash",
    placeholder: "AIzaSy...",
    hint: "Google's fast multimodal model",
    docsUrl: "https://aistudio.google.com/app/apikey",
    docsLabel: "aistudio.google.com",
    color: "#4285F4",
    logo: "G",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    model: "Claude 3.5 Haiku",
    placeholder: "sk-or-...",
    hint: "Access 200+ models through one API",
    docsUrl: "https://openrouter.ai/keys",
    docsLabel: "openrouter.ai",
    color: "#7C3AED",
    logo: "R",
  },
  {
    id: "zai",
    name: "Z.AI",
    model: "GLM-4.5-Air",
    placeholder: "z-api-...",
    hint: "Affordable GLM models, Anthropic-compatible API",
    docsUrl: "https://z.ai/manage-apikey/apikey-list",
    docsLabel: "z.ai",
    color: "#0EA5E9",
    logo: "Z",
  },
  {
    id: "kie",
    name: "Kie.ai",
    model: "GPT-5.5 (Codex)",
    placeholder: "kie-...",
    hint: "OpenAI-compatible Responses API, agentic coding/reasoning model",
    docsUrl: "https://kie.ai",
    docsLabel: "kie.ai",
    color: "#F97316",
    logo: "K",
  },
] as const;

function AIProviderCard({ provider }: { provider: typeof AI_PROVIDERS[number] }) {
  const storageKey = `aiKey_${provider.id}`;
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const isConfigured = key.trim().length > 6;

  useEffect(() => {
    setKey(localStorage.getItem(storageKey) || "");
  }, [storageKey]);

  const handleSave = () => {
    localStorage.setItem(storageKey, key.trim());
    // Also update aiProvider/aiApiKey for compatibility with SetupModal
    if (key.trim()) {
      localStorage.setItem("aiProvider", provider.id);
      localStorage.setItem("aiApiKey", key.trim());
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    setKey("");
    localStorage.removeItem(storageKey);
    // If this was the active provider, clear global key too
    if (localStorage.getItem("aiProvider") === provider.id) {
      localStorage.removeItem("aiApiKey");
    }
  };

  return (
    <div style={{
      padding: "16px",
      borderRadius: "10px",
      border: `1px solid ${isConfigured ? `${provider.color}40` : "var(--color-border)"}`,
      background: isConfigured ? `${provider.color}08` : "rgba(255,255,255,0.02)",
      transition: "all 0.2s",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <div style={{
          width: "30px", height: "30px", borderRadius: "8px",
          background: `${provider.color}20`, border: `1px solid ${provider.color}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "13px", fontWeight: 700, color: provider.color, flexShrink: 0,
        }}>
          {provider.logo}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)" }}>{provider.name}</div>
          <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>{provider.model}</div>
        </div>
        {isConfigured ? (
          <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#10B981", fontWeight: 600, flexShrink: 0 }}>
            <CheckCircle size={12} color="#10B981" /> Connected
          </span>
        ) : (
          <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", flexShrink: 0 }}>Not set</span>
        )}
      </div>

      {/* Input row */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            type={visible ? "text" : "password"}
            placeholder={provider.placeholder}
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSave()}
            style={{
              width: "100%", padding: "8px 36px 8px 12px",
              borderRadius: "8px", border: "1px solid var(--color-border)",
              background: "var(--color-card)", color: "var(--color-text-primary)",
              fontSize: "12px", outline: "none", boxSizing: "border-box",
              fontFamily: "monospace",
            }}
          />
          <button
            onClick={() => setVisible(v => !v)}
            style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", padding: 0, display: "flex", alignItems: "center" }}
          >
            {visible ? <Eye size={14} /> : <Eye size={14} style={{ opacity: 0.5 }} />}
          </button>
        </div>
        {isConfigured && (
          <button
            onClick={handleClear}
            style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)", color: "#f87171", fontSize: "12px", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center" }}
            title="Remove key"
          >
            <X size={13} />
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={!key.trim()}
          style={{
            padding: "8px 14px", borderRadius: "8px", border: "none",
            background: saved ? "rgba(16,185,129,0.2)" : key.trim() ? `${provider.color}25` : "rgba(255,255,255,0.06)",
            color: saved ? "#10B981" : key.trim() ? provider.color : "var(--color-text-secondary)",
            fontSize: "12px", fontWeight: 600, cursor: key.trim() ? "pointer" : "not-allowed",
            flexShrink: 0, transition: "all 0.15s", display: "flex", alignItems: "center", gap: "4px",
          }}
        >
          {saved ? <><CheckCircle size={12} /> Saved</> : "Save"}
        </button>
      </div>

      {/* Hint + link */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>{provider.hint}</span>
        <a
          href={provider.docsUrl}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: "11px", color: "var(--color-accent-blue)", display: "flex", alignItems: "center", gap: "3px", textDecoration: "none", flexShrink: 0 }}
        >
          Get key ↗
        </a>
      </div>
    </div>
  );
}

function AIConfigSection() {
  return (
    <SectionCard>
      <SectionTitle
        icon={<Zap size={17} color="#8B5CF6" />}
        title="AI Providers"
        sub="Connect an AI provider to enable intelligent clustering in One Click Setup. The AI analyzes your GSC queries and URLs to create meaningful topic clusters and content groups — much more accurate than the algorithmic fallback."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {AI_PROVIDERS.map(p => <AIProviderCard key={p.id} provider={p} />)}
      </div>
      <div style={{ marginTop: "14px", padding: "11px 14px", borderRadius: "8px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.18)", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
        💡 Keys are stored in your browser only and sent directly to the AI provider when running One Click Setup. They are never stored on the server.
      </div>
    </SectionCard>
  );
}

// ─── Section: Indexing API Keys ───────────────────────────────────────────────
function IndexApiSection() {
  const { t } = useLanguage();

  // NeuralIndexer state
  const [nnToken,      setNnToken]      = useState("");
  const [nnConfigured, setNnConfigured] = useState(false);
  const [nnStatus,     setNnStatus]     = useState<"idle"|"checking"|"ok"|"error">("idle");
  const [nnMsg,        setNnMsg]        = useState("");
  const [nnSaving,     setNnSaving]     = useState(false);
  const [nnSaved,      setNnSaved]      = useState(false);
  const [nnBalance,    setNnBalance]    = useState<number|null>(null);

  // XML River state
  const [xrUserId,  setXrUserId]  = useState("");
  const [xrApiKey,  setXrApiKey]  = useState("");
  const [xrStatus,  setXrStatus]  = useState<"idle"|"checking"|"ok"|"error">("idle");
  const [xrMsg,     setXrMsg]     = useState("");
  const [xrSaving,  setXrSaving]  = useState(false);
  const [xrSaved,   setXrSaved]   = useState(false);

  // 2index state
  const [niToken,      setNiToken]      = useState("");
  const [niConfigured, setNiConfigured] = useState(false);
  const [niStatus,     setNiStatus]     = useState<"idle"|"checking"|"ok"|"error">("idle");
  const [niMsg,        setNiMsg]        = useState("");
  const [niSaving,     setNiSaving]     = useState(false);
  const [niSaved,      setNiSaved]      = useState(false);
  const [niBalance,    setNiBalance]    = useState<number|null>(null);

  // Load existing (masked) state on mount
  useEffect(() => {
    fetch("/api/settings/api-keys")
      .then(r => r.json())
      .then(d => {
        // NOTE: we do NOT load masked tokens into input fields to avoid overwriting real tokens on save
        if (d.neuralIndexer?.configured)  { setNnConfigured(true); setNnStatus("ok"); setNnBalance(d.neuralIndexer.balance); }
        if (d.xmlRiver?.userId)           setXrUserId(d.xmlRiver.userId);
        // xrApiKey is masked — don't put it in the input; just track configured state
        if (d.xmlRiver?.configured)       setXrStatus("ok");
        if (d.twoIndex?.configured)       { setNiConfigured(true); setNiStatus("ok"); }
      })
      .catch(() => {});
  }, []);

  // NeuralIndexer actions
  const validateNn = async () => {
    setNnStatus("checking"); setNnMsg(""); setNnBalance(null);
    const res = await fetch("/api/settings/api-keys/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "neural", token: nnToken }),
    }).then(r => r.json()).catch(() => ({ ok: false, error: "Network error" }));
    setNnStatus(res.ok ? "ok" : "error");
    setNnMsg(res.ok ? t("apiKeyTokenValid") : res.error ?? t("apiKeyError"));
    if (res.balance != null) setNnBalance(res.balance);
  };

  const saveNn = async () => {
    if (!nnToken) return; // don't save empty/masked value
    setNnSaving(true);
    await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ neuralIndexerToken: nnToken }),
    });
    setNnSaving(false); setNnSaved(true); setNnConfigured(true);
    setTimeout(() => setNnSaved(false), 2000);
  };

  const deleteNn = async () => {
    setNnSaving(true);
    await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ neuralIndexerToken: null }),
    });
    setNnToken(""); setNnConfigured(false); setNnStatus("idle"); setNnMsg(""); setNnBalance(null);
    setNnSaving(false);
  };

  const validateXr = async () => {
    setXrStatus("checking"); setXrMsg("");
    const res = await fetch("/api/settings/api-keys/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "xmlriver", userId: xrUserId, apiKey: xrApiKey }),
    }).then(r => r.json()).catch(() => ({ ok: false, error: "Network error" }));
    setXrStatus(res.ok ? "ok" : "error");
    setXrMsg(res.ok ? t("apiKeyTokenValid") : res.error ?? t("apiKeyError"));
  };

  const saveXr = async () => {
    setXrSaving(true);
    await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ xmlRiverUserId: xrUserId, xmlRiverApiKey: xrApiKey }),
    });
    setXrSaving(false); setXrSaved(true);
    setTimeout(() => setXrSaved(false), 2000);
  };

  const validateNi = async () => {
    setNiStatus("checking"); setNiMsg(""); setNiBalance(null);
    const res = await fetch("/api/settings/api-keys/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "2index", token: niToken }),
    }).then(r => r.json()).catch(() => ({ ok: false, error: "Network error" }));
    setNiStatus(res.ok ? "ok" : "error");
    setNiMsg(res.ok ? t("apiKeyTokenValid") : res.error ?? t("apiKeyError"));
    if (res.balance != null) setNiBalance(res.balance);
  };

  const saveNi = async () => {
    if (!niToken) return;
    setNiSaving(true);
    await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ twoIndexToken: niToken }),
    });
    setNiSaving(false); setNiSaved(true); setNiConfigured(true);
    setTimeout(() => setNiSaved(false), 2000);
  };

  const deleteNi = async () => {
    setNiSaving(true);
    await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ twoIndexToken: null }),
    });
    setNiToken(""); setNiConfigured(false); setNiStatus("idle"); setNiMsg(""); setNiBalance(null);
    setNiSaving(false);
  };

  const statusColor = (s: string) => s === "ok" ? "#10B981" : s === "error" ? "#EF4444" : s === "checking" ? "#F59E0B" : "var(--color-text-secondary)";
  const statusDot   = (s: string) => s === "ok" ? "●" : s === "error" ? "●" : s === "checking" ? "◌" : "○";
  const statusLabel = (s: string) => s === "ok" ? t("apiKeyConfigured") : s === "error" ? t("apiKeyError") : s === "checking" ? t("apiKeyChecking") : t("apiKeyNotConfigured");

  const inputStyle: React.CSSProperties = {
    flex: 1, padding: "9px 12px", background: "transparent",
    border: "none", color: "var(--color-text-primary)", fontSize: "13px", outline: "none",
    fontFamily: "monospace",
  };
  const rowStyle: React.CSSProperties = {
    display: "flex", gap: "0", border: "1px solid var(--color-border)",
    borderRadius: "8px", overflow: "hidden", marginBottom: "10px",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "5px", display: "block",
  };
  /* Apple-style pill buttons — primary = solid Action Blue, secondary = ghost */
  const btnStyle = (primary?: boolean): React.CSSProperties => ({
    padding: "8px 18px",
    borderRadius: "9999px",
    border: primary ? "none" : "1px solid var(--color-border)",
    background: primary ? "var(--color-accent-blue)" : "transparent",
    color: primary ? "#ffffff" : "var(--color-text-primary)",
    fontSize: "13px", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
    transition: "opacity 0.15s, background 0.15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* ── NeuralIndexer (featured / primary) ── */}
      <SectionCard>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: 32, height: 32, borderRadius: "8px", background: "linear-gradient(135deg,rgba(139,92,246,0.25),rgba(59,130,246,0.25))", border: "1px solid rgba(139,92,246,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 800, color: "#a78bfa" }}>NI</div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>NeuralIndexer</span>
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "6px", background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.3)" }}>{t("apiKeyPrimary")}</span>
                </div>
                <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                  {t("nnBotDesc")}
                </p>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: statusColor(nnStatus) }}>
              {statusDot(nnStatus)} {statusLabel(nnStatus)}
            </span>
            {nnBalance != null && (
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#4ADE80" }}>${nnBalance.toFixed(4)}</span>
            )}
          </div>
        </div>

        {/* Info strip */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
          {[
            { label: "Slow (Google+Bing)", price: "$0.0122/URL" },
            { label: "Fast (Google API)", price: "$0.50/URL" },
            { label: "Yandex", price: "$0.0122/URL" },
            { label: "Index check", price: "$0.0024/URL" },
          ].map(({ label, price }) => (
            <div key={label} style={{ padding: "4px 10px", borderRadius: "7px", background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.18)", fontSize: "11px", color: "var(--color-text-secondary)" }}>
              {label} <span style={{ color: "#a78bfa", fontWeight: 600 }}>{price}</span>
            </div>
          ))}
        </div>

        <label style={labelStyle}>API Token</label>
        {nnConfigured && !nnToken && (
          <p style={{ fontSize: "12px", color: "#4ADE80", marginBottom: "8px" }}>✓ {t("apiKeyConfigured")} · {t("apiKeyEnterToReplace")}</p>
        )}
        <div style={rowStyle}>
          <input value={nnToken} onChange={e => setNnToken(e.target.value)}
            placeholder={nnConfigured ? t("apiKeyEnterToReplace") : "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
            type="password" style={inputStyle} />
        </div>

        {nnMsg && <p style={{ fontSize: "12px", color: statusColor(nnStatus), marginBottom: "10px" }}>{nnMsg}</p>}

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={validateNn} disabled={!nnToken || nnStatus === "checking"}
            style={{ ...btnStyle(), opacity: !nnToken ? 0.4 : 1 }}>
            {nnStatus === "checking" ? t("apiKeyChecking") : t("apiKeyVerify")}
          </button>
          <button onClick={saveNn} disabled={!nnToken || nnSaving}
            style={{ ...btnStyle(true), opacity: !nnToken ? 0.4 : 1 }}>
            {nnSaved ? t("apiKeySaved") : nnSaving ? t("apiKeySaving") : t("apiKeySave")}
          </button>
          {nnConfigured && (
            <button onClick={deleteNn} disabled={nnSaving}
              style={{ padding: "9px 12px", background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#EF4444", fontSize: "12px", cursor: "pointer" }}>
              {t("apiKeyDelete")}
            </button>
          )}
          <a href="https://t.me/InderixingBot" target="_blank" rel="noopener noreferrer"
            style={{ marginLeft: "auto", fontSize: "12px", color: "#a78bfa", textDecoration: "none", display: "flex", alignItems: "center", gap: "4px" }}
            onMouseOver={e => e.currentTarget.style.textDecoration = "underline"}
            onMouseOut={e => e.currentTarget.style.textDecoration = "none"}>
            {t("nnGetToken")}
          </a>
        </div>
      </SectionCard>

      {/* ── XML River ── */}
      <SectionCard>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: 28, height: 28, borderRadius: "6px", background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800, color: "#3B82F6" }}>XR</div>
              <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>XML River API</span>
            </div>
            <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "6px", maxWidth: "480px", lineHeight: 1.5 }}>
              {t("xrDesc")}{" "}
              <a href="https://xmlriver.com" target="_blank" rel="noopener noreferrer" style={{ color: "#3B82F6" }}>xmlriver.com</a>
            </p>
          </div>
          <span style={{ fontSize: "12px", fontWeight: 600, color: statusColor(xrStatus) }}>
            {statusDot(xrStatus)} {statusLabel(xrStatus)}
          </span>
        </div>

        <label style={labelStyle}>User ID</label>
        <div style={rowStyle}>
          <input value={xrUserId} onChange={e => setXrUserId(e.target.value)} placeholder="12345" style={inputStyle} />
        </div>

        <label style={labelStyle}>API Key</label>
        <div style={rowStyle}>
          <input value={xrApiKey} onChange={e => setXrApiKey(e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" type="password" style={inputStyle} />
        </div>

        {xrMsg && <p style={{ fontSize: "12px", color: statusColor(xrStatus), marginBottom: "10px" }}>{xrMsg}</p>}

        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={validateXr} disabled={!xrUserId || !xrApiKey || xrStatus === "checking"} style={{ ...btnStyle(), opacity: (!xrUserId || !xrApiKey) ? 0.4 : 1 }}>
            {xrStatus === "checking" ? t("apiKeyChecking") : t("apiKeyVerify")}
          </button>
          <button onClick={saveXr} disabled={!xrUserId || !xrApiKey || xrSaving} style={{ ...btnStyle(true), opacity: (!xrUserId || !xrApiKey) ? 0.4 : 1 }}>
            {xrSaved ? t("apiKeySaved") : xrSaving ? t("apiKeySaving") : t("apiKeySave")}
          </button>
          {(xrUserId || xrApiKey) && (
            <button onClick={() => { setXrUserId(""); setXrApiKey(""); setXrStatus("idle"); setXrMsg(""); saveXr(); }}
              style={{ padding: "9px 12px", background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#EF4444", fontSize: "12px", cursor: "pointer" }}>
              {t("apiKeyDelete")}
            </button>
          )}
        </div>
      </SectionCard>

      {/* ── 2index.ninja ── */}
      <SectionCard>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: 28, height: 28, borderRadius: "6px", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800, color: "#10B981" }}>2I</div>
              <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>2index.ninja API</span>
            </div>
            <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "6px", maxWidth: "480px", lineHeight: 1.5 }}>
              {t("niDesc")}{" "}
              <a href="https://2index.ninja" target="_blank" rel="noopener noreferrer" style={{ color: "#10B981" }}>2index.ninja</a>
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: statusColor(niStatus) }}>
              {statusDot(niStatus)} {statusLabel(niStatus)}
            </span>
            {niBalance != null && (
              <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>{t("balanceLabel")}: {niBalance}</span>
            )}
          </div>
        </div>

        <label style={labelStyle}>Bearer token</label>
        {niConfigured && !niToken && (
          <p style={{ fontSize: "12px", color: "#4ADE80", marginBottom: "8px" }}>✓ {t("apiKeyConfigured")} · {t("apiKeyEnterToReplace")}</p>
        )}
        <div style={rowStyle}>
          <input value={niToken} onChange={e => setNiToken(e.target.value)} placeholder={niConfigured ? t("apiKeyEnterToReplace") : "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"} type="password" style={inputStyle} />
        </div>

        {niMsg && <p style={{ fontSize: "12px", color: statusColor(niStatus), marginBottom: "10px" }}>{niMsg}</p>}

        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={validateNi} disabled={!niToken || niStatus === "checking"} style={{ ...btnStyle(), opacity: !niToken ? 0.4 : 1 }}>
            {niStatus === "checking" ? t("apiKeyChecking") : t("apiKeyVerify")}
          </button>
          <button onClick={saveNi} disabled={!niToken || niSaving} style={{ ...btnStyle(true), opacity: !niToken ? 0.4 : 1 }}>
            {niSaved ? t("apiKeySaved") : niSaving ? t("apiKeySaving") : t("apiKeySave")}
          </button>
          {niConfigured && (
            <button onClick={deleteNi} disabled={niSaving}
              style={{ padding: "9px 12px", background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#EF4444", fontSize: "12px", cursor: "pointer" }}>
              {t("apiKeyDelete")}
            </button>
          )}
        </div>
      </SectionCard>

      {/* ── Ahrefs (coming soon) ── */}
      <SectionCard>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: 28, height: 28, borderRadius: "6px", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800, color: "#8B5CF6" }}>AH</div>
            <div>
              <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-secondary)" }}>Ahrefs API</span>
              <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{t("ahrefsDesc")}</p>
            </div>
          </div>
          <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "6px", background: "rgba(139,92,246,0.12)", color: "#8B5CF6", border: "1px solid rgba(139,92,246,0.25)" }}>{t("comingSoon")}</span>
        </div>
      </SectionCard>

      {/* ── Microsoft Clarity (note: token is per-site, configured in site UX tab) ── */}
      <SectionCard>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: 28, height: 28, borderRadius: "6px", background: "rgba(0,102,204,0.12)", border: "1px solid rgba(0,102,204,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 800, color: "var(--color-accent-blue)" }}>MC</div>
            <div>
              <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>Microsoft Clarity</span>
              <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{t("claritySettingsNote")}</p>
            </div>
          </div>
          <a href="#" onClick={e => { e.preventDefault(); }} style={{
            fontSize: "11px", fontWeight: 600, padding: "4px 10px", borderRadius: "9999px",
            background: "rgba(0,102,204,0.10)", color: "var(--color-accent-blue)",
            border: "1px solid rgba(0,102,204,0.25)", textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: "4px",
          }}>
            {t("claritySettingsWhere")}
          </a>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Section: Health API Keys ─────────────────────────────────────────────────
const HEALTH_PROVIDERS = [
  {
    id: "safeBrowsing",
    name: "Google Safe Browsing",
    placeholder: "AIzaSy...",
    hint: "Detects malware, phishing, and harmful content on your site.",
    docsUrl: "https://developers.google.com/safe-browsing/v4/get-started",
    color: "#4285F4",
    logo: "SB",
    storageKey: "healthKey_safeBrowsing",
  },
  {
    id: "google",
    name: "PageSpeed Insights (Core Web Vitals)",
    placeholder: "AIzaSy...",
    hint: "Fetches LCP, CLS, TTFB and overall Performance score via PageSpeed Insights API.",
    docsUrl: "https://developers.google.com/speed/docs/insights/v5/get-started",
    color: "#34A853",
    logo: "PS",
    storageKey: "healthKey_google",
  },
  {
    id: "virusTotal",
    name: "VirusTotal",
    placeholder: "abc123...",
    hint: "Scans domain against 70+ antivirus engines and URL scanners.",
    docsUrl: "https://www.virustotal.com/gui/my-apikey",
    color: "#1565C0",
    logo: "VT",
    storageKey: "healthKey_virusTotal",
  },
] as const;

function HealthKeyCard({ provider }: { provider: typeof HEALTH_PROVIDERS[number] }) {
  const [key, setKey]       = useState("");
  const [visible, setVisible] = useState(false);
  const [saved, setSaved]   = useState(false);
  const isConfigured = key.trim().length > 6;

  useEffect(() => { setKey(localStorage.getItem(provider.storageKey) || ""); }, [provider.storageKey]);

  const handleSave = () => {
    localStorage.setItem(provider.storageKey, key.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const handleClear = () => { setKey(""); localStorage.removeItem(provider.storageKey); };

  return (
    <div style={{ padding: "16px", borderRadius: "10px", border: `1px solid ${isConfigured ? `${provider.color}40` : "var(--color-border)"}`, background: isConfigured ? `${provider.color}08` : "rgba(255,255,255,0.02)", transition: "all 0.2s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: `${provider.color}20`, border: `1px solid ${provider.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, color: provider.color, flexShrink: 0 }}>
          {provider.logo}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text-primary)" }}>{provider.name}</div>
        </div>
        {isConfigured ? (
          <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#10B981", fontWeight: 600, flexShrink: 0 }}>
            <CheckCircle size={12} color="#10B981" /> Connected
          </span>
        ) : (
          <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", flexShrink: 0 }}>Not set</span>
        )}
      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            type={visible ? "text" : "password"}
            placeholder={provider.placeholder}
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSave()}
            style={{ width: "100%", padding: "8px 36px 8px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-text-primary)", fontSize: "12px", outline: "none", boxSizing: "border-box", fontFamily: "monospace" }}
          />
          <button onClick={() => setVisible(v => !v)} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", padding: 0, display: "flex", alignItems: "center" }}>
            <Eye size={14} style={{ opacity: visible ? 1 : 0.5 }} />
          </button>
        </div>
        {isConfigured && (
          <button onClick={handleClear} style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)", color: "#f87171", fontSize: "12px", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center" }} title="Remove key">
            <X size={13} />
          </button>
        )}
        <button onClick={handleSave} disabled={!key.trim()} style={{ padding: "8px 14px", borderRadius: "8px", border: "none", background: saved ? "rgba(16,185,129,0.2)" : key.trim() ? `${provider.color}25` : "rgba(255,255,255,0.06)", color: saved ? "#10B981" : key.trim() ? provider.color : "var(--color-text-secondary)", fontSize: "12px", fontWeight: 600, cursor: key.trim() ? "pointer" : "not-allowed", flexShrink: 0, transition: "all 0.15s", display: "flex", alignItems: "center", gap: "4px" }}>
          {saved ? <><CheckCircle size={12} /> Saved</> : "Save"}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>{provider.hint}</span>
        <a href={provider.docsUrl} target="_blank" rel="noreferrer" style={{ fontSize: "11px", color: "var(--color-accent-blue)", display: "flex", alignItems: "center", gap: "3px", textDecoration: "none", flexShrink: 0 }}>Get key ↗</a>
      </div>
    </div>
  );
}

function HealthApiKeysSection() {
  return (
    <SectionCard>
      <SectionTitle
        icon={<CheckCircle size={17} color="#10B981" />}
        title="Health Check API Keys"
        sub="Used in the Health tab on each site page. SSL is always checked for free. Add keys below to enable Safe Browsing, Core Web Vitals, and VirusTotal checks."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {HEALTH_PROVIDERS.map(p => <HealthKeyCard key={p.id} provider={p} />)}
      </div>
      <div style={{ marginTop: "14px", padding: "11px 14px", borderRadius: "8px", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
        💡 Keys are stored in your browser only and sent to the respective APIs when you run a health check. They are never stored on the server.
      </div>
    </SectionCard>
  );
}

// ─── Section: Super Sites ─────────────────────────────────────────────────────
interface GscSite { id: string; url: string; siteId: string; }

function SuperSitesSection() {
  const { t } = useLanguage();
  const [superSites, setSuperSites] = useState<string[]>([]);
  const [allSites, setAllSites] = useState<GscSite[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    fetch("/api/gsc/sites")
      .then(r => r.json())
      .then(data => setAllSites(data.sites || []))
      .catch(() => {})
      .finally(() => setLoadingSites(false));
  }, []);

  const cleanDomain = (url: string) =>
    url.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^sc-domain:/, "");

  const suggestions = allSites.filter(s =>
    !superSites.includes(s.url) &&
    cleanDomain(s.url).toLowerCase().includes(query.toLowerCase())
  );

  const showDropdown = focused && query.length > 0;

  const addFromGsc = (url: string) => {
    if (!superSites.includes(url)) setSuperSites(prev => [...prev, url]);
    setQuery("");
  };

  const addManual = () => {
    const trimmed = query.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!trimmed || superSites.includes(trimmed)) return;
    setSuperSites(prev => [...prev, trimmed]);
    setQuery("");
  };

  const remove = (url: string) => setSuperSites(prev => prev.filter(s => s !== url));

  const searchPlaceholder = loadingSites
    ? t("loadingGscProps")
    : allSites.length > 0
      ? t("searchGscProps").replace("{n}", String(allSites.length))
      : t("enterDomainToAdd");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <SectionCard>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <Star size={17} color="#F59E0B" />
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)" }}>{t("superSites")}</h2>
          {superSites.length > 0 && (
            <span style={{ fontSize: "11px", color: "#F59E0B", background: "rgba(245,158,11,0.1)", borderRadius: "20px", padding: "2px 8px", fontWeight: 600 }}>
              {superSites.length} {t("upgraded")}
            </span>
          )}
        </div>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: "20px" }}>
          {t("superSitesDesc")}
        </p>

        {/* Combined search + picker */}
        <div style={{ position: "relative", marginBottom: "20px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "0 14px",
            borderRadius: showDropdown ? "10px 10px 0 0" : "10px",
            borderTop: `1px solid ${focused ? "#F59E0B" : "var(--color-border)"}`,
            borderLeft: `1px solid ${focused ? "#F59E0B" : "var(--color-border)"}`,
            borderRight: `1px solid ${focused ? "#F59E0B" : "var(--color-border)"}`,
            borderBottom: showDropdown ? "1px solid var(--color-border)" : `1px solid ${focused ? "#F59E0B" : "var(--color-border)"}`,
            background: "rgba(255,255,255,0.04)",
            transition: "border-color 0.15s",
          }}>
            <span style={{ fontSize: "14px", opacity: 0.5, flexShrink: 0 }}>🔍</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  if (suggestions.length > 0) addFromGsc(suggestions[0].url);
                  else addManual();
                }
              }}
              placeholder={searchPlaceholder}
              disabled={loadingSites}
              style={{
                flex: 1, padding: "10px 0",
                background: "transparent", border: "none",
                color: "var(--color-text-primary)", fontSize: "13px",
                fontFamily: "inherit", outline: "none",
              }}
            />
            {query && (
              <button
                onMouseDown={e => { e.preventDefault(); addManual(); }}
                style={{
                  flexShrink: 0, padding: "4px 10px", borderRadius: "6px",
                  background: "rgba(245,158,11,0.1)", color: "#F59E0B",
                  border: "1px solid rgba(245,158,11,0.25)",
                  fontSize: "11px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >{t("addManual")}</button>
            )}
          </div>

          {/* Dropdown suggestions */}
          {showDropdown && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0,
              background: "var(--color-card)",
              border: "1px solid #F59E0B",
              borderTop: "none",
              borderRadius: "0 0 10px 10px",
              zIndex: 50,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              maxHeight: "240px", overflowY: "auto",
            }}>
              {suggestions.length > 0 ? suggestions.map(site => (
                <button
                  key={site.id}
                  onMouseDown={e => { e.preventDefault(); addFromGsc(site.url); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "10px",
                    padding: "9px 14px", background: "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    transition: "background 0.1s",
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = "rgba(245,158,11,0.07)")}
                  onMouseOut={e => (e.currentTarget.style.background = "transparent")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/favicon?domain=${cleanDomain(site.url)}`} width={14} height={14} alt="" style={{ borderRadius: "3px", flexShrink: 0 }} onError={e=>((e.target as HTMLImageElement).style.display="none")} />
                  <span style={{ fontSize: "13px", color: "var(--color-text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cleanDomain(site.url)}
                  </span>
                  <span style={{ fontSize: "11px", color: "#F59E0B", flexShrink: 0 }}>{t("upgradeLabel")}</span>
                </button>
              )) : (
                <div style={{ padding: "11px 14px", fontSize: "12px", color: "var(--color-text-secondary)" }}>
                  {t("noGscMatch")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Upgraded list */}
        {superSites.length === 0 ? (
          <div style={{ padding: "24px", borderRadius: "10px", border: "1px dashed var(--color-border)", textAlign: "center" }}>
            <div style={{ fontSize: "22px", marginBottom: "8px" }}>⭐</div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
              {t("noSuperSitesYet")}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {superSites.map(site => (
              <div key={site} style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "10px 12px",
                background: "rgba(245,158,11,0.05)",
                border: "1px solid rgba(245,158,11,0.15)",
                borderRadius: "8px",
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/favicon?domain=${cleanDomain(site)}`} width={16} height={16} alt="" style={{ borderRadius: "3px" }} onError={e=>((e.target as HTMLImageElement).style.display="none")} />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)", flex: 1 }}>{cleanDomain(site)}</span>
                <Star size={12} color="#F59E0B" />
                <button
                  onClick={() => remove(site)}
                  style={{
                    padding: "4px 10px", borderRadius: "6px",
                    background: "rgba(239,68,68,0.08)", color: "#f87171",
                    border: "1px solid rgba(239,68,68,0.2)",
                    fontSize: "11px", fontWeight: 600, cursor: "pointer",
                  }}
                >{t("remove")}</button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;

  const [nav, setNav] = useState<NavItem>("accounts");
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [editingTeam, setEditingTeam] = useState(false);

  const defaultTeamName = user?.name ? `${user.name.split(" ")[0]}'s Team` : "My Team";

  // Deep-link support (e.g. /settings?tab=seo-tools from the SEO Tools pages) — read via
  // window.location in an effect rather than useSearchParams(), so this stays a plain client
  // render with no SSR/hydration mismatch and no Suspense-boundary requirement.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    const valid: NavItem[] = ["accounts", "teams", "api", "indexing-api", "seo-tools", "members", "preferences", "supersites"];
    if (tab && (valid as string[]).includes(tab)) setNav(tab as NavItem);
  }, []);

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try { const res = await fetch("/api/gsc/accounts"); const data = await res.json(); setAccounts(data.accounts || []); } catch {}
    setLoadingAccounts(false);
  };
  useEffect(() => { fetchAccounts(); }, []);

  const handleAdd = () => signIn("google", { callbackUrl: "/settings" });
  const handleReauth = (email: string) =>
    signIn("google", { callbackUrl: "/settings", login_hint: email });
  const handleRemove = async (id: string) => {
    if (!confirm(t("disconnectConfirm"))) return;
    setRemoving(id);
    await fetch("/api/gsc/accounts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: id }) });
    await fetchAccounts();
    setRemoving(null);
  };

  const NavBtn = ({ id, icon, label, badge }: { id: NavItem; icon: React.ReactNode; label: string; badge?: string }) => (
    <button
      onClick={() => setNav(id)}
      className={nav === id ? "nav-btn active" : "nav-btn"}
      style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 12px", borderRadius: "8px", width: "100%",
        background: "transparent", color: nav === id ? "#fff" : "var(--color-text-secondary)",
        fontSize: "13px", fontWeight: 400, border: "none", cursor: "pointer", textAlign: "left",
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {badge && <span style={{ fontSize: "10px", color: "var(--color-text-secondary)", background: "rgba(255,255,255,0.07)", borderRadius: "10px", padding: "1px 7px" }}>{badge}</span>}
    </button>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Page header */}
      <div style={{ padding: "20px 32px 0" }}>
        <button onClick={() => router.push("/")} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--color-accent-blue)", background: "none", border: "none", cursor: "pointer", marginBottom: "8px" }}>
          <ArrowLeft size={14} /> {t("back")}
        </button>
        <h1 style={{ fontSize: "26px", fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}>{t("settingsTitle")}</h1>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, gap: 0, padding: "24px 32px", alignItems: "flex-start" }}>

        {/* Left sidebar */}
        <div style={{ width: "200px", flexShrink: 0, paddingRight: "24px" }}>
          {/* Account */}
          <div style={{ marginBottom: "28px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "2px" }}>{t("sidebarAccount")}</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "10px" }}>{user?.email}</div>
            <NavBtn id="accounts" icon={<GoogleIcon size={14} />} label={t("navMyGoogleAccounts")} />
            <NavBtn id="teams" icon={<Users size={14} />} label={t("myTeams")} />
            <NavBtn id="api" icon={<Key size={14} />} label={t("navApiMcpKeys")} />
            <NavBtn id="indexing-api" icon={<Globe size={14} />} label={t("navIndexingApi")} />
            <NavBtn id="seo-tools" icon={<Sparkles size={14} />} label={t("navSeoTools")} />
          </div>

          {/* Team */}
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "2px" }}>{t("sidebarTeam")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
              {editingTeam ? (
                <input
                  autoFocus value={teamName || defaultTeamName}
                  onChange={e => setTeamName(e.target.value)}
                  onBlur={() => setEditingTeam(false)}
                  onKeyDown={e => e.key === "Enter" && setEditingTeam(false)}
                  style={{ fontSize: "12px", color: "var(--color-text-primary)", background: "transparent", border: "none", borderBottom: "1px solid var(--color-accent-blue)", outline: "none", width: "120px", padding: "1px 0" }}
                />
              ) : (
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{teamName || defaultTeamName}</span>
              )}
              <Edit2 size={11} style={{ color: "var(--color-text-secondary)", cursor: "pointer", flexShrink: 0 }} onClick={() => setEditingTeam(true)} />
            </div>
            <NavBtn id="members" icon={<Users size={14} />} label={t("navTeamMembers")} badge="1" />
            <NavBtn id="preferences" icon={<Settings size={14} />} label={t("navPreferences")} />
            <NavBtn id="supersites" icon={<Star size={14} />} label={t("navSuperSites")} />
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {nav === "accounts"     && <AccountsSection user={user} accounts={accounts} loadingAccounts={loadingAccounts} removing={removing} onAdd={handleAdd} onRemove={handleRemove} onReauth={handleReauth} />}
          {nav === "teams"        && <TeamsSection user={user} />}
          {nav === "api"          && <ApiSection />}
          {nav === "indexing-api" && <IndexApiSection />}
          {nav === "seo-tools"    && <SeoToolsSettings />}
          {nav === "members"      && <MembersSection user={user} />}
          {nav === "preferences"  && <PreferencesSection user={user} />}
          {nav === "supersites"   && <SuperSitesSection />}
        </div>
      </div>

    </div>
  );
}
