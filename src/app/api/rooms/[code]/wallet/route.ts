import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import { isAddress, getAddress } from "viem";

/** Player records the wallet address they'll ante from. Idempotent. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const { playerId, walletAddress } = (await request.json()) as {
    playerId?: string;
    walletAddress?: string;
  };
  if (!playerId || !walletAddress) {
    return NextResponse.json(
      { error: "playerId and walletAddress required" },
      { status: 400 }
    );
  }
  if (!isAddress(walletAddress)) {
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  }
  const checksummed = getAddress(walletAddress);

  const { data: player } = await supabaseAdmin
    .from("players")
    .select("id, room_code, ante_tx")
    .eq("id", playerId)
    .eq("room_code", code)
    .maybeSingle();
  if (!player)
    return NextResponse.json({ error: "player not found" }, { status: 404 });
  if (player.ante_tx) {
    return NextResponse.json(
      { error: "cannot change wallet after anteing" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("players")
    .update({ wallet_address: checksummed })
    .eq("id", playerId);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  await notifyRoom(code, "wallet_connected");
  return NextResponse.json({ ok: true, walletAddress: checksummed });
}
