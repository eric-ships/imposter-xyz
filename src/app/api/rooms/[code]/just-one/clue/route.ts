import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { applyClue } from "@/games/just-one/state";
import type { JustOneState } from "@/games/just-one/types";

// POST /api/rooms/[code]/just-one/clue
// Body: { playerId, word }
// Non-guesser only. Submits a one-word clue. The last clue to land
// auto-advances to guess phase (with eliminations computed).
// Submitting twice replaces your prior entry.
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
  if (!playerId || !word) {
    return NextResponse.json(
      { error: "playerId and word required" },
      { status: 400 }
    );
  }
  const trimmed = word.trim();
  if (trimmed.length === 0 || trimmed.length > 64) {
    return NextResponse.json(
      { error: "word must be 1-64 chars" },
      { status: 400 }
    );
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
  if (!state || state.phase !== "clue") {
    return NextResponse.json(
      { error: "not in clue phase" },
      { status: 400 }
    );
  }
  if (state.guesserId === playerId) {
    return NextResponse.json(
      { error: "guesser cannot submit a clue" },
      { status: 403 }
    );
  }

  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("room_code", code);
  const clueGiverIds = (players ?? []).map((p) => p.id as string);

  const next = applyClue(state, clueGiverIds, {
    playerId,
    word: trimmed,
  });
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
  await notifyRoom(code, "just_one_clue");
  return NextResponse.json({ ok: true });
}
