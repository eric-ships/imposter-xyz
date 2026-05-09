import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// POST /api/groups/[id]/leave
// Body: { userId }
// Removes the caller from the group. Two special cases:
//   - Owner of a multi-member group: refused with a specific error.
//     Ownership transfer isn't built yet (deferred); owner has to
//     either delete the group (if alone) or wait for the transfer
//     feature to ship.
//   - Owner of a 1-member (only-member) group: also refused — they
//     should hit DELETE instead. Surface the right action explicitly.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
  };
  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("owner_user_id")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  }

  const { data: membership } = await supabaseAdmin
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: "not a member" },
      { status: 404 }
    );
  }

  // Owner-leave gating.
  if (group.owner_user_id === userId) {
    const { count } = await supabaseAdmin
      .from("group_members")
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", groupId);
    if ((count ?? 0) > 1) {
      return NextResponse.json(
        {
          error:
            "transfer ownership before leaving — coming soon",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "you're the only member — delete the group instead" },
      { status: 400 }
    );
  }

  const { error: delErr } = await supabaseAdmin
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
