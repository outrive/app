import { pgTable, text, serial, timestamp, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const rwaLimitOrdersTable = pgTable(
  "rwa_limit_orders",
  {
    id:             serial("id").primaryKey(),
    walletAddress:  text("wallet_address").notNull(),
    symbol:         text("symbol").notNull(),           // NVDA, AAPL, etc.
    tokenAddress:   text("token_address").notNull(),
    name:           text("name").notNull(),
    side:           text("side").notNull(),             // buy | sell
    targetPriceUsd: numeric("target_price_usd", { precision: 18, scale: 4 }).notNull(),
    qtyEth:         numeric("qty_eth",    { precision: 28, scale: 8 }),  // for buy: ETH to spend
    qtyShares:      numeric("qty_shares", { precision: 28, scale: 8 }),  // for sell: shares to sell
    status:         text("status").notNull().default("pending"), // pending|triggered|executed|cancelled|expired
    triggeredAt:    timestamp("triggered_at",  { withTimezone: true }),
    expiresAt:      timestamp("expires_at",    { withTimezone: true }),   // null = never expires
    createdAt:      timestamp("created_at",    { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rwa_limit_orders_wallet_idx").on(t.walletAddress)],
);

export type RwaLimitOrder    = typeof rwaLimitOrdersTable.$inferSelect;
export type RwaLimitOrderNew = typeof rwaLimitOrdersTable.$inferInsert;

export const insertRwaLimitOrderSchema = createInsertSchema(rwaLimitOrdersTable).omit({
  id: true, createdAt: true, triggeredAt: true, status: true,
});
export type InsertRwaLimitOrder = z.infer<typeof insertRwaLimitOrderSchema>;
