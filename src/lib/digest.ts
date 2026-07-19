// Digest builder — a Markdown summary over the user's sites for a period, optionally
// filtered by tag (so a site network can get its own digest). Data comes entirely from
// the local store (DailyMetric, TrackedKeyword); the optional AI paragraph reuses the
// server-side key backup (User.seoSettings) via fetchLLM.

import { prisma } from "@/lib/prisma";
import { fetchLLM } from "@/lib/llm";
import { NOTIFY_L, normalizeLang, type NotifyLang } from "@/lib/notifyI18n";

export interface DigestSettings {
  enabled: boolean;
  frequency: "daily" | "weekly";
  hourUtc: number;   // 0-23
  tag: string;       // "" = all sites
  days: number;      // window length
  ai: boolean;       // add AI summary paragraph
  lang: NotifyLang;  // language of the rendered digest (saved from the UI language)
  lastSentAt?: string;
}

export const DEFAULT_DIGEST_SETTINGS: DigestSettings = {
  enabled: false, frequency: "weekly", hourUtc: 8, tag: "", days: 7, ai: false, lang: "en",
};

export async function getDigestSettings(userId: string): Promise<DigestSettings> {
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT digestSettings FROM "User" WHERE id = ?`, userId);
    const raw = rows?.[0]?.digestSettings;
    return raw ? { ...DEFAULT_DIGEST_SETTINGS, ...JSON.parse(raw) } : DEFAULT_DIGEST_SETTINGS;
  } catch {
    return DEFAULT_DIGEST_SETTINGS;
  }
}

export async function saveDigestSettings(userId: string, s: DigestSettings): Promise<void> {
  await prisma.$executeRawUnsafe(`UPDATE "User" SET digestSettings = ? WHERE id = ?`, JSON.stringify(s), userId);
}

const hasTag = (tagsField: string | null, tag: string): boolean => {
  if (!tagsField) return false;
  try {
    const arr = JSON.parse(tagsField);
    if (Array.isArray(arr)) return arr.map(String).map(s => s.toLowerCase()).includes(tag.toLowerCase());
  } catch { /* comma-separated fallback */ }
  return tagsField.toLowerCase().split(",").map(s => s.trim()).includes(tag.toLowerCase());
};

const clean = (u: string) => u.replace(/^https?:\/\//, "").replace(/^sc-domain:/, "").replace(/\/$/, "");
const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const arrow = (cur: number, prev: number) => (cur > prev ? "🟢" : cur < prev ? "🔴" : "⚪️");
const fmtNum = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

export async function buildDigest(userId: string, tag: string, days: number, lang: NotifyLang = "en"): Promise<{ content: string; sites: number }> {
  const L = NOTIFY_L[normalizeLang(lang)];
  const allSites = await prisma.site.findMany({ where: { userId }, select: { id: true, url: true, tags: true } });
  const sites = tag ? allSites.filter(s => hasTag(s.tags, tag)) : allSites;

  const now = new Date();
  const curStart = new Date(now); curStart.setDate(curStart.getDate() - days);
  const prevStart = new Date(now); prevStart.setDate(prevStart.getDate() - days * 2);
  const siteIds = sites.map(s => s.id);

  // days=0 means "all time" — use a very old start date
  const effectiveCurStart = days === 0 ? new Date("2000-01-01") : curStart;
  const effectivePrevStart = days === 0 ? new Date("2000-01-01") : prevStart;
  const showDelta = days > 0; // no delta comparison for "all time"

  const lines: string[] = [];
  lines.push(`*${tag ? L.digestTitleTag(tag) : L.digestTitleAll}*`);
  lines.push(days === 0 ? `_${L.allTime} · ${now.toISOString().slice(0, 10)}_` : L.digestWindow(days, now.toISOString().slice(0, 10)));

  if (!siteIds.length) {
    lines.push("", tag ? L.digestNoSitesTag(tag) : L.digestNoSites);
    return { content: lines.join("\n"), sites: 0 };
  }

  // ── per-site traffic table
  // CRITICAL: GSC sync writes THREE row kinds per site into DailyMetric — date-only totals
  // (url:'' query:''), page rows (url:X query:''), and query rows (url:X query:X). Summing
  // without a filter triple-counts. The date-only rows are the accurate daily totals, so we
  // scope every site/total aggregate to `url:'' , query:''`.
  const dateOnly = { url: "", query: "" };
  const perSite: { name: string; cur: number; prev: number; impr: number }[] = [];
  for (const site of sites) {
    const [cur, prev] = await Promise.all([
      prisma.dailyMetric.aggregate({ where: { siteId: site.id, ...dateOnly, date: { gte: effectiveCurStart, lte: now } }, _sum: { clicks: true, impressions: true } }),
      showDelta
        ? prisma.dailyMetric.aggregate({ where: { siteId: site.id, ...dateOnly, date: { gte: effectivePrevStart, lt: effectiveCurStart } }, _sum: { clicks: true } })
        : Promise.resolve({ _sum: { clicks: 0 } }),
    ]);
    perSite.push({ name: clean(site.url), cur: cur._sum.clicks ?? 0, prev: prev._sum.clicks ?? 0, impr: cur._sum.impressions ?? 0 });
  }
  perSite.sort((a, b) => b.cur - a.cur);
  const totCur = perSite.reduce((s, x) => s + x.cur, 0);
  const totPrev = perSite.reduce((s, x) => s + x.prev, 0);

  lines.push("", `${L.totalClicks(totCur, showDelta ? sign(totCur - totPrev) : "")} ${showDelta ? arrow(totCur, totPrev) : ""}`, "");
  for (const s of perSite.slice(0, 25)) {
    const delta = showDelta ? ` (${sign(s.cur - s.prev)})` : "";
    const ico = showDelta ? `${arrow(s.cur, s.prev)} ` : "";
    lines.push(`${ico}${s.name} — ${fmtNum(s.cur)} ${L.unitClicks}${delta} · ${fmtNum(s.impr)} ${L.unitImpr}`);
  }
  if (perSite.length > 25) lines.push(L.moreSites(perSite.length - 25));

  // ── winners / losers queries across the tag's sites
  const agg = (gte: Date, lt?: Date) => prisma.dailyMetric.groupBy({
    by: ["query"],
    where: { siteId: { in: siteIds }, date: lt ? { gte, lt } : { gte, lte: now }, query: { not: "" } },
    _sum: { clicks: true },
  });
  const [curQ, prevQ] = await Promise.all([agg(effectiveCurStart, undefined), showDelta ? agg(effectivePrevStart, effectiveCurStart) : Promise.resolve([])]);
  const prevMap = new Map<string, number>(prevQ.map(r => [r.query, r._sum.clicks ?? 0] as [string, number]));
  const curMap = new Map<string, number>(curQ.map(r => [r.query, r._sum.clicks ?? 0] as [string, number]));
  const deltas: { q: string; d: number; cur: number; prev: number }[] = [];
  for (const [q, c] of curMap) deltas.push({ q, cur: c, prev: prevMap.get(q) ?? 0, d: c - (prevMap.get(q) ?? 0) });
  for (const [q, p] of prevMap) if (!curMap.has(q)) deltas.push({ q, cur: 0, prev: p, d: -p });
  const winners = deltas.filter(x => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 5);
  const losers = deltas.filter(x => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 5);
  if (winners.length) {
    lines.push("", L.winners);
    for (const w of winners) lines.push(`  ${w.q} — ${w.cur} (${sign(w.d)})`);
  }
  if (losers.length) {
    lines.push("", L.losers);
    for (const l of losers) lines.push(`  ${l.q} — ${l.cur} (${sign(l.d)})`);
  }

  // ── rank tracker movements
  const kws = await prisma.trackedKeyword.findMany({
    where: { siteId: { in: siteIds }, lastPosition: { not: null }, prevPosition: { not: null } },
  });
  const moved = kws
    .map(k => ({ k, d: (k.prevPosition ?? 0) - (k.lastPosition ?? 0) })) // positive = improved
    .filter(x => x.d !== 0)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 8);
  if (moved.length) {
    lines.push("", L.rankMoves);
    for (const { k, d } of moved) {
      lines.push(`  ${d > 0 ? "▲" : "▼"} ${k.keyword}: ${k.prevPosition} → ${k.lastPosition}`);
    }
  }

  return { content: lines.join("\n"), sites: sites.length };
}

// Optional AI paragraph on top of the numbers — uses the server-side backup of the
// user's own AI key (User.seoSettings); silently skipped when no key is configured.
export async function aiSummary(userId: string, digestMarkdown: string, lang: NotifyLang = "en"): Promise<string | null> {
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT seoSettings FROM "User" WHERE id = ?`, userId);
    const s = rows?.[0]?.seoSettings ? JSON.parse(rows[0].seoSettings) : null;
    if (!s) return null;
    const provider = s.seoProvider || s.aiProvider || "anthropic";
    const apiKey = s[`aiKey_${provider}`] || s.aiApiKey || "";
    if (!apiKey) return null;
    const model = s.seoModel || s[`aiModel_${provider}`] || undefined;
    const langName = lang === "ru" ? "Russian" : lang === "uk" ? "Ukrainian" : "English";
    const text = await fetchLLM(
      `You are an SEO analyst. Below is a metrics digest for a period. Write 3-5 sentences of conclusions in ${langName}: what important happened and what needs action. No fluff, do not repeat the raw numbers as a list.\n\n${digestMarkdown.slice(0, 12_000)}`,
      provider, apiKey, 800, model, s.aiBaseUrl_custom || undefined,
    );
    return text ? `${NOTIFY_L[normalizeLang(lang)].aiSummary}\n${text.trim()}` : null;
  } catch {
    return null;
  }
}
