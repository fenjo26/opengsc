import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rewriteContent } from "@/lib/seo/rewrite";

// POST /api/seo/rewrite — rewrite pasted text or a URL into N unique variants.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const r = await rewriteContent(b);
  if (!r.ok) {
    const status = r.error === "no_ai_key" || r.error === "no_content" ? 400 : 502;
    return NextResponse.json({ error: r.error }, { status });
  }
  return NextResponse.json(r.data);
}
