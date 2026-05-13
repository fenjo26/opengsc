import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type Metric = 'clicks' | 'impressions';

// Build time buckets for the requested period
function buildBuckets(type: 'month' | 'week', count: number) {
  const now = new Date();
  const buckets: { label: string; start: Date; end: Date; year?: number }[] = [];

  if (type === 'month') {
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      buckets.push({
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        year:  d.getFullYear(),
        start, end,
      });
    }
  } else {
    for (let i = count - 1; i >= 0; i--) {
      const ref = new Date(now);
      ref.setDate(ref.getDate() - i * 7);
      const day = ref.getDay();
      const mon = new Date(ref); mon.setDate(ref.getDate() - (day === 0 ? 6 : day - 1)); mon.setHours(0,0,0,0);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59);
      buckets.push({
        label: ref.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        start: mon, end: sun,
      });
    }
  }
  return buckets;
}

// Assign a DailyMetric record to a bucket index (-1 if none match)
function bucketIndex(date: Date, buckets: ReturnType<typeof buildBuckets>): number {
  const t = date.getTime();
  for (let i = 0; i < buckets.length; i++) {
    if (t >= buckets[i].start.getTime() && t <= buckets[i].end.getTime()) return i;
  }
  return -1;
}

// GET /api/gsc/decay?siteId=&metric=clicks|impressions&period=month|week&cols=16&top=20
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const siteId    = searchParams.get('siteId') ?? '';
  const metric    = (searchParams.get('metric') ?? 'clicks') as Metric;
  const periodType= (searchParams.get('period') ?? 'month') as 'month' | 'week';
  const cols      = Math.min(Math.max(parseInt(searchParams.get('cols') ?? '16'), 4), 24);
  const topN      = Math.min(parseInt(searchParams.get('top') ?? '20'), 50);

  const site = await prisma.site.findFirst({ where: { id: siteId, userId } });
  if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ── Build time buckets ────────────────────────────────────────────────────────
  const buckets = buildBuckets(periodType, cols);
  const rangeStart = buckets[0].start;
  const rangeEnd   = buckets[buckets.length - 1].end;

  // ── Top N URLs by metric in range ─────────────────────────────────────────────
  // query='' ensures we only get URL-level rows (not query+URL rows)
  const topUrls = await prisma.dailyMetric.groupBy({
    by: ['url'],
    where: { siteId, query: '', date: { gte: rangeStart, lte: rangeEnd } },
    _sum: { clicks: true, impressions: true },
    orderBy: { _sum: { [metric]: 'desc' } },
    take: topN + 1, // +1 to account for possible url='' aggregate row we filter below
  });

  // Exclude the site-level aggregate row (url='') — only keep actual page URLs
  const urls = topUrls.map((u: any) => u.url as string).filter(u => u !== '');
  if (urls.length === 0) return NextResponse.json({ pages: [], cols: buckets.map(b => b.label), allVals: [], decay: [] });
  const topNUrls = urls.slice(0, topN);

  // ── Fetch daily records for those URLs ───────────────────────────────────────
  const records = await prisma.dailyMetric.findMany({
    where: { siteId, url: { in: topNUrls }, query: '', date: { gte: rangeStart, lte: rangeEnd } },
    select: { url: true, date: true, clicks: true, impressions: true },
  });

  // ── Bucket aggregation ────────────────────────────────────────────────────────
  const urlBuckets = new Map<string, number[]>();
  for (const url of topNUrls) urlBuckets.set(url, new Array(cols).fill(0));

  for (const r of records) {
    const arr = urlBuckets.get(r.url);
    if (!arr) continue;
    const idx = bucketIndex(new Date(r.date), buckets);
    if (idx >= 0) arr[idx] += metric === 'clicks' ? r.clicks : r.impressions;
  }

  // ── Build page matrix ─────────────────────────────────────────────────────────
  const pages = topNUrls.map(url => ({
    url,
    path: url.replace(/^https?:\/\/[^/]+/, '') || '/',
    vals: urlBuckets.get(url)!,
  }));

  const allVals = new Array(cols).fill(0);
  for (const { vals } of pages) vals.forEach((v, i) => { allVals[i] += v; });

  // ── Decay detection ───────────────────────────────────────────────────────────
  // Compare last 2 buckets vs previous 2 buckets
  const decay = pages
    .map(p => {
      const curr = p.vals.slice(-2).reduce((a, b) => a + b, 0);
      const prev = p.vals.slice(-4, -2).reduce((a, b) => a + b, 0);
      if (prev === 0 && curr === 0) return null;
      const changePct = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0;
      if (changePct >= -5) return null; // not declining
      const status: 'Warning' | 'Critical' = changePct <= -25 ? 'Critical' : 'Warning';
      return {
        page:   p.path,
        url:    p.url,
        clicksLast2m:    curr - prev,
        clicksLast2mPct: changePct,
        clicksYoY:       null as number | null,
        clicks:          curr,
        status,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.clicksLast2mPct - b.clicksLast2mPct);

  return NextResponse.json({
    pages:   pages.map(p => ({ url: p.path, vals: p.vals })),
    cols:    buckets.map(b => b.label),
    years:   periodType === 'month' ? buckets.map(b => b.year) : undefined,
    allVals,
    decay,
  });
}
