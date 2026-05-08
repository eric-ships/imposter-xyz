import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { applyClue } from "@/games/wavelength/state";
import type { WavelengthState } from "@/games/wavelength/types";

// POST /api/rooms/[code]/wavelength/clue
// Body: { playerId, word }
// Psychic-only. Submits the clue word and advances phase to guessing.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, word } = (await request.json()) as {
    playerId?: string;
    word?: string;
  };
  if (!playerId || !word) {
    return NextResponse.json(
      { error: "playerId and word required" },
      { status: 400 }
    );
  }
  const trimmed = word.trim();
  if (trimmed.length === 0 || trimmed.length > 64) {
    return NextResponse.json(
      { error: "word must be 1-64 chars" },
      { status: 400 }
    );
  }

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("kind, game_state, state")
    .eq("code", code)
    .maybeSingle();
  if (!room || room.kind !== "wavelength") {
    return NextResponse.json({ error: "wavelength room not found" }, { status: 404 });
  }
  const state = room.game_state as WavelengthState | null;
  if (!state || state.phase !== "clue") {
    return NextResponse.json(
      { error: "not in clue phase" },
      { status: 400 }
    );
  }
  if (state.psychicId !== playerId) {
    return NextResponse.json({ error: "psychic only" }, { status: 403 });
  }

  const next = applyClue(state, trimmed);
  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update({
      game_state: next,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  await notifyRoom(code, "wavelength_clue");
  return NextResponse.json({ ok: true });
}
