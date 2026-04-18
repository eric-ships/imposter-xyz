import "server-only";
import { CdpClient } from "@coinbase/cdp-sdk";
import { encodeFunctionData } from "viem";
import { POT_ESCROW_ABI } from "@/lib/abi";
import {
  CDP_NETWORK_NAME,
  POT_ESCROW_ADDRESS,
  publicClient,
} from "@/lib/chain";

const RESOLVER_ACCOUNT_NAME =
  process.env.CDP_RESOLVER_ACCOUNT_NAME ?? "ImposterXYZ";

let _cdp: CdpClient | null = null;
function cdp(): CdpClient {
  if (!_cdp) _cdp = new CdpClient();
  return _cdp;
}

let _resolverAddress: `0x${string}` | null = null;
async function resolverAddress(): Promise<`0x${string}`> {
  if (_resolverAddress) return _resolverAddress;
  const acct = await cdp().evm.getOrCreateAccount({
    name: RESOLVER_ACCOUNT_NAME,
  });
  _resolverAddress = acct.address as `0x${string}`;
  return _resolverAddress;
}

async function send(data: `0x${string}`): Promise<`0x${string}`> {
  const from = await resolverAddress();
  const { transactionHash } = await cdp().evm.sendTransaction({
    address: from,
    network: CDP_NETWORK_NAME,
    transaction: {
      to: POT_ESCROW_ADDRESS,
      data,
    },
  });
  return transactionHash as `0x${string}`;
}

export async function createGameOnChain(
  gameId: `0x${string}`,
  ante: bigint
): Promise<`0x${string}`> {
  const data = encodeFunctionData({
    abi: POT_ESCROW_ABI,
    functionName: "createGame",
    args: [gameId, ante],
  });
  return send(data);
}

export async function resolveGameOnChain(
  gameId: `0x${string}`,
  winners: `0x${string}`[],
  amounts: bigint[]
): Promise<`0x${string}`> {
  const data = encodeFunctionData({
    abi: POT_ESCROW_ABI,
    functionName: "resolve",
    args: [gameId, winners, amounts],
  });
  return send(data);
}

export async function refundGameOnChain(
  gameId: `0x${string}`,
  players: `0x${string}`[]
): Promise<`0x${string}`> {
  const data = encodeFunctionData({
    abi: POT_ESCROW_ABI,
    functionName: "refund",
    args: [gameId, players],
  });
  return send(data);
}

export async function readGameInfo(gameId: `0x${string}`): Promise<{
  ante: bigint;
  potBalance: bigint;
  createdAt: bigint;
  resolved: boolean;
}> {
  const result = (await publicClient().readContract({
    address: POT_ESCROW_ADDRESS,
    abi: POT_ESCROW_ABI,
    functionName: "gameInfo",
    args: [gameId],
  })) as [bigint, bigint, bigint, boolean];
  return {
    ante: result[0],
    potBalance: result[1],
    createdAt: result[2],
    resolved: result[3],
  };
}

export async function hasPaidOnChain(
  gameId: `0x${string}`,
  player: `0x${string}`
): Promise<boolean> {
  const paid = (await publicClient().readContract({
    address: POT_ESCROW_ADDRESS,
    abi: POT_ESCROW_ABI,
    functionName: "paid",
    args: [gameId, player],
  })) as boolean;
  return paid;
}

export async function waitForTx(hash: `0x${string}`) {
  await publicClient().waitForTransactionReceipt({ hash });
}

/**
 * Compute the payout split for a resolved imposter round. Returns
 * (winnerAddress, amount) pairs that must sum to `pot` exactly.
 *
 * Rules:
 *  - imposter escapes (vote tied / wrong target):  imposter 100%
 *  - caught + exact guess:                         imposter 100%
 *  - caught + close guess:                         imposter 50%, crewmates split 50%
 *  - caught + wrong guess:                         crewmates split 100%
 *
 * If the pot can't be split evenly, the remainder (1..n-1 wei) is
 * attached to the first crewmate so the sum matches potBalance.
 */
export function computePayout(opts: {
  pot: bigint;
  caught: boolean;
  tied: boolean;
  guessOutcome: "exact" | "close" | "wrong" | null;
  imposter: `0x${string}`;
  crewmates: `0x${string}`[];
}): { winners: `0x${string}`[]; amounts: bigint[] } {
  const { pot, caught, tied, guessOutcome, imposter, crewmates } = opts;

  // Imposter escaped (either un-caught or caught-but-nailed-the-word).
  if (!caught || tied || guessOutcome === "exact") {
    return { winners: [imposter], amounts: [pot] };
  }

  if (guessOutcome === "close") {
    const imposterCut = pot / 2n;
    const crewPool = pot - imposterCut;
    const crewSplits = splitEvenly(crewPool, crewmates.length);
    return {
      winners: [imposter, ...crewmates],
      amounts: [imposterCut, ...crewSplits],
    };
  }

  // caught + wrong (or null guess treated as wrong)
  const crewSplits = splitEvenly(pot, crewmates.length);
  return { winners: [...crewmates], amounts: crewSplits };
}

function splitEvenly(total: bigint, count: number): bigint[] {
  if (count <= 0) return [];
  const base = total / BigInt(count);
  const remainder = total - base * BigInt(count);
  const out: bigint[] = Array.from({ length: count }, () => base);
  out[0] += remainder;
  return out;
}
