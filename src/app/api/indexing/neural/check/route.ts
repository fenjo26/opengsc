import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const BASE = 'https://inderixingbot.com/api';

// POST { siteDbId: string, urls: string[] }
// Checks indexation status via NeuralIndexer check-index-task.php and persists results.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { neuralIndexerToken: true },
  });

  if (!user?.neuralIndexerToken) {
    return NextResponse.json({ error: 'NeuralIndexer token not configured' }, { status: 400 });
  }

  const body = await req.json();
  const siteDbId: string | undefined = body.siteDbId;
  const urls: string[] = (body.urls ?? []).slice(0, 100);

  if (urls.length === 0) {
    return NextResponse.json({ error: 'No URLs provided' }, { status: 400 });
  }

  try {
    const res = await fetch(`${BASE}/check-index-task.php`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.neuralIndexerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ links: urls }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error ?? data?.message ?? `HTTP ${res.status}` },
        { status: res.status },
      );
    }

    // NeuralIndexer returns array of results: [{ url, indexed: bool, ... }]
    const results: Array<{ url: string; indexed: boolean }> = data?.results ?? data?.links ?? [];

    if (siteDbId && results.length > 0) {
      const now = new Date();
      await Promise.allSettled(
        results.map(r =>
          prisma.sitemapUrl.upsert({
            where: { siteId_url: { siteId: siteDbId, url: r.url } },
            create: {
              siteId: siteDbId,
              url: r.url,
              xrStatus: r.indexed ? 'indexed' : 'not_indexed',
              xrChecked: now,
            },
            update: {
              xrStatus: r.indexed ? 'indexed' : 'not_indexed',
              xrChecked: now,
            },
          }),
        ),
      );

      const checked = results.filter(r => r.indexed !== undefined).length;
      await prisma.indexingOperation.create({
        data: {
          siteId: siteDbId,
          type: 'xr_check',
          result: 'success',
          detail: `neural check: ${checked}`,
          urlCount: checked,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      results,
      checked: results.length,
      indexed: results.filter(r => r.indexed).length,
      charged: data?.charged_amount ?? null,
      balance: data?.balance_usd ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Request failed' }, { status: 500 });
  }
}
