import { prisma } from '@/lib/prisma';

const CLARITY_API = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';

export type ClarityFetchResult =
  | { ok: true; snapshot: { fetchedAt: Date; periodDays: number; data: any } }
  | { ok: false; error: string; status: number; message?: string };

// Fetch fresh Clarity data for a site and store a snapshot. Shared by the API
// route (manual refresh) and the background scheduler (daily auto-collect).
// Keeps the most recent ~35 snapshots so a 30-day window can be aggregated.
export async function runClarityFetch(siteId: string, numOfDays = 1): Promise<ClarityFetchResult> {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) return { ok: false, error: 'not_found', status: 404 };
  const token = site.clarityToken;
  if (!token) return { ok: false, error: 'no_token', status: 400 };

  const days = Math.min(Math.max(Number(numOfDays) || 1, 1), 3);

  const [trafficRes, uxRes] = await Promise.all([
    fetch(`${CLARITY_API}?numOfDays=${days}&dimension1=URL`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    }),
    fetch(`${CLARITY_API}?numOfDays=${days}&dimension1=URL&dimension2=Device`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    }),
  ]);

  if (!trafficRes.ok) {
    const errText = await trafficRes.text().catch(() => '');
    if (trafficRes.status === 429) return { ok: false, error: 'rate_limit', status: 429, message: 'Clarity API limit reached (10 req/day)' };
    if (trafficRes.status === 401) return { ok: false, error: 'unauthorized', status: 401, message: 'Invalid Clarity API token' };
    return { ok: false, error: 'clarity_api_error', status: 502, message: errText };
  }

  const trafficData = await trafficRes.json();
  const uxData = uxRes.ok ? await uxRes.json() : [];
  const merged = { traffic: trafficData, ux: uxData, fetchedWith: { days } };

  await prisma.claritySnapshot.create({ data: { siteId, periodDays: days, data: JSON.stringify(merged) } });

  // Prune to the last 35 snapshots per site.
  const all = await prisma.claritySnapshot.findMany({
    where: { siteId }, orderBy: { fetchedAt: 'desc' }, select: { id: true },
  });
  if (all.length > 35) {
    await prisma.claritySnapshot.deleteMany({ where: { id: { in: all.slice(35).map((s: { id: string }) => s.id) } } });
  }

  return { ok: true, snapshot: { fetchedAt: new Date(), periodDays: days, data: merged } };
}
