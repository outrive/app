/**
 * OUTRIVE server signer wallet.
 *
 * Used to auto-activate launched tokens: after the user signs preLaunch(),
 * the server calls BondingV5.launch(tokenAddress) so users only need one
 * signature instead of two.  BondingV5.launch() is permissionless for
 * LAUNCH_MODE_NORMAL tokens — no special role required on the server wallet.
 *
 * Private key: OUTRIVE_SIGNER_PRIVATE_KEY env secret.
 * The server wallet only needs ETH on Robinhood Chain (4663) for gas.
 */

import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getActiveChain } from "./chains.js";
import { logger } from "./logger.js";

export function getSignerAccount() {
  const pk = process.env.OUTRIVE_SIGNER_PRIVATE_KEY;
  if (!pk) return null;
  try {
    return privateKeyToAccount(pk as `0x${string}`);
  } catch (err) {
    logger.error({ err }, "Invalid OUTRIVE_SIGNER_PRIVATE_KEY — server auto-activate disabled");
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

/** Called once at startup to log signer status. */
export async function checkSignerStatus(): Promise<void> {
  const address = getSignerAddress();
  if (!address) {
    logger.warn("OUTRIVE_SIGNER_PRIVATE_KEY not set — server auto-activate disabled; users will sign both transactions");
    return;
  }
  logger.info({ signerAddress: address }, "OUTRIVE server signer configured — will auto-activate launches via BondingV5.launch()");
}
