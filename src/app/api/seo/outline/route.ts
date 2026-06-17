import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchLLM } from "@/lib/llm";
import { buildOutlinePrompt, extractJson, CompetitorInput } from "@/lib/seo/prompts";

// POST /api/seo/outline
// body: { keyword, language, country, competitors[], aiProvider, aiApiKey, model?, policy?, paa?, related? }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const b = await req.json();
  const keyword = String(b.keyword ?? "").trim();
  if (!keyword) return NextResponse.json({ error: "no_keyword" }, { status: 400 });

  const provider = String(b.aiProvider ?? "anthropic");
  const apiKey = String(b.aiApiKey ?? "");
  if (!apiKey) return NextResponse.json({ error: "no_ai_key" }, { status: 400 });

  const competitors: CompetitorInput[] = Array.isArray(b.competitors) ? b.competitors : [];

  const prompt = buildOutlinePrompt({
    keyword,
    language: String(b.language ?? "en"),
    country: String(b.country ?? "us"),
    competitors,
    policy: b.policy,
    paa: b.paa,
    related: b.related,
  });

  const model = b.model ? String(b.model) : undefined;

  let raw = await fetchLLM(prompt, provider, apiKey, 4000, model);
  let outline = extractJson(raw);

  // One retry on parse failure (spec §6)
  if (!outline) {
    raw = await fetchLLM(
      prompt + "\n\nПредыдущий ответ не распарсился. Верни ТОЛЬКО валидный JSON, без текста и без markdown-обёрток.",
      provider, apiKey, 4000, model,
    );
    outline = extractJson(raw);
  }

  if (!outline) {
    return NextResponse.json({ error: "parse_failed", raw }, { status: 502 });
  }

  return NextResponse.json({ outline });
}
