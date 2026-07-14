import { Router } from "express";
import { buildActivateLaunchTx, signAndBroadcastActivateTx } from "../lib/virtuals.js";
import { logger } from "../lib/logger.js";

const router = Router();

// POST /launch/activate
// Called by the frontend after preLaunch tx confirms.
// Attempts to call BondingV5.launch(tokenAddress) from the OUTRIVE server wallet
// so the user only needs to sign one transaction (preLaunch).
// Falls back to returning an unsigned launch() tx if no server key is configured —
// the frontend will then prompt the user to sign a second transaction.
router.post("/launch/activate", async (req, res) => {
  const { tokenAddress } = req.body as { tokenAddress?: string };
  if (!tokenAddress || !/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) {
    return res.status(400).json({ error: "Valid tokenAddress (0x…) required" });
  }

  const addr = tokenAddress as `0x${string}`;

  // Attempt server-side broadcast first (requires OUTRIVE_SIGNER_PRIVATE_KEY + ETH on chain)
  const serverResult = await signAndBroadcastActivateTx(addr);

  if ("txHash" in serverResult) {
    logger.info({ tokenAddress: addr, txHash: serverResult.txHash }, "Server auto-activated launch (launch() call)");
    return res.json({ mode: "server", txHash: serverResult.txHash });
  }

  // Server can't sign — return unsigned tx; frontend will ask user to sign it
  logger.info({ tokenAddress: addr, reason: serverResult.error }, "No server signer — returning unsigned activate tx for user");
  const unsignedTx = buildActivateLaunchTx(addr);
  return res.json({ mode: "user", unsignedTx });
});

export default router;
