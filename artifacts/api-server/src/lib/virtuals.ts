import { type Abi, encodeFunctionData, encodeAbiParameters, parseAbi, http, getAddress, parseEther, formatEther } from "viem";
import { createWalletClient } from "viem";
import { getPublicClient, getActiveChain } from "./chains.js";
import { getSignerAccount, getSignerAddress } from "./signerWallet.js";
import { logger } from "./logger.js";

// ─── BondingV5 — USER-FACING launch contract ───────────────────────────────
// Proxy:          0xd4ccbfa37e2f35611b3042e4096Ad7a3459Bd007
// Implementation: 0x634D91f7A67011A60985dF555A5157f9b321f7dE (BondingV5.sol, verified)
// Source:         contracts/launchpadv2/BondingV5.sol
//
// CORRECT FLOW (no BONDING_ROLE needed from OUTRIVE):
//   1. User calls preLaunch() → BondingV5 internally calls factory (BondingV5 has BONDING_ROLE)
//      msg.sender = user → user is creator on-chain ✓
//   2. Anyone calls launch(tokenAddress) → trading starts on bonding curve
//
// Anti-sniper type constants (from BondingConfig.sol):
//   ANTI_SNIPER_NONE = 0   → no tax
//   ANTI_SNIPER_60S  = 1   → 60s buy-only (default for Instant Launch)
const BONDING_V5_ABI: Abi = [
  {
    type: "function",
    name: "preLaunch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name_",              type: "string"    },
      { name: "ticker_",            type: "string"    },
      { name: "cores_",             type: "uint8[]"   },
      { name: "desc_",              type: "string"    },
      { name: "img_",               type: "string"    },
      { name: "urls_",              type: "string[4]" },
      { name: "purchaseAmount_",    type: "uint256"   },
      { name: "startTime_",         type: "uint256"   },
      { name: "launchMode_",        type: "uint8"     },
      { name: "airdropBips_",       type: "uint16"    },
      { name: "needAcf_",           type: "bool"      },
      { name: "antiSniperTaxType_", type: "uint8"     },
      { name: "isProject60days_",   type: "bool"      },
      { name: "extParams_",         type: "bytes"     },
    ],
    outputs: [
      { name: "token",         type: "address" },
      { name: "pair",          type: "address" },
      { name: "applicationId", type: "uint256" },
      { name: "initialPurchase", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "launch",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenAddress_", type: "address" }],
    outputs: [
      { name: "", type: "address" },
      { name: "", type: "address" },
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
    ],
  },
  // ── Trading ─────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [
      { name: "agentToken_", type: "address" },
      { name: "minAmount_",  type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentToken_",   type: "address" },
      { name: "amountIn_",     type: "uint256" },
      { name: "minAmountOut_", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getState",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "price",  type: "uint256" },
      { name: "raised", type: "uint256" },
    ],
  },
];

// BondingV5 proxy address — override with VIRTUALS_BONDING_ADDRESS env var if needed
// IMPORTANT: address must be EIP-55 checksummed; viem 2.x rejects invalid mixed-case addresses.
// Correct checksum: 0xd4cCBFA37e2f35611b3042e4096Ad7a3459Bd007
const BONDING_V5_ADDRESS: `0x${string}` = getAddress(
  (process.env.VIRTUALS_BONDING_ADDRESS ?? "0xd4ccbfa37e2f35611b3042e4096Ad7a3459Bd007").toLowerCase()
);

