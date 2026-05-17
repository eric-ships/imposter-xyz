// Server-side helper for writing a finished match to a friend group's
// stat store. Called from each game's "play-again" / "next-card" /
// "next-round" final → replay code path WHEN room.group_id is set.
//
// The snapshot is the existing MatchHistoryEntry shape (jsonb), which
// already lives on rooms.match_history for the lobby-scoped session
// log. We persist a copy to match_results for cross-session group
// stats + emit per-player rows into match_player_results so future
// stat queries don't need to re-parse the snapshot.

import { supabaseAdmin } from "@/lib/supabase/server";
import { postMatchToDiscord } from "@/lib/discord-webhook";
import type {
  CrewMatchEntry,
  HoldMatchEntry,
  ImposterMatchEntry,
  JustOneMatchEntry,
  MatchHistoryEntry,
  WavelengthMatchEntry,
} from "@/lib/match-history";

type RoomPlayer = {
  id: string;
  user_id: string | null;
};

type PlayerResultRow = {
  user_id: string;
  role: string | null;
  won: boolean | null;
  delta: number;
};

// Discriminate the snapshot and produce per-player rows. Players
// without a user_id (legacy rows pre-Phase-1) are skipped — their
// participation can't be attributed.
function derivePlayerResults(
  snapshot: MatchHistoryEntry,
  players: RoomPlayer[]
): PlayerResultRow[] {
  const userIdByPlayerId = new Map(
    players.map((p) => [p.id, p.user_id ?? null])
  );
  const allRoomUserIds = players
    .map((p) => p.user_id)
    .filter((u): u is string => !!u);

  // Wavelength: winners are the top-scoring perPlayer entries. Role
  // per-match is "guesser" — psychic is rotating, so it doesn't map
  // cleanly to a single per-match role. (When match-level role
  // tracking matters we can extend match_player_results.)
  if ("kind" in snapshot && snapshot.kind === "wavelength") {
    const w = snapshot as WavelengthMatchEntry;
    const winnerSet = new Set(w.winnerIds);
    const rows: PlayerResultRow[] = [];
    for (const p of w.perPlayer) {
      const userId = userIdByPlayerId.get(p.playerId) ?? null;
      if (!userId) continue;
      rows.push({
        user_id: userId,
        role: "guesser",
        won: winnerSet.has(p.playerId),
        delta: p.score,
      });
    }
    return rows;
  }

  // Just One: cooperative — no per-player perspective on the snapshot.
  // Every user at the table gets a row with the team score as delta;
  // won is null since there are no individual winners in cooperative
  // games.
  if ("kind" in snapshot && snapshot.kind === "just-one") {
    const j = snapshot as JustOneMatchEntry;
    return allRoomUserIds.map((uid) => ({
      user_id: uid,
      role: null,
      won: null,
      delta: j.score,
    }));
  }

  // Crew: cooperative — the whole crew wins or loses together. Every
  // user at the table gets a row; `won` reflects the shared outcome
  // and `delta` carries how many tasks the crew completed.
  if ("kind" in snapshot && snapshot.kind === "crew") {
    const c = snapshot as CrewMatchEntry;
    const tasksDone = c.perPlayer.filter((p) => p.taskDone).length;
    return allRoomUserIds.map((uid) => ({
      user_id: uid,
      role: null,
      won: c.outcome === "won",
      delta: tasksDone,
    }));
  }

  // Hold: cooperative — the whole table wins or loses together. Every
  // user at the table gets a row; won reflects the shared outcome
  // (victory) and delta carries the wave reached as a progress score.
  if ("kind" in snapshot && snapshot.kind === "hold") {
    const h = snapshot as HoldMatchEntry;
    const won = h.outcome === "victory";
    return allRoomUserIds.map((uid) => ({
      user_id: uid,
      role: null,
      won,
      delta: h.waveReached,
    }));
  }

  // Imposter (default; pre-multi-game entries have no `kind` tag).
  const im = snapshot as ImposterMatchEntry;
  const winner = im.winner;
  const rows: PlayerResultRow[] = [];
  for (const p of im.perPlayer) {
    const userId = userIdByPlayerId.get(p.playerId) ?? null;
    if (!userId) continue;
    const role = p.wasImposter ? "imposter" : "crewmate";
    // Draw → both sides get won=false (it's not a "win" for anyone);
    // the per-player delta still reflects the +1 each side earned, so
    // stats showing avg delta are honest.
    let won: boolean;
    if (winner === "draw") won = false;
    else if (winner === "imposter") won = p.wasImposter;
    else won = !p.wasImposter;
    rows.push({
      user_id: userId,
      role,
      won,
      delta: p.delta,
    });
  }
  return rows;
}

// Insert a match_results row + the matching match_player_results
// rows. Called only when room.group_id is set. Defensive — if the
// match_results table doesn't exist (pre-migration) we swallow the
// error so the calling route's primary work (resetting state for
// replay) still succeeds. The match_history JSON on the room still
// captures the session log.
export async function writeMatchResultIfAttributed(args: {
  groupId: string | null;
  roomCode: string;
  gameKind: string;
  snapshot: MatchHistoryEntry;
  players: RoomPlayer[];
}): Promise<void> {
  if (!args.groupId) return;
  try {
    const { data: match, error: matchErr } = await supabaseAdmin
      .from("match_results")
      .insert({
        group_id: args.groupId,
        room_code: args.roomCode,
        game_kind: args.gameKind,
        ended_at: args.snapshot.endedAt,
        snapshot: args.snapshot,
      })
      .select("id")
      .single();
    if (matchErr || !match) {
      console.warn(
        JSON.stringify({
          event: "match_result_write_failed",
          groupId: args.groupId,
          roomCode: args.roomCode,
          gameKind: args.gameKind,
          error: matchErr?.message,
          ts: Date.now(),
        })
      );
      return;
    }
    const playerRows = derivePlayerResults(
      args.snapshot,
      args.players
    );
    if (playerRows.length > 0) {
      const { error: prErr } = await supabaseAdmin
        .from("match_player_results")
        .insert(
          playerRows.map((r) => ({ ...r, match_id: match.id }))
        );
      if (prErr) {
        console.warn(
          JSON.stringify({
            event: "match_player_result_write_failed",
            matchId: match.id,
            groupId: args.groupId,
            error: prErr.message,
            ts: Date.now(),
          })
        );
      }
    }

    // Best-effort: post the finished match to the group's linked
    // Discord channel, if it has one. postMatchToDiscord swallows its
    // own errors, so this never disturbs the stat write above.
    const { data: group } = await supabaseAdmin
      .from("groups")
      .select("name, discord_webhook_url")
      .eq("id", args.groupId)
      .maybeSingle();
    if (group?.discord_webhook_url) {
      await postMatchToDiscord({
        webhookUrl: group.discord_webhook_url as string,
        groupName: group.name as string,
        gameKind: args.gameKind,
        snapshot: args.snapshot,
      });
    }
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "match_result_write_threw",
        groupId: args.groupId,
        error: e instanceof Error ? e.message : String(e),
        ts: Date.now(),
      })
    );
  }
}
