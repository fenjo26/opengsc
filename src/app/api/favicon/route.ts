import { NextRequest, NextResponse } from 'next/server';

const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899'];

function letterFallback(domain: string): NextResponse {
  const letter = (domain.replace(/^www\./, '')[0] ?? '?').toUpperCase();
  const color = COLORS[domain.charCodeAt(0) % COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="${color}"/>
  <text x="16" y="23" font-family="system-ui,Arial,sans-serif" font-size="17" font-weight="700" fill="white" text-anchor="middle">${letter}</text>
</svg>`;
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get('domain');
  if (!domain) return new NextResponse(null, { status: 400 });

  try {
    const res = await fetch(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return letterFallback(domain);

    const buffer = await res.arrayBuffer();
    // If Google returns a tiny 1-byte or empty body it's their "no favicon" response
    if (buffer.byteLength < 64) return letterFallback(domain);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'image/png',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch {
    return letterFallback(domain);
  }
}
