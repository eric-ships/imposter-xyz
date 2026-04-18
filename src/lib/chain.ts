import { createPublicClient, http, keccak256, stringToHex } from "viem";
import { base, baseSepolia } from "viem/chains";

export const CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532"
);

export const CHAIN = CHAIN_ID === 8453 ? base : baseSepolia;
export const CDP_NETWORK_NAME: "base" | "base-sepolia" =
  CHAIN_ID === 8453 ? "base" : "base-sepolia";

export const POT_ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_POT_ESCROW_ADDRESS ??
  process.env.POT_ESCROW_ADDRESS) as `0x${string}`;

export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  "") as `0x${string}`;

// Default $1 USDC ante in base units (6 decimals).
export const DEFAULT_ANTE = "1000000";

export function publicClient() {
  return createPublicClient({ chain: CHAIN, transport: http() });
}

/**
 * Deterministic chain game id for a room. We include a nonce so that a
 * single room can stake more than one pot game (the next pot round in
 * the same lobby gets a fresh gameId instead of colliding with the
 * already-resolved one).
 */
export function computeGameId(roomCode: string, nonce: string): `0x${string}` {
  return keccak256(stringToHex(`imposter.xyz:${roomCode}:${nonce}`));
}

export function blockExplorerUrl(txOrAddress: string): string {
  const base = CHAIN_ID === 8453
    ? "https://basescan.org"
    : "https://sepolia.basescan.org";
  const kind = txOrAddress.length === 42 ? "address" : "tx";
  return `${base}/${kind}/${txOrAddress}`;
}
