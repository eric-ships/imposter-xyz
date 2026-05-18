import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// POST /api/users/me
// Body: { deviceToken, defaultNickname?, defaultAvatar? }
//
// Looks up the user via user_device_tokens (1:N — one user can have
// many devices via email auth). If the device is unknown, mints a
// fresh user + a new device-token row binding them. Bumps
// last_seen_at on the per-device row (account presence is "any
// device active recently"); preserves users.last_seen_at as the
// account-creation snapshot.
//
// On first-time creation: passes through default_nickname / avatar
// from the body if provided so the row is seeded.
// On subsequent calls: updates default_nickname / avatar IFF the
// body provides non-empty values; otherwise preserves what's stored.
//
// Returns { userId, defaultNickname, defaultAvatar, email,
// discordUsername, discordLinked }.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    deviceToken?: string;
    defaultNickname?: string | null;
    defaultAvatar?: string | null;
  };
  const deviceToken = body.deviceToken?.trim();
  if (!deviceToken) {
    return NextResponse.json(
      { error: "deviceToken required" },
      { status: 400 }
    );
  }

  // Look up the device → user via the new mapping table.
  const { data: tokenRow, error: tokenErr } = await supabaseAdmin
    .from("user_device_tokens")
    .select("user_id")
    .eq("device_token", deviceToken)
    .maybeSingle();
  if (tokenErr) {
    return NextResponse.json({ error: tokenErr.message }, { status: 500 });
  }

  const now = new Date().toISOString();

  if (tokenRow) {
    // Known device → load + maybe-update profile.
    const { data: existing, error: lookupErr } = await supabaseAdmin
      .from("users")
      .select(
        "id, default_nickname, default_avatar, email, discord_id, discord_username"
      )
      .eq("id", tokenRow.user_id)
      .maybeSingle();
    if (lookupErr) {
      return NextResponse.json(
        { error: lookupErr.message },
        { status: 500 }
      );
    }
    if (!existing) {
      // Token row pointed at a deleted user (cascade race) — recover
      // by minting a fresh user below.
      await supabaseAdmin
        .from("user_device_tokens")
        .delete()
        .eq("device_token", deviceToken);
    } else {
      // Bump per-device presence.
      await supabaseAdmin
        .from("user_device_tokens")
        .update({ last_seen_at: now })
        .eq("device_token", deviceToken);

      // Conditionally seed defaults if currently null and caller
      // provided one. Lets the room-page bootstrap pass through a
      // nickname discovered from a prior room without overwriting
      // an explicit profile change.
      const update: Record<string, unknown> = {};
      if (
        !existing.default_nickname &&
        body.defaultNickname &&
        body.defaultNickname.trim()
      ) {
        update.default_nickname = body.defaultNickname.trim();
      }
      if (
        !existing.default_avatar &&
        body.defaultAvatar &&
        body.defaultAvatar.trim()
      ) {
        update.default_avatar = body.defaultAvatar.trim();
      }
      if (Object.keys(update).length > 0) {
        await supabaseAdmin
          .from("users")
          .update(update)
          .eq("id", existing.id);
      }
      return NextResponse.json({
        userId: existing.id,
        defaultNickname:
          (update.default_nickname as string | undefined) ??
          existing.default_nickname,
        defaultAvatar:
          (update.default_avatar as string | undefined) ??
          existing.default_avatar,
        email: existing.email ?? null,
        discordUsername: existing.discord_username ?? null,
        discordLinked: existing.discord_id != null,
      });
    }
  }

  // Unknown device → mint fresh user + bind this device token.
  const insertUser: Record<string, unknown> = {
    last_seen_at: now,
  };
  if (body.defaultNickname && body.defaultNickname.trim()) {
    insertUser.default_nickname = body.defaultNickname.trim();
  }
  if (body.defaultAvatar && body.defaultAvatar.trim()) {
    insertUser.default_avatar = body.defaultAvatar.trim();
  }
  const { data: created, error: insertErr } = await supabaseAdmin
    .from("users")
    .insert(insertUser)
    .select(
      "id, default_nickname, default_avatar, email, discord_id, discord_username"
    )
    .single();
  if (insertErr || !created) {
    return NextResponse.json(
      { error: insertErr?.message ?? "create failed" },
      { status: 500 }
    );
  }
  const { error: bindErr } = await supabaseAdmin
    .from("user_device_tokens")
    .insert({
      device_token: deviceToken,
      user_id: created.id,
      last_seen_at: now,
    });
  if (bindErr) {
    // Roll back the user so we don't leak orphan rows.
    await supabaseAdmin.from("users").delete().eq("id", created.id);
    return NextResponse.json({ error: bindErr.message }, { status: 500 });
  }
  return NextResponse.json({
    userId: created.id,
    defaultNickname: created.default_nickname,
    defaultAvatar: created.default_avatar,
    email: created.email ?? null,
    discordUsername: created.discord_username ?? null,
    discordLinked: created.discord_id != null,
  });
}

// PATCH /api/users/me
// Body: { userId, defaultNickname?, defaultAvatar? }
// Explicit profile update (e.g. user changes their default avatar).
// Distinct from POST so we don't conflate "presence ping" with
// "profile change" — PATCH is intentional, can clear fields by
// passing an empty string.
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    defaultNickname?: string | null;
    defaultAvatar?: string | null;
  };
  if (!body.userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.defaultNickname !== undefined) {
    const trimmed = body.defaultNickname?.trim() ?? "";
    update.default_nickname = trimmed.length > 0 ? trimmed : null;
  }
  if (body.defaultAvatar !== undefined) {
    const trimmed = body.defaultAvatar?.trim() ?? "";
    update.default_avatar = trimmed.length > 0 ? trimmed : null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, changed: false });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .update(update)
    .eq("id", body.userId)
    .select(
      "id, default_nickname, default_avatar, email, discord_id, discord_username"
    )
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  return NextResponse.json({
    userId: data.id,
    defaultNickname: data.default_nickname,
    defaultAvatar: data.default_avatar,
    email: data.email ?? null,
    discordUsername: data.discord_username ?? null,
    discordLinked: data.discord_id != null,
  });
}
