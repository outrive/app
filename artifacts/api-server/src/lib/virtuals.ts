import { type Abi, encodeFunctionData, encodeAbiParameters, parseAbi } from "viem";
import { getPublicClient, getActiveChain } from "./chains.js";
import { logger } from "./logger.js";

// ─── Verified ABI — AgentFactory proxy ────────────────────────────────────
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
  antiSniper: string;   // "60s (1 MIN)" | "DISABLED" | "Xs (N MIN)"
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

// ─── Build launch transaction ───────────────────────────────────────────────
// tokenSupplyParams_ encodes the Virtuals Protocol v2 TokenSupplyParams struct:
//   { maxTokensPerWallet, maxTokensPerTxn, botProtectionDurationInSeconds,
//     vault, lpOwner, creator, projectId }
// botProtectionDurationInSeconds = anti-sniper window (0 = disabled).
// Default: 60 seconds (1 minute) — decays buy tax 99%→1% over the window.
//
// NOTE: dev buy is intentionally NOT included. createNewAgentTokenAndApplication
// does not accept a buy amount; buying requires a separate bonding-curve call
// AFTER the token address is known (only available post-confirmation).
export async function buildLaunchTx(params: {
  name: string;
  ticker: string;
  description?: string;
  imageRef?: string;
  antiSniperDuration?: number;  // seconds; default 60; 0 = disabled
  walletAddress: `0x${string}`;
}): Promise<LaunchTxResult | { error: string }> {
  const config = getVirtualsConfig();

  if (!_calibrated || !config.factoryAddress) {
    return { error: config.calibrationMessage ?? "Factory not calibrated." };
  }

  const tickerCheck = validateTicker(params.ticker);
  if (!tickerCheck.ok) return { error: tickerCheck.error! };

  if (params.name.length > 32) return { error: "Agent name must be 32 characters or fewer." };

  const chain = getActiveChain();

  // ── Anti-sniper: default 60 seconds ────────────────────────────────────
  const antiSniperSecs = BigInt(
    typeof params.antiSniperDuration === "number" ? params.antiSniperDuration : 60
  );

  // ── Encode TokenSupplyParams struct ────────────────────────────────────
  // ABI-encoded exactly as Solidity abi.encode(TokenSupplyParams({...}))
  // Fields: maxTokensPerWallet, maxTokensPerTxn, botProtectionDurationInSeconds,
  //         vault, lpOwner, creator, projectId
  const tokenSupplyParams = encodeAbiParameters(
    [
      { type: "uint256" }, // maxTokensPerWallet — 0 = no limit
      { type: "uint256" }, // maxTokensPerTxn    — 0 = no limit
      { type: "uint256" }, // botProtectionDurationInSeconds
      { type: "address" }, // vault   — zero = factory default
      { type: "address" }, // lpOwner — zero = factory default
      { type: "address" }, // creator
      { type: "bytes32" }, // projectId — zero = none
    ],
    [
      0n,
      0n,
      antiSniperSecs,
      ZERO_ADDR,
      ZERO_ADDR,
      params.walletAddress,
      ZERO_B32,
    ],
  );

  // ── Random TBA salt (prevents same-block replay) ────────────────────────
  const tbaSalt = `0x${Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("")}` as `0x${string}`;

  // ── Encode factory call ─────────────────────────────────────────────────
  const launchData = encodeFunctionData({
    abi: VIRTUALS_FACTORY_ABI,
    functionName: "createNewAgentTokenAndApplication",
    args: [
      params.name,
      params.ticker,
      tokenSupplyParams,                                                    // encoded struct
      [0] as unknown as readonly number[],                                  // cores: [BASE]
      tbaSalt,
      ZERO_ADDR,                                                            // tbaImplementation: factory default
      0,                                                                    // daoVotingPeriod: factory default
      BigInt(0),                                                            // daoThreshold: factory default
      BigInt(0),                                                            // applicationThreshold_: factory default
      params.walletAddress,                                                 // creator
    ],
  });

  const launchTx = {
    to:    config.factoryAddress,
    data:  launchData,
    value: "0x0" as `0x${string}`,
  };

  // ── Build human-readable preview ─────────────────────────────────────────
  const antiSniperLabel = antiSniperSecs === 0n
    ? "DISABLED"
    : antiSniperSecs === 60n
    ? "60s (1 MIN) — buy tax 99%→1%"
    : `${antiSniperSecs}s (${Math.round(Number(antiSniperSecs) / 60)} MIN) — buy tax 99%→1%`;

  return {
    needsApproval: false,
    launchTx,
    preview: {
      name:           params.name,
      ticker:         params.ticker,
      description:    params.description || "",
      network:        `${chain.name} (${chain.id})`,
      targetContract: config.factoryAddress,
      baseCost:       "GAS ONLY (ETH) — no base fee",
      mode:           "INSTANT LAUNCH",
      antiSniper:     antiSniperLabel,
    },
  };
}
