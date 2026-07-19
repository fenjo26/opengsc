import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildDigest, aiSummary, getDigestSettings, saveDigestSettings, DEFAULT_DIGEST_SETTINGS } from "@/lib/digest";
import { notifyUser } from "@/lib/notify";

// Digest tab API.
// GET                 → { digests (history), settings, tags (all site tags for the picker) }
// POST { action }     → "preview" {tag,days,ai} — build without sending
//                     → "send"    {tag,days,ai} — build + deliver to Telegram + save
//                     → "settings" {settings}   — save the schedule

async function uid(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return ((session?.user as any)?.id as string) || null;
}

export async function GET() {
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let digests: any[] = [];
  try {
    digests = await prisma.digest.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 });
  } catch { /* not migrated */ }

  const settings = await getDigestSettings(userId);

  // Distinct tags across the user's sites — for the tag picker.
  const sites = await prisma.site.findMany({ where: { userId }, select: { tags: true } });
  const tags = new Set<string>();
  for (const s of sites) {
    if (!s.tags) continue;
    try {
      const arr = JSON.parse(s.tags);
      if (Array.isArray(arr)) { arr.forEach((t: any) => tags.add(String(t))); continue; }
    } catch { /* comma fallback */ }
    s.tags.split(",").map(x => x.trim()).filter(Boolean).forEach(t => tags.add(t));
  }

  // Telegram connected? (drives UI hints)
  // "telegram" flag historically gates the Send button — true when ANY channel works.
  let telegram = false;
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT telegramBotToken, telegramChatId, slackWebhook FROM "User" WHERE id = ?`, userId);
    telegram = !!((rows?.[0]?.telegramBotToken && rows?.[0]?.telegramChatId) || rows?.[0]?.slackWebhook);
  } catch { /* not migrated */ }

  return NextResponse.json({ digests, settings, tags: [...tags].sort(), telegram });
}

export async function POST(req: Request) {
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");
  const tag = String(b.tag ?? "");
  const rawDays = parseInt(String(b.days ?? 7), 10) || 7;
  const days = rawDays === 0 ? 0 : Math.min(3650, Math.max(1, rawDays));
  const ai = !!b.ai;
  const lang = (b.lang === "ru" || b.lang === "uk" ? b.lang : "en") as "en" | "ru" | "uk";

  if (action === "preview" || action === "send") {
    const { content } = await buildDigest(userId, tag, days, lang);
    let full = content;
    if (ai) {
      const summary = await aiSummary(userId, content, lang);
      if (summary) full = `${content}\n\n${summary}`;
    }
    let sent = false;
    if (action === "send") {
      sent = await notifyUser(userId, full);
      try {
        await prisma.digest.create({ data: { userId, tag, days, content: full, sentTo: sent ? "telegram" : null } });
      } catch { /* not migrated */ }
      if (!sent) return NextResponse.json({ content: full, sent, error: "telegram_not_connected" });
    }
    return NextResponse.json({ content: full, sent });
  }

  if (action === "settings") {
    const s = { ...DEFAULT_DIGEST_SETTINGS, ...(b.settings ?? {}) };
    s.hourUtc = Math.min(23, Math.max(0, parseInt(String(s.hourUtc), 10) || 8));
    s.days = s.days === 0 ? 0 : Math.min(3650, Math.max(1, parseInt(String(s.days), 10) || 7));
    s.frequency = s.frequency === "daily" ? "daily" : "weekly";
    try {
      await saveDigestSettings(userId, s);
      return NextResponse.json({ ok: true, settings: s });
    } catch {
      return NextResponse.json({ error: "not_migrated" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });
  try {
    await prisma.digest.deleteMany({ where: { id, userId } });
  } catch { /* not migrated */ }
  return NextResponse.json({ ok: true });
}
