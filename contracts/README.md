# contracts

Solidity contracts for imposter.xyz. Built with Foundry.

## PotEscrow

Generic per-game pot escrow for multi-player wager games. One resolver (the game server) creates games, players ante, server resolves by paying out winners. Escape hatch: players can `selfRefund` after 1 hour if the resolver never settles.

## Setup

Install Foundry:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

Pull dependencies:

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0
forge install foundry-rs/forge-std
```

Run tests:

```bash
forge test -vv
```

## Deploy to Base Sepolia

1. Get testnet ETH from the [Base Sepolia faucet](https://docs.base.org/chain/network-faucets).
2. Create a `.env` in `contracts/`:

   ```bash
   PRIVATE_KEY=0xYOUR_DEPLOYER_KEY
   USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e        # Base Sepolia USDC
   SPEND_PERMISSION_MANAGER_ADDRESS=0xf85210B21cC50302F477BA56686d2019dC9b67Ad  # canonical on Base + Base Sepolia
   RESOLVER_ADDRESS=0xYOUR_CDP_SIGNER_ADDRESS
   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
   BASESCAN_API_KEY=your_basescan_key
   ```

3. Deploy:

   ```bash
   source .env
   forge script script/Deploy.s.sol:Deploy --rpc-url base_sepolia --broadcast --verify
   ```

4. Save the printed address as `POT_ESCROW_ADDRESS` in the Next.js app's Vercel env.

## Mainnet

Base mainnet USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Use the same deploy script with `--rpc-url base`.
