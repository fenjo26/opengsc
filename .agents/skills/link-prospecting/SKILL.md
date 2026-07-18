---
name: link-prospecting
description: "Find link-building and digital-PR opportunities via the OpenGSC MCP: mine competitor backlink mentions (Link Monitor), spot multi-linker domains, and check the site's own backlink health."
---

# OpenGSC Link Prospecting

## Goal

Produce a concrete outreach shortlist: which domains to contact, why they're likely to link, and what content to pitch — grounded in the fresh competitor backlinks the user's Link Monitor has already pulled from Ahrefs.

## Required inputs

- Optional: a specific watched brand to focus on, and the user's own site for the backlink-health check.

## OpenGSC MCP tools

- `get_link_mentions`: fresh quality backlinks earned by the watched competitor brands + `multiLinkerDomains` (domains linking to 2+ brands — the highest-probability outreach targets). This is the core tool.
- `get_backlinks`: the user's OWN curated backlink inventory with liveness/indexed status — use to spot dead links worth reclaiming.
- `list_sites`: resolve the user's site if backlink health is in scope.

## Workflow

1. Call `get_link_mentions`. If it returns a "no data yet" note, stop and tell the user to add brands and run a pull under SEO Tools → Link Monitor.
2. Prioritize `multiLinkerDomains`: a domain that linked to two competitors but not the user is the warmest lead.
3. From `mentions`, infer WHAT earns links in this niche: content types (studies, comparisons, tools), anchor patterns, and the context titles suggest.
4. If the user's site is known, call `get_backlinks` and list dead (`alive: false`) links as reclamation targets — the cheapest wins in link building.
5. Build the outreach shortlist with a specific pitch angle per domain.

## Output format

- Top 5 outreach targets: domain, DR (from data), which brands it linked, suggested pitch.
- Content/PR ideas the mention data supports (with example source titles as evidence).
- Reclamation list (dead backlinks), if any.

## Guardrails

- Do not fabricate DR values or mentions; every claim must trace to a returned row.
- Never suggest paid links or PBNs; keep recommendations white-hat outreach/content.
