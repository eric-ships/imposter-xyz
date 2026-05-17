import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { replayMatch } from "@/games/hold/state";
import type { HoldState } from "@/games/hold/types";

// POST /api/rooms/[code]/hold/play-again
// Body: { playerId }
// Host-only. From a finished run (victory / defeat) → a fresh match
// with the same players. Resets game_state to a new planning wave.
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
    .select("kind, game_state, host_id")
    .eq("code", code)
    .maybeSingle();
  if (!room || room.kind !== "hold") {
    return NextResponse.json(
      { error: "hold room not found" },
      { status: 404 }
    );
  }
  if (room.host_id !== playerId) {
    return NextResponse.json({ error: "host only" }, { status: 403 });
  }
  const state = room.game_state as HoldState | null;
  if (!state) {
    return NextResponse.json(
      { error: "no match in progress" },
      { status: 400 }
    );
  }
  if (state.phase !== "victory" && state.phase !== "defeat") {
    return NextResponse.json(
      { error: "match is not over" },
      { status: 400 }
    );
  }

  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("room_code", code)
    .order("joined_at", { ascending: true });
  const playerIds = (players ?? []).map((p) => p.id as string);

  const nextState = replayMatch(playerIds);

  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update({
      state: "playing",
      game_state: nextState,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  await notifyRoom(code, "hold_play_again");
  return NextResponse.json({ ok: true });
}
