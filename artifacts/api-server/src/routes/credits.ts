import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { chatCreditsTable, FREE_CHAT_LIMIT, OTR_PER_CREDIT } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

/* ── helpers ── */
function normalise(addr: string) { return addr.toLowerCase().trim(); }

async function getOrCreate(walletAddress: string) {
  const addr = normalise(walletAddress);
  const [existing] = await db
    .select()
    .from(chatCreditsTable)
    .where(eq(chatCreditsTable.walletAddress, addr));

  if (existing) return existing;

  const [created] = await db
    .insert(chatCreditsTable)
    .values({ walletAddress: addr })
    .returning();
  return created;
}

function buildCreditView(row: typeof chatCreditsTable.$inferSelect) {
  const freeRemaining = Math.max(0, FREE_CHAT_LIMIT - (row.freeChatsUsed ?? 0));
  const otrCredits    = parseFloat(row.otrCredits ?? "0");
  const hasAccess     = freeRemaining > 0 || otrCredits >= OTR_PER_CREDIT;
  return {
    walletAddress:  row.walletAddress,
    freeChatsUsed:  row.freeChatsUsed,
    freeChatsTotal: FREE_CHAT_LIMIT,
    freeRemaining,
    otrCredits,
    hasAccess,
    totalChats:     row.totalChats,
    updatedAt:      row.updatedAt,
  };
}

/* ───────────────────────────────────────────────
   GET /api/credits/:walletAddress
   Returns credit summary for a wallet.
─────────────────────────────────────────────── */
router.get("/credits/:walletAddress", async (req: Request, res: Response): Promise<void> => {
  const walletAddress = String(req.params.walletAddress ?? '');
  if (!walletAddress || walletAddress.length < 10) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }
  try {
    const row = await getOrCreate(walletAddress);
    res.json(buildCreditView(row));
  } catch (err) {
    req.log.error({ err }, "Credits GET error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ───────────────────────────────────────────────
   POST /api/credits/purchase
   Future: validates an on-chain $OTR payment and
   credits the wallet. Returns 501 until $OTR is
   deployed and the deposit address is configured.
─────────────────────────────────────────────── */
router.post("/credits/purchase", async (req: Request, res: Response): Promise<void> => {
  const OTR_DEPOSIT_ADDRESS = process.env.OTR_DEPOSIT_ADDRESS;
  const OTR_TOKEN_ADDRESS   = process.env.OTR_TOKEN_ADDRESS;

  if (!OTR_DEPOSIT_ADDRESS || !OTR_TOKEN_ADDRESS) {
    res.status(501).json({
      error: "NOT_DEPLOYED",
      message: "$OTR token not yet deployed. Credit purchases will be enabled after the $OTR TGE.",
    });
    return;
  }

  const { walletAddress, txHash } = req.body as { walletAddress?: string; txHash?: string };
  if (!walletAddress || !txHash) {
    res.status(400).json({ error: "walletAddress and txHash required" });
    return;
  }

  // TODO: verify txHash on-chain — check that it is a transfer of $OTR
  // from walletAddress to OTR_DEPOSIT_ADDRESS, then credit at rate OTR_PER_CREDIT.
  res.status(501).json({ error: "NOT_IMPLEMENTED", message: "On-chain verification not yet wired." });
});

export { getOrCreate, buildCreditView };
export default router;
