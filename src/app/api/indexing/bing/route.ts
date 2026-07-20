import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAuthOrShare } from "@/lib/authShare";
import { getOwnerEngineKey } from "@/lib/engineKeysServer";

// GET /api/indexing/bing?siteUrl=...&apiKey=...            (owner: key from browser)
//     /api/indexing/bing?siteUrl=...&siteId=...&shareToken=...  (guest: key resolved server-side)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const siteUrl = searchParams.get("siteUrl") || "";
  let apiKey = searchParams.get("apiKey") || "";
  const siteId = searchParams.get("siteId") || "";
  const shareToken = searchParams.get("shareToken") || "";

  // Authenticate as the logged-in owner OR via a valid share link for this site.
  const session = await getServerSession(authOptions);
  let ownerId = (session?.user as any)?.id as string | undefined;
  if (!ownerId && shareToken && siteId) {
    const auth = await verifyAuthOrShare(req, siteId);
    if (auth) ownerId = auth.userId;
  }
  if (!ownerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Guests (and owners who didn't pass a key) get the key resolved from the owner's saved settings.
  if (!apiKey && siteId) apiKey = await getOwnerEngineKey(ownerId, "bing", siteId);

  if (!siteUrl || !apiKey) {
    return NextResponse.json({ error: "Missing siteUrl or apiKey" }, { status: 400 });
  }

  const api = (method: string) =>
    `https://ssl.bing.com/webmaster/api.svc/json/${method}?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${encodeURIComponent(apiKey)}`;

  // Bing returns errors as HTTP 400 with { ErrorCode, Message } (e.g. InvalidApiKey,
  // InvalidSiteUrl). Surface them instead of silently returning empty data.
  async function bingErrorFrom(res: Response): Promise<string> {
    const raw = await res.text().catch(() => "");
    try {
      const j = JSON.parse(raw);
      const msg = j?.Message || j?.message || raw;
      // Friendlier hint for the most common cause (wrong key type / bad key).
      if (/invalidapikey/i.test(String(msg))) return "Bing: InvalidApiKey — check you pasted an API Key (Bing → Settings → API Access → API Key), not an OAuth Client ID.";
      if (/invalidsiteurl/i.test(String(msg))) return `Bing: InvalidSiteUrl — this exact URL (${siteUrl}) isn't a verified site in this Bing account.`;
      return `Bing ${res.status}: ${String(msg).slice(0, 200)}`;
    } catch {
      return `Bing ${res.status}: ${raw.slice(0, 200) || "request failed"}`;
    }
  }

  try {
    // 1. Get Rank and Traffic Stats (PRIMARY — its error is the whole call's error)
    const trafficRes = await fetch(api("GetRankAndTrafficStats"), { signal: AbortSignal.timeout(10000) });
    if (!trafficRes.ok) {
      return NextResponse.json({ error: await bingErrorFrom(trafficRes) }, { status: 200 });
    }
    const trafficData = (await trafficRes.json()).d || [];

    // 2. Get Query Stats (Top queries)
    const queryRes = await fetch(api("GetQueryStats"), { signal: AbortSignal.timeout(10000) });
    let queryData = null;
    if (queryRes.ok) {
      const json = await queryRes.json();
      queryData = json.d || [];
    }

    // 3. Top pages (GetPageStats) — best-effort, some accounts/sites don't expose it
    let pageData = null;
    try {
      const pageRes = await fetch(api("GetPageStats"), { signal: AbortSignal.timeout(10000) });
      if (pageRes.ok) pageData = (await pageRes.json()).d || [];
    } catch { /* optional */ }

    // 4. Crawl stats (pages in index, crawl errors) — best-effort
    let crawlData = null;
    try {
      const crawlRes = await fetch(api("GetCrawlStats"), { signal: AbortSignal.timeout(10000) });
      if (crawlRes.ok) {
        const arr = (await crawlRes.json()).d || [];
        crawlData = Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null; // latest day
      }
    } catch { /* optional */ }

    return NextResponse.json({
      traffic: trafficData,
      queries: queryData,
      pages: pageData,
      crawl: crawlData,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to query Bing Webmaster API" }, { status: 500 });
  }
}

// POST /api/indexing/bing -> Submit sitemap to Bing
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { siteUrl, sitemapUrl, apiKey } = body;

    if (!sitemapUrl) {
      return NextResponse.json({ error: "Missing sitemapUrl" }, { status: 400 });
    }

    // If API key is provided, use the Bing Webmaster API SubmitSitemap
    if (apiKey && siteUrl) {
      const url = `https://ssl.bing.com/webmaster/api.svc/json/SubmitSitemap?siteUrl=${encodeURIComponent(siteUrl)}&sitemapUrl=${encodeURIComponent(sitemapUrl)}&apikey=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        return NextResponse.json({ ok: true, method: "api" });
      }
    }

    // Fallback: standard HTTP ping (does not require API key)
    const pingUrl = `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
    const response = await fetch(pingUrl, { signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      return NextResponse.json({ ok: true, method: "ping" });
    }

    return NextResponse.json({ error: `Bing ping failed with status ${response.status}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unknown error" }, { status: 500 });
  }
}
