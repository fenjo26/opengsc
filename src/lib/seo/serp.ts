// SERP provider abstraction for the SEO Tools module.
// Supports Serper.dev and DataForSEO (both Google and Bing engines).
// Keys are passed in from the client (stored in the browser, never on the server).

export type SerpEngine = "google" | "bing";

export interface SerpResultItem {
  position: number;
  url: string;
  title: string;
  snippet: string;
  domain: string;
}

export interface SerpResponse {
  engine: SerpEngine;
  provider: string;
  keyword: string;
  results: SerpResultItem[];
  // Extra SERP features useful for AI-visibility analysis
  peopleAlsoAsk?: string[];
  relatedSearches?: string[];
  error?: string;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// ─── Serper.dev ────────────────────────────────────────────────────────────────
// Docs: https://serper.dev — single POST, returns clean JSON. Cheap.
async function serperSearch(
  apiKey: string,
  keyword: string,
  opts: { gl?: string; hl?: string; location?: string; num?: number; engine?: SerpEngine },
): Promise<SerpResponse> {
  const engine: SerpEngine = opts.engine ?? "google";
  const endpoint = engine === "bing"
    ? "https://google.serper.dev/search" // Serper is Google-only; Bing falls back to google endpoint
    : "https://google.serper.dev/search";

  // Serper returns one Google page (~10 organic) per call and does NOT expand via `num`.
  // To honour Top N > 10 we paginate with the `page` param and merge (dedupe by URL).
  const want = opts.num || 10;
  const pages = Math.min(5, Math.max(1, Math.ceil(want / 10)));
  const seen = new Set<string>();
  const results: SerpResultItem[] = [];
  let paa: string[] = [];
  let related: string[] = [];

  for (let page = 1; page <= pages; page++) {
    const body: Record<string, unknown> = { q: keyword, gl: opts.gl || "us", hl: opts.hl || "en", num: 10, page };
    if (opts.location) body.location = opts.location;
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch (e: any) {
      if (page === 1) return { engine, provider: "serper", keyword, results: [], error: `сеть Serper: ${e?.cause?.code || e?.message || "fetch failed"}` };
      break;
    }
    if (!res.ok) {
      if (page === 1) return { engine, provider: "serper", keyword, results: [], error: `serper ${res.status}: ${(await res.text()).slice(0, 200)}` };
      break;
    }
    const data = await res.json();
    if (page === 1) {
      paa = (data.peopleAlsoAsk ?? []).map((p: any) => p.question).filter(Boolean);
      related = (data.relatedSearches ?? []).map((p: any) => p.query).filter(Boolean);
    }
    const organic: any[] = data.organic ?? [];
    for (const r of organic) {
      if (!r.link || seen.has(r.link)) continue;
      seen.add(r.link);
      results.push({ position: results.length + 1, url: r.link, title: r.title ?? "", snippet: r.snippet ?? "", domain: domainOf(r.link ?? "") });
    }
    if (organic.length < 10) break;     // Google has no further pages for this query
    if (results.length >= want) break;
  }

  return { engine, provider: "serper", keyword, results: results.slice(0, want), peopleAlsoAsk: paa, relatedSearches: related };
}

// ─── DataForSEO ──────────────────────────────────────────────────────────────
// Country (gl) → DataForSEO location_code (country-level). Free-text location_name is
// error-prone, so we use codes. Fallback = United States (2840).
const DFS_LOC: Record<string, number> = {
  us: 2840, gb: 2826, ca: 2124, au: 2036, nz: 2554, ie: 2372,
  de: 2276, fr: 2250, nl: 2528, be: 2056, ch: 2756, at: 2040,
  se: 2752, no: 2578, dk: 2208, fi: 2246, it: 2380, es: 2724, pt: 2620,
  gr: 2300, cy: 2196, pl: 2616, cz: 2203, sk: 2703, hu: 2348, ro: 2642, bg: 2100,
  hr: 2191, rs: 2688, ua: 2804, ru: 2643, tr: 2792, sg: 2702, hk: 2344, jp: 2392,
  kr: 2410, il: 2376, ae: 2784, sa: 2682, in: 2356, id: 2360, my: 2458, th: 2764,
  vn: 2704, ph: 2608, br: 2076, mx: 2484, ar: 2032, cl: 2152, co: 2170, za: 2710,
  eg: 2818, ma: 2504, ng: 2566, ge: 2268, kz: 2398, az: 2031, am: 2051,
};

// Docs: https://docs.dataforseo.com — SERP API (Live Advanced). Auth: HTTP Basic.
// Credential field accepts EITHER "login:password" OR the ready Base64 token from the dashboard.
async function dataForSeoSearch(
  credential: string,
  keyword: string,
  opts: { gl?: string; hl?: string; location?: string; num?: number; engine?: SerpEngine },
): Promise<SerpResponse> {
  const engine: SerpEngine = opts.engine ?? "google";
  const path = engine === "bing"
    ? "https://api.dataforseo.com/v3/serp/bing/organic/live/advanced"
    : "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";

  // "login:password" → base64; an already-base64 token → use as-is.
  const cred = (credential || "").trim();
  const auth = cred.includes(":") ? Buffer.from(cred).toString("base64") : cred;

  const task = [{
    keyword,
    language_code: opts.hl || "en",
    location_code: DFS_LOC[(opts.gl || "us").toLowerCase()] ?? 2840,
    depth: opts.num || 10,
  }];

  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify(task),
      signal: AbortSignal.timeout(45000),
    });
  } catch (e: any) {
    return { engine, provider: "dataforseo", keyword, results: [], error: `сеть DataForSEO: ${e?.cause?.code || e?.cause?.message || e?.message || "fetch failed"}` };
  }
  if (!res.ok) {
    return { engine, provider: "dataforseo", keyword, results: [], error: `dataforseo ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  const data = await res.json();
  if (data?.status_code && data.status_code !== 20000) {
    return { engine, provider: "dataforseo", keyword, results: [], error: `dataforseo ${data.status_code}: ${data.status_message}` };
  }
  const taskObj = data?.tasks?.[0];
  if (taskObj?.status_code && taskObj.status_code !== 20000) {
    return { engine, provider: "dataforseo", keyword, results: [], error: `dataforseo task ${taskObj.status_code}: ${taskObj.status_message}` };
  }
  const items: any[] = taskObj?.result?.[0]?.items ?? [];
  const organic = items.filter((it) => it.type === "organic");
  const results: SerpResultItem[] = organic.slice(0, opts.num || 10).map((r, i) => ({
    position: r.rank_absolute ?? r.rank_group ?? i + 1,
    url: r.url,
    title: r.title ?? "",
    snippet: r.description ?? "",
    domain: domainOf(r.url ?? ""),
  }));
  const paa = items.filter((it) => it.type === "people_also_ask")
    .flatMap((it) => (it.items ?? []).map((q: any) => q.title)).filter(Boolean);
  const related = items.filter((it) => it.type === "related_searches")
    .flatMap((it) => it.items ?? []).filter(Boolean);
  return { engine, provider: "dataforseo", keyword, results, peopleAlsoAsk: paa, relatedSearches: related };
}

// ─── ScrapingRobot ───────────────────────────────────────────────────────────
// Free tier: 5000 scrapes/month (the same provider SerpBear uses for its free mode).
// Returns raw Google SERP HTML — we extract organic results with tolerant regexes.

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).trim();
}

const GOOGLE_INTERNAL = /(^|\.)google\.[a-z.]+$|(^|\.)(gstatic|googleusercontent|youtube)\.com$/;

// Extract organic results from a Google SERP HTML page (both classic non-JS layout
// with /url?q= anchors and the h3-inside-anchor desktop layout).
export function parseGoogleHtml(html: string): { url: string; title: string }[] {
  const out: { url: string; title: string }[] = [];
  const seen = new Set<string>();
  const push = (url: string, title: string) => {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      if (GOOGLE_INTERNAL.test(host)) return;
      if (seen.has(u.origin + u.pathname)) return;
      seen.add(u.origin + u.pathname);
      out.push({ url, title });
    } catch { /* skip malformed */ }
  };

  // Layout A: <a href="https://..."> … <h3>Title</h3>
  const reH3 = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>[\s\S]{0,400}?<h3[^>]*>([\s\S]*?)<\/h3>/g;
  let m: RegExpExecArray | null;
  while ((m = reH3.exec(html)) !== null) push(decodeEntities(m[1]), stripTags(m[2]));

  // Layout B (non-JS): <a href="/url?q=https://...&sa=...">Title</a>
  const reQ = /<a[^>]+href="\/url\?q=(https?:\/\/[^"&]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  while ((m = reQ.exec(html)) !== null) {
    const title = stripTags(m[2]);
    if (title.length < 3) continue;
    push(decodeURIComponent(decodeEntities(m[1])), title);
  }
  return out;
}

async function scrapingRobotSearch(
  apiKey: string,
  keyword: string,
  opts: { gl?: string; hl?: string; location?: string; num?: number; engine?: SerpEngine },
): Promise<SerpResponse> {
  const engine: SerpEngine = "google"; // ScrapingRobot path supports Google only
  const want = opts.num || 10;
  const pages = Math.min(5, Math.max(1, Math.ceil(want / 10)));
  const results: SerpResultItem[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < pages; page++) {
    const gUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=${opts.hl || "en"}&gl=${opts.gl || "us"}&num=10${page > 0 ? `&start=${page * 10}` : ""}`;
    const api = `https://api.scrapingrobot.com/?token=${encodeURIComponent(apiKey)}&proxyCountry=${(opts.gl || "us").toUpperCase()}&render=false&url=${encodeURIComponent(gUrl)}`;
    let res: Response;
    try {
      res = await fetch(api, { method: "GET", signal: AbortSignal.timeout(60000) });
    } catch (e: any) {
      if (page === 0) return { engine, provider: "scrapingrobot", keyword, results: [], error: `сеть ScrapingRobot: ${e?.cause?.code || e?.message || "fetch failed"}` };
      break;
    }
    if (!res.ok) {
      if (page === 0) return { engine, provider: "scrapingrobot", keyword, results: [], error: `scrapingrobot ${res.status}: ${(await res.text()).slice(0, 200)}` };
      break;
    }
    let html = "";
    try {
      const data = await res.json();
      if (data?.status && String(data.status).toUpperCase() !== "SUCCESS") {
        if (page === 0) return { engine, provider: "scrapingrobot", keyword, results: [], error: `scrapingrobot: ${data?.error || data.status}` };
        break;
      }
      html = typeof data?.result === "string" ? data.result : (data?.result?.content ?? "");
    } catch {
      html = ""; // non-JSON response — treat as empty page
    }
    const parsed = parseGoogleHtml(html);
    for (const r of parsed) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      results.push({ position: results.length + 1, url: r.url, title: r.title, snippet: "", domain: domainOf(r.url) });
    }
    if (parsed.length === 0) break;      // empty/last page
    if (results.length >= want) break;
  }

  return { engine, provider: "scrapingrobot", keyword, results: results.slice(0, want) };
}

