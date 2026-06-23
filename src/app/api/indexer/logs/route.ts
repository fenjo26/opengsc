import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const domainId = searchParams.get("domainId");
    const botType = searchParams.get("botType");
    const limit = parseInt(searchParams.get("limit") || "100");

    // Construct filter
    const where: any = {
      domain: {
        userId,
      },
    };

    if (domainId) where.domainId = domainId;
    if (botType) where.botType = botType;

    const logs = await prisma.indexerLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
      include: {
        domain: {
          select: {
            domain: true,
          },
        },
      },
    });

    return NextResponse.json(logs);
  } catch (e: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}


