import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { expireMatch } from "@/games/hold/state";
import type { HoldState } from "@/games/hold/types";

// POST /api/rooms/[code]/hold/expire
// No body. Idempotent. Any client can poke this when their local
// planning countdown hits 0; the server checks the real deadline so
// a fast client clock never resolves the wave early.
//
// On expiry the wave resolves with whatever towers are on the board
// (planning → reveal).
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
  if (!room || room.kind !== "hold") {
    return NextResponse.json(
      { error: "hold room not found" },
      { status: 404 }
    );
  }
  const state = room.game_state as HoldState | null;
  if (!state || !state.deadline) {
    return NextResponse.json({ ok: true, advanced: false });
  }

  const next = expireMatch(state);
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
  await notifyRoom(code, "hold_expired");
  return NextResponse.json({ ok: true, advanced: true });
}
