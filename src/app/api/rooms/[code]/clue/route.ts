import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { deadlineFor } from "@/lib/timer";

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
  const trimmed = word?.trim();
  if (!playerId || !trimmed) {
    return NextResponse.json(
      { error: "playerId and word required" },
      { status: 400 }
    );
  }
  if (trimmed.length > 40) {
    return NextResponse.json({ error: "word too long" }, { status: 400 });
  }

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.state !== "playing") {
    return NextResponse.json({ error: "not in play phase" }, { status: 400 });
  }

  const turnOrder: string[] = room.turn_order ?? [];
  const currentPlayer = turnOrder[room.turn_index];
  if (currentPlayer !== playerId) {
    return NextResponse.json({ error: "not your turn" }, { status: 403 });
  }

  const { error: clueErr } = await supabaseAdmin.from("clues").insert({
    room_code: code,
    player_id: playerId,
    round: room.round,
    word: trimmed,
  });
  if (clueErr) {
    return NextResponse.json({ error: clueErr.message }, { status: 500 });
  }

  // Advance turn/round/state.
  let nextTurnIndex = room.turn_index + 1;
  let nextRound = room.round;
  let nextState: "playing" | "voting" = "playing";

  if (nextTurnIndex >= turnOrder.length) {
    nextTurnIndex = 0;
    nextRound += 1;
    if (nextRound > room.total_rounds) {
      nextState = "voting";
      nextRound = room.total_rounds;
    }
  }

  const clueUpdate: Record<string, unknown> = {
    turn_index: nextTurnIndex,
    round: nextRound,
    state: nextState,
    updated_at: new Date().toISOString(),
  };
  if ("phase_deadline" in room) {
    clueUpdate.phase_deadline = deadlineFor(nextState);
  }
  const { error: updateErr } = await supabaseAdmin
    .from("rooms")
    .update(clueUpdate)
    .eq("code", code);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await notifyRoom(
    code,
    nextState === "voting" ? "voting_started" : "clue_submitted"
  );

  return NextResponse.json({ ok: true });
}
