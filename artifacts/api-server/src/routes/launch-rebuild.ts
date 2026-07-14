/**
 * POST /api/launch/rebuild-tx
 *
 * Re-generates preLaunch() calldata with an updated imageRef (or any changed param).
 * Called by the frontend Work Order card when the user attaches/changes an image.
 *
 * Body: { name, ticker, description?, imageRef?, antiSniperDuration?, walletAddress }
 * Returns: { launchTx: { to, data, value }, preview }
 */
import { Router, type Request, type Response } from "express";
import { buildLaunchTx, isCalibrated } from "../lib/virtuals.js";

const router = Router();

router.post("/launch/rebuild-tx", async (req: Request, res: Response) => {
  const {
    name,
    ticker,
    description = "",
    imageRef    = "",
    antiSniperDuration,
    walletAddress,
  } = req.body as {
    name?: string;
    ticker?: string;
    description?: string;
    imageRef?: string;
    antiSniperDuration?: number;
    walletAddress?: string;
  };

  if (!name || !ticker || !walletAddress) {
    return res.status(400).json({ error: "name, ticker, and walletAddress are required" });
  }

  if (!isCalibrated()) {
    return res.status(503).json({ error: "Factory not calibrated" });
  }

  const result = await buildLaunchTx({
    name,
    ticker: ticker.toUpperCase(),
    description,
    imageRef,
    antiSniperDuration: antiSniperDuration ?? 60,
    walletAddress: walletAddress as `0x${string}`,
  });

  if ("error" in result) {
    return res.status(422).json({ error: result.error });
  }

  return res.json({ launchTx: result.launchTx, preview: result.preview });
});

export default router;
