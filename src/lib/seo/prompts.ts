// Prompt builders for the SEO Tools module (spec §4 outline, §11 gap-report)
// plus a JSON extraction helper for parsing strict-JSON LLM responses.

import { renderPolicy, EditorialPolicy } from "./policy";

// Local currency hint by country (so prices match the target region, not USD by default).
const EUR = ["gr", "de", "fr", "it", "es", "pt", "nl", "be", "at", "ie", "fi", "sk", "si", "lt", "lv", "ee", "cy", "mt", "lu", "hr"];
export function currencyHint(country?: string): string {
  const c = (country || "").toLowerCase();
  if (EUR.includes(c)) return "EUR (€)";
  const map: Record<string, string> = { gb: "GBP (£)", us: "USD ($)", ca: "CAD ($)", au: "AUD ($)", nz: "NZD ($)", ch: "CHF", se: "SEK", no: "NOK", dk: "DKK", pl: "PLN (zł)", cz: "CZK", hu: "HUF", ro: "RON", bg: "BGN", ua: "UAH (₴)", ru: "RUB (₽)", tr: "TRY (₺)", jp: "JPY (¥)", in: "INR (₹)", br: "BRL (R$)", mx: "MXN ($)" };
  return map[c] || "местная валюта региона";
}

// Cross-cutting anti-fabrication rule injected into both outline and text prompts.
const NO_FABRICATION = `ФАКТЫ (КРИТИЧНО — пиши богато и ТОЧНО): опирайся на реальные данные. Активно используй проверенные, общеизвестные факты о предмете — реальные характеристики (экран, память, чип, разрешение), реальные названия моделей/версий/игр/аксессуаров/ритейлеров, известные цены/MSRP и даты — И данные из источников/конкурентов. Конкретика и цифры приветствуются, когда они настоящие: именно это делает статью полезной и цитируемой. НО НЕ выдумывай того, чего может не существовать или в чём не уверен: не сочиняй несуществующие модели/версии/варианты («OLED-версия», если её нет), не угадывай характеристики/цены/даты/названия. Если точного значения нет ни в источниках, ни в достоверных знаниях — обобщи («доступны разные комплекты», «уточняйте у продавца»), НЕ подставляй выдуманное число. Правило: уверен, что факт реальный — пиши конкретно; не уверен — обобщай, но не фантазируй. Особое внимание к точным названиям (например название игры бери точное, не приблизительное).`;

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
  text_sample?: string;   // real scraped page text → grounds the outline in facts
  extracted?: string;     // compact per-source facts from the map stage (specs/prices/entities)
}