// ─── Verified ABI — AgentFactory proxy (used by indexer / system status) ──
// Proxy: 0x43e4c17b15365596caae8e7d00e42bc8e988c2d4
// Implementation: 0xf0a8089da19568a37bccacc4bfe3a2a9f1e71675 (verified Blockscout)
// Deployed by: 0xe4a0015b4c12f84bf9b8b9db56b7ef0bc539d88f (official Virtuals deployer)
const VIRTUALS_FACTORY_ABI: Abi = [
  // ── Launch ──────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "createNewAgentTokenAndApplication",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name",                  type: "string"   },
      { name: "symbol",                type: "string"   },
      // TokenSupplyParams struct ABI-encoded as bytes:
      //   {maxTokensPerWallet, maxTokensPerTxn, botProtectionDurationInSeconds,
      //    vault, lpOwner, creator, projectId}
      { name: "tokenSupplyParams_",    type: "bytes"    },
      { name: "cores",                 type: "uint8[]"  },
      { name: "tbaSalt",               type: "bytes32"  },
      { name: "tbaImplementation",     type: "address"  },
      { name: "daoVotingPeriod",       type: "uint32"   },
      { name: "daoThreshold",          type: "uint256"  },
      { name: "applicationThreshold_", type: "uint256"  },
      { name: "creator",               type: "address"  },
    ],
    outputs: [
      { name: "", type: "address"  },
      { name: "", type: "uint256"  },
    ],
  },
  // ── Read helpers ─────────────────────────────────────────────────────────
  {
    type: "function",
    name: "totalAgents",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allTokens",
    stateMutability: "view",
    inputs: [{ name: "idx", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getApplication",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [] }],
  },
  // ── Application withdrawal ───────────────────────────────────────────────
  // Confirmed via Blockscout (impl 0xf0a8089da19568a37bccacc4bfe3a2a9f1e71675):
  // `withdraw(uint256 id)` refunds the initial stake (`withdrawableAmount`) to the
  // proposer for applications that are Active and past proposalEndBlock (i.e.
  // failed / expired applications).  It is NOT a creator trade-fee claim.
  // Ongoing 1% per-trade fees flow to AgentTaxV2 (projectTaxRecipient) — there is
  // no per-creator fee balance view function on this factory.
  // NOTE: `claimCreatorFee(address)` and `creatorFee(address)` do NOT exist.
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  // ── Application read ─────────────────────────────────────────────────────
  // Returns the Application struct for a given application/virtualId.
  // `withdrawableAmount` is the refundable stake — set to 0 on execution.
  {
    type: "function",
    name: "getApplication",
    stateMutability: "view",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "name",                  type: "string"  },
          { name: "symbol",                type: "string"  },
          { name: "tokenURI",              type: "string"  },
          { name: "status",                type: "uint8"   },
          { name: "withdrawableAmount",    type: "uint256" },
          { name: "proposer",              type: "address" },
          { name: "cores",                 type: "uint8[]" },
          { name: "proposalEndBlock",      type: "uint256" },
          { name: "virtualId",             type: "uint256" },
          { name: "tbaSalt",               type: "bytes32" },
          { name: "tbaImplementation",     type: "address" },
          { name: "daoVotingPeriod",       type: "uint32"  },
          { name: "daoThreshold",          type: "uint256" },
          { name: "tokenAddress",          type: "address" },
        ],
      },
    ],
  },
  // ── Events ───────────────────────────────────────────────────────────────
  {
    type: "event",
    name: "NewApplication",
    inputs: [
      { name: "id", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "NewPersona",
    inputs: [
      { name: "virtualId", type: "uint256", indexed: false },
      { name: "token",     type: "address", indexed: false },
      { name: "dao",       type: "address", indexed: false },
      { name: "tba",       type: "address", indexed: false },
      { name: "veToken",   type: "address", indexed: false },
      { name: "lp",        type: "address", indexed: false },
    ],
  },
];

// ─── ERC-20 minimal ABI ────────────────────────────────────────────────────
const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

// ─── Zero constants ────────────────────────────────────────────────────────
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as `0x${string}`;

// ══════════════════════════════════════════════════════════════════════════════
// VIRTUAL BONDING CURVE — ETH router wrapper (OTR and similar tokens)
// Some agent tokens (e.g. OTR) use a VIRTUAL-based bonding curve instead of ETH.
// BondingV5 also manages these, but via a separate buy(uint256,address,...) overload.
// The ETH router (0x7180727...) wraps ETH↔VIRTUAL conversion transparently.
// ══════════════════════════════════════════════════════════════════════════════

// ETH router — wraps ETH→VIRTUAL→token (buy) and token→VIRTUAL→ETH (sell)
const ETH_ROUTER_ADDRESS = getAddress("0x7180727d660150F0aD79028C0cef361c89c7e62C");

const ETH_ROUTER_ABI: Abi = [
  {
    // payable with ETH; router converts ETH→VIRTUAL, then buys token on BondingV5
    type: "function", name: "buy", stateMutability: "payable",
    inputs: [
      { name: "token",        type: "address" },
      { name: "minTokensOut", type: "uint256" },
      { name: "deadline",     type: "uint256" },
    ],
    outputs: [],
  },
  {
    // sells token→VIRTUAL via BondingV5, then converts VIRTUAL→ETH; needs token approval to router
    type: "function", name: "sell", stateMutability: "nonpayable",
    inputs: [
      { name: "token",       type: "address" },
      { name: "tokenAmount", type: "uint256" },
      { name: "minEth",      type: "uint256" },
      { name: "deadline",    type: "uint256" },
    ],
    outputs: [],
  },
];

// BondingV5 tokenInfo — full on-chain state for VIRTUAL-based bonding curve tokens
// Verified implementation: 0x634D91f7A67011A60985dF555A5157f9b321f7dE
const BONDING_V5_TOKEN_INFO_ABI: Abi = [{
  type: "function", name: "tokenInfo", stateMutability: "view",
  inputs: [{ name: "", type: "address" }],
  outputs: [
    { name: "creator",          type: "address" },
    { name: "token",            type: "address" },
    { name: "pair",             type: "address" },
    { name: "agentToken",       type: "address" },
    { name: "data",             type: "tuple", components: [
      { name: "token",          type: "address" },
      { name: "name",           type: "string"  },
      { name: "_name",          type: "string"  },
      { name: "ticker",         type: "string"  },
      { name: "supply",         type: "uint256" },
      { name: "price",          type: "uint256" }, // VIRTUAL per token (1e18 units)
      { name: "marketCap",      type: "uint256" },
      { name: "liquidity",      type: "uint256" },
      { name: "volume",         type: "uint256" },
      { name: "volume24H",      type: "uint256" },
      { name: "prevPrice",      type: "uint256" },
      { name: "lastUpdated",    type: "uint256" },
    ]},
    { name: "description",      type: "string"  },
    { name: "image",            type: "string"  },
    { name: "twitter",          type: "string"  },
    { name: "telegram",         type: "string"  },
    { name: "youtube",          type: "string"  },
    { name: "website",          type: "string"  },
    { name: "trading",          type: "bool"    }, // true = trading is active
    { name: "tradingOnUniswap", type: "bool"    }, // true = graduated to Uniswap (skip router)
    { name: "applicationId",    type: "uint256" },
    { name: "initialPurchase",  type: "uint256" },
    { name: "virtualId",        type: "uint256" },
    { name: "launchExecuted",   type: "bool"    },
  ],
}];

interface VirtualBondingCurveInfo {
  priceInVirtual:   bigint;  // VIRTUAL tokens per 1e18 agent tokens
  trading:          boolean;
  tradingOnUniswap: boolean;
}

// Calls BondingV5.tokenInfo to detect VIRTUAL-based bonding curve tokens.
// Returns error if the token is not registered (not a VIRTUAL bonding curve token).
async function detectVirtualBondingCurve(
  tokenAddress: `0x${string}`,
): Promise<VirtualBondingCurveInfo | { error: string }> {
  try {
    const client = getPublicClient();
    type TokenInfoReturn = readonly [
      `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`,
      { token: `0x${string}`; name: string; _name: string; ticker: string;
        supply: bigint; price: bigint; marketCap: bigint; liquidity: bigint;
        volume: bigint; volume24H: bigint; prevPrice: bigint; lastUpdated: bigint },
      string, string, string, string, string, string,
      boolean, boolean, bigint, bigint, bigint, boolean
    ];
    const info = await client.readContract({
      address: BONDING_V5_ADDRESS,
      abi:     BONDING_V5_TOKEN_INFO_ABI,
      functionName: "tokenInfo",
      args:    [tokenAddress],
    }) as TokenInfoReturn;
    return {
      priceInVirtual:   info[4].price,
      trading:          info[11],
      tradingOnUniswap: info[12],
    };
  } catch (e) {
    return { error: `tokenInfo: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}` };
  }
}

// Quote 1 VIRTUAL → WETH9 on V3 to get the ETH/VIRTUAL exchange rate.
// Returns wei-of-ETH per 1e18 VIRTUAL, or null on failure.
async function getVirtualEthRate(): Promise<bigint | null> {
  const config = getVirtualsConfig();
  if (!config.virtualTokenAddress) return null;
  try {
    const client = getPublicClient();
    const res = await client.simulateContract({
      address: UNI_V3_QUOTER_V2, abi: QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn: config.virtualTokenAddress, tokenOut: WETH9_ADDRESS, amountIn: parseEther("1"), fee: 3000, sqrtPriceLimitX96: 0n }],
    });
    const ethOut = (res.result as unknown as readonly [bigint, bigint, number, bigint])[0];
    return ethOut > 0n ? ethOut : null;
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════════════
// UNISWAP V2 / V3 / V4 INTEGRATION — Robinhood Chain (4663)
// Auto-detection order: BondingV5 ETH getState() → VIRTUAL tokenInfo → Uniswap V3/V4/V2
// Source: developers.uniswap.org + docs.robinhood.com/chain/contracts
// ══════════════════════════════════════════════════════════════════════════════

// ─── Deployed addresses on Robinhood Chain (chainId 4663) ────────────────────
const WETH9_ADDRESS        = getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73");
const UNI_V2_ROUTER        = getAddress("0x89e5db8b5aa49aa85ac63f691524311aeb649eba");
const UNI_V3_QUOTER_V2     = getAddress("0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7");
const UNI_V3_ROUTER        = getAddress("0xcaf681a66d020601342297493863e78c959e5cb2"); // SwapRouter02
const UNI_V4_QUOTER        = getAddress("0x8dc178efb8111bb0973dd9d722ebeff267c98f94");
const UNI_UNIVERSAL_ROUTER = getAddress("0x8876789976decbfcbbbe364623c63652db8c0904");

// ─── Fee / tick-spacing configs to probe ─────────────────────────────────────
const V3_FEE_TIERS = [100, 500, 3000, 10000] as const;
const V4_POOL_CONFIGS = [
  { fee: 3000,  tickSpacing: 60  },
  { fee: 10000, tickSpacing: 200 },
  { fee: 500,   tickSpacing: 10  },
  { fee: 100,   tickSpacing: 1   },
] as const;

// V4 Router action bytes (from v4-periphery/src/libraries/Actions.sol)
const V4_SWAP_EXACT_IN_SINGLE = 0x06;
const V4_SETTLE_ALL           = 0x11;
const V4_TAKE_ALL             = 0x14;

// ─── Minimal ABIs ─────────────────────────────────────────────────────────────
// V3 QuoterV2 — nonpayable; use simulateContract (eth_call)
const QUOTER_V2_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

// V3 SwapRouter02
const V3_ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function unwrapWETH9(uint256 amountMinimum, address recipient)",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
]);

