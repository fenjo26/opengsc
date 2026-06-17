import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runSerp, heuristicSiteType, SerpEngine } from "@/lib/seo/serp";

// POST /api/seo/serp
// body: { keyword, provider, apiKey, gl?, hl?, location?, num?, engine? }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const b = await req.json();
  const keyword = String(b.keyword ?? "").trim();
  if (!keyword) return NextResponse.json({ error: "no_keyword" }, { status: 400 });

  const provider = String(b.provider ?? "serper");
  const apiKey = String(b.apiKey ?? "");
  const engine = (b.engine as SerpEngine) ?? "google";

  const serp = await runSerp(provider, apiKey, keyword, {
    gl: b.gl, hl: b.hl, location: b.location, num: b.num ?? 10, engine,
  });

  if (serp.error) {
    return NextResponse.json({ error: serp.error, results: [] }, { status: 502 });
  }

  // Attach cheap heuristic site_type so the UI can show who's likely cited in AI.
  const results = serp.results.map((r) => ({
    ...r,
    site_type: heuristicSiteType(r.domain),
  }));

  return NextResponse.json({ ...serp, results });
}
