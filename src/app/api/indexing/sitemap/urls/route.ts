import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/indexing/sitemap/urls?siteDbId=...&page=1&limit=50&status=all&search=
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const siteDbId = searchParams.get('siteDbId') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(200, Math.max(10, parseInt(searchParams.get('limit') ?? '50', 10)));
  const statusFilter = searchParams.get('status') ?? 'all';
  const search = searchParams.get('search') ?? '';

  const site = await prisma.site.findFirst({
    where: { id: siteDbId, userId },
    select: { id: true, lastSitemapSync: true, sitemapUrl: true, crawlInterval: true, url: true },
  });
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  // Build where clause
  const where: any = { siteId: siteDbId };
  if (search) where.url = { contains: search };
  if (statusFilter === 'indexed')     where.googleStatus = { contains: 'indexed' };
  if (statusFilter === 'not_indexed') where.googleStatus = { not: null, notIn: ['Submitted and indexed', 'indexed'] };
  if (statusFilter === 'not_checked') where.googleStatus = null;

  const [total, rows] = await Promise.all([
    prisma.sitemapUrl.count({ where }),
    prisma.sitemapUrl.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, url: true,
        googleStatus: true, googleCoverage: true, googleReason: true, googleChecked: true,
        xrStatus: true, xrChecked: true,
        twoIndexStatus: true, twoIndexAt: true,
        neuralStatus: true, neuralAt: true, neuralQueue: true,
        updatedAt: true,
      },
    }),
  ]);

  // Aggregate counters
  const allRows = await prisma.sitemapUrl.findMany({
    where: { siteId: siteDbId },
    select: { googleStatus: true, xrStatus: true, twoIndexStatus: true, neuralStatus: true },
  });

  const NEURAL_CHECK = new Set(['indexed', 'not_indexed']);
  const counters = {
    total: allRows.length,
    // "В индексе" = Google says indexed OR Neural check says indexed
    indexed: allRows.filter((r: any) =>
      /submitted and indexed/i.test(r.googleStatus ?? '') || r.neuralStatus === 'indexed'
    ).length,
    // "Не в индексе" = Google says not indexed OR Neural check says not indexed
    notIndexed: allRows.filter((r: any) =>
      (r.googleStatus && !/submitted and indexed/i.test(r.googleStatus)) || r.neuralStatus === 'not_indexed'
    ).length,
    // "Не проверено" = no check from any source
    notChecked: allRows.filter((r: any) =>
      !r.googleStatus && !NEURAL_CHECK.has(r.neuralStatus ?? '') && !r.xrStatus
    ).length,
    // NeuralIndexer submissions (queue)
    neuralSubmitted: allRows.filter((r: any) => r.neuralStatus === 'submitted').length,
    // NeuralIndexer check results
    neuralChecked: allRows.filter((r: any) => NEURAL_CHECK.has(r.neuralStatus ?? '')).length,
    twoIndexSubmitted: allRows.filter((r: any) => r.twoIndexStatus === 'submitted').length,
  };

  return NextResponse.json({
    rows,
    total,
    page,
    pages: Math.ceil(total / limit),
    counters,
    meta: {
      lastSitemapSync: site.lastSitemapSync,
      sitemapUrl: site.sitemapUrl,
      crawlInterval: site.crawlInterval,
      siteUrl: site.url,
    },
  });
}