// V2 Router02
const V2_ROUTER_ABI = parseAbi([
  "function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) payable returns (uint256[] memory amounts)",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)",
  "function getAmountsOut(uint256 amountIn, address[] calldata path) view returns (uint256[] memory amounts)",
]);

// V4 Quoter — nonpayable; use simulateContract
const V4_QUOTER_ABI: Abi = [{
  type: "function",
  name: "quoteExactInputSingle",
  stateMutability: "nonpayable",
  inputs: [{
    name: "params", type: "tuple",
    components: [
      { name: "poolKey", type: "tuple", components: [
        { name: "currency0", type: "address" },
        { name: "currency1", type: "address" },
        { name: "fee",       type: "uint24"  },
        { name: "tickSpacing", type: "int24" },
        { name: "hooks",    type: "address"  },
      ]},
      { name: "zeroForOne", type: "bool"    },
      { name: "exactAmount", type: "uint128" },
      { name: "hookData",    type: "bytes"   },
    ],
  }],
  outputs: [
    { name: "deltaAmounts",           type: "int128[]" },
    { name: "sqrtPriceX96After",      type: "uint160"  },
    { name: "initializedTicksLoaded", type: "uint32"   },
  ],
}];

// Universal Router
const UNIVERSAL_ROUTER_ABI = parseAbi([
  "function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) payable",
]);

// Pool key components (reused in both buy and sell encodings)
const POOL_KEY_COMPONENTS = [
  { name: "currency0",   type: "address" as const },
  { name: "currency1",   type: "address" as const },
  { name: "fee",         type: "uint24"  as const },
  { name: "tickSpacing", type: "int24"   as const },
  { name: "hooks",       type: "address" as const },
];

// ─── Protocol type ─────────────────────────────────────────────────────────────
export type UniswapProtocol = "uniswap_v2" | "uniswap_v3" | "uniswap_v4";

export interface UniswapDetectResult {
  protocol: UniswapProtocol;
  feeTier?: number;
  tickSpacing?: number;
  quoteAmountOut: bigint; // test-amount quote, for display ratio only
}

const DETECT_TEST_AMOUNT = parseEther("0.001"); // 0.001 ETH to probe pools

// ─── Protocol detection ────────────────────────────────────────────────────────
export async function detectUniswapProtocol(
  tokenAddress: `0x${string}`,
): Promise<UniswapDetectResult | { error: string }> {
  const client = getPublicClient();

  // V3 — try each fee tier
  for (const fee of V3_FEE_TIERS) {
    try {
      const res = await client.simulateContract({
        address: UNI_V3_QUOTER_V2,
        abi: QUOTER_V2_ABI,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn: WETH9_ADDRESS, tokenOut: tokenAddress, amountIn: DETECT_TEST_AMOUNT, fee, sqrtPriceLimitX96: 0n }],
      });
      const amountOut = (res.result as unknown as readonly [bigint, bigint, number, bigint])[0];
      if (amountOut > 0n) return { protocol: "uniswap_v3", feeTier: fee, quoteAmountOut: amountOut };
    } catch { /* no pool at this fee tier */ }
  }

  // V4 — try each fee / tickSpacing combo
  for (const { fee, tickSpacing } of V4_POOL_CONFIGS) {
    try {
      const res = await client.simulateContract({
        address: UNI_V4_QUOTER,
        abi: V4_QUOTER_ABI,
        functionName: "quoteExactInputSingle",
        args: [{
          poolKey: { currency0: ZERO_ADDR, currency1: tokenAddress, fee, tickSpacing, hooks: ZERO_ADDR },
          zeroForOne: true,
          exactAmount: DETECT_TEST_AMOUNT,
          hookData: "0x" as `0x${string}`,
        }],
      });
      // deltaAmounts[1] = token output delta (abs value)
      const deltas = (res.result as readonly [readonly bigint[], bigint, number])[0];
      const tokenOut = deltas[1] < 0n ? -deltas[1] : deltas[1];
      if (tokenOut > 0n) return { protocol: "uniswap_v4", feeTier: fee, tickSpacing, quoteAmountOut: tokenOut };
    } catch { /* no V4 pool at this config */ }
  }

  // V2 — try getAmountsOut
  try {
    const amounts = await client.readContract({
      address: UNI_V2_ROUTER,
      abi: V2_ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [DETECT_TEST_AMOUNT, [WETH9_ADDRESS, tokenAddress]],
    }) as bigint[];
    if (amounts.length > 1 && amounts[1] > 0n) return { protocol: "uniswap_v2", quoteAmountOut: amounts[1] };
  } catch { /* no V2 pair */ }

  return { error: "No liquidity found on Uniswap V2, V3, or V4 for this token on Robinhood Chain." };
}

