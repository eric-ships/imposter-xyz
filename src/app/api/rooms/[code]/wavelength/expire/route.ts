import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { expireMatch } from "@/games/wavelength/state";
import type { WavelengthState } from "@/games/wavelength/types";

// POST /api/rooms/[code]/wavelength/expire
// No body. Idempotent. Any client can poke this when their local
// countdown hits 0; the server checks the actual deadline (so we
// never advance early on a fast client clock).
//
// Forfeit semantics:
//   clue phase  → placeholder clue ("—"), advance to guessing
//   guessing    → middle-of-dial (50) for any missing guessers,
//                  auto-scores once the last lands
//   reveal/final → no-op (those wait on host action, no clock)
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("kind, game_state")
    .eq("code", code)
    .maybeSingle();
  if (!room || room.kind !== "wavelength") {
    return NextResponse.json(
      { error: "wavelength room not found" },
      { status: 404 }
    );
  }
  const state = room.game_state as WavelengthState | null;
  if (!state || !state.deadline) {
    return NextResponse.json({ ok: true, advanced: false });
  }

  // Need the player roster for guess-phase forfeits.
  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("room_code", code);
  const playerIds = (players ?? []).map((p) => p.id as string);

  const next = expireMatch(state, playerIds);
  if (next === state) {
    return NextResponse.json({ ok: true, advanced: false });
  }

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
  await notifyRoom(code, "wavelength_expired");
  return NextResponse.json({ ok: true, advanced: true });
}
