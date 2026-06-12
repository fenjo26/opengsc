import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST { siteDbId, ids?: string[] }  — checks if backlink pages return 2xx
// If ids is empty/omitted, checks ALL unchecked links (or all if forceAll=true)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const siteDbId: string = body.siteDbId;
  const ids: string[] = body.ids ?? [];
  const forceAll: boolean = body.forceAll ?? false;

  const site = await prisma.site.findFirst({ where: { id: siteDbId, userId }, select: { id: true } });
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  // Pick which links to check
  const where: any = { siteId: siteDbId };
  if (ids.length > 0) {
    where.id = { in: ids };
  } else if (!forceAll) {
    where.isAlive = null; // only unchecked
  }

  const links = await prisma.backlink.findMany({ where, take: 200, select: { id: true, url: true } });
  if (links.length === 0) return NextResponse.json({ ok: true, checked: 0, alive: 0, dead: 0 });

  let alive = 0, dead = 0;

  await Promise.allSettled(
    links.map(async (link: any) => {
      try {
        const res = await fetch(link.url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(8000),
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOGetsCrawler/1.0)' },
        });
        // Try GET if HEAD not allowed
        const status = res.status;
        const ok = status >= 200 && status < 400;
        let title: string | null = null;

        if (ok && res.status !== 405) {
          // Try to extract title via GET for alive pages (with short timeout)
          try {
            const gr = await fetch(link.url, {
              signal: AbortSignal.timeout(5000),
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOGetsCrawler/1.0)' },
            });
            const html = await gr.text();
            const m = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i);
            title = m ? m[1].trim() : null;
          } catch {}
        }

        await prisma.backlink.update({
          where: { id: link.id },
          data: { isAlive: ok, aliveChecked: new Date(), ...(title ? { title } : {}) },
        });
        ok ? alive++ : dead++;
      } catch {
        await prisma.backlink.update({
          where: { id: link.id },
          data: { isAlive: false, aliveChecked: new Date() },
        });
        dead++;
      }
    }),
  );

  // Log operation
  await prisma.indexingOperation.create({
    data: {
      siteId: siteDbId,
      type: 'backlink_check_alive',
      result: 'success',
      detail: `alive: ${alive}, dead: ${dead}`,
      urlCount: links.length,
    },
  });

  return NextResponse.json({ ok: true, checked: links.length, alive, dead });
}
