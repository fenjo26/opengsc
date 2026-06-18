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

// ─── Outline generation prompt (rich, EAV-style — spec §4 + reference parity) ─────
export function buildOutlinePrompt(args: {
  keyword: string;
  language: string;
  country: string;
  competitors: CompetitorInput[];
  policy?: EditorialPolicy;
  paa?: string[];
  related?: string[];
  tone?: string;
  persona?: string;
  additionalKeywords?: string;
  targetWordCount?: number;
  manualTexts?: { name: string; text: string }[];
}): string {
  const policyBlock = args.policy ? renderPolicy(args.policy) + "\n\n" : "";
  const paaBlock = args.paa?.length ? `\nPeople-Also-Ask из выдачи: ${JSON.stringify(args.paa)}` : "";
  const relBlock = args.related?.length ? `\nСвязанные запросы: ${JSON.stringify(args.related)}` : "";
  const toneBlock = args.tone ? `\n- тон повествования: ${args.tone}` : "";
  const personaBlock = args.persona ? `\n- от лица: ${args.persona}` : "";
  const addKw = args.additionalKeywords?.trim() ? `\n- доп. ключевые слова (обязательно учесть): ${args.additionalKeywords}` : "";
  const twc = args.targetWordCount ? `\n- целевой объём статьи: ~${args.targetWordCount} слов (распредели по секциям, не раздувай)` : "";
  const manual = args.manualTexts?.length
    ? `\n- ручные тексты конкурентов (скрейп не справился): ${JSON.stringify(args.manualTexts.map(m => ({ name: m.name, text: m.text.slice(0, 6000) })))}`
    : "";

  return `${policyBlock}Ты — SEO-стратег и entity-аналитик. На основе анализа топ-конкурентов из выдачи построй ИСЧЕРПЫВАЮЩУЮ структуру статьи (outline) в EAV-модели (Entity-Attribute-Value), которая полнее и авторитетнее конкурентов и максимально цитируема в ИИ-поиске. Верни СТРОГИЙ JSON без преамбулы и без markdown-обёрток.

ПРИНЦИПЫ:
- Структура отвечает на реальные sub-intents пользователей; front-load ключевые факты (цена/время/расстояние) в первые секции.
- Для каждой секции укажи сущности с весом важности 1-10, ключи, краткое summary, визуальные элементы, заметки копирайтеру и связи сущностей (триплеты subject→predicate→object со strength 1-10).
- Веса [10] — самые важные сущности темы, [5-7] — поддерживающие/географические.
- Для коммерческих тем — нейтральное сравнение ВСЕХ вариантов (включая те, что автор не продаёт).
- НЕ выдумывай лицензии/регалии/отзывы. Помечай секции needs_real_experience=true, где уместен реальный личный опыт (не выдуманный).

ДАНО:
- keyword: ${args.keyword}
- язык/страна: ${args.language}/${args.country}${toneBlock}${personaBlock}${addKw}${twc}${paaBlock}${relBlock}
- топ-конкуренты (типы + структура): ${JSON.stringify(args.competitors)}${manual}

ВЕРНИ JSON строго по схеме (только JSON):
{
  "meta": { "keyword": "", "title_options": ["","",""], "description_options": ["",""], "target_word_count": 0, "dominant_intent": "", "tone": "", "persona": "" },
  "entities": [ { "name": "", "type": "Place|Service|Vehicle Type|Company|Transport Mode|Concept", "weight": 10, "attributes": { "Attr_Name": "Value" }, "relationship_triplets": ["Subject → predicate → Object [9]"] } ],
  "sub_intents": [ { "intent": "", "section": "H3 ...", "coverage": "как раскрыть", "word_count": "100+", "entities": [""] } ],
  "sections": [ {
    "h_level": "H2",
    "heading": "",
    "word_count_total": [130,160],
    "word_count_self": [60,80],
    "entities_to_cover": [ { "name": "", "weight": 10 } ],
    "keywords": [""],
    "summary": "",
    "visual_elements": [ { "type": "table|infographic|list|checklist|flowchart", "title": "", "description": "" } ],
    "copywriter_notes": "",
    "entity_connections": [ { "subject": "", "predicate": "", "object": "", "strength": 10 } ],
    "needs_real_experience": false
  } ],
  "faq": [ { "question": "", "answer_guideline": "40-60 слов, конкретно" } ],
  "entity_analysis": {
    "content_strategy": {
      "structure_advantages": ["оптимальный поток секций","визуальная стратегия","стратегия цитирования авторитетов"],
      "entity_advantages": ["уникальные комбинации сущностей","глубокое покрытие атрибутов","сильные сигналы авторитетности","маппинг связей"],
      "structure_superiority": ["прямой ответ на интент","системное покрытие","логичный поток","интеграция авторитета"],
      "authority_signals": ["верификационные бейджи","официальная инфо о маршруте","выдержки из отзывов"]
    },
    "primary_entity": { "name": "", "attributes": { "Attr_Name": "Value" }, "relationship_triplets": ["Subject → predicate → Object [10]"], "authority_validation": "лицензии/инспекции/сертификаты — реальные или плейсхолдер" },
    "supporting_entities": [ { "name": "", "attributes": { "Attr": "Value" }, "relationship_to_primary": "Entity → predicate → Primary", "content_integration": "в каких секциях раскрывается" } ],
    "keyword_strategy": {
      "primary": [ { "keyword": "", "usage": "как и сколько раз вплести через атрибуты сущности" } ],
      "lsi": [ { "keyword": "", "usage": "через значения атрибутов" } ],
      "long_tail": [ { "keyword": "", "usage": "через предикаты связей" } ]
    },
    "visual_elements": [ { "name": "", "purpose": "", "eav_data": "какие атрибуты визуализируются", "prompt": "промпт для генерации этого визуала" } ]
  },
  "price_table_template": { "columns": [""], "rows": [ {} ] },
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
  promptType?: "service" | "custom";
  sources?: { title: string; snippet: string; url: string; domain: string }[];
  sourceMode?: "off" | "facts" | "cited";
}): string {
  const policyBlock = args.policy ? renderPolicy(args.policy) + "\n\n" : "";
  const customLine = args.custom ? `Дополнительная инструкция автора (учесть обязательно): ${args.custom}\n` : "";

  // Real-source grounding (retrieval-augmented). Two modes:
  //  - facts: use real numbers but NEVER name/link competitors (for commercial/own-brand pages)
  //  - cited: use real numbers and add [text](url) links to sources (for informational/affiliate)
  const srcs = args.sources || [];
  let sourcesBlock = "";
  if (srcs.length && (args.sourceMode === "facts" || args.sourceMode === "cited")) {
    const list = srcs.map((s, i) => `[${i + 1}] ${s.title} — ${s.snippet} (${s.url})`).join("\n");
    if (args.sourceMode === "facts") {
      sourcesBlock = `\nДАННЫЕ ИЗ ИСТОЧНИКОВ (используй для КОНКРЕТНЫХ цифр: цены, время, расстояния, расписания):\n${list}\nПРАВИЛО ПО ИСТОЧНИКАМ: бери реальные цифры из данных выше, НО НЕ упоминай названия компаний/конкурентов и НЕ ставь на них ссылки. Подавай цифры как собственную проверенную информацию. Если данные расходятся — давай диапазон.\n`;
    } else {
      sourcesBlock = `\nИСТОЧНИКИ (используй реальные цифры; где уместно — ставь ссылку в формате [текст](url) на источник):\n${list}\nПРАВИЛО: используй конкретные цифры из источников; не выдумывай URL — бери только из списка выше.\n`;
    }
  }

  // Custom prompt type: the author's instruction drives the writing; service template is minimal.
  if (args.promptType === "custom" && args.custom) {
    return `${policyBlock}Тон повествования: ${args.tone}
Язык вывода: ${args.language}

ГЛАВНАЯ ИНСТРУКЦИЯ АВТОРА:
${args.custom}
${sourcesBlock}
Напиши статью по структуре ниже, следуя инструкции автора выше. Соблюдай word_count секций.
ЖЁСТКИЕ ПРАВИЛА: где нет реальных данных — не выдумывай лицензии/регалии/отзывы, ставь плейсхолдер [ЗАПОЛНИТЬ ВРУЧНУЮ: ...]; секции needs_real_experience=true — оставь [ВСТАВЬ РЕАЛЬНЫЙ ОПЫТ]; соблюдай ограничения политики.
Верни готовый текст в Markdown.

СТРУКТУРА (JSON):
${JSON.stringify(args.outlineJson)}`;
  }

  return `${policyBlock}Тон повествования: ${args.tone}
Язык вывода: ${args.language}
${customLine}${sourcesBlock}
Напиши статью строго по структуре ниже. Для каждой секции — текст в рамках указанного word_count, не раздувай. Используй summary, keywords, entities_to_cover и copywriter_notes как ориентир. Естественно вплетай сущности и ключи.

ЖЁСТКИЕ ПРАВИЛА:
- Где НЕТ реальных данных из источников — НЕ выдумывай лицензии, сертификаты, регалии, отзывы, цифры. Ставь плейсхолдер вида [ЗАПОЛНИТЬ ВРУЧНУЮ: ...].
- Секции с needs_real_experience=true: НЕ сочиняй личный опыт. Оставь [ВСТАВЬ РЕАЛЬНЫЙ ОПЫТ].
- Соблюдай ограничения из политики (banned_words, banned_topics, compliance).

Верни готовый текст в Markdown.

СТРУКТУРА (JSON):
${JSON.stringify(args.outlineJson)}`;
}

// ─── Per-section fact-check against real sources ─────────────────────────────────
export function buildFactCheckSectionPrompt(args: { heading: string; text: string; keyword: string; sources: { title: string; snippet: string; url: string }[] }): string {
  const src = args.sources.length
    ? args.sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.snippet} (${s.url})`).join("\n")
    : "(источников нет — оцени уверенностью модели)";
  return `Ты — фактчекер. Проверь конкретные ПРОВЕРЯЕМЫЕ утверждения (цифры, расстояния, цены, время, расписания, факты) из секции "${args.heading}" статьи по теме "${args.keyword}". Опирайся на пронумерованные источники ниже. Для каждого факта статус: confirmed (подтверждается источниками), partial (частично/данные расходятся), unconfirmed (нет подтверждения/противоречит). В поле "sources" укажи номера источников, которые подтверждают факт. НЕ выдумывай источники и номера, которых нет. Верни СТРОГИЙ JSON без обёрток:
{ "status": "confirmed|partial|unconfirmed", "facts": [ { "claim": "конкретное утверждение", "status": "confirmed|partial|unconfirmed", "note": "кратко", "sources": [1,2] } ] }

СЕКЦИЯ:
${args.text.slice(0, 6000)}

ИСТОЧНИКИ:
${src}`;
}

