import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchLLM } from "@/lib/llm";
import { runSerp } from "@/lib/seo/serp";
import { scrapeMany } from "@/lib/seo/scrape";
import { buildTextPrompt } from "@/lib/seo/prompts";

// POST /api/seo/text — generate final article text from an outline (spec §9.3)
// body: { outline, keyword?, policy?, tone?, language?, custom?, promptType?,
//         sourceMode?, serpProvider?, serpKey?, firecrawlKey?, scrapeCount?, aiProvider, aiApiKey, model? }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const b = await req.json();
  if (!b.outline) return NextResponse.json({ error: "no_outline" }, { status: 400 });

  const provider = String(b.aiProvider ?? "anthropic");
  const apiKey = String(b.aiApiKey ?? "");
  if (!apiKey) return NextResponse.json({ error: "no_ai_key" }, { status: 400 });

  const keyword = String(b.keyword ?? b.outline?.meta?.keyword ?? "");
  const sourceMode = (b.sourceMode === "facts" || b.sourceMode === "cited") ? b.sourceMode : "off";

  // Retrieval-augmented grounding: gather real sources for the keyword (opt-in)
  let sources: { title: string; snippet: string; url: string; domain: string }[] = [];
  if (sourceMode !== "off" && b.serpKey && keyword) {
    try {
      const serp = await runSerp(String(b.serpProvider || "serper"), String(b.serpKey), keyword, { gl: b.gl, hl: b.hl, num: 10, engine: "google" });
      const top = (serp.results || []).slice(0, Math.max(1, Math.min(10, Number(b.scrapeCount ?? 6))));
      let scraped: any[] = [];
      try { scraped = await scrapeMany(top.map(r => r.url), b.firecrawlKey ? String(b.firecrawlKey) : undefined, 4); } catch {}
      sources = top.map(r => {
        const sc = scraped.find(s => s.url === r.url);
        const ev = sc?.ok ? `${sc.metaDescription || ""} ${sc.textSample || ""}`.trim().slice(0, 1000) : "";
        return { title: r.title, url: r.url, domain: r.domain, snippet: ev || r.snippet };
      });
    } catch {}
  }

  const prompt = buildTextPrompt({
    outlineJson: b.outline,
    policy: b.policy,
    tone: String(b.tone ?? "neutral, expert"),
    language: String(b.language ?? "ru"),
    custom: b.custom ? String(b.custom) : undefined,
    promptType: b.promptType === "custom" ? "custom" : "service",
    sources,
    sourceMode,
  });
  const model = b.model ? String(b.model) : undefined;

  const text = await fetchLLM(prompt, provider, apiKey, 8000, model);
  if (!text) return NextResponse.json({ error: "generation_failed" }, { status: 502 });

  return NextResponse.json({ text, usedSources: sources.length });
}
