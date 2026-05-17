import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { initMatch } from "@/games/crew/state";

// POST /api/rooms/[code]/crew/start
// Body: { playerId }
// Host-only. Initializes the mission: shuffles seat order, deals
// hands, assigns one task per player. Advances state.lobby → playing
// (game_state holds the per-mission CrewState). Needs 3-5 players.
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
    .select("kind, host_id, state")
    .eq("code", code)
    .maybeSingle();
  if (!room || room.kind !== "crew") {
    return NextResponse.json(
      { error: "crew room not found" },
      { status: 404 }
    );
  }
  if (room.host_id !== playerId) {
    return NextResponse.json({ error: "host only" }, { status: 403 });
  }
  if (room.state !== "lobby") {
    return NextResponse.json({ error: "already started" }, { status: 400 });
  }

  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("room_code", code)
    .order("joined_at", { ascending: true });
  const playerIds = (players ?? []).map((p) => p.id as string);
  if (playerIds.length < 3 || playerIds.length > 5) {
    return NextResponse.json(
      { error: "need 3-5 players" },
      { status: 400 }
    );
  }

  const gameState = initMatch(playerIds);

  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update({
      state: "playing",
      game_state: gameState,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  await notifyRoom(code, "crew_started");
  return NextResponse.json({ ok: true });
}
