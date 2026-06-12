import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST { siteDbId: string, urls: string[] }
// Runs Google URL Inspection for each URL and persists results
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const siteDbId: string = body.siteDbId;
  const urls: string[] = body.urls ?? [];
  if (!siteDbId || urls.length === 0)
    return NextResponse.json({ error: 'siteDbId and urls required' }, { status: 400 });

  const site = await prisma.site.findFirst({
    where: { id: siteDbId, userId },
    select: { siteId: true },
  });
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  // Get a Google OAuth access token from the user's account
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
    select: { access_token: true },
  });
  if (!account?.access_token)
    return NextResponse.json({ error: 'No Google account connected' }, { status: 400 });

  let checked = 0;
  let errors = 0;
  const GSC_API = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

  for (const url of urls.slice(0, 200)) {
    try {
      const res = await fetch(GSC_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inspectionUrl: url, siteUrl: site.siteId }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) { errors++; continue; }

      const data = await res.json();
      const result = data?.inspectionResult;
      const indexStatus = result?.indexStatusResult;

      await prisma.sitemapUrl.upsert({
        where: { siteId_url: { siteId: siteDbId, url } },
        create: {
          siteId: siteDbId,
          url,
          googleStatus: indexStatus?.verdict ?? null,
          googleCoverage: indexStatus?.coverageState ?? null,
          googleReason: indexStatus?.indexingState ?? null,
          googleChecked: new Date(),
        },
        update: {
          googleStatus: indexStatus?.verdict ?? null,
          googleCoverage: indexStatus?.coverageState ?? null,
          googleReason: indexStatus?.indexingState ?? null,
          googleChecked: new Date(),
        },
      });
      checked++;

      // Small delay to avoid hitting rate limits (2000/day)
      await new Promise(r => setTimeout(r, 300));
    } catch {
      errors++;
    }
  }

  await prisma.indexingOperation.create({
    data: {
      siteId: siteDbId,
      type: 'google_check',
      result: errors > 0 ? 'partial' : 'success',
      detail: `checked: ${checked}, errors: ${errors}`,
      urlCount: checked,
    },
  });

  return NextResponse.json({ ok: true, checked, errors });
}
