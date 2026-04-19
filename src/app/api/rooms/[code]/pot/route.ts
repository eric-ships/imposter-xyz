import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { createGameOnChain } from "@/lib/escrow";
import { computeGameId, DEFAULT_ANTE } from "@/lib/chain";

/**
 * Host-only: toggle pot mode on a lobby. Enabling creates the on-chain
 * game with a fresh gameId so the resolver can later call resolve/refund.
 * Disabling is only allowed if nobody has anted yet.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, enabled } = (await request.json()) as {
    playerId?: string;
    enabled?: boolean;
  };
  if (!playerId || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "playerId and enabled required" },
      { status: 400 }
    );
  }

  const { data: room, error: roomErr } = await supabaseAdmin
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (roomErr)
    return NextResponse.json({ error: roomErr.message }, { status: 500 });
  if (!room)
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (room.host_id !== playerId)
    return NextResponse.json({ error: "only host" }, { status: 403 });
  if (room.state !== "lobby")
    return NextResponse.json(
      { error: "lobby only" },
      { status: 400 }
    );

  if (enabled) {
    if (room.pot_enabled) {
      return NextResponse.json({ ok: true, already: true });
    }
    const gameId = computeGameId(code, Date.now().toString());
    const anteAmount = DEFAULT_ANTE;

    const txHash = await createGameOnChain(gameId, BigInt(anteAmount));

    const { error: updErr } = await supabaseAdmin
      .from("rooms")
      .update({
        pot_enabled: true,
        ante_amount: anteAmount,
        chain_game_id: gameId,
        chain_create_tx: txHash,
        chain_resolve_tx: null,
        updated_at: new Date().toISOString(),
      })
      .eq("code", code);
    if (updErr)
      return NextResponse.json({ error: updErr.message }, { status: 500 });

    await notifyRoom(code, "pot_enabled");
    return NextResponse.json({ ok: true, gameId, txHash });
  }

  // Disabling: only allowed if nobody has anted yet.
  const { data: paidPlayers } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("room_code", code)
    .not("ante_tx", "is", null);
  if ((paidPlayers?.length ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "cannot disable pot after antes have been paid; void the game instead",
      },
      { status: 400 }
    );
  }

  await supabaseAdmin
    .from("rooms")
    .update({
      pot_enabled: false,
      ante_amount: null,
      chain_game_id: null,
      chain_create_tx: null,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);

  await notifyRoom(code, "pot_disabled");
  return NextResponse.json({ ok: true });
}
