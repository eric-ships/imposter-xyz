import { supabaseAdmin } from "@/lib/supabase/server";
import type { GuessOutcome, PublicRoomView, RoomState } from "@/lib/game";

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

  const [{ data: players }, { data: clues }, { data: votes }, { data: payouts }] =
    await Promise.all([
      supabaseAdmin
        .from("players")
        .select("id, nickname, score, wallet_address, ante_tx")
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

  const state = room.state as RoomState;
  const isImposter = !!playerId && playerId === room.imposter_id;
  const isHost = !!playerId && playerId === room.host_id;

  const you = playerId
    ? {
        id: playerId,
        isHost,
        isImposter,
        secretWord: isImposter ? null : room.secret_word,
      }
    : null;

  // "caught" is derived from guess_outcome: the imposter only reaches the
  // guess phase if the crewmates caught them. If guess_outcome is null at
  // reveal time, the imposter escaped the vote.
  const reveal =
    state === "reveal" && room.imposter_id && room.secret_word
      ? {
          imposterId: room.imposter_id,
          secretWord: room.secret_word,
          caught: !!room.guess_outcome,
          guess: room.imposter_guess ?? null,
          guessOutcome: (room.guess_outcome ?? null) as GuessOutcome | null,
        }
      : null;

  const decoratedPlayers = (players ?? []).map((p) => ({
    id: p.id as string,
    nickname: p.nickname as string,
    score: p.score as number,
    walletAddress: (p.wallet_address as string | null) ?? null,
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

  return {
    code: room.code,
    hostId: room.host_id,
    state,
    category: room.category,
    round: room.round,
    totalRounds: room.total_rounds,
    turnIndex: room.turn_index,
    turnOrder: room.turn_order ?? [],
    players: decoratedPlayers,
    clues: (clues ?? []) as PublicRoomView["clues"],
    votes: (votes ?? []) as PublicRoomView["votes"],
    pot,
    payouts: payoutList,
    you,
    reveal,
  };
}
