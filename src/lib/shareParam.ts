// Guest-view helpers for shared dashboards (/share/[siteId]/[token]).
// Components deep inside the site dashboard don't need shareToken prop-drilling:
// the token is right there in the URL path, so any client-side fetch can append it
// with withShare(), and any action button can hide itself behind isGuestView().
"use client";

export function shareTokenFromPath(): string | null {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/^\/share\/[^/]+\/([^/?#]+)/);
  return m ? m[1] : null;
}

export function withShare(url: string): string {
  const t = shareTokenFromPath();
  if (!t) return url;
  return `${url}${url.includes("?") ? "&" : "?"}shareToken=${encodeURIComponent(t)}`;
}

export function isGuestView(): boolean {
  return !!shareTokenFromPath();
}
