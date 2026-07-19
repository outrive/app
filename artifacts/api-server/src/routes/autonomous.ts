/**
 * /api/autonomous — Agent Vault + OTR API Key management
 *
 * Authentication model:
 *   All vault/key routes are protected. Clients MUST obtain a session token first:
 *     1. POST /api/autonomous/auth/nonce  → { nonce }
 *     2. Client signs: "OUTRIVE Autonomous Vault Access\nWallet: {addr}\nNonce: {nonce}"
 *     3. POST /api/autonomous/auth/verify → { token }
 *     4. All subsequent requests: Authorization: Bearer <token>
 *
 *   Server derives authed wallet from session — never trusts client-supplied walletAddress.
 *
 * Tables are self-migrated on first import.
 */

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";
import { verifyMessage } from "viem";
import crypto from "node:crypto";
import {
  createNonce, redeemNonce, buildSignMessage, createSession, getSessionWallet,
} from "../lib/autonomous-sessions.js";
import { RWA_TOKENS, getCachedFlapPrices } from "./rwa.js";

const router: IRouter = Router();

/* ── Self-migration ──────────────────────────────────────────────────── */
async function migrateAutonomous() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_vaults (
      id              SERIAL PRIMARY KEY,
      wallet_address  TEXT          NOT NULL UNIQUE,
      agent_address   TEXT,
      pk_hint         TEXT,
      status          TEXT          NOT NULL DEFAULT 'idle',
      strategy_config TEXT,
      total_trades    INTEGER       NOT NULL DEFAULT 0,
      total_pnl_usd   NUMERIC(28,4) NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS agent_api_keys (
      id              SERIAL PRIMARY KEY,
      wallet_address  TEXT          NOT NULL,
      key_hash        TEXT          NOT NULL UNIQUE,
      key_prefix      TEXT          NOT NULL,
      name            TEXT,
      revoked         BOOLEAN       NOT NULL DEFAULT false,
      last_used_at    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS api_keys_wallet_idx ON agent_api_keys(wallet_address);
  `);
}

(async () => {
  try { await migrateAutonomous(); }
  catch (err) { console.error("[autonomous] boot migration error:", err); }
})();

/* ── Helpers ─────────────────────────────────────────────────────────── */
function normalise(addr: string) { return addr.toLowerCase().trim(); }

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function generateOtrKey(): { full: string; prefix: string; hash: string } {
  const raw  = crypto.randomBytes(16).toString("hex");
  const full = `OTR-${raw}`;
  return { full, prefix: full.slice(0, 12), hash: hashKey(full) };
}

/* ── Auth middleware ─────────────────────────────────────────────────── */
// Accepts both:
//   1. Session token (UUID) — from browser sign-in flow, in-memory, 1h TTL
//   2. OTR API key (OTR-xxxx) — from VPS agent, stored as SHA-256 hash in DB
async function requireAutonomousAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Missing Authorization header. Use a session token or OTR API key.",
    });
    return;
  }

  const token = auth.slice(7);

  // 1. Try session token first (fast in-memory lookup)
  const sessionWallet = getSessionWallet(token);
  if (sessionWallet) {
    (req as Request & { authedWallet: string }).authedWallet = sessionWallet;
    next();
    return;
  }

  // 2. Try OTR API key (database lookup + update last_used_at)
  if (token.startsWith("OTR-")) {
    try {
      const keyHash = hashKey(token);
      const r = await pool.query<{ wallet_address: string }>(
        `UPDATE agent_api_keys
         SET last_used_at = NOW()
         WHERE key_hash = $1 AND revoked = false
         RETURNING wallet_address`,
        [keyHash],
      );
      if (r.rows[0]) {
        (req as Request & { authedWallet: string }).authedWallet = r.rows[0].wallet_address;
        next();
        return;
      }
    } catch (err) {
      res.status(500).json({ error: "Auth lookup error" });
      return;
    }
  }

  res.status(401).json({ error: "Session expired or invalid. Re-authenticate." });
}

/* ──────────────────────────────────────────────────────────────────────
   PUBLIC — POST /api/autonomous/auth/nonce
   Step 1: wallet address → nonce to sign
────────────────────────────────────────────────────────────────────── */
router.post("/autonomous/auth/nonce", (req: Request, res: Response): void => {
  const { walletAddress } = req.body as { walletAddress?: string };
  if (!walletAddress || typeof walletAddress !== "string" || walletAddress.length < 10) {
    res.status(400).json({ error: "walletAddress required" });
    return;
  }
  const wallet = normalise(walletAddress);
  const nonce  = createNonce(wallet);
  const message = buildSignMessage(wallet, nonce);
  res.json({ nonce, message, expiresIn: 300 });
});

/* ──────────────────────────────────────────────────────────────────────
   PUBLIC — POST /api/autonomous/auth/verify
   Step 3: verify signature → session token (1 h)
────────────────────────────────────────────────────────────────────── */
router.post("/autonomous/auth/verify", async (req: Request, res: Response): Promise<void> => {
  const { walletAddress, nonce, signature } =
    req.body as { walletAddress?: string; nonce?: string; signature?: string };

  if (!walletAddress || !nonce || !signature) {
    res.status(400).json({ error: "walletAddress, nonce, and signature are required" });
    return;
  }

  const wallet = normalise(walletAddress);

  // Redeem nonce — one-time use, binds to wallet
  const nonceWallet = redeemNonce(nonce);
  if (!nonceWallet) {
    res.status(401).json({ error: "Nonce expired or invalid" });
    return;
  }
  if (nonceWallet !== wallet) {
    res.status(401).json({ error: "Nonce was issued for a different wallet" });
    return;
  }

  const message = buildSignMessage(wallet, nonce);
  try {
    const valid = await verifyMessage({
      address:   walletAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      res.status(401).json({ error: "Signature verification failed" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Signature verification error" });
    return;
  }

  const token = createSession(wallet);
  res.json({ token, wallet, expiresIn: 3600 });
});

/* ──────────────────────────────────────────────────────────────────────
   PROTECTED — GET /api/autonomous/vault
   Vault config + stats for the authenticated wallet
────────────────────────────────────────────────────────────────────── */
router.get("/autonomous/vault", requireAutonomousAuth, async (req: Request, res: Response): Promise<void> => {
  const wallet = (req as Request & { authedWallet: string }).authedWallet;
  try {
    const r = await pool.query<{
      id: number; agent_address: string | null; pk_hint: string | null;
      status: string; strategy_config: string | null;
      total_trades: number; total_pnl_usd: string; created_at: Date; updated_at: Date;
    }>(
      `SELECT id, agent_address, pk_hint, status, strategy_config,
              total_trades, total_pnl_usd, created_at, updated_at
       FROM agent_vaults WHERE wallet_address = $1`,
      [wallet],
    );
    if (!r.rows[0]) { res.json({ vault: null }); return; }
    const v = r.rows[0];
    res.json({
      vault: {
        agentAddress:   v.agent_address,
        pkHint:         v.pk_hint,
        status:         v.status,
        strategyConfig: v.strategy_config ? JSON.parse(v.strategy_config) : null,
        totalTrades:    v.total_trades,
        totalPnlUsd:    parseFloat(v.total_pnl_usd),
        createdAt:      v.created_at,
        updatedAt:      v.updated_at,
      },
    });
  } catch (err) {
    req.log?.error({ err }, "autonomous/vault get error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ──────────────────────────────────────────────────────────────────────
   PROTECTED — POST /api/autonomous/vault
   Create or update vault config — wallet comes from session, not body
────────────────────────────────────────────────────────────────────── */
router.post("/autonomous/vault", requireAutonomousAuth, async (req: Request, res: Response): Promise<void> => {
  const wallet = (req as Request & { authedWallet: string }).authedWallet;
  const { agentAddress, pkHint, strategyConfig, status } =
    req.body as {
      agentAddress?: string;
      pkHint?: string;
      strategyConfig?: Record<string, unknown>;
      status?: string;
    };

  const validStatuses = ["idle", "running", "paused"];
  if (status && !validStatuses.includes(status)) {
    res.status(400).json({ error: `status must be one of ${validStatuses.join(", ")}` });
    return;
  }

  try {
    const configJson = strategyConfig ? JSON.stringify(strategyConfig) : null;
    await pool.query(`
      INSERT INTO agent_vaults (wallet_address, agent_address, pk_hint, status, strategy_config)
      VALUES ($1, $2, $3, COALESCE($4, 'idle'), $5)
      ON CONFLICT (wallet_address) DO UPDATE SET
        agent_address   = COALESCE($2, agent_vaults.agent_address),
        pk_hint         = COALESCE($3, agent_vaults.pk_hint),
        status          = COALESCE($4, agent_vaults.status),
        strategy_config = COALESCE($5, agent_vaults.strategy_config),
        updated_at      = NOW()
    `, [wallet, agentAddress ?? null, pkHint ?? null, status ?? null, configJson]);

    const updated = await pool.query(
      `SELECT agent_address, pk_hint, status, strategy_config,
              total_trades, total_pnl_usd, updated_at
       FROM agent_vaults WHERE wallet_address = $1`,
      [wallet],
    );
    const v = updated.rows[0];
    res.json({
      vault: {
        agentAddress:   v.agent_address,
        pkHint:         v.pk_hint,
        status:         v.status,
        strategyConfig: v.strategy_config ? JSON.parse(v.strategy_config) : null,
        totalTrades:    v.total_trades,
        totalPnlUsd:    parseFloat(v.total_pnl_usd),
      },
    });
  } catch (err) {
    req.log?.error({ err }, "autonomous/vault post error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ──────────────────────────────────────────────────────────────────────
   PROTECTED — GET /api/autonomous/api-keys
   List active (non-revoked) API keys for the authenticated wallet
────────────────────────────────────────────────────────────────────── */
router.get("/autonomous/api-keys", requireAutonomousAuth, async (req: Request, res: Response): Promise<void> => {
  const wallet = (req as Request & { authedWallet: string }).authedWallet;
  try {
    const r = await pool.query<{
      id: number; key_prefix: string; name: string | null;
      last_used_at: Date | null; created_at: Date;
    }>(
      `SELECT id, key_prefix, name, last_used_at, created_at
       FROM agent_api_keys
       WHERE wallet_address = $1 AND revoked = false
       ORDER BY created_at DESC`,
      [wallet],
    );
    res.json({
      keys: r.rows.map(k => ({
        id:         k.id,
        keyPrefix:  k.key_prefix,
        name:       k.name,
        lastUsedAt: k.last_used_at,
        createdAt:  k.created_at,
      })),
    });
  } catch (err) {
    req.log?.error({ err }, "autonomous/api-keys list error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ──────────────────────────────────────────────────────────────────────
   PROTECTED — POST /api/autonomous/api-keys
   Generate a new OTR key — wallet comes from session, not body
   Returns: { key } — shown ONCE, hash stored in DB
────────────────────────────────────────────────────────────────────── */
router.post("/autonomous/api-keys", requireAutonomousAuth, async (req: Request, res: Response): Promise<void> => {
  const wallet = (req as Request & { authedWallet: string }).authedWallet;
  const { name } = req.body as { name?: string };

  const countRes = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM agent_api_keys WHERE wallet_address = $1 AND revoked = false`,
    [wallet],
  );
  if (parseInt(countRes.rows[0]?.cnt ?? "0", 10) >= 5) {
    res.status(429).json({ error: "Maximum 5 active API keys per wallet. Revoke one first." });
    return;
  }

  try {
    const { full, prefix, hash } = generateOtrKey();
    await pool.query(
      `INSERT INTO agent_api_keys (wallet_address, key_hash, key_prefix, name) VALUES ($1, $2, $3, $4)`,
      [wallet, hash, prefix, name?.slice(0, 64) ?? null],
    );
    res.status(201).json({
      key:    full,
      prefix: prefix,
      note:   "Save this key now — it will not be shown again.",
    });
  } catch (err) {
    req.log?.error({ err }, "autonomous/api-keys generate error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ──────────────────────────────────────────────────────────────────────
   PROTECTED — DELETE /api/autonomous/api-keys/:id
   Revoke a key by id — only the key's owner (authenticated wallet) may revoke
────────────────────────────────────────────────────────────────────── */
router.delete("/autonomous/api-keys/:id", requireAutonomousAuth, async (req: Request, res: Response): Promise<void> => {
  const wallet = (req as Request & { authedWallet: string }).authedWallet;
  const id     = parseInt((req.params.id as string) ?? "", 10);
  if (isNaN(id) || id < 1) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const r = await pool.query(
      `UPDATE agent_api_keys SET revoked = true
       WHERE id = $1 AND wallet_address = $2 AND revoked = false`,
      [id, wallet],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ error: "Key not found or already revoked" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "autonomous/api-keys revoke error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ──────────────────────────────────────────────────────────────────────
   PROTECTED — GET /api/autonomous/market-intel
   Hermes AI Strategy orchestrator endpoint.
   Returns current vault state + all RWA market prices in one call.
   Auth: OTR key OR session token — same middleware as other routes.
────────────────────────────────────────────────────────────────────── */
router.get("/autonomous/market-intel", requireAutonomousAuth, async (req: Request, res: Response): Promise<void> => {
  const wallet = (req as Request & { authedWallet: string }).authedWallet;

  try {
    /* ── 1. Vault state ── */
    const vaultRes = await pool.query<{
      agent_address: string | null;
      status: string;
      strategy_config: string | null;
      total_trades: number;
      total_pnl_usd: string;
      updated_at: Date;
    }>(
      `SELECT agent_address, status, strategy_config, total_trades, total_pnl_usd, updated_at
       FROM agent_vaults WHERE wallet_address = $1`,
      [wallet],
    );
    const v = vaultRes.rows[0] ?? null;
    const strategyConfig = v?.strategy_config ? JSON.parse(v.strategy_config) : null;

    /* ── 2. RWA market prices from in-memory flap cache ── */
    const cachedPrices = getCachedFlapPrices();
    const market: Record<string, { priceUsd: number; tokenAddress: string; name: string; priceAgeMs: number }> = {};
    for (const [sym, info] of Object.entries(RWA_TOKENS)) {
      const hit = cachedPrices[sym];
      if (hit) {
        market[sym] = {
          priceUsd:     hit.price,
          tokenAddress: info.address,
          name:         info.name,
          priceAgeMs:   Date.now() - hit.ts,
        };
      }
    }

    /* ── 3. Target token current price ── */
    const targetToken: string | null = strategyConfig?.token ?? null;
    const targetPrice: number | null = targetToken ? (market[targetToken]?.priceUsd ?? null) : null;

    /* ── 4. Human-readable summary for the LLM context window ── */
    const topPrices = Object.entries(market)
      .slice(0, 8)
      .map(([sym, d]) => `${sym}=${d.priceUsd.toFixed(2)}`)
      .join(", ");

    const summary = v
      ? `Vault status: ${v.status}. Strategy: ${strategyConfig?.strategy ?? "not set"} on ${targetToken ?? "no token"}. ` +
        `Budget: ${strategyConfig?.budget_eth ?? "?"} ETH/trade. ` +
        `TP: +${strategyConfig?.tp_pct ?? "?"}% / SL: -${strategyConfig?.sl_pct ?? "?"}%. ` +
        `Target price: ${targetPrice != null ? "$" + targetPrice.toFixed(2) : "N/A"}. ` +
        `Total trades: ${v.total_trades}. Total P&L: ${parseFloat(v.total_pnl_usd).toFixed(2)}. ` +
        `Top market prices: ${topPrices}.`
      : "No vault configured. Visit outrive.io to set up the vault first.";

    res.json({
      timestamp:   new Date().toISOString(),
      vault:       v ? {
        agentAddress:   v.agent_address,
        status:         v.status,
        strategyConfig,
        totalTrades:    v.total_trades,
        totalPnlUsd:    parseFloat(v.total_pnl_usd),
        updatedAt:      v.updated_at,
      } : null,
      market,
      targetToken,
      targetPrice,
      tokenCount:  Object.keys(market).length,
      summary,
    });
  } catch (err) {
    req.log?.error({ err }, "autonomous/market-intel error");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