// ─── Quote helpers (actual trade amount, not test amount) ──────────────────────
async function quoteUniswapBuy(
  detect: UniswapDetectResult,
  tokenAddress: `0x${string}`,
  ethAmountWei: bigint,
): Promise<{ amountOut: bigint } | { error: string }> {
  const client = getPublicClient();
  try {
    if (detect.protocol === "uniswap_v3") {
      const res = await client.simulateContract({
        address: UNI_V3_QUOTER_V2, abi: QUOTER_V2_ABI, functionName: "quoteExactInputSingle",
        args: [{ tokenIn: WETH9_ADDRESS, tokenOut: tokenAddress, amountIn: ethAmountWei, fee: detect.feeTier!, sqrtPriceLimitX96: 0n }],
      });
      const out = (res.result as unknown as readonly [bigint, bigint, number, bigint])[0];
      return out > 0n ? { amountOut: out } : { error: "V3 quote returned 0 tokens." };
    }
    if (detect.protocol === "uniswap_v4") {
      const res = await client.simulateContract({
        address: UNI_V4_QUOTER, abi: V4_QUOTER_ABI, functionName: "quoteExactInputSingle",
        args: [{ poolKey: { currency0: ZERO_ADDR, currency1: tokenAddress, fee: detect.feeTier!, tickSpacing: detect.tickSpacing!, hooks: ZERO_ADDR }, zeroForOne: true, exactAmount: ethAmountWei, hookData: "0x" as `0x${string}` }],
      });
      const deltas = (res.result as readonly [readonly bigint[], bigint, number])[0];
      const out = deltas[1] < 0n ? -deltas[1] : deltas[1];
      return out > 0n ? { amountOut: out } : { error: "V4 quote returned 0 tokens." };
    }
    // V2
    const amounts = await client.readContract({ address: UNI_V2_ROUTER, abi: V2_ROUTER_ABI, functionName: "getAmountsOut", args: [ethAmountWei, [WETH9_ADDRESS, tokenAddress]] }) as bigint[];
    return amounts[1] > 0n ? { amountOut: amounts[1] } : { error: "V2 quote returned 0 tokens." };
  } catch (e) {
    return { error: `${detect.protocol} buy quote failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function quoteUniswapSell(
  detect: UniswapDetectResult,
  tokenAddress: `0x${string}`,
  tokenAmountWei: bigint,
): Promise<{ amountOut: bigint } | { error: string }> {
  const client = getPublicClient();
  try {
    if (detect.protocol === "uniswap_v3") {
      const res = await client.simulateContract({
        address: UNI_V3_QUOTER_V2, abi: QUOTER_V2_ABI, functionName: "quoteExactInputSingle",
        args: [{ tokenIn: tokenAddress, tokenOut: WETH9_ADDRESS, amountIn: tokenAmountWei, fee: detect.feeTier!, sqrtPriceLimitX96: 0n }],
      });
      const out = (res.result as unknown as readonly [bigint, bigint, number, bigint])[0];
      return out > 0n ? { amountOut: out } : { error: "V3 sell quote returned 0 ETH." };
    }
    if (detect.protocol === "uniswap_v4") {
      // zeroForOne=false: token (currency1) → ETH (currency0)
      const res = await client.simulateContract({
        address: UNI_V4_QUOTER, abi: V4_QUOTER_ABI, functionName: "quoteExactInputSingle",
        args: [{ poolKey: { currency0: ZERO_ADDR, currency1: tokenAddress, fee: detect.feeTier!, tickSpacing: detect.tickSpacing!, hooks: ZERO_ADDR }, zeroForOne: false, exactAmount: tokenAmountWei, hookData: "0x" as `0x${string}` }],
      });
      const deltas = (res.result as readonly [readonly bigint[], bigint, number])[0];
      // zeroForOne=false: ETH output is deltaAmounts[0]
      const out = deltas[0] < 0n ? -deltas[0] : deltas[0];
      return out > 0n ? { amountOut: out } : { error: "V4 sell quote returned 0 ETH." };
    }
    // V2
    const amounts = await client.readContract({ address: UNI_V2_ROUTER, abi: V2_ROUTER_ABI, functionName: "getAmountsOut", args: [tokenAmountWei, [tokenAddress, WETH9_ADDRESS]] }) as bigint[];
    return amounts[1] > 0n ? { amountOut: amounts[1] } : { error: "V2 sell quote returned 0 ETH." };
  } catch (e) {
    return { error: `${detect.protocol} sell quote failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── Build Uniswap BUY tx calldata ───────────────────────────────────────────
// ETH → Token. For V3: SwapRouter02.exactInputSingle (router wraps ETH→WETH when tokenIn=WETH9 + msg.value>0).
// For V4: Universal Router V4_SWAP command (native ETH → token).
// For V2: V2Router.swapExactETHForTokens.
function buildUniswapBuyTxData(
  detect: UniswapDetectResult,
  tokenAddress: `0x${string}`,
  ethAmount: bigint,
  minTokenAmount: bigint,
  userAddress: `0x${string}`,
): { to: `0x${string}`; data: `0x${string}`; value: string } {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  if (detect.protocol === "uniswap_v3") {
    const data = encodeFunctionData({
      abi: V3_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [{ tokenIn: WETH9_ADDRESS, tokenOut: tokenAddress, fee: detect.feeTier!, recipient: userAddress, amountIn: ethAmount, amountOutMinimum: minTokenAmount, sqrtPriceLimitX96: 0n }],
    });
    return { to: UNI_V3_ROUTER, data, value: ethAmount.toString() };
  }

  if (detect.protocol === "uniswap_v4") {
    // V4 router actions: SWAP_EXACT_IN_SINGLE + SETTLE_ALL (ETH) + TAKE_ALL (token)
    const v4Actions = `0x${V4_SWAP_EXACT_IN_SINGLE.toString(16).padStart(2, "0")}${V4_SETTLE_ALL.toString(16).padStart(2, "0")}${V4_TAKE_ALL.toString(16).padStart(2, "0")}` as `0x${string}`;

    const swapParams = encodeAbiParameters([{
      name: "params", type: "tuple",
      components: [
        { name: "poolKey", type: "tuple", components: POOL_KEY_COMPONENTS },
        { name: "zeroForOne",        type: "bool"    },
        { name: "amountIn",          type: "uint128" },
        { name: "amountOutMinimum",  type: "uint128" },
        { name: "hookData",          type: "bytes"   },
      ],
    }], [{
      poolKey: { currency0: ZERO_ADDR, currency1: tokenAddress, fee: detect.feeTier!, tickSpacing: detect.tickSpacing!, hooks: ZERO_ADDR },
      zeroForOne: true,
      amountIn: ethAmount,
      amountOutMinimum: minTokenAmount,
      hookData: "0x" as `0x${string}`,
    }]);

    // SETTLE_ALL: pay ETH (currency0 = address(0)) to PoolManager
    const settleParams = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [ZERO_ADDR, ethAmount]);
    // TAKE_ALL: receive tokens (currency1) from PoolManager → to msgSender (user)
    const takeParams   = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [tokenAddress, minTokenAmount]);

    const v4SwapInput = encodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes[]" }],
      [v4Actions, [swapParams, settleParams, takeParams]],
    );

    const data = encodeFunctionData({
      abi: UNIVERSAL_ROUTER_ABI, functionName: "execute",
      args: ["0x10" as `0x${string}`, [v4SwapInput], deadline],
    });
    return { to: UNI_UNIVERSAL_ROUTER, data, value: ethAmount.toString() };
  }

  // V2
  const data = encodeFunctionData({
    abi: V2_ROUTER_ABI, functionName: "swapExactETHForTokens",
    args: [minTokenAmount, [WETH9_ADDRESS, tokenAddress], userAddress, deadline],
  });
  return { to: UNI_V2_ROUTER, data, value: ethAmount.toString() };
}

