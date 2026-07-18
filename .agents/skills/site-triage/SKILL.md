---
name: site-triage
description: "Quick technical & indexing triage of a site via the OpenGSC MCP: health checks (SSL, Safe Browsing, Core Web Vitals), Google index coverage, and what to fix first."
---

# OpenGSC Site Triage

## Goal

A fast "is anything on fire?" pass over one site: security/health status, index coverage, and traffic sanity — ending in a short fix-first list. Ideal as the opening move before any deeper SEO work.

## Required inputs

- The site (domain). Call `list_sites` if unknown.

## OpenGSC MCP tools

- `get_site_health`: SSL expiry/grade, Google Safe Browsing verdict, VirusTotal reputation, Core Web Vitals (mobile).
- `get_indexing_status`: sitemap URL counts by Google index status + recent URL Inspection results.
- `get_search_performance`: 28-day totals — a traffic collapse shows here first.
- `get_rank_tracker`: tracked keywords trending down are an early warning.

## Workflow

1. `get_site_health`. Escalate immediately: expiring/invalid SSL, any Safe Browsing threat, VirusTotal malicious flags. These outrank every SEO consideration.
2. `get_indexing_status`. Compare "not indexed"-type counts against the total; list concrete recently-inspected URLs that are excluded.
3. `get_search_performance` (28 days) — note totals and whether CTR/position look anomalous.
4. `get_rank_tracker` if available — flag keywords with position drops.
5. Rank findings: security > deindexing > vitals > ranking drift.

## Output format

Traffic-light summary (🔴 critical / 🟡 attention / 🟢 fine) per area — security, indexing, vitals, rankings — then a numbered fix-first list with the evidence for each item.

## Guardrails

- "No health data" means the check hasn't been run in OpenGSC — say so, don't guess.
- Sitemap URLs never inspected are unknown, not deindexed.
- Core Web Vitals here are mobile lab/field data as fetched by the app; do not present them as a full CWV audit.
