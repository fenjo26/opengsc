import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  let userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    // Guest access via a share link: the token must match the requested site (never 'all').
    const sp = new URL(req.url).searchParams;
    const shareToken = sp.get('shareToken') ?? '';
    const sharedSiteId = sp.get('siteId') ?? '';
    if (shareToken && sharedSiteId && sharedSiteId !== 'all') {
      const shared = await prisma.site.findFirst({ where: { id: sharedSiteId, shareToken, shareEnabled: true } });
      if (shared) userId = shared.userId;
    }
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get('siteId') ?? '';
  if (!siteId) return NextResponse.json({ error: 'Missing siteId' }, { status: 400 });

  let siteIds: string[];
  if (siteId === 'all') {
    const sites = await prisma.site.findMany({ where: { userId } });
    siteIds = sites.map(s => s.id);
  } else {
    const site = await prisma.site.findFirst({ where: { id: siteId, userId } });
    if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    siteIds = [site.id];
  }

  const now = new Date();
  const t30 = new Date(now); t30.setDate(t30.getDate() - 30);
  const t60 = new Date(now); t60.setDate(t60.getDate() - 60);

  try {
    const currMetrics = await prisma.dailyMetric.groupBy({
      by: ['query'],
      where: { siteId: { in: siteIds }, query: { not: '' }, date: { gte: t30 } },
      _sum: { clicks: true, impressions: true },
      _avg: { position: true },
      having: {
        impressions: {
          _sum: {
            gte: 10
          }
        }
      }
    });

    const prevMetrics = await prisma.dailyMetric.groupBy({
      by: ['query'],
      where: { siteId: { in: siteIds }, query: { not: '' }, date: { gte: t60, lt: t30 } },
      _avg: { position: true },
    });

    const prevMap = new Map<string, number>();
    for (const p of prevMetrics) {
      if (p._avg.position != null) {
        prevMap.set(p.query, p._avg.position);
      }
    }

    const points = currMetrics
      .map(c => {
        const prevPos = prevMap.get(c.query);
        if (prevPos == null) return null;
        return {
          query: c.query,
          clicks: c._sum.clicks ?? 0,
          impressions: c._sum.impressions ?? 0,
          prevPos: Math.round(prevPos * 10) / 10,
          currPos: Math.round((c._avg.position ?? 0) * 10) / 10,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ points });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Database error' }, { status: 500 });
  }
}
