import { pgTable, text, serial, timestamp, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const rwaTradesTable = pgTable(
  "rwa_trades",
  {
    id:           serial("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    symbol:       text("symbol").notNull(),        // AAPL, NVDA, etc.
    tokenAddress: text("token_address").notNull(), // ERC-20 on Robinhood Chain
    name:         text("name").notNull(),
    side:         text("side").notNull(),          // buy | sell
    shares:       numeric("shares",   { precision: 28, scale: 8 }).notNull(),
    priceUsd:     numeric("price_usd",{ precision: 18, scale: 4 }).notNull(),
    ethAmount:    numeric("eth_amount",{ precision: 28, scale: 8 }).notNull(),
    totalUsd:     numeric("total_usd", { precision: 18, scale: 4 }).notNull(),
    txHash:       text("tx_hash"),              // null until confirmed
    status:       text("status").notNull().default("pending"),  // pending|confirmed|failed
    source:       text("source").notNull().default("manual"),   // manual|agent
    network:      text("network").notNull().default("mainnet"),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rwa_trades_wallet_idx").on(t.walletAddress)],
);

export type RwaTrade    = typeof rwaTradesTable.$inferSelect;
export type RwaTradeNew = typeof rwaTradesTable.$inferInsert;

export const insertRwaTradeSchema = createInsertSchema(rwaTradesTable).omit({
  id: true, createdAt: true,
});
export type InsertRwaTrade = z.infer<typeof insertRwaTradeSchema>;