// ─── Map stage: extract compact facts from ONE source (run per competitor, in parallel) ──────────
export function buildSourceExtractPrompt(args: { url: string; title: string; text: string; keyword: string; country?: string }): string {
  return `Ты — экстрактор фактов. Из текста ОДНОГО источника по теме "${args.keyword}"${args.country ? `, регион ${args.country}` : ""} вытащи ТОЛЬКО реально присутствующие в тексте факты — НИЧЕГО не выдумывай и не достраивай. Верни СТРОГИЙ компактный JSON без обёрток:
{ "specs": { "Атрибут": "значение" }, "prices": ["цена + что это"], "key_facts": ["краткий факт"], "entities": ["сущность"], "headings_covered": ["тема/подзаголовок страницы"] }
ПРАВИЛА: значения бери дословно из текста; если чего-то нет — пустой массив/объект. Максимум ~12 фактов и ~12 сущностей. Цены — как в тексте (валюту не меняй). Спеки — характеристики товара (экран, память, чип и т.п.) ровно как написано.

ИСТОЧНИК: ${args.title} (${args.url})
ТЕКСТ:
${(args.text || "").slice(0, 6000)}`;
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
  pageGoal?: "informational" | "commercial" | "mixed";
  narration?: "first" | "third";
  customTemplate?: string;
  structureRules?: string;
}): string {
  // Tone is rendered once: folded into the policy block (override) when a policy exists,
  // otherwise as a standalone line. Never both → no conflicting tone signals.
  const policyBlock = args.policy ? renderPolicy(args.policy, args.tone) + "\n\n" : "";
  const paaBlock = args.paa?.length ? `\nPeople-Also-Ask из выдачи: ${JSON.stringify(args.paa)}` : "";
  const kwData = args.keywordsData?.length
    ? `\n- РЕАЛЬНЫЕ КЛЮЧИ С ОБЪЁМАМИ ПОИСКА (DataForSEO — используй ИМЕННО ЭТИ формулировки в section.keywords; приоритет ключам с бОльшим объёмом, распределяй по релевантным секциям): ${JSON.stringify(args.keywordsData.slice(0, 50).map(k => `${k.keyword} (${k.volume}/мес)`))}`
    : "";
  const relBlock = args.related?.length ? `\nСвязанные запросы: ${JSON.stringify(args.related)}` : "";
  const toneBlock = args.tone && !args.policy ? `\n- тон повествования: ${args.tone}` : "";
  const personaBlock = args.persona ? `\n- от лица: ${args.persona}` : "";
  const narrationBlock = args.narration
    ? `\n- лицо повествования: ${args.narration === "first" ? "ПЕРВОЕ лицо — экспертный «я»-голос (личный опыт, рекомендации от себя, «я проверял…»)" : "ТРЕТЬЕ лицо — корпоративный нейтральный голос (без «я», от лица компании)"}. Установи meta.narration = "${args.narration}".`
    : "";
  const customTplBlock = args.customTemplate?.trim()
    ? `\n\nПОЛЬЗОВАТЕЛЬСКИЙ ШАБЛОН СТРУКТУРЫ (ВЫСШИЙ ПРИОРИТЕТ — следуй ему ДОСЛОВНО как каркасу): используй ИМЕННО эти заголовки H1/H2/H3, в ТОМ ЖЕ порядке и с той же формулировкой. НЕ переименовывай, не выкидывай и не переставляй заданные пункты. Добавлять свои H2/H3 можно ТОЛЬКО если их не хватает для полноты, и только между заданными, не нарушая порядок. Детально заполняй секции по EAV.\n${args.customTemplate.trim().slice(0, 4000)}`
    : "";
  const structRulesBlock = args.structureRules?.trim()
    ? `\n\nПРАВИЛА СТРУКТУРЫ ОТ ПОЛЬЗОВАТЕЛЯ (учитывай ОБЯЗАТЕЛЬНО при построении секций — это указания, как организовать статью): ${args.structureRules.trim().slice(0, 1500)}`
    : "";
  const addKw = args.additionalKeywords?.trim() ? `\n- доп. ключевые слова (обязательно учесть): ${args.additionalKeywords}` : "";
  const twc = args.targetWordCount ? `\n- целевой объём статьи: ~${args.targetWordCount} слов (распредели по секциям, не раздувай)` : "";
  const manual = args.manualTexts?.length
    ? `\n- ручные тексты конкурентов (скрейп не справился): ${JSON.stringify(args.manualTexts.map(m => ({ name: m.name, text: m.text.slice(0, 6000) })))}`
    : "";
  // Real scraped competitor content → primary grounding for hard specifics. Official/brand sources first.
  // Keep the outline input bounded (official source first, deeper; others trimmed) so the model
  // doesn't blow the token budget and truncate the JSON. Full-depth text still flows to the TEXT step.
  // Prefer the compact per-source extraction (map stage); fall back to raw text if not extracted.
  const compRanked = args.competitors
    .filter(c => (c.extracted && c.extracted.trim()) || (c.text_sample && c.text_sample.trim().length > 80))
    .sort((a, b) => (b.site_type === "official_store" ? 1 : 0) - (a.site_type === "official_store" ? 1 : 0))
    .slice(0, 8);
  const compFacts = compRanked
    .map((c, i) => {
      const body = c.extracted?.trim()
        ? c.extracted.trim().slice(0, 1600)
        : (c.text_sample || "").replace(/\s+/g, " ").trim().slice(0, c.site_type === "official_store" ? 3500 : 2000);
      return `[${i + 1}]${c.site_type === "official_store" ? " (ОФИЦИАЛЬНЫЙ ИСТОЧНИК — высший приоритет)" : ""} ${c.url}\n${body}`;
    }).join("\n\n");
  const factsBlock = compFacts
    ? `\n\nРЕАЛЬНЫЙ КОНТЕНТ КОНКУРЕНТОВ/ИСТОЧНИКОВ ИЗ ТОПА ВЫДАЧИ (главная опора для конкретики): извлекай отсюда ВСЕ конкретные значения — точные цены/суммы, названия моделей/версий/изданий, характеристики, объёмы памяти, даты, имена игр/товаров/ритейлеров. Если есть «(ОФИЦИАЛЬНЫЙ ИСТОЧНИК)» — доверяй ему в первую очередь. ПРАВИЛО: бери конкретику отсюда ИЛИ из достоверных общеизвестных фактов, в которых уверен; если значения нет ни тут, ни в надёжных знаниях — обобщи (диапазон/ориентир) и пометь копирайтеру «уточнить из источников», но НЕ подставляй выдуманное число и НЕ вставляй токен в заголовки/summary. Названия (игр/моделей) бери ТОЧНЫЕ. Цены — в валюте региона. Текст не копируй дословно — извлекай факты.\n${compFacts}`
    : `\n\nЗАЗЕМЛЕНИЕ (текстов конкурентов нет): подтверждённого источника конкретики нет. Можешь опираться на достоверные общеизвестные факты о предмете (реальные характеристики, точные названия), но НЕ выдумывай неуверенных цен/спеков/дат/изданий — такие места держи качественными (диапазон/ориентир) и помечай «уточнить из источников при написании». Структуру, сущности и ключи раскрывай полноценно — ограничение касается ТОЛЬКО придуманной неуверенной конкретики.`;

  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const goal = args.pageGoal || "mixed";
  const goalBlock = goal === "commercial"
    ? `\n\nЦЕЛЬ СТРАНИЦЫ: КОММЕРЧЕСКАЯ (продающая, под конверсию). meta.dominant_intent = "commercial".
- title_options и description_options — ПРОДАЮЩИЕ: позиционируй услугу и выгоду, конверсионные хуки (бронирование, "best/private/door-to-door", "от €X", надёжность, без скрытых доплат), бренд-ready. НЕ информационные «Guide / How to / Comparison».
- description_options — с УТП и мягким CTA (забронировать / проверить цену).
- Структура: помимо честного сравнения вариантов добавь ПРОДАЮЩИЕ секции: «зачем бронировать заранее», «наша услуга и типы авто (sedan / minivan / minibus)», «что включено», «как забронировать (по шагам)», «вердикт + CTA». Голос — эксперт, который сам оказывает услугу (первое лицо).
- copywriter_notes ведут читателя к целевому действию, но альтернативы (такси/автобус/аренда) описывай честно, не обесценивая.`
    : goal === "informational"
    ? `\n\nЦЕЛЬ СТРАНИЦЫ: ИНФОРМАЦИОННАЯ (справочная). meta.dominant_intent = "informational".
- title_options / description_options — справочные и исчерпывающие («Guide», «How to», «Distance, Time & Cost»), без продаж и без CTA.
- Голос — нейтральный эксперт; равномерно и полно покрой все под-вопросы.`
    : `\n\nЦЕЛЬ СТРАНИЦЫ: СМЕШАННАЯ. Информационный каркас (полнота под-интентов) + коммерческие вставки (позиционирование услуги, типы авто, как забронировать) + мягкий CTA в конце. meta.dominant_intent = "commercial_investigation". title_options — гибрид: информативные, но с конверсионным хуком.`;
  return `${policyBlock}Ты — SEO-стратег и entity-аналитик. На основе анализа топ-конкурентов из выдачи построй ИСЧЕРПЫВАЮЩУЮ структуру статьи (outline) в EAV-модели (Entity-Attribute-Value), которая полнее и авторитетнее конкурентов и максимально цитируема в ИИ-поиске. Верни СТРОГИЙ JSON без преамбулы и без markdown-обёрток.

АКТУАЛЬНОСТЬ: сегодня ${today}. Если в заголовках/тексте уместен год — используй ТЕКУЩИЙ (${year}); НИКОГДА не подставляй устаревшие годы (2023/2024) и не выдумывай год — лучше без года, чем неверный.${goalBlock}

ПРИНЦИПЫ:
- Структура отвечает на реальные sub-intents пользователей; front-load ключевые факты (цена/время/расстояние) в первые секции.
- Веса [10] — самые важные сущности темы, [5-7] — поддерживающие/географические.
- Для коммерческих тем — нейтральное сравнение ВСЕХ вариантов (включая те, что автор не продаёт).
- НЕ выдумывай лицензии/регалии/отзывы. Помечай секции needs_real_experience=true, где уместен реальный личный опыт (не выдуманный).
- ${NO_FABRICATION}
- РЕГИОН: пиши под регион «${args.country}»: цены/суммы в валюте региона — ${currencyHint(args.country)} (НЕ в USD по умолчанию); ритейлеры и реалии — релевантные региону (для Греции/ЕС — местные магазины и маркетплейсы, без Walmart и подобных, которых там нет).

ТРЕБОВАНИЯ К ДЕТАЛИЗАЦИИ (ЖЁСТКО, иначе аутлайн бесполезен — по нему пишут идеальную статью):
- ГЛУБИНА И ВЛОЖЕННОСТЬ (КРИТИЧНО): почти каждый содержательный H2 ОБЯЗАН иметь 2-4 вложенных H3. H3 — это ОТДЕЛЬНЫЙ элемент массива sections с "h_level":"H3", идущий сразу ПОСЛЕ своего H2. Крупные/коммерческие H2 (сравнение вариантов, цены, бронирование, услуга/автопарк, безопасность) — минимум 3 H3 каждый. У H2 word_count_self делай маленьким (30-60 слов вступления), основной объём — в H3. НЕ делай плоский список из одних H2.
- ПЛОТНОСТЬ ЗАГОЛОВКОВ (БОГАТО, как у топовых гайдов): дай ПОДРОБНУЮ структуру — обычно 18-30 секций (H2+H3 суммарно) для широких тем, меньше только для узких. Почти каждый содержательный H2 имеет 2-4 вложенных H3. Покрой ВСЕ реальные sub-intents и под-вопросы (включая узкие: конкретные маршруты/типы/FAQ как H3). Верхний предел ~32 секции — не плоди пустые, но и не обедняй. Объём добирается и числом, и длиной секций.
- СУЩНОСТИ: для крупных секций 4-7 сущностей с весами, для мелких H3 — 2-3.
- КЛЮЧИ: 3-6 ПОЛНЫХ поисковых фраз на секцию (реальные запросы, напр. "how far is pefkohori from thessaloniki airport"), а НЕ слова-обрывки ("distance, time"). Бери формулировки из keywordsData (если есть), остальное — реалистичный длинный хвост.
- ЧАСТОТНОСТЬ → УРОВЕНЬ ЗАГОЛОВКА (по методике Rush): распредели ключи по частотности из keywordsData. ВЧ (самые объёмные, 1-2 слова) → в H1 и крупные H2. СЧ (уточняющие, 2-3 слова) → в H2. НЧ/длинный хвост (4+ слов, конкретные вопросы) → в H3 (там ключи можно склонять). Не дублируй один ключ во многих заголовках — раскидывай.
- H1 ≠ TITLE: H1 (заголовок на странице) и Title (тег для выдачи) — РАЗНЫЕ формулировки, обе с ключами. H1 — цепляющий, для читателя, с ВЧ-ключом; Title — под клик в выдаче. Заполни meta.h1 отдельным от title_options заголовком (с ТЕКУЩИМ годом, если год уместен).
- SUMMARY: 3-5 предложений с КОНКРЕТНЫМИ числовыми ориентирами (расстояние в км, время в мин/ч, цены в валюте, характеристики) — реальными: взятыми из текстов конкурентов/источников ИЛИ из достоверных общеизвестных фактов, в которых уверен. Если точного значения нет ни там, ни в надёжных знаниях — дай диапазон/ориентир и пометь «уточнить из источников», НЕ выдумывай точную цифру. Цель — насыщенно и точно, без фейковой точности.
- COPYWRITER_NOTES: развёрнутый абзац (4-6 предложений) в заданном tone/persona (если persona от первого лица — экспертный «я»-голос). Конкретно: какой факт/анекдот/таблицу/чек-лист дать, как вплести сущности, чем открыть и чем закрыть секцию.
- ENTITY_CONNECTIONS: 3-5 триплетов на секцию (subject→predicate→object со strength 1-10).
- VISUAL_ELEMENTS: где уместно — таблицы сравнения, инфографики маршрута, чек-листы, флоучарты бронирования (с title и description).
- FAQ: 3-5 вопросов, для КАЖДОГО заполни answer_guideline (40-60 слов, какие сущности/цифры задействовать).
- SUB_INTENTS: 8-12 реальных под-интентов (вопросов пользователей) с section/coverage/word_count/entities.
- ENTITY_ANALYSIS: заполни КОМПАКТНО, но по делу — content_strategy (по 2-3 пункта в подблоках), primary_entity (атрибуты+триплеты+authority_validation), supporting_entities (3-4 сущности), keyword_strategy (primary/lsi/long_tail по 2-3 с usage), visual_elements (1-2 с prompt). Не раздувай — лаконично и полезно.

ДАНО:
- keyword: ${args.keyword}
- язык/страна: ${args.language}/${args.country}${toneBlock}${personaBlock}${narrationBlock}${addKw}${twc}${paaBlock}${relBlock}
- топ-конкуренты (типы + структура): ${JSON.stringify(args.competitors.map(({ text_sample, ...c }) => { void text_sample; return c; }))}${manual}${kwData}${customTplBlock}${structRulesBlock}${factsBlock}

МЕТА-ТЕГИ (title/description/slug) — по правилам Google и Bing, проработай ТЩАТЕЛЬНО (это готовые к публикации варианты):
- title_options (3 шт.): 50–60 символов (под ~600px, иначе обрежется в выдаче). Главный ключ — в САМОМ НАЧАЛЕ. Если бренд известен — в конце через « | » или « - ». Формула: [Главный ключ] - [Вторичный ключ/УТП] | [Бренд]. Коммерческие — продающий хук (Buy/Best/от €X/Free shipping); информационные — «How to / Guide / Число + …»; числа и скобки повышают CTR. Bing любит точное вхождение ключа.
- description_options (2 шт.): ~150–155 символов (влезает и в Google ≤160, и в Bing). Ценность с ключами + конкретная выгода/деталь + явный CTA для коммерции (Shop now / Book / Get a quote); для информационных — что внутри, без продаж. Формула: [Ценность с ключами]. [Выгода/деталь]. [CTA].
- slug_options (2 шт.): 3–5 слов, ТОЛЬКО строчные латинские буквы и дефисы, БЕЗ стоп-слов (a, an, the, in, on, of, and, for…), без подчёркиваний, пробелов, года и спецсимволов. Не-латиницу транслитерируй. Примеры: "ergonomic-office-chairs", "start-vegetable-garden-beginners", "best-project-management-software".
Текст title/description — на языке ${args.language}; slug — всегда латиницей. Всё — под главный ключ и dominant_intent.

ВЕРНИ JSON строго по схеме (только JSON):
{
  "meta": { "keyword": "", "h1": "", "title_options": ["","",""], "description_options": ["",""], "slug_options": ["",""], "target_word_count": 0, "dominant_intent": "", "tone": "", "persona": "", "narration": "first|third" },
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

// ─── Outline fact-scrub: correct baked-in wrong/fabricated specifics before the text is written ──
// Runs right after outline generation. Uses the model's reliable knowledge to fix concrete values
// (wrong screen size, fabricated colors, wrong price/date/edition/game names). Returns find→replace
// pairs that are applied over the outline's string VALUES only (structure/keys/entities untouched).
export function buildFactScrubPrompt(args: { outline: any; keyword: string; country?: string }): string {
  return `Ты — фактчекер-редактор с надёжными знаниями о предмете. Ниже JSON-структура статьи (outline) по теме "${args.keyword}"${args.country ? `, регион ${args.country}` : ""}. Найди КОНКРЕТНЫЕ фактические значения, которые ВЫГЛЯДЯТ ОШИБОЧНЫМИ или ВЫДУМАННЫМИ: неверные характеристики (диагональ экрана, объём памяти, чип, разрешение, частота), неверные/выдуманные цены и MSRP, неверные даты, неточные названия моделей/изданий/игр, выдуманные цвета/комплектации/SKU.

Для каждой такой ошибки верни пару find→replace:
- "find": ТОЧНАЯ подстрока, как она буквально встречается в значениях JSON (например "8-inch LCD").
- "replace": исправленное РЕАЛЬНОЕ значение, если ты в нём уверен (например "7.9-inch LCD"); ЛИБО обобщённая формулировка без выдуманной конкретики, если точного значения не знаешь (например для выдуманных цветов — "various Joy-Con 2 color options").

ПРАВИЛА:
- Меняй ТОЛЬКО явно ошибочное/выдуманное. Достоверно верные значения НЕ трогай.
- НЕ меняй структуру, ключи, заголовки секций, имена сущностей — только фактические ЗНАЧЕНИЯ внутри строк.
- "find" должен встречаться в JSON буквально; не выдумывай несуществующих подстрок.
- Будь осторожен: лучше обобщить сомнительное, чем заменить на другое сомнительное.
- Если явных ошибок нет — верни пустой список.

Верни СТРОГИЙ JSON без обёрток: { "corrections": [ { "find": "", "replace": "" } ] }

OUTLINE JSON:
${JSON.stringify(args.outline).slice(0, 18000)}`;
}

// ─── Auto fact-clean: verify a finished article against the facts bank, then fix in one pass ──────
// Runs right after text generation. The facts bank = the consolidated facts extracted from the top
// sources the article was built on, so this is a CONFIRM-and-correct pass, not a fresh rewrite.
export function buildAutoFactCleanPrompt(args: { article: string; factsBank: string; language: string }): string {
  return `Ты — аккуратный фактчек-редактор. Ниже ГОТОВАЯ СТАТЬЯ (Markdown) и БАНК ФАКТОВ — факты, извлечённые из топ-источников выдачи. Банк НЕПОЛНЫЙ (он не покрывает все реальные бренды/модели/цены — особенно для другого региона). Поэтому «нет в банке» НИКОГДА не значит «неправда».

Сделай МИНИМАЛЬНУЮ правку, СОХРАНИВ объём, все секции, бренды и стиль:
1. Меняй ТОЛЬКО то, что ПРЯМО ПРОТИВОРЕЧИТ банку (число/цена/спека отличается) — исправь по банку.
2. Убирай ТОЛЬКО то, что ЯВНО невозможно/выдумано (несуществующая модель, абсурдная цифра).
3. Всё остальное — реальные бренды и модели (SpringWell, Fleck и т.п.), типичные характеристики, диапазоны цен, общеизвестные факты — ОСТАВЬ КАК ЕСТЬ, даже если их нет в банке. НЕ обобщай и НЕ вырезай их.
4. СИНХРОНИЗАЦИЯ ЧИСЕЛ: если значение есть и в прозе, и в таблице/списке — приведи к ОДНОМУ.
КРИТИЧНО: НЕ сокращай статью (объём должен остаться примерно прежним, ±5%), НЕ удаляй секции/абзацы, НЕ трогай заголовки и их порядок, сохрани мета-блок в начале. Никаких маркеров [ПРОВЕРИТЬ] и плейсхолдеров. Язык — ${args.language}.
Верни ТОЛЬКО готовый Markdown статьи целиком, без преамбулы.

БАНК ФАКТОВ:
${args.factsBank.slice(0, 9000)}

СТАТЬЯ:
${args.article}`;
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
  // Tone folded into the policy block (single source) when a policy exists; otherwise a header line.
  const policyBlock = args.policy ? renderPolicy(args.policy, args.tone) + "\n\n" : "";
  const toneHeader = args.policy ? "" : `Тон повествования: ${args.tone}\n`;
  const narr = (args.outlineJson as any)?.meta?.narration;
  const narrLine = narr === "first" ? "Лицо: ПЕРВОЕ — экспертный «я»-голос, личный опыт.\n"
    : narr === "third" ? "Лицо: ТРЕТЬЕ — корпоративный нейтральный голос, без «я».\n" : "";
  const country = (args.outlineJson as any)?.meta?.country;
  const regionLine = country ? `Регион: ${country}. Цены/суммы — в валюте региона (${currencyHint(country)}), НЕ в USD по умолчанию; ритейлеры и реалии — релевантные региону (без магазинов, которых там нет).\n` : "";
  const sRules = (args.outlineJson as any)?.meta?.structureRules;
  const structRulesLine = sRules ? `Правила структуры от пользователя (соблюдай): ${String(sRules).slice(0, 1500)}\n` : "";
  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const dateLine = `Сегодня ${today}. Если нужен год — используй ТЕКУЩИЙ (${year}); никогда не пиши устаревшие годы (2023/2024) и не выдумывай год.\n`;
  const customLine = args.custom ? `Дополнительная инструкция автора (учесть обязательно): ${args.custom}\n` : "";

  // Carry the chosen meta tags (title/description/slug) from the outline into the article head,
  // so the generated text ships with publish-ready SEO meta instead of dropping them.
  const m = (args.outlineJson as any)?.meta || {};
  const pick = (v: any) => Array.isArray(v) ? (v.find((x: any) => x && String(x).trim()) || "") : (v || "");
  const metaTitle = pick(m.title_options) || pick(m.title);
  const metaDesc = pick(m.description_options) || pick(m.description);
  const metaSlug = pick(m.slug_options) || pick(m.slug);
  const metaH1 = pick(m.h1);
  const h1Line = metaH1 ? `\nЗаголовок H1 статьи: «${metaH1}» — используй ИМЕННО его как H1 (он ОТЛИЧАЕТСЯ от Title: H1 — для читателя, Title — для выдачи). НЕ копируй Title в H1.` : "";
  const metaBlock = (metaTitle || metaDesc || metaSlug)
    ? `\nМЕТА-ТЕГИ (вставь их В САМОЕ НАЧАЛО статьи отдельным блоком ДО заголовка H1, ровно в таком виде, заполнив значения):\n\`\`\`\nTitle: ${metaTitle}\nMeta Description: ${metaDesc}\nURL Slug: ${metaSlug}\n\`\`\`\nЗатем с новой строки начни саму статью с H1.${h1Line} Title должен быть 50–60 символов, Meta Description ~155, Slug — латиницей в нижнем регистре через дефисы. Если значение пустое — допиши подходящее по правилам.\n`
    : "";

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
      sourcesBlock = `\nИСТОЧНИКИ (используй реальные цифры; где уместно — ставь ссылку в формате [текст](url) на источник):\n${list}\nПРАВИЛО: используй конкретные цифры из источников; не выдумывай URL — бери только из списка выше. РАЗМЕЩЕНИЕ ССЫЛОК (по методике Rush): не ставь ссылки рядом — минимум ~1000 символов (≈150 слов) между двумя ссылками; распределяй их по тексту, не более одной на 1-2 абзаца, не кучкуй.\n`;
    }
  }

  // Custom prompt type: the author's instruction drives the writing; service template is minimal.
  if (args.promptType === "custom" && args.custom) {
    return `${policyBlock}${toneHeader}${narrLine}${regionLine}${structRulesLine}Язык вывода: ${args.language}
${dateLine}${NO_FABRICATION}
${metaBlock}ГЛАВНАЯ ИНСТРУКЦИЯ АВТОРА:
${args.custom}
${sourcesBlock}
Напиши статью по структуре ниже, следуя инструкции автора выше. Соблюдай word_count секций.
ЖЁСТКИЕ ПРАВИЛА: ровно один H1 (из Title), и СРАЗУ после него — первый H2, БЕЗ вводного абзаца между H1 и первым H2; весь текст только под заголовками H2/H3. Где нет реальных данных — не выдумывай лицензии/регалии/отзывы, ставь плейсхолдер [ЗАПОЛНИТЬ ВРУЧНУЮ: ...]; секции needs_real_experience=true — оставь [ВСТАВЬ РЕАЛЬНЫЙ ОПЫТ]; соблюдай ограничения политики.
Верни готовый текст в Markdown.

СТРУКТУРА (JSON):
${JSON.stringify(args.outlineJson)}`;
  }

  return `${policyBlock}${toneHeader}${narrLine}${regionLine}${structRulesLine}Язык вывода: ${args.language}
${dateLine}${customLine}${metaBlock}${sourcesBlock}
Напиши статью строго по структуре ниже. ОХВАТИ КАЖДУЮ секцию структуры (НЕ пропускай ни одного H2/H3) и пиши КАЖДУЮ развёрнуто — целься в указанный для секции word_count и в общий целевой объём; НЕ ужимай и не сокращай. Используй summary, keywords, entities_to_cover и copywriter_notes как ориентир. Естественно вплетай сущности и ключи.

ЖЁСТКИЕ ПРАВИЛА:
- СТРУКТУРА И ИЕРАРХИЯ (КРИТИЧНО): ровно ОДИН H1 — бери его из «Заголовок H1 статьи» (meta.h1), если задан; он ОТЛИЧАЕТСЯ от Title (H1 — цепляющий, для читателя, с ВЧ-ключом; Title — для выдачи), но использует ТЕКУЩИЙ год (не год выхода). После H1 НЕ пиши вводный абзац/лид. Между H1 и первым H2 допускается ТОЛЬКО оглавление (см. ниже) — никакой прозы. Весь текст статьи — ТОЛЬКО под заголовками H2/H3 (никаких «висячих» абзацев под H1). Вступление, если нужно, помещай ПОД первым H2 (он обычно и есть вводная/обзорная секция из структуры).
- ОГЛАВЛЕНИЕ (для длинных статей, 8+ секций — по методике Rush): сразу после H1 добавь блок «## Contents» (или эквивалент на языке статьи: «Содержание»/«Зміст») и под ним список ссылок на разделы H2 в формате [Текст раздела](#anchor), где anchor — заголовок раздела в нижнем регистре, пробелы→дефисы, без пунктуации (как генерит Markdown). Для коротких статей (<8 секций) оглавление НЕ добавляй. КАЖДАЯ секция структуры обязана стать заголовком РОВНО своего уровня: h_level=H2 → «## », H3 → «### », H4 → «#### ». НЕ повышай, не понижай, не объединяй, не пропускай и не переставляй заголовки; НЕ превращай заголовок секции в обычный абзац и НЕ сливай первую секцию с H1. Порядок секций — как в структуре.
- FAQ (ОБЯЗАТЕЛЬНО, если в структуре есть массив faq): отрендери его отдельной секцией в конце статьи — заголовок «## FAQ» (или эквивалент на языке вывода), затем КАЖДЫЙ вопрос как «### Вопрос», под ним ответ по answer_guideline. НЕ пропускай FAQ и не сворачивай в один абзац.
- ГОД И ДАТЫ: статья публикуется СЕГОДНЯ (${year}). В заголовках, «лучшие предложения/цены ${year}», «купить в ${year}» используй ТЕКУЩИЙ год ${year}. Год выхода продукта — это исторический факт, его можно упомянуть в тексте (например «вышла в 2025»), но НЕ подменяй им текущий год в H1/заголовках/слогане.
- ЯЗЫК И ПИСЬМЕННОСТЬ: пиши СТРОГО на языке вывода (${args.language}) и его алфавите. НЕ вставляй символы других письменностей — китайские/японские/корейские иероглифы, кану, хангыль и т.п. Если нужен иностранный термин — передай его на языке вывода или транслитерацией, без оригинальных иероглифов.
- КЛЮЧЕВЫЕ СЛОВА (по методике Rush): естественно вплетай ключи и их синонимы/словоформы РАВНОМЕРНО по тексту, чуть плотнее в первой части статьи. Без переспама (ключи не должны мешать чтению). Ключ из заголовка секции и связанные запросы используй в первом-втором абзаце секции. Главный ключ — обязательно в H1, первом абзаце и заключении.
- ОФОРМЛЕНИЕ (для читабельности и SEO): используй маркированные/нумерованные списки, сравнительные таблицы, выделение ключевых тезисов жирным — там, где это уместно по структуре; не сплошной «простынёй».
- ${NO_FABRICATION}
- Дополнять текст реальными общеизвестными фактами о предмете (точные характеристики, точные названия моделей/игр, известные цены/даты) — ПРИВЕТСТВУЕТСЯ для полноты и точности, даже если их нет в структуре. Нельзя добавлять лишь то, в чём не уверен или что может не существовать (выдуманные модели/спеки/цены/даты, приблизительные названия). Сомнительную конкретику обобщай, не детализируй выдуманным и не строй таблицы на выдуманных данных.
- ПРИОРИТЕТ РЕАЛЬНОГО ФАКТА: если конкретное значение в структуре (диагональ экрана, размер, спека, цвет, название) ЯВНО противоречит достоверно известному реальному факту — используй РЕАЛЬНОЕ значение, а ошибочное из структуры НЕ копируй. Если не уверен в реальном значении — обобщи, но не тиражируй явную ошибку структуры.
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
  return `Ты — строгий, но разумный фактчекер. Из секции "${args.heading}" (тема "${args.keyword}") выяви ТОЛЬКО конкретные ПРОВЕРЯЕМЫЕ факты: цифры, цены, даты, расстояния, время, технические характеристики, названия моделей/версий/продуктов, имена ритейлеров. Общие описательные фразы («поддерживает портативный режим», «удобно для семей», «надёжный сервис») НЕ проверяй и НЕ включай — пропускай их.

