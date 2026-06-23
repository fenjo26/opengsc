import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch user's domains
    const domains = await prisma.indexerDomain.findMany({
      where: { userId },
      include: {
        logs: {
          select: {
            botType: true,
            timestamp: true,
            statusCode: true,
          },
        },
      },
    });

    // If no domains exist yet, return empty states (logs page will allow generating mock data)
    if (domains.length === 0) {
      return NextResponse.json({
        summary: { google: 0, yandex: 0, bing: 0, mailru: 0, other: 0, redirects: 0 },
        byDomain: [],
        daily: [],
      });
    }

    // 1. Calculate Summary (Last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let google = 0, yandex = 0, bing = 0, mailru = 0, other = 0, redirects = 0;

    const byDomain = domains.map(d => {
      let gCount = 0, yCount = 0, bCount = 0, mCount = 0, oCount = 0, rCount = 0;
      
      d.logs.forEach(log => {
        if (log.timestamp >= thirtyDaysAgo) {
          if (log.botType === "google") gCount++;
          else if (log.botType === "yandex") yCount++;
          else if (log.botType === "bing") bCount++;
          else if (log.botType === "mailru") mCount++;
          else if (log.botType === "other") oCount++;
          else if (log.botType === "redirect") rCount++;
        }
      });

      google += gCount;
      yandex += yCount;
      bing += bCount;
      mailru += mCount;
      other += oCount;
      redirects += rCount;

      const totalBots = gCount + yCount + bCount + mCount + oCount;
      const googleShare = totalBots > 0 ? Math.round((gCount / totalBots) * 100) : 0;

      return {
        id: d.id,
        domain: d.domain,
        status: d.status,
        google: gCount,
        totalBots,
        googleShare,
        pagesCount: d.pagesCount,
        subdomainsCount: d.subdomainsCount,
      };
    });

    // Sort domains by total bots descending
    byDomain.sort((a, b) => b.totalBots - a.totalBots);

    // 2. Generate Daily Breakdown (Last 30 days)
    const dailyMap: Record<
      string,
      {
        date: string;
        google: number;
        google304: number;
        yandex: number;
        yandex304: number;
        bing: number;
        mailru: number;
        other: number;
        total: number;
        redirects: number;
      }
    > = {};
    
    // Initialize 30 days of data
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0]; // YYYY-MM-DD
      dailyMap[dateStr] = {
        date: dateStr,
        google: 0,
        google304: 0,
        yandex: 0,
        yandex304: 0,
        bing: 0,
        mailru: 0,
        other: 0,
        total: 0,
        redirects: 0,
      };
    }

    domains.forEach(d => {
      d.logs.forEach(log => {
        const dateStr = log.timestamp.toISOString().split("T")[0];
        if (dailyMap[dateStr]) {
          const stats = dailyMap[dateStr];
          if (log.botType === "google") {
            if (log.statusCode === 304) {
              stats.google304++;
            } else {
              stats.google++;
            }
            stats.total++;
          } else if (log.botType === "yandex") {
            if (log.statusCode === 304) {
              stats.yandex304++;
            } else {
              stats.yandex++;
            }
            stats.total++;
          } else if (log.botType === "bing") {
            stats.bing++;
            stats.total++;
          } else if (log.botType === "mailru") {
            stats.mailru++;
            stats.total++;
          } else if (log.botType === "other") {
            stats.other++;
            stats.total++;
          } else if (log.botType === "redirect") {
            stats.redirects++;
          }
        }
      });
    });

    const daily = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      summary: { google, yandex, bing, mailru, other, redirects },
      byDomain,
      daily,
    });
  } catch (e: any) {
    console.error("[Indexer Stats Error]", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
