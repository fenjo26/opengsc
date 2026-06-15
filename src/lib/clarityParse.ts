// Shared (server + client) parsing of Microsoft Clarity Data Export responses,
// plus aggregation across multiple daily snapshots for a longer time window.

export interface ClarityMetric { name: string; value: string | number; unit?: string }
export interface PageRow { url: string; deadClicks: number; rageClicks: number; scrollDepth: number; sessions: number }

export interface ClarityTotals {
  sessions: number;
  dead: number;
  rage: number;
  quickback: number;
  errors: number;
  scrollSum: number;   // sum of per-URL avg scroll (for weighted-ish average)
  scrollCount: number;
  engSum: number;      // sum of per-URL engagement
  engCount: number;
  pages: Record<string, PageRow>;
}

export function emptyTotals(): ClarityTotals {
  return { sessions: 0, dead: 0, rage: 0, quickback: 0, errors: 0, scrollSum: 0, scrollCount: 0, engSum: 0, engCount: 0, pages: {} };
}

// Normalize a Clarity metricName / field key: strip non-alphanumerics, lowercase.
const norm = (s: string) => (s || "").replace(/[^a-z0-9]/gi, "").toLowerCase();

// First numeric field in a row whose normalized key matches a candidate.
function pickNum(row: any, candidates: string[]): number {
  for (const k of Object.keys(row || {})) {
    const kn = norm(k);
    if (candidates.some(c => kn === c || kn.includes(c))) {
      const n = Number(row[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

// Parse ONE Clarity response array (the URL-dimension call) into raw totals.
export function parseTraffic(traffic: any[]): ClarityTotals {
  const t = emptyTotals();
  for (const metric of traffic || []) {
    const n = norm(metric.metricName ?? "");
    for (const row of metric.information ?? []) {
      const url: string = row.URL ?? row.url ?? "";
      if (url && !t.pages[url]) t.pages[url] = { url, deadClicks: 0, rageClicks: 0, scrollDepth: 0, sessions: 0 };

      if (n === "traffic") {
        const s = pickNum(row, ["totalsessioncount"]);
        t.sessions += s;
        if (url) t.pages[url].sessions += s;
      } else if (n.includes("deadclick")) {
        const d = pickNum(row, ["deadclickcount", "deadclick", "subtotal"]);
        t.dead += d;
        if (url) t.pages[url].deadClicks += d;
      } else if (n.includes("rageclick")) {
        const r = pickNum(row, ["rageclickcount", "rageclick", "subtotal"]);
        t.rage += r;
        if (url) t.pages[url].rageClicks += r;
      } else if (n.includes("quickback")) {
        t.quickback += pickNum(row, ["quickbackclickcount", "quickbackclick", "quickback", "subtotal"]);
      } else if (n.includes("scrolldepth")) {
        const sd = pickNum(row, ["averagescrolldepth", "scrolldepth"]);
        if (sd > 0) { t.scrollSum += sd; t.scrollCount++; }
        if (url) t.pages[url].scrollDepth = Math.round(sd);
      } else if (n.includes("engagementtime")) {
        const et = pickNum(row, ["activetime", "totaltime", "engagementtime"]);
        if (et > 0) { t.engSum += et; t.engCount++; }
      } else if (n.includes("scripterror") || n.includes("javascripterror") || n === "errorclickcount") {
        t.errors += pickNum(row, ["scripterrorcount", "errorcount", "scripterror", "subtotal"]);
      }
    }
  }
  return t;
}

// Merge two totals (used to combine daily snapshots).
export function mergeTotals(a: ClarityTotals, b: ClarityTotals): ClarityTotals {
  const out = emptyTotals();
  out.sessions = a.sessions + b.sessions;
  out.dead = a.dead + b.dead;
  out.rage = a.rage + b.rage;
  out.quickback = a.quickback + b.quickback;
  out.errors = a.errors + b.errors;
  out.scrollSum = a.scrollSum + b.scrollSum;
  out.scrollCount = a.scrollCount + b.scrollCount;
  out.engSum = a.engSum + b.engSum;
  out.engCount = a.engCount + b.engCount;
  out.pages = { ...a.pages };
  for (const [url, p] of Object.entries(b.pages)) {
    if (!out.pages[url]) out.pages[url] = { url, deadClicks: 0, rageClicks: 0, scrollDepth: 0, sessions: 0 };
    out.pages[url] = {
      url,
      deadClicks: out.pages[url].deadClicks + p.deadClicks,
      rageClicks: out.pages[url].rageClicks + p.rageClicks,
      sessions: out.pages[url].sessions + p.sessions,
      scrollDepth: Math.max(out.pages[url].scrollDepth, p.scrollDepth),
    };
  }
  return out;
}

export function totalsToMetrics(t: ClarityTotals): ClarityMetric[] {
  const avgScroll = t.scrollCount > 0 ? Math.round(t.scrollSum / t.scrollCount) : 0;
  const avgEng = t.engCount > 0 ? Math.round(t.engSum / t.engCount) : 0;
  return [
    { name: "dead", value: t.dead },
    { name: "rage", value: t.rage },
    { name: "quickback", value: t.quickback },
    { name: "scroll", value: avgScroll, unit: "%" },
    { name: "sessions", value: t.sessions },
    { name: "engagement", value: avgEng, unit: "s" },
    { name: "errors", value: t.errors },
  ];
}

export function totalsToPages(t: ClarityTotals): PageRow[] {
  return Object.values(t.pages)
    .filter(p => p.url && (p.deadClicks > 0 || p.rageClicks > 0 || p.sessions > 0))
    .sort((a, b) => (b.deadClicks + b.rageClicks) - (a.deadClicks + a.rageClicks))
    .slice(0, 20);
}

type SnapLike = { fetchedAt: string | Date; data: { traffic?: any[] } };

// Aggregate snapshots within the last `maxDays`, deduped by calendar day
// (keeping the latest snapshot per day), summed into one window.
export function aggregateSnapshots(snapshots: SnapLike[], maxDays = 30): {
  metrics: ClarityMetric[]; pages: PageRow[]; daysCovered: number;
} {
  const cutoff = Date.now() - maxDays * 86400000;
  const byDay = new Map<string, SnapLike>();
  for (const s of snapshots) {
    const ts = new Date(s.fetchedAt).getTime();
    if (ts < cutoff) continue;
    const day = new Date(s.fetchedAt).toISOString().slice(0, 10);
    const prev = byDay.get(day);
    if (!prev || new Date(s.fetchedAt).getTime() > new Date(prev.fetchedAt).getTime()) byDay.set(day, s);
  }
  let totals = emptyTotals();
  for (const s of byDay.values()) {
    totals = mergeTotals(totals, parseTraffic(s.data?.traffic ?? []));
  }
  return { metrics: totalsToMetrics(totals), pages: totalsToPages(totals), daysCovered: byDay.size };
}
