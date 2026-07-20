import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOwnerSettings, resolveEngineKeyFromSettings } from "@/lib/engineKeysServer";

// Live portfolio for Bing / Yandex — returns the SAME per-site shape as /api/gsc/portfolio
// (data[] daily series + normalized sparkline values + comparison, and a summary with deltas),
// so the main dashboard can render Bing/Yandex tabs through the exact same UI as Google.
//
// Data is fetched live per site (Bing: 1 call/site; Yandex: 1 call/site after a shared
// user+hosts lookup), concurrency-limited. The client caches the result per engine+period.

function periodToDays(period: string): number {
  const today = new Date();
  const map: Record<string, number> = {
    yesterday: 1, "7d": 7, "14d": 14, "28d": 28, last_week: 7,
    this_month: today.getDate(), last_month: new Date(today.getFullYear(), today.getMonth(), 0).getDate(),
    this_quarter: 90, last_quarter: 90,
    ytd: Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 86400000),
    "3m": 90, "6m": 180, "8m": 240, "12m": 365, "16m": 480, "2y": 730, "3y": 1095,
  };
  return map[period] ?? 28;
}
const pct = (curr: number, prev: number) => (prev === 0 ? 0 : Math.round(((curr - prev) / prev) * 100));
const clean = (u: string) => u.replace(/^https?:\/\//, "").replace(/^sc-domain:/, "").replace(/\/.*$/, "");
const dstr = (d: Date) => d.toISOString().slice(0, 10);

type Daily = { date: string; clicks: number; impressions: number; ctr: number; position: number }; // ctr as fraction

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; try { out[idx] = await fn(items[idx]); } catch { out[idx] = undefined; } } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

// Turn daily rows (current + previous window) into the portfolio per-site payload.
function buildPayload(site: any, curr: Daily[], prev: Daily[], days: number) {
  const norm = (arr: number[]) => { const lo = Math.min(...arr, 0), hi = Math.max(...arr, 1); return arr.map(v => (hi === lo ? 50 : Math.round(((v - lo) / (hi - lo)) * 85 + 5))); };
  const sum = (rows: Daily[]) => rows.reduce((a, m) => ({ clicks: a.clicks + m.clicks, impressions: a.impressions + m.impressions, ctr: a.ctr + m.ctr, position: a.position + m.position, n: a.n + 1 }), { clicks: 0, impressions: 0, ctr: 0, position: 0, n: 0 });
  const c = sum(curr), p = sum(prev);
  const avgCtr = (s: typeof c) => (s.n > 0 ? +((s.ctr / s.n) * 100).toFixed(2) : 0);
  // Position averaged only over days that actually have a position (>0), so empty days don't drag it to 0.
  const avgPos = (rows: Daily[]) => { const pts = rows.filter(r => r.position > 0); return pts.length ? +(pts.reduce((a, r) => a + r.position, 0) / pts.length).toFixed(1) : 0; };
  const summary = {
    clicks: { value: c.clicks, change: pct(c.clicks, p.clicks) },
    impressions: { value: c.impressions, change: pct(c.impressions, p.impressions) },
    ctr: { value: avgCtr(c), change: pct(avgCtr(c), avgCtr(p)) },
    position: { value: avgPos(curr), change: pct(avgPos(curr), avgPos(prev)) },
  };

  const prevByDate = new Map(prev.map(r => [r.date, r]));
  const clicks = curr.map(r => r.clicks), impressions = curr.map(r => r.impressions);
  const ctrs = curr.map(r => +((r.ctr * 100).toFixed(2))), positions = curr.map(r => +r.position.toFixed(1));
  const clicksC: number[] = [], impressionsC: number[] = [], ctrsC: number[] = [], positionsC: number[] = [];
  for (const r of curr) {
    const shifted = new Date(r.date); shifted.setDate(shifted.getDate() - days);
    const pr = prevByDate.get(dstr(shifted));
    clicksC.push(pr?.clicks ?? 0); impressionsC.push(pr?.impressions ?? 0);
    ctrsC.push(pr ? +((pr.ctr * 100).toFixed(2)) : 0); positionsC.push(pr ? +pr.position.toFixed(1) : 0);
  }
  const nC = norm(clicks), nI = norm(impressions), nT = norm(ctrs), nP = norm(positions);
  const nCC = norm(clicksC), nIC = norm(impressionsC), nTC = norm(ctrsC), nPC = norm(positionsC);
  const data = curr.map((r, i) => ({
    date: r.date, clicks: r.clicks, impressions: r.impressions, ctr: ctrs[i], position: positions[i],
    clicksC: clicksC[i], impressionsC: impressionsC[i], ctrC: ctrsC[i], positionC: positionsC[i],
    cN: nC[i], iN: nI[i], tN: nT[i], pN: nP[i], cCN: nCC[i], iCN: nIC[i], tCN: nTC[i], pCN: nPC[i],
  }));
  return { ...site, data, summary, hasData: curr.some(r => r.clicks > 0 || r.impressions > 0) };
}

