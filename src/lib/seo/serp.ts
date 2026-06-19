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

  const body: Record<string, unknown> = {
    q: keyword,
    gl: opts.gl || "us",
    hl: opts.hl || "en",
    num: opts.num || 10,
  };
  if (opts.location) body.location = opts.location;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    return { engine, provider: "serper", keyword, results: [], error: `serper ${res.status}: ${await res.text()}` };
  }
  const data = await res.json();
  const organic: any[] = data.organic ?? [];
  const results: SerpResultItem[] = organic.slice(0, opts.num || 10).map((r, i) => ({
    position: r.position ?? i + 1,
    url: r.link,
    title: r.title ?? "",
    snippet: r.snippet ?? "",
    domain: domainOf(r.link ?? ""),
  }));
  const paa = (data.peopleAlsoAsk ?? []).map((p: any) => p.question).filter(Boolean);
  const related = (data.relatedSearches ?? []).map((p: any) => p.query).filter(Boolean);
  return { engine, provider: "serper", keyword, results, peopleAlsoAsk: paa, relatedSearches: related };
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
    return await serperSearch(apiKey, keyword, opts); // default: serper
  } catch (e: any) {
    return { engine: opts.engine ?? "google", provider, keyword, results: [], error: String(e?.message ?? e) };
  }
}

// ─── Cheap URL classifier (heuristics) ──────────────────────────────────────────
export type SiteType = "monobrand" | "aggregator" | "forum_ugc" | "editorial";

const AGGREGATOR_DOMAINS = ["rome2rio", "getyourguide", "tripadvisor", "booking", "expedia", "kayak", "holidaytaxis", "viator", "skyscanner", "yelp", "trustpilot"];
const FORUM_DOMAINS = ["reddit", "quora", "facebook", "stackexchange", "stackoverflow", "tripadvisor"];

export function heuristicSiteType(domain: string): SiteType | null {
  const d = domain.toLowerCase();
  if (FORUM_DOMAINS.some((x) => d.includes(x))) return "forum_ugc";
  if (AGGREGATOR_DOMAINS.some((x) => d.includes(x))) return "aggregator";
  return null; // unknown → let LLM decide, or default editorial
}
