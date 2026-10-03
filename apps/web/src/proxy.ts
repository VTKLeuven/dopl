import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic checks only (D-007): redirect to sign-in when there is no session
 * cookie, and set security headers. Real authorization happens server-side.
 */
const PUBLIC_PREFIXES = [
  "/sign-in",
  "/invite/",
  "/reset-password",
  "/api/auth/",
  "/api/public/",
  "/api/mcp", // bearer tokens for the AI teammate (D-032), checked in the route
  "/f/",
  "/feedback",
  "/s/",
  "/embed.js",
  "/dev/",
  "/healthz",
];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isPublic(pathname) && !getSessionCookie(request, { cookiePrefix: "dopl" })) {
    const url = new URL("/sign-in", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  const h = response.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  // Public forms (/f/*) can be embedded anywhere; which origins may submit is
  // checked per form on the server (D-071). Everything else refuses framing.
  if (!pathname.startsWith("/f/")) h.set("X-Frame-Options", "DENY");
  // Status-page links carry their token in the path: never leak it.
  if (pathname.startsWith("/s/")) h.set("Referrer-Policy", "no-referrer");
  if (process.env.NODE_ENV === "production") {
    h.set("Strict-Transport-Security", "max-age=31536000");
  }
  return response;
}

export const config = {
  // Skip Next internals and static files.
  matcher: [
    "/((?!_next/static|_next/image|brand/|icon.png|apple-icon.png|favicon.ico|robots.txt).*)",
  ],
};
