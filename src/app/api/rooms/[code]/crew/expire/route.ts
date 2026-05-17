import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { expireMatch } from "@/games/crew/state";
import type { CrewState } from "@/games/crew/types";

// POST /api/rooms/[code]/crew/expire
// No body. Idempotent. Any client can poke this when their local
// turn countdown hits 0; the server checks the actual deadline so we
// never force-play early on a fast client clock. On a real expiry the
// stalled player's turn is force-played with their lowest legal card.
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
  if (!room || room.kind !== "crew") {
    return NextResponse.json(
      { error: "crew room not found" },
      { status: 404 }
    );
  }
  const state = room.game_state as CrewState | null;
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
  await notifyRoom(code, "crew_expired");
  return NextResponse.json({ ok: true, advanced: true });
}
