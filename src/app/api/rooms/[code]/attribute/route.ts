import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";

// POST /api/rooms/[code]/attribute
// Body: { playerId, userId, groupId | null }
//
// Host-only, lobby-only. Sets the room's group attribution so that
// match-end snapshots write to match_results for the named group.
// Pass groupId = null (or omit) to detach (room becomes casual —
// matches won't persist beyond the lobby).
//
// Validation:
//   - caller is the room host
//   - room.state === 'lobby'
//   - if groupId is set, the host's userId is a member of that group
//
// userId is required so we can check group membership without trusting
// the client's claim of "I'm a member" — we re-verify against
// group_members. The client passes both playerId (room identity) and
// userId (cross-room identity from /api/users/me).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const body = (await request.json().catch(() => ({}))) as {
    playerId?: string;
    userId?: string;
    groupId?: string | null;
  };
  const playerId = body.playerId?.trim();
  const userId = body.userId?.trim();
  const groupId = body.groupId?.trim() || null;
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("host_id, state, group_id")
    .eq("code", code)
    .maybeSingle();
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.host_id !== playerId) {
    return NextResponse.json({ error: "host only" }, { status: 403 });
  }
  if (room.state !== "lobby") {
    return NextResponse.json(
      { error: "can only attribute in the lobby" },
      { status: 400 }
    );
  }

  // No-op if already in the requested state.
  const currentGroupId = (room.group_id as string | null) ?? null;
  if (currentGroupId === groupId) {
    return NextResponse.json({ ok: true, changed: false });
  }

  // Validate membership when attaching to a group.
  if (groupId) {
    if (!userId) {
      return NextResponse.json(
        { error: "userId required to attach a group" },
        { status: 400 }
      );
    }
    const { data: membership } = await supabaseAdmin
      .from("group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json(
        { error: "you're not a member of that group" },
        { status: 403 }
      );
    }
  }

  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update({
      group_id: groupId,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  await notifyRoom(code, "attribution_changed");
  return NextResponse.json({ ok: true, changed: true });
}
