// ─── CLI Auth Routes ──────────────────────────────────────────────────────────
// Three-step wallet-signed auth flow for the OUTRIVE CLI:
//
//  1. POST /api/cli/auth/request   → CLI registers a pending session (sessionId)
//  2. GET  /api/cli/auth/poll/:id  → CLI polls every 2 s until confirmed/expired
//  3. POST /api/cli/auth/confirm   → Web app POSTs wallet signature to confirm
//
// Signature message (EIP-191 personal_sign):
//   "OUTRIVE CLI Authorization\nSession: <id>\nTimestamp: <ISO>"

import { Router, type IRouter } from "express";
import { verifyMessage } from "viem";
import { createSession, confirmSession, getSession } from "../lib/cli-sessions.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ── 1. CLI registers a pending session ────────────────────────────────────────
router.post("/cli/auth/request", (req, res) => {
  const { sessionId } = req.body as { sessionId?: string };
  if (
    !sessionId ||
    typeof sessionId !== "string" ||
    sessionId.length < 8 ||
    sessionId.length > 128 ||
    !/^[\w-]+$/.test(sessionId)
  ) {
    res.status(400).json({ error: "Invalid sessionId" });
    return;
  }
  createSession(sessionId);
  logger.info({ sessionId }, "CLI auth session created");
  res.json({ ok: true, expiresIn: 300 });
});

// ── 2. CLI polls for confirmation ─────────────────────────────────────────────
router.get("/cli/auth/poll/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId || sessionId.length > 128) {
    res.status(400).json({ error: "Invalid sessionId" });
    return;
  }
  const session = getSession(sessionId);
  res.json(session);
});

// ── 3. Web app confirms with wallet signature ──────────────────────────────────
router.post("/cli/auth/confirm", async (req, res) => {
  const { sessionId, walletAddress, signature, timestamp } =
    req.body as {
      sessionId?: string;
      walletAddress?: string;
      signature?: string;
      timestamp?: string;
    };

  if (!sessionId || !walletAddress || !signature || !timestamp) {
    res.status(400).json({ error: "Missing required fields: sessionId, walletAddress, signature, timestamp" });
    return;
  }

  // Verify timestamp is recent (within 5 min) to prevent replay attacks
  const ts = new Date(timestamp).getTime();
  if (isNaN(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
    res.status(400).json({ error: "Timestamp invalid or expired" });
    return;
  }

  const message = `OUTRIVE CLI Authorization\nSession: ${sessionId}\nTimestamp: ${timestamp}`;

  try {
    const valid = await verifyMessage({
      address:   walletAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      res.status(401).json({ error: "Signature verification failed — wrong wallet or tampered data" });
      return;
    }

    const ok = confirmSession(sessionId, walletAddress);
    if (!ok) {
      res.status(410).json({ error: "Session expired or already used" });
      return;
    }

    logger.info({ sessionId, walletAddress }, "CLI session confirmed via wallet signature");
    res.json({ ok: true });
  } catch (e) {
    logger.warn({ err: e }, "CLI auth error during signature verification");
    res.status(400).json({ error: "Signature verification error" });
  }
});

export default router;
