import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/seo/rag/stats — knowledge-base sizes for the "Casino RAG" card.
// Returns { slots: 0, casinos: 0 } when the tables don't exist yet (import not run).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let slots = 0, casinos = 0;
  try {
    const s: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "RagSlot"`);
    slots = Number(s?.[0]?.c ?? 0);
  } catch { /* table missing */ }
  try {
    const c: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "RagCasino"`);
    casinos = Number(c?.[0]?.c ?? 0);
  } catch { /* table missing */ }
  return NextResponse.json({ slots, casinos });
}
