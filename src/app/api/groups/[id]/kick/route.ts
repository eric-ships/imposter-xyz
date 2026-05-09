import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// POST /api/groups/[id]/kick
// Body: { ownerId, targetUserId }
// Owner-only. Removes another member from the group. Owner can't
// kick themselves (they'd use DELETE or future transfer instead).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    ownerId?: string;
    targetUserId?: string;
  };
  const ownerId = body.ownerId?.trim();
  const targetUserId = body.targetUserId?.trim();
  if (!ownerId || !targetUserId) {
    return NextResponse.json(
      { error: "ownerId and targetUserId required" },
      { status: 400 }
    );
  }
  if (ownerId === targetUserId) {
    return NextResponse.json(
      { error: "cannot kick yourself — use leave / delete instead" },
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
  if (group.owner_user_id !== ownerId) {
    return NextResponse.json(
      { error: "only the owner can kick" },
      { status: 403 }
    );
  }

  const { data: target } = await supabaseAdmin
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json(
      { error: "target not in group" },
      { status: 404 }
    );
  }

  const { error: delErr } = await supabaseAdmin
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", targetUserId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
