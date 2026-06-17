import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { scrapeMany } from "@/lib/seo/scrape";

// POST /api/seo/scrape
// body: { urls: string[], firecrawlKey? }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const b = await req.json();
  const urls: string[] = Array.isArray(b.urls) ? b.urls.filter((u: any) => typeof u === "string") : [];
  if (!urls.length) return NextResponse.json({ error: "no_urls" }, { status: 400 });

  const firecrawlKey = b.firecrawlKey ? String(b.firecrawlKey) : undefined;
  const pages = await scrapeMany(urls.slice(0, 15), firecrawlKey, 4);

  return NextResponse.json({ pages });
}
