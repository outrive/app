import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { launchesTable, usersTable, tokensTable } from "@workspace/db";
import { eq, desc, isNull, isNotNull, and, not, like, ne } from "drizzle-orm";
import { ListLaunchesQueryParams, RecordLaunchBody } from "@workspace/api-zod";
import { getPublicClient } from "../lib/chains.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

/* ─────────────────────────────────────────────────────────────────────────────
   RECONCILER — periodically checks all pending launches against on-chain
   receipts and updates status (pending → confirmed / failed) + tokenAddress.
   Runs at startup and then every 30 s so newly confirmed TXs are picked up.
───────────────────────────────────────────────────────────────────────────── */
const TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_PADDED  = '0x0000000000000000000000000000000000000000000000000000000000000000';

let reconcilerRunning = false;

async function reconcilePendingLaunches(): Promise<void> {
  if (reconcilerRunning) return;
  reconcilerRunning = true;
  try {
    // All pending rows — regardless of whether tokenAddress is set
    const pending = await db
      .select()
      .from(launchesTable)
      .where(eq(launchesTable.status, 'pending'));

    if (pending.length === 0) return;
    logger.info({ count: pending.length }, "reconciler: checking pending launches");

    const client = getPublicClient();

    const THIRTY_MIN = 30 * 60 * 1000;
    const TX_HASH_RE = /^0x[0-9a-f]{64}$/i;

    for (const row of pending) {
      if (!row.txHash) continue;

      // Fast-fail: obviously invalid txHash (test data, malformed, etc.)
      if (!TX_HASH_RE.test(row.txHash)) {
        await db.update(launchesTable).set({ status: 'failed' }).where(eq(launchesTable.id, row.id));
        logger.warn({ id: row.id, txHash: row.txHash }, "reconciler: invalid txHash — marking failed");
        continue;
      }

      // Timeout: if pending for > 30 min with no receipt found, give up
      const ageMs = Date.now() - new Date(row.createdAt).getTime();
      if (ageMs > THIRTY_MIN) {
        await db.update(launchesTable).set({ status: 'failed' }).where(eq(launchesTable.id, row.id));
        logger.warn({ id: row.id, ageMin: Math.round(ageMs / 60_000) }, "reconciler: launch timed out — marking failed");
        continue;
      }

      try {
        const receipt = await client.getTransactionReceipt({
          hash: row.txHash as `0x${string}`,
        });

        // TX reverted / failed
        if (receipt.status === 'reverted') {
          await db
            .update(launchesTable)
            .set({ status: 'failed' })
            .where(eq(launchesTable.id, row.id));
          logger.info({ id: row.id, txHash: row.txHash }, "reconciler: launch failed (reverted)");
          continue;
        }

        // TX succeeded — try to extract token address from mint Transfer(from=0x0) if not already set
        let tokenAddress = row.tokenAddress ?? null;
        if (!tokenAddress) {
          for (const log of receipt.logs) {
            if (
              log.topics[0]?.toLowerCase() === TRANSFER_SIG &&
              log.topics[1]?.toLowerCase() === ZERO_PADDED
            ) {
              tokenAddress = log.address.toLowerCase();
              break;
            }
          }
        }

        // Mark confirmed regardless of whether we found tokenAddress
        await db
          .update(launchesTable)
          .set({
            status: 'confirmed',
            ...(tokenAddress ? { tokenAddress } : {}),
          })
          .where(eq(launchesTable.id, row.id));
        logger.info({ id: row.id, tokenAddress }, "reconciler: launch confirmed");

      } catch {
        // Receipt not found yet — TX still pending on-chain, will retry next interval
      }
    }
  } finally {
    reconcilerRunning = false;
  }
}

// Run at startup, then every 30 s
reconcilePendingLaunches().catch(() => {});
setInterval(() => reconcilePendingLaunches().catch(() => {}), 30_000);

/* ─────────────────────────────────────────────────────────────────────────────
   ROUTES
───────────────────────────────────────────────────────────────────────────── */
// Map a tokensTable row into a launch-compatible shape so the frontend can render it
function tokenToLaunch(t: typeof tokensTable.$inferSelect) {
  return {
    id:           -(Math.abs(parseInt(t.address.replace(/[^0-9a-f]/gi, "").slice(0, 8) || "1", 16)) || 0),
    walletAddress: t.creator,
    tokenAddress:  t.address,
    name:          t.name,
    ticker:        t.ticker,
    imageUri:      t.imageUri ?? null,
    txHash:        t.txHash ?? "",
    blockNumber:   t.createdBlock ?? null,
    network:       t.network,
    status:        "confirmed" as const,
    createdAt:     t.createdAt,
  };
}

