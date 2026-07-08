# Architecture

This document explains how OpenGSC is put together: the runtime model, the data model, and the
internal design of its two most complex subsystems — the AI SEO Content Suite's generation
pipeline and the Private Indexer Network's cloaking mechanism. It's aimed at contributors who
want to change or extend the code, not at end users (see the main [README](../README.md) for
that).

## 1. Runtime model

OpenGSC is a single Next.js 16 (App Router) application, run as one Node process under PM2. There
is no separate backend service: every server-side operation is a Next.js **Route Handler** under
`src/app/api/**`, and every page under `src/app/**` is a client component that calls those routes.
Persistence is a single **SQLite** file (via Prisma 7 + `@prisma/adapter-better-sqlite3`), which is
why the installer insists on an **absolute** `DATABASE_URL` — a relative path resolves differently
depending on PM2's working directory and silently "loses" data across restarts.

Authentication is **NextAuth v4** with the Google provider only. The first Google account to sign
in becomes the instance owner; every other connected Google account (added under **Settings → My
Google Accounts**) is a linked `Account` row whose OAuth token is used server-side to call the
Search Console / Analytics / Ads-adjacent Google APIs on the user's behalf. There's no separate
multi-tenant user system — this is designed to be one operator's personal dashboard across
multiple Google identities, not a multi-customer SaaS.

Background work (AI generation jobs, cron-style sync) does **not** use a queue broker. It uses two
lightweight patterns instead:

- **Fire-and-forget route handlers** — `POST /api/seo/jobs` creates a `SeoJob` row, calls
  `genByType(...)` **without awaiting it**, and returns the job id immediately. The promise keeps
  running in the same Node process after the HTTP response is sent; when it resolves, a second
  write updates the job row to `completed`/`error`. The client polls `GET /api/seo/jobs/[id]`.
- **In-process interval schedulers** — `[name]-cron` modules (see `pm2 logs` for `aeo-cron`,
  `clarity-cron`, `rank-cron`) run `setInterval`-based sync loops started once at process boot,
  living entirely inside the same PM2 process.

This keeps the deployment story to "one process, one file database" at the cost of jobs not
surviving a process restart mid-flight — which is why `GET /api/seo/jobs` auto-fails anything
stuck in `processing` for more than 20 minutes (see `src/app/api/seo/jobs/route.ts`): a restart
mid-job would otherwise leave a phantom row "processing" forever.

## 2. Data model

`prisma/schema.prisma` groups into six areas:

| Area | Models |
|---|---|
| Auth | `Account`, `Session`, `User`, `VerificationToken` |
| GSC core | `Site`, `SitemapUrl`, `IndexingOperation`, `DailyMetric`, `PageInspection`, `PageInspectionHistory` |
| Growth tools | `TrackedKeyword`, `RankCheck` (Rank Tracker), `TrackedQuestion`, `AeoCheck` (AEO Tracker), `Backlink`, `ContentGroup`, `TopicCluster` |
| Integrations | `ClaritySnapshot`, `SiteHealth` |
| Indexer | `IndexerDomain`, `IndexerLog`, `IndexerQueue`, `IndexerDictionary` |
| SEO Tools | `SeoJob`, `GeoAudit`, `RagSlot`, `RagCasino` |

Notably, **most of the SEO Tools module is client-side only.** Outline/Text/Analysis/Landing
results live in the browser's `localStorage` (`src/lib/seo/history.ts`), capped at 40 records with
oldest-first eviction on quota errors — the `SeoJob` table only exists to survive a page reload
*during* generation (see §1); once a job's result is imported into local History, the server row
is deleted (`src/lib/seo/jobs.ts:importJob`). Editorial **Policy** is `localStorage`-only with no
server table at all. **GEO Audit** is the one exception that's fully server-persisted
(`GeoAudit`), since audits are expensive enough that users expect them to survive indefinitely
across devices/browsers.

## 3. The SEO generation pipeline (`src/lib/seo/generate.ts`)

This is the most intricate part of the codebase. `genOutline()` and `genText()` are each a chain of
LLM passes, not a single prompt — because a single giant prompt asking for "a complete, richly
detailed 3000-word article" reliably degrades mid-generation (prose collapses into bullet lists,
tables get invented values, entity depth thins out after the first few sections).

### 3.1 Outline generation (`genOutline`)

