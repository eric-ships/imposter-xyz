// PotEscrow + USDC ABIs (just the subset we call). Kept hand-curated
// rather than importing from /contracts/out so the Next.js app doesn't
// need the foundry artifacts at runtime.

export const POT_ESCROW_ABI = [
  // --- reads ---
  {
    type: "function",
    name: "gameInfo",
    stateMutability: "view",
    inputs: [{ name: "gameId", type: "bytes32" }],
    outputs: [
      { name: "ante", type: "uint256" },
      { name: "potBalance", type: "uint256" },
      { name: "createdAt", type: "uint256" },
      { name: "resolved", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "paid",
    stateMutability: "view",
    inputs: [
      { name: "gameId", type: "bytes32" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "resolver",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "token",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },

  // --- resolver-gated writes ---
  {
    type: "function",
    name: "createGame",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "bytes32" },
      { name: "ante", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "anteFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "bytes32" },
      {
        name: "permission",
        type: "tuple",
        components: [
          { name: "account", type: "address" },
          { name: "spender", type: "address" },
          { name: "token", type: "address" },
          { name: "allowance", type: "uint160" },
          { name: "period", type: "uint48" },
          { name: "start", type: "uint48" },
          { name: "end", type: "uint48" },
          { name: "salt", type: "uint256" },
          { name: "extraData", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "bytes32" },
      { name: "winners", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "bytes32" },
      { name: "players", type: "address[]" },
    ],
    outputs: [],
  },

  // --- player-facing writes ---
  {
    type: "function",
    name: "ante",
    stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "selfRefund",
    stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "bytes32" }],
    outputs: [],
  },

  // --- events ---
  {
    type: "event",
    name: "Created",
    inputs: [
      { name: "gameId", type: "bytes32", indexed: true },
      { name: "ante", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Anted",
    inputs: [
      { name: "gameId", type: "bytes32", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Resolved",
    inputs: [
      { name: "gameId", type: "bytes32", indexed: true },
      { name: "winners", type: "address[]", indexed: false },
      { name: "amounts", type: "uint256[]", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Refunded",
    inputs: [
      { name: "gameId", type: "bytes32", indexed: true },
      { name: "players", type: "address[]", indexed: false },
      { name: "amountEach", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SelfRefunded",
    inputs: [
      { name: "gameId", type: "bytes32", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

// Base's canonical SpendPermissionManager. Only the writes + reads we touch.
export const SPEND_PERMISSION_MANAGER_ABI = [
  {
    type: "function",
    name: "approveWithSignature",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "permission",
        type: "tuple",
        components: [
          { name: "account", type: "address" },
          { name: "spender", type: "address" },
          { name: "token", type: "address" },
          { name: "allowance", type: "uint160" },
          { name: "period", type: "uint48" },
          { name: "start", type: "uint48" },
          { name: "end", type: "uint48" },
          { name: "salt", type: "uint256" },
          { name: "extraData", type: "bytes" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isApproved",
    stateMutability: "view",
    inputs: [
      {
        name: "permission",
        type: "tuple",
        components: [
          { name: "account", type: "address" },
          { name: "spender", type: "address" },
          { name: "token", type: "address" },
          { name: "allowance", type: "uint160" },
          { name: "period", type: "uint48" },
          { name: "start", type: "uint48" },
          { name: "end", type: "uint48" },
          { name: "salt", type: "uint256" },
          { name: "extraData", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// Minimal USDC ERC20 ABI — only what the client needs to approve + check
// balance. The escrow contract owns the rest.
export const USDC_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;
