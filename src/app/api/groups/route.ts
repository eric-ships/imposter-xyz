import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/room-code";

// POST /api/groups
// Body: { userId, name, nickname? }
// Creates a group with caller as owner. Adds the caller as the first
// group_members row with role=owner. Generates a 6-char invite code
// (retries on collision).
//
// One-identity: group_members.nickname is an OPTIONAL per-group
// override. Left null (the normal case) the member inherits their
// users.default_nickname. Only an explicit non-empty `nickname` in
// the body — an intentional "use a different name in this group" —
// gets written.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    name?: string;
    nickname?: string;
  };
  const userId = body.userId?.trim();
  const name = body.name?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (name.length > 60) {
    return NextResponse.json(
      { error: "name must be ≤60 chars" },
      { status: 400 }
    );
  }

  // Verify the user exists.
  const { data: user, error: userErr } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  // null = inherit the user's identity. Only set when the body
  // explicitly passes a non-empty override.
  const nicknameOverride = body.nickname?.trim() || null;

  // Allocate a unique invite_code. 6-char from the room-code alphabet
  // (no ambiguous chars). Retry on collision.
  let inviteCode = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateRoomCode(6);
    const { data: existing } = await supabaseAdmin
      .from("groups")
      .select("id")
      .eq("invite_code", candidate)
      .maybeSingle();
    if (!existing) {
      inviteCode = candidate;
      break;
    }
  }
  if (!inviteCode) {
    return NextResponse.json(
      { error: "could not allocate invite code" },
      { status: 500 }
    );
  }

  const { data: created, error: groupErr } = await supabaseAdmin
    .from("groups")
    .insert({
      name,
      invite_code: inviteCode,
      owner_user_id: userId,
    })
    .select("id, name, invite_code")
    .single();
  if (groupErr || !created) {
    return NextResponse.json(
      { error: groupErr?.message ?? "create failed" },
      { status: 500 }
    );
  }

  const { error: memberErr } = await supabaseAdmin
    .from("group_members")
    .insert({
      group_id: created.id,
      user_id: userId,
      nickname: nicknameOverride,
      role: "owner",
    });
  if (memberErr) {
    // Roll back the group row so we don't leak a member-less group.
    await supabaseAdmin.from("groups").delete().eq("id", created.id);
    return NextResponse.json(
      { error: memberErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    groupId: created.id,
    name: created.name,
    inviteCode: created.invite_code,
  });
}

// GET /api/groups?userId=X
// Returns the caller's groups, each with a member count, their role,
// the group's live room (if any), and an avatar-preview array of up
// to 8 members. Used by the home page "Your squads" section.
export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // Pull the user's memberships first, then the matching groups.
  const { data: memberships, error: memErr } = await supabaseAdmin
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", userId);
  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }
  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ groups: [] });
  }
  const groupIds = memberships.map((m) => m.group_id as string);
  const roleByGroup = new Map(
    memberships.map((m) => [m.group_id as string, m.role as string])
  );

  const [{ data: groups, error: groupsErr }, { data: counts, error: cntErr }] =
    await Promise.all([
      supabaseAdmin
        .from("groups")
        .select("id, name, invite_code, owner_user_id, created_at")
        .in("id", groupIds),
      supabaseAdmin
        .from("group_members")
        .select("group_id")
        .in("group_id", groupIds),
    ]);
  if (groupsErr || cntErr) {
    return NextResponse.json(
      { error: (groupsErr ?? cntErr)?.message ?? "lookup failed" },
      { status: 500 }
    );
  }

  const countByGroup = new Map<string, number>();
  for (const c of counts ?? []) {
    const gid = c.group_id as string;
    countByGroup.set(gid, (countByGroup.get(gid) ?? 0) + 1);
  }

  // Member previews — up to 8 per group, so the home can draw an
  // avatar cluster per squad. One batched query for every membership
  // row across all the user's groups, plus a single lookup to `users`
  // for the canonical nickname + avatar — no N+1.
  const { data: memberRows, error: memberRowsErr } = await supabaseAdmin
    .from("group_members")
    .select("group_id, user_id, nickname, joined_at")
    .in("group_id", groupIds)
    .order("joined_at", { ascending: true });
  if (memberRowsErr) {
    return NextResponse.json(
      { error: memberRowsErr.message },
      { status: 500 }
    );
  }
  // Resolve identity (default_nickname + default_avatar) for every
  // distinct member in one go.
  const previewUserIds = Array.from(
    new Set((memberRows ?? []).map((m) => m.user_id as string))
  );
  const identityByUser = new Map<
    string,
    { defaultNickname: string | null; defaultAvatar: string | null }
  >();
  if (previewUserIds.length > 0) {
    const { data: identities, error: identErr } = await supabaseAdmin
      .from("users")
      .select("id, default_nickname, default_avatar")
      .in("id", previewUserIds);
    if (identErr) {
      return NextResponse.json({ error: identErr.message }, { status: 500 });
    }
    for (const u of identities ?? []) {
      identityByUser.set(u.id as string, {
        defaultNickname: (u.default_nickname as string | null) ?? null,
        defaultAvatar: (u.default_avatar as string | null) ?? null,
      });
    }
  }
  // Up to 8 member previews per group, joined-order. One-identity:
  // nickname resolves to the per-group override, else the user's
  // default_nickname.
  const membersByGroup = new Map<
    string,
    { userId: string; nickname: string; avatar: string | null }[]
  >();
  for (const m of memberRows ?? []) {
    const gid = m.group_id as string;
    const list = membersByGroup.get(gid) ?? [];
    if (list.length >= 8) continue;
    const identity = identityByUser.get(m.user_id as string);
    const override = (m.nickname as string | null) ?? null;
    list.push({
      userId: m.user_id as string,
      nickname: override ?? identity?.defaultNickname ?? "?",
      avatar: identity?.defaultAvatar ?? null,
    });
    membersByGroup.set(gid, list);
  }

  // Live room per group: the single most-recently-updated room
  // attributed to each group that's still active. Same recency rule
  // as the single-group detail route (30-min updated_at window).
  // One batched query across all the user's groups — no N+1.
  const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  const { data: groupRooms, error: roomsErr } = await supabaseAdmin
    .from("rooms")
    .select("code, kind, state, group_id, updated_at")
    .in("group_id", groupIds)
    .gte("updated_at", new Date(cutoff).toISOString())
    .order("updated_at", { ascending: false });
  if (roomsErr) {
    return NextResponse.json({ error: roomsErr.message }, { status: 500 });
  }
  // Rows arrive newest-first, so the first row seen for a group is its
  // most-recently-updated active room.
  const activeRoomByGroup = new Map<
    string,
    { code: string; kind: string; state: string }
  >();
  for (const r of groupRooms ?? []) {
    const gid = r.group_id as string;
    if (activeRoomByGroup.has(gid)) continue;
    activeRoomByGroup.set(gid, {
      code: r.code as string,
      kind: r.kind as string,
      state: r.state as string,
    });
  }

  const result = (groups ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    inviteCode: g.invite_code as string,
    ownerUserId: g.owner_user_id as string,
    memberCount: countByGroup.get(g.id as string) ?? 0,
    role: roleByGroup.get(g.id as string) ?? "member",
    createdAt: g.created_at as string,
    activeRoom: activeRoomByGroup.get(g.id as string) ?? null,
    members: membersByGroup.get(g.id as string) ?? [],
  }));

  return NextResponse.json({ groups: result });
}
