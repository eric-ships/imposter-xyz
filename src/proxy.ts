import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Canonical host. Everything else (the imposter-xyz.vercel.app default
// domain, any legacy imposter.xyz domain, etc.) 308-redirects here so
// there is one address for the app.
const CANONICAL_HOST = "upper.games";

export function proxy(request: NextRequest) {
  // Only enforce the canonical host on the production deployment.
  // Preview deployments (VERCEL_ENV === "preview") and local dev keep
  // their own hostnames so they stay testable.
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.next();
  }

  const host = request.headers.get("host");
  if (!host || host === CANONICAL_HOST) {
    return NextResponse.next();
  }

  // Same path + query, swapped onto the canonical host. 308 keeps the
  // method/body intact and tells crawlers the move is permanent.
  const url = request.nextUrl.clone();
  url.protocol = "https";
  url.host = CANONICAL_HOST;
  url.port = "";
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Run on every route except Next's static assets — those are served
  // fine from any host and don't need the round trip.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
