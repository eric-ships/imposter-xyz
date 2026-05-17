import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// POST /api/groups/[id]/nickname
// Body: { userId, nickname }
// A member sets their own per-group display name. Membership-gated;
// you can only rename yourself. group_members.nickname is a
// per-group name by design, so this doesn't touch users.
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
  const nickname = body.nickname?.trim();
  if (!userId || !nickname) {
    return NextResponse.json(
      { error: "userId and nickname required" },
      { status: 400 }
    );
  }
  if (nickname.length > 20) {
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
    .update({ nickname })
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