// ─── Build Uniswap SELL tx calldata ──────────────────────────────────────────
// Token → ETH. Requires ERC-20 approve to `spender` first.
// For V3: multicall([exactInputSingle(token→WETH9, recipient=router), unwrapWETH9(min, user)]).
// For V4: Universal Router V4_SWAP (zeroForOne=false). Approve Universal Router.
// For V2: V2Router.swapExactTokensForETH. Approve V2 Router.
function buildUniswapSellTxData(
  detect: UniswapDetectResult,
  tokenAddress: `0x${string}`,
  tokenAmount: bigint,
  minEthAmount: bigint,
  userAddress: `0x${string}`,
): { spender: `0x${string}`; to: `0x${string}`; data: `0x${string}` } {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  if (detect.protocol === "uniswap_v3") {
    // exactInputSingle: token → WETH9, recipient = router (holds WETH)
    const exactInData = encodeFunctionData({
      abi: V3_ROUTER_ABI, functionName: "exactInputSingle",
      args: [{ tokenIn: tokenAddress, tokenOut: WETH9_ADDRESS, fee: detect.feeTier!, recipient: UNI_V3_ROUTER, amountIn: tokenAmount, amountOutMinimum: minEthAmount, sqrtPriceLimitX96: 0n }],
    });
    // unwrapWETH9: router → ETH → user
    const unwrapData = encodeFunctionData({ abi: V3_ROUTER_ABI, functionName: "unwrapWETH9", args: [minEthAmount, userAddress] });
    const data = encodeFunctionData({ abi: V3_ROUTER_ABI, functionName: "multicall", args: [[exactInData, unwrapData]] });
    return { spender: UNI_V3_ROUTER, to: UNI_V3_ROUTER, data };
  }

  if (detect.protocol === "uniswap_v4") {
    // V4 SWAP: token (currency1) → ETH (currency0), zeroForOne=false
    const v4Actions = `0x${V4_SWAP_EXACT_IN_SINGLE.toString(16).padStart(2, "0")}${V4_SETTLE_ALL.toString(16).padStart(2, "0")}${V4_TAKE_ALL.toString(16).padStart(2, "0")}` as `0x${string}`;

    const swapParams = encodeAbiParameters([{
      name: "params", type: "tuple",
      components: [
        { name: "poolKey", type: "tuple", components: POOL_KEY_COMPONENTS },
        { name: "zeroForOne",        type: "bool"    },
        { name: "amountIn",          type: "uint128" },
        { name: "amountOutMinimum",  type: "uint128" },
        { name: "hookData",          type: "bytes"   },
      ],
    }], [{
      poolKey: { currency0: ZERO_ADDR, currency1: tokenAddress, fee: detect.feeTier!, tickSpacing: detect.tickSpacing!, hooks: ZERO_ADDR },
      zeroForOne: false, // token → ETH
      amountIn: tokenAmount,
      amountOutMinimum: minEthAmount,
      hookData: "0x" as `0x${string}`,
    }]);

    // SETTLE_ALL: pay token (currency1) to PoolManager — Universal Router pulls from user via transferFrom
    const settleParams = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [tokenAddress, tokenAmount]);
    // TAKE_ALL: receive ETH (currency0 = address(0)) from PoolManager → to user
    const takeParams   = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [ZERO_ADDR, minEthAmount]);

    const v4SwapInput = encodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes[]" }],
      [v4Actions, [swapParams, settleParams, takeParams]],
    );

    const data = encodeFunctionData({
      abi: UNIVERSAL_ROUTER_ABI, functionName: "execute",
      args: ["0x10" as `0x${string}`, [v4SwapInput], deadline],
    });
    return { spender: UNI_UNIVERSAL_ROUTER, to: UNI_UNIVERSAL_ROUTER, data };
  }

  // V2
  const data = encodeFunctionData({
    abi: V2_ROUTER_ABI, functionName: "swapExactTokensForETH",
    args: [tokenAmount, minEthAmount, [tokenAddress, WETH9_ADDRESS], userAddress, deadline],
  });
  return { spender: UNI_V2_ROUTER, to: UNI_V2_ROUTER, data };
}
const ZERO_B32  = `0x${"00".repeat(32)}` as `0x${string}`;

// ─── Ticker blocklist ──────────────────────────────────────────────────────
const BLOCKED_TICKERS = new Set([
  "VIRTUAL", "VIRTUALS", "ETH", "BTC", "USDC", "USDT", "BNB", "SOL", "XRP",
  "ADA", "DOGE", "MATIC", "DOT", "SHIB", "AVAX", "LINK", "UNI", "WETH",
]);

// ─── Types ─────────────────────────────────────────────────────────────────
export interface VirtualsConfig {
  factoryAddress: `0x${string}` | null;
  virtualTokenAddress: `0x${string}` | null;
  graduationThreshold: bigint;
  calibrated: boolean;
  calibrationMessage: string | null;
}

export interface LaunchPreview {
  name: string;
  ticker: string;
  description: string;
  network: string;
  targetContract: string;
  baseCost: string;
  mode: string;
  antiSniper: string;        // "60s (1 MIN)" | "DISABLED"
  antiSniperDuration: number; // raw seconds (0 or 60) — used to rebuild calldata
  imageRef: string;           // current image URL (empty string if none)
}

// Dev buy is intentionally NOT supported:
// createNewAgentTokenAndApplication() does not accept a buy amount.
// Buying requires a separate bonding-curve call AFTER the token address is
// known (only available post-confirmation). Offering an approve-then-launch
// two-step that does not actually buy tokens is actively misleading.
export interface LaunchTxResult {
  needsApproval: false;
  launchTx: { to: `0x${string}`; data: `0x${string}`; value: string };
  preview: LaunchPreview;
}

// ─── Calibration state ─────────────────────────────────────────────────────
let _calibrationChecked = false;
let _calibrated = false;
let _calibrationMessage: string | null = null;

export function getVirtualsConfig(): VirtualsConfig {
  return {
    factoryAddress:       (process.env.VIRTUALS_FACTORY_ADDRESS as `0x${string}`) || null,
    virtualTokenAddress:  (process.env.VIRTUAL_TOKEN_ADDRESS    as `0x${string}`) || null,
    graduationThreshold:  BigInt(process.env.GRADUATION_THRESHOLD ?? "42000000000000000000000"),
    calibrated:           _calibrated,
    calibrationMessage:   _calibrationMessage,
  };
}

export function isCalibrated(): boolean { return _calibrated; }

