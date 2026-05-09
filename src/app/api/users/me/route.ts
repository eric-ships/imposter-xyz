import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// POST /api/users/me
// Body: { deviceToken, defaultNickname?, defaultAvatar? }
// Upserts the user keyed on device_token. Bumps last_seen_at on every
// call so the eventual roster "active Xm ago" derives from this. Used
// as the page-load presence ping — any visit refreshes presence.
//
// On first-time creation: passes through default_nickname / avatar
// from the body if provided so the row is seeded.
// On subsequent calls: updates default_nickname / avatar IFF the
// body provides non-empty values; otherwise preserves what's stored.
//
// Returns { userId, defaultNickname, defaultAvatar }.
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

  // Look up first to decide between insert and update — the upsert
  // path lets us apply defaultNickname/avatar conditionally (only set
  // them if the caller passed them, and only if not already set on
  // an existing row).
  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from("users")
    .select("id, default_nickname, default_avatar")
    .eq("device_token", deviceToken)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  if (existing) {
    // Bump presence; also fill in defaults if currently null and the
    // caller provided one (lets the bootstrap pass through nickname
    // discovered from a prior room without overwriting an explicit
    // profile change).
    const update: Record<string, unknown> = { last_seen_at: now };
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
    const { error: updErr } = await supabaseAdmin
      .from("users")
      .update(update)
      .eq("id", existing.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    return NextResponse.json({
      userId: existing.id,
      defaultNickname:
        (update.default_nickname as string | undefined) ??
        existing.default_nickname,
      defaultAvatar:
        (update.default_avatar as string | undefined) ??
        existing.default_avatar,
    });
  }

  // Fresh row.
  const insertRow: Record<string, unknown> = {
    device_token: deviceToken,
    last_seen_at: now,
  };
  if (body.defaultNickname && body.defaultNickname.trim()) {
    insertRow.default_nickname = body.defaultNickname.trim();
  }
  if (body.defaultAvatar && body.defaultAvatar.trim()) {
    insertRow.default_avatar = body.defaultAvatar.trim();
  }
  const { data: created, error: insertErr } = await supabaseAdmin
    .from("users")
    .insert(insertRow)
    .select("id, default_nickname, default_avatar")
    .single();
  if (insertErr || !created) {
    return NextResponse.json(
      { error: insertErr?.message ?? "create failed" },
      { status: 500 }
    );
  }
  return NextResponse.json({
    userId: created.id,
    defaultNickname: created.default_nickname,
    defaultAvatar: created.default_avatar,
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
    .select("id, default_nickname, default_avatar")
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
  });
}