router.get("/launches", async (req, res): Promise<void> => {
  const params = ListLaunchesQueryParams.safeParse(req.query);
  const walletAddress = params.success ? params.data.walletAddress : undefined;
  const limit = params.success ? (params.data.limit ?? 20) : 20;
  const cap = Math.min(limit, 100);

  // Query launchesTable (frontend-recorded)
  const launchRows = walletAddress
    ? await db
        .select()
        .from(launchesTable)
        .where(eq(launchesTable.walletAddress, walletAddress.toLowerCase()))
        .orderBy(desc(launchesTable.createdAt))
        .limit(cap)
    : await db
        .select()
        .from(launchesTable)
        .orderBy(desc(launchesTable.createdAt))
        .limit(cap);

  // Also query tokensTable (on-chain indexed) to catch launches that bypassed the frontend
  const tokenRows = walletAddress
    ? await db
        .select()
        .from(tokensTable)
        .where(
          and(
            eq(tokensTable.creator, walletAddress.toLowerCase()),
            not(like(tokensTable.address, "app-%")),
            ne(tokensTable.creator, "0x0000000000000000000000000000000000000000")
          )
        )
        .orderBy(desc(tokensTable.createdAt))
        .limit(cap)
    : await db
        .select()
        .from(tokensTable)
        .where(
          and(
            not(like(tokensTable.address, "app-%")),
            ne(tokensTable.creator, "0x0000000000000000000000000000000000000000")
          )
        )
        .orderBy(desc(tokensTable.createdAt))
        .limit(cap);

  // Merge: prefer launchesTable rows (they have richer data); fill gaps from tokensTable
  const seenAddresses = new Set(launchRows.map(l => l.tokenAddress?.toLowerCase()).filter(Boolean));
  const merged = [
    ...launchRows,
    ...tokenRows
      .filter(t => !seenAddresses.has(t.address.toLowerCase()))
      .map(tokenToLaunch),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, cap);

  res.json(merged);
});

/* GET /launches/addresses — all token addresses launched via OUTRIVE (backfill-augmented). */
router.get("/launches/addresses", async (_req, res): Promise<void> => {
  reconcilePendingLaunches().catch(() => {});
  const rows = await db
    .select({ tokenAddress: launchesTable.tokenAddress })
    .from(launchesTable)
    .where(isNotNull(launchesTable.tokenAddress))
    .orderBy(desc(launchesTable.createdAt));
  const addresses = rows.map(r => r.tokenAddress!.toLowerCase()).filter(Boolean);
  res.json({ addresses });
});

/* GET /launches/creators — all unique creator wallets that have ever launched via OUTRIVE.
   This is the primary filter for the ▲ OUTRIVE tab: match token.creator against these wallets.
   Sources: launchesTable (frontend-recorded) + tokensTable (on-chain indexed). */
router.get("/launches/creators", async (_req, res): Promise<void> => {
  const [launchRows, tokenRows] = await Promise.all([
    db.select({ walletAddress: launchesTable.walletAddress }).from(launchesTable),
    db
      .select({ creator: tokensTable.creator })
      .from(tokensTable)
      .where(
        and(
          not(like(tokensTable.address, "app-%")),
          ne(tokensTable.creator, "0x0000000000000000000000000000000000000000"),
          ne(tokensTable.creator, "")
        )
      ),
  ]);
  const creators = [
    ...new Set([
      ...launchRows.map(r => r.walletAddress.toLowerCase()),
      ...tokenRows.map(r => r.creator.toLowerCase()),
    ]),
  ];
  res.json({ creators });
});

router.post("/launches", async (req, res): Promise<void> => {
  const parsed = RecordLaunchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;

  await db
    .insert(usersTable)
    .values({ walletAddress: data.walletAddress.toLowerCase() })
    .onConflictDoNothing();

  const [launch] = await db
    .insert(launchesTable)
    .values({
      walletAddress: data.walletAddress.toLowerCase(),
      tokenAddress: data.tokenAddress ?? null,
      name: data.name,
      ticker: data.ticker,
      imageUri: data.imageUri ?? null,
      txHash: data.txHash,
      blockNumber: data.blockNumber ?? null,
      network: data.network,
      status: "pending",
    })
    .returning();

  res.status(201).json(launch);
});

export default router;
