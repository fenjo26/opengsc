import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Extract brand terms from site URL for non-brand filtering
function brandTerms(siteUrl: string): string[] {
  const clean = siteUrl
    .replace(/^https?:\/\//, '')
    .replace(/^sc-domain:/, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('.')[0];
  return [clean.toLowerCase()];
}

// GET /api/gsc/cannibalization?siteId=&days=90&minImpressions=30&limit=60
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const siteId  = searchParams.get('siteId') ?? '';
  const days    = Math.min(parseInt(searchParams.get('days') ?? '90'), 365);
  const minImpr = parseInt(searchParams.get('minImpressions') ?? '30');
  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '60'), 200);

  const site = await prisma.site.findFirst({ where: { id: siteId, userId } });
  if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const brand = brandTerms(site.siteId);
  const since = new Date();
  since.setDate(since.getDate() - days);

  // ── Aggregate (query, url) pairs ───────────────────────────────────────────────
  type AggRow = { url: string; query: string; _sum: { clicks: number | null; impressions: number | null }; _avg: { ctr: number | null; position: number | null } };
  const aggsRaw = await prisma.dailyMetric.groupBy({
    by: ['query', 'url'],
    where: { siteId, date: { gte: since } },
    _sum: { clicks: true, impressions: true },
    _avg: { ctr: true, position: true },
    orderBy: { _sum: { impressions: 'desc' } },
    take: 10000,
  });
  // Exclude site-level aggregate rows (url='' or query='') that have no per-URL meaning
  const aggs: AggRow[] = (aggsRaw as unknown as AggRow[]).filter(a => a.url !== '' && a.query !== '');

  // ── Build URL → top query map (query bringing most impressions to that URL) ──
  const urlBest = new Map<string, { query: string; impr: number }>();
  for (const a of aggs) {
    const impr = a._sum.impressions ?? 0;
    const cur  = urlBest.get(a.url);
    if (!cur || impr > cur.impr) urlBest.set(a.url, { query: a.query, impr });
  }

  // ── Group by query ─────────────────────────────────────────────────────────────
  const queryMap = new Map<string, typeof aggs>();
  for (const a of aggs) {
    if (!queryMap.has(a.query)) queryMap.set(a.query, []);
    queryMap.get(a.query)!.push(a);
  }

  // ── Build cannibalization groups ───────────────────────────────────────────────
  const groups: {
    query: string;
    pages: {
      url: string; fullUrl: string; topQuery: string;
      impressions: number; clicks: number; ctr: number; position: number;
    }[];
    isTrue: boolean;
  }[] = [];

  for (const [query, entries] of queryMap) {
    // Skip branded queries
    if (brand.some(b => query.toLowerCase().includes(b))) continue;

    // Need 2+ distinct URLs
    const uniqueUrls = [...new Set(entries.map(e => e.url))];
    if (uniqueUrls.length < 2) continue;

    // Aggregate per URL (sum across dates already done by groupBy)
    const perUrl = uniqueUrls.map(url => {
      const row = entries.find(e => e.url === url)!;
      return {
        url,
        impressions: row._sum.impressions ?? 0,
        clicks:      row._sum.clicks ?? 0,
        ctr:         Math.round((row._avg.ctr ?? 0) * 1000) / 10,
        position:    Math.round((row._avg.position ?? 0) * 10) / 10,
      };
    }).sort((a, b) => b.impressions - a.impressions);

    const totalImpr = perUrl.reduce((s, p) => s + p.impressions, 0);
    if (totalImpr < minImpressions(minImpr)) continue;

    // Filter: remove pages with <10% share of query impressions
    const significant = perUrl.filter(p => (p.impressions / totalImpr) >= 0.10);
    if (significant.length < 2) continue;

    // Filter: if position gap between top-2 > 20, not really competing
    const pos1 = significant[0].position;
    const pos2 = significant[1].position;
    if (Math.abs(pos2 - pos1) > 20) continue;

    // Build result pages
    const pages = significant.map(p => ({
      url:         p.url.replace(/^https?:\/\/[^/]+/, '') || '/',
      fullUrl:     p.url,
      topQuery:    urlBest.get(p.url)?.query ?? query,
      impressions: p.impressions,
      clicks:      p.clicks,
      ctr:         p.ctr,
      position:    p.position,
    }));

    // True cannibalization: top queries overlap with group query keywords
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const topQueries = pages.map(p => p.topQuery.toLowerCase());
    const sameTopQuery = new Set(topQueries).size < topQueries.length;
    const overlapping  = queryWords.length > 0 && topQueries.filter(tq =>
      queryWords.some(w => tq.includes(w))
    ).length >= 2;
    const isTrue = sameTopQuery || overlapping;

    groups.push({ query, pages, isTrue });
  }

  // Sort by total impressions desc, limit
  const result = groups
    .sort((a, b) =>
      b.pages.reduce((s, p) => s + p.impressions, 0) -
      a.pages.reduce((s, p) => s + p.impressions, 0)
    )
    .slice(0, limit);

  return NextResponse.json({ groups: result, brand });
}

function minImpressions(n: number) { return n; }
