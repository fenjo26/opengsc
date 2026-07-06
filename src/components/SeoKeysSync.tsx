"use client";

// Invisible component (mounted once in the root layout) that keeps the browser-side SEO
// settings (API keys, providers, models, policies) backed up to the server per user.
//
// - On mount: pull the server snapshot and RESTORE any keys missing locally — so after
//   clearing browser storage everything comes back on the next page load.
// - Every 20s + on tab hide: push a snapshot IF it changed — so newly entered keys are
//   backed up without wiring every settings input.

import { useEffect } from "react";
import { useSession } from "next-auth/react";

const EXACT_KEYS = [
  "aiProvider", "aiApiKey", "seoProvider", "seoModel", "seoSerpProvider", "seoSerpProvider_rank",
  "seoActivePolicy", "seoPolicies",
  "seoAutoFactcheck", "seoAutoImages", "seoHardRedact", "seoFactSources",
  "seoFactBearingOnly", "seoFactReuseCorpus",
];
const PREFIXES = ["aiKey_", "aiBaseUrl_", "aiModel_", "seoKey_", "seoTaskProvider_", "seoTaskModel_"];

function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (EXACT_KEYS.includes(k) || PREFIXES.some(p => k.startsWith(p))) {
      const v = localStorage.getItem(k);
      if (v != null && v !== "") out[k] = v;
    }
  }
  return out;
}

let lastPushed = ""; // module-level: survives re-mounts within the same page session

async function pullAndRestore(): Promise<void> {
  const res = await fetch("/api/settings/seo-sync", { cache: "no-store" });
  if (!res.ok) return;
  const d = await res.json();
  const server: Record<string, string> = d?.settings && typeof d.settings === "object" ? d.settings : {};
  let restored = 0;
  for (const [k, v] of Object.entries(server)) {
    if (typeof v !== "string") continue;
    if (!(EXACT_KEYS.includes(k) || PREFIXES.some(p => k.startsWith(p)))) continue;
    if (localStorage.getItem(k) == null) { localStorage.setItem(k, v); restored++; }
  }
  if (restored > 0) window.dispatchEvent(new Event("seo-keys-restored"));
}

async function pushIfChanged(): Promise<void> {
  const snap = snapshot();
  if (!Object.keys(snap).length) return; // nothing configured — don't overwrite a backup with emptiness
  const json = JSON.stringify(snap);
  if (json === lastPushed) return;
  const res = await fetch("/api/settings/seo-sync", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: snap }),
  });
  if (res.ok) lastPushed = json;
}

export default function SeoKeysSync() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== "authenticated") return;
    let timer: any;
    (async () => {
      try { await pullAndRestore(); } catch { /* offline / not migrated — silent */ }
      try { await pushIfChanged(); } catch { /* silent */ }
      timer = setInterval(() => { pushIfChanged().catch(() => {}); }, 20_000);
    })();
    const onHide = () => { if (document.visibilityState === "hidden") pushIfChanged().catch(() => {}); };
    document.addEventListener("visibilitychange", onHide);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onHide); };
  }, [status]);
  return null;
}
