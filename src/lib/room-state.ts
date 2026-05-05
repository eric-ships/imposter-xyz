import { supabaseAdmin } from "@/lib/supabase/server";
import type { GuessOutcome, PublicRoomView, RoomState } from "@/lib/game";
import type { MatchHistoryEntry } from "@/lib/match-history";

export async function notifyRoom(code: string, kind: string) {
  await supabaseAdmin.from("room_events").insert({ room_code: code, kind });
}

export function tallyVotes(votes: { target_id: string }[]): {
  topTargets: string[];
  topCount: number;
  tied: boolean;
} {
  const counts = new Map<string, number>();
  for (const v of votes) {
    counts.set(v.target_id, (counts.get(v.target_id) ?? 0) + 1);
  }
  const topCount = Math.max(...Array.from(counts.values()), 0);
  const topTargets = Array.from(counts.entries())
    .filter(([, n]) => n === topCount)
    .map(([id]) => id);
  return { topTargets, topCount, tied: topTargets.length > 1 };
}

export async function fetchRoomView(
  code: string,
  playerId: string | null
): Promise<PublicRoomView | null> {
  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (!room) return null;

  // Select `*` so a missing column on an un-migrated DB doesn't nuke the
  // whole query (e.g. spend_permission). Individual fields are picked off
  // defensively below. Log any error so silent "0 players" bugs surface in
  // Vercel logs instead of showing up only to end users.
  const [
    { data: players, error: playersErr },
    { data: clues, error: cluesErr },
    { data: votes, error: votesErr },
    { data: payouts, error: payoutsErr },
  ] = await Promise.all([
    supabaseAdmin
      .from("players")
      .select("*")
      .eq("room_code", code)
      .order("joined_at", { ascending: true }),
    supabaseAdmin
      .from("clues")
      .select("id, player_id, round, word")
      .eq("room_code", code)
      .order("id", { ascending: true }),
    supabaseAdmin
      .from("votes")
      .select("voter_id, target_id")
      .eq("room_code", code),
    supabaseAdmin
      .from("payouts")
      .select("wallet, amount, tx_hash, kind")
      .eq("room_code", code)
      .order("created_at", { ascending: true }),
  ]);

  // Pull reactions for the clues we just fetched. Defensive: if the
  // table doesn't exist yet (pre-migration) the query errors and we just
  // serve clues with empty reactions.
  const clueIds = (clues ?? []).map((c) => c.id as number);
  const reactionsByClue = new Map<
    number,
    { emoji: string; count: number; mine: boolean; reactors: string[] }[]
  >();
  if (clueIds.length > 0) {
    const { data: rxs, error: rxErr } = await supabaseAdmin
      .from("clue_reactions")
      .select("clue_id, player_id, emoji, created_at")
      .in("clue_id", clueIds)
      .order("created_at", { ascending: true });
    if (!rxErr && rxs) {
      // Aggregate: per (clue, emoji) count + whether the requester
      // reacted + the nicknames in tap order. We pull nicknames from
      // the players we already loaded.
      const nickById = new Map(
        (players ?? []).map((p) => [p.id as string, p.nickname as string])
      );
      const agg = new Map<
        string,
        { count: number; mine: boolean; reactors: string[] }
      >();
      for (const r of rxs) {
        const key = `${r.clue_id}|${r.emoji}`;
        const cur =
          agg.get(key) ?? { count: 0, mine: false, reactors: [] };
        cur.count += 1;
        cur.reactors.push(nickById.get(r.player_id as string) ?? "?");
        if (playerId && r.player_id === playerId) cur.mine = true;
        agg.set(key, cur);
      }
      for (const [key, val] of agg.entries()) {
        const [cidStr, emoji] = key.split("|");
        const cid = Number(cidStr);
        const list = reactionsByClue.get(cid) ?? [];
        list.push({
          emoji,
          count: val.count,
          mine: val.mine,
          reactors: val.reactors,
        });
        reactionsByClue.set(cid, list);
      }
    }
  }

  if (playersErr || cluesErr || votesErr || payoutsErr) {
    console.error("[fetchRoomView] query error(s)", {
      code,
      players: playersErr?.message,
      clues: cluesErr?.message,
      votes: votesErr?.message,
      payouts: payoutsErr?.message,
    });
  }

  const state = room.state as RoomState;

  // imposter_ids is the source of truth for multi-imposter rooms; fall back
  // to [imposter_id] for legacy rows / un-migrated DBs.
  const imposterIds: string[] = Array.isArray(room.imposter_ids)
    ? (room.imposter_ids as string[]).filter(Boolean)
    : room.imposter_id
      ? [room.imposter_id as string]
      : [];
  const caughtImposterId =
    ("caught_imposter_id" in room
      ? (room.caught_imposter_id as string | null)
      : null) ?? null;

  const isImposter = !!playerId && imposterIds.includes(playerId);
  const isHost = !!playerId && playerId === room.host_id;
  const isCaughtImposter =
    !!playerId &&
    caughtImposterId === playerId &&
    // Legacy rooms without caught_imposter_id fall back to imposter_id
    // during the guessing phase.
    (state === "guessing" || state === "reveal");

  // Mole mode reveal: imposters know who their teammates are; crewmates
  // know who their pair partner is. Only revealed during active phases
  // (not lobby) and only after start has run.
  // Jesus mode reveal: the imposter knows their jesus (a random crewmate);
  // the crewmate does NOT see anything.
  const moleMode = "mole_mode" in room && !!room.mole_mode;
  const jesusMode = "jesus_mode" in room && !!room.jesus_mode;
  const sharedActive = (moleMode || jesusMode) && state !== "lobby";
  const myPartnerId = (() => {
    if (!playerId || !sharedActive) return null;
    const me = (players ?? []).find((p) => p.id === playerId);
    const stored = ((me?.partner_id as string | null) ?? null) || null;
    if (!stored) return null;
    // In mole mode, partner_id is set on crew rows (and points at the
    // pair partner). In jesus mode, it's set on the imposter row only
    // (pointing at the jesus crew). Both cases are returned as-is —
    // the UI decides how to label it.
    return stored;
  })();
  const myTeammateIds = moleMode && state !== "lobby" && isImposter
    ? imposterIds.filter((id) => id !== playerId)
    : [];

  // Police mode: am I the cop, and have I already investigated?
  const policeMode = "police_mode" in room && !!room.police_mode;
  const policeId = ("police_id" in room ? room.police_id : null) as
    | string
    | null;
  const isPolice =
    !!playerId && policeMode && state !== "lobby" && policeId === playerId;
  let myInvestigation: { targetId: string; isImposter: boolean } | null =
    null;
  if (isPolice) {
    const me = (players ?? []).find((p) => p.id === playerId);
    const targetId = (me?.investigated_id as string | null) ?? null;
    if (targetId) {
      myInvestigation = {
        targetId,
        isImposter: imposterIds.includes(targetId),
      };
    }
  }

  const you = playerId
    ? {
        id: playerId,
        isHost,
        isImposter,
        isCaughtImposter,
        secretWord: isImposter ? null : room.secret_word,
        teammateIds: myTeammateIds,
        partnerId: myPartnerId,
        isPolice,
        investigation: myInvestigation,
      }
    : null;

  // "caught" is derived from guess_outcome: the caught imposter only
  // reaches the guess phase if the crewmates caught them. If guess_outcome
  // is null at reveal time, the imposters escaped the vote.
  const reveal =
    state === "reveal" && imposterIds.length > 0 && room.secret_word
      ? {
          imposterIds,
          secretWord: room.secret_word,
          caught: !!room.guess_outcome,
          caughtImposterId,
          guess: room.imposter_guess ?? null,
          guessOutcome: (room.guess_outcome ?? null) as GuessOutcome | null,
        }
      : null;

  const decoratedPlayers = (players ?? []).map((p) => ({
    id: p.id as string,
    nickname: p.nickname as string,
    score: p.score as number,
    avatar: (p.avatar as string | null) ?? null,
    walletAddress: (p.wallet_address as string | null) ?? null,
    hasPermission: !!(p.spend_permission as unknown),
    antePaid: !!(p.ante_tx as string | null),
    anteTx: (p.ante_tx as string | null) ?? null,
  }));

  const paidCount = decoratedPlayers.filter((p) => p.antePaid).length;
  const pot =
    "pot_enabled" in room && room.pot_enabled
      ? {
          enabled: true,
          anteAmount: (room.ante_amount as string) ?? "0",
          chainGameId: (room.chain_game_id as string | null) ?? null,
          chainCreateTx: (room.chain_create_tx as string | null) ?? null,
          chainResolveTx: (room.chain_resolve_tx as string | null) ?? null,
          paidCount,
        }
      : null;

  const payoutList = (payouts ?? []).map((p) => ({
    wallet: p.wallet as string,
    amount: p.amount as string,
    txHash: p.tx_hash as string,
    kind: p.kind as "payout" | "refund",
  }));

  const guessCandidates: string[] =
    "guess_candidates" in room && Array.isArray(room.guess_candidates)
      ? (room.guess_candidates as string[])
      : [];
  const showCandidatesAlways: boolean =
    "show_candidates_always" in room && !!room.show_candidates_always;

  // Match history is jsonb on the room. Defensive: pre-migration rooms
  // won't have the column, so default to []. Trust the shape that
  // play-again writes (we control both sides).
  const matchHistory: MatchHistoryEntry[] =
    "match_history" in room && Array.isArray(room.match_history)
      ? (room.match_history as MatchHistoryEntry[])
      : [];

  return {
    code: room.code,
    hostId: room.host_id,
    state,
    category: room.category,
    round: room.round,
    totalRounds: room.total_rounds,
    turnIndex: room.turn_index,
    turnOrder: room.turn_order ?? [],
    phaseDeadline:
      ("phase_deadline" in room
        ? (room.phase_deadline as string | null)
        : null) ?? null,
    caughtImposterId,
    players: decoratedPlayers,
    clues: (clues ?? []).map((c) => ({
      id: c.id as number,
      player_id: c.player_id as string,
      round: c.round as number,
      word: c.word as string,
      reactions: reactionsByClue.get(c.id as number) ?? [],
    })),
    votes: (votes ?? []) as PublicRoomView["votes"],
    pot,
    payouts: payoutList,
    guessCandidates,
    showCandidatesAlways,
    moleMode,
    jesusMode,
    policeMode,
    you,
    reveal,
    matchHistory,
  };
}
