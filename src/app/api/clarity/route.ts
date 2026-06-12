import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CLARITY_API = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

// ─── GET: return cached snapshot (or null if none) ───────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const siteDbId = searchParams.get("siteId");
  if (!siteDbId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Verify site belongs to user
  const site = await prisma.site.findFirst({ where: { id: siteDbId, userId: user.id } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // Return site config + latest snapshot
  const snapshot = await prisma.claritySnapshot.findFirst({
    where: { siteId: siteDbId },
    orderBy: { fetchedAt: "desc" },
  });

  return NextResponse.json({
    clarityToken: site.clarityToken ? "••••••" : null,
    clarityProjectId: site.clarityProjectId ?? null,
    configured: !!(site.clarityToken && site.clarityProjectId),
    snapshot: snapshot
      ? { fetchedAt: snapshot.fetchedAt, periodDays: snapshot.periodDays, data: JSON.parse(snapshot.data) }
      : null,
  });
}

// ─── POST: save token/projectId OR fetch fresh data from Clarity API ─────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { siteId, action, clarityToken, clarityProjectId, numOfDays = 3 } = body;

  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const site = await prisma.site.findFirst({ where: { id: siteId, userId: user.id } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // ── action: "save" — persist token + projectId ──────────────────────────
  if (action === "save") {
    await prisma.site.update({
      where: { id: siteId },
      data: {
        clarityToken: clarityToken ?? site.clarityToken,
        clarityProjectId: clarityProjectId ?? site.clarityProjectId,
      },
    });
    return NextResponse.json({ ok: true });
  }

  // ── action: "fetch" — pull fresh data from Clarity API ──────────────────
  if (action === "fetch") {
    const token = site.clarityToken;
    if (!token) return NextResponse.json({ error: "No Clarity token configured" }, { status: 400 });

    const days = Math.min(Math.max(Number(numOfDays) || 3, 1), 3);

    // Fetch by URL dimension to get per-page breakdown
    const [trafficRes, uxRes] = await Promise.all([
      fetch(`${CLARITY_API}?numOfDays=${days}&dimension1=URL`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      }),
      fetch(`${CLARITY_API}?numOfDays=${days}&dimension1=URL&dimension2=Device`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      }),
    ]);

    if (!trafficRes.ok) {
      const errText = await trafficRes.text();
      if (trafficRes.status === 429) {
        return NextResponse.json({ error: "rate_limit", message: "Clarity API limit reached (10 req/day)" }, { status: 429 });
      }
      if (trafficRes.status === 401) {
        return NextResponse.json({ error: "unauthorized", message: "Invalid Clarity API token" }, { status: 401 });
      }
      return NextResponse.json({ error: "clarity_api_error", message: errText }, { status: 502 });
    }

    const trafficData = await trafficRes.json();
    const uxData = uxRes.ok ? await uxRes.json() : [];

    // Merge both responses into one snapshot
    const merged = { traffic: trafficData, ux: uxData, fetchedWith: { days } };

    // Save to DB (keep last 10 snapshots per site)
    await prisma.claritySnapshot.create({
      data: { siteId, periodDays: days, data: JSON.stringify(merged) },
    });

    // Clean up old snapshots (keep 10)
    const all = await prisma.claritySnapshot.findMany({
      where: { siteId },
      orderBy: { fetchedAt: "desc" },
      select: { id: true },
    });
    if (all.length > 10) {
      const toDelete = all.slice(10).map((s: { id: string }) => s.id);
      await prisma.claritySnapshot.deleteMany({ where: { id: { in: toDelete } } });
    }

    return NextResponse.json({
      ok: true,
      snapshot: { fetchedAt: new Date(), periodDays: days, data: merged },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