export async function runSerp(
  provider: string,
  apiKey: string,
  keyword: string,
  opts: { gl?: string; hl?: string; location?: string; num?: number; engine?: SerpEngine } = {},
): Promise<SerpResponse> {
  if (!apiKey) {
    return { engine: opts.engine ?? "google", provider, keyword, results: [], error: "no_serp_key" };
  }
  try {
    if (provider === "dataforseo") return await dataForSeoSearch(apiKey, keyword, opts);
    if (provider === "scrapingrobot") return await scrapingRobotSearch(apiKey, keyword, opts);
    return await serperSearch(apiKey, keyword, opts); // default: serper
  } catch (e: any) {
    return { engine: opts.engine ?? "google", provider, keyword, results: [], error: String(e?.message ?? e) };
  }
}

// ─── Cheap URL classifier (heuristics) ──────────────────────────────────────────
export type SiteType = "monobrand" | "aggregator" | "forum_ugc" | "editorial" | "official_store";
export type SerpIntent = "buy" | "info" | "review" | "listicle" | "use_case";

const AGGREGATOR_DOMAINS = ["rome2rio", "getyourguide", "tripadvisor", "booking", "expedia", "kayak", "holidaytaxis", "viator", "skyscanner", "yelp", "trustpilot",
  "amazon", "ebay", "aliexpress", "walmart", "skroutz", "ubuy", "etsy", "bestbuy", "newegg", "idealo", "pricerunner", "google.com/shopping"];
