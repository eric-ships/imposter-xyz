import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// POST /api/auth/email/verify
// Body: { token, deviceToken? }
//
// Validates a magic-link token + claims the user. Two cases:
//
// CASE A — no user with this email yet:
//   - If the requesting device's deviceToken maps to an existing
//     user, attach the email to that user (in-place upgrade,
//     stat-preserving).
//   - Otherwise, mint a fresh user with the email + bind the device.
//
// CASE B — a user with this email already exists:
//   - If the requesting device already maps to the SAME user, bind
//     the device idempotently and return.
//   - If different users, MERGE:
//       move all players.user_id → email user
//       move all group_members → email user (drop conflicts)
//       move all match_player_results → email user (drop conflicts)
//       reassign all user_device_tokens → email user
//       delete the device-bound user (cascade clears any leftovers)
//
// Returns { userId, email, merged } so the client can refresh state.
// Token is marked used as the FIRST mutation so a replay doesn't
// double-merge.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    deviceToken?: string;
  };
  const token = body.token?.trim();
  const deviceToken = body.deviceToken?.trim() || null;
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  // Look up + validate the token.
  const { data: tokenRow, error: tokenErr } = await supabaseAdmin
    .from("magic_link_tokens")
    .select("token, email, requesting_device_token, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  if (tokenErr) {
    return NextResponse.json({ error: tokenErr.message }, { status: 500 });
  }
  if (!tokenRow) {
    return NextResponse.json(
      { error: "invalid or already used link" },
      { status: 400 }
    );
  }
  if (tokenRow.used_at) {
    return NextResponse.json(
      { error: "this link was already used" },
      { status: 400 }
    );
  }
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "this link has expired — request a new one" },
      { status: 400 }
    );
  }

  // Mark used FIRST so a replay can't double-trigger merge.
  const usedAt = new Date().toISOString();
  const { error: usedErr } = await supabaseAdmin
    .from("magic_link_tokens")
    .update({ used_at: usedAt })
    .eq("token", token)
    .is("used_at", null);
  if (usedErr) {
    return NextResponse.json({ error: usedErr.message }, { status: 500 });
  }

  const email = (tokenRow.email as string).toLowerCase();
  // Prefer the device token from the request body if present (covers
  // sign-in from a device that wasn't the one that requested the
  // link — e.g. desktop requested, phone clicked). Fall back to the
  // device that originally asked.
  const effectiveDeviceToken =
    deviceToken ?? (tokenRow.requesting_device_token as string | null);

  // Look up the email user (if any).
  const { data: emailUser } = await supabaseAdmin
    .from("users")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  // Look up the device user (if any).
  let deviceUserId: string | null = null;
  if (effectiveDeviceToken) {
    const { data: bind } = await supabaseAdmin
      .from("user_device_tokens")
      .select("user_id")
      .eq("device_token", effectiveDeviceToken)
      .maybeSingle();
    deviceUserId = (bind?.user_id as string | null) ?? null;
  }

  // ── CASE A: no user with this email ──────────────────────────────
  if (!emailUser) {
    if (deviceUserId) {
      // Upgrade in place: attach the email to the existing
      // device-bound user. Stat-preserving.
      const { error: updErr } = await supabaseAdmin
        .from("users")
        .update({ email })
        .eq("id", deviceUserId);
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
      return NextResponse.json({
        userId: deviceUserId,
        email,
        merged: false,
      });
    }
    // Fresh user — no device context (e.g. cookies cleared between
    // request + click).
    const { data: created, error: createErr } = await supabaseAdmin
      .from("users")
      .insert({ email, last_seen_at: usedAt })
      .select("id")
      .single();
    if (createErr || !created) {
      return NextResponse.json(
        { error: createErr?.message ?? "create failed" },
        { status: 500 }
      );
    }
    if (effectiveDeviceToken) {
      await supabaseAdmin.from("user_device_tokens").insert({
        device_token: effectiveDeviceToken,
        user_id: created.id,
      });
    }
    return NextResponse.json({
      userId: created.id,
      email,
      merged: false,
    });
  }

  // ── CASE B: user with this email exists ──────────────────────────
  const emailUserId = emailUser.id as string;

  // Already the same user → just bind the device (idempotent).
  if (deviceUserId === emailUserId || !deviceUserId) {
    if (effectiveDeviceToken) {
      await supabaseAdmin
        .from("user_device_tokens")
        .upsert(
          { device_token: effectiveDeviceToken, user_id: emailUserId },
          { onConflict: "device_token" }
        );
    }
    return NextResponse.json({
      userId: emailUserId,
      email,
      merged: false,
    });
  }

  // Different users → MERGE device user → email user.
  // Order of moves matters for FK / unique-constraint reasons.

  // 1. players: simple FK update.
  await supabaseAdmin
    .from("players")
    .update({ user_id: emailUserId })
    .eq("user_id", deviceUserId);

  // 2. group_members: UNIQUE on (group_id, user_id) — drop the
  //    device-user row if both already in the same group; keep the
  //    email-user row (preserves their per-group nickname).
  const { data: deviceMemberships } = await supabaseAdmin
    .from("group_members")
    .select("group_id")
    .eq("user_id", deviceUserId);
  const { data: emailMemberships } = await supabaseAdmin
    .from("group_members")
    .select("group_id")
    .eq("user_id", emailUserId);
  const emailGroupIds = new Set(
    (emailMemberships ?? []).map((m) => m.group_id as string)
  );
  for (const m of deviceMemberships ?? []) {
    const gid = m.group_id as string;
    if (emailGroupIds.has(gid)) {
      // Conflict — drop the device-user row.
      await supabaseAdmin
        .from("group_members")
        .delete()
        .eq("group_id", gid)
        .eq("user_id", deviceUserId);
    } else {
      // Move it.
      await supabaseAdmin
        .from("group_members")
        .update({ user_id: emailUserId })
        .eq("group_id", gid)
        .eq("user_id", deviceUserId);
    }
  }
  // Also: any groups the device user OWNED need owner_user_id moved.
  await supabaseAdmin
    .from("groups")
    .update({ owner_user_id: emailUserId })
    .eq("owner_user_id", deviceUserId);

  // 3. match_player_results: PK is (match_id, user_id). Same conflict
  //    pattern — drop the device-user row if both have a row for the
  //    same match (prefer email user).
  const { data: deviceMatches } = await supabaseAdmin
    .from("match_player_results")
    .select("match_id")
    .eq("user_id", deviceUserId);
  const { data: emailMatches } = await supabaseAdmin
    .from("match_player_results")
    .select("match_id")
    .eq("user_id", emailUserId);
  const emailMatchIds = new Set(
    (emailMatches ?? []).map((r) => r.match_id as string)
  );
  for (const r of deviceMatches ?? []) {
    const mid = r.match_id as string;
    if (emailMatchIds.has(mid)) {
      await supabaseAdmin
        .from("match_player_results")
        .delete()
        .eq("match_id", mid)
        .eq("user_id", deviceUserId);
    } else {
      await supabaseAdmin
        .from("match_player_results")
        .update({ user_id: emailUserId })
        .eq("match_id", mid)
        .eq("user_id", deviceUserId);
    }
  }

  // 4. user_device_tokens: reassign every device token of the
  //    device-user to the email-user (single device or multiple).
  await supabaseAdmin
    .from("user_device_tokens")
    .update({ user_id: emailUserId })
    .eq("user_id", deviceUserId);

  // 5. Delete the device-bound user (cascade clears any leftovers).
  await supabaseAdmin.from("users").delete().eq("id", deviceUserId);

  return NextResponse.json({
    userId: emailUserId,
    email,
    merged: true,
  });
}
