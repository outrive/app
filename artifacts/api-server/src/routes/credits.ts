import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  chatCreditsTable,
  creditPurchasesTable,
  FREE_CHAT_LIMIT,
  OTR_PER_CREDIT,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  createPublicClient,
  http,
  parseAbiItem,
  decodeEventLog,
  type Hex,
} from "viem";
import { getActiveChain } from "../lib/chains.js";

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

// ── CreditPurchased event ABI ──────────────────────────────────────────────
const CREDIT_PURCHASED_ABI = [
  parseAbiItem(
    "event CreditPurchased(address indexed buyer, uint256 otrAmount, uint256 chatsGranted, uint8 tier)"
  ),
] as const;

const TIER_NAMES: Record<number, string> = {
  0: "starter",
  1: "builder",
  2: "operator",
  3: "custom",
};

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
   Verifies an on-chain OTRCreditPool TX and credits the wallet.
   Body: { walletAddress: string, txHash: string }
─────────────────────────────────────────────── */
router.post("/credits/purchase", async (req: Request, res: Response): Promise<void> => {
  const OTR_CREDIT_POOL_ADDRESS = process.env.OTR_CREDIT_POOL_ADDRESS;

  if (!OTR_CREDIT_POOL_ADDRESS) {
    res.status(503).json({
      error: "CONTRACT_NOT_DEPLOYED",
      message: "OTRCreditPool contract not yet deployed.",
    });
    return;
  }

  const { walletAddress, txHash } = req.body as { walletAddress?: string; txHash?: string };
  if (!walletAddress || !txHash) {
    res.status(400).json({ error: "walletAddress and txHash required" });
    return;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    res.status(400).json({ error: "Invalid txHash format" });
    return;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    res.status(400).json({ error: "Invalid walletAddress format" });
    return;
  }

  const normalWallet = normalise(walletAddress);
  const normalHash   = txHash.toLowerCase() as Hex;

  // ── Duplicate-check: reject already-processed TX ──────────────────────────
  const [existing] = await db
    .select({ id: creditPurchasesTable.id })
    .from(creditPurchasesTable)
    .where(eq(creditPurchasesTable.txHash, normalHash));

  if (existing) {
    res.status(409).json({
      error: "TX_ALREADY_PROCESSED",
      message: "This transaction has already been credited.",
    });
    return;
  }

  // ── Verify on-chain ────────────────────────────────────────────────────────
  const chain  = getActiveChain();
  const client = createPublicClient({
    chain,
    transport: http(process.env.RPC_URL_OVERRIDE ?? chain.rpcUrls.default.http[0]),
  });

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: normalHash });
  } catch (err) {
    req.log.warn({ err, txHash }, "TX receipt fetch failed");
    res.status(422).json({
      error: "TX_NOT_FOUND",
      message: "Transaction not found on Robinhood Chain. It may still be pending.",
    });
    return;
  }

  if (!receipt) {
    res.status(422).json({ error: "TX_PENDING", message: "Transaction is still pending." });
    return;
  }

  if (receipt.status !== "success") {
    res.status(422).json({ error: "TX_FAILED", message: "Transaction reverted on-chain." });
    return;
  }

  // ── Verify destination is our contract ────────────────────────────────────
  const contractAddr = OTR_CREDIT_POOL_ADDRESS.toLowerCase();
  if (receipt.to?.toLowerCase() !== contractAddr) {
    res.status(422).json({
      error: "WRONG_CONTRACT",
      message: `Transaction was not sent to the OTRCreditPool contract.`,
    });
    return;
  }

  // ── Parse CreditPurchased event from logs ──────────────────────────────────
  let creditEvent: {
    buyer: string;
    otrAmount: bigint;
    chatsGranted: bigint;
    tier: number;
  } | null = null;

  for (const log of receipt.logs) {
    try {
      if (log.address.toLowerCase() !== contractAddr) continue;
      const decoded = decodeEventLog({
        abi:    CREDIT_PURCHASED_ABI,
        data:   log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName === "CreditPurchased") {
        const args = decoded.args as {
          buyer: string;
          otrAmount: bigint;
          chatsGranted: bigint;
          tier: number;
        };
        if (args.buyer.toLowerCase() === normalWallet) {
          creditEvent = {
            buyer:        args.buyer,
            otrAmount:    args.otrAmount,
            chatsGranted: args.chatsGranted,
            tier:         args.tier,
          };
          break;
        }
      }
    } catch {
      // not a CreditPurchased log — skip
    }
  }

  if (!creditEvent) {
    res.status(422).json({
      error: "EVENT_NOT_FOUND",
      message: "CreditPurchased event not found in this transaction for the given wallet.",
    });
    return;
  }

  const chatsGranted = Number(creditEvent.chatsGranted);
  const tierName     = TIER_NAMES[creditEvent.tier] ?? "custom";
  const otrAmount    = creditEvent.otrAmount.toString();
  const blockNumber  = receipt.blockNumber ? Number(receipt.blockNumber) : null;

  // ── Persist purchase + credit wallet (DB transaction) ─────────────────────
  try {
    await db.transaction(async (tx) => {
      // Insert purchase record
      await tx.insert(creditPurchasesTable).values({
        walletAddress: normalWallet,
        txHash:        normalHash,
        otrAmount,
        chatsGranted,
        tier:          tierName,
        blockNumber,
        status:        "confirmed",
      });

      // Credit the wallet: add chatsGranted to otrCredits
      const [row] = await tx
        .select()
        .from(chatCreditsTable)
        .where(eq(chatCreditsTable.walletAddress, normalWallet));

      if (row) {
        const newOtr = parseFloat(row.otrCredits ?? "0") + chatsGranted;
        await tx
          .update(chatCreditsTable)
          .set({ otrCredits: newOtr.toFixed(4), updatedAt: new Date() })
          .where(eq(chatCreditsTable.walletAddress, normalWallet));
      } else {
        await tx.insert(chatCreditsTable).values({
          walletAddress: normalWallet,
          otrCredits:    chatsGranted.toFixed(4),
        });
      }
    });
  } catch (err: any) {
    // Unique constraint on txHash — concurrent duplicate
    if (err?.code === "23505" || String(err).includes("unique")) {
      res.status(409).json({
        error: "TX_ALREADY_PROCESSED",
        message: "This transaction has already been credited.",
      });
      return;
    }
    req.log.error({ err }, "Credits purchase DB error");
    res.status(500).json({ error: "Internal error" });
    return;
  }

  req.log.info(
    { walletAddress: normalWallet, txHash, chatsGranted, tier: tierName },
    "Credit purchase confirmed"
  );

  res.json({
    success:      true,
    chatsGranted,
    tier:         tierName,
    otrAmount,
    txHash:       normalHash,
  });
});

/* ───────────────────────────────────────────────
   GET /api/credits/history/:walletAddress
   Returns full purchase history for a wallet, newest first.
─────────────────────────────────────────────── */
router.get("/credits/history/:walletAddress", async (req: Request, res: Response): Promise<void> => {
  const walletAddress = String(req.params.walletAddress ?? '');
  if (!walletAddress || walletAddress.length < 10) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(creditPurchasesTable)
      .where(eq(creditPurchasesTable.walletAddress, normalise(walletAddress)))
      .orderBy(desc(creditPurchasesTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Credits history error");
    res.status(500).json({ error: "Internal error" });
  }
});

export { getOrCreate, buildCreditView };
export default router;
