import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// POST /api/groups/[id]/nickname
// Body: { userId, nickname }
// Sets — or CLEARS — the caller's optional per-group display-name
// override. Membership-gated; you can only rename yourself.
//
// One-identity: group_members.nickname is an optional override on top
// of the user's authored identity. A non-empty `nickname` sets the
// override; an empty/blank `nickname` clears it (column → null), so
// the member falls back to inheriting their users.default_nickname.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    nickname?: string;
  };
  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json(
      { error: "userId required" },
      { status: 400 }
    );
  }
  // Empty/blank → clear the override (inherit identity).
  const nicknameOverride = body.nickname?.trim() || null;
  if (nicknameOverride && nicknameOverride.length > 20) {
    return NextResponse.json(
      { error: "name must be ≤20 chars" },
      { status: 400 }
    );
  }

  // Membership gate — also the authorization check (you can only be
  // a member once, so updating your own row needs no separate auth).
  const { data: membership } = await supabaseAdmin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "not a member" }, { status: 403 });
  }

  const { error: updErr } = await supabaseAdmin
    .from("group_members")
    .update({ nickname: nicknameOverride })
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, nicknameOverride });
}
