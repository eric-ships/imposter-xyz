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
  if (room.imposter_id !== playerId) {
    return NextResponse.json(
      { error: "only the imposter can guess" },
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

  // Score.
  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id, score")
    .eq("room_code", code);

  const imposter = players?.find((p) => p.id === room.imposter_id);
  const crewmates = players?.filter((p) => p.id !== room.imposter_id) ?? [];

  if (outcome === "exact") {
    // Imposter wins outright: +2, crewmates get nothing.
    if (imposter) {
      await supabaseAdmin
        .from("players")
        .update({ score: imposter.score + 2 })
        .eq("id", imposter.id);
    }
  } else if (outcome === "close") {
    // Split: imposter +1, each crewmate +1.
    if (imposter) {
      await supabaseAdmin
        .from("players")
        .update({ score: imposter.score + 1 })
        .eq("id", imposter.id);
    }
    for (const c of crewmates) {
      await supabaseAdmin
        .from("players")
        .update({ score: c.score + 1 })
        .eq("id", c.id);
    }
  } else {
    // Wrong: crewmates each +1.
    for (const c of crewmates) {
      await supabaseAdmin
        .from("players")
        .update({ score: c.score + 1 })
        .eq("id", c.id);
    }
  }

  // Settle the pot on chain before flipping to reveal.
  await settlePot(
    { code, ...room },
    {
      imposterId: room.imposter_id,
      caught: true,
      tied: false,
      guessOutcome: outcome,
    }
  );

  await supabaseAdmin
    .from("rooms")
    .update({
      state: "reveal",
      imposter_guess: trimmed,
      guess_outcome: outcome,
      phase_deadline: null,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);

  await notifyRoom(code, "revealed");

  return NextResponse.json({ ok: true, outcome });
}
