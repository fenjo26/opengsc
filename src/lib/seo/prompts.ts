// Prompt builders for the SEO Tools module (spec §4 outline, §11 gap-report)
// plus a JSON extraction helper for parsing strict-JSON LLM responses.

import { renderPolicy, EditorialPolicy } from "./policy";

export interface CompetitorInput {
  position: number;
  url: string;
  site_type?: string;
  intent?: string;
  title: string;
  headings: string[];
  word_count: number;
  has_price_table: boolean;
  has_faq: boolean;
}

// ─── Outline generation prompt (spec §4.1) ──────────────────────────────────────
export function buildOutlinePrompt(args: {
  keyword: string;
  language: string;
  country: string;
  competitors: CompetitorInput[];
  policy?: EditorialPolicy;
  paa?: string[];
  related?: string[];
}): string {
  const policyBlock = args.policy ? renderPolicy(args.policy) + "\n\n" : "";
  const paaBlock = args.paa?.length ? `\nPeople-Also-Ask из выдачи: ${JSON.stringify(args.paa)}` : "";
  const relBlock = args.related?.length ? `\nСвязанные запросы: ${JSON.stringify(args.related)}` : "";

  return `${policyBlock}Ты — SEO-стратег, строящий структуру (outline) статьи на основе анализа топ-конкурентов из поисковой выдачи. Твоя задача — вернуть оптимальную структуру будущей статьи, которая полнее и полезнее конкурентов, в формате СТРОГОГО JSON без преамбулы и без markdown-обёрток.

ПРИНЦИПЫ:
- Структура должна ОТВЕЧАТЬ на реальные вопросы пользователей (sub-intents), а не лить воду.
- Каждой секции назначь реалистичный объём в словах — суммарно НЕ раздувай. Лучше плотно.
- Front-load: ключевой ответ (цена, время, расстояние) — в первых секциях, не в конце.
- Для коммерческих тем включи таблицу/сравнение всех вариантов — нейтрально, включая те, что автор не продаёт. Это повышает цитируемость в AI-поиске.
- НЕ выдумывай лицензии, сертификаты, регалии и отзывы. Поля authority оставляй пустыми.
- НЕ навязывай фейковый «личный опыт». Помечай секции флагом needs_real_experience=true, где личный опыт уместен.

ДАНО:
- keyword: ${args.keyword}
- язык/страна: ${args.language}/${args.country}${paaBlock}${relBlock}
- топ-конкуренты (с типами и структурой): ${JSON.stringify(args.competitors)}

ВЕРНИ JSON строго по схеме (только JSON, без обёрток):
{
  "meta": { "keyword": "", "title_options": ["", "", ""], "description_options": ["", ""], "target_word_count": 0 },
  "entities": [ { "name": "", "type": "" } ],
  "sub_intents": [ "" ],
  "sections": [ { "h_level": "H2", "heading": "", "word_count": [80,110], "key_point": "", "entities_to_cover": [""], "keywords": [""], "visual_elements": [""], "needs_real_experience": false, "notes": "" } ],
  "price_table_template": { "columns": [""], "rows": [ { } ] },
  "faq": [ { "question": "", "answer_guideline": "" } ],
  "authority_fields_to_fill_by_user": [ "" ]
}`;
}

// ─── Gap-report / content-analysis prompt (spec §11.2) ──────────────────────────
export function buildAnalysisPrompt(args: {
  keyword: string;
  targetPage: any;
  competitors: CompetitorInput[];
}): string {
  return `Ты — SEO-аналитик. Сравни целевую страницу с топ-конкурентами из выдачи и верни СТРОГИЙ JSON с пробелами и приоритизированными рекомендациями. Без преамбулы, без markdown-обёрток.

ЦЕЛЕВАЯ СТРАНИЦА:
${JSON.stringify(args.targetPage)}

КОНКУРЕНТЫ (топ выдачи, с типами):
${JSON.stringify(args.competitors)}

ПРОАНАЛИЗИРУЙ:
1. Темы/сущности/sub-intents, которые покрыты у конкурентов, но НЕ у целевой страницы.
2. Извлекаемые факты, которых не хватает целевой (цены по классам, время, расстояние) — именно их цитируют AI-движки.
3. Front-loading: стоит ли ключевой факт в первых секциях или закопан.
4. AI-видимость: какие источники из выдачи — агрегаторы и форумы (их цитирует AI)? Присутствует ли бренд во внешних источниках (consensus signal). Если бренд только на своём домене — это главный пробел для AI-поиска.
5. Качество: машинный перевод, вода, превосходные степени, ошибки.

НЕ предлагай выдумывать лицензии/отзывы/опыт. Рекомендации по authority — только через реальные данные.

ВЕРНИ JSON строго по схеме (только JSON):
{
  "target_url": "",
  "keyword": "",
  "summary": "",
  "content_gaps": [ { "type": "", "item": "", "priority": "high|medium|low" } ],
  "extractable_fact_gaps": [ { "fact": "", "competitor_has": "", "target_has": "", "priority": "", "fix": "" } ],
  "front_loading": { "issue": "", "priority": "" },
  "ai_visibility": { "cited_source_types_in_serp": [""], "brand_external_presence": "", "main_gap": "", "priority": "" },
  "quality_issues": [ { "issue": "", "priority": "" } ],
  "prioritized_actions": [ "" ]
}`;
}

// ─── Article text generation prompt (spec §9.3) ─────────────────────────────────
export function buildTextPrompt(args: {
  outlineJson: any;
  policy?: EditorialPolicy;
  tone: string;
  language: string;
  custom?: string;
}): string {
  const policyBlock = args.policy ? renderPolicy(args.policy) + "\n\n" : "";
  return `${policyBlock}Тон повествования: ${args.tone}
Язык вывода: ${args.language}
${args.custom ? args.custom + "\n" : ""}
Напиши статью строго по структуре ниже. Для каждой секции — текст в рамках указанного word_count, не раздувай. Используй key_point, keywords и notes как ориентир.

ЖЁСТКИЕ ПРАВИЛА:
- НЕ выдумывай лицензии, сертификаты, регалии, отзывы, цифры. Где они нужны — ставь плейсхолдер вида [ЗАПОЛНИТЬ ВРУЧНУЮ: ...].
- Секции с needs_real_experience=true: НЕ сочиняй личный опыт. Оставь [ВСТАВЬ РЕАЛЬНЫЙ ОПЫТ].
- Соблюдай ограничения из политики (banned_words, banned_topics, compliance).

Верни готовый текст в Markdown.

СТРУКТУРА (JSON):
${JSON.stringify(args.outlineJson)}`;
}

// ─── Strict-JSON extraction (spec §6) ───────────────────────────────────────────
// Strips ```json fences and grabs the outermost {...} before JSON.parse.
export function extractJson<T = any>(raw: string | null): T | null {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) return null;
  const candidate = s.slice(first, last + 1);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}
