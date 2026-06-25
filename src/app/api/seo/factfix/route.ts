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
  // Accept either plain strings or {claim,status,note} objects (note carries the correct value).
  const rawClaims: any[] = Array.isArray(b.claims) ? b.claims.slice(0, 40) : [];
  const claims = rawClaims.map((c) => typeof c === "string" ? { claim: c, status: "", note: "" } : { claim: String(c.claim ?? ""), status: String(c.status ?? ""), note: String(c.note ?? "") }).filter((c) => c.claim.trim());
  if (!article.trim()) return NextResponse.json({ error: "no_article" }, { status: 400 });
  if (!claims.length) return NextResponse.json({ text: article }); // nothing to fix

  const provider = String(b.aiProvider ?? "anthropic");
  const apiKey = String(b.aiApiKey ?? "");
  if (!apiKey) return NextResponse.json({ error: "no_ai_key" }, { status: 400 });

  const prompt = `Ты — фактчек-редактор. Ниже СТАТЬЯ (Markdown) и список ПРОБЛЕМНЫХ утверждений с пометками фактчека (note часто содержит ВЕРНОЕ значение из источника). Сделай текст ГОТОВЫМ К ПУБЛИКАЦИИ — пользователь НЕ должен ничего доправлять руками.

Для КАЖДОГО проблемного утверждения:
1. Если в note есть верное значение/данные из источника — ЗАМЕНИ неверное на верное прямо в тексте (например исправь цену/валюту/модель на источниковую).
2. Если источник противоречит — исправь по источнику.
3. Если подтвердить нечем — ПЕРЕФОРМУЛИРУЙ обобщённо, БЕЗ конкретной цифры/модели/даты (например «уточняйте актуальную цену в официальном магазине», «доступны разные комплекты»). Лучше убрать конкретику, чем оставить выдуманную.
ЗАПРЕЩЕНО: оставлять маркеры [ПРОВЕРИТЬ], плейсхолдеры, выдуманные числа/модели, или просьбы к читателю «проверить самому». Текст должен читаться как финальный.
- Таблицы/сравнения на выдуманных данных: исправь по источнику или убери непроверенные строки/столбцы.
- НЕ трогай подтверждённые и общеизвестные части. НЕ добавляй новых фактов. Сохрани структуру, ВСЕ заголовки (#/##/###), списки, таблицы и форматирование Markdown. Сохрани язык оригинала.
Верни ТОЛЬКО готовый Markdown статьи, без преамбулы.

ПРОБЛЕМНЫЕ УТВЕРЖДЕНИЯ (claim — note):
${claims.map((c, i) => `${i + 1}. ${c.claim}${c.note ? ` — note: ${c.note}` : ""}`).join("\n")}

СТАТЬЯ:
${article}`;

  const model = b.model ? String(b.model) : undefined;
  let text = await fetchLLM(prompt, provider, apiKey, 16000, model);
  if (!text) return NextResponse.json({ error: "fix_failed" }, { status: 502 });
  // Strip a possible ```markdown fence / leading preamble line the model may add.
  text = text.trim().replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  return NextResponse.json({ text });
}
