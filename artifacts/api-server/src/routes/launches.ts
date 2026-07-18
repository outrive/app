import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { launchesTable, usersTable, tokensTable } from "@workspace/db";
import { eq, desc, isNull, isNotNull, and, not, like, ne } from "drizzle-orm";
import { ListLaunchesQueryParams, RecordLaunchBody } from "@workspace/api-zod";
import { getPublicClient } from "../lib/chains.js";
import { logger } from "../lib/logger.js";
import { cacheGet } from "../lib/cache.js";

const router: IRouter = Router();

/* ─────────────────────────────────────────────────────────────────────────────
   RECONCILER — periodically checks all pending launches against on-chain
   receipts and updates status (pending → confirmed / failed) + tokenAddress.
   Runs at startup and then every 30 s so newly confirmed TXs are picked up.
───────────────────────────────────────────────────────────────────────────── */
const TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_PADDED  = '0x0000000000000000000000000000000000000000000000000000000000000000';

let reconcilerRunning = false;

const TX_HASH_RE  = /^0x[0-9a-f]{64}$/i;
const ONE_HOUR_MS = 60 * 60 * 1000;        // give up after 1 h — no real tx takes longer

const VIRTUALS_BASE = 'https://api.virtuals.io/api';

async function reconcilePendingLaunches(): Promise<void> {
  if (reconcilerRunning) return;
  reconcilerRunning = true;
  try {
    const client = getPublicClient();

    /* ── Pass 1: fix incorrectly-failed rows that already have a tokenAddress ──
       These were marked failed by a previous buggy reconciler timeout but are
       actually confirmed on-chain (token address is known).                     */
    const wronglyFailed = await db
      .select()
      .from(launchesTable)
      .where(and(eq(launchesTable.status, 'failed'), isNotNull(launchesTable.tokenAddress)));

    for (const row of wronglyFailed) {
      if (!row.tokenAddress) continue;
      await db
        .update(launchesTable)
        .set({ status: 'confirmed' })
        .where(eq(launchesTable.id, row.id));
      logger.info({ id: row.id, name: row.name, tokenAddress: row.tokenAddress },
        "reconciler: corrected wrongly-failed launch → confirmed");
    }

    /* ── Pass 2: check genuinely pending rows against on-chain receipts ──────── */
    const pending = await db
      .select()
      .from(launchesTable)
      .where(eq(launchesTable.status, 'pending'));

    if (pending.length === 0) return;
    logger.info({ count: pending.length }, "reconciler: checking pending launches");

    for (const row of pending) {
      if (!row.txHash) continue;

      // Reject obviously malformed txHash immediately (don't touch valid-looking ones)
      if (!TX_HASH_RE.test(row.txHash)) {
        await db.update(launchesTable).set({ status: 'failed' }).where(eq(launchesTable.id, row.id));
        logger.warn({ id: row.id, txHash: row.txHash }, "reconciler: malformed txHash — marking failed");
        continue;
      }

      // If tokenAddress is already known, just mark confirmed — no need to check receipt
      if (row.tokenAddress) {
        await db
          .update(launchesTable)
          .set({ status: 'confirmed' })
          .where(eq(launchesTable.id, row.id));
        logger.info({ id: row.id, tokenAddress: row.tokenAddress }, "reconciler: tokenAddress already set — confirmed");
        continue;
      }

      try {
        const receipt = await client.getTransactionReceipt({
          hash: row.txHash as `0x${string}`,
        });

        if (receipt.status === 'reverted') {
          await db.update(launchesTable).set({ status: 'failed' }).where(eq(launchesTable.id, row.id));
          logger.info({ id: row.id }, "reconciler: tx reverted — failed");
          continue;
        }

        // Try to extract token address from mint Transfer(from=0x0)
        let tokenAddress: string | null = null;
        for (const log of receipt.logs) {
          if (
            log.topics[0]?.toLowerCase() === TRANSFER_SIG &&
            log.topics[1]?.toLowerCase() === ZERO_PADDED
          ) {
            tokenAddress = log.address.toLowerCase();
            break;
          }
        }

        await db
          .update(launchesTable)
          .set({ status: 'confirmed', ...(tokenAddress ? { tokenAddress } : {}) })
          .where(eq(launchesTable.id, row.id));
        logger.info({ id: row.id, tokenAddress }, "reconciler: launch confirmed");

      } catch {
        // Receipt not found yet — TX still pending or invalid.
        // Give up after 1 h: no real Robinhood Chain tx stays unconfirmed that long.
        const ageMs = Date.now() - new Date(row.createdAt).getTime();
        if (ageMs > ONE_HOUR_MS) {
          await db.update(launchesTable).set({ status: 'failed' }).where(eq(launchesTable.id, row.id));
          logger.warn({ id: row.id, ageH: Math.round(ageMs / 3_600_000) },
            "reconciler: no receipt after 1h — marking failed");
        }
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
   IMAGE ENRICHER — backfills imageUri for confirmed launches that have a
   tokenAddress but no image yet. Fetches directly from Virtuals API and
   persists to DB so the next GET /launches serves it immediately.
───────────────────────────────────────────────────────────────────────────── */
async function enrichMissingImages(): Promise<void> {
  const rows = await db
    .select()
    .from(launchesTable)
    .where(and(
      eq(launchesTable.status, 'confirmed'),
      isNotNull(launchesTable.tokenAddress),
      isNull(launchesTable.imageUri),
    ))
    .limit(20);

  for (const row of rows) {
    if (!row.tokenAddress) continue;
    try {
      const p = new URLSearchParams();
      p.set('pagination[pageSize]', '5');
      p.set('filters[tokenAddress][$eqi]', row.tokenAddress);
      const r = await fetch(`${VIRTUALS_BASE}/virtuals?${p}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'OUTRIVE/1.0' },
        signal: AbortSignal.timeout(5_000),
      });
      if (!r.ok) continue;
      const j = await r.json() as { data: Array<{ tokenAddress?: string; preToken?: string; image?: { url?: string } | null }> };
      const addr = row.tokenAddress.toLowerCase();
      const match = (j.data ?? []).find(item =>
        (item.tokenAddress ?? '').toLowerCase() === addr ||
        (item.preToken     ?? '').toLowerCase() === addr
      );
      if (match?.image?.url) {
        await db.update(launchesTable)
          .set({ imageUri: match.image.url })
          .where(eq(launchesTable.id, row.id));
        logger.info({ id: row.id, tokenAddress: row.tokenAddress }, 'image-enricher: imageUri saved');
      }
    } catch { /* silently skip — retry next cycle */ }
    // 300 ms gap to avoid hammering Virtuals API
    await new Promise(res => setTimeout(res, 300));
  }
}

// Run image enricher 10 s after boot (give reconciler time to confirm first),
// then every 5 min.
setTimeout(() => enrichMissingImages().catch(() => {}), 10_000);
setInterval(() => enrichMissingImages().catch(() => {}), 5 * 60_000);

/* ─────────────────────────────────────────────────────────────────────────────
   ROUTES
───────────────────────────────────────────────────────────────────────────── */
router.get("/launches", async (req, res): Promise<void> => {
  const params = ListLaunchesQueryParams.safeParse(req.query);
  const walletAddress = params.success ? params.data.walletAddress : undefined;
  const limit = params.success ? (params.data.limit ?? 50) : 50;
  const cap = Math.min(limit, 500);

  // Source: launchesTable — rows inserted by the chat agent flow via POST /launches.
  // This is the canonical record of tokens launched through the OUTRIVE chat interface.
  const rows = walletAddress
    ? await db.select().from(launchesTable)
        .where(eq(launchesTable.walletAddress, walletAddress.toLowerCase()))
        .orderBy(desc(launchesTable.createdAt)).limit(cap)
    : await db.select().from(launchesTable)
        .orderBy(desc(launchesTable.createdAt)).limit(cap);

  // Enrich imageUri from Virtuals API cache (zero extra API calls when cache is warm).
  // The cache is populated by GET /api/virtuals/token-by-address/:address calls.
  type CachedToken = { image?: string | null };
  const enriched = rows.map(row => {
    if (row.tokenAddress && !row.imageUri) {
      const tok = cacheGet<CachedToken>(`virtuals:by-addr:${row.tokenAddress.toLowerCase()}`);
      if (tok?.image) return { ...row, imageUri: tok.image };
    }
    return row;
  });

  res.json(enriched);
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
