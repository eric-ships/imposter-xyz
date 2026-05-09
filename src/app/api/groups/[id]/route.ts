import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// GET /api/groups/[id]?userId=X
// Returns full group detail + member roster. Member-only.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;
  const userId = new URL(request.url).searchParams
    .get("userId")
    ?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // Membership gate.
  const { data: membership } = await supabaseAdmin
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: "not a member" },
      { status: 403 }
    );
  }

  const [
    { data: group, error: groupErr },
    { data: members, error: memErr },
  ] = await Promise.all([
    supabaseAdmin
      .from("groups")
      .select("id, name, invite_code, owner_user_id, created_at")
      .eq("id", groupId)
      .maybeSingle(),
    supabaseAdmin
      .from("group_members")
      .select("user_id, nickname, role, joined_at")
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true }),
  ]);
  if (groupErr || memErr) {
    return NextResponse.json(
      { error: (groupErr ?? memErr)?.message ?? "lookup failed" },
      { status: 500 }
    );
  }
  if (!group) {
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  }

  // Decorate members with default nickname/avatar from users so the
  // roster can render avatars without a second round-trip from the
  // client. Could move to a join later if it gets hot.
  const memberUserIds = (members ?? []).map((m) => m.user_id as string);
  const { data: users } = await supabaseAdmin
    .from("users")
    .select("id, default_nickname, default_avatar, last_seen_at")
    .in("id", memberUserIds);
  const userById = new Map(
    (users ?? []).map((u) => [
      u.id as string,
      {
        defaultNickname: (u.default_nickname as string | null) ?? null,
        defaultAvatar: (u.default_avatar as string | null) ?? null,
        lastSeenAt: u.last_seen_at as string,
      },
    ])
  );

  const decoratedMembers = (members ?? []).map((m) => {
    const u = userById.get(m.user_id as string);
    return {
      userId: m.user_id as string,
      nickname: m.nickname as string,
      role: m.role as string,
      joinedAt: m.joined_at as string,
      defaultAvatar: u?.defaultAvatar ?? null,
      lastSeenAt: u?.lastSeenAt ?? null,
    };
  });

  return NextResponse.json({
    id: group.id as string,
    name: group.name as string,
    inviteCode: group.invite_code as string,
    ownerUserId: group.owner_user_id as string,
    createdAt: group.created_at as string,
    members: decoratedMembers,
  });
}

// PATCH /api/groups/[id]
// Body: { userId, name }
// Owner-only rename. No rate limit.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    name?: string;
  };
  const userId = body.userId?.trim();
  const name = body.name?.trim();
  if (!userId || !name) {
    return NextResponse.json(
      { error: "userId and name required" },
      { status: 400 }
    );
  }
  if (name.length > 60) {
    return NextResponse.json(
      { error: "name must be ≤60 chars" },
      { status: 400 }
    );
  }

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("owner_user_id")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  }
  if (group.owner_user_id !== userId) {
    return NextResponse.json({ error: "owner only" }, { status: 403 });
  }

  const { error: updErr } = await supabaseAdmin
    .from("groups")
    .update({ name })
    .eq("id", groupId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/groups/[id]
// Body: { userId, confirm: true }
// Owner-only. Cascade-deletes group + group_members. Requires
// explicit confirm to avoid accidental deletes from a misfired
// fetch.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    confirm?: boolean;
  };
  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "confirm must be true" },
      { status: 400 }
    );
  }

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("owner_user_id")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  }
  if (group.owner_user_id !== userId) {
    return NextResponse.json({ error: "owner only" }, { status: 403 });
  }

  const { error: delErr } = await supabaseAdmin
    .from("groups")
    .delete()
    .eq("id", groupId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
