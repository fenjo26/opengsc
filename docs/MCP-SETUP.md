# MCP Setup — Connect AI Agents to OpenGSC

OpenGSC exposes an MCP (Model Context Protocol) server at `/api/mcp`, so AI agents can query
your SEO data directly: Claude Code, Claude Desktop, Cursor, Codex CLI, or any MCP-capable
client. All tools are **read-only** and served from your instance's local database — agent
traffic never spends your SERP/AI API credits or your Google quota.

## 1. Generate a token

**Settings → API & MCP → Generate token.** The token (`ogsc_…`) grants read access to all
your OpenGSC data — treat it like a password; you can rotate or revoke it on the same page.

## 2. Connect your client

The endpoint is `https://your-domain.com/api/mcp` (Streamable HTTP transport).

**Claude Code**

```bash
claude mcp add --transport http opengsc https://your-domain.com/api/mcp \
  --header "Authorization: Bearer ogsc_YOUR_TOKEN"
```

**Claude Desktop** — Settings → Connectors → *Add custom connector*: URL as above, and add the
`Authorization: Bearer ogsc_YOUR_TOKEN` header.

**Cursor** — add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "opengsc": {
      "url": "https://your-domain.com/api/mcp",
      "headers": { "Authorization": "Bearer ogsc_YOUR_TOKEN" }
    }
  }
}
```

**Codex CLI** — add to `~/.codex/config.toml`:

```toml
[mcp_servers.opengsc]
url = "https://your-domain.com/api/mcp"
http_headers = { "Authorization" = "Bearer ogsc_YOUR_TOKEN" }
```

Then try: *“Look at mysite.com in OpenGSC — which keywords are in striking distance and what
should I do first?”*

## 3. Available tools

| Tool | Returns |
|---|---|
| `get_capabilities` | Instance overview: tools, data freshness, which modules have data — call first |
| `list_sites` | Every connected site across all Google accounts |
| `get_search_performance` | GSC totals + top queries/pages for a date window; `page` param scopes to one page |
| `compare_periods` | Period-over-period deltas: winners, losers, new & lost queries/pages |
| `get_striking_distance` | Queries at positions 4–20 with impressions — fastest wins |
| `get_cannibalization` | Queries where 2+ of the site's own URLs compete |
| `get_rank_tracker` | Tracked keyword positions with direction |
| `get_aeo_visibility` | AI answer-engine citation state per tracked question |
| `get_backlinks` | The site's own backlink inventory with liveness/index status |
| `get_link_mentions` | Competitor backlinks (Link Monitor) + multi-linker domains |
| `get_site_health` | SSL / Safe Browsing / VirusTotal / Core Web Vitals snapshot |
| `get_indexing_status` | Sitemap index-status counts + recent URL inspections (cached) |
| `get_site_audit` | Latest built-in-crawler audit: health score, issues, affected URLs |
| `execute_sql_query` | Run an arbitrary read-only SELECT SQL query against local SQLite tables (advanced analysis) |
| `query_gsc_live` ⚡ | LIVE Search Analytics with country/device/date dimensions (Google quota) |
| `inspect_url` ⚡ | LIVE URL Inspection for up to 10 URLs (Google quota; also updates the Indexing tab) |

⚡ = calls Google's API through your own OAuth token — free, but subject to Google's daily
quotas. Everything else reads the local database and costs nothing.

### Custom SQL Queries
Using the `execute_sql_query` tool, your AI agent can perform advanced custom analyses by executing SQLite queries. Key read-only tables include:
- `Site` (id, url, siteId, tags, brandedKeywords, clarityProjectId, ga4PropertyId)
- `DailyMetric` (siteId, date, url, query, clicks, impressions, ctr, position)
- `TrackedKeyword` (keyword, country, device, lastPosition, prevPosition, lastUrl)
- `SitemapUrl` (siteId, url, googleStatus, googleChecked, xrStatus)
- `SiteAudit` (siteId, status, finishedAt, pagesCrawled, summary)
- `Backlink` (siteId, url, title, isAlive, xrStatus)

Safety model: the query runs on a **separate SQLite connection opened read-only at the
engine level** (writes are impossible regardless of query text), only a single
SELECT/WITH statement is accepted, the credential tables (`User`, `Account`, `Session`)
are blocked entirely, results are capped at 500 rows, and rows carrying a `userId`/`siteId`
column are additionally scoped to your own sites.

## 4. Agent skills

The repo ships ready-made skills in [`.agents/skills/`](../.agents/skills/) that orchestrate
these tools into complete workflows:

- `gsc-performance-review` — striking distance + cannibalization → prioritized action plan
- `link-prospecting` — Link Monitor mentions → outreach shortlist with pitch angles
- `aeo-visibility-review` — AI-search scoreboard → how to win uncited questions
- `site-triage` — health + indexing + traffic → "is anything on fire?" report

For Claude Code, copy them into your project's `.claude/skills/` (or reference the folder in
your agent's skills configuration). Each skill documents its required inputs, tool sequence,
output format, and guardrails.

## Security notes

- The token authorizes read access to everything the owning account sees. One token per
  account; rotating invalidates the old one immediately.
- The endpoint is stateless JSON-RPC over HTTPS — no session is stored server-side.
- Keep your instance behind HTTPS (the default VPS install does this via Let's Encrypt);
  never paste the token into untrusted tools.
