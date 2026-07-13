import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const launchesTable = pgTable("launches", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  tokenAddress: text("token_address").unique(),
  name: text("name").notNull(),
  ticker: text("ticker").notNull(),
  imageUri: text("image_uri"),
  txHash: text("tx_hash").notNull(),
  blockNumber: integer("block_number"),
  network: text("network").notNull().default("mainnet"),
  status: text("status").notNull().default("pending"), // pending | confirmed | failed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLaunchSchema = createInsertSchema(launchesTable).omit({ id: true, createdAt: true });
export type InsertLaunch = z.infer<typeof insertLaunchSchema>;
export type Launch = typeof launchesTable.$inferSelect;
