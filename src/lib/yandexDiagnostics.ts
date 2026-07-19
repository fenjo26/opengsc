// Human-readable labels for Yandex.Webmaster diagnostics problem codes + severities.
// The API returns raw enum strings (e.g. "DOCUMENTS_MISSING_DESCRIPTION",
// severity "POSSIBLE_PROBLEM"); we render friendly text per app locale, with a graceful
// fallback (prettified code) for any code Yandex adds that we haven't mapped yet.

type Lang = "en" | "ru" | "uk";

export const YANDEX_SEVERITY: Record<string, Record<Lang, { label: string; color: string; bg: string }>> = {
  FATAL: {
    en: { label: "Critical", color: "#ff375f", bg: "rgba(255,55,95,0.15)" },
    ru: { label: "Критично", color: "#ff375f", bg: "rgba(255,55,95,0.15)" },
    uk: { label: "Критично", color: "#ff375f", bg: "rgba(255,55,95,0.15)" },
  },
  CRITICAL: {
    en: { label: "Critical", color: "#ff375f", bg: "rgba(255,55,95,0.15)" },
    ru: { label: "Критично", color: "#ff375f", bg: "rgba(255,55,95,0.15)" },
    uk: { label: "Критично", color: "#ff375f", bg: "rgba(255,55,95,0.15)" },
  },
  ERROR: {
    en: { label: "Error", color: "#ff9f0a", bg: "rgba(255,159,10,0.15)" },
    ru: { label: "Ошибка", color: "#ff9f0a", bg: "rgba(255,159,10,0.15)" },
    uk: { label: "Помилка", color: "#ff9f0a", bg: "rgba(255,159,10,0.15)" },
  },
  POSSIBLE_PROBLEM: {
    en: { label: "Possible issue", color: "#ff9f0a", bg: "rgba(255,159,10,0.12)" },
    ru: { label: "Возможная проблема", color: "#ff9f0a", bg: "rgba(255,159,10,0.12)" },
    uk: { label: "Можлива проблема", color: "#ff9f0a", bg: "rgba(255,159,10,0.12)" },
  },
  RECOMMENDATION: {
    en: { label: "Recommendation", color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
    ru: { label: "Рекомендация", color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
    uk: { label: "Рекомендація", color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  },
};

export function severityMeta(severity: string, lang: Lang) {
  const s = YANDEX_SEVERITY[severity]?.[lang];
  if (s) return s;
  // Unknown severity — neutral grey badge with the prettified code.
  return { label: prettify(severity), color: "var(--color-text-secondary)", bg: "rgba(142,142,147,0.15)" };
}

// { en, ru, uk } labels per Yandex diagnostics code. Covers the common set; anything
// unmapped falls back to a prettified version of the raw code.
export const YANDEX_PROBLEM: Record<string, Record<Lang, string>> = {
  DOCUMENTS_MISSING_DESCRIPTION: {
    en: "Pages without a meta description",
    ru: "Страницы без meta description",
    uk: "Сторінки без meta description",
  },
  DOCUMENTS_MISSING_TITLE: {
    en: "Pages without a <title>",
    ru: "Страницы без тега <title>",
    uk: "Сторінки без тега <title>",
  },
  ERRORS_IN_SITEMAPS: {
    en: "Errors in Sitemap files",
    ru: "Ошибки в файлах Sitemap",
    uk: "Помилки у файлах Sitemap",
  },
  NO_SITEMAPS: {
    en: "No Sitemap file found",
    ru: "Файл Sitemap не найден",
    uk: "Файл Sitemap не знайдено",
  },
  NOT_MOBILE_FRIENDLY: {
    en: "Site is not mobile-friendly",
    ru: "Сайт не оптимизирован для мобильных",
    uk: "Сайт не оптимізований для мобільних",
  },
  ERROR_IN_ROBOTS_TXT: {
    en: "Errors in robots.txt",
    ru: "Ошибки в robots.txt",
    uk: "Помилки в robots.txt",
  },
  ROBOTS_TXT_MISSING: {
    en: "robots.txt is missing",
    ru: "Отсутствует robots.txt",
    uk: "Відсутній robots.txt",
  },
  DNS_ERROR: {
    en: "DNS error — server unreachable",
    ru: "Ошибка DNS — сервер недоступен",
    uk: "Помилка DNS — сервер недоступний",
  },
  SLOW_AVG_RESPONSE_TIME: {
    en: "Slow average server response time",
    ru: "Медленный средний ответ сервера",
    uk: "Повільна середня відповідь сервера",
  },
  DOCUMENTS_WITH_4XX_ERROR: {
    en: "Pages returning 4xx errors",
    ru: "Страницы с ошибками 4xx",
    uk: "Сторінки з помилками 4xx",
  },
  DOCUMENTS_WITH_5XX_ERROR: {
    en: "Pages returning 5xx errors",
    ru: "Страницы с ошибками 5xx",
    uk: "Сторінки з помилками 5xx",
  },
  THREATS: {
    en: "Security threats detected",
    ru: "Обнаружены угрозы безопасности",
    uk: "Виявлено загрози безпеці",
  },
  SANCTIONS: {
    en: "Yandex sanctions on the site",
    ru: "Санкции Яндекса на сайте",
    uk: "Санкції Яндекса на сайті",
  },
  MAIN_MIRROR_IS_NOT_HTTPS: {
    en: "Main mirror is not on HTTPS",
    ru: "Главное зеркало не на HTTPS",
    uk: "Головне дзеркало не на HTTPS",
  },
  TURBO_HOST_DISABLED: {
    en: "Turbo pages are disabled",
    ru: "Турбо-страницы отключены",
    uk: "Турбо-сторінки вимкнено",
  },
  NO_METRIKA_COUNTER_CRAWL_ENABLED: {
    en: "No Yandex.Metrica counter linked",
    ru: "Не подключён счётчик Яндекс.Метрики",
    uk: "Не підключено лічильник Яндекс.Метрики",
  },
  FAVICON_ERROR: {
    en: "Favicon problem",
    ru: "Проблема с фавиконкой",
    uk: "Проблема з фавіконкою",
  },
};

// "DOCUMENTS_MISSING_DESCRIPTION" → "Documents missing description"
function prettify(code: string): string {
  const s = code.toLowerCase().replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function problemLabel(code: string, lang: Lang): string {
  return YANDEX_PROBLEM[code]?.[lang] ?? prettify(code);
}
