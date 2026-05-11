import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { google } from 'googleapis';

const LANG = new Set(['el','de','fr','ru','en','es','it','pl','nl','pt','tr','ar','zh','bg','ro','cs','sk','hr','sr','uk','hu']);

function humanizeSlug(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
}

function makeOAuth2(account: { id: string; access_token: string | null; refresh_token: string | null; expires_at: number | null }) {
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });
  return oauth2;
}

async function queryGSC(
  accounts: { id: string; access_token: string | null; refresh_token: string | null; expires_at: number | null }[],
  siteUrl: string, startDate: string, endDate: string, dimension: string, rowLimit = 500
) {
  for (const account of accounts) {
    try {
      const oauth2 = makeOAuth2(account);
      const wm = google.webmasters({ version: 'v3', auth: oauth2 });
      const res = await wm.searchanalytics.query({
        siteUrl,
        requestBody: { startDate, endDate, dimensions: [dimension], rowLimit, dataState: 'final' },
      });
      return res.data.rows ?? [];
    } catch { continue; }
  }
  return [];
}

// ─── AI clustering via LLMs ───────────────────────────────────────────────
async function fetchLLM(prompt: string, provider?: string, apiKey?: string) {
  const p = provider || 'anthropic';
  const k = apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  console.log(`[Setup/LLM] provider=${p} keyLen=${k?.length ?? 0} keyPrefix=${k?.slice(0,12) ?? 'none'}`);
  if (!k) { console.log('[Setup/LLM] No API key — using algorithmic fallback'); return null; }

  try {
    let text = '';
    if (p === 'anthropic' || p === 'zai' || (!provider && k.startsWith('sk-ant'))) {
      const baseUrl = p === 'zai' ? 'https://api.z.ai/api/anthropic' : 'https://api.anthropic.com';
      const model   = p === 'zai' ? 'glm-4.5-air' : 'claude-haiku-4-5-20251001';
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.log(`[Setup/LLM] ${p} error ${res.status}: ${err}`);
        return null;
      }
      const data = await res.json();
      text = data.content?.[0]?.text ?? '';
    } else if (p === 'openai' || (!provider && k.startsWith('sk-'))) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      text = data.choices?.[0]?.message?.content ?? '';
    } else if (p === 'gemini' || (!provider && k.startsWith('AIza'))) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${k}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } else if (p === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'anthropic/claude-3.5-haiku', messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      text = data.choices?.[0]?.message?.content ?? '';
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function aiClusterQueries(queries: { label: string; impr: number }[], provider?: string, apiKey?: string) {
  if (queries.length === 0) return null;

  // Take top 200 by impressions for the prompt
  const top = queries.sort((a, b) => b.impr - a.impr).slice(0, 200);
  const queryList = top.map(q => `"${q.label}" [${q.impr} impr]`).join('\n');

  const prompt = `You are an SEO expert. Group these search queries into thematic topic clusters for SEO analysis.

Queries:
${queryList}

Return ONLY valid JSON, no explanation:
{
  "clusters": [
    {
      "name": "Cluster Name (English, max 5 words, descriptive)",
      "keywords": ["keyword1", "keyword2"]
    }
  ]
}

Rules:
- Create 6-14 clusters based on actual themes in the data
- Each cluster name should clearly describe the topic
- "keywords" should be the most representative 2-4 word phrases for that cluster (used for matching)
- Cover all major query groups, merge very small ones
- Respond with JSON only`;

  const parsed = await fetchLLM(prompt, provider, apiKey);
  if (!parsed) return null;

  return (parsed.clusters ?? []).map((c: any) => ({
    name: c.name,
    values: c.keywords ?? [],
    count: queries.filter(q => (c.keywords ?? []).some((kw: string) => q.label.toLowerCase().includes(kw.toLowerCase()))).length,
  }));
}

async function aiGroupPages(pages: { label: string; impr: number }[], domain: string, provider?: string, apiKey?: string) {
  if (pages.length === 0) return null;

  const top = pages.sort((a, b) => b.impr - a.impr).slice(0, 150);
  const pageList = top.map(p => p.label).join('\n');

  const prompt = `You are an SEO expert. Group these URLs into content groups for a website (${domain}).

URLs:
${pageList}

Return ONLY valid JSON, no explanation:
{
  "groups": [
    {
      "name": "Group Name (English, max 4 words)",
      "pattern": "/path-fragment",
      "type": "contains"
    }
  ]
}

Rules:
- Create 5-12 groups based on URL structure and content type
- Homepage: use type "equals" with the full URL
- Other groups: use type "contains" with a URL fragment that uniquely identifies the group
- "pattern" should be a short URL fragment (e.g. "/blog", "/airport-to-chalkidiki", "/prices")
- Group by service type, destination, content category etc.
- Respond with JSON only`;

  const parsed = await fetchLLM(prompt, provider, apiKey);
  if (!parsed) return null;

  return (parsed.groups ?? []).map((g: any) => ({
    name: g.name,
    values: [g.pattern],
    isEquals: g.type === 'equals',
    count: pages.filter(p => g.type === 'equals' ? p.label === g.pattern : p.label.includes(g.pattern)).length,
  }));
}

// ─── Algorithmic fallback ─────────────────────────────────────────────────────
const STOP = new Set(['the','a','an','to','from','in','at','for','with','how','what','where','when','near','me','my','on','of','by','is','are','and','or','but','not','no','best','top','cheap','good','great','new','old','get','all','this','that','its','i','you','we','they','he','she','it','can','do','did','does','will','was','were','be','been','being','have','has','had','vs','per']);

function algorithmicCluster(rows: { label: string; impr: number }[]) {
  const queries = rows.map(r => ({
    ...r,
    words: r.label.toLowerCase().split(/[\s,.()/]+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => w.length >= 3 && !STOP.has(w)),
  }));
  const wordImpr = new Map<string, number>();
  for (const q of queries) for (const w of q.words) wordImpr.set(w, (wordImpr.get(w) ?? 0) + q.impr);
  const seeds = [...wordImpr.entries()].filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0,14).map(([w]) => w);
  const clusters: { name: string; values: string[]; count: number }[] = [];
  const assigned = new Set<number>();
  for (const seed of seeds) {
    const matching = queries.map((q,i) => ({q,i})).filter(({q,i}) => !assigned.has(i) && q.words.includes(seed));
    if (matching.length < 2) continue;
    matching.forEach(({i}) => assigned.add(i));
    clusters.push({ name: humanizeSlug(seed), values: matching.sort((a,b) => b.q.impr-a.q.impr).slice(0,30).map(({q}) => q.label), count: matching.length });
  }
  const others = queries.filter((_,i) => !assigned.has(i));
  if (others.length >= 3) clusters.push({ name: 'Other Queries', values: others.slice(0,20).map(q=>q.label), count: others.length });
  return clusters.slice(0, 15);
}

