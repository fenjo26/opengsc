// AEO Tracker — checks whether a site is cited/mentioned by AI answer engines for a tracked
// question. ChatGPT and Perplexity use live web search; a citation URL matching the site's
// domain is the strongest signal. Claude and Grok have no guaranteed live browsing via the
// plain chat API, so they fall back to text-mention matching against the domain and the
// site's branded keywords (Site.brandedKeywords — the same field used elsewhere for branded
// query classification).

export type AeoEngine = "chatgpt" | "perplexity" | "claude" | "grok";

export interface AeoCheckResult {
  cited: boolean;
  url: string | null;
  snippet: string | null;
  error?: string;
}

function hostOf(input: string): string {
  let d = (input || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^sc-domain:/, "");
  d = d.split("/")[0];
  return d.replace(/^www\./, "");
}

// Unified "did this answer cite/mention us" check: a citation URL on our domain wins outright;
// otherwise fall back to a plain substring match of the domain or any branded term in the text.
function findCitationMatch(
  host: string, brandTerms: string[], answerText: string, citationUrls: string[],
): { cited: boolean; url: string | null } {
  for (const u of citationUrls) {
    try {
      const h = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
      if (h === host || h.endsWith("." + host)) return { cited: true, url: u };
    } catch { /* malformed URL — skip */ }
  }
  const hay = answerText.toLowerCase();
  if (host && hay.includes(host)) return { cited: true, url: null };
  for (const term of brandTerms) {
    const t = term.trim().toLowerCase();
    if (t.length >= 3 && hay.includes(t)) return { cited: true, url: null };
  }
  return { cited: false, url: null };
}

function snippetAround(text: string, needle: string, span = 160): string | null {
  if (!text || !needle) return null;
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - Math.floor(span / 2));
  return text.slice(start, start + span).trim();
}

// ─── ChatGPT — OpenAI Responses API + web_search tool ────────────────────────
async function callOpenAiWebSearch(apiKey: string, question: string): Promise<{ text: string; urls: string[] } | { error: string }> {
  async function call(toolType: string) {
    return fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        stream: false,
        tools: [{ type: toolType }],
        tool_choice: "auto",
        input: question,
      }),
      signal: AbortSignal.timeout(60000),
    });
  }
  try {
    let res = await call("web_search");
    if (!res.ok) {
      const errText = await res.text();
      // Older snapshots expose the tool as `web_search_preview` — retry once.
      if (/web_search(?!_preview)/.test(errText) || /tool/i.test(errText)) res = await call("web_search_preview");
      if (!res.ok) {
        const t2 = res.ok ? "" : await res.text().catch(() => errText);
        return { error: `chatgpt ${res.status}: ${(t2 || errText).slice(0, 200)}` };
      }
    }
    const data = await res.json();
    const out: any[] = Array.isArray(data?.output) ? data.output : [];
    let text = "";
    const urls: string[] = [];
    for (const item of out) {
      if (item?.type !== "message") continue;
      const content: any[] = Array.isArray(item.content) ? item.content : [];
      for (const c of content) {
        if (typeof c?.text === "string") text += c.text + "\n";
        for (const a of (c?.annotations ?? [])) if (a?.type === "url_citation" && a.url) urls.push(a.url);
      }
    }
    if (!text && typeof data?.output_text === "string") text = data.output_text;
    return { text: text.trim(), urls };
  } catch (e: any) {
    return { error: e?.name === "AbortError" ? "timeout" : String(e?.message ?? e) };
  }
}

export async function checkChatGpt(apiKey: string, question: string, domain: string, brandTerms: string[]): Promise<AeoCheckResult> {
  const host = hostOf(domain);
  const r = await callOpenAiWebSearch(apiKey, question);
  if ("error" in r) return { cited: false, url: null, snippet: null, error: r.error };
  const m = findCitationMatch(host, brandTerms, r.text, r.urls);
  return { cited: m.cited, url: m.url, snippet: m.cited ? snippetAround(r.text, m.url ? host : (brandTerms[0] || host)) : null };
}

// ─── Perplexity — chat completions with built-in web search + citations ──────
export async function checkPerplexity(apiKey: string, question: string, domain: string, brandTerms: string[]): Promise<AeoCheckResult> {
  const host = hostOf(domain);
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: question }],
        return_citations: true,
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return { cited: false, url: null, snippet: null, error: `perplexity ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const urls: string[] = Array.isArray(data?.citations) ? data.citations : [];
    const m = findCitationMatch(host, brandTerms, text, urls);
    return { cited: m.cited, url: m.url, snippet: m.cited ? snippetAround(text, m.url ? host : (brandTerms[0] || host)) : null };
  } catch (e: any) {
    return { cited: false, url: null, snippet: null, error: `сеть Perplexity: ${e?.name === "AbortError" ? "timeout" : (e?.message ?? e)}` };
  }
}

// ─── Claude — plain chat, no guaranteed browsing → text-mention match ────────
export async function checkClaude(apiKey: string, question: string, domain: string, brandTerms: string[]): Promise<AeoCheckResult> {
  const host = hostOf(domain);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: question }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return { cited: false, url: null, snippet: null, error: `claude ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const data = await res.json();
    const text: string = (data?.content ?? []).map((c: any) => c?.text ?? "").join("\n");
    const m = findCitationMatch(host, brandTerms, text, []);
    return { cited: m.cited, url: null, snippet: m.cited ? snippetAround(text, brandTerms[0] || host) : null };
  } catch (e: any) {
    return { cited: false, url: null, snippet: null, error: `сеть Claude: ${e?.name === "AbortError" ? "timeout" : (e?.message ?? e)}` };
  }
}

// ─── Grok (xAI) — OpenAI-compatible chat completions → text-mention match ────
export async function checkGrok(apiKey: string, question: string, domain: string, brandTerms: string[]): Promise<AeoCheckResult> {
  const host = hostOf(domain);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      // grok-3-mini: cheapest current xAI model as of this writing — update here if xAI
      // renames/retires it.
      body: JSON.stringify({ model: "grok-3-mini", messages: [{ role: "user", content: question }] }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return { cited: false, url: null, snippet: null, error: `grok ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const m = findCitationMatch(host, brandTerms, text, []);
    return { cited: m.cited, url: null, snippet: m.cited ? snippetAround(text, brandTerms[0] || host) : null };
  } catch (e: any) {
    return { cited: false, url: null, snippet: null, error: `сеть Grok: ${e?.name === "AbortError" ? "timeout" : (e?.message ?? e)}` };
  }
}

export async function runAeoCheck(
  engine: AeoEngine, apiKey: string, question: string, domain: string, brandTerms: string[],
): Promise<AeoCheckResult> {
  if (!apiKey) return { cited: false, url: null, snippet: null, error: "no_key" };
  switch (engine) {
    case "chatgpt": return checkChatGpt(apiKey, question, domain, brandTerms);
    case "perplexity": return checkPerplexity(apiKey, question, domain, brandTerms);
    case "claude": return checkClaude(apiKey, question, domain, brandTerms);
    case "grok": return checkGrok(apiKey, question, domain, brandTerms);
  }
}

export const AEO_ENGINES: AeoEngine[] = ["chatgpt", "perplexity", "claude", "grok"];
