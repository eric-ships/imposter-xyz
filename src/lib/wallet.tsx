"use client";

import { createBaseAccountSDK } from "@base-org/account";
import { encodeFunctionData, toHex } from "viem";
import { useCallback, useEffect, useState } from "react";
import { POT_ESCROW_ABI, USDC_ABI } from "@/lib/abi";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");
const POT_ESCROW = process.env
  .NEXT_PUBLIC_POT_ESCROW_ADDRESS as `0x${string}`;
const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;

let _sdk: ReturnType<typeof createBaseAccountSDK> | null = null;
function sdk() {
  if (!_sdk) {
    _sdk = createBaseAccountSDK({
      appName: "imposter.xyz",
      appLogoUrl: null,
      appChainIds: [CHAIN_ID],
    });
  }
  return _sdk;
}

type ProviderLike = ReturnType<ReturnType<typeof createBaseAccountSDK>["getProvider"]>;

function provider(): ProviderLike {
  return sdk().getProvider();
}

export function useBaseAccount() {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [isConnecting, setConnecting] = useState(false);
  const [isReady, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = provider();

    const onAccountsChanged = (accts: string[]) => {
      setAddress((accts[0] ?? null) as `0x${string}` | null);
    };
    p.on("accountsChanged", onAccountsChanged);

    // Check if already connected on mount (don't prompt).
    p.request({ method: "eth_accounts" })
      .then((a) => {
        const list = (a as string[]) ?? [];
        if (list.length > 0) setAddress(list[0] as `0x${string}`);
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => setReady(true));

    return () => {
      // eventemitter3 uses .off
      (p as unknown as { off: typeof p.on }).off(
        "accountsChanged",
        onAccountsChanged
      );
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const accts = (await provider().request({
        method: "eth_requestAccounts",
      })) as string[];
      const addr = (accts?.[0] ?? null) as `0x${string}` | null;
      setAddress(addr);
      return addr;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await provider().disconnect();
    } finally {
      setAddress(null);
    }
  }, []);

  return { address, isReady, isConnecting, connect, disconnect };
}

/**
 * Atomic approve + ante via EIP-5792 wallet_sendCalls. Waits for
 * confirmation by polling wallet_getCallsStatus and returns the ante's
 * tx hash.
 */
export async function anteWithBaseAccount(opts: {
  from: `0x${string}`;
  gameId: `0x${string}`;
  ante: bigint;
}): Promise<`0x${string}`> {
  const { from, gameId, ante } = opts;

  const approveData = encodeFunctionData({
    abi: USDC_ABI,
    functionName: "approve",
    args: [POT_ESCROW, ante],
  });
  const anteData = encodeFunctionData({
    abi: POT_ESCROW_ABI,
    functionName: "ante",
    args: [gameId],
  });

  const p = provider();
  const sendResult = (await p.request({
    method: "wallet_sendCalls",
    params: [
      {
        version: "1.0",
        chainId: toHex(CHAIN_ID),
        from,
        atomicRequired: true,
        calls: [
          { to: USDC, data: approveData },
          { to: POT_ESCROW, data: anteData },
        ],
      },
    ],
  })) as string | { id: string };

  const id =
    typeof sendResult === "string" ? sendResult : sendResult.id;

  // Poll for confirmation. EIP-5792 uses numeric statuses: 100 pending,
  // 200 success, 400/500 failure. Older drafts returned strings.
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const raw = (await p.request({
      method: "wallet_getCallsStatus",
      params: [id],
    })) as {
      status?: number | string;
      receipts?: { transactionHash?: `0x${string}` }[];
    };

    const status = raw?.status;
    const done =
      status === 200 ||
      status === "CONFIRMED" ||
      (typeof status === "number" && status >= 200 && status < 300);
    const failed =
      status === "FAILED" ||
      (typeof status === "number" && status >= 400);

    if (done) {
      const receipt = raw.receipts?.[raw.receipts.length - 1];
      const hash = receipt?.transactionHash;
      if (!hash) throw new Error("ante confirmed but no tx hash returned");
      return hash;
    }
    if (failed) {
      throw new Error(`ante call failed (status=${String(status)})`);
    }
  }
  throw new Error("ante timed out after 60s");
}
