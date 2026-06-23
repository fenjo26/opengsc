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

// POST — Traffic Simulator
// Generates realistic crawl logs for the last 30 days
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 1. Ensure user has at least some domains to simulate traffic for
    let userDomains = await prisma.indexerDomain.findMany({
      where: { userId },
    });

    if (userDomains.length === 0) {
      // Create 3 realistic doorway domains
      const mockDomains = [
        { domain: "best-deals-shop.net", template: "ecommerce", pages: 1240, subdomains: 18 },
        { domain: "seo-crawling-hub.xyz", template: "directory", pages: 4800, subdomains: 42 },
        { domain: "expired-gold-blog.info", template: "blog", pages: 350, subdomains: 3 },
      ];

      for (const d of mockDomains) {
        const apiKey = "idx_" + crypto.randomBytes(16).toString("hex");
        await prisma.indexerDomain.create({
          data: {
            userId,
            domain: d.domain,
            template: d.template,
            apiKey,
            pagesCount: d.pages,
            subdomainsCount: d.subdomains,
          },
        });
      }

      userDomains = await prisma.indexerDomain.findMany({
        where: { userId },
      });
    }

    // 2. Generate random crawl logs spread over the last 30 days
    const botTypes = ["google", "bing", "yandex", "mailru", "other", "redirect"];
    const ips = [
      "66.249.66.1", // Googlebot IP
      "66.249.71.12", // Googlebot IP
      "157.55.39.18", // Bingbot IP
      "40.77.167.82", // Bingbot IP
      "5.255.250.5",  // Yandexbot IP
      "141.8.224.23", // Yandexbot IP
      "217.69.134.10", // Mail.ru bot IP
      "192.168.1.50", // Fake other IP
      "82.112.42.109" // Fake redirect user IP
    ];
    const userAgents = {
      google: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      bing: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      yandex: "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
      mailru: "Mozilla/5.0 (compatible; Mail.RU_Bot/2.0; +http://go.mail.ru/help/robots)",
      other: "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
      redirect: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    const statusCodes = [200, 304, 200, 200, 200, 404]; // heavily skewed to 200/304

    // Add some random crawls
    const logData = [];
    const now = new Date();

    // Generate ~1000 logs spread over 30 days
    for (let i = 0; i < 600; i++) {
      // Pick random domain
      const dom = userDomains[Math.floor(Math.random() * userDomains.length)];
      // Pick random bot type, heavily skewing toward google and other
      const rand = Math.random();
      let botType = "other";
      if (rand < 0.35) botType = "google";
      else if (rand < 0.50) botType = "other";
      else if (rand < 0.65) botType = "redirect";
      else if (rand < 0.75) botType = "bing";
      else if (rand < 0.85) botType = "yandex";
      else botType = "mailru";

      const ua = userAgents[botType as keyof typeof userAgents];
      const ip = ips[Math.floor(Math.random() * ips.length)];
      const code = botType === "redirect" ? 302 : statusCodes[Math.floor(Math.random() * statusCodes.length)];
      
      // Random date in the last 30 days
      const daysAgo = Math.random() * 30;
      const timestamp = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

      // Generate random URL path
      const randPath = Math.random() > 0.4 
        ? "/product-" + Math.floor(Math.random() * 10000) + ".html"
        : "/category-" + ["shoes", "clothing", "electronics", "beauty", "home"][Math.floor(Math.random() * 5)] + "/" + Math.floor(Math.random() * 100);

      const subdomain = Math.random() > 0.7 
        ? ["en", "de", "fr", "shop", "deals", "m"][Math.floor(Math.random() * 6)] + "."
        : "";

      logData.push({
        domainId: dom.id,
        timestamp,
        url: `https://${subdomain}${dom.domain}${randPath}`,
        ip,
        userAgent: ua,
        botType,
        statusCode: code,
        referer: Math.random() > 0.6 ? "https://www.google.com/" : null,
      });
    }

    // Insert all in transaction
    await prisma.$transaction(
      logData.map(log => prisma.indexerLog.create({ data: log }))
    );

    // Update domains pages/subdomains to reflect activity
    for (const dom of userDomains) {
      await prisma.indexerDomain.update({
        where: { id: dom.id },
        data: {
          pagesCount: Math.floor(Math.random() * 5000 + 500),
          subdomainsCount: Math.floor(Math.random() * 30 + 5),
        },
      });
    }

    return NextResponse.json({ success: true, count: logData.length });
  } catch (e: any) {
    console.error("[Indexer Log Simulation Error]", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
