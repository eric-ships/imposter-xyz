import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { advanceWave } from "@/games/hold/state";
import type { HoldState } from "@/games/hold/types";
import {
  MATCH_HISTORY_CAP,
  snapshotHoldMatch,
  type MatchHistoryEntry,
} from "@/lib/match-history";
import { writeMatchResultIfAttributed } from "@/lib/group-stats";

// POST /api/rooms/[code]/hold/next-wave
// Body: { playerId }
// Host-only. Advances from reveal → the next planning wave, or →
// victory / defeat. When the run ends, the finished match is
// snapshotted into rooms.match_history and (if the room is attributed
// to a friend group) written to the group's stat store.
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
  if (!room || room.kind !== "hold") {
    return NextResponse.json(
      { error: "hold room not found" },
      { status: 404 }
    );
  }
  if (room.host_id !== playerId) {
    return NextResponse.json({ error: "host only" }, { status: 403 });
  }
  const state = room.game_state as HoldState | null;
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

  const nextState = advanceWave(state);

  const update: Record<string, unknown> = {
    game_state: nextState,
    updated_at: new Date().toISOString(),
  };

  // The run is over — snapshot it before persisting.
  if (nextState.phase === "victory" || nextState.phase === "defeat") {
    const { data: players } = await supabaseAdmin
      .from("players")
      .select("id, nickname, avatar, user_id")
      .eq("room_code", code)
      .order("joined_at", { ascending: true });

    // Count each builder's surviving towers off the final board.
    const towersBuilt: Record<string, number> = {};
    for (const t of nextState.towers) {
      towersBuilt[t.ownerId] = (towersBuilt[t.ownerId] ?? 0) + 1;
    }

    const existingHistory: MatchHistoryEntry[] =
      "match_history" in room && Array.isArray(room.match_history)
        ? (room.match_history as MatchHistoryEntry[])
        : [];

    const snap = snapshotHoldMatch({
      matchNumber: existingHistory.length + 1,
      outcome: nextState.phase,
      // waveNumber is 0-indexed; the run ended on that wave.
      waveReached: nextState.waveNumber + 1,
      totalWaves: nextState.totalWaves,
      coreHp: nextState.coreHp,
      towersBuilt,
      players: (players ?? []).map((p) => ({
        id: p.id as string,
        nickname: p.nickname as string,
        avatar: (p.avatar as string | null) ?? null,
      })),
    });

    if ("match_history" in room) {
      update.match_history = [snap, ...existingHistory].slice(
        0,
        MATCH_HISTORY_CAP
      );
    }

    // Persist to match_results if attributed to a friend group.
    await writeMatchResultIfAttributed({
      groupId: ("group_id" in room
        ? (room.group_id as string | null)
        : null) ?? null,
      roomCode: code,
      gameKind: "hold",
      snapshot: snap,
      players: (players ?? []).map((p) => ({
        id: p.id as string,
        user_id: (p.user_id as string | null) ?? null,
      })),
    });
  }

  const { error: updErr } = await supabaseAdmin
    .from("rooms")
    .update(update)
    .eq("code", code);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  await notifyRoom(code, "hold_next_wave");
  return NextResponse.json({ ok: true });
}
