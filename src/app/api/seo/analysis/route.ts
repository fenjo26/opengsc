import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchLLM } from "@/lib/llm";
import { buildAnalysisPrompt, extractJson, CompetitorInput } from "@/lib/seo/prompts";

// POST /api/seo/analysis
// body: { keyword, targetPage, competitors[], aiProvider, aiApiKey, model? }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const b = await req.json();
  const keyword = String(b.keyword ?? "").trim();
  if (!keyword) return NextResponse.json({ error: "no_keyword" }, { status: 400 });
  if (!b.targetPage) return NextResponse.json({ error: "no_target_page" }, { status: 400 });

  const provider = String(b.aiProvider ?? "anthropic");
  const apiKey = String(b.aiApiKey ?? "");
  if (!apiKey) return NextResponse.json({ error: "no_ai_key" }, { status: 400 });

  const competitors: CompetitorInput[] = Array.isArray(b.competitors) ? b.competitors : [];
  const prompt = buildAnalysisPrompt({ keyword, targetPage: b.targetPage, competitors });
  const model = b.model ? String(b.model) : undefined;

  let raw = await fetchLLM(prompt, provider, apiKey, 4000, model);
  let report = extractJson(raw);
  if (!report) {
    raw = await fetchLLM(
      prompt + "\n\nПредыдущий ответ не распарсился. Верни ТОЛЬКО валидный JSON.",
      provider, apiKey, 4000, model,
    );
    report = extractJson(raw);
  }

  if (!report) return NextResponse.json({ error: "parse_failed", raw }, { status: 502 });
  return NextResponse.json({ report });
}
