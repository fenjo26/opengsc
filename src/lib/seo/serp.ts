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
// Docs: https://docs.dataforseo.com — SERP API (Live Advanced). Auth: Basic login:password.
// We accept the credential as "login:password" in a single key field.
async function dataForSeoSearch(
  credential: string,
  keyword: string,
  opts: { gl?: string; hl?: string; location?: string; num?: number; engine?: SerpEngine },
): Promise<SerpResponse> {
  const engine: SerpEngine = opts.engine ?? "google";
  const path = engine === "bing"
    ? "https://api.dataforseo.com/v3/serp/bing/organic/live/advanced"
    : "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";

  const auth = Buffer.from(credential).toString("base64");
  const task = [{
    keyword,
    language_code: opts.hl || "en",
    location_name: opts.location || undefined,
    location_code: !opts.location ? 2840 : undefined, // 2840 = United States
    depth: opts.num || 10,
  }];

  const res = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(task),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    return { engine, provider: "dataforseo", keyword, results: [], error: `dataforseo ${res.status}: ${await res.text()}` };
  }
  const data = await res.json();
  const items: any[] = data?.tasks?.[0]?.result?.[0]?.items ?? [];
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