```
mapExtractFacts()        MAP stage — extract compact per-source facts (specs, prices, entities,
                          headings covered) from each scraped competitor, in parallel, bounded
                          concurrency. Keeps the REDUCE prompt grounded in clean facts instead of
                          20 pages of raw HTML.
        ↓
findRagFacts()           optional — pulls verified entity attributes from the Casino RAG knowledge
                          base (RagSlot/RagCasino) when the keyword matches a known slot/casino.
        ↓
buildOutlinePrompt()      REDUCE stage — one call builds the full EAV outline: sections, per-section
  → fetchLLM()            word budgets, weighted+roled entities, keywords, FAQ, visual elements.
        ↓
buildFactScrubPrompt()   corrects fabricated-looking specifics baked into the outline (wrong specs/
  → fetchLLM()            prices/dates/names) BEFORE the text step can inherit them.
        ↓
expandOutlineStructure() if the outline came back flat (H2s with <2 child H3s — typical when a
                          user-supplied template constrains the model), asks for extra H3
                          insertions and grafts them in deterministically.
        ↓
localizeOutlineHeadings() translates/styles any headings left in the wrong language or a flat tone
                          into the article's language + narration voice.
        ↓
normalizeWordBudgets()   DETERMINISTIC, no LLM call: sums each section's own word-count
                          contribution and rescales every section proportionally if the sum is
                          more than ~15% off the requested target. (Models sometimes copy the JSON
                          schema's example numbers into every section instead of computing real
                          ones — this silently turns a 2500-word plan into ~1000 words of budget.)
        ↓
enrichOutlineSections()  deepens every section's entities/summary/copywriter-notes/connections in
                          parallel batches of 5 (2 concurrent workers) — a single outline call
                          compresses detail once there are 15-30 sections; this pass restores it.
```

The outline's `meta` also carries a `facts_bank` (consolidated MAP-stage facts, RAG facts first)
and a `sources` array — both consumed later by the text step, so the article is fact-checked
against the *same* sources the outline was built from, instead of re-searching from scratch.

### 3.2 Text generation (`genText`)

For outlines with 10+ sections, the article is written by `writeTextInChunks()`: sections are
grouped into H2-rooted units, packed into chunks of ≤5 sections, and each chunk is a **separate**
LLM call (bounded concurrency) that only sees the full heading map for context, not the other
chunks' content. Each chunk carries its own word budget and gets one scoped trim pass if it
overshoots by >15%. A deterministic assembler then stitches `H1 + TOC + chunks + FAQ` together —
the TOC's heading label ("Contents"/"Sommaire"/"Índice"/…) is picked from a **static per-language
table** (`tocLabelFor()`), never left to the model, because a model shown one literal example in
its own instructions (e.g. a Russian example) will happily copy it verbatim regardless of the
article's actual language.

If chunking isn't used or a chunk fails after retries, `genText` falls back to a single-shot
`buildTextPrompt()` call with the full outline JSON embedded.

After the article exists, three more passes run **in this exact order** — the order matters and
has been a real source of bugs:

1. **Auto fact-clean** (`buildAutoFactCleanPrompt`) — verifies the article against the facts bank
   and fixes contradictions/fabrications in one pass. This pass is instructed to preserve length,
   but nothing enforces that at the code level, and "fixing" a fact often means *adding* a
   clarifying clause, not removing one.
2. **Volume guard** (`enforceVolumeTarget()`) — expands articles under ~85% of target, iteratively
   trims (up to 3 passes) articles over ~115%. **This runs last, after fact-clean**, specifically
   so a fact-correction pass can never silently re-inflate an article that was already within
   budget — an earlier version ran the guard *before* fact-clean and shipped articles up to +38%
   over their target as a result.
