// Shared Bing/Yandex key resolution — used by BOTH the site-dashboard engine switcher
// (EngineView) and the Indexing-tab panel (SearchEnginesPanel), so they never disagree
// about which key/token to use. Resolution order per site:
//   1. per-site "custom" override            (seoKey_<engine>_<siteId>, when selection = "custom")
//   2. the connected account selected for this site
//   3. the first connected account (if any)  ← the modern source of truth
//   4. the legacy global default key         (seoKey_<engine>) — only if no accounts exist
//
// Accounts win over the legacy global on purpose: the old "Global Default API Key" field
// was removed, but a stale value (e.g. a wrongly-pasted Client ID) may still linger in
// localStorage; a real connected account must take precedence over it.
"use client";

type Engine = "bing" | "yandex";

export function resolveEngineKey(engine: Engine, siteDbId: string): string {
  if (typeof window === "undefined") return "";
  const globalKey = localStorage.getItem(`seoKey_${engine}`) || "";

  let accounts: { id: string; key: string }[] = [];
  try { accounts = JSON.parse(localStorage.getItem(`seoKey_${engine}_accounts_list`) || "[]"); } catch { accounts = []; }

  const sel = localStorage.getItem(`seoKey_${engine}_account_select_${siteDbId}`) || "";

  if (sel === "custom") {
    return localStorage.getItem(`seoKey_${engine}_${siteDbId}`) || accounts[0]?.key || globalKey || "";
  }
  if (sel) {
    const acc = accounts.find(a => a.id === sel);
    if (acc?.key) return acc.key;
  }
  // No explicit per-site choice: prefer a connected account, fall back to the legacy global.
  return accounts[0]?.key || globalKey || "";
}
