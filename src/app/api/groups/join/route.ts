import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  SIZE_HARD_CAP,
  warnGroupSize,
} from "@/lib/groups";

// POST /api/groups/join
// Body: { userId, code, nickname? }
// Joins the caller into the group identified by invite_code. Refuses
// past the hard cap. Logs a structured warning past the soft
// threshold (see /lib/groups.ts).
//
// Idempotent: if the user is already a member, returns the existing
// row without erroring. Lets a stale tab re-fire without surprise.
//
// One-identity: group_members.nickname is an OPTIONAL per-group
// override. Left null (the normal case) the member inherits their
// users.default_nickname. Only an explicit non-empty `nickname` in
// the body gets written.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    code?: string;
    nickname?: string;
  };
  const userId = body.userId?.trim();
  const code = body.code?.trim().toUpperCase();
  if (!userId || !code) {
    return NextResponse.json(
      { error: "userId and code required" },
      { status: 400 }
    );
  }

  // Look up the group + the user (existence check only — the member's
  // display name inherits from the user's identity).
  const [{ data: group }, { data: user }] = await Promise.all([
    supabaseAdmin
      .from("groups")
      .select("id, name")
      .eq("invite_code", code)
      .maybeSingle(),
    supabaseAdmin
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  if (!group) {
    return NextResponse.json(
      { error: "invalid invite code" },
      { status: 404 }
    );
  }
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  // Already a member? Idempotent return.
  const { data: existing } = await supabaseAdmin
    .from("group_members")
    .select("group_id, role")
    .eq("group_id", group.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      groupId: group.id,
      role: existing.role,
      alreadyMember: true,
    });
  }

  // Cap check.
  const { count } = await supabaseAdmin
    .from("group_members")
    .select("user_id", { count: "exact", head: true })
    .eq("group_id", group.id);
  const currentSize = count ?? 0;
  if (currentSize >= SIZE_HARD_CAP) {
    return NextResponse.json(
      { error: `group is full · max ${SIZE_HARD_CAP} members` },
      { status: 400 }
    );
  }

  // null = inherit the user's identity. Only set when the body
  // explicitly passes a non-empty override.
  const nicknameOverride = body.nickname?.trim() || null;

  const { error: memberErr } = await supabaseAdmin
    .from("group_members")
    .insert({
      group_id: group.id,
      user_id: userId,
      nickname: nicknameOverride,
      role: "member",
    });
  if (memberErr) {
    return NextResponse.json(
      { error: memberErr.message },
      { status: 500 }
    );
  }

  // Log past the soft threshold (now that we've added one).
  warnGroupSize(group.id as string, currentSize + 1);

  return NextResponse.json({
    groupId: group.id,
    name: group.name,
    role: "member",
  });
}