// ─── Image-prompt generation (Hero + per-section) ────────────────────────────────
export function buildImagePromptsPrompt(args: { outlineJson?: any; article?: string; keyword: string }): string {
  const src = args.outlineJson ? `СТРУКТУРА (JSON):\n${JSON.stringify(args.outlineJson)}` : `СТАТЬЯ:\n${(args.article || "").slice(0, 12000)}`;
  return `Ты — арт-директор. По теме "${args.keyword}" составь промпты для генерации изображений к статье: один Hero Image и по одному промпту к ключевым секциям (visual_elements/важные H2). Промпты — на английском, конкретные, фотореалистичные или чистый flat-design инфографики, без текста на картинке. Верни СТРОГИЙ JSON без обёрток:
{
  "hero": "english image prompt",
  "sections": [ { "heading": "section heading", "prompt": "english image prompt" } ]
}

${src}`;
}

// Deterministic safety net: enforce link policy on generated text.
// - facts mode → strip ALL markdown links (keep anchor text)
// - any mode → strip links whose URL or anchor contains a banned word/topic token
export function enforceLinkPolicy(text: string, bannedTokens: string[], sourceMode?: "off" | "facts" | "cited"): string {
  if (!text) return text;
  const tokens = (bannedTokens || []).map(t => t.trim().toLowerCase()).filter(t => t.length > 1);
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, anchor, url) => {
    if (sourceMode === "facts") return anchor; // facts mode must not carry links
    const hay = `${anchor} ${url}`.toLowerCase();
    return tokens.some(tok => hay.includes(tok)) ? anchor : full;
  });
}

// Hard redaction: replace banned words/topics in prose with a neutral placeholder […].
// Aggressive — can affect phrasing, so it's opt-in. Returns count for a "check these" notice.
export function redactBannedWords(text: string, bannedTokens: string[]): { text: string; count: number } {
  let out = text || "";
  let count = 0;
  const tokens = (bannedTokens || []).map(t => t.trim()).filter(t => t.length > 1)
    .sort((a, b) => b.length - a.length); // longer phrases first
  for (const tok of tokens) {
    const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let re: RegExp;
    try { re = new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "giu"); }
    catch { re = new RegExp(esc, "gi"); }
    out = out.replace(re, () => { count++; return "[…]"; });
  }
  return { text: out, count };
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
