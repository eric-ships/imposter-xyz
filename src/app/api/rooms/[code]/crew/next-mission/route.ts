import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { replayMatch } from "@/games/crew/state";
import type { CrewState } from "@/games/crew/types";
import {
  MATCH_HISTORY_CAP,
  snapshotCrewMatch,
  type MatchHistoryEntry,
} from "@/lib/match-history";
import { writeMatchResultIfAttributed } from "@/lib/group-stats";

// POST /api/rooms/[code]/crew/next-mission
// Body: { playerId }
// Host-only. Only valid in the 'reveal' phase. Snapshots the finished
// mission into rooms.match_history (newest first, capped), persists a
// copy to group stats if the room is group-attributed, then replays
// the match with the same players.
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
  if (!room || room.kind !== "crew") {
    return NextResponse.json(
      { error: "crew room not found" },
      { status: 404 }
    );
  }
  if (room.host_id !== playerId) {
    return NextResponse.json({ error: "host only" }, { status: 403 });
  }
  const state = room.game_state as CrewState | null;
  if (!state) {
    return NextResponse.json(
      { error: "no match in progress" },
      { status: 400 }
    );
  }
  if (state.phase !== "reveal") {
    return NextResponse.json(
      { error: "can only advance from reveal" },
      { status: 400 }
    );
  }
  if (!state.outcome) {
    return NextResponse.json(
      { error: "mission has no result" },
      { status: 400 }
    );
  }

  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id, nickname, avatar, user_id")
    .eq("room_code", code)
    .order("joined_at", { ascending: true });
  const playerList = players ?? [];
  const playerIds = playerList.map((p) => p.id as string);

  // Snapshot the just-finished mission before resetting.
  const existingHistory: MatchHistoryEntry[] =
    "match_history" in room && Array.isArray(room.match_history)
      ? (room.match_history as MatchHistoryEntry[])
      : [];
  const snap = snapshotCrewMatch({
    matchNumber: existingHistory.length + 1,
    outcome: state.outcome,
    tasks: state.tasks.map((t) => ({
      ownerId: t.ownerId,
      done: t.done,
    })),
    players: playerList.map((p) => ({
      id: p.id as string,
      nickname: p.nickname as string,
      avatar: (p.avatar as string | null) ?? null,
    })),
  });
  const nextHistory = [snap, ...existingHistory].slice(
    0,
    MATCH_HISTORY_CAP
  );

  // Persist to match_results if attributed to a friend group.
  await writeMatchResultIfAttributed({
    groupId: ("group_id" in room
      ? (room.group_id as string | null)
      : null) ?? null,
    roomCode: code,
    gameKind: "crew",
    snapshot: snap,
    players: playerList.map((p) => ({
      id: p.id as string,
      user_id: (p.user_id as string | null) ?? null,
    })),
  });

  const nextState = replayMatch(playerIds);

  const update: Record<string, unknown> = {
    game_state: nextState,
    updated_at: new Date().toISOString(),
  };
  if ("match_history" in room) {
    update.match_history = nextHistory;
  }
  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update(update)
    .eq("code", code);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  await notifyRoom(code, "crew_next_mission");
  return NextResponse.json({ ok: true });
}
