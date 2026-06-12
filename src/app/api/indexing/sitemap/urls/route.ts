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

  const counters = {
    total: allRows.length,
    indexed: allRows.filter((r: any) => /submitted and indexed/i.test(r.googleStatus ?? '')).length,
    notIndexed: allRows.filter((r: any) => r.googleStatus && !/submitted and indexed/i.test(r.googleStatus)).length,
    notChecked: allRows.filter((r: any) => !r.googleStatus).length,
    neuralSubmitted: allRows.filter((r: any) => r.neuralStatus === 'submitted').length,
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
