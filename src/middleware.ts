import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    callbacks: {
      // Allow, in addition to authenticated owners:
      //   • the public guest dashboard pages  (/share/[siteId]/[token])
      //   • API calls that carry a shareToken  (each such route re-validates the token
      //     against site.shareToken + shareEnabled, so this is not a bypass — endpoints
      //     without shareToken support still enforce their own getServerSession check)
      authorized: ({ token, req }) => {
        const { pathname, searchParams } = req.nextUrl;
        if (pathname === "/api/indexer/webhook") return true;
        if (pathname.startsWith("/share/")) return true;
        if (pathname.startsWith("/api/") && searchParams.has("shareToken")) return true;
        return !!token;
      },
    },
  }
);

// Protect all routes except /login and /api/auth
export const config = {
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|favicon.svg|logo.svg|.*\\.svg$|.*\\.png$|.*\\.ico$).*)",
  ],
};
