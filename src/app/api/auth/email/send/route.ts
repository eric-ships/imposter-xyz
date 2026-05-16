import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendMagicLinkEmail } from "@/lib/auth-email";

// POST /api/auth/email/send
// Body: { email, deviceToken? }
//
// Generates a one-time magic-link token + emails it to the user.
// Anti-enumeration: returns { ok: true } regardless of whether the
// email is registered, whether sending succeeded, or whether the
// caller hit the rate limit. The only failures we surface are
// shape violations (missing email, malformed body) — that way an
// attacker poking the endpoint can't probe for valid emails or for
// rate-limit state.
//
// Token shape: 32 bytes of crypto-random, base64url-encoded (~43
// chars). Stored hashed? No — magic-link tokens are very short-lived
// and single-use, and the verify endpoint marks them used as the
// first action. The DB row IS the token.
//
// Rate limit: 5 sends per hour per email. Light defense — anything
// stronger needs a real rate-limit infra (Upstash, etc.).
const RATE_LIMIT_PER_HOUR = 5;
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const TOKEN_BYTES = 32;

function isValidEmailShape(s: string): boolean {
  // Intentionally loose — we're not the email validator of last
  // resort. The send itself is the actual validation; this just
  // catches "obviously not an email" inputs early.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function siteOrigin(request: Request): string {
  // Prefer NEXT_PUBLIC_SITE_URL when set (production); fall back to
  // the request's origin (covers Vercel preview URLs + localhost).
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    deviceToken?: string;
  };
  const rawEmail = body.email?.trim().toLowerCase();
  if (!rawEmail || !isValidEmailShape(rawEmail)) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }
  const deviceToken = body.deviceToken?.trim() || null;

  // Rate-limit (silent — return ok:true so an attacker can't
  // enumerate when they hit the limit).
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("magic_link_tokens")
    .select("token", { count: "exact", head: true })
    .eq("email", rawEmail)
    .gte("created_at", oneHourAgo);
  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json({ ok: true });
  }

  // Generate token + store row.
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const { error: insertErr } = await supabaseAdmin
    .from("magic_link_tokens")
    .insert({
      token,
      email: rawEmail,
      requesting_device_token: deviceToken,
      expires_at: expiresAt,
    });
  if (insertErr) {
    // Surface anti-enumeration: don't tell caller why it failed.
    console.warn(
      JSON.stringify({
        event: "magic_link_insert_failed",
        email: rawEmail,
        error: insertErr.message,
        ts: Date.now(),
      })
    );
    return NextResponse.json({ ok: true });
  }

  const verifyUrl = `${siteOrigin(request)}/auth/verify?token=${encodeURIComponent(token)}`;
  const result = await sendMagicLinkEmail({ to: rawEmail, verifyUrl });
  if (!result.ok) {
    console.warn(
      JSON.stringify({
        event: "magic_link_send_failed",
        email: rawEmail,
        error: result.error,
        ts: Date.now(),
      })
    );
  }
  return NextResponse.json({ ok: true });
}
