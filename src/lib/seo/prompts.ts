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
  keywordsData?: { keyword: string; volume: number }[];
}): string {
  const policyBlock = args.policy ? renderPolicy(args.policy) + "\n\n" : "";
  const paaBlock = args.paa?.length ? `\nPeople-Also-Ask из выдачи: ${JSON.stringify(args.paa)}` : "";
  const kwData = args.keywordsData?.length
    ? `\n- РЕАЛЬНЫЕ КЛЮЧИ С ОБЪЁМАМИ ПОИСКА (DataForSEO — используй ИМЕННО ЭТИ формулировки в section.keywords; приоритет ключам с бОльшим объёмом, распределяй по релевантным секциям): ${JSON.stringify(args.keywordsData.slice(0, 50).map(k => `${k.keyword} (${k.volume}/мес)`))}`
    : "";
  const relBlock = args.related?.length ? `\nСвязанные запросы: ${JSON.stringify(args.related)}` : "";
  const toneBlock = args.tone ? `\n- тон повествования: ${args.tone}` : "";
  const personaBlock = args.persona ? `\n- от лица: ${args.persona}` : "";
  const addKw = args.additionalKeywords?.trim() ? `\n- доп. ключевые слова (обязательно учесть): ${args.additionalKeywords}` : "";
  const twc = args.targetWordCount ? `\n- целевой объём статьи: ~${args.targetWordCount} слов (распредели по секциям, не раздувай)` : "";
  const manual = args.manualTexts?.length
    ? `\n- ручные тексты конкурентов (скрейп не справился): ${JSON.stringify(args.manualTexts.map(m => ({ name: m.name, text: m.text.slice(0, 6000) })))}`
    : "";

  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  return `${policyBlock}Ты — SEO-стратег и entity-аналитик. На основе анализа топ-конкурентов из выдачи построй ИСЧЕРПЫВАЮЩУЮ структуру статьи (outline) в EAV-модели (Entity-Attribute-Value), которая полнее и авторитетнее конкурентов и максимально цитируема в ИИ-поиске. Верни СТРОГИЙ JSON без преамбулы и без markdown-обёрток.

АКТУАЛЬНОСТЬ: сегодня ${today}. Если в заголовках/тексте уместен год — используй ТЕКУЩИЙ (${year}); НИКОГДА не подставляй устаревшие годы (2023/2024) и не выдумывай год — лучше без года, чем неверный.

ПРИНЦИПЫ:
- Структура отвечает на реальные sub-intents пользователей; front-load ключевые факты (цена/время/расстояние) в первые секции.
- Для каждой секции укажи сущности с весом важности 1-10, ключи, краткое summary, визуальные элементы, заметки копирайтеру и связи сущностей (триплеты subject→predicate→object со strength 1-10).
- Веса [10] — самые важные сущности темы, [5-7] — поддерживающие/географические.
- Для коммерческих тем — нейтральное сравнение ВСЕХ вариантов (включая те, что автор не продаёт).
- НЕ выдумывай лицензии/регалии/отзывы. Помечай секции needs_real_experience=true, где уместен реальный личный опыт (не выдуманный).

ДАНО:
- keyword: ${args.keyword}
- язык/страна: ${args.language}/${args.country}${toneBlock}${personaBlock}${addKw}${twc}${paaBlock}${relBlock}
- топ-конкуренты (типы + структура): ${JSON.stringify(args.competitors)}${manual}${kwData}

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

// ─── Content Analysis (comprehensive, EAV) — drives Dashboard / Guideline / Gaps / Constructor ──
// Compares the target page against scraped top competitors and returns a rich JSON spec.
export function buildAnalysisPrompt(args: {
  keyword: string;
  targetPage: any;
  competitors: CompetitorInput[];
  language?: string;
  country?: string;
  policy?: EditorialPolicy;
}): string {
  const policyBlock = args.policy ? renderPolicy(args.policy) + "\n\n" : "";
  const loc = [args.language, args.country].filter(Boolean).join("/");
  return `${policyBlock}Ты — SEO/GEO entity-аналитик. Сравни ЦЕЛЕВУЮ страницу с топ-конкурентами из выдачи и построй ПОЛНЫЙ план улучшения контента в EAV-модели (Entity-Attribute-Value), чтобы целевая страница стала полнее и авторитетнее конкурентов и попадала в цитирование ИИ-движков (ChatGPT/Perplexity/Yandex). Верни СТРОГИЙ JSON без преамбулы и без markdown-обёрток.

ЧТО СДЕЛАТЬ:
1. Извлеки ключевые СУЩНОСТИ темы из конкурентов (товары, услуги, места, виды транспорта, объекты). Для каждой определи: покрыта ли она на целевой странице (mentions), сколько у целевой связей-триплетов vs медиана конкурентов, статус покрытия (well / underdeveloped / missing), важность (high/medium/low) и семантическую близость к теме (0..1).
2. Составь приоритизированные РЕКОМЕНДАЦИИ (sub-intents) — секции, которые надо ДОБАВИТЬ (new_h2/new_h3), РАСШИРИТЬ (expand), УСИЛИТЬ (enhance) или СОКРАТИТЬ (reduce). Для каждой: статус, NEW/EXISTING, точное место вставки (placement по заголовкам конкурентов/целевой), целевой объём (из/в словах), заметки копирайтеру, ключи, и сущности с обязательными триплетами (subject → predicate → object) и инструкцией «как раскрыть».
3. Найди КОНКУРЕНТНЫЕ ГЭПЫ — темы/секции/таблицы, которые есть у конкурентов, но нет у нас. Для каждого: рекомендация add/skip/merge/expand, причина (со ссылкой на конкретных конкурентов по URL) и потенциальные сущности с триплетами.

ПРИНЦИПЫ: front-load факты (цена/время/расстояние); для коммерческих тем — честное сравнение ВСЕХ вариантов; НЕ выдумывай лицензии/отзывы/опыт; приоритеты в долях 0..1.

ДАНО:
- keyword: ${args.keyword}${loc ? `\n- язык/страна: ${loc}` : ""}
- ЦЕЛЕВАЯ СТРАНИЦА: ${JSON.stringify(args.targetPage)}
- КОНКУРЕНТЫ (топ выдачи, со структурой): ${JSON.stringify(args.competitors)}

ВЕРНИ JSON строго по схеме (только JSON, без markdown):
{
  "main_keyword": "",
  "target_url": "",
  "summary": { "total_entities": 0, "entities_found": 0, "entities_missing": 0, "coverage_percent": 0, "coverage_label": "underdeveloped|developing|strong", "content_gaps": 0, "recommendations": 0, "sub_intents": 0 },
  "entities": [ { "id": "E_001", "name": "", "kind": "core|secondary", "coverage": "well|underdeveloped|missing", "mentions": 0, "triplets_current": 0, "triplets_competitor_median": 0, "similarity": 0.0, "importance": "high|medium|low", "required_triplets": 0 } ],
  "recommendations": [ {
    "id": "SI_001", "title": "", "priority": 0.0, "relevance": 0.0,
    "type": "new_h2|new_h3|expand|enhance|reduce", "section": "NEW|EXISTING", "placement": "",
    "words_from": 0, "words_to": 0,
    "copywriter_notes": "",
    "keywords": [""],
    "entities": [ { "name": "", "role": "primary|supporting", "required_triplets": ["Subject → predicate → Object"], "how_to_cover": "" } ]
  } ],
  "competitor_gaps": [ {
    "id": "GAP_001", "title": "", "recommendation": "add|skip|merge|expand", "reason": "",
    "found_in_competitors": ["https://..."],
    "potential_entities": [ { "id": "E_016", "name": "", "triplets": ["Subject → predicate → Object"] } ]
  } ],
  "excluded": [ { "name": "", "kind": "entity|section", "reason": "low_priority|irrelevant" } ]
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
  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const dateLine = `Сегодня ${today}. Если нужен год — используй ТЕКУЩИЙ (${year}); никогда не пиши устаревшие годы (2023/2024) и не выдумывай год.\n`;
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
${dateLine}
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
${dateLine}${customLine}${sourcesBlock}
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
