import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { supabaseAdmin } from "@/lib/supabase/server";
import { notifyRoom } from "@/lib/room-state";
import {
  approvePermissionOnChain,
  waitForTx,
  type SpendPermission,
} from "@/lib/escrow";
import { POT_ESCROW_ADDRESS, USDC_ADDRESS } from "@/lib/chain";

/**
 * Player grants a Base Account Spend Permission that lets the game
 * resolver pull their ante for up to allowance/period. We register it
 * on-chain via approveWithSignature, then persist the permission so
 * start-game can call PotEscrow.anteFor(gameId, permission) for them.
 *
 * Body: {
 *   playerId,
 *   walletAddress,
 *   permission: SpendPermission (stringified allowance/salt),
 *   signature: 0x...
 * }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const body = (await request.json()) as {
    playerId?: string;
    walletAddress?: string;
    permission?: SpendPermission;
    signature?: `0x${string}`;
  };
  const { playerId, walletAddress, permission, signature } = body;

  if (!playerId || !walletAddress || !permission || !signature) {
    return NextResponse.json(
      { error: "playerId, walletAddress, permission, signature required" },
      { status: 400 }
    );
  }
  if (!isAddress(walletAddress)) {
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  }

  const wallet = getAddress(walletAddress);

  // Shape checks.
  if (
    getAddress(permission.account) !== wallet ||
    getAddress(permission.spender) !== getAddress(POT_ESCROW_ADDRESS) ||
    getAddress(permission.token) !== getAddress(USDC_ADDRESS)
  ) {
    return NextResponse.json(
      {
        error:
          "permission mismatch: account must be wallet, spender must be PotEscrow, token must be USDC",
      },
      { status: 400 }
    );
  }

  const { data: player } = await supabaseAdmin
    .from("players")
    .select("id, room_code, ante_tx")
    .eq("id", playerId)
    .eq("room_code", code)
    .maybeSingle();
  if (!player) {
    return NextResponse.json({ error: "player not found" }, { status: 404 });
  }

  // Submit on-chain approveWithSignature.
  let txHash: `0x${string}`;
  try {
    txHash = await approvePermissionOnChain(permission, signature);
    await waitForTx(txHash);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `approveWithSignature failed: ${e.message}`
            : "approveWithSignature failed",
      },
      { status: 500 }
    );
  }

  // Store permission + wallet + approve tx on the player.
  const { error } = await supabaseAdmin
    .from("players")
    .update({
      wallet_address: wallet,
      spend_permission: permission,
      spend_permission_tx: txHash,
    })
    .eq("id", playerId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await notifyRoom(code, "permission_granted");
  return NextResponse.json({ ok: true, txHash });
}
