/**
 * One-shot bootstrap for the CDP server-wallet account that will resolve
 * PotEscrow games. Run once before deploying the contract:
 *
 *   1. Fill CDP_API_KEY_ID / CDP_API_KEY_SECRET / CDP_WALLET_SECRET in
 *      .env.local
 *   2. npm run bootstrap:resolver
 *
 * It creates (or fetches, idempotent) the account named "ImposterXYZ",
 * prints its address, and — if under 0.01 ETH on Base Sepolia — asks
 * the CDP faucet to top it up so the resolver can pay gas.
 */
import "dotenv/config";
import { CdpClient } from "@coinbase/cdp-sdk";
import { createPublicClient, http, formatEther } from "viem";
import { baseSepolia } from "viem/chains";

const ACCOUNT_NAME = "ImposterXYZ";
const LOW_BALANCE_THRESHOLD = BigInt("10000000000000000"); // 0.01 ETH

async function main() {
  const missing = ["CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "CDP_WALLET_SECRET"]
    .filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    console.error("Add them to .env.local and try again.");
    process.exit(1);
  }

  const cdp = new CdpClient();
  const account = await cdp.evm.getOrCreateAccount({ name: ACCOUNT_NAME });

  console.log("\n=== CDP resolver account ===");
  console.log("Name:   ", ACCOUNT_NAME);
  console.log("Address:", account.address);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });
  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Balance:", formatEther(balance), "ETH (Base Sepolia)");

  if (balance < LOW_BALANCE_THRESHOLD) {
    console.log("\nBalance low, requesting CDP faucet...");
    try {
      const { transactionHash } = await cdp.evm.requestFaucet({
        address: account.address,
        network: "base-sepolia",
        token: "eth",
      });
      console.log("Faucet tx:", transactionHash);
      console.log(
        `  https://sepolia.basescan.org/tx/${transactionHash}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("Faucet request failed:", msg);
      console.log(
        "Fund manually at https://portal.cdp.coinbase.com/products/faucet"
      );
    }
  }

  console.log("\nNext step: use this as RESOLVER_ADDRESS when deploying:");
  console.log(account.address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
