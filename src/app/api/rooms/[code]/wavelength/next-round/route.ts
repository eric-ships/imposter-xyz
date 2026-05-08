import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { advanceRound, replayMatch } from "@/games/wavelength/state";
import type { WavelengthState } from "@/games/wavelength/types";

// POST /api/rooms/[code]/wavelength/next-round
// Body: { playerId }
// Host-only. From reveal → next round (or → final). From final →
// replay (resets the match with the same players).
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
  if (!room || room.kind !== "wavelength") {
    return NextResponse.json({ error: "wavelength room not found" }, { status: 404 });
  }
  if (room.host_id !== playerId) {
    return NextResponse.json({ error: "host only" }, { status: 403 });
  }
  const state = room.game_state as WavelengthState | null;
  if (!state) {
    return NextResponse.json({ error: "no match in progress" }, { status: 400 });
  }

  let nextState: WavelengthState;
  if (state.phase === "reveal") {
    nextState = advanceRound(state, state.concept ? [state.concept] : []);
  } else if (state.phase === "final") {
    const { data: players } = await supabaseAdmin
      .from("players")
      .select("id")
      .eq("room_code", code)
      .order("joined_at", { ascending: true });
    nextState = replayMatch(
      (players ?? []).map((p) => p.id as string),
      state.totalRounds
    );
  } else {
    return NextResponse.json(
      { error: "can only advance from reveal or final" },
      { status: 400 }
    );
  }

  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update({
      game_state: nextState,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  await notifyRoom(code, "wavelength_next_round");
  return NextResponse.json({ ok: true });
}
