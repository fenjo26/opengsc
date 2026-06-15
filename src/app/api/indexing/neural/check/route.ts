import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const BASE = 'https://inderixingbot.com/api';

// POST { siteDbId: string, urls: string[] }
// 1. Schedules an index check via check-index-task.php (api_key in JSON body)
// 2. Polls GET /api/v2/checks/{id} until completed (up to ~30s)
// 3. Persists results to SitemapUrl
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

  const token = user.neuralIndexerToken;

  try {
    // Step 1: Schedule the check — api_key goes in JSON body, not query string
    const schedRes = await fetch(`${BASE}/check-index-task.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: token, links: urls }),
      signal: AbortSignal.timeout(15000),
    });

    const schedData = await schedRes.json().catch(() => ({}));

    // DEBUG: log full response so we can see the actual shape
    console.log('[neural/check] schedule response HTTP', schedRes.status, JSON.stringify(schedData));

    if (!schedRes.ok || schedData?.error) {
      return NextResponse.json(
        { error: schedData?.error ?? schedData?.message ?? `HTTP ${schedRes.status}`, debug: schedData },
        { status: schedRes.ok ? 400 : schedRes.status },
      );
    }

    // Response contains check_id like "m456"
    const checkId: string | undefined = schedData?.check_id ?? schedData?.id ?? schedData?.task_id;

    if (!checkId) {
      // Some accounts get sync results directly (no check_id)
      const results: Array<{ url: string; indexed: boolean }> = schedData?.results ?? schedData?.links ?? [];
      return NextResponse.json({
        ok: true,
        results,
        checked: results.length,
        indexed: results.filter(r => r.indexed).length,
        balance: schedData?.balance_usd ?? null,
        raw: schedData,
      });
    }

    // Step 2: Poll for results — check every 3s, up to 10 tries (~30s)
    let results: Array<{ url: string; indexed: boolean }> = [];
    let charged: number | null = null;
    let balance: number | null = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(r => setTimeout(r, 3000));

      const pollRes = await fetch(`${BASE}/v2/checks/${checkId}?results_per_page=1000`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });

      if (!pollRes.ok) {
        console.log('[neural/check] poll HTTP', pollRes.status, 'attempt', attempt);
        continue;
      }

      const pollData = await pollRes.json().catch(() => ({}));
      // check.status is the real status; top-level status is always "ok"
      const checkStatus: string = pollData?.check?.status ?? pollData?.status ?? '';
      const isReady: boolean = pollData?.check?.ready === true;
      console.log('[neural/check] poll attempt', attempt, 'checkStatus=', checkStatus, 'ready=', isReady, JSON.stringify(pollData).slice(0, 400));

      if (checkStatus === 'completed' || checkStatus === 'done' || isReady) {
        // Per-URL results are under pollData.check.results[]
        // Each item: { url, is_indexed, ... }
        const raw: Array<{ url?: string; link?: string; is_indexed?: boolean; indexed?: boolean }> =
          pollData?.check?.results ?? pollData?.results ?? pollData?.links ?? [];

        console.log('[neural/check] results count=', raw.length, 'sample=', JSON.stringify(raw[0]));

        results = raw.map(r => ({
          url: r.url ?? r.link ?? '',
          indexed: r.is_indexed ?? r.indexed ?? false,
        }));

        charged = pollData?.check?.charged_amount ?? pollData?.charged_amount ?? null;
        balance = pollData?.check?.balance_usd ?? pollData?.balance_usd ?? null;
        break;
      }

      if (checkStatus === 'failed' || checkStatus === 'error') {
        return NextResponse.json({ error: 'Check failed on NeuralIndexer side' }, { status: 502 });
      }
      // still pending — keep polling
    }

    // Step 3: Persist results to DB
    if (siteDbId && results.length > 0) {
      const now = new Date();
      await Promise.allSettled(
        results.map(r =>
          prisma.sitemapUrl.upsert({
            where: { siteId_url: { siteId: siteDbId, url: r.url } },
            create: {
              siteId: siteDbId,
              url: r.url,
              neuralStatus: r.indexed ? 'indexed' : 'not_indexed',
              neuralAt: now,
            },
            update: {
              neuralStatus: r.indexed ? 'indexed' : 'not_indexed',
              neuralAt: now,
            },
          }),
        ),
      );

      await prisma.indexingOperation.create({
        data: {
          siteId: siteDbId,
          type: 'xr_check',
          result: results.length > 0 ? 'success' : 'pending',
          detail: results.length > 0
            ? `neural check: ${results.filter(r => r.indexed).length}/${results.length} indexed`
            : `neural check queued: ${checkId}`,
          urlCount: results.length,
        },
      });
    }

    if (results.length === 0) {
      // Task created but still pending after 30s — not a failure
      return NextResponse.json({
        ok: true,
        pending: true,
        checkId,
        message: 'Check queued — NeuralIndexer is processing. Results may take a few minutes.',
        checked: 0,
        indexed: 0,
      });
    }

    return NextResponse.json({
      ok: true,
      results,
      checked: results.length,
      indexed: results.filter(r => r.indexed).length,
      charged,
      balance,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Request failed' }, { status: 500 });
  }
}
