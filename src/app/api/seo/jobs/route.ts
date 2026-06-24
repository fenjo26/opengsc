import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { genByType } from "@/lib/seo/generate";

// SeoJob model isn't in the committed generated client until `prisma generate` re-runs
// on build; access it via a loose handle so types resolve everywhere.
const jobs = () => (prisma as any).seoJob;

// Detached background run — not awaited by the request, so the result is persisted even
// if the client navigates away or closes the tab. Keys live only in memory for the run.
function runJob(jobId: string, type: string, payload: any) {
  genByType(type, payload)
    .then(async (r) => {
      if (r.ok) await jobs().update({ where: { id: jobId }, data: { status: "completed", result: JSON.stringify(r.data) } });
      else await jobs().update({ where: { id: jobId }, data: { status: "error", error: r.error } });
    })
    .catch(async (e: any) => {
      try { await jobs().update({ where: { id: jobId }, data: { status: "error", error: String(e?.message ?? e) } }); } catch {}
    });
}

// POST /api/seo/jobs — start a background generation job. body: { type, keyword?, payload, meta? }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json();
  const type = String(b.type ?? "");
  if (!["outline", "text", "analysis"].includes(type)) return NextResponse.json({ error: "bad_type" }, { status: 400 });
  const payload = b.payload ?? {};
  const keyword = String(b.keyword ?? payload?.keyword ?? payload?.outline?.meta?.keyword ?? "").slice(0, 300);

  let job: any;
  try {
    job = await jobs().create({ data: { userId, type, keyword, status: "processing", meta: b.meta ? JSON.stringify(b.meta) : null } });
  } catch (e: any) {
    return NextResponse.json({ error: `db: ${String(e?.message ?? e)} (run: npx prisma db push)` }, { status: 500 });
  }

  runJob(job.id, type, payload); // fire-and-forget
  return NextResponse.json({ jobId: job.id });
}

// GET /api/seo/jobs — list the current user's recent jobs (incl. result, so History can import).
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const list = await jobs().findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });
    return NextResponse.json({ jobs: list });
  } catch {
    return NextResponse.json({ jobs: [] }); // table not migrated yet → empty, no crash
  }
}
