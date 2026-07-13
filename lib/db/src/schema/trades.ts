import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  tokenAddress: text("token_address").notNull(),
  trader: text("trader").notNull(),
  side: text("side").notNull(), // buy | sell
  virtualAmount: text("virtual_amount").notNull(), // $VIRTUAL amount as string
  tokenAmount: text("token_amount").notNull(),
  txHash: text("tx_hash").notNull(),
  blockNumber: integer("block_number").notNull().default(0),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
});

export const watchlistTable = pgTable("watchlist", {
  userId: integer("user_id").notNull(),
  tokenAddress: text("token_address").notNull(),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({ id: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
