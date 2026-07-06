import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/aeo/history?questionId=…&days=90
// Full per-engine check history for one tracked question — used by the expandable row.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const questionId = searchParams.get("questionId") || "";
  const days = Math.min(365, Math.max(7, parseInt(searchParams.get("days") || "90", 10) || 90));

  const q = await prisma.trackedQuestion.findUnique({
    where: { id: questionId },
    include: { site: { select: { userId: true } } },
  });
  if (!q || q.site.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const since = new Date(Date.now() - days * 86400000);
  const checks = await prisma.aeoCheck.findMany({
    where: { questionId, checkedAt: { gte: since } },
    orderBy: { checkedAt: "asc" },
    select: { engine: true, checkedAt: true, cited: true, url: true, snippet: true, error: true },
  });

  return NextResponse.json({
    question: q.question,
    results: q.lastResults ? JSON.parse(q.lastResults) : {},
    checks,
  });
}
