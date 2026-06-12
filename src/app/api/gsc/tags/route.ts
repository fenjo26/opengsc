import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/gsc/tags  { siteId: string, tags: string[] }
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { siteId, tags } = await req.json();
  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  // Verify site belongs to user
  const site = await prisma.site.findFirst({ where: { id: siteId, userId } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  await prisma.site.update({
    where: { id: siteId },
    data: { tags: JSON.stringify(tags ?? []) },
  });

  return NextResponse.json({ ok: true });
}
