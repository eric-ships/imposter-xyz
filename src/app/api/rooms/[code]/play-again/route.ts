import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import {
  MATCH_HISTORY_CAP,
  snapshotMatch,
  type MatchHistoryEntry,
} from "@/lib/match-history";
import type { GuessOutcome } from "@/lib/game";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId } = (await request.json()) as { playerId?: string };
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

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
  if (room.host_id !== playerId) {
    return NextResponse.json(
      { error: "only host can restart" },
      { status: 403 }
    );
  }
  if (room.state !== "reveal") {
    return NextResponse.json({ error: "not in reveal" }, { status: 400 });
  }

  // Snapshot the just-finished match into match_history before we wipe
  // the room state. Need players for nickname/avatar capture (so the
  // history entry doesn't break if someone leaves or renames later).
  const { data: playersForSnapshot } = await supabaseAdmin
    .from("players")
    .select("id, nickname, avatar")
    .eq("room_code", code)
    .order("joined_at", { ascending: true });

  const existingHistory: MatchHistoryEntry[] =
    "match_history" in room && Array.isArray(room.match_history)
      ? (room.match_history as MatchHistoryEntry[])
      : [];

  // Skip if we somehow got into reveal without the data we need
  // (defensive — shouldn't happen, but don't crash play-again on it).
  const imposterIdsForSnap: string[] = Array.isArray(room.imposter_ids)
    ? (room.imposter_ids as string[]).filter(Boolean)
    : room.imposter_id
      ? [room.imposter_id as string]
      : [];

  let nextHistory = existingHistory;
  if (room.category && room.secret_word && imposterIdsForSnap.length > 0) {
    const snap = snapshotMatch({
      matchNumber: existingHistory.length + 1,
      category: room.category as string,
      secretWord: room.secret_word as string,
      imposterIds: imposterIdsForSnap,
      caughtImposterId:
        ("caught_imposter_id" in room
          ? (room.caught_imposter_id as string | null)
          : null) ?? null,
      guess: (room.imposter_guess as string | null) ?? null,
      guessOutcome: (room.guess_outcome as GuessOutcome | null) ?? null,
      players: (playersForSnapshot ?? []).map((p) => ({
        id: p.id as string,
        nickname: p.nickname as string,
        avatar: (p.avatar as string | null) ?? null,
      })),
    });
    // Newest first; cap so a long lobby session doesn't grow unbounded.
    nextHistory = [snap, ...existingHistory].slice(0, MATCH_HISTORY_CAP);
  }

  await Promise.all([
    supabaseAdmin.from("clues").delete().eq("room_code", code),
    supabaseAdmin.from("votes").delete().eq("room_code", code),
    // Pot was already settled on chain during reveal; clear the per-player
    // ante state so the next round can be re-anted.
    supabaseAdmin
      .from("players")
      .update({ ante_tx: null, partner_id: null, investigated_id: null })
      .eq("room_code", code),
  ]);

  const update: Record<string, unknown> = {
    state: "lobby",
    category: null,
    secret_word: null,
    imposter_id: null,
    round: 0,
    turn_index: 0,
    turn_order: [],
    updated_at: new Date().toISOString(),
  };
  // Defensive: only set match_history if the column exists on this row.
  // Pre-migration DBs don't have it; writing the field would error on
  // the update.
  if ("match_history" in room) update.match_history = nextHistory;
  if ("phase_deadline" in room) update.phase_deadline = null;
  if ("imposter_ids" in room) update.imposter_ids = [];
  if ("caught_imposter_id" in room) update.caught_imposter_id = null;
  if ("imposter_guess" in room) update.imposter_guess = null;
  if ("guess_outcome" in room) update.guess_outcome = null;
  if ("guess_candidates" in room) update.guess_candidates = [];
  if ("police_id" in room) update.police_id = null;
  if ("prewarm_word" in room) {
    update.prewarm_word = null;
    update.prewarm_category = null;
    update.prewarm_started_at = null;
  }
  // Pot toggle resets each match; host has to explicitly re-enable for
  // the next round so nobody gets charged by surprise.
  if ("pot_enabled" in room) {
    update.pot_enabled = false;
    update.ante_amount = null;
    update.chain_game_id = null;
    update.chain_create_tx = null;
    update.chain_resolve_tx = null;
  }

  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update(update)
    .eq("code", code);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await notifyRoom(code, "restarted");

  return NextResponse.json({ ok: true });
}
