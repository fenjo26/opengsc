# Bing, Yandex & IndexNow Setup

OpenGSC shows Google Search Console as the primary, locally-synced data source — and can
additionally show **live Bing Webmaster** and **Yandex.Webmaster** data for the same site,
plus push URLs via **IndexNow**. This guide covers getting each credential and what data
every engine exposes.

Where things live in the app:

- **Settings → Indexing API** — paste the Bing API key, Yandex OAuth token, and IndexNow key.
- **Site page → engine switcher** (G | Bing | Я next to the chart toolbar) — live dashboard
  per engine: clicks, impressions, CTR, weighted average position, traffic chart, top
  queries (+ top pages and index/crawl stats for Bing, SQI and site diagnostics for Yandex).
  The **Sync** button refreshes Google data *and* every connected engine at once.
- **Main dashboard → engine tabs** (Google · Bing · Yandex) — the *whole portfolio* per
  engine: Bing/Yandex enumerate **their own** verified sites (across every connected account),
  with the same KPI cards, per-site sparkline cards, sorting, search, tags and CSV as Google.
  Results are cached server-side, so a tab opens instantly after the first build; **Sync**
  (or the tab's own refresh) rebuilds live with retries so no site is dropped under throttling.
- **Digest → engine tabs** — the portfolio digest splits per engine (gainers/losers,
  attention, per-site totals), reusing the cached engine portfolio.
- **Site-search badge** on each site card follows the active engine tab: **G** → Google,
  **b** → Bing, **Я** → Yandex (`site:domain` search).
- **Site page → Indexing tab → Search engines panel** — actions: submit sitemap to
  Bing/Yandex, send URLs for Yandex recrawl, push URLs via IndexNow.

Keys are stored browser-side (`seoKey_*`, backed up to your server via the settings sync,
same as every other key in OpenGSC) and sent per-request — nothing is shared with third
parties beyond the engine's own API.

---

## Bing Webmaster API

> ⚠️ **Use API Key, NOT OAuth Client.** Bing offers two auth methods — OAuth 2.0
> (Client ID + Client Secret) and a simple API Key. OpenGSC uses the **API Key** method.
> If you generate an OAuth Client, OpenGSC has nowhere to put the Client ID/Secret — you
> need the single API Key string instead.

**Getting the key (~2 minutes):**

1. Sign in to [Bing Webmaster Tools](https://www.bing.com/webmasters) and make sure your
   site is added and verified there (import from Google Search Console is the fastest way —
   Bing offers it on first login).
2. Click the **⚙ Settings** gear (top right) → **API Access**.
3. Choose **API Key** (not *OAuth Client*), then click **Generate API Key**. One key is
   generated per user and works for all your verified sites.
4. Copy the key and add it in **OpenGSC → Settings → Indexing API → Bing Webmaster** as a
   connected account (an optional name + the key). If you manage several Bing accounts, add
   each one; then pick which account a site uses in that site's **Indexing** tab.

**What OpenGSC pulls:** rank & traffic stats (clicks/impressions series), top queries with
average impression position, top pages, and crawl stats (pages in the Bing index, 4xx/5xx
crawl errors, robots.txt blocks). Sitemap submission works through the API when the key is
present, or falls back to the public ping endpoint without a key.

**Quota:** the Bing Webmaster API allows 10,000 requests/day per key — far beyond what the
dashboard uses.

---

## Yandex.Webmaster API

**Getting the OAuth token (~5 minutes):**

1. Make sure your site is added and verified in
   [Yandex.Webmaster](https://webmaster.yandex.com) under the same Yandex account.

2. Go to [oauth.yandex.ru](https://oauth.yandex.ru) and click **Создать приложение**
   (Create app).

3. **Шаг 1 — Общие сведения (General info):**
   - **Название сервиса** — enter any name, e.g. `OpenGSC`.
   - **Иконка** — optional, skip it.

4. **Шаг 2 — Платформы приложений (Platforms):**
   - Check **Веб-сервисы** (Web services).
   - **Redirect URI** — paste exactly:
     ```
     https://oauth.yandex.ru/verification_code
     ```
     Click the **+** button to add it.
   - **Suggest Hostname** — leave empty (this field is optional, it's for login widgets on
     your site — not needed for API access).
   - Leave **iOS-приложение** and **Android-приложение** unchecked.
   - Click **Продолжить** (Continue).

5. **Шаг 3 — Доступы (Permissions):**
   - Find the **Яндекс.Вебмастер** section in the list.
   - Check **all** boxes under it (host info, verification, etc.).
   - Click **Продолжить** (Continue).

6. **Шаг 4 — Подтверждение (Confirm):**
   - Review and click **Создать приложение** (Create app).
   - You'll see the app page — copy the **ClientID** (looks like a long hex string).

7. **Get the token** — open this URL in your browser, replacing `<ClientID>` with the value
   from step 6:

   ```
   https://oauth.yandex.ru/authorize?response_type=token&client_id=<ClientID>
   ```

8. Yandex will ask you to approve access. Click **Разрешить** (Allow).
   The page will show your OAuth token (starts with `y0_AgAA…`).

9. Copy the token and paste it into **OpenGSC → Settings → Яндекс.Вебмастер → Global
   Default OAuth Token** (or into a specific connected account).

> The token is long-lived (typically ~1 year). When it expires, repeat steps 7–9 with the
> same ClientID — no need to create a new app.

**What OpenGSC pulls:** host summary (SQI/ИКС, pages in search, excluded pages), clicks &
impressions history (8 weeks), top-25 popular queries with average show position, site
diagnostics (FATAL/CRITICAL/POSSIBLE problems as flagged by Yandex), and the recrawl quota.
Actions: submit a sitemap (`user-added-sitemaps`) and send up to 10 URLs per click for
reindexing (`recrawl/queue` — Yandex enforces a daily per-host quota, shown in the view).

---

## IndexNow

IndexNow instantly notifies participating engines (Bing, Yandex, Seznam, Naver, …) about
new/changed URLs. No account needed — just a key file on your site:

1. Generate a key — any 8–128 char hex string works, e.g. `openssl rand -hex 16`.
2. Host it as a text file at `https://your-domain.com/<key>.txt`, containing the key itself
   as the file's only content.
3. Paste the key into **OpenGSC → Settings → Indexing API → IndexNow**.
4. Push URLs from the site's **Indexing tab → Search engines panel** (one per line).

OpenGSC submits through `api.indexnow.org`, which fans out to all participating engines —
one push covers Bing and Yandex at once.

---

## FAQ

- **The switcher doesn't show Bing/Я buttons** — the key/token isn't saved yet (they appear
  only when configured), or the page needs a reload after saving.
- **Yandex: "site not found in this account"** — the OAuth token belongs to a Yandex account
  that doesn't have this exact host in Webmaster. Add & verify the site there first.
- **Bing returns empty stats** — a freshly added site has no accumulated data yet; Bing
  needs a few days after verification.
- **Why is the average position marked with "≈"?** — Neither Bing nor Yandex expose a
  sitewide daily position series the way GSC does. OpenGSC computes an impression-weighted
  average across the top queries returned by the API — useful for trends, but not directly
  comparable to the GSC position number.
- **Are Bing/Yandex data stored in my database?** — No. Google (GSC) is the locally-synced
  source of truth; Bing/Yandex views are fetched live from their APIs on open and on Sync.
