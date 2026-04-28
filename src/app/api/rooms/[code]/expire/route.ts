import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom, tallyVotes } from "@/lib/room-state";
import { settlePot } from "@/lib/settle";
import { deadlineFor } from "@/lib/timer";
import type { RoomState } from "@/lib/game";

// Called by the client when its countdown hits zero. The server re-validates
// against its own clock and the room's current phase_deadline before applying
// any forfeit, so a stale or crafted client request can't force early
// expiry. Idempotent: multiple callers racing after the same deadline are
// filtered by the CAS update on (state, turn_index).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();

  const { data: room, error: roomErr } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (roomErr) {
    return NextResponse.json({ error: roomErr.message }, { status: 500 });
  }
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }

  const state = room.state as RoomState;
  if (state !== "playing" && state !== "voting" && state !== "guessing") {
    return NextResponse.json({ ok: true, noop: true });
  }

  const deadline = room.phase_deadline as string | null;
  if (!deadline) {
    return NextResponse.json({ ok: true, noop: true });
  }
  // 2s grace for client/server clock skew: a client firing at exactly
  // the deadline shouldn't be rejected.
  if (Date.now() + 2000 < new Date(deadline).getTime()) {
    return NextResponse.json(
      { error: "not expired" },
      { status: 400 }
    );
  }

  if (state === "playing") {
    return expirePlaying(code, room);
  }
  if (state === "voting") {
    return expireVoting(code, room);
  }
  return expireGuessing(code, room);
}

type Room = Record<string, unknown> & {
  code: string;
  state: string;
  turn_index: number;
  turn_order: string[];
  round: number;
  total_rounds: number;
  imposter_id: string | null;
  imposter_ids?: string[] | null;
};

function imposterIdsFrom(room: Room): string[] {
  return Array.isArray(room.imposter_ids)
    ? (room.imposter_ids as string[]).filter(Boolean)
    : room.imposter_id
      ? [room.imposter_id]
      : [];
}

async function expirePlaying(code: string, room: Room) {
  const turnOrder: string[] = room.turn_order ?? [];
  const currentPlayerId = turnOrder[room.turn_index];
  if (!currentPlayerId) {
    return NextResponse.json({ ok: true, noop: true });
  }

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

  // CAS: only advance if turn_index hasn't moved on us.
  const { data: updated } = await supabaseAdmin
    .from("rooms")
    .update({
      turn_index: nextTurnIndex,
      round: nextRound,
      state: nextState,
      phase_deadline: deadlineFor(nextState),
      updated_at: new Date().toISOString(),
    })
    .eq("code", code)
    .eq("state", "playing")
    .eq("turn_index", room.turn_index)
    .select("code")
    .maybeSingle();

  if (!updated) {
    return NextResponse.json({ ok: true, noop: true });
  }

  // Record the forfeit as a blank clue so the UI shows the player was
  // skipped. Idempotent: if /clue already inserted a real clue for this
  // (player, round) the unique constraint blocks the dash and that's
  // fine — the real clue takes precedence.
  const { error: forfeitErr } = await supabaseAdmin.from("clues").insert({
    room_code: code,
    player_id: currentPlayerId,
    round: room.round,
    word: "—",
  });
  if (forfeitErr && !/duplicate|unique/i.test(forfeitErr.message)) {
    console.error("[expire] forfeit clue insert failed", forfeitErr);
  }

  await notifyRoom(
    code,
    nextState === "voting" ? "voting_started" : "clue_submitted"
  );

  return NextResponse.json({ ok: true, forfeited: "clue" });
}

async function expireVoting(code: string, room: Room) {
  // Claim: null out the deadline so a racing caller's CAS fails. State stays
  // 'voting' until we know where we're headed (guessing vs. reveal).
  const { data: claimed } = await supabaseAdmin
    .from("rooms")
    .update({
      phase_deadline: null,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code)
    .eq("state", "voting")
    .not("phase_deadline", "is", null)
    .select("code")
    .maybeSingle();

  if (!claimed) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const { data: votes } = await supabaseAdmin
    .from("votes")
    .select("voter_id, target_id")
    .eq("room_code", code);

  const { topTargets, tied, topCount } = tallyVotes(votes ?? []);
  const imposterIds = imposterIdsFrom(room);
  // A tie counts as a catch only when every top-tied target is an imposter
  // (e.g. 2-2 between two imposters in a 5-player room) — the table
  // correctly fingered the team. Otherwise plurality has to be on a single
  // imposter.
  const allTopAreImposters =
    topCount > 0 && topTargets.every((id) => imposterIds.includes(id));
  const caughtId: string | null = allTopAreImposters ? topTargets[0] : null;

  if (caughtId) {
    const guessUpdate: Record<string, unknown> = {
      state: "guessing",
      phase_deadline: deadlineFor("guessing"),
      updated_at: new Date().toISOString(),
    };
    if ("caught_imposter_id" in room) guessUpdate.caught_imposter_id = caughtId;
    await supabaseAdmin.from("rooms").update(guessUpdate).eq("code", code);

    await notifyRoom(code, "guessing_started");
    return NextResponse.json({ ok: true, forfeited: "vote" });
  }

  // Imposter team escaped (or no votes / tied): award each imposter +2,
  // settle, reveal. Reset everyone else's last_round_delta so stale
  // badges from a previous match don't linger.
  await supabaseAdmin
    .from("players")
    .update({ last_round_delta: 0 })
    .eq("room_code", code);
  for (const impId of imposterIds) {
    const { data: current } = await supabaseAdmin
      .from("players")
      .select("score")
      .eq("id", impId)
      .single();
    await supabaseAdmin
      .from("players")
      .update({
        score: (current?.score ?? 0) + 2,
        last_round_delta: 2,
      })
      .eq("id", impId);
  }

  if (imposterIds.length > 0) {
    await settlePot(
      { ...room, code },
      {
        imposterIds,
        caught: false,
        tied,
        guessOutcome: null,
      }
    );
  }

  await supabaseAdmin
    .from("rooms")
    .update({
      state: "reveal",
      phase_deadline: null,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);

  await notifyRoom(code, "revealed");
  return NextResponse.json({ ok: true, forfeited: "vote" });
}

async function expireGuessing(code: string, room: Room) {
  // Claim the transition atomically.
  const { data: claimed } = await supabaseAdmin
    .from("rooms")
    .update({
      state: "reveal",
      imposter_guess: null,
      guess_outcome: "wrong",
      phase_deadline: null,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code)
    .eq("state", "guessing")
    .select("code")
    .maybeSingle();

  if (!claimed) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const imposterIds = imposterIdsFrom(room);
  if (imposterIds.length === 0) {
    await notifyRoom(code, "revealed");
    return NextResponse.json({ ok: true, forfeited: "guess" });
  }

  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id, score")
    .eq("room_code", code);

  const imposterSet = new Set(imposterIds);
  const crewmates = players?.filter((p) => !imposterSet.has(p.id)) ?? [];
  // Forfeit guess = wrong: only crewmates score. Reset deltas first.
  await supabaseAdmin
    .from("players")
    .update({ last_round_delta: 0 })
    .eq("room_code", code);
  for (const c of crewmates) {
    await supabaseAdmin
      .from("players")
      .update({ score: c.score + 1, last_round_delta: 1 })
      .eq("id", c.id);
  }

  await settlePot(
    { ...room, code },
    {
      imposterIds,
      caught: true,
      tied: false,
      guessOutcome: "wrong",
    }
  );

  await notifyRoom(code, "revealed");
  return NextResponse.json({ ok: true, forfeited: "guess" });
}
