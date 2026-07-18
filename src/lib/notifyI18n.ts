// Server-side i18n for Telegram/Slack notifications (alerts + digests). The browser's
// LanguageProvider can't help here — schedulers run headless — so the UI saves the
// user's current language into alertSettings/digestSettings and the templates below
// render in that language. Same three locales as the app: en / ru / uk.

export type NotifyLang = "en" | "ru" | "uk";

export const normalizeLang = (v: unknown): NotifyLang =>
  v === "ru" || v === "uk" ? v : "en";

type Tpl = {
  // alerts
  rankDropTitle: (kw: string) => string;
  rankDropMsg: (site: string, kw: string, country: string, drop: number, from: number | null, to: number | null) => string;
  trafficDropTitle: (site: string) => string;
  trafficDropMsg: (site: string, pct: number, from: number, to: number) => string;
  sslTitle: (site: string) => string;
  sslMsg: (site: string, days: number) => string;
  auditTitle: (site: string) => string;
  auditMsg: (site: string, score: number, bad: number, total: number) => string;
  // digest
  digestTitleAll: string;
  digestTitleTag: (tag: string) => string;
  digestWindow: (days: number, date: string) => string;
  digestNoSitesTag: (tag: string) => string;
  digestNoSites: string;
  totalClicks: (cur: number, delta: string) => string;
  moreSites: (n: number) => string;
  winners: string;
  losers: string;
  rankMoves: string;
  aiSummary: string;
};

export const NOTIFY_L: Record<NotifyLang, Tpl> = {
  en: {
    rankDropTitle: kw => `📉 Rank drop: ${kw}`,
    rankDropMsg: (site, kw, country, drop, from, to) => `*${site}* — "${kw}" (${country}) fell ${drop} positions: ${from} → ${to}.`,
    trafficDropTitle: site => `🔻 Traffic drop: ${site}`,
    trafficDropMsg: (site, pct, from, to) => `*${site}* — clicks down ${pct}% week-over-week: ${from} → ${to}.`,
    sslTitle: site => `🔒 SSL expiring: ${site}`,
    sslMsg: (site, days) => `*${site}* — SSL certificate expires in ${days} day(s). Renew it (certbot renew / check auto-renewal).`,
    auditTitle: site => `🩺 Low audit score: ${site}`,
    auditMsg: (site, score, bad, total) => `*${site}* — site audit health score is ${score}/100 (${bad}/${total} pages with issues). Check the Audit tab.`,
    digestTitleAll: "📊 OpenGSC digest — all sites",
    digestTitleTag: tag => `📊 OpenGSC digest — tag "${tag}"`,
    digestWindow: (days, date) => `_Last ${days} days vs previous ${days} days · ${date}_`,
    digestNoSitesTag: tag => `No sites carry the tag "${tag}".`,
    digestNoSites: "No sites connected yet.",
    totalClicks: (cur, delta) => `*Total clicks:* ${cur} (${delta} vs prev)`,
    moreSites: n => `…and ${n} more sites`,
    winners: "*🏆 Winner queries:*",
    losers: "*⚠️ Loser queries:*",
    rankMoves: "*📍 Rank movements:*",
    aiSummary: "🤖 *AI summary:*",
  },
  ru: {
    rankDropTitle: kw => `📉 Падение позиции: ${kw}`,
    rankDropMsg: (site, kw, country, drop, from, to) => `*${site}* — «${kw}» (${country}) упал на ${drop} позиций: ${from} → ${to}.`,
    trafficDropTitle: site => `🔻 Просадка трафика: ${site}`,
    trafficDropMsg: (site, pct, from, to) => `*${site}* — клики упали на ${pct}% неделя к неделе: ${from} → ${to}.`,
    sslTitle: site => `🔒 Истекает SSL: ${site}`,
    sslMsg: (site, days) => `*${site}* — SSL-сертификат истекает через ${days} дн. Продлите его (certbot renew / проверьте автопродление).`,
    auditTitle: site => `🩺 Низкий балл аудита: ${site}`,
    auditMsg: (site, score, bad, total) => `*${site}* — health score аудита ${score}/100 (${bad}/${total} страниц с проблемами). Загляните во вкладку Аудит.`,
    digestTitleAll: "📊 Дайджест OpenGSC — все сайты",
    digestTitleTag: tag => `📊 Дайджест OpenGSC — тег «${tag}»`,
    digestWindow: (days, date) => `_Последние ${days} дн. vs предыдущие ${days} дн. · ${date}_`,
    digestNoSitesTag: tag => `Нет сайтов с тегом «${tag}».`,
    digestNoSites: "Сайты ещё не подключены.",
    totalClicks: (cur, delta) => `*Всего кликов:* ${cur} (${delta} к пред. периоду)`,
    moreSites: n => `…и ещё ${n} сайтов`,
    winners: "*🏆 Выросшие запросы:*",
    losers: "*⚠️ Упавшие запросы:*",
    rankMoves: "*📍 Движения позиций:*",
    aiSummary: "🤖 *AI-выжимка:*",
  },
  uk: {
    rankDropTitle: kw => `📉 Падіння позиції: ${kw}`,
    rankDropMsg: (site, kw, country, drop, from, to) => `*${site}* — «${kw}» (${country}) впав на ${drop} позицій: ${from} → ${to}.`,
    trafficDropTitle: site => `🔻 Просідання трафіку: ${site}`,
    trafficDropMsg: (site, pct, from, to) => `*${site}* — кліки впали на ${pct}% тиждень до тижня: ${from} → ${to}.`,
    sslTitle: site => `🔒 Спливає SSL: ${site}`,
    sslMsg: (site, days) => `*${site}* — SSL-сертифікат спливає через ${days} дн. Подовжте його (certbot renew / перевірте автоподовження).`,
    auditTitle: site => `🩺 Низький бал аудиту: ${site}`,
    auditMsg: (site, score, bad, total) => `*${site}* — health score аудиту ${score}/100 (${bad}/${total} сторінок із проблемами). Перегляньте вкладку Аудит.`,
    digestTitleAll: "📊 Дайджест OpenGSC — всі сайти",
    digestTitleTag: tag => `📊 Дайджест OpenGSC — тег «${tag}»`,
    digestWindow: (days, date) => `_Останні ${days} дн. vs попередні ${days} дн. · ${date}_`,
    digestNoSitesTag: tag => `Немає сайтів із тегом «${tag}».`,
    digestNoSites: "Сайти ще не підключені.",
    totalClicks: (cur, delta) => `*Всього кліків:* ${cur} (${delta} до попер. періоду)`,
    moreSites: n => `…і ще ${n} сайтів`,
    winners: "*🏆 Запити, що виросли:*",
    losers: "*⚠️ Запити, що впали:*",
    rankMoves: "*📍 Рухи позицій:*",
    aiSummary: "🤖 *AI-вижимка:*",
  },
};
