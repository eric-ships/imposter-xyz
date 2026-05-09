import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/room-code";

// POST /api/groups
// Body: { userId, name, nickname? }
// Creates a group with caller as owner. Adds the caller as the first
// group_members row with role=owner. Generates a 6-char invite code
// (retries on collision).
//
// nickname defaults to the user's default_nickname if not passed
// (shouldn't be missing in practice but the bootstrap might race a
// fast click).
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
    .select("id, default_nickname")
    .eq("id", userId)
    .maybeSingle();
  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  const nickname =
    body.nickname?.trim() || user.default_nickname?.trim() || "?";

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
      nickname,
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
// Returns the caller's groups, each with a member count + their role.
// Used by the home page "My groups" section.
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

  const result = (groups ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
    inviteCode: g.invite_code as string,
    ownerUserId: g.owner_user_id as string,
    memberCount: countByGroup.get(g.id as string) ?? 0,
    role: roleByGroup.get(g.id as string) ?? "member",
    createdAt: g.created_at as string,
  }));

  return NextResponse.json({ groups: result });
}
