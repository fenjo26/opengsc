import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

// MCP access token management (Settings → API & MCP).
// GET    → { token: string | null }
// POST   → generate (or rotate) the token; returns { token }
// DELETE → revoke the token
// Raw SQL so it degrades gracefully on a DB that hasn't run `prisma db push` yet
// (same convention as seo-sync / linkwatch).

async function uid(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return ((session?.user as any)?.id as string) || null;
}

export async function GET() {
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT mcpToken FROM "User" WHERE id = ?`, userId);
    return NextResponse.json({ token: rows?.[0]?.mcpToken ?? null });
  } catch {
    return NextResponse.json({ token: null, notMigrated: true });
  }
}

export async function POST() {
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = "ogsc_" + randomBytes(24).toString("hex");
  try {
    await prisma.$executeRawUnsafe(`UPDATE "User" SET mcpToken = ? WHERE id = ?`, token, userId);
    return NextResponse.json({ token });
  } catch {
    return NextResponse.json({ error: "not_migrated" }, { status: 500 });
  }
}

export async function DELETE() {
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await prisma.$executeRawUnsafe(`UPDATE "User" SET mcpToken = NULL WHERE id = ?`, userId);
  } catch { /* table/column missing — nothing to revoke */ }
  return NextResponse.json({ ok: true });
}
