import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";

// POST /api/rooms/[code]/kick
// Body: { playerId: <hostId>, targetId: <playerToKick> }
// Lobby-only. Refuses if pot is enabled and the target has paid an ante
// (we'd be orphaning their on-chain stake — host must disable pot or
// refund first). Cascade-deletes the player's clues / votes / reactions
// via the existing FK ON DELETE CASCADE on those tables.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, targetId } = (await request.json()) as {
    playerId?: string;
    targetId?: string;
  };
  if (!playerId || !targetId) {
    return NextResponse.json(
      { error: "playerId and targetId required" },
      { status: 400 }
    );
  }
  if (playerId === targetId) {
    return NextResponse.json(
      { error: "cannot kick yourself — use leave instead" },
      { status: 400 }
    );
  }

  const { data: room, error: roomErr } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (roomErr) {
    return NextResponse.json({ error: roomErr.message }, { status: 500 });
  }
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.host_id !== playerId) {
    return NextResponse.json(
      { error: "only the host can kick" },
      { status: 403 }
    );
  }
  if (room.state !== "lobby") {
    return NextResponse.json(
      { error: "can only kick from the lobby" },
      { status: 400 }
    );
  }

  const { data: target, error: targetErr } = await supabaseAdmin
    .from("players")
    .select("id, ante_tx")
    .eq("room_code", code)
    .eq("id", targetId)
    .maybeSingle();
  if (targetErr) {
    return NextResponse.json({ error: targetErr.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json(
      { error: "player not in room" },
      { status: 404 }
    );
  }

  // Pot safety: if the target has paid an ante on chain, deleting them
  // strands their stake. Block until host disables pot or settles refunds.
  const potEnabled = "pot_enabled" in room && !!room.pot_enabled;
  if (potEnabled && target.ante_tx) {
    return NextResponse.json(
      {
        error:
          "target has already anted — disable pot or refund before kicking",
      },
      { status: 400 }
    );
  }

  const { error: delErr } = await supabaseAdmin
    .from("players")
    .delete()
    .eq("id", targetId)
    .eq("room_code", code);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  await notifyRoom(code, "kicked");
  return NextResponse.json({ ok: true });
}
