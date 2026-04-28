import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { judgeGuess, normalizeWord } from "@/lib/anthropic";
import { settlePot } from "@/lib/settle";
import type { GuessOutcome } from "@/lib/game";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, guess } = (await request.json()) as {
    playerId?: string;
    guess?: string;
  };
  const trimmed = guess?.trim();
  if (!playerId || !trimmed) {
    return NextResponse.json(
      { error: "playerId and guess required" },
      { status: 400 }
    );
  }
  if (trimmed.length > 80) {
    return NextResponse.json({ error: "guess too long" }, { status: 400 });
  }

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.state !== "guessing") {
    return NextResponse.json(
      { error: "not in guessing phase" },
      { status: 400 }
    );
  }
  // Imposter set: prefer imposter_ids array, fall back to [imposter_id].
  const imposterIds: string[] = Array.isArray(room.imposter_ids)
    ? (room.imposter_ids as string[]).filter(Boolean)
    : room.imposter_id
      ? [room.imposter_id as string]
      : [];
  // Only the imposter the crew actually caught in the vote takes the
  // guess. Fall back to imposter_id for legacy (single-imposter) rooms.
  const caughtImposterId: string | null =
    (room.caught_imposter_id as string | null) ??
    (room.imposter_id as string | null);
  if (caughtImposterId !== playerId) {
    return NextResponse.json(
      { error: "only the caught imposter can guess" },
      { status: 403 }
    );
  }

  // Determine outcome.
  let outcome: GuessOutcome;
  if (normalizeWord(trimmed) === normalizeWord(room.secret_word)) {
    outcome = "exact";
  } else {
    const judgement = await judgeGuess(room.secret_word, trimmed);
    outcome = judgement.close ? "close" : "wrong";
  }

  // Score. Both imposters share the team fate; crewmates are everyone
  // not in the imposter set.
  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id, score")
    .eq("room_code", code);

  const imposterSet = new Set(imposterIds);
  const imposters = players?.filter((p) => imposterSet.has(p.id)) ?? [];
  const crewmates = players?.filter((p) => !imposterSet.has(p.id)) ?? [];

  // Reset everyone's last-round delta to 0 before applying this round's
  // scores; nonzero deltas are then written below for the winners.
  await supabaseAdmin
    .from("players")
    .update({ last_round_delta: 0 })
    .eq("room_code", code);

  if (outcome === "exact") {
    for (const imp of imposters) {
      await supabaseAdmin
        .from("players")
        .update({ score: imp.score + 2, last_round_delta: 2 })
        .eq("id", imp.id);
    }
  } else if (outcome === "close") {
    for (const imp of imposters) {
      await supabaseAdmin
        .from("players")
        .update({ score: imp.score + 1, last_round_delta: 1 })
        .eq("id", imp.id);
    }
    for (const c of crewmates) {
      await supabaseAdmin
        .from("players")
        .update({ score: c.score + 1, last_round_delta: 1 })
        .eq("id", c.id);
    }
  } else {
    for (const c of crewmates) {
      await supabaseAdmin
        .from("players")
        .update({ score: c.score + 1, last_round_delta: 1 })
        .eq("id", c.id);
    }
  }

  // Settle the pot on chain before flipping to reveal.
  await settlePot(
    { code, ...room },
    {
      imposterIds,
      caught: true,
      tied: false,
      guessOutcome: outcome,
    }
  );

  const revealUpdate: Record<string, unknown> = {
    state: "reveal",
    imposter_guess: trimmed,
    guess_outcome: outcome,
    updated_at: new Date().toISOString(),
  };
  if ("phase_deadline" in room) revealUpdate.phase_deadline = null;
  await supabaseAdmin.from("rooms").update(revealUpdate).eq("code", code);

  await notifyRoom(code, "revealed");

  return NextResponse.json({ ok: true, outcome });
}
