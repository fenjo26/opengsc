// Deterministic SERP intent/page-type analysis (Landing-flow "Анализ выдачи" block).
// No LLM call — the per-competitor heuristics (heuristicIntent/heuristicSiteType in serp.ts,
// already attached server-side by /api/seo/serp) are aggregated into a weighted majority.
// Dependency-free (no import from serp.ts) so it's safe to use from client components, and loose
// on the intent/site_type string types since callers often carry them as plain `string` from JSON.

export interface SerpIntentAnalysis { dominantIntent: "transactional" | "informational"; pageType: string; share: number; total: number; note: string; }

const PAGE_TYPE_LABEL: Record<string, string> = {
  official_store: "product_offer", aggregator: "aggregator_listing",
  forum_ugc: "ugc_thread", editorial: "guide", monobrand: "brand_page",
};

export function analyzeSerpIntent(results: { intent?: string; site_type?: string | null }[]): SerpIntentAnalysis | null {
  if (!results.length) return null;
  const buyShare = results.filter(r => r.intent === "buy").length / results.length;
  const dominantIntent: "transactional" | "informational" = buyShare >= 0.5 ? "transactional" : "informational";

  const counts: Record<string, number> = {};
  results.forEach(r => {
    const key = r.site_type ? (PAGE_TYPE_LABEL[r.site_type] || r.site_type) : null;
    if (key) counts[key] = (counts[key] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [pageType, count] = sorted[0] || [dominantIntent === "transactional" ? "product_offer" : "guide", 0];
  const share = Math.round((count / results.length) * 100);

  return {
    dominantIntent, pageType, share, total: results.length,
    note: `Build a ${pageType}; ${share}% weighted share of top-${results.length}.`,
  };
}
