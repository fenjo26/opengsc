// Competitor content scraper for the SEO Tools module.
// Strategy (per spec §2.2): direct fetch + regex H-structure extraction first,
// fall back to Firecrawl when direct fetch fails or returns too little (anti-bot pages).
// No third-party HTML-parsing deps — pure regex extraction.

export interface ScrapedPage {
  url: string;
  ok: boolean;
  via: "fetch" | "firecrawl" | "failed";
  title: string;
  metaDescription: string;
  headings: string[]; // ["H1: ...", "H2: ...", ...] in document order
  wordCount: number;
  hasPriceTable: boolean;
  hasFaq: boolean;
  textSample: string; // first ~6000 chars of body text (for the LLM grounding)
  error?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

// Parse an HTML string into a ScrapedPage. Shared by fetch + firecrawl paths.
export function parseHtml(url: string, html: string): ScrapedPage {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])) : "";

  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const metaDescription = descMatch ? decodeEntities(descMatch[1]) : "";

  const headings: string[] = [];
  const hRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = hRe.exec(html)) !== null) {
    const text = stripTags(m[2]);
    if (text) headings.push(`H${m[1]}: ${text}`);
    if (headings.length > 80) break;
  }

  const bodyText = stripTags(html);
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;

  const hasPriceTable =
    /<table[\s\S]*?(price|cost|€|\$|£|руб|tariff|rate)/i.test(html) ||
    /(price|cost|tariff)[\s\S]{0,40}<table/i.test(html);
  const hasFaq =
    /faq/i.test(html) ||
    /itemtype=["'][^"']*FAQPage/i.test(html) ||
    /frequently asked/i.test(bodyText);

  return {
    url,
    ok: true,
    via: "fetch",
    title,
    metaDescription,
    headings,
    wordCount,
    hasPriceTable,
    hasFaq,
    textSample: bodyText.slice(0, 6000),
  };
}

// ─── Heading structure extraction (Landing-flow "my page" import) ───────────────
// Splits the raw HTML between consecutive heading tags and counts words in each slice, so the
// UI can show "H2: ... (~120 сл.)" — a per-section word budget derived from the LIVE page, not
// a guess. Order = document order (same as parseHtml's `headings`, but with real per-section size).
export interface StructureNode { level: string; text: string; words: number; }

export function extractStructure(html: string): StructureNode[] {
  const marks: { level: string; text: string; start: number; end: number }[] = [];
  const hRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = hRe.exec(html)) !== null) {
    const text = stripTags(m[2]);
    if (text) marks.push({ level: `H${m[1]}`, text, start: m.index, end: m.index + m[0].length });
    if (marks.length > 150) break;
  }
  if (!marks.length) return [];
  return marks.map((h, i) => {
    const sliceEnd = i + 1 < marks.length ? marks[i + 1].start : html.length;
    const body = stripTags(html.slice(h.end, sliceEnd));
    const words = body ? body.split(/\s+/).filter(Boolean).length : 0;
    return { level: h.level, text: h.text, words };
  });
}

// Markdown fallback (Firecrawl returned no HTML, only markdown) — split on markdown heading lines.
function extractStructureFromMarkdown(md: string): StructureNode[] {
  const lines = md.split(/\r?\n/);
  const marks: { level: string; text: string; line: number }[] = [];
  lines.forEach((line, i) => {
    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) marks.push({ level: `H${hm[1].length}`, text: hm[2].trim(), line: i });
  });
  if (!marks.length) return [];
  return marks.map((h, i) => {
    const endLine = i + 1 < marks.length ? marks[i + 1].line : lines.length;
    const body = lines.slice(h.line + 1, endLine).join(" ").trim();
    const words = body ? body.split(/\s+/).filter(Boolean).length : 0;
    return { level: h.level, text: h.text, words };
  });
}

export interface StructureResult {
  url: string; ok: boolean; via: "fetch" | "firecrawl" | "failed";
  title: string; nodes: StructureNode[]; totalWords: number; error?: string;
}

