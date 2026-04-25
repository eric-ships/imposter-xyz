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
  // One-word clues only — capped tight enough to keep the clue log
  // readable without wrapping. Anything longer is a sentence, not a clue.
  if (trimmed.length > 24) {
    return NextResponse.json(
      { error: "clue too long (24 chars max)" },
      { status: 400 }
    );
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

  // CAS-claim the turn advance before inserting. If /expire (the timer
  // forfeit) already moved this turn, our update affects 0 rows and we
  // bail out — no duplicate clue, no stale state. Mirrors the pattern
  // used in /expire so the two routes can race safely.
  const { data: claimed } = await supabaseAdmin
    .from("rooms")
    .update(clueUpdate)
    .eq("code", code)
    .eq("state", "playing")
    .eq("turn_index", room.turn_index)
    .select("code")
    .maybeSingle();

  if (!claimed) {
    return NextResponse.json(
      { error: "turn already advanced" },
      { status: 409 }
    );
  }

  // We own the advance — record the clue. Idempotent via the unique
  // (room_code, player_id, round) constraint: if the forfeit row landed
  // first (extremely unlikely now that we CAS first), this insert errors
  // and we still consider the turn advanced.
  const { error: clueErr } = await supabaseAdmin.from("clues").insert({
    room_code: code,
    player_id: playerId,
    round: room.round,
    word: trimmed,
  });
  if (clueErr && !/duplicate|unique/i.test(clueErr.message)) {
    return NextResponse.json({ error: clueErr.message }, { status: 500 });
  }

  await notifyRoom(
    code,
    nextState === "voting" ? "voting_started" : "clue_submitted"
  );

  return NextResponse.json({ ok: true });
}