ВАЖНО: источники НЕПОЛНЫЕ и часто из другого региона. «Нет в источниках» ≠ «неправда». Реальные бренды/модели (SpringWell, Fleck и т.п.), типичные характеристики и правдоподобные диапазоны цен по умолчанию считай ВЕРНЫМИ.

Статусы (будь снисходителен — большинство фактов должно быть confirmed):
- confirmed: подтверждается источниками ИЛИ это реальный/правдоподобный/общеизвестный факт (реальный бренд, типичная спека, разумный диапазон), который НЕ противоречит источникам. Отсутствие в сниппетах — НЕ повод снижать статус.
- partial: источник даёт ДРУГОЕ конкретное значение (есть реальное расхождение с источником) — укажи это значение в note.
- unconfirmed: ПРЯМО ПРОТИВОРЕЧИТ источникам ЛИБО явно невозможно/выдумано (несуществующая модель, абсурдная цифра). Только такие реально надо править.
НЕ помечай partial/unconfirmed факт лишь потому, что его нет в сниппетах — это главная ошибка, избегай её.
В "note" по возможности укажи ВЕРНОЕ значение из источника (например «в источнике [6] цена €469.99»), чтобы его можно было подставить. В "sources" — номера подтверждающих источников. НЕ выдумывай источники.
Верни СТРОГИЙ JSON без обёрток:
{ "status": "confirmed|partial|unconfirmed", "facts": [ { "claim": "конкретное утверждение", "status": "confirmed|partial|unconfirmed", "note": "верное значение/пояснение", "sources": [1,2] } ] }

