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

  // Claim the turn atomically BEFORE inserting the clue row. Guard on the
  // exact (state, round, turn_index) we read — if /expire or a retried
  // /clue already moved things on, the update touches zero rows and we
  // bail out without inserting a duplicate clue. This is the bug where a
  // late /clue submission after /expire had already forfeited the turn
  // produced two clue rows for the same player in the same round.
  const clueUpdate: Record<string, unknown> = {
    turn_index: nextTurnIndex,
    round: nextRound,
    state: nextState,
    updated_at: new Date().toISOString(),
  };
  if ("phase_deadline" in room) {
    clueUpdate.phase_deadline = deadlineFor(nextState);
  }

  const { data: claimed, error: updateErr } = await supabaseAdmin
    .from("rooms")
    .update(clueUpdate)
    .eq("code", code)
    .eq("state", "playing")
    .eq("round", room.round)
    .eq("turn_index", room.turn_index)
    .select("code")
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (!claimed) {
    // Turn already advanced (expire or retry) — don't insert a clue.
    return NextResponse.json(
      { error: "turn already advanced" },
      { status: 409 }
    );
  }

  const { error: clueErr } = await supabaseAdmin.from("clues").insert({
    room_code: code,
    player_id: playerId,
    round: room.round,
    word: trimmed,
  });
  if (clueErr) {
    // 23505 = unique_violation on (room_code, round, player_id). If
    // we hit this after winning the CAS, it means /expire already
    // wrote a blank clue for this slot — nothing to do.
    if (clueErr.code === "23505") {
      return NextResponse.json(
        { error: "clue already recorded this round" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: clueErr.message }, { status: 500 });
  }

  await notifyRoom(
    code,
    nextState === "voting" ? "voting_started" : "clue_submitted"
  );

  return NextResponse.json({ ok: true });
}
