import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { hasPaidOnChain, waitForTx } from "@/lib/escrow";

/**
 * Player claims they've just anted. Server trusts the chain: we call
 * potEscrow.paid(gameId, wallet) and only mark the player paid if it
 * returns true. Client may optionally include the tx hash to be stored.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, txHash } = (await request.json()) as {
    playerId?: string;
    txHash?: string;
  };
  if (!playerId)
    return NextResponse.json({ error: "playerId required" }, { status: 400 });

  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("pot_enabled, chain_game_id")
    .eq("code", code)
    .maybeSingle();
  if (!room || !room.pot_enabled || !room.chain_game_id) {
    return NextResponse.json({ error: "pot not enabled" }, { status: 400 });
  }

  const { data: player } = await supabaseAdmin
    .from("players")
    .select("id, wallet_address, ante_tx")
    .eq("id", playerId)
    .eq("room_code", code)
    .maybeSingle();
  if (!player)
    return NextResponse.json({ error: "player not found" }, { status: 404 });
  if (!player.wallet_address)
    return NextResponse.json(
      { error: "connect wallet first" },
      { status: 400 }
    );
  if (player.ante_tx) {
    return NextResponse.json({ ok: true, already: true });
  }

  // If client sent a tx hash, wait for it first so the paid() read sees it.
  if (txHash && /^0x[0-9a-f]{64}$/i.test(txHash)) {
    try {
      await waitForTx(txHash as `0x${string}`);
    } catch {
      // ignore: the paid() check will decide
    }
  }

  const paid = await hasPaidOnChain(
    room.chain_game_id as `0x${string}`,
    player.wallet_address as `0x${string}`
  );
  if (!paid) {
    return NextResponse.json(
      { error: "ante not seen on chain yet" },
      { status: 400 }
    );
  }

  await supabaseAdmin
    .from("players")
    .update({ ante_tx: txHash ?? "confirmed" })
    .eq("id", playerId);

  await notifyRoom(code, "ante_confirmed");
  return NextResponse.json({ ok: true });
}
