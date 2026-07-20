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

  // ── per-site traffic (portfolio-aware)
  // CRITICAL: GSC sync writes THREE row kinds per site into DailyMetric — date-only totals
  // (url:'' query:''), page rows (url:X query:''), and query rows (url:X query:X). Summing
  // without a filter triple-counts. The date-only rows are the accurate daily totals, so we
  // scope every site/total aggregate to `url:'' , query:''`.
  const dateOnly = { url: "", query: "" };
  const nameOf = new Map(sites.map(s => [s.id, clean(s.url)]));

  // One grouped query per period instead of 200 per-site aggregates — scales to big portfolios.
  const siteAgg = (gte: Date, lt?: Date) => prisma.dailyMetric.groupBy({
    by: ["siteId"],
    where: { siteId: { in: siteIds }, ...dateOnly, date: lt ? { gte, lt } : { gte, lte: now } },
    _sum: { clicks: true, impressions: true },
  });
  const [curSites, prevSites] = await Promise.all([
    siteAgg(effectiveCurStart, undefined),
    showDelta ? siteAgg(effectivePrevStart, effectiveCurStart) : Promise.resolve([] as any[]),
  ]);
  const prevBySite = new Map<string, number>(prevSites.map((r: any) => [r.siteId, r._sum.clicks ?? 0]));
  const totPrevImpr = (prevSites as any[]).reduce((s, r) => s + (r._sum.impressions ?? 0), 0);
  const perSite = curSites.map((r: any) => ({
    id: r.siteId, name: nameOf.get(r.siteId) ?? r.siteId,
    cur: r._sum.clicks ?? 0, impr: r._sum.impressions ?? 0, prev: prevBySite.get(r.siteId) ?? 0,
  }));
  // include sites that had traffic before but zero now (full drops)
  for (const [id, prev] of prevBySite) if (!perSite.some(p => p.id === id) && prev > 0) {
    perSite.push({ id, name: nameOf.get(id) ?? id, cur: 0, impr: 0, prev });
  }

  const totCur = perSite.reduce((s, x) => s + x.cur, 0);
  const totPrev = perSite.reduce((s, x) => s + x.prev, 0);
  const totImpr = perSite.reduce((s, x) => s + x.impr, 0);

  // A move is "significant" if it's ≥5 clicks AND ≥10% of the previous value — filters
  // out the noise that dominates a 200-site portfolio.
  const significant = (p: { cur: number; prev: number }) => {
    const d = p.cur - p.prev;
    return Math.abs(d) >= 5 && (p.prev === 0 ? p.cur >= 5 : Math.abs(d) / p.prev >= 0.1);
  };
  const up = showDelta ? perSite.filter(p => p.cur > p.prev && significant(p)).length : 0;
  const down = showDelta ? perSite.filter(p => p.cur < p.prev && significant(p)).length : 0;

  const pctDelta = (cur: number, prev: number) => (prev > 0 ? `${sign(Math.round(((cur - prev) / prev) * 100))}%` : cur > 0 ? "new" : "0%");

  // ── Portfolio KPI header
  lines.push("");
  if (showDelta) lines.push(L.portfolio(perSite.length, up, down));
  lines.push(L.clicksLine(fmtNum(totCur), showDelta ? pctDelta(totCur, totPrev) : "—", fmtNum(totImpr), showDelta ? pctDelta(totImpr, totPrevImpr) : "—"));

  // ── Biggest movers by site (the actionable part for a large portfolio)
  if (showDelta) {
    const byDelta = perSite.map(p => ({ ...p, d: p.cur - p.prev })).filter(p => significant(p));
    const gainers = [...byDelta].filter(p => p.d > 0).sort((a, b) => b.d - a.d).slice(0, 8);
    const losers = [...byDelta].filter(p => p.d < 0).sort((a, b) => a.d - b.d).slice(0, 8);
    if (gainers.length) {
      lines.push("", L.topGainers);
      for (const s of gainers) lines.push(`🟢 ${s.name} — ${fmtNum(s.cur)} (${sign(s.d)}, ${pctDelta(s.cur, s.prev)})`);
    }
    if (losers.length) {
      lines.push("", L.topLosers);
      for (const s of losers) lines.push(`🔴 ${s.name} — ${fmtNum(s.cur)} (${sign(s.d)}, ${pctDelta(s.cur, s.prev)})`);
    }
  } else {
    // "all time" — no deltas, just the biggest sites
    lines.push("", L.topGainers);
    for (const s of [...perSite].sort((a, b) => b.cur - a.cur).slice(0, 15)) {
      lines.push(`${s.name} — ${fmtNum(s.cur)} ${L.unitClicks} · ${fmtNum(s.impr)} ${L.unitImpr}`);
    }
  }

  // ── winners / losers queries across the portfolio/tag
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
  const wq = deltas.filter(x => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 8);
  const lq = deltas.filter(x => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 8);
  if (wq.length) { lines.push("", L.winners); for (const w of wq) lines.push(`  ${w.q} — ${w.cur} (${sign(w.d)})`); }
  if (lq.length) { lines.push("", L.losers); for (const l of lq) lines.push(`  ${l.q} — ${l.cur} (${sign(l.d)})`); }

  // ── Striking distance across the portfolio (near-page-1 opportunities)
  let strikingCount = 0;
  try {
    const strk = await prisma.dailyMetric.groupBy({
      by: ["siteId", "query"],
      where: { siteId: { in: siteIds }, date: { gte: effectiveCurStart, lte: now }, query: { not: "" }, position: { gte: 4, lte: 20 } },
      _sum: { impressions: true }, _avg: { position: true },
      having: { impressions: { _sum: { gte: 20 } } },
      orderBy: { _sum: { impressions: "desc" } },
      take: 200,
    });
    strikingCount = strk.length;
    if (strk.length) {
      lines.push("", L.strikingHdr(strk.length));
      for (const r of strk.slice(0, 8)) {
        lines.push(L.strikingRow(r.query, nameOf.get(r.siteId) ?? "", (Math.round((r._avg.position ?? 0) * 10) / 10).toString(), fmtNum(r._sum.impressions ?? 0)));
      }
    }
  } catch { /* striking distance is best-effort on huge portfolios */ }

  // ── Sites needing attention: biggest % traffic drops
  if (showDelta) {
    const drops = perSite
      .filter(p => p.prev >= 30 && p.cur < p.prev * 0.7)
      .map(p => ({ name: p.name, pct: Math.round((1 - p.cur / p.prev) * 100) }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 6);
    if (drops.length) {
      lines.push("", L.attentionHdr);
      for (const d of drops) lines.push(L.attentionDrop(d.name, d.pct));
    }
  }

  // ── rank tracker movements
  const kws = await prisma.trackedKeyword.findMany({
    where: { siteId: { in: siteIds }, lastPosition: { not: null }, prevPosition: { not: null } },
  });
  const moved = kws
    .map(k => ({ k, d: (k.prevPosition ?? 0) - (k.lastPosition ?? 0) }))
    .filter(x => x.d !== 0)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 10);
  if (moved.length) {
    lines.push("", L.rankMoves);
    for (const { k, d } of moved) lines.push(`  ${d > 0 ? "▲" : "▼"} ${k.keyword}: ${k.prevPosition} → ${k.lastPosition}`);
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
      `You are a senior SEO analyst reviewing a multi-site portfolio digest. Write in ${langName}.\n\n` +
      `Rules:\n` +
      `- Be SPECIFIC: name the exact site domains and queries from the data, never generalize into "some projects".\n` +
      `- Structure: (1) one line on overall portfolio direction with the % change; (2) which specific sites drove gains and which drove losses — name them; (3) 3-5 concrete prioritized actions tied to the data (which site to investigate first, which striking-distance queries to push, which pages to optimize for CTR).\n` +
      `- Prefer bullet points for the actions. No fluff, no repeating the whole table, no invented facts.\n\n` +
      `DIGEST DATA:\n${digestMarkdown.slice(0, 14_000)}`,
      provider, apiKey, 1000, model, s.aiBaseUrl_custom || undefined,
    );
    return text ? `${NOTIFY_L[normalizeLang(lang)].aiSummary}\n${text.trim()}` : null;
  } catch {
    return null;
  }
}
