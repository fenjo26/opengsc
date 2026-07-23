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

// ── Helper: fetch and parse sitemap.xml, returning all <loc> URLs ──
async function parseSitemapUrls(sitemapUrl: string): Promise<string[]> {
  try {
    const res = await fetch(sitemapUrl, {
      headers: { "User-Agent": "OpenGSC-Indexer/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const urls: string[] = [];
    // Extract all <loc>...</loc> entries
    const locMatches = xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);
    for (const m of locMatches) {
      const loc = m[1].trim();
      if (!loc) continue;
      // If it's a nested sitemap (sitemap index), recursively parse it
      if (loc.endsWith(".xml") || loc.includes("sitemap")) {
        const nested = await parseSitemapUrls(loc);
        urls.push(...nested);
      } else {
        urls.push(loc);
      }
    }
    return urls;
  } catch {
    return [];
  }
}

// ── Helper: check if a URL looks like a sitemap ──
function isSitemapUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith(".xml") || lower.includes("sitemap");
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { domainId, urls } = body; // urls is a string or array

    if (!urls) {
      return NextResponse.json({ error: "URLs are required" }, { status: 400 });
    }

    // Build the list of target doorway domains
    let targetDomains: { id: string }[];

    if (domainId === "all" || !domainId) {
      // Auto-distribute: get ALL user's doorway domains
      targetDomains = await prisma.indexerDomain.findMany({
        where: { userId },
        select: { id: true },
      });
      if (targetDomains.length === 0) {
        return NextResponse.json({ error: "No doorway domains found. Add domains first." }, { status: 400 });
      }
    } else {
      // Specific domain selected — verify ownership
      const domain = await prisma.indexerDomain.findFirst({
        where: { id: domainId, userId },
      });
      if (!domain) {
        return NextResponse.json({ error: "Domain not found" }, { status: 404 });
      }
      targetDomains = [{ id: domain.id }];
    }

    // Parse input URLs
    let rawUrlList = Array.isArray(urls) 
      ? urls 
      : urls.split("\n").map((u: string) => u.trim()).filter((u: string) => u.length > 0);

    if (rawUrlList.length === 0) {
      return NextResponse.json({ error: "No URLs provided" }, { status: 400 });
    }

    // Expand sitemap URLs into individual page URLs
    const expandedUrls: string[] = [];
    for (const rawUrl of rawUrlList) {
      let normalizedUrl = rawUrl;
      if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
        normalizedUrl = `https://${normalizedUrl}`;
      }

      if (isSitemapUrl(normalizedUrl)) {
        const sitemapUrls = await parseSitemapUrls(normalizedUrl);
        expandedUrls.push(...sitemapUrls);
      } else {
        expandedUrls.push(normalizedUrl);
      }
    }

    if (expandedUrls.length === 0) {
      return NextResponse.json({ error: "No URLs found (sitemap may be empty or unreachable)" }, { status: 400 });
    }

    // Distribute URLs across target domains (round-robin)
    let created = 0;
    for (let i = 0; i < expandedUrls.length; i++) {
      const url = expandedUrls[i];
      const targetDomain = targetDomains[i % targetDomains.length];

      try {
        await prisma.indexerQueue.create({
          data: {
            domainId: targetDomain.id,
            url,
            status: "pending",
          },
        });
        created++;
      } catch {
        // Ignore duplicates (@@unique constraint)
      }
    }

    return NextResponse.json({
      success: true,
      count: created,
      totalUrls: expandedUrls.length,
      domainsUsed: targetDomains.length,
    });
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
