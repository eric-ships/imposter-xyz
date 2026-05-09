import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { advanceRound, replayMatch } from "@/games/wavelength/state";
import type { WavelengthState } from "@/games/wavelength/types";
import {
  MATCH_HISTORY_CAP,
  snapshotWavelengthMatch,
  type MatchHistoryEntry,
} from "@/lib/match-history";
import { writeMatchResultIfAttributed } from "@/lib/group-stats";

// POST /api/rooms/[code]/wavelength/next-round
// Body: { playerId }
// Host-only. From reveal → next round (or → final). From final →
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
  if (!room || room.kind !== "wavelength") {
    return NextResponse.json({ error: "wavelength room not found" }, { status: 404 });
  }
  if (room.host_id !== playerId) {
    return NextResponse.json({ error: "host only" }, { status: 403 });
  }
  const state = room.game_state as WavelengthState | null;
  if (!state) {
    return NextResponse.json({ error: "no match in progress" }, { status: 400 });
  }

  let nextState: WavelengthState;
  let nextHistory: MatchHistoryEntry[] | undefined;
  if (state.phase === "reveal") {
    nextState = advanceRound(state, state.concept ? [state.concept] : []);
  } else if (state.phase === "final") {
    // Snapshot the just-finished match before resetting. Same shape
    // contract as imposter — newest first, capped, defensive write.
    const { data: playersForSnap } = await supabaseAdmin
      .from("players")
      .select("id, nickname, avatar, user_id")
      .eq("room_code", code)
      .order("joined_at", { ascending: true });
    const existingHistory: MatchHistoryEntry[] =
      "match_history" in room && Array.isArray(room.match_history)
        ? (room.match_history as MatchHistoryEntry[])
        : [];
    const snap = snapshotWavelengthMatch({
      matchNumber: existingHistory.length + 1,
      totalRounds: state.totalRounds,
      scores: state.scores,
      players: (playersForSnap ?? []).map((p) => ({
        id: p.id as string,
        nickname: p.nickname as string,
        avatar: (p.avatar as string | null) ?? null,
      })),
    });
    nextHistory = [snap, ...existingHistory].slice(0, MATCH_HISTORY_CAP);

    // Persist to match_results if attributed to a friend group.
    await writeMatchResultIfAttributed({
      groupId: ("group_id" in room
        ? (room.group_id as string | null)
        : null) ?? null,
      roomCode: code,
      gameKind: "wavelength",
      snapshot: snap,
      players: (playersForSnap ?? []).map((p) => ({
        id: p.id as string,
        user_id: (p.user_id as string | null) ?? null,
      })),
    });

    // Recompute totalRounds from the current player count so a
    // mid-session table-size change (joined/left between matches) gets
    // the right "two rounds per player" scaling for the replay.
    const replayPlayerIds = (playersForSnap ?? []).map(
      (p) => p.id as string
    );
    nextState = replayMatch(replayPlayerIds, replayPlayerIds.length * 2);
  } else {
    return NextResponse.json(
      { error: "can only advance from reveal or final" },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = {
    game_state: nextState,
    updated_at: new Date().toISOString(),
  };
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
  await notifyRoom(code, "wavelength_next_round");
  return NextResponse.json({ ok: true });
}
