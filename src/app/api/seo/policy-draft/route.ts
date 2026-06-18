import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchLLM } from "@/lib/llm";
import { extractJson } from "@/lib/seo/prompts";

// POST /api/seo/policy-draft — AI-drafts an editorial policy from a niche/domain.
// body: { niche, domain?, language?, aiProvider, aiApiKey, model? }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const b = await req.json();
  const niche = String(b.niche ?? "").trim();
  if (!niche) return NextResponse.json({ error: "no_niche" }, { status: 400 });

  const provider = String(b.aiProvider ?? "anthropic");
  const apiKey = String(b.aiApiKey ?? "");
  if (!apiKey) return NextResponse.json({ error: "no_ai_key" }, { status: 400 });

  const prompt = `Ты — SEO-редактор. Составь черновик редакционной политики для ниши/проекта ниже. Верни СТРОГИЙ JSON по схеме, без преамбулы и markdown-обёрток.

Ниша/проект: ${niche}${b.domain ? `\nДомен: ${b.domain}` : ""}${b.language ? `\nЯзык контента: ${b.language}` : ""}

ВАЖНО: НЕ выдумывай лицензии/регалии — в compliance_requirements обязательно укажи правило ставить плейсхолдер под реальные данные.

Схема JSON:
{
  "name": "короткое имя политики",
  "brand": { "name": "", "url": "", "description": "чем занимается бренд", "values": "ценности через запятую", "competitors": ["конкурент1", "конкурент2"] },
  "audience": { "customerProfile": "кто читает — потребности и контекст", "expertiseLevel": "beginner|intermediate|expert", "industryNiche": "ниша" },
  "voice": { "authorPersona": "от чьего лица пишем", "toneOfVoice": "conversational|neutral|business|official", "formalityLevel": 50 },
  "structure": {
    "headingStyle": "questions|statements|how-to|mixed",
    "headingCapitalization": "sentence|title|upper",
    "paragraphLength": "short|medium|long",
    "elements": { "bold": true, "italics": false, "lists": true, "tables": true, "quotes": false, "examples": true, "images": false }
  },
  "quality": {
    "citationStyle": "inline|footnotes|none",
    "requireSourceLinks": true,
    "eeatRequirements": "как демонстрировать опыт/экспертизу",
    "factCheckingNotes": "требования к проверке фактов"
  },
  "restrictions": {
    "wordsToAvoid": "превосходные степени и пустые эпитеты через запятую",
    "topicsToAvoid": "",
    "complianceRequirements": "правило: не указывать несуществующие лицензии — плейсхолдер под ручное заполнение"
  },
  "variables": {}
}`;

  const model = b.model ? String(b.model) : undefined;
  let raw = await fetchLLM(prompt, provider, apiKey, 2000, model);
  let policy = extractJson(raw);
  if (!policy) {
    raw = await fetchLLM(prompt + "\n\nВерни ТОЛЬКО валидный JSON.", provider, apiKey, 2000, model);
    policy = extractJson(raw);
  }
  if (!policy) return NextResponse.json({ error: "parse_failed", raw }, { status: 502 });
  return NextResponse.json({ policy });
}
