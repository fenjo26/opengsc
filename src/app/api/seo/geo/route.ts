import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runGeoAudit } from "@/lib/seo/geo";

// GeoAudit isn't in the committed generated client until `prisma generate` re-runs on
// build; access it via a loose handle so types resolve everywhere (mirrors SeoJob).
const audits = () => (prisma as any).geoAudit;

// Detached background run — not awaited by the request, so the result is persisted even
// if the client navigates away. The OpenAI key lives only in memory for the run.
function runAudit(id: string, params: { query: string; language: string; country: string; model: string; apiKey: string }) {
  runGeoAudit(params)
    .then(async (r) => {
      if (r.ok) await audits().update({ where: { id }, data: { status: "completed", report: JSON.stringify(r.data) } });
      else await audits().update({ where: { id }, data: { status: "error", error: r.error } });
    })
    .catch(async (e: any) => {
      try { await audits().update({ where: { id }, data: { status: "error", error: String(e?.message ?? e) } }); } catch {}
    });
}

// POST /api/seo/geo — start a GEO audit. body: { query, language?, country?, model?, apiKey }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json();
  const query = String(b.query ?? "").trim().slice(0, 300);
  if (!query) return NextResponse.json({ error: "no_query" }, { status: 400 });
  const apiKey = String(b.apiKey ?? "");
  if (!apiKey) return NextResponse.json({ error: "no_openai_key" }, { status: 400 });
  const language = String(b.language ?? "en");
  const country = String(b.country ?? "us");
  const model = String(b.model ?? "gpt-5") || "gpt-5";

  let rec: any;
  try {
    rec = await audits().create({ data: { userId, query, language, country, model, status: "processing" } });
  } catch (e: any) {
    return NextResponse.json({ error: `db: ${String(e?.message ?? e)} (run: npx prisma db push)` }, { status: 500 });
  }

  runAudit(rec.id, { query, language, country, model, apiKey }); // fire-and-forget
  return NextResponse.json({ id: rec.id });
}

// GET /api/seo/geo — list the user's recent audits (metadata only, no full report).
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // Auto-fail audits stuck "processing" past the max window (server may have restarted).
    const cutoff = new Date(Date.now() - 20 * 60 * 1000);
    try { await audits().updateMany({ where: { userId, status: "processing", updatedAt: { lt: cutoff } }, data: { status: "error", error: "stale_timeout" } }); } catch {}
    const list = await audits().findMany({
      where: { userId }, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, query: true, language: true, country: true, model: true, status: true, error: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ audits: list });
  } catch {
    return NextResponse.json({ audits: [] }); // table not migrated yet → empty, no crash
  }
}