function algorithmicGroupPages(rows: { label: string; impr: number }[], domain: string) {
  const pages = rows.map(r => {
    const path = r.label.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '').replace(/\/$/, '') || '/';
    const segs = path.split('/').filter(Boolean);
    const meaningful = segs.filter(s => !LANG.has(s.toLowerCase()));
    const seg = meaningful[0] || segs[0] || '';
    return { ...r, seg: seg.toLowerCase() };
  });
  const home = pages.filter(p => p.seg === '');
  const rest = pages.filter(p => p.seg !== '');
  const segMap = new Map<string, typeof rest>();
  for (const p of rest) { if (!segMap.has(p.seg)) segMap.set(p.seg, []); segMap.get(p.seg)!.push(p); }
  const groups: { name: string; values: string[]; count: number; isEquals?: boolean }[] = [];
  if (home.length > 0) groups.push({ name: 'Homepage', values: home.map(p => p.label), count: home.length, isEquals: true });
  [...segMap.entries()].map(([seg,ps]) => ({ seg, ps, impr: ps.reduce((s,p) => s+p.impr,0) }))
    .sort((a,b) => b.impr-a.impr).slice(0,14)
    .forEach(({ seg, ps }) => groups.push({ name: humanizeSlug(seg), values: [`/${seg}`], count: ps.length }));
  return groups;
}

// ─── POST /api/gsc/setup ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const dbSiteId: string = body.siteId;

  const site = await prisma.site.findFirst({ where: { id: dbSiteId, userId } });
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

  const accounts = await prisma.account.findMany({
    where: { userId, provider: 'google' },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true },
  });

  const end = new Date(); end.setDate(end.getDate() - 2);
  const start = new Date(end); start.setDate(end.getDate() - 89);
  const endStr   = end.toISOString().split('T')[0];
  const startStr = start.toISOString().split('T')[0];

  const [queryRows, pageRows] = await Promise.all([
    queryGSC(accounts, site.siteId, startStr, endStr, 'query', 500),
    queryGSC(accounts, site.siteId, startStr, endStr, 'page',  500),
  ]);

  const queries = queryRows.map(r => ({ label: r.keys?.[0] ?? '', impr: r.impressions ?? 0 }));
  const pages   = pageRows.map(r =>  ({ label: r.keys?.[0] ?? '', impr: r.impressions ?? 0 }));

  // Try AI first, fall back to algorithmic
  const aiProvider = body.aiProvider as string | undefined;
  const aiApiKey = body.aiApiKey as string | undefined;
  const hasApiKey = !!aiApiKey || !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY;
  
  const [aiClusters, aiGroups] = await Promise.all([
    aiClusterQueries(queries, aiProvider, aiApiKey),
    aiGroupPages(pages, site.url, aiProvider, aiApiKey),
  ]);

  const clusterDefs = aiClusters ?? algorithmicCluster(queries);
  const groupDefs   = aiGroups   ?? algorithmicGroupPages(pages, site.url);

  const clusters = clusterDefs.map((c: any) => ({
    name:  c.name,
    rules: JSON.stringify([{ type: 'contains', values: c.values }]),
    count: c.count,
    aiGenerated: !!aiClusters,
  }));

  const groups = groupDefs.map((g: any) => ({
    name:  g.name,
    rules: JSON.stringify([{ type: (g as any).isEquals ? 'equals' : 'contains', values: (g as any).values }]),
    count: g.count,
    aiGenerated: !!aiGroups,
  }));

  return NextResponse.json({ clusters, groups, hasApiKey });
}
