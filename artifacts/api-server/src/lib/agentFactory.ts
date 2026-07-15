import { type Abi, encodeFunctionData, parseEther } from "viem";
import { getPublicClient, getActiveChain } from "./chains.js";
import { logger } from "./logger.js";

// Load stub ABI from config/agentFactoryAbi.json
// In production, replace with the real ABI decoded from Blockscout
const AGENT_FACTORY_ABI: Abi = [
  {
    type: "function",
    name: "createToken",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [{ name: "token", type: "address" }],
  },
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
    ],
  },
];

// Well-known ticker blocklist — reject symbol impersonation
const BLOCKED_SYMBOLS = new Set([
  "ETH", "BTC", "USDC", "USDT", "BNB", "SOL", "XRP", "ADA",
  "DOGE", "MATIC", "DOT", "SHIB", "AVAX", "LINK", "UNI", "WETH",
]);

export interface AgentFactoryConfig {
  factoryAddress: `0x${string}` | null;
  createFeeWei: bigint;
  calibrated: boolean;
  calibrationMessage: string | null;
}

export interface UnsignedTx {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string; // hex string
}

export interface DeployPreview {
  name: string;
  symbol: string;
  metadataUri: string;
  network: string;
  targetContract: string;
  createFeeEth: string;
  estGasNote: string;
}

// Global calibration state — checked on server boot
let _calibrationChecked = false;
let _calibrated = false;
let _calibrationMessage: string | null = null;

export function getAgentFactoryConfig(): AgentFactoryConfig {
  const factoryAddress = process.env.AGENT_FACTORY_ADDRESS as `0x${string}` | undefined;
  const createFeeWei = BigInt(process.env.AGENT_CREATE_FEE_WEI ?? "0");

  return {
    factoryAddress: factoryAddress || null,
    createFeeWei,
    calibrated: _calibrated,
    calibrationMessage: _calibrationMessage,
  };
}

export function isCalibrated(): boolean {
  return _calibrated;
}

export async function runCalibrationCheck(): Promise<void> {
  if (_calibrationChecked) return;
  _calibrationChecked = true;

  const factoryAddress = process.env.AGENT_FACTORY_ADDRESS;
  if (!factoryAddress) {
    _calibrated = false;
    _calibrationMessage = "AGENT_FACTORY_ADDRESS is not set. Deploy tool is disabled.";
    logger.warn("Calibration failed: AGENT_FACTORY_ADDRESS not configured");
    return;
  }

  try {
    const client = getPublicClient();
    // Simulate createToken with dummy args to verify factory is reachable
    await client.simulateContract({
      address: factoryAddress as `0x${string}`,
      abi: AGENT_FACTORY_ABI,
      functionName: "createToken",
      args: ["TestToken", "TST", "ipfs://test"],
      value: BigInt(process.env.AGENT_CREATE_FEE_WEI ?? "0"),
      // Use zero address as from — a revert here is expected (no real balance),
      // but if it reverts with "execution reverted" that's actually OK — the factory exists
      account: "0x0000000000000000000000000000000000000000",
    });
    _calibrated = true;
    _calibrationMessage = null;
    logger.info("agent factory calibration OK");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If simulation reverts, it means the contract exists but rejected zero-address call
    // That's acceptable — calibration passes
    if (msg.includes("execution reverted") || msg.includes("ContractFunctionRevertedError")) {
      _calibrated = true;
      _calibrationMessage = null;
      logger.info("agent factory calibration OK (simulation reverted as expected)");
    } else {
      _calibrated = false;
      _calibrationMessage = `RPC error: ${msg.slice(0, 120)}`;
      logger.warn({ err: msg }, "Calibration failed: RPC error");
    }
  }
}

export function validateSymbol(symbol: string): { ok: boolean; error?: string } {
  if (!/^[A-Z0-9]+$/.test(symbol)) {
    return { ok: false, error: "Symbol must be uppercase letters and digits only." };
  }
  if (symbol.length > 10) {
    return { ok: false, error: "Symbol must be 10 characters or fewer." };
  }
  if (BLOCKED_SYMBOLS.has(symbol)) {
    return { ok: false, error: `Symbol "${symbol}" is reserved and cannot be used.` };
  }
  return { ok: true };
}

export function buildDeployCalldata(params: {
  name: string;
  symbol: string;
  metadataUri: string;
  walletAddress: `0x${string}`;
}): { unsignedTx: UnsignedTx; preview: DeployPreview } | { error: string } {
  const config = getAgentFactoryConfig();

  if (!config.calibrated || !config.factoryAddress) {
    return { error: config.calibrationMessage ?? "Factory not calibrated." };
  }

  const symbolCheck = validateSymbol(params.symbol);
  if (!symbolCheck.ok) {
    return { error: symbolCheck.error! };
  }

  if (params.name.length > 32) {
    return { error: "Token name must be 32 characters or fewer." };
  }

  const data = encodeFunctionData({
    abi: AGENT_FACTORY_ABI,
    functionName: "createToken",
    args: [params.name, params.symbol, params.metadataUri],
  });

  const valueHex = `0x${config.createFeeWei.toString(16)}` as `0x${string}`;
  const createFeeEth = config.createFeeWei === 0n
    ? "0 ETH"
    : `${Number(config.createFeeWei) / 1e18} ETH`;

  const chain = getActiveChain();

  return {
    unsignedTx: {
      to: config.factoryAddress,
      data,
      value: valueHex,
    },
    preview: {
      name: params.name,
      symbol: params.symbol,
      metadataUri: params.metadataUri,
      network: chain.name,
      targetContract: config.factoryAddress,
      createFeeEth,
      estGasNote: "~200,000 gas units (estimate)",
    },
  };
}
