"use client";

import { createBaseAccountSDK } from "@base-org/account";
// Browser-specific entry so Next.js SSR picks the window-dependent module.
import { requestSpendPermission } from "@base-org/account/spend-permission/browser";
import { useCallback, useEffect, useState } from "react";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");
const POT_ESCROW = process.env
  .NEXT_PUBLIC_POT_ESCROW_ADDRESS as `0x${string}`;
const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;

// 10 USDC (6 decimals) = covers ~10 games at the 1-USDC default ante.
export const DEFAULT_ALLOWANCE = BigInt("10000000");
// One week.
export const DEFAULT_PERIOD_DAYS = 7;

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
 * Ask the Base Account wallet for a Spend Permission scoped to the
 * PotEscrow contract. Returns the permission struct + the player's
 * signature, ready to post to the server which registers it on-chain
 * via SpendPermissionManager.approveWithSignature.
 */
export async function grantSpendPermissionForPot(opts: {
  account: `0x${string}`;
  allowance?: bigint;
  periodInDays?: number;
}): Promise<{
  permission: {
    account: `0x${string}`;
    spender: `0x${string}`;
    token: `0x${string}`;
    allowance: string;
    period: number;
    start: number;
    end: number;
    salt: string;
    extraData: `0x${string}`;
  };
  signature: `0x${string}`;
}> {
  const {
    account,
    allowance = DEFAULT_ALLOWANCE,
    periodInDays = DEFAULT_PERIOD_DAYS,
  } = opts;

  const result = await requestSpendPermission({
    account,
    spender: POT_ESCROW,
    token: USDC,
    chainId: CHAIN_ID,
    allowance,
    periodInDays,
    provider: provider(),
  });

  return {
    permission: {
      account: result.permission.account as `0x${string}`,
      spender: result.permission.spender as `0x${string}`,
      token: result.permission.token as `0x${string}`,
      allowance: result.permission.allowance,
      period: result.permission.period,
      start: result.permission.start,
      end: result.permission.end,
      salt: result.permission.salt,
      extraData: (result.permission.extraData || "0x") as `0x${string}`,
    },
    signature: result.signature as `0x${string}`,
  };
}
