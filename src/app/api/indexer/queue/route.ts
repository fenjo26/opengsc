import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const queue = await prisma.indexerQueue.findMany({
      where: {
        domain: {
          userId,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        domain: {
          select: {
            domain: true,
          },
        },
      },
    });

    return NextResponse.json(queue);
  } catch (e: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { domainId, urls } = body; // urls is a string or array

    if (!domainId || !urls) {
      return NextResponse.json({ error: "Domain and URLs are required" }, { status: 400 });
    }

    // Verify ownership
    const domain = await prisma.indexerDomain.findFirst({
      where: { id: domainId, userId },
    });

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const urlList = Array.isArray(urls) 
      ? urls 
      : urls.split("\n").map((u: string) => u.trim()).filter((u: string) => u.length > 0);

    if (urlList.length === 0) {
      return NextResponse.json({ error: "No URLs provided" }, { status: 400 });
    }

    const created = [];
    for (const rawUrl of urlList) {
      // Basic normalization
      let formattedUrl = rawUrl;
      if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
        formattedUrl = `https://${formattedUrl}`;
      }

      try {
        const item = await prisma.indexerQueue.create({
          data: {
            domainId,
            url: formattedUrl,
            status: "pending",
          },
        });
        created.push(item);
      } catch (err) {
        // Ignore duplicates
      }
    }

    return NextResponse.json({ success: true, count: created.length });
  } catch (e: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Clear entire queue for user's domains
    const domains = await prisma.indexerDomain.findMany({
      where: { userId },
      select: { id: true },
    });

    const domainIds = domains.map(d => d.id);

    await prisma.indexerQueue.deleteMany({
      where: {
        domainId: {
          in: domainIds,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
