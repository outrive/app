import { pgTable, text, serial, timestamp, numeric, integer, index } from "drizzle-orm/pg-core";

/* ── Protocol fee distribution epochs (24h) ──────────────────────────── */
export const distributionEventsTable = pgTable("distribution_events", {
  id:              serial("id").primaryKey(),
  epochNumber:     integer("epoch_number").notNull(),
  epochStart:      timestamp("epoch_start",   { withTimezone: true }).notNull(),
  epochEnd:        timestamp("epoch_end",     { withTimezone: true }).notNull(),
  totalVolumeUsd:  numeric("total_volume_usd", { precision: 28, scale: 4 }).notNull().default("0"),
  totalFeesUsd:    numeric("total_fees_usd",   { precision: 28, scale: 8 }).notNull().default("0"),
  totalFeesEth:    numeric("total_fees_eth",   { precision: 28, scale: 10 }).notNull().default("0"),
  eligibleWallets: integer("eligible_wallets").notNull().default(0),
  status:          text("status").notNull().default("pending"), // pending | distributed | failed
  distributedAt:   timestamp("distributed_at", { withTimezone: true }),
  txHash:          text("tx_hash"),
  createdAt:       timestamp("created_at",    { withTimezone: true }).notNull().defaultNow(),
});

/* ── Per-wallet allocation for each epoch ────────────────────────────── */
export const distributionAllocationsTable = pgTable("distribution_allocations", {
  id:            serial("id").primaryKey(),
  eventId:       integer("event_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  volumeUsd:     numeric("volume_usd",  { precision: 28, scale: 4 }).notNull().default("0"),
  shareBps:      integer("share_bps").notNull().default(0), // 10000 = 100%
  amountUsd:     numeric("amount_usd",  { precision: 28, scale: 8 }).notNull().default("0"),
  amountEth:     numeric("amount_eth",  { precision: 28, scale: 10 }).notNull().default("0"),
  claimedAt:     timestamp("claimed_at", { withTimezone: true }),
  claimTxHash:   text("claim_tx_hash"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("dist_alloc_event_idx").on(t.eventId),
  index("dist_alloc_wallet_idx").on(t.walletAddress),
]);

export type DistributionEvent      = typeof distributionEventsTable.$inferSelect;
export type DistributionAllocation = typeof distributionAllocationsTable.$inferSelect;
