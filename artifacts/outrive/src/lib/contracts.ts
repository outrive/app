/**
 * On-chain contract ABIs used by the OUTRIVE frontend.
 * All addresses come from environment variables set after deployment.
 */

/* ── OTRCreditPool ─────────────────────────────────────────────────────────
   Deployed on Robinhood Mainnet (chainId 4663).
   Address: VITE_OTR_CREDIT_POOL_ADDRESS
────────────────────────────────────────────────────────────────────────── */
export const OTR_CREDIT_POOL_ABI = [
  // ── Read ──
  {
    type: "function" as const,
    name: "starterPrice",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "builderPrice",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "operatorPrice",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "customRatePerChat",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "customMinChats",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "getTierPrice",
    inputs: [{ name: "tier", type: "uint8" }],
    outputs: [
      { name: "otrAmount", type: "uint256" },
      { name: "chats", type: "uint256" },
    ],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "getCustomPrice",
    inputs: [{ name: "chatCount", type: "uint256" }],
    outputs: [{ name: "otrAmount", type: "uint256" }],
    stateMutability: "view" as const,
  },
  // ── Write ──
  {
    type: "function" as const,
    name: "purchaseTier",
    inputs: [{ name: "tier", type: "uint8" }],
    outputs: [],
    stateMutability: "nonpayable" as const,
  },
  {
    type: "function" as const,
    name: "purchaseCustom",
    inputs: [{ name: "chatCount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable" as const,
  },
  // ── Event ──
  {
    type: "event" as const,
    name: "CreditPurchased",
    inputs: [
      { name: "buyer",        type: "address", indexed: true  },
      { name: "otrAmount",    type: "uint256", indexed: false },
      { name: "chatsGranted", type: "uint256", indexed: false },
      { name: "tier",         type: "uint8",   indexed: false },
    ],
  },
] as const;

/* ── ERC-20 minimal ABI (for approve + allowance + balanceOf) ───────────── */
export const ERC20_ABI = [
  {
    type: "function" as const,
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable" as const,
  },
  {
    type: "function" as const,
    name: "allowance",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view" as const,
  },
  {
    type: "function" as const,
    name: "decimals",
    inputs: [],
    outputs: [{ type: "uint8" }],
    stateMutability: "view" as const,
  },
] as const;

/* ── Deployed addresses (from env) ─────────────────────────────────────── */
export const OTR_TOKEN_ADDRESS =
  (import.meta.env.VITE_OTR_TOKEN_ADDRESS as `0x${string}` | undefined) ??
  ("0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef" as `0x${string}`);

export const OTR_CREDIT_POOL_ADDRESS =
  (import.meta.env.VITE_OTR_CREDIT_POOL_ADDRESS as `0x${string}` | undefined) ??
  undefined;
