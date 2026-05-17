import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { discordAuthorizeUrl } from "@/lib/discord";

// GET /api/auth/discord/start?deviceToken=...
//
// Kicks off the Discord OAuth dance. Generates a CSRF `state`, stashes
// it — plus the caller's device token, so the callback can merge the
// device-bound identity into the Discord one — in short-lived httpOnly
// cookies, then redirects to Discord's consent screen.
//
// The device token rides in a cookie rather than the OAuth `state`
// because `state` round-trips through discord.com and shouldn't carry
// anything we'd rather keep on our own origin.

function siteOrigin(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function GET(request: NextRequest) {
  const origin = siteOrigin(request);
  const deviceToken =
    request.nextUrl.searchParams.get("deviceToken")?.trim() ?? "";
  const state = randomBytes(16).toString("base64url");

  const res = NextResponse.redirect(discordAuthorizeUrl({ origin, state }));
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60, // 10 minutes — plenty of time to approve consent.
  };
  res.cookies.set("discord_oauth_state", state, cookieOpts);
  res.cookies.set("discord_oauth_device", deviceToken, cookieOpts);
  return res;
}
