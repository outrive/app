/**
 * OUTRIVE server signer wallet.
 *
 * This wallet must hold BONDING_ROLE on the AgentFactoryV7 proxy.
 * Address: read from OUTRIVE_SIGNER_ADDRESS env var (for display).
 * Private key: read from OUTRIVE_SIGNER_PRIVATE_KEY secret.
 *
 * To get BONDING_ROLE: contact Virtuals Protocol and request
 * `grantRole(BONDING_ROLE, <OUTRIVE_SIGNER_ADDRESS>)` on the factory.
 */

import { createWalletClient, createPublicClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getActiveChain } from "./chains.js";
import { logger } from "./logger.js";

// BONDING_ROLE = keccak256("BONDING_ROLE") — same as Solidity constant
const BONDING_ROLE = keccak256(toBytes("BONDING_ROLE")) as `0x${string}`;

const HAS_ROLE_ABI = [
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role",    type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

let _hasBondingRole: boolean | null = null;

export function getSignerAccount() {
  const pk = process.env.OUTRIVE_SIGNER_PRIVATE_KEY;
  if (!pk) return null;
  try {
    return privateKeyToAccount(pk as `0x${string}`);
  } catch (err) {
    logger.error({ err }, "Invalid OUTRIVE_SIGNER_PRIVATE_KEY");
    return null;
  }
}

export function getSignerAddress(): string | null {
  const account = getSignerAccount();
  return account?.address ?? process.env.OUTRIVE_SIGNER_ADDRESS ?? null;
}

export function getSignerWalletClient() {
  const account = getSignerAccount();
  if (!account) return null;
  const chain  = getActiveChain();
  const rpcUrl = process.env.RPC_URL_OVERRIDE ?? chain.rpcUrls.default.http[0];
  return createWalletClient({ account, chain, transport: http(rpcUrl) });
}

/** Returns null if signer is not configured, true/false for BONDING_ROLE status. */
export function hasBondingRole(): boolean | null {
  return _hasBondingRole;
}

/** Called once at startup to check BONDING_ROLE on the factory. */
export async function checkBondingRole(factoryAddress: `0x${string}`): Promise<void> {
  const address = getSignerAddress();
  if (!address) {
    _hasBondingRole = null;
    logger.warn("OUTRIVE_SIGNER_PRIVATE_KEY not set — server signing disabled");
    return;
  }

  try {
    const chain  = getActiveChain();
    const rpcUrl = process.env.RPC_URL_OVERRIDE ?? chain.rpcUrls.default.http[0];
    const client = createPublicClient({ chain, transport: http(rpcUrl) });

    const has = await client.readContract({
      address:      factoryAddress,
      abi:          HAS_ROLE_ABI,
      functionName: "hasRole",
      args:         [BONDING_ROLE, address as `0x${string}`],
    }) as boolean;

    _hasBondingRole = has;

    if (has) {
      logger.info({ signerAddress: address }, "OUTRIVE signer has BONDING_ROLE — server signing enabled");
    } else {
      logger.warn({ signerAddress: address }, "OUTRIVE signer LACKS BONDING_ROLE — launches will fail until granted");
    }
  } catch (err) {
    // RPC unavailable at startup — optimistically assume role is granted
    _hasBondingRole = null;
    logger.warn({ err }, "Could not check BONDING_ROLE at startup — will attempt signing anyway");
  }
}
