import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runRelatedKeywords } from "@/lib/seo/keywords";

// POST /api/seo/keywords  { keyword, dfsKey, gl?, hl?, limit? }
// Returns related keywords with search volume / CPC / competition (DataForSEO Labs).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json();
  const keyword = String(b.keyword ?? "").trim();
  const dfsKey = String(b.dfsKey ?? "");
  if (!keyword) return NextResponse.json({ error: "no_keyword", items: [] }, { status: 400 });
  if (!dfsKey) return NextResponse.json({ error: "no_dataforseo_key", items: [] }, { status: 400 });

  const { items, error } = await runRelatedKeywords(dfsKey, keyword, { gl: b.gl, hl: b.hl, limit: b.limit });
  if (error) return NextResponse.json({ error, items: [] }, { status: 502 });
  return NextResponse.json({ items });
}
