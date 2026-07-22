// Rich Results Test automation — the only public way to see how the REAL Googlebot (from a real
// Google IP) renders an arbitrary competitor URL. This is what reveals IP-based cloaking that a
// User-Agent spoof (followChain) and a datacenter render (Firecrawl) cannot.
//
// HONEST CAVEATS (read before relying on this):
//  • There is NO official Rich Results Test API (the old Mobile-Friendly Test API that returned
//    rendered HTML was retired by Google end-2024). So we automate the public web tool with a
//    headless browser. This is against Google's ToS for automated access — use at your own risk.
//  • Google's tool DOM/class names change without notice → the selectors below WILL eventually
//    need adjustment. They are intentionally text/role based (multi-locale) to survive longer.
//  • reCAPTCHA can appear under load. When it does, this returns { ok:false, error:"captcha" } and
//    the user should fall back to the manual "paste Rich Results HTML" path.
//  • Requires Playwright + Chromium installed on the server (optionalDependency). If missing we
//    return { ok:false, error:"playwright_not_installed" } — the feature simply stays unavailable.
//
// Default is ANONYMOUS (no Google login) so the server never has to hold Google session cookies.
// Optionally a storageState (exported logged-in session) can be supplied for higher rate limits.

export interface RichResultsFetch {
  ok: boolean;
  html?: string;
  screenshot?: string; // base64 data URL
  error?: string;
}

const RRT_URL = "https://search.google.com/test/rich-results";

// Text labels the tool uses across locales for the buttons we click. Add more as needed.
const TEST_BTN = [/^test url$/i, /^test$/i, /^проверить url$/i, /^проверить$/i, /^перевірити/i];
const VIEW_PAGE = [/view (tested|crawled) page/i, /посмотреть проверенную страницу/i, /просмотреть проверенную/i, /переглянути перевірену/i];
const HTML_TAB = [/^html$/i, /^код html$/i, /^html-код$/i];

function looksLikeHtml(s: string): boolean {
  const t = s.trim().slice(0, 200).toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || (t.includes("<html") && t.includes("<head"));
}

export async function fetchRichResultsHtml(url: string, opts?: { storageState?: any; timeoutMs?: number }): Promise<RichResultsFetch> {
  let chromium: any;
  try {
    // Non-literal specifier: keeps `playwright` an optional runtime dep (not required at build /
    // type-check time). If it isn't installed, the import throws and we report it gracefully.
    const spec = "playwright";
    const mod: any = await import(spec);
    chromium = mod.chromium;
    if (!chromium) throw new Error("no chromium export");
  } catch {
    return { ok: false, error: "playwright_not_installed" };
  }

  const timeout = opts?.timeoutMs ?? 90_000;
  let browser: any;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"] });
    const context = await browser.newContext({
      ...(opts?.storageState ? { storageState: opts.storageState } : {}),
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-US",
    });
    const page = await context.newPage();

    // Prefill the URL and let the tool start; then explicitly click Test if it didn't auto-run.
    await page.goto(`${RRT_URL}?url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // reCAPTCHA guard
    if (await page.locator("iframe[src*='recaptcha'], iframe[title*='recaptcha']").count().catch(() => 0)) {
      await browser.close();
      return { ok: false, error: "captcha" };
    }

    // Click "Test URL" if present (some entry points require it).
    for (const re of TEST_BTN) {
      const btn = page.getByRole("button", { name: re });
      if (await btn.count().catch(() => 0)) { await btn.first().click().catch(() => {}); break; }
    }

    // Wait for the test to finish — the "View tested page" affordance appears when done.
    let viewBtn: any = null;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await page.locator("iframe[src*='recaptcha']").count().catch(() => 0)) { await browser.close(); return { ok: false, error: "captcha" }; }
      for (const re of VIEW_PAGE) {
        const b = page.getByText(re).first();
        if (await b.count().catch(() => 0)) { viewBtn = b; break; }
      }
      if (viewBtn) break;
      await page.waitForTimeout(2000);
    }
    if (!viewBtn) { await browser.close(); return { ok: false, error: "timeout_no_result" }; }

    await viewBtn.click().catch(() => {});
    await page.waitForTimeout(1500);

    // Switch to the HTML tab in the opened drawer.
    for (const re of HTML_TAB) {
      const tab = page.getByText(re).first();
      if (await tab.count().catch(() => 0)) { await tab.click().catch(() => {}); break; }
    }
    await page.waitForTimeout(1000);

    // Extract the biggest HTML-looking text block on the page (the rendered source viewer).
    const html: string = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("pre, code, textarea, div"));
      let best = "";
      for (const n of nodes) {
        const txt = (n as HTMLElement).innerText || (n as HTMLTextAreaElement).value || "";
        const low = txt.trim().slice(0, 80).toLowerCase();
        if ((low.startsWith("<!doctype") || low.startsWith("<html")) && txt.length > best.length) best = txt;
      }
      return best;
    }).catch(() => "");

    // Best-effort screenshot from the Screenshot tab (optional).
    let screenshot: string | undefined;
    try {
      const shot = await page.screenshot({ type: "png" });
      screenshot = `data:image/png;base64,${Buffer.from(shot).toString("base64")}`;
    } catch {}

    await browser.close();

    if (html && looksLikeHtml(html)) return { ok: true, html, screenshot };
    return { ok: false, error: "html_not_found", screenshot };
  } catch (e: any) {
    try { await browser?.close(); } catch {}
    return { ok: false, error: String(e?.message ?? e) };
  }
}
