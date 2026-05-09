import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { applyGuess, applySkip } from "@/games/just-one/state";
import type { JustOneState } from "@/games/just-one/types";

// POST /api/rooms/[code]/just-one/guess
// Body: { playerId, guess?, skip? }
// Guesser-only. Either submits a guess (correct/wrong judged
// server-side via normalized stem match) or skips the card.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, guess, skip } = (await request.json()) as {
    playerId?: string;
    guess?: string;
    skip?: boolean;
  };
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }
  if (!skip) {
    const trimmed = guess?.trim() ?? "";
    if (trimmed.length === 0 || trimmed.length > 64) {
      return NextResponse.json(
        { error: "guess must be 1-64 chars" },
        { status: 400 }
      );
    }
  }

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("kind, game_state")
    .eq("code", code)
    .maybeSingle();
  if (!room || room.kind !== "just-one") {
    return NextResponse.json(
      { error: "just-one room not found" },
      { status: 404 }
    );
  }
  const state = room.game_state as JustOneState | null;
  if (!state || state.phase !== "guess") {
    return NextResponse.json(
      { error: "not in guess phase" },
      { status: 400 }
    );
  }
  if (state.guesserId !== playerId) {
    return NextResponse.json({ error: "guesser only" }, { status: 403 });
  }

  const next = skip
    ? applySkip(state)
    : applyGuess(state, guess?.trim() ?? "");
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
  await notifyRoom(code, "just_one_guess");
  return NextResponse.json({ ok: true });
}