const FORUM_DOMAINS = ["reddit", "quora", "facebook", "stackexchange", "stackoverflow", "tripadvisor"];
const STORE_SIGNALS = ["/store", "/shop", "/buy", "/eshop", "/product", "/products", "/cart", "/checkout", "/p/", "official", "online-store"];

export function heuristicSiteType(domain: string, url?: string, title?: string): SiteType | null {
  const d = domain.toLowerCase();
  const hay = `${url || ""} ${title || ""}`.toLowerCase();
  if (FORUM_DOMAINS.some((x) => d.includes(x))) return "forum_ugc";
  if (AGGREGATOR_DOMAINS.some((x) => d.includes(x))) return "aggregator";
  // Official brand store: store-like URL/title on a non-marketplace domain.
  if (STORE_SIGNALS.some((x) => hay.includes(x))) return "official_store";
  return null; // unknown → let LLM decide, or default editorial
}

// Page intent from URL/title signals: review / listicle (top-N roundup) / buy / use_case / info.
export function heuristicIntent(url?: string, title?: string): SerpIntent {
  const hay = `${url || ""} ${title || ""}`.toLowerCase();
  if (/\b(review|reviews|rating|ratings|обзор|огляд|отзыв|відгук)\b|\/review/.test(hay)) return "review";
  if (/\btop[\s-]?\d+|\b\d+\s+(best|top)\b|\bbest\b.+\b(sites?|casinos?|apps?|tools?|services?|platforms?|bookmakers?|brokers?|hosts?)\b|\branking(s)?\b|\bлучшие\b|\bнайкращі\b/.test(hay)) return "listicle";
  if (/\b(buy|shop|store|price|cost|order|cart|checkout|eshop|deal|discount|coupon|for sale|product)\b|\/p\/|\/product/.test(hay)) return "buy";
  if (/\bhow to\b|\bguide\b|\btutorial\b|\bкак\b|\bяк\b|\bчто такое\b|\bщо таке\b/.test(hay)) return "info";
  return "use_case";
}
