import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { genText } from "@/lib/seo/generate";

// POST /api/seo/text — synchronous article generation (also available as a background job).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json();
  const r = await genText(b);
  if (!r.ok) {
    const status = r.error === "no_outline" || r.error === "no_ai_key" ? 400 : 502;
    return NextResponse.json({ error: r.error }, { status });
  }
  return NextResponse.json(r.data);
}