СЕКЦИЯ:
${args.text.slice(0, 6000)}

ИСТОЧНИКИ:
${src}`;
}

// ─── Image-prompt generation (Hero + per-section) ────────────────────────────────
export function buildImagePromptsPrompt(args: { outlineJson?: any; article?: string; keyword: string }): string {
  const src = args.outlineJson ? `СТРУКТУРА (JSON):\n${JSON.stringify(args.outlineJson)}` : `СТАТЬЯ:\n${(args.article || "").slice(0, 12000)}`;
  return `Ты — арт-директор и SEO-редактор. По теме "${args.keyword}" составь промпты для генерации изображений к статье: один Hero Image и по одному промпту к ключевым секциям (visual_elements/важные H2). Промпты — на английском, конкретные, фотореалистичные или чистый flat-design инфографики, без текста на картинке.
Для КАЖДОГО изображения дай ещё SEO-атрибуты: "alt" (alt-текст, описывает картинку и содержит релевантный ключ, на языке статьи, ~8-12 слов) и "title" (короткий title-атрибут с ключом). Это нужно для SEO-оптимизации картинок (по методике Rush — у изображений должны быть Title и Alt с ключами).
Верни СТРОГИЙ JSON без обёрток:
{
  "hero": { "prompt": "english image prompt", "alt": "alt текст с ключом", "title": "title с ключом" },
  "sections": [ { "heading": "section heading", "prompt": "english image prompt", "alt": "alt текст с ключом", "title": "title с ключом" } ]
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
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = s.indexOf("{");
  if (first === -1) return null;
  s = s.slice(first);
  // 1) Straight parse of the largest {...} slice (works for complete output).
  const last = s.lastIndexOf("}");
  if (last > 0) { try { return JSON.parse(s.slice(0, last + 1)) as T; } catch { /* fall through */ } }
  // 2) Salvage TRUNCATED output (hit token limit mid-JSON): cut at the last fully-closed
  //    container and re-close the still-open parents, so we recover a valid partial outline.
  const repaired = repairTruncatedJson(s);
  if (repaired) { try { return JSON.parse(repaired) as T; } catch { /* give up */ } }
  return null;
}

// Cut a truncated JSON string at the last position where a nested object/array fully closed,
// then append the closers for whatever containers were still open there. Ignores brackets/quotes
// inside strings. Always yields syntactically valid JSON (losing only the incomplete tail).
function repairTruncatedJson(s: string): string | null {
  const stack: string[] = [];
  let inStr = false, esc = false, cut = -1;
  let cutStack: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") { stack.pop(); cut = i; cutStack = stack.slice(); }
  }
  if (cut === -1) return null;
  let out = s.slice(0, cut + 1).replace(/,\s*$/, "");
  for (let i = cutStack.length - 1; i >= 0; i--) out += cutStack[i];
  return out;
}
