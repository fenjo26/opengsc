import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function fetchLLM(prompt: string, provider: string, apiKey: string): Promise<string | null> {
  try {
    let text = '';
    if (provider === 'anthropic' || provider === 'zai') {
      const baseUrl = provider === 'zai' ? 'https://api.z.ai/api/anthropic' : 'https://api.anthropic.com';
      const model   = provider === 'zai' ? 'glm-4.5-air' : 'claude-haiku-4-5-20251001';
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 512, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error(`[Branded] ${provider} error:`, res.status, err);
        return null;
      }
      const data = await res.json();
      text = data.content?.[0]?.text ?? '';
    } else if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      text = data.choices?.[0]?.message?.content ?? '';
    } else if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } else if (provider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'anthropic/claude-3.5-haiku', messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      text = data.choices?.[0]?.message?.content ?? '';
    }
    return text;
  } catch (e) {
    console.error('[Branded] fetchLLM error:', e);
    return null;
  }
}

// GET /api/gsc/branded?siteId=  — returns saved keywords (+ AI suggest if ?suggest=1&aiProvider=&aiApiKey=)
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const siteId   = searchParams.get('siteId') ?? '';
  const suggest  = searchParams.get('suggest') === '1';
  const provider = searchParams.get('aiProvider') ?? 'anthropic';
  const apiKey   = searchParams.get('aiApiKey') ?? '';

  const site = await prisma.site.findFirst({ where: { id: siteId, userId } });
  if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Return saved keywords if not asking for suggestions
  if (!suggest) {
    const saved = site.brandedKeywords ? JSON.parse(site.brandedKeywords) as string[] : [];
    return NextResponse.json({ branded: saved, saved: true });
  }

  // AI suggestion mode
  const domainBrand = site.siteId
    .replace(/^https?:\/\//, '')
    .replace(/^sc-domain:/, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('.')[0]
    .toLowerCase();

  // Use AI if key provided
  if (apiKey) {
    // Get top queries from last 90 days from GSC accounts
    const accounts = await prisma.account.findMany({
      where: { userId, provider: 'google' },
      select: { id: true, access_token: true, refresh_token: true, expires_at: true },
    });

    const { google } = await import('googleapis');
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const end = new Date(); end.setDate(end.getDate() - 2);
    const startStr = since.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    let queryRows: any[] = [];
    for (const account of accounts) {
      try {
        const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
        oauth2.setCredentials({ access_token: account.access_token, refresh_token: account.refresh_token });
        const wm = google.webmasters({ version: 'v3', auth: oauth2 });
        const res = await wm.searchanalytics.query({
          siteUrl: site.siteId,
          requestBody: { startDate: startStr, endDate: endStr, dimensions: ['query'], rowLimit: 100, dataState: 'final' },
        });
        queryRows = res.data.rows ?? [];
        break;
      } catch { continue; }
    }

    const queries = queryRows.map(r => r.keys?.[0] ?? '').filter(Boolean);

    if (queries.length > 0) {
      const prompt = `You are an SEO expert. The website domain is "${domainBrand}".

Identify brand terms from these search queries (brand name, company name, branded product names):

${queries.slice(0, 80).map(q => `"${q}"`).join('\n')}

Return ONLY a JSON array of brand terms (lowercase, max 10), no explanation:
["brand1", "brand2"]

If no clear brand terms found, return: ["${domainBrand}"]`;

      const text = await fetchLLM(prompt, provider, apiKey);
      if (text) {
        const match = text.match(/\[[\s\S]*?\]/);
        if (match) {
          try {
            const branded = JSON.parse(match[0]) as string[];
            const unique = [...new Set([domainBrand, ...branded.map((b: string) => b.toLowerCase())])].slice(0, 15);
            return NextResponse.json({ branded: unique, aiGenerated: true });
          } catch {}
        }
      }
    }
  }

  return NextResponse.json({ branded: [domainBrand], aiGenerated: false });
}

// POST /api/gsc/branded — save branded keywords for a site
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { siteId, keywords } = body as { siteId: string; keywords: string[] };

  const site = await prisma.site.findFirst({ where: { id: siteId, userId } });
  if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.site.update({
    where: { id: siteId },
    data: { brandedKeywords: JSON.stringify(keywords) },
  });

  return NextResponse.json({ ok: true });
}