const parseBingDate = (v: any): string => { const m = String(v ?? "").match(/\/Date\((\d+)/); return m ? new Date(parseInt(m[1], 10)).toISOString().slice(0, 10) : String(v).slice(0, 10); };

async function bingSite(key: string, site: any, start: string, prevStart: string, days: number, curEnd: string, prevEnd: string) {
  const dom = clean(site.url);
  const url = `https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?siteUrl=${encodeURIComponent(`https://${dom}/`)}&apikey=${encodeURIComponent(key)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!r.ok) return { ...site, data: [], summary: null, hasData: false };
  const rows: any[] = (await r.json())?.d ?? [];
  const daily: Daily[] = rows.map(x => {
    const clicks = Number(x.Clicks) || 0, impressions = Number(x.Impressions) || 0;
    const posv = Number(x.AvgImpressionPosition ?? x.AvgClickPosition ?? 0);
    return { date: parseBingDate(x.Date), clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: posv > 0 ? posv : 0 };
  }).sort((a, b) => a.date.localeCompare(b.date));
  const curr = daily.filter(d => d.date >= start && d.date <= curEnd);
  const prev = daily.filter(d => d.date >= prevStart && d.date <= prevEnd);
  return buildPayload(site, curr, prev, days);
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const engine = searchParams.get("engine") === "yandex" ? "yandex" : "bing";
  const period = searchParams.get("period") || "7d";
  const days = periodToDays(period);

  const now = new Date();
  const curEnd = dstr(now);
  const start = dstr(new Date(now.getTime() - (days - 1) * 86_400_000));
  const prevEnd = dstr(new Date(now.getTime() - days * 86_400_000));
  const prevStart = dstr(new Date(now.getTime() - (2 * days - 1) * 86_400_000));

  const sites = await prisma.site.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const settings = await getOwnerSettings(userId);
  const keyFor = (siteId: string) => resolveEngineKeyFromSettings(settings, engine, siteId);
  // Any key configured at all? (used only to short-circuit the "not connected" case)
  const anyKey = sites.some((s: any) => keyFor(s.id)) || resolveEngineKeyFromSettings(settings, engine, "");
  if (!anyKey) return NextResponse.json({ sites: sites.map(s => ({ ...s, data: [], summary: null, hasData: false })), engine, noKey: true });

  if (engine === "bing") {
    // Bing keys can differ per site (multi-account) — resolve each site's own key.
    const res = await pool(sites, 6, (s: any) => { const k = keyFor(s.id); return k ? bingSite(k, s, start, prevStart, days, curEnd, prevEnd) : Promise.resolve({ ...s, data: [], summary: null, hasData: false }); });
    return NextResponse.json({ sites: res.map((x, i) => x ?? { ...sites[i], data: [], summary: null, hasData: false }), engine });
  }

  const key = keyFor(sites[0]?.id ?? "") || resolveEngineKeyFromSettings(settings, engine, "");

  // Yandex: shared user + hosts lookup, then one history call per site.
  const BASE = "https://api.webmaster.yandex.net/v4";
  const headers = { Authorization: `OAuth ${key}`, "Content-Type": "application/json" };
  const yGet = async (path: string) => { const r = await fetch(`${BASE}${path}`, { headers, signal: AbortSignal.timeout(12_000) }); return r.ok ? r.json() : null; };
  const user = await yGet("/user/");
  const uid = user?.user_id;
  const hostsBody = uid ? await yGet(`/user/${uid}/hosts/`) : null;
  const list: any[] = hostsBody?.hosts ?? [];
  const hostname = (u: string) => clean(u).replace(/^www\./, "").toLowerCase();

  const res = await pool(sites, 5, async (site: any) => {
    if (!uid) return { ...site, data: [], summary: null, hasData: false };
    const want = hostname(site.url);
    const matches = list.filter(h => String(h.ascii_host_url ?? h.unicode_host_url ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[:/].*$/, "").toLowerCase() === want);
    const best = matches.find(h => h.verified && String(h.ascii_host_url).startsWith("https")) ?? matches.find(h => h.verified) ?? matches[0];
    if (!best?.host_id) return { ...site, data: [], summary: null, hasData: false };
    const path = `/user/${uid}/hosts/${encodeURIComponent(best.host_id)}/search-queries/all/history/?query_indicator=TOTAL_SHOWS&query_indicator=TOTAL_CLICKS&query_indicator=AVG_SHOW_POSITION&date_from=${prevStart}&date_to=${curEnd}`;
    const h = await yGet(path);
    const ind = h?.indicators ?? {};
    const byDate = new Map<string, Daily>();
    const get = (d: string) => byDate.get(d) ?? { date: d, clicks: 0, impressions: 0, ctr: 0, position: 0 };
    for (const p of ind.TOTAL_SHOWS ?? []) { const d = String(p.date).slice(0, 10); byDate.set(d, { ...get(d), impressions: Math.round(p.value ?? 0) }); }
    for (const p of ind.TOTAL_CLICKS ?? []) { const d = String(p.date).slice(0, 10); byDate.set(d, { ...get(d), clicks: Math.round(p.value ?? 0) }); }
    for (const p of ind.AVG_SHOW_POSITION ?? []) { const d = String(p.date).slice(0, 10); const v = Number(p.value); byDate.set(d, { ...get(d), position: isFinite(v) && v > 0 ? v : 0 }); }
    const daily = [...byDate.values()].map(r => ({ ...r, ctr: r.impressions ? r.clicks / r.impressions : 0 })).sort((a, b) => a.date.localeCompare(b.date));
    const curr = daily.filter(d => d.date >= start && d.date <= curEnd);
    const prev = daily.filter(d => d.date >= prevStart && d.date <= prevEnd);
    return buildPayload(site, curr, prev, days);
  });
  return NextResponse.json({ sites: res.map((x, i) => x ?? { ...sites[i], data: [], summary: null, hasData: false }), engine });
}
