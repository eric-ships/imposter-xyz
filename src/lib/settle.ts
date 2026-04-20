import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  computePayout,
  refundGameOnChain,
  resolveGameOnChain,
} from "@/lib/escrow";

type RoomLike = {
  code: string;
  pot_enabled?: boolean | null;
  chain_game_id?: string | null;
  ante_amount?: string | null;
};

/** No-op if pot mode isn't enabled on this room. */
export async function settlePot(
  room: RoomLike,
  outcome: {
    imposterIds: string[];
    caught: boolean;
    tied: boolean;
    guessOutcome: "exact" | "close" | "wrong" | null;
  }
): Promise<{ txHash: string } | null> {
  if (!room.pot_enabled || !room.chain_game_id || !room.ante_amount)
    return null;

  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id, wallet_address, ante_tx")
    .eq("room_code", room.code);

  const anted =
    players?.filter((p) => p.ante_tx && p.wallet_address) ?? [];
  if (anted.length === 0) return null;

  const imposterSet = new Set(outcome.imposterIds);
  const imposters = anted.filter((p) => imposterSet.has(p.id));
  const crewmates = anted.filter((p) => !imposterSet.has(p.id));

  // If no imposter anted (shouldn't happen with the start gate in
  // place), refund everyone and bail.
  if (imposters.length === 0) {
    const allWallets = anted.map(
      (p) => p.wallet_address as `0x${string}`
    );
    const txHash = await refundGameOnChain(
      room.chain_game_id as `0x${string}`,
      allWallets
    );
    await recordRefunds(room.code, anted, room.ante_amount, txHash);
    return { txHash };
  }

  const pot = BigInt(room.ante_amount) * BigInt(anted.length);
  const { winners, amounts } = computePayout({
    pot,
    caught: outcome.caught,
    tied: outcome.tied,
    guessOutcome: outcome.guessOutcome,
    imposters: imposters.map(
      (i) => i.wallet_address as `0x${string}`
    ),
    crewmates: crewmates.map(
      (c) => c.wallet_address as `0x${string}`
    ),
  });

  const txHash = await resolveGameOnChain(
    room.chain_game_id as `0x${string}`,
    winners,
    amounts
  );

  const playerByWallet = new Map(
    anted.map((p) => [p.wallet_address as string, p.id as string])
  );
  await supabaseAdmin.from("payouts").insert(
    winners.map((w, i) => ({
      room_code: room.code,
      player_id: playerByWallet.get(w) ?? null,
      wallet: w,
      amount: amounts[i].toString(),
      tx_hash: txHash,
      kind: "payout",
    }))
  );
  await supabaseAdmin
    .from("rooms")
    .update({ chain_resolve_tx: txHash })
    .eq("code", room.code);

  return { txHash };
}

/** Called from host void to return every ante paid so far. */
export async function refundPot(room: RoomLike): Promise<{ txHash: string } | null> {
  if (!room.pot_enabled || !room.chain_game_id || !room.ante_amount)
    return null;

  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id, wallet_address, ante_tx")
    .eq("room_code", room.code);

  const anted =
    players?.filter((p) => p.ante_tx && p.wallet_address) ?? [];
  if (anted.length === 0) return null;

  const wallets = anted.map((p) => p.wallet_address as `0x${string}`);
  const txHash = await refundGameOnChain(
    room.chain_game_id as `0x${string}`,
    wallets
  );
  await recordRefunds(room.code, anted, room.ante_amount, txHash);
  await supabaseAdmin
    .from("rooms")
    .update({ chain_resolve_tx: txHash })
    .eq("code", room.code);

  return { txHash };
}

async function recordRefunds(
  code: string,
  anted: Array<{ id: string; wallet_address: string | null }>,
  anteAmount: string,
  txHash: string
) {
  await supabaseAdmin.from("payouts").insert(
    anted.map((p) => ({
      room_code: code,
      player_id: p.id,
      wallet: p.wallet_address,
      amount: anteAmount,
      tx_hash: txHash,
      kind: "refund",
    }))
  );
}
