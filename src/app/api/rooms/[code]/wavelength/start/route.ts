import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { initMatch } from "@/games/wavelength/state";

// POST /api/rooms/[code]/wavelength/start
// Body: { playerId }
// Host-only. Starts a Wavelength match: rotates psychic order, picks
// the first concept + target, advances state from lobby to clue phase.
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
  if (room.kind !== "wavelength") {
    return NextResponse.json(
      { error: "not a wavelength room" },
      { status: 400 }
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
  if (playerIds.length < 3) {
    return NextResponse.json(
      { error: "need at least 3 players" },
      { status: 400 }
    );
  }

  const gameState = initMatch(playerIds);

  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update({
      // We piggyback on the imposter state column to track 'has the
      // match started': anything other than 'lobby' means a match is
      // in progress. The actual phase lives in game_state.phase.
      state: "playing",
      game_state: gameState,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await notifyRoom(code, "wavelength_started");
  return NextResponse.json({ ok: true });
}