export async function runCalibrationCheck(): Promise<void> {
  if (_calibrationChecked) return;
  _calibrationChecked = true;

  const factoryAddress = process.env.VIRTUALS_FACTORY_ADDRESS;
  if (!factoryAddress) {
    _calibrated = false;
    _calibrationMessage = "VIRTUALS_FACTORY_ADDRESS is not set. Launch tool is disabled.";
    logger.warn("Calibration failed: VIRTUALS_FACTORY_ADDRESS not configured");
    return;
  }

  try {
    const chain = getActiveChain();
    const rpcUrl = process.env.RPC_URL_OVERRIDE ?? chain.rpcUrls.default.http[0];
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_getCode",
        params: [factoryAddress, "latest"],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const json = await res.json() as { result?: string };
    const code = json.result;
    if (code && code !== "0x" && code.length > 4) {
      _calibrated = true;
      _calibrationMessage = null;
      logger.info({ factoryAddress, codeLen: code.length }, "Virtuals factory calibration OK — contract verified on-chain");
    } else {
      _calibrated = false;
      _calibrationMessage = "Factory address has no bytecode — wrong address or wrong chain.";
      logger.warn({ factoryAddress, code }, "Calibration failed: no bytecode at factory address");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // RPC unreachable at startup — default to calibrated so the launch tool isn't blocked.
    _calibrated = true;
    _calibrationMessage = null;
    logger.warn({ err: msg }, "Calibration: RPC unreachable at startup — defaulting to calibrated");
  }
}

export function getFactory() {
  const config = getVirtualsConfig();
  if (!config.factoryAddress) return null;
  return { address: config.factoryAddress, abi: VIRTUALS_FACTORY_ABI };
}

export function getVirtualToken() {
  const config = getVirtualsConfig();
  if (!config.virtualTokenAddress) return null;
  return { address: config.virtualTokenAddress, abi: ERC20_ABI };
}

export function validateTicker(ticker: string): { ok: boolean; error?: string } {
  if (!/^[A-Z0-9]+$/.test(ticker)) {
    return { ok: false, error: "Ticker must be uppercase letters and digits only." };
  }
  if (ticker.length > 6) {
    return { ok: false, error: "Ticker must be 6 characters or fewer." };
  }
  if (BLOCKED_TICKERS.has(ticker)) {
    return { ok: false, error: `Ticker "${ticker}" is reserved and cannot be used.` };
  }
  return { ok: true };
}

// ─── Build preLaunch transaction (unsigned — user signs) ────────────────────
// Targets BondingV5.preLaunch() on the Virtuals bonding router.
// msg.sender = user wallet → user is the on-chain creator of record.
// BondingV5 internally calls AgentFactory (BondingV5 holds BONDING_ROLE) —
// no role is required from OUTRIVE or the user.
//
// The contract appends " by Virtuals" to the name automatically.
// purchaseAmount_ = 0 → free Instant Launch (no fee, no dev buy).
// startTime_ = 0      → immediate (uses block.timestamp internally).
// launchMode_ = 0     → LAUNCH_MODE_NORMAL.
// antiSniperTaxType_: 0 = ANTI_SNIPER_NONE, 1 = ANTI_SNIPER_60S (default).
export async function buildLaunchTx(params: {
  name: string;
  ticker: string;
  description?: string;
  imageRef?: string;
  antiSniperDuration?: number;  // seconds; default 60 → type 1; 0 → type 0 (off)
  walletAddress: `0x${string}`;
}): Promise<LaunchTxResult | { error: string }> {
  if (!_calibrated) {
    const config = getVirtualsConfig();
    return { error: config.calibrationMessage ?? "Virtuals not calibrated." };
  }

  const tickerCheck = validateTicker(params.ticker);
  if (!tickerCheck.ok) return { error: tickerCheck.error! };

  if (params.name.length > 32) return { error: "Agent name must be 32 characters or fewer." };

  const chain = getActiveChain();

  // ANTI_SNIPER_NONE = 0, ANTI_SNIPER_60S = 1 (60 seconds, default for Instant Launch)
  const antiSniperOn = params.antiSniperDuration === undefined
    ? true
    : params.antiSniperDuration > 0;
  const antiSniperTaxType = antiSniperOn ? 1 : 0;

  const preLaunchData = encodeFunctionData({
    abi: BONDING_V5_ABI,
    functionName: "preLaunch",
    args: [
      params.name,                                           // name_ (appended " by Virtuals" on-chain)
      params.ticker,                                         // ticker_
      [0] as unknown as readonly number[],                   // cores_: [0] = BASE cognitive core
      params.description ?? "",                              // desc_
      params.imageRef ?? "",                                 // img_
      ["", "", "", ""] as [string, string, string, string],  // urls_: social links (empty = none)
      0n,                                                    // purchaseAmount_: 0 → no dev buy
      0n,                                                    // startTime_: 0 → immediate
      0,                                                     // launchMode_: 0 = LAUNCH_MODE_NORMAL
      0,                                                     // airdropBips_: 0
      false,                                                 // needAcf_: false
      antiSniperTaxType,                                     // antiSniperTaxType_: 0=none, 1=60s
      false,                                                 // isProject60days_: false
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,  // extParams_: 32 zero bytes (required — empty bytes causes contract revert)
    ],
  });

  const launchTx = {
    to:    BONDING_V5_ADDRESS,
    data:  preLaunchData,
    value: "0x0" as `0x${string}`,
  };

  const antiSniperLabel = antiSniperOn
    ? "60s (1 MIN) — buy tax 99%→1%"
    : "DISABLED";

  return {
    needsApproval: false,
    launchTx,
    preview: {
      name:               params.name,
      ticker:             params.ticker,
      description:        params.description ?? "",
      network:            `${chain.name} (${chain.id})`,
      targetContract:     BONDING_V5_ADDRESS,
      baseCost:           "GAS ONLY (ETH) — no base fee, no $VIRTUAL needed",
      mode:               "INSTANT LAUNCH — STEP 1/2: CREATE TOKEN",
      antiSniper:         antiSniperLabel,
      antiSniperDuration: params.antiSniperDuration ?? 60,
      imageRef:           params.imageRef ?? "",
    },
  };
}

// ─── Build activate transaction (launch()) ───────────────────────────────────
// After preLaunch confirms, call launch(tokenAddress) to start trading.
// For LAUNCH_MODE_NORMAL tokens, any address can call this (no role required).
export function buildActivateLaunchTx(tokenAddress: `0x${string}`) {
  const data = encodeFunctionData({
    abi: BONDING_V5_ABI,
    functionName: "launch",
    args: [tokenAddress],
  });
  return {
    to:    BONDING_V5_ADDRESS,
    data,
    value: "0x0" as `0x${string}`,
  };
}

// ─── Read bonding curve real-time state ──────────────────────────────────────
// Returns live price (ETH wei per 1e18 tokens) and raised (total ETH wei raised).
export async function readBondingCurveState(
  tokenAddress: `0x${string}`
): Promise<{ price: bigint; raised: bigint } | { error: string }> {
  try {
    const client = getPublicClient();
    const result = await client.readContract({
      address: BONDING_V5_ADDRESS,
      abi:     BONDING_V5_ABI,
      functionName: "getState",
      args: [tokenAddress],
    }) as [bigint, bigint];
    return { price: result[0], raised: result[1] };
  } catch (err) {
    return { error: `Failed to read bonding curve state: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── Trade preview types ──────────────────────────────────────────────────────
export interface TradePreview {
  side: "buy" | "sell";
  tokenName: string;
  tokenTicker: string;
  tokenAddress: string;
  amountIn: string;       // "0.05 ETH"  or  "500 $TOKEN"
  amountOutMin: string;   // "~4521 $TOKEN (min)"  or  "~0.048 ETH (min)"
  priceImpact: string;    // "~0.30%"
  slippage: number;
  currentPrice: string;   // "0.00001234 ETH per token"
  network: string;
  protocol: "bonding_curve" | "virtual_bonding_curve" | UniswapProtocol;
}

export interface TradeTxResult {
  needsApprove: boolean;
  approveTx?: { to: `0x${string}`; data: `0x${string}`; value: string };
  tradeTx:     { to: `0x${string}`; data: `0x${string}`; value: string };
  preview:     TradePreview;
}

// ─── Build BUY transaction (ETH → token) ─────────────────────────────────────
// Auto-routes: BondingV5 bonding curve first → Uniswap V3 / V4 / V2 fallback.
// userAddress is required for Uniswap swaps (used as recipient); optional for bonding curve.
export async function buildBuyTx(params: {
  tokenAddress: `0x${string}`;
  ethAmountEther: string;   // e.g. "0.05"
  slippagePercent?: number; // default 1
  tokenName: string;
  tokenTicker: string;
  userAddress?: `0x${string}`;
}): Promise<TradeTxResult | { error: string }> {
  const slippage = Math.min(Math.max(params.slippagePercent ?? 1, 0.1), 50);

  let ethAmount: bigint;
  try {
    ethAmount = parseEther(params.ethAmountEther);
  } catch {
    return { error: `Invalid ETH amount: ${params.ethAmountEther}` };
  }
  if (ethAmount <= 0n) return { error: "ETH amount must be greater than 0." };

  // ── Try bonding curve ──────────────────────────────────────────────────────
  const state = await readBondingCurveState(params.tokenAddress);
  if (!("error" in state) && state.price > 0n) {
    const estimatedTokens = (ethAmount * 10n ** 18n) / state.price;
    const slippageBps     = BigInt(Math.round((100 - slippage) * 100));
    const minTokenAmount  = (estimatedTokens * slippageBps) / 10000n;
    const priceImpactPct  = state.raised > 0n
      ? Number((ethAmount * 100000n) / (state.raised + ethAmount)) / 1000
      : 0;
    const data = encodeFunctionData({ abi: BONDING_V5_ABI, functionName: "buy", args: [params.tokenAddress, minTokenAmount] });
    const estDisplay = (Number(estimatedTokens) / 1e18).toLocaleString("en", { maximumFractionDigits: 2 });
    const minDisplay = (Number(minTokenAmount)   / 1e18).toLocaleString("en", { maximumFractionDigits: 2 });
    const priceDisplay = (Number(state.price) / 1e18).toFixed(10).replace(/\.?0+$/, "");
    return {
      needsApprove: false,
      tradeTx: { to: BONDING_V5_ADDRESS, data, value: ethAmount.toString() },
      preview: {
        side: "buy", tokenName: params.tokenName, tokenTicker: params.tokenTicker, tokenAddress: params.tokenAddress,
        amountIn: `${params.ethAmountEther} ETH`,
        amountOutMin: `~${minDisplay} ${params.tokenTicker} (min, est. ~${estDisplay})`,
        priceImpact: `~${priceImpactPct.toFixed(2)}%`,
        slippage, currentPrice: `${priceDisplay} ETH / token`, network: "Robinhood Chain (4663)",
        protocol: "bonding_curve",
      },
    };
  }

  // ── Try VIRTUAL bonding curve (OTR-style tokens, ETH router wrapper) ────────
  // These tokens use $VIRTUAL as the bonding-curve base currency.
  // The ETH router (0x7180727...) wraps ETH→VIRTUAL→token transparently.
  // minTokensOut = 0n: the router computes the output at execution time; the
  // on-chain curve price is the source of truth — no reliable off-chain quote
  // is available without the exact BondingConfig curve formula.
  const vbcBuy = await detectVirtualBondingCurve(params.tokenAddress);
  if (!("error" in vbcBuy) && vbcBuy.trading && !vbcBuy.tradingOnUniswap) {
    if (!params.userAddress || params.userAddress === ZERO_ADDR) {
      return { error: "Wallet not connected — connect your wallet to trade." };
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    const buyData = encodeFunctionData({ abi: ETH_ROUTER_ABI, functionName: "buy", args: [params.tokenAddress, 0n, deadline] });
    logger.info({ tokenAddress: params.tokenAddress, ethAmount: ethAmount.toString() }, "VIRTUAL bonding curve buy tx built");
    return {
      needsApprove: false,
      tradeTx: { to: ETH_ROUTER_ADDRESS, data: buyData, value: ethAmount.toString() },
      preview: {
        side: "buy", tokenName: params.tokenName, tokenTicker: params.tokenTicker, tokenAddress: params.tokenAddress,
        amountIn: `${params.ethAmountEther} ETH`,
        amountOutMin: `market rate (set by bonding curve at execution)`,
        priceImpact: "varies by curve depth",
        slippage, currentPrice: "via $VIRTUAL bonding curve", network: "Robinhood Chain (4663)",
        protocol: "virtual_bonding_curve",
      },
    };
  }

  // ── Bonding curve not found — try Uniswap ─────────────────────────────────
  if (!params.userAddress || params.userAddress === ZERO_ADDR) {
    return { error: "Wallet not connected — connect your wallet to trade on Uniswap." };
  }
  const detect = await detectUniswapProtocol(params.tokenAddress);
  if ("error" in detect) {
    const bcErr = "error" in state ? state.error : "Token not on bonding curve";
    return { error: `${bcErr}. ${detect.error}` };
  }
  const quoteResult = await quoteUniswapBuy(detect, params.tokenAddress, ethAmount);
  if ("error" in quoteResult) return { error: quoteResult.error };

  const estimatedTokens = quoteResult.amountOut;
  const slippageBps     = BigInt(Math.round((100 - slippage) * 100));
  const minTokenAmount  = (estimatedTokens * slippageBps) / 10000n;

  const pricePerToken  = estimatedTokens > 0n ? Number(ethAmount) / Number(estimatedTokens) : 0;
  const priceDisplay   = pricePerToken < 1e-9
    ? pricePerToken.toExponential(4)
    : pricePerToken.toFixed(10).replace(/\.?0+$/, "");
  const feeLabel       = detect.feeTier != null ? ` (${(detect.feeTier / 10000).toFixed(2)}% fee)` : "";
  const protocolLabel  = detect.protocol === "uniswap_v3" ? `Uniswap V3${feeLabel}` : detect.protocol === "uniswap_v4" ? `Uniswap V4${feeLabel}` : "Uniswap V2";

  const tradeTx = buildUniswapBuyTxData(detect, params.tokenAddress, ethAmount, minTokenAmount, params.userAddress);
  const estDisplay = (Number(estimatedTokens) / 1e18).toLocaleString("en", { maximumFractionDigits: 4 });
  const minDisplay = (Number(minTokenAmount)   / 1e18).toLocaleString("en", { maximumFractionDigits: 4 });
  logger.info({ protocol: detect.protocol, feeTier: detect.feeTier, tokenAddress: params.tokenAddress }, `Uniswap ${detect.protocol} buy tx built`);

  return {
    needsApprove: false,
    tradeTx,
    preview: {
      side: "buy", tokenName: params.tokenName, tokenTicker: params.tokenTicker, tokenAddress: params.tokenAddress,
      amountIn: `${params.ethAmountEther} ETH`,
      amountOutMin: `~${minDisplay} ${params.tokenTicker} (min, est. ~${estDisplay})`,
      priceImpact: `varies by pool depth`,
      slippage, currentPrice: `${priceDisplay} ETH / token`, network: "Robinhood Chain (4663)",
      protocol: detect.protocol,
    },
  };
}

// ─── Build SELL transaction (token → ETH) ────────────────────────────────────
// Auto-routes: BondingV5 bonding curve first → Uniswap V3 / V4 / V2 fallback.
// Always returns approveTx when needsApprove=true; tradeTx is always present.
export async function buildSellTx(params: {
  tokenAddress: `0x${string}`;
  tokenAmountWhole: string;  // whole tokens, e.g. "500"
  slippagePercent?: number;
  tokenName: string;
  tokenTicker: string;
  userAddress: `0x${string}`;
}): Promise<TradeTxResult | { error: string }> {
  const slippage = Math.min(Math.max(params.slippagePercent ?? 1, 0.1), 50);

  let tokenAmount: bigint;
  try {
    tokenAmount = parseEther(params.tokenAmountWhole);
  } catch {
    return { error: `Invalid token amount: ${params.tokenAmountWhole}` };
  }
  if (tokenAmount <= 0n) return { error: "Token amount must be greater than 0." };

  // Helper: build approve tx for a given spender
  const makeApproveTx = (spender: `0x${string}`, amount: bigint): TradeTxResult["approveTx"] => ({
    to:    params.tokenAddress,
    data:  encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender, amount] }),
    value: "0x0",
  });

  const client = getPublicClient();

  // ── Try bonding curve ──────────────────────────────────────────────────────
  const state = await readBondingCurveState(params.tokenAddress);
  if (!("error" in state) && state.price > 0n) {
    const estimatedEth  = (tokenAmount * state.price) / 10n ** 18n;
    const slippageBps   = BigInt(Math.round((100 - slippage) * 100));
    const minEthAmount  = (estimatedEth * slippageBps) / 10000n;
    const priceImpactPct = state.raised > 0n ? Number((estimatedEth * 100000n) / state.raised) / 1000 : 0;

    let currentAllowance = 0n;
    try {
      currentAllowance = await client.readContract({ address: params.tokenAddress, abi: ERC20_ABI, functionName: "allowance", args: [params.userAddress, BONDING_V5_ADDRESS] }) as bigint;
    } catch { /* treat as 0 */ }
    const needsApprove = currentAllowance < tokenAmount;

    const sellData = encodeFunctionData({ abi: BONDING_V5_ABI, functionName: "sell", args: [params.tokenAddress, tokenAmount, minEthAmount] });
    const tokenDisplay  = (Number(tokenAmount) / 1e18).toLocaleString("en", { maximumFractionDigits: 2 });
    const priceDisplay  = (Number(state.price) / 1e18).toFixed(10).replace(/\.?0+$/, "");
    return {
      needsApprove,
      approveTx: needsApprove ? makeApproveTx(BONDING_V5_ADDRESS, tokenAmount) : undefined,
      tradeTx: { to: BONDING_V5_ADDRESS, data: sellData, value: "0x0" },
      preview: {
        side: "sell", tokenName: params.tokenName, tokenTicker: params.tokenTicker, tokenAddress: params.tokenAddress,
        amountIn: `${tokenDisplay} ${params.tokenTicker}`,
        amountOutMin: `~${formatEther(minEthAmount)} ETH (min, est. ~${formatEther(estimatedEth)})`,
        priceImpact: `~${priceImpactPct.toFixed(2)}%`,
        slippage, currentPrice: `${priceDisplay} ETH / token`, network: "Robinhood Chain (4663)",
        protocol: "bonding_curve",
      },
    };
  }

  // ── Try VIRTUAL bonding curve (OTR-style tokens, ETH router wrapper) ────────
  // minEthAmount = 0n: router computes output at execution time via BondingV5.
  // No reliable off-chain output quote without the exact bonding curve formula.
  const vbcSell = await detectVirtualBondingCurve(params.tokenAddress);
  if (!("error" in vbcSell) && vbcSell.trading && !vbcSell.tradingOnUniswap) {
    const deadline     = BigInt(Math.floor(Date.now() / 1000) + 1200);
    const tokenDisplay = (Number(tokenAmount) / 1e18).toLocaleString("en", { maximumFractionDigits: 2 });

    let currentAllowance = 0n;
    try {
      currentAllowance = await client.readContract({ address: params.tokenAddress, abi: ERC20_ABI, functionName: "allowance", args: [params.userAddress, ETH_ROUTER_ADDRESS] }) as bigint;
    } catch { /* treat as 0 */ }
    const needsApprove = currentAllowance < tokenAmount;

    const sellData = encodeFunctionData({ abi: ETH_ROUTER_ABI, functionName: "sell", args: [params.tokenAddress, tokenAmount, 0n, deadline] });
    logger.info({ tokenAddress: params.tokenAddress, tokenAmount: tokenAmount.toString() }, "VIRTUAL bonding curve sell tx built");
    return {
      needsApprove,
      approveTx: needsApprove ? makeApproveTx(ETH_ROUTER_ADDRESS, tokenAmount) : undefined,
      tradeTx: { to: ETH_ROUTER_ADDRESS, data: sellData, value: "0x0" },
      preview: {
        side: "sell", tokenName: params.tokenName, tokenTicker: params.tokenTicker, tokenAddress: params.tokenAddress,
        amountIn: `${tokenDisplay} ${params.tokenTicker}`,
        amountOutMin: `market rate (set by bonding curve at execution)`,
        priceImpact: "varies by curve depth",
        slippage, currentPrice: "via $VIRTUAL bonding curve", network: "Robinhood Chain (4663)",
        protocol: "virtual_bonding_curve",
      },
    };
  }

  // ── Bonding curve not found — try Uniswap ─────────────────────────────────
  const detect = await detectUniswapProtocol(params.tokenAddress);
  if ("error" in detect) {
    const bcErr = "error" in state ? state.error : "Token not on bonding curve";
    return { error: `${bcErr}. ${detect.error}` };
  }
  const quoteResult = await quoteUniswapSell(detect, params.tokenAddress, tokenAmount);
  if ("error" in quoteResult) return { error: quoteResult.error };

  const estimatedEth  = quoteResult.amountOut;
  const slippageBps   = BigInt(Math.round((100 - slippage) * 100));
  const minEthAmount  = (estimatedEth * slippageBps) / 10000n;
  const pricePerToken = tokenAmount > 0n ? Number(estimatedEth) / Number(tokenAmount) : 0;
  const priceDisplay  = pricePerToken < 1e-9
    ? pricePerToken.toExponential(4)
    : pricePerToken.toFixed(10).replace(/\.?0+$/, "");
  const feeLabel      = detect.feeTier != null ? ` (${(detect.feeTier / 10000).toFixed(2)}% fee)` : "";

  const { spender, to, data } = buildUniswapSellTxData(detect, params.tokenAddress, tokenAmount, minEthAmount, params.userAddress);

  // Check ERC-20 allowance for the Uniswap router
  let currentAllowance = 0n;
  try {
    currentAllowance = await client.readContract({ address: params.tokenAddress, abi: ERC20_ABI, functionName: "allowance", args: [params.userAddress, spender] }) as bigint;
  } catch { /* treat as 0 */ }
  const needsApprove = currentAllowance < tokenAmount;
  const tokenDisplay = (Number(tokenAmount) / 1e18).toLocaleString("en", { maximumFractionDigits: 2 });
  logger.info({ protocol: detect.protocol, feeTier: detect.feeTier, tokenAddress: params.tokenAddress }, `Uniswap ${detect.protocol} sell tx built`);

  return {
    needsApprove,
    approveTx: needsApprove ? makeApproveTx(spender, tokenAmount) : undefined,
    tradeTx: { to, data, value: "0x0" },
    preview: {
      side: "sell", tokenName: params.tokenName, tokenTicker: params.tokenTicker, tokenAddress: params.tokenAddress,
      amountIn: `${tokenDisplay} ${params.tokenTicker}`,
      amountOutMin: `~${formatEther(minEthAmount)} ETH (min, est. ~${formatEther(estimatedEth)})`,
      priceImpact: `varies by pool depth`,
      slippage, currentPrice: `${priceDisplay} ETH / token`, network: "Robinhood Chain (4663)",
      protocol: detect.protocol,
    },
  };
}

// ─── Server-side activate (launch()) ────────────────────────────────────────
// OUTRIVE server calls launch(tokenAddress) after the user's preLaunch confirms.
// Requires OUTRIVE_SIGNER_PRIVATE_KEY with some ETH on Robinhood Chain for gas.
// If not configured, falls back to returning unsigned tx for user to sign.
export async function signAndBroadcastActivateTx(
  tokenAddress: `0x${string}`
): Promise<{ txHash: `0x${string}` } | { error: string }> {
  const signerAccount = getSignerAccount();
  if (!signerAccount) {
    return { error: "OUTRIVE_SIGNER_PRIVATE_KEY not configured — user must sign activate tx." };
  }

  const tx = buildActivateLaunchTx(tokenAddress);
  try {
    const chain  = getActiveChain();
    const rpcUrl = process.env.RPC_URL_OVERRIDE ?? chain.rpcUrls.default.http[0];
    const wallet = createWalletClient({ account: signerAccount, chain, transport: http(rpcUrl) });
    const txHash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: 0n });
    logger.info({ txHash, tokenAddress }, "OUTRIVE activated launch — launch() call succeeded");
    return { txHash };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, tokenAddress }, "signAndBroadcastActivateTx failed");
    return { error: `Activate broadcast failed: ${msg}` };
  }
}
