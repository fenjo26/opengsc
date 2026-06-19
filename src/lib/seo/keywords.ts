// Keywords Data via DataForSEO Labs (related keywords with search volume / CPC / competition).
// Used to ground the outline's per-section keywords in real demand.

export interface KwItem {
  keyword: string;
  volume: number;
  cpc: number;
  competition: number;        // 0..1
  competitionLevel?: string;  // LOW | MEDIUM | HIGH
}

// Country (gl) → DataForSEO location_code (subset; fallback US 2840).
const DFS_LOC: Record<string, number> = {
  us: 2840, gb: 2826, ca: 2124, au: 2036, de: 2276, fr: 2250, nl: 2528, it: 2380,
  es: 2724, pt: 2620, gr: 2300, pl: 2616, cz: 2203, ro: 2642, bg: 2100, tr: 2792,
  ua: 2804, ru: 2643, ae: 2784, in: 2356, br: 2076, mx: 2484, se: 2752, no: 2578,
  dk: 2208, fi: 2246, ch: 2756, at: 2040, be: 2056, ie: 2372, sg: 2702, jp: 2392,
};

function dfsAuth(cred: string): string {
  const c = (cred || "").trim();
  return c.includes(":") ? Buffer.from(c).toString("base64") : c;
}

// DataForSEO Labs: related keywords (single seed → related terms with volume).
export async function runRelatedKeywords(
  credential: string,
  keyword: string,
  opts: { gl?: string; hl?: string; limit?: number } = {},
): Promise<{ items: KwItem[]; error?: string }> {
  if (!credential || !keyword) return { items: [], error: "missing" };
  const body = [{
    keyword,
    language_code: opts.hl || "en",
    location_code: DFS_LOC[(opts.gl || "us").toLowerCase()] ?? 2840,
    depth: 2,
    limit: Math.max(10, Math.min(100, opts.limit || 60)),
    include_seed_keyword: true,
  }];

  let res: Response;
  try {
    res = await fetch("https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live", {
      method: "POST",
      headers: { Authorization: `Basic ${dfsAuth(credential)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
  } catch (e: any) {
    return { items: [], error: `сеть DataForSEO: ${e?.cause?.code || e?.cause?.message || e?.message || "fetch failed"}` };
  }
  if (!res.ok) return { items: [], error: `dataforseo ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const data = await res.json();
  if (data?.status_code && data.status_code !== 20000) return { items: [], error: `dataforseo ${data.status_code}: ${data.status_message}` };
  const taskObj = data?.tasks?.[0];
  if (taskObj?.status_code && taskObj.status_code !== 20000) return { items: [], error: `dataforseo task ${taskObj.status_code}: ${taskObj.status_message}` };

  const rawItems: any[] = taskObj?.result?.[0]?.items ?? [];
  const items: KwItem[] = rawItems.map((it) => {
    const kd = it.keyword_data ?? it;
    const info = kd.keyword_info ?? {};
    return {
      keyword: kd.keyword ?? "",
      volume: info.search_volume ?? 0,
      cpc: info.cpc ?? 0,
      competition: info.competition ?? 0,
      competitionLevel: info.competition_level,
    };
  }).filter((k) => k.keyword);

  // de-dupe + sort by volume desc
  const seen = new Set<string>();
  const dedup = items.filter((k) => { const key = k.keyword.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
  dedup.sort((a, b) => b.volume - a.volume);
  return { items: dedup };
}
