/**
 * Short-lived session store for Autonomous Vault API authentication.
 *
 * Flow:
 *   1. POST /api/autonomous/auth/nonce   → client sends walletAddress → server returns nonce
 *   2. Client signs message with wallet private key
 *   3. POST /api/autonomous/auth/verify  → server verifies signature → returns opaque session token
 *   4. All protected routes require "Authorization: Bearer <token>" header
 *   5. Server derives authed wallet from the session; NEVER trusts client-supplied walletAddress
 */

import crypto from "node:crypto";

interface NonceEntry { wallet: string; createdAt: number; }
interface SessionEntry { wallet: string; expiresAt: number; }

const NONCES:   Map<string, NonceEntry>   = new Map();
const SESSIONS: Map<string, SessionEntry> = new Map();

const NONCE_TTL_MS   = 5  * 60 * 1000; // 5 minutes
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

/* ── Nonce management ─────────────────────────────────────────────────── */
export function createNonce(wallet: string): string {
  const nonce = crypto.randomUUID();
  NONCES.set(nonce, { wallet: wallet.toLowerCase(), createdAt: Date.now() });
  setTimeout(() => NONCES.delete(nonce), NONCE_TTL_MS);
  return nonce;
}

export function redeemNonce(nonce: string): string | null {
  const entry = NONCES.get(nonce);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > NONCE_TTL_MS) { NONCES.delete(nonce); return null; }
  NONCES.delete(nonce); // one-time use
  return entry.wallet;
}

export function buildSignMessage(wallet: string, nonce: string): string {
  return `OUTRIVE Autonomous Vault Access\nWallet: ${wallet}\nNonce: ${nonce}`;
}

/* ── Session management ───────────────────────────────────────────────── */
export function createSession(wallet: string): string {
  const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  SESSIONS.set(token, { wallet, expiresAt: Date.now() + SESSION_TTL_MS });
  // Periodic pruning
  for (const [k, v] of SESSIONS) {
    if (Date.now() > v.expiresAt) SESSIONS.delete(k);
  }
  return token;
}

/** Returns the authenticated wallet address for a valid token, or null. */
export function getSessionWallet(token: string): string | null {
  const s = SESSIONS.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { SESSIONS.delete(token); return null; }
  return s.wallet;
}
