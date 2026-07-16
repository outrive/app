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
}

export interface TradeTxResult {
  needsApprove: boolean;
  approveTx?: { to: `0x${string}`; data: `0x${string}`; value: string };
  tradeTx:     { to: `0x${string}`; data: `0x${string}`; value: string };
  preview:     TradePreview;
}

// ─── Build BUY transaction (ETH → agent token) ───────────────────────────────
// ETH is native — no approve needed. Single tx: BondingV5.buy(token, minTokens).
export async function buildBuyTx(params: {
  tokenAddress: `0x${string}`;
  ethAmountEther: string;   // e.g. "0.05"
  slippagePercent?: number; // default 1
  tokenName: string;
  tokenTicker: string;
}): Promise<TradeTxResult | { error: string }> {
  const slippage = Math.min(Math.max(params.slippagePercent ?? 1, 0.1), 50);

  let ethAmount: bigint;
  try {
    ethAmount = parseEther(params.ethAmountEther);
  } catch {
    return { error: `Invalid ETH amount: ${params.ethAmountEther}` };
  }
  if (ethAmount <= 0n) return { error: "ETH amount must be greater than 0." };

  const state = await readBondingCurveState(params.tokenAddress);
  if ("error" in state) return { error: state.error };
  if (state.price === 0n) return { error: "Token price is zero — token may not be active on the bonding curve." };

  // Estimated tokens out = ethAmount * 1e18 / price
  const estimatedTokens = (ethAmount * 10n ** 18n) / state.price;
  // minTokenAmount with slippage: estimatedTokens * (100 - slippage) / 100
  const slippageBps = BigInt(Math.round((100 - slippage) * 100)); // e.g. 1% → 9900
  const minTokenAmount = (estimatedTokens * slippageBps) / 10000n;

  // Price impact ≈ ethAmount / (raised + ethAmount)
  const priceImpactPct = state.raised > 0n
    ? Number((ethAmount * 100000n) / (state.raised + ethAmount)) / 1000
    : 0;

  const data = encodeFunctionData({
    abi: BONDING_V5_ABI,
    functionName: "buy",
    args: [params.tokenAddress, minTokenAmount],
  });

  const estTokensDisplay   = (Number(estimatedTokens) / 1e18).toLocaleString("en", { maximumFractionDigits: 2 });
  const minTokensDisplay   = (Number(minTokenAmount)   / 1e18).toLocaleString("en", { maximumFractionDigits: 2 });
  const currentPriceDisplay = (Number(state.price) / 1e18).toFixed(10).replace(/\.?0+$/, "");

  return {
    needsApprove: false,
    tradeTx: {
      to:    BONDING_V5_ADDRESS,
      data,
      value: ethAmount.toString(),
    },
    preview: {
      side:         "buy",
      tokenName:    params.tokenName,
      tokenTicker:  params.tokenTicker,
      tokenAddress: params.tokenAddress,
      amountIn:     `${params.ethAmountEther} ETH`,
      amountOutMin: `~${minTokensDisplay} ${params.tokenTicker} (min, est. ~${estTokensDisplay})`,
      priceImpact:  `~${priceImpactPct.toFixed(2)}%`,
      slippage,
      currentPrice: `${currentPriceDisplay} ETH / token`,
      network:      "Robinhood Chain (4663)",
    },
  };
}

// ─── Build SELL transaction (agent token → ETH) ───────────────────────────────
// Sell is nonpayable — if allowance is insufficient, approveTx is returned first.
export async function buildSellTx(params: {
  tokenAddress: `0x${string}`;
  tokenAmountWhole: string;  // e.g. "500" (whole tokens, 18 decimals internally)
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

  const state = await readBondingCurveState(params.tokenAddress);
  if ("error" in state) return { error: state.error };
  if (state.price === 0n) return { error: "Token price is zero — token may not be active on the bonding curve." };

  // Estimated ETH out = tokenAmount * price / 1e18
  const estimatedEth = (tokenAmount * state.price) / 10n ** 18n;
  const slippageBps  = BigInt(Math.round((100 - slippage) * 100));
  const minEthAmount = (estimatedEth * slippageBps) / 10000n;

  const priceImpactPct = state.raised > 0n
    ? Number((estimatedEth * 100000n) / state.raised) / 1000
    : 0;

  // Check ERC-20 allowance on the agent token → BondingV5
  const client = getPublicClient();
  let currentAllowance = 0n;
  try {
    currentAllowance = await client.readContract({
      address:      params.tokenAddress,
      abi:          ERC20_ABI,
      functionName: "allowance",
      args:         [params.userAddress, BONDING_V5_ADDRESS],
    }) as bigint;
  } catch { /* treat as 0 */ }

  const needsApprove = currentAllowance < tokenAmount;

  let approveTx: TradeTxResult["approveTx"];
  if (needsApprove) {
    const approveData = encodeFunctionData({
      abi:          ERC20_ABI,
      functionName: "approve",
      args:         [BONDING_V5_ADDRESS, tokenAmount],
    });
    approveTx = {
      to:    params.tokenAddress,
      data:  approveData,
      value: "0x0",
    };
  }

  const sellData = encodeFunctionData({
    abi:          BONDING_V5_ABI,
    functionName: "sell",
    args:         [params.tokenAddress, tokenAmount, minEthAmount],
  });

  const tokenDisplay  = (Number(tokenAmount)   / 1e18).toLocaleString("en", { maximumFractionDigits: 2 });
  const minEthDisplay = formatEther(minEthAmount);
  const estEthDisplay = formatEther(estimatedEth);
  const currentPriceDisplay = (Number(state.price) / 1e18).toFixed(10).replace(/\.?0+$/, "");

  return {
    needsApprove,
    approveTx,
    tradeTx: {
      to:    BONDING_V5_ADDRESS,
      data:  sellData,
      value: "0x0",
    },
    preview: {
      side:         "sell",
      tokenName:    params.tokenName,
      tokenTicker:  params.tokenTicker,
      tokenAddress: params.tokenAddress,
      amountIn:     `${tokenDisplay} ${params.tokenTicker}`,
      amountOutMin: `~${minEthDisplay} ETH (min, est. ~${estEthDisplay})`,
      priceImpact:  `~${priceImpactPct.toFixed(2)}%`,
      slippage,
      currentPrice: `${currentPriceDisplay} ETH / token`,
      network:      "Robinhood Chain (4663)",
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
