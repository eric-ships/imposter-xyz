import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { advanceCard } from "@/games/just-one/state";
import type { JustOneState } from "@/games/just-one/types";
import {
  MATCH_HISTORY_CAP,
  snapshotJustOneMatch,
  type MatchHistoryEntry,
} from "@/lib/match-history";
import { writeMatchResultIfAttributed } from "@/lib/group-stats";

// POST /api/rooms/[code]/just-one/next-card
// Body: { playerId }
// Host-only. From reveal → next card (or → final). From final →
// replay (resets the match with the same players).
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

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("kind, game_state, host_id, match_history, group_id")
    .eq("code", code)
    .maybeSingle();
  if (!room || room.kind !== "just-one") {
    return NextResponse.json(
      { error: "just-one room not found" },
      { status: 404 }
    );
  }
  if (room.host_id !== playerId) {
    return NextResponse.json({ error: "host only" }, { status: 403 });
  }
  const state = room.game_state as JustOneState | null;
  if (!state) {
    return NextResponse.json({ error: "no match in progress" }, { status: 400 });
  }

  let nextState: JustOneState | null = null;
  let nextHistory: MatchHistoryEntry[] | undefined;
  let backToLobby = false;
  if (state.phase === "reveal") {
    nextState = advanceCard(state);
  } else if (state.phase === "final") {
    // Snapshot the just-finished match before resetting.
    const existingHistory: MatchHistoryEntry[] =
      "match_history" in room && Array.isArray(room.match_history)
        ? (room.match_history as MatchHistoryEntry[])
        : [];
    // Final-state score includes the last card (advanceCard pushed it
    // into history before transitioning).
    const correctCount = state.history.filter(
      (h) => h.outcome === "correct"
    ).length;
    const snap = snapshotJustOneMatch({
      matchNumber: existingHistory.length + 1,
      totalCards: state.totalCards,
      score: correctCount,
    });
    nextHistory = [snap, ...existingHistory].slice(0, MATCH_HISTORY_CAP);

    const { data: players } = await supabaseAdmin
      .from("players")
      .select("id, user_id")
      .eq("room_code", code)
      .order("joined_at", { ascending: true });

    // Persist to match_results if attributed to a friend group.
    await writeMatchResultIfAttributed({
      groupId: ("group_id" in room
        ? (room.group_id as string | null)
        : null) ?? null,
      roomCode: code,
      gameKind: "just-one",
      snapshot: snap,
      players: (players ?? []).map((p) => ({
        id: p.id as string,
        user_id: (p.user_id as string | null) ?? null,
      })),
    });

    // Match over — return the host to the lobby to pick the next
    // game (the kind switcher lives there). `players` above is still
    // used for the group-stats write.
    void players;
    backToLobby = true;
  } else {
    return NextResponse.json(
      { error: "can only advance from reveal or final" },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (backToLobby) {
    update.state = "lobby";
    update.game_state = {};
  } else {
    update.game_state = nextState;
  }
  if (nextHistory && "match_history" in room) {
    update.match_history = nextHistory;
  }
  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update(update)
    .eq("code", code);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  await notifyRoom(code, "just_one_next_card");
  return NextResponse.json({ ok: true });
}
