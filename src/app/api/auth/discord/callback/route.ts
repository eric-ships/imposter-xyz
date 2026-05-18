import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  exchangeCode,
  fetchDiscordUser,
  discordDisplayName,
} from "@/lib/discord";
import { mergeUsers } from "@/lib/identity-merge";

// GET /api/auth/discord/callback?code=...&state=...
//
// Discord redirects here after the user approves consent. We verify
// the CSRF state, exchange the code for the user's profile, then link
// the Discord identity into Upper's `users` table — mirroring the
// email magic-link verify flow:
//
//   CASE A — no user has this discord_id yet:
//     attach it to the device-bound user, or mint a fresh user.
//   CASE B — a user already has this discord_id:
//     bind the device to it; if the device pointed at a *different*
//     user, merge that user in (stat-preserving).
//
// Success redirects home with ?discord=ok; failures land on /auth
// with ?discord=error rather than dumping a stack trace at the user.

function siteOrigin(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: NextRequest) {
  const origin = siteOrigin(request);

  const fail = (reason: string, param = "error") => {
    console.warn(
      JSON.stringify({ event: "discord_oauth_failed", reason, ts: Date.now() })
    );
    const res = NextResponse.redirect(`${origin}/auth?discord=${param}`);
    res.cookies.delete("discord_oauth_state");
    res.cookies.delete("discord_oauth_device");
    return res;
  };

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const cookieState = request.cookies.get("discord_oauth_state")?.value;
  const deviceToken =
    request.cookies.get("discord_oauth_device")?.value?.trim() || null;

  if (params.get("error")) return fail(`discord error: ${params.get("error")}`);
  if (!code || !state) return fail("missing code or state");
  if (!cookieState || cookieState !== state) return fail("state mismatch");

  const tokenResult = await exchangeCode({ code, origin });
  if (!tokenResult.ok) return fail(tokenResult.error);

  const userResult = await fetchDiscordUser(tokenResult.accessToken);
  if (!userResult.ok) return fail(userResult.error);
  const discord = userResult.user;
  const displayName = discordDisplayName(discord);

  // Find any existing identity already bound to this Discord account.
  const { data: discordUser } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("discord_id", discord.id)
    .maybeSingle();

  // Find the user this device currently maps to (if any).
  let deviceUserId: string | null = null;
  if (deviceToken) {
    const { data: bind } = await supabaseAdmin
      .from("user_device_tokens")
      .select("user_id")
      .eq("device_token", deviceToken)
      .maybeSingle();
    deviceUserId = (bind?.user_id as string | null) ?? null;
  }

  const discordFields = {
    discord_id: discord.id,
    discord_username: displayName,
    discord_avatar: discord.avatarUrl,
  };

  let resolvedUserId: string;

  if (!discordUser) {
    // ── CASE A — discord_id not seen before ──
    if (deviceUserId) {
      // Attach to the device-bound user. Seed the nickname only when
      // they don't already have one — never clobber an explicit
      // profile the player has set themselves.
      const { data: existing } = await supabaseAdmin
        .from("users")
        .select("default_nickname")
        .eq("id", deviceUserId)
        .maybeSingle();
      const update: Record<string, unknown> = { ...discordFields };
      if (!existing?.default_nickname) update.default_nickname = displayName;
      const { error } = await supabaseAdmin
        .from("users")
        .update(update)
        .eq("id", deviceUserId);
      if (error) return fail(error.message);
      resolvedUserId = deviceUserId;
    } else {
      // No device context — mint a fresh user.
      const { data: created, error } = await supabaseAdmin
        .from("users")
        .insert({ ...discordFields, default_nickname: displayName })
        .select("id")
        .single();
      if (error || !created) return fail(error?.message ?? "create failed");
      resolvedUserId = created.id as string;
    }
  } else {
    // ── CASE B — discord_id already mapped ──
    resolvedUserId = discordUser.id as string;
    // Refresh the display snapshot (username/avatar can change).
    await supabaseAdmin
      .from("users")
      .update(discordFields)
      .eq("id", resolvedUserId);
    // Device pointed at a different user.
    if (deviceUserId && deviceUserId !== resolvedUserId) {
      // Inspect the device user's OWN identity columns. If it already
      // holds an email or discord_id, it's a real account — linking
      // would collide two real accounts, so error instead of merging.
      // Only an anonymous throwaway device identity (no email, no
      // discord_id) gets folded in — that's a normal fresh-device
      // sign-in.
      const { data: deviceUser } = await supabaseAdmin
        .from("users")
        .select("email, discord_id")
        .eq("id", deviceUserId)
        .maybeSingle();
      if (deviceUser?.email || deviceUser?.discord_id) {
        return fail(
          "device user already linked to a different account",
          "linkconflict"
        );
      }
      await mergeUsers(supabaseAdmin, deviceUserId, resolvedUserId);
    }
  }

  // Bind this device to the resolved user (idempotent upsert).
  if (deviceToken) {
    await supabaseAdmin
      .from("user_device_tokens")
      .upsert(
        { device_token: deviceToken, user_id: resolvedUserId },
        { onConflict: "device_token" }
      );
  }

  const res = NextResponse.redirect(`${origin}/?discord=ok`);
  res.cookies.delete("discord_oauth_state");
  res.cookies.delete("discord_oauth_device");
  return res;
}
