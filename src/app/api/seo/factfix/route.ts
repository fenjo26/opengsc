import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchLLM } from "@/lib/llm";

// POST /api/seo/factfix — rewrite an article to remove/soften/flag unverified claims
// found by fact-check. body: { article, claims[], keyword?, aiProvider, aiApiKey, model? }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json();
  const article = String(b.article ?? "");
  const claims: string[] = Array.isArray(b.claims) ? b.claims.filter((c: any) => typeof c === "string" && c.trim()).slice(0, 40) : [];
  if (!article.trim()) return NextResponse.json({ error: "no_article" }, { status: 400 });
  if (!claims.length) return NextResponse.json({ text: article }); // nothing to fix

  const provider = String(b.aiProvider ?? "anthropic");
  const apiKey = String(b.aiApiKey ?? "");
  if (!apiKey) return NextResponse.json({ error: "no_ai_key" }, { status: 400 });

  const prompt = `Ты — строгий фактчек-редактор. Ниже СТАТЬЯ (Markdown) и СПИСОК НЕПОДТВЕРЖДЁННЫХ/спорных утверждений, выявленных проверкой по источникам. Перепиши статью так:
- Для КАЖДОГО неподтверждённого утверждения: убери его, ИЛИ обобщи без выдуманной конкретики (без точных цифр/моделей/цен/дат, которых нет в подтверждённых данных), ИЛИ пометь маркером [ПРОВЕРИТЬ: ...].
- Если на выдуманном факте построена таблица/сравнение — убери из неё непроверенные строки/столбцы или замени на обобщение; не оставляй таблиц целиком из выдуманных данных.
- НЕ добавляй новых фактов. НЕ трогай подтверждённые части. Сохрани структуру, ВСЕ заголовки (#/##/###), списки и общее форматирование Markdown. Сохрани язык оригинала.
Верни ТОЛЬКО переписанный Markdown статьи, без преамбулы.

НЕПОДТВЕРЖДЁННЫЕ УТВЕРЖДЕНИЯ:
${claims.map((c, i) => `${i + 1}. ${c}`).join("\n")}

СТАТЬЯ:
${article}`;

  const model = b.model ? String(b.model) : undefined;
  const text = await fetchLLM(prompt, provider, apiKey, 16000, model);
  if (!text) return NextResponse.json({ error: "fix_failed" }, { status: 502 });
  return NextResponse.json({ text });
}
