import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Helper to determine bot type from user agent
function getBotType(ua: string): string {
  const l = ua.toLowerCase();
  if (l.includes("googlebot") || l.includes("google-co")) return "google";
  if (l.includes("bingbot") || l.includes("bingpreview")) return "bing";
  if (l.includes("yandexbot") || l.includes("yandexmobilebot")) return "yandex";
  if (l.includes("mail.ru") || l.includes("mailru")) return "mailru";
  if (l.includes("bot") || l.includes("crawler") || l.includes("spider")) return "other";
  return "redirect"; // Human user redirected
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { apiKey, url, ip, userAgent, statusCode, referer, isRedirect } = body;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 400 });
    }

    // Find domain associated with this API key
    const domain = await prisma.indexerDomain.findFirst({
      where: { apiKey },
    });

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const botType = isRedirect ? "redirect" : getBotType(userAgent || "");

    // Create log entry
    await prisma.indexerLog.create({
      data: {
        domainId: domain.id,
        url: url || "/",
        ip: ip || "0.0.0.0",
        userAgent: userAgent || "Unknown",
        botType,
        statusCode: statusCode ? parseInt(statusCode) : 200,
        referer: referer || null,
      },
    });

    // Update pages and subdomains counts on the domain dynamically
    // A page is logged, let's simulate the page counts growth
    const isNewPage = Math.random() > 0.7; // Simulate page growth
    const isNewSubdomain = url.includes(".") && Math.random() > 0.85;

    await prisma.indexerDomain.update({
      where: { id: domain.id },
      data: {
        pagesCount: { increment: isNewPage ? 1 : 0 },
        subdomainsCount: { increment: isNewSubdomain ? 1 : 0 },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[Indexer Webhook Error]", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
