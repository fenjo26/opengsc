import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST { urls: string[] }
// Checks each URL's Google indexation status via XML River API.
// Returns { results: [{ url, indexed: bool, status: string }] }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xmlRiverUserId: true, xmlRiverApiKey: true },
  });

  if (!user?.xmlRiverUserId || !user?.xmlRiverApiKey) {
    return NextResponse.json({ error: 'XML River API not configured' }, { status: 400 });
  }

  const body = await req.json();
  const urls: string[] = (body.urls ?? []).slice(0, 50);

  if (urls.length === 0) {
    return NextResponse.json({ error: 'No URLs provided' }, { status: 400 });
  }

  const results: Array<{ url: string; indexed: boolean; status: string; error?: string }> = [];

  for (const url of urls) {
    try {
      const apiUrl = `https://xmlriver.com/search_console/json/?user=${encodeURIComponent(user.xmlRiverUserId)}&key=${encodeURIComponent(user.xmlRiverApiKey)}&url=${encodeURIComponent(url)}`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();

      if (data?.error) {
        results.push({ url, indexed: false, status: 'error', error: data.error });
        continue;
      }

      // XML River returns "content" field with indexation data
      // Typical response: { content: { indexed: true/false, ... } } or similar
      const indexed = !!(data?.content?.index === 'yes' || data?.indexed === true || data?.content?.indexed === true);
      const status = indexed ? 'Indexed' : 'Not indexed';

      results.push({ url, indexed, status });
    } catch (e: any) {
      results.push({ url, indexed: false, status: 'error', error: e?.message ?? 'Request failed' });
    }
  }

  return NextResponse.json({ results });
}