3. **Deterministic guarantees** — `ensureMetaBlock()` and `ensureTocLabel()` re-stamp the SEO meta
   block and TOC label from known-good data (the outline's `meta`), regardless of what any LLM
   pass produced or mangled along the way. Nothing about a fixed, already-known string (a meta
   title, a TOC label) is left to chance this late in the pipeline.

### 3.3 Multi-provider LLM client (`src/lib/llm.ts`)

`fetchLLM()` (and `fetchLLMDetailed()`, which also returns the provider's raw error) is the single
call surface used everywhere in `generate.ts`. It normalizes seven providers (Anthropic, Z.AI,
OpenAI, Gemini, OpenRouter, kie.ai's Responses-API-shaped "Codex" endpoint, and any custom
OpenAI-compatible endpoint) behind one signature, retries `429`/`408`/`5xx` up to 3 times with
backoff + jitter (a `429` is routine when a pipeline stage fires several parallel calls at once —
it must not sink the whole job), and gives up immediately on non-retryable `4xx` (auth errors,
malformed requests, or a provider's own content-policy rejection). `fetchLLMDetailed()` surfaces
that failure reason up through `genText` into the job's `error` field, so a content-policy
rejection (a real, fairly common occurrence for edgier niches like gambling/finance) shows up
readably in History instead of a bare `generation_failed` that sends you spelunking through
`pm2 logs`.

### 3.4 GEO Audit

Unlike the rest of the suite, GEO Audit doesn't use a SERP+scrape pipeline at all. It sends the
user's question directly to an AI provider **with that provider's own live web-search tool
enabled** (OpenAI's Responses API `web_search` tool, or kie.ai's equivalent) and parses the model's
search trace and citations out of the response — the "ground truth" is literally what the AI
already searched and cited, which is the whole point: it's measuring AI-search visibility, not
simulating it.

## 4. The Indexer's cloaking mechanism

The deployable script (generated in four flavors — dynamic PHP, static PHP wrapper, an Astro SSR
middleware, or an Nginx routing config — from `src/app/indexer/settings/page.tsx`) implements a
two-stage bot check:

1. **User-agent match** — a substring check for `googlebot`, `bingbot`, `yandex`, `mail.ru`, or a
   generic `bot|crawler|spider` pattern.
2. **Double DNS verification** (when strict mode is on) — a **reverse** DNS lookup
   (`gethostbyaddr`) of the visitor's IP must resolve to an accepted hostname suffix
   (`googlebot.com`/`google.com`, `yandex.ru`/`.net`/`.com`, `search.msn.com`, `mail.ru`), and then
   a **forward** lookup of *that* hostname must resolve back to the exact same IP. This defeats a
   spoofed `User-Agent: Googlebot` header, since an attacker cannot control the PTR record inside
   Google's or Yandex's own IP ranges — only the real crawler's IP will pass both directions.

Bots that pass both checks receive a generated doorway page (word-mashed from the domain's
Dictionary entries) with an `ETag`-based `304 Not Modified` short-circuit on repeat crawls — this
is what the Stats dashboard's per-bot `304` columns measure: a high 304 rate means a bot is
efficiently re-checking a page it already has, without the script burning CPU regenerating content
it doesn't need to. Every verified bot hit also fires a logging ping to
`POST /api/indexer/webhook`, which is what populates the Logs and Stats pages. Anyone who fails
either check — real humans and unverified/fake bots alike — is redirected (302) straight to the
configured money-site URL, so the doorway content is never visible to anyone outside the
whitelisted crawlers.

The **Links** planner (ring/mesh/pyramid topologies) and the **Queue** (money-site URLs to weave
in as internal links) are purely data feeding the next content-generation pass on each domain —
they don't call any external service, they just shape what the script's word-mashing logic links
to.

## 5. Extending the project

- **Add an LLM provider**: extend the `if/else if` chain in `fetchLLMOnce()`
  (`src/lib/llm.ts`) with the new provider's request/response shape, plus a matching branch in
  `fetchLLMVision()` if it should support screenshot-to-structure. No other file needs to change —
  every call site already goes through `fetchLLM`/`fetchLLMDetailed`.
- **Change a generation prompt**: all prompt text lives in `src/lib/seo/prompts.ts` as pure
  string-building functions (`buildOutlinePrompt`, `buildTextPrompt`, `buildSectionTextPrompt`,
  etc.) — `generate.ts` never inlines prompt text, so prompt changes and pipeline/control-flow
  changes stay in separate files.
- **Add a new SEO Tools sub-page**: follow the existing pattern — a `page.tsx` under
  `src/app/seo-tools/`, a route handler under `src/app/api/seo/`, and (if it should be
  resumable/backgroundable) a new branch in `genByType()` plus a `HistoryType` entry in
  `src/lib/seo/history.ts`.
- **Add a new indexer bot/search engine**: extend the user-agent match list and the accepted PTR
  suffix list together, in whichever script template(s) in `src/app/indexer/settings/page.tsx` you
  need to support — keep both lists in sync, since a bot recognized by user-agent but missing from
  the PTR-suffix list will always fail strict verification.
