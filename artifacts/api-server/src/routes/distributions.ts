/**
 * /api/distributions — Protocol fee distribution engine
 *
 * Revenue model:
 *   FEE_RATE = 0.3 % of each confirmed RWA trade's total_usd
 *   Epoch    = 24-hour UTC day (00:00 → 23:59:59)
 *   Eligible = wallets with ≥1 confirmed RWA trade in the epoch
 *   Allocation: proportional to each wallet's volume in the epoch
 *
 * Tables are self-migrated on first import (CREATE TABLE IF NOT EXISTS).
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();
const FEE_RATE = 0.003; // 0.3 %

/* ── Cached ETH price (reuse from rwa module pattern) ─────────────────── */
let _ethPriceUsd = 2_450;  // sensible default; refreshed below
async function getEthPrice(): Promise<number> {
  try {
    const r = await pool.query<{ price_usd: string }>(
      `SELECT price_usd FROM eth_price_cache ORDER BY fetched_at DESC LIMIT 1`,
    );
    if (r.rows[0]) _ethPriceUsd = parseFloat(r.rows[0].price_usd) || _ethPriceUsd;
  } catch { /* no eth_price_cache table yet — use default */ }
  return _ethPriceUsd;
}

/* ── Self-migration ──────────────────────────────────────────────────── */
async function migrateDistributions() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS distribution_events (
      id               SERIAL PRIMARY KEY,
      epoch_number     INTEGER       NOT NULL,
      epoch_start      TIMESTAMPTZ   NOT NULL,
      epoch_end        TIMESTAMPTZ   NOT NULL,
      total_volume_usd NUMERIC(28,4) NOT NULL DEFAULT 0,
      total_fees_usd   NUMERIC(28,8) NOT NULL DEFAULT 0,
      total_fees_eth   NUMERIC(28,10) NOT NULL DEFAULT 0,
      eligible_wallets INTEGER       NOT NULL DEFAULT 0,
      status           TEXT          NOT NULL DEFAULT 'pending',
      distributed_at   TIMESTAMPTZ,
      tx_hash          TEXT,
      created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      UNIQUE (epoch_start)
    );

    CREATE TABLE IF NOT EXISTS distribution_allocations (
      id             SERIAL PRIMARY KEY,
      event_id       INTEGER        NOT NULL REFERENCES distribution_events(id),
      wallet_address TEXT           NOT NULL,
      volume_usd     NUMERIC(28,4)  NOT NULL DEFAULT 0,
      share_bps      INTEGER        NOT NULL DEFAULT 0,
      amount_usd     NUMERIC(28,8)  NOT NULL DEFAULT 0,
      amount_eth     NUMERIC(28,10) NOT NULL DEFAULT 0,
      claimed_at     TIMESTAMPTZ,
      claim_tx_hash  TEXT,
      created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS dist_alloc_event_idx  ON distribution_allocations(event_id);
    CREATE INDEX IF NOT EXISTS dist_alloc_wallet_idx ON distribution_allocations(wallet_address);
  `);
}

/* ── Backfill epochs from historical rwa_trades ──────────────────────── */
async function backfillEpochs() {
  const ethPrice = await getEthPrice();

  // Epochs derived from confirmed trade days not yet in distribution_events
  const res = await pool.query<{
    epoch_day: Date;
    total_volume: string;
    wallets: string;
  }>(`
    SELECT
      DATE_TRUNC('day', rt.created_at AT TIME ZONE 'UTC') AS epoch_day,
      SUM(rt.total_usd::numeric)                          AS total_volume,
      COUNT(DISTINCT rt.wallet_address)                   AS wallets
    FROM rwa_trades rt
    WHERE rt.status = 'confirmed'
    GROUP BY DATE_TRUNC('day', rt.created_at AT TIME ZONE 'UTC')
    ORDER BY epoch_day ASC
  `);

  if (res.rows.length === 0) return;

  // epoch 1 = first trading day in history
  const firstDay = new Date(res.rows[0].epoch_day);

  for (const row of res.rows) {
    const epochStart = new Date(row.epoch_day);
    const epochEnd   = new Date(epochStart);
    epochEnd.setUTCDate(epochEnd.getUTCDate() + 1);

    const epochNum   = Math.round(
      (epochStart.getTime() - firstDay.getTime()) / 86_400_000,
    ) + 1;

    const volumeUsd  = parseFloat(row.total_volume) || 0;
    const feesUsd    = volumeUsd * FEE_RATE;
    const feesEth    = feesUsd / ethPrice;
    const wallets    = parseInt(row.wallets, 10) || 0;
    const isPast     = epochEnd < new Date();
    const status     = isPast ? "distributed" : "pending";
    const distAt     = isPast ? epochEnd.toISOString() : null;

    await pool.query(`
      INSERT INTO distribution_events
        (epoch_number, epoch_start, epoch_end, total_volume_usd, total_fees_usd, total_fees_eth,
         eligible_wallets, status, distributed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (epoch_start) DO UPDATE SET
        total_volume_usd = EXCLUDED.total_volume_usd,
        total_fees_usd   = EXCLUDED.total_fees_usd,
        total_fees_eth   = EXCLUDED.total_fees_eth,
        eligible_wallets = EXCLUDED.eligible_wallets,
        status           = EXCLUDED.status,
        distributed_at   = EXCLUDED.distributed_at
    `, [epochNum, epochStart.toISOString(), epochEnd.toISOString(),
        feesUsd / FEE_RATE, feesUsd, feesEth, wallets, status, distAt]);
  }
}

/* ── Boot-time init ──────────────────────────────────────────────────── */
(async () => {
  try {
    await migrateDistributions();
    await backfillEpochs();
  } catch (err) {
    console.error("[distributions] boot init error:", err);
  }
})();

/* ── Helpers ─────────────────────────────────────────────────────────── */
function fmt2(n: number) { return n.toFixed(2); }
function fmt6(n: number) { return n.toFixed(6); }
function normalise(addr: string) { return addr.toLowerCase().trim(); }

/* Next midnight UTC */
function nextEpochStart(): Date {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next;
}

/* ──────────────────────────────────────────────────────────────────────
   GET /api/distributions/stats
   Cumulative totals + 30-day bar chart data
────────────────────────────────────────────────────────────────────── */
router.get("/distributions/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    await backfillEpochs();
    const ethPrice = await getEthPrice();

    // Cumulative distributed (past epochs only)
    const cumRes = await pool.query<{
      cumulative_usd: string; cumulative_eth: string; total_events: string;
    }>(`
      SELECT
        COALESCE(SUM(total_fees_usd), 0)  AS cumulative_usd,
        COALESCE(SUM(total_fees_eth), 0)  AS cumulative_eth,
        COUNT(*)                           AS total_events
      FROM distribution_events
      WHERE status = 'distributed'
    `);

    // Today's live activity
    const todayRes = await pool.query<{
      today_volume: string; today_wallets: string;
    }>(`
      SELECT
        COALESCE(SUM(total_usd::numeric), 0) AS today_volume,
        COUNT(DISTINCT wallet_address)         AS today_wallets
      FROM rwa_trades
      WHERE status = 'confirmed'
        AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
    `);

    const todayVolume  = parseFloat(todayRes.rows[0]?.today_volume ?? "0");
    const todayFeesUsd = todayVolume * FEE_RATE;
    const todayFeesEth = todayFeesUsd / ethPrice;
    const todayWallets = parseInt(todayRes.rows[0]?.today_wallets ?? "0", 10);

    // All-time eligible wallets
    const walletsRes = await pool.query<{ total: string }>(`
      SELECT COUNT(DISTINCT wallet_address) AS total FROM rwa_trades WHERE status = 'confirmed'
    `);

    // 30-day bar chart data (group by day)
    const chartRes = await pool.query<{
      day: Date; fees_usd: string; fees_eth: string; wallets: string;
    }>(`
      SELECT
        DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')   AS day,
        SUM(total_usd::numeric) * ${FEE_RATE}              AS fees_usd,
        SUM(total_usd::numeric) * ${FEE_RATE} / ${ethPrice} AS fees_eth,
        COUNT(DISTINCT wallet_address)                       AS wallets
      FROM rwa_trades
      WHERE status = 'confirmed'
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')
      ORDER BY day ASC
    `);

    const cr = cumRes.rows[0];
    res.json({
      cumulativeUsd:   parseFloat(cr?.cumulative_usd ?? "0"),
      cumulativeEth:   parseFloat(cr?.cumulative_eth ?? "0"),
      totalEvents:     parseInt(cr?.total_events ?? "0", 10),
      todayFeesUsd,
      todayFeesEth,
      todayWallets,
      totalEligible:   parseInt(walletsRes.rows[0]?.total ?? "0", 10),
      ethPriceUsd:     ethPrice,
      chart: chartRes.rows.map(r => ({
        day:      r.day,
        feesUsd:  parseFloat(r.fees_usd),
        feesEth:  parseFloat(r.fees_eth),
        wallets:  parseInt(r.wallets, 10),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "distributions/stats error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ──────────────────────────────────────────────────────────────────────
   GET /api/distributions
   Paginated distribution event list
────────────────────────────────────────────────────────────────────── */
router.get("/distributions", async (req: Request, res: Response): Promise<void> => {
  try {
    await backfillEpochs();
    const limit  = Math.min(parseInt(req.query.limit  as string || "30", 10), 100);
    const offset = Math.max(parseInt(req.query.offset as string || "0",  10), 0);

    const evRes = await pool.query<{
      id: number; epoch_number: number; epoch_start: Date; epoch_end: Date;
      total_volume_usd: string; total_fees_usd: string; total_fees_eth: string;
      eligible_wallets: number; status: string; distributed_at: Date | null;
      tx_hash: string | null;
    }>(`
      SELECT id, epoch_number, epoch_start, epoch_end,
             total_volume_usd, total_fees_usd, total_fees_eth,
             eligible_wallets, status, distributed_at, tx_hash
      FROM distribution_events
      ORDER BY epoch_start DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const totalRes = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM distribution_events`
    );

    // For each event, fetch top symbols traded in that epoch
    const events = await Promise.all(evRes.rows.map(async (ev) => {
      const symRes = await pool.query<{ symbol: string; vol: string; token_address: string }>(`
        SELECT symbol, SUM(total_usd::numeric) AS vol, MAX(token_address) AS token_address
        FROM rwa_trades
        WHERE status = 'confirmed'
          AND created_at >= $1 AND created_at < $2
        GROUP BY symbol ORDER BY vol DESC LIMIT 6
      `, [ev.epoch_start, ev.epoch_end]);

      return {
        id:             ev.id,
        epochNumber:    ev.epoch_number,
        epochStart:     ev.epoch_start,
        epochEnd:       ev.epoch_end,
        totalVolumeUsd: parseFloat(ev.total_volume_usd),
        totalFeesUsd:   parseFloat(ev.total_fees_usd),
        totalFeesEth:   parseFloat(ev.total_fees_eth),
        eligibleWallets: ev.eligible_wallets,
        status:         ev.status,
        distributedAt:  ev.distributed_at,
        txHash:         ev.tx_hash,
        topSymbols:     symRes.rows.map(r => ({
          symbol: r.symbol,
          volUsd: parseFloat(r.vol),
          tokenAddress: r.token_address,
        })),
      };
    }));

    res.json({ events, total: parseInt(totalRes.rows[0]?.total ?? "0", 10) });
  } catch (err) {
    req.log.error({ err }, "distributions list error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ──────────────────────────────────────────────────────────────────────
   GET /api/distributions/next
   Seconds until next epoch + estimated pool size
────────────────────────────────────────────────────────────────────── */
router.get("/distributions/next", async (req: Request, res: Response): Promise<void> => {
  try {
    const next = nextEpochStart();
    const secondsUntil = Math.max(0, Math.floor((next.getTime() - Date.now()) / 1000));

    // Today's pending pool
    const todayRes = await pool.query<{ today_fees: string }>(`
      SELECT COALESCE(SUM(total_usd::numeric) * ${FEE_RATE}, 0) AS today_fees
      FROM rwa_trades
      WHERE status = 'confirmed'
        AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
    `);
    const estimatedPoolUsd = parseFloat(todayRes.rows[0]?.today_fees ?? "0");

    res.json({ secondsUntil, nextAt: next.toISOString(), estimatedPoolUsd });
  } catch (err) {
    req.log.error({ err }, "distributions/next error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ──────────────────────────────────────────────────────────────────────
   GET /api/distributions/allocation/:wallet
   Historical and claimable allocation for a wallet
────────────────────────────────────────────────────────────────────── */
router.get("/distributions/allocation/:wallet", async (req: Request, res: Response): Promise<void> => {
  const wallet = normalise(req.params.wallet ?? "");
  if (!wallet || wallet.length < 10) {
    res.status(400).json({ error: "Invalid wallet" });
    return;
  }
  try {
    const ethPrice = await getEthPrice();

    // Wallet's volume per epoch (real data from rwa_trades)
    const volRes = await pool.query<{
      epoch_start: Date; epoch_end: Date;
      wallet_volume: string; total_volume: string; event_id: number | null;
    }>(`
      SELECT
        DATE_TRUNC('day', rt.created_at AT TIME ZONE 'UTC') AS epoch_start,
        DATE_TRUNC('day', rt.created_at AT TIME ZONE 'UTC') + INTERVAL '1 day' AS epoch_end,
        SUM(rt.total_usd::numeric) FILTER (WHERE rt.wallet_address = $1) AS wallet_volume,
        SUM(rt.total_usd::numeric) AS total_volume,
        de.id AS event_id
      FROM rwa_trades rt
      LEFT JOIN distribution_events de
        ON DATE_TRUNC('day', rt.created_at AT TIME ZONE 'UTC') = de.epoch_start
      WHERE rt.status = 'confirmed'
      GROUP BY DATE_TRUNC('day', rt.created_at AT TIME ZONE 'UTC'), de.id
      HAVING SUM(rt.total_usd::numeric) FILTER (WHERE rt.wallet_address = $1) > 0
      ORDER BY epoch_start DESC
      LIMIT 20
    `, [wallet]);

    const allocations = volRes.rows.map(row => {
      const walletVol  = parseFloat(row.wallet_volume ?? "0");
      const totalVol   = parseFloat(row.total_volume  ?? "0");
      const shareBps   = totalVol > 0 ? Math.round((walletVol / totalVol) * 10_000) : 0;
      const feesUsd    = totalVol * FEE_RATE;
      const amountUsd  = feesUsd * (shareBps / 10_000);
      const amountEth  = amountUsd / ethPrice;
      const isPast     = new Date(row.epoch_end) < new Date();
      return {
        epochStart:  row.epoch_start,
        epochEnd:    row.epoch_end,
        volumeUsd:   walletVol,
        shareBps,
        amountUsd,
        amountEth:   fmt6(amountEth),
        status:      isPast ? "distributed" : "pending",
        claimable:   isPast,
      };
    });

    const totalClaimableUsd = allocations
      .filter(a => a.claimable)
      .reduce((s, a) => s + a.amountUsd, 0);

    res.json({ wallet, allocations, totalClaimableUsd });
  } catch (err) {
    req.log.error({ err }, "distributions/allocation error");
    res.status(500).json({ error: "Internal error" });
  }
});

/* ──────────────────────────────────────────────────────────────────────
   GET /api/distributions/fee-activity
   Recent per-trade fee events (for "treasury activity" table)
────────────────────────────────────────────────────────────────────── */
router.get("/distributions/fee-activity", async (req: Request, res: Response): Promise<void> => {
  try {
    const ethPrice = await getEthPrice();
    const res2 = await pool.query<{
      created_at: Date; wallet_address: string; symbol: string;
      total_usd: string; tx_hash: string | null;
    }>(`
      SELECT created_at, wallet_address, symbol, total_usd, tx_hash
      FROM rwa_trades
      WHERE status = 'confirmed'
      ORDER BY created_at DESC
      LIMIT 30
    `);
    const rows = res2.rows.map(r => ({
      time:          r.created_at,
      walletAddress: r.wallet_address,
      symbol:        r.symbol,
      feeUsd:        parseFloat(r.total_usd) * FEE_RATE,
      feeEth:        (parseFloat(r.total_usd) * FEE_RATE) / ethPrice,
      txHash:        r.tx_hash,
    }));
    res.json({ activities: rows });
  } catch (err) {
    req.log.error({ err }, "distributions/fee-activity error");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
