import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchLLM } from "@/lib/llm";
import { buildTextPrompt } from "@/lib/seo/prompts";

// POST /api/seo/text — generate final article text from an outline (spec §9.3)
// body: { outline, policy?, tone?, language?, custom?, aiProvider, aiApiKey, model? }
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

  const prompt = buildTextPrompt({
    outlineJson: b.outline,
    policy: b.policy,
    tone: String(b.tone ?? "neutral, expert"),
    language: String(b.language ?? "ru"),
    custom: b.custom ? String(b.custom) : undefined,
  });
  const model = b.model ? String(b.model) : undefined;

  const text = await fetchLLM(prompt, provider, apiKey, 8000, model);
  if (!text) return NextResponse.json({ error: "generation_failed" }, { status: 502 });

  return NextResponse.json({ text });
}