// Fetch a single page (own site or competitor) and return its H1-H6 structure with a real
// per-section word count — used by the Landing-flow "under my page" import.
export async function scrapeStructure(url: string, firecrawlKey?: string): Promise<StructureResult> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const nodes = extractStructure(html);
    if (!nodes.length) throw new Error("no_headings");
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])) : "";
    return { url, ok: true, via: "fetch", title, nodes, totalWords: nodes.reduce((s, n) => s + n.words, 0) };
  } catch (e: any) {
    if (firecrawlKey) {
      try {
        const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url, formats: ["html", "markdown"], onlyMainContent: true }),
          signal: AbortSignal.timeout(45000),
        });
        if (!res.ok) throw new Error(`firecrawl ${res.status}`);
        const data = await res.json();
        const html: string = data?.data?.html ?? "";
        const md: string = data?.data?.markdown ?? "";
        const meta = data?.data?.metadata ?? {};
        const nodes = html ? extractStructure(html) : extractStructureFromMarkdown(md);
        if (!nodes.length) throw new Error("no_headings");
        return { url, ok: true, via: "firecrawl", title: meta.title || "", nodes, totalWords: nodes.reduce((s, n) => s + n.words, 0) };
      } catch (e2: any) {
        return { url, ok: false, via: "failed", title: "", nodes: [], totalWords: 0, error: `fetch:${e?.message}; firecrawl:${e2?.message}` };
      }
    }
    return { url, ok: false, via: "failed", title: "", nodes: [], totalWords: 0, error: e?.message ?? "fetch_failed" };
  }
}

async function directFetch(url: string): Promise<ScrapedPage> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const parsed = parseHtml(url, html);
  // Heuristic: anti-bot / empty pages → force fallback
  if (parsed.wordCount < 80 && parsed.headings.length === 0) {
    throw new Error("too_little_content");
  }
  return parsed;
}

// Firecrawl fallback. Docs: https://firecrawl.dev — returns clean markdown + html.
async function firecrawlFetch(url: string, apiKey: string): Promise<ScrapedPage> {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["html", "markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`firecrawl ${res.status}`);
  const data = await res.json();
  const html: string = data?.data?.html ?? "";
  const md: string = data?.data?.markdown ?? "";
  const meta = data?.data?.metadata ?? {};
  const parsed = html ? parseHtml(url, html) : {
    url, ok: true, via: "firecrawl" as const,
    title: meta.title ?? "", metaDescription: meta.description ?? "",
    headings: (md.match(/^#{1,6}\s.+$/gm) ?? []).map((h: string) => {
      const lvl = (h.match(/^#+/)?.[0].length) ?? 1;
      return `H${lvl}: ${h.replace(/^#+\s*/, "").trim()}`;
    }),
    wordCount: md ? md.split(/\s+/).length : 0,
    hasPriceTable: /\|.*(price|cost|€|\$|£|руб)/i.test(md),
    hasFaq: /faq|frequently asked/i.test(md),
    textSample: md.slice(0, 6000),
  };
  parsed.via = "firecrawl";
  parsed.title = parsed.title || meta.title || "";
  parsed.metaDescription = parsed.metaDescription || meta.description || "";
  return parsed;
}

export async function scrapePage(url: string, firecrawlKey?: string): Promise<ScrapedPage> {
  try {
    return await directFetch(url);
  } catch (e: any) {
    if (firecrawlKey) {
      try {
        return await firecrawlFetch(url, firecrawlKey);
      } catch (e2: any) {
        return failed(url, `fetch:${e?.message}; firecrawl:${e2?.message}`);
      }
    }
    return failed(url, e?.message ?? "fetch_failed");
  }
}

function failed(url: string, error: string): ScrapedPage {
  return {
    url, ok: false, via: "failed", title: "", metaDescription: "",
    headings: [], wordCount: 0, hasPriceTable: false, hasFaq: false,
    textSample: "", error,
  };
}

// Scrape many URLs with limited concurrency.
export async function scrapeMany(urls: string[], firecrawlKey?: string, concurrency = 4): Promise<ScrapedPage[]> {
  const out: ScrapedPage[] = [];
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const idx = i++;
      out[idx] = await scrapePage(urls[idx], firecrawlKey);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return out;
}
