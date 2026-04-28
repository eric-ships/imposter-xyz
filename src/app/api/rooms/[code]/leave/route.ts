import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";

/**
 * Lobby-only: a player removes themselves from the room.
 * - If they were the host, promote the next-joined player to host.
 * - If they were the last player, delete the room.
 * Mid-game leave is intentionally not supported here — closing the tab
 * + the existing forfeit timer handles that case without rebalancing
 * turn order, votes, scores, etc.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId } = (await request.json()) as { playerId?: string };
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("code, state, host_id")
    .eq("code", code)
    .maybeSingle();
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.state !== "lobby") {
    return NextResponse.json(
      { error: "can only leave during lobby" },
      { status: 400 }
    );
  }

  // Verify the player is actually in this room before deleting.
  const { data: me } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("id", playerId)
    .eq("room_code", code)
    .maybeSingle();
  if (!me) {
    return NextResponse.json(
      { error: "not a player in this room" },
      { status: 403 }
    );
  }

  // Delete the player. Cascades nuke any clue/vote rows tied to them
  // (none expected during lobby, but defensive).
  const { error: delErr } = await supabaseAdmin
    .from("players")
    .delete()
    .eq("id", playerId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // If they were the host, promote or delete.
  if (room.host_id === playerId) {
    const { data: next } = await supabaseAdmin
      .from("players")
      .select("id")
      .eq("room_code", code)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!next) {
      // Empty room → delete the room itself. Cascades clean everything.
      await supabaseAdmin.from("rooms").delete().eq("code", code);
      return NextResponse.json({ ok: true, roomDeleted: true });
    }

    await supabaseAdmin
      .from("rooms")
      .update({
        host_id: next.id,
        updated_at: new Date().toISOString(),
      })
      .eq("code", code);
    await notifyRoom(code, "host_transferred");
  } else {
    await notifyRoom(code, "player_left");
  }

  return NextResponse.json({ ok: true });
}
