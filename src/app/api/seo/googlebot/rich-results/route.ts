import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseSeoSignals } from "@/lib/seo/googlebot";
import { fetchRichResultsHtml } from "@/lib/seo/richResults";
import fs from "fs";

// POST /api/seo/googlebot/rich-results
// body: { url: string, html?: string }
//   - html present → parse that pasted Rich Results HTML (reliable manual path)
//   - html absent  → automate the Rich Results Test via Playwright (experimental)
// → { ok, view?, error?, screenshot? }
//
// The returned `view` mirrors the ViewResult shape used by the main tool so the client can drop
// it straight into the content viewer / signals bar / diff as the authoritative "real Googlebot"
// (from a Google IP) view — the one that exposes IP-based cloaking.

function stripText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildView(url: string, html: string, screenshot?: string) {
  const signals = parseSeoSignals(url, html);
  const bodyText = stripText(html);
  return {
    ua: "gbRichResults",
    ok: true,
    rendered: true,
    hops: [{ url, status: 200 }],
    finalUrl: url,
    finalStatus: 200,
    headers: {},
    signals,
    bodyHash: "",
    wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
    bodyText: bodyText.slice(0, 40_000),
    htmlRaw: html.slice(0, 500_000),
    screenshot,
  };
}

// Optional logged-in Google session (for higher limits). Path set via env; anonymous by default.
function loadStorageState(): any | undefined {
  const p = process.env.GOOGLE_RICH_RESULTS_STORAGE_STATE;
  if (!p) return undefined;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return undefined; }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  let url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) return NextResponse.json({ error: "bad_url" }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try { new URL(url); } catch { return NextResponse.json({ error: "bad_url" }, { status: 400 }); }

  // Manual paste path — reliable, no automation.
  const pasted = typeof body.html === "string" ? body.html.trim() : "";
  if (pasted) {
    if (pasted.length < 40 || !/<html|<!doctype|<head|<body/i.test(pasted)) {
      return NextResponse.json({ error: "not_html" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, view: buildView(url, pasted) });
  }

  // Automated path — Playwright drives the Rich Results Test.
  const res = await fetchRichResultsHtml(url, { storageState: loadStorageState() });
  if (!res.ok || !res.html) {
    return NextResponse.json({ ok: false, error: res.error || "failed", screenshot: res.screenshot }, { status: 200 });
  }
  return NextResponse.json({ ok: true, view: buildView(url, res.html, res.screenshot) });
}
