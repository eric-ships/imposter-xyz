import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { applyPlay } from "@/games/crew/state";
import type { CrewCard, CrewState } from "@/games/crew/types";

// POST /api/rooms/[code]/crew/play
// Body: { playerId, card }
// Plays a card into the current trick. applyPlay validates turn +
// legality server-side; if it returns the state unchanged the action
// was illegal, so we surface a clean 400.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, card } = (await request.json()) as {
    playerId?: string;
    card?: CrewCard;
  };
  if (!playerId || !card) {
    return NextResponse.json(
      { error: "playerId and card required" },
      { status: 400 }
    );
  }

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
  if (!state) {
    return NextResponse.json(
      { error: "no match in progress" },
      { status: 400 }
    );
  }

  const next = applyPlay(state, playerId, card);
  if (next === state) {
    return NextResponse.json(
      { error: "illegal play" },
      { status: 400 }
    );
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
  await notifyRoom(code, "crew_play");
  return NextResponse.json({ ok: true });
}
