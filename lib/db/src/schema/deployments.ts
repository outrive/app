import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const deploymentsTable = pgTable("deployments", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  tokenAddress: text("token_address").unique(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  imageUri: text("image_uri"),
  txHash: text("tx_hash").notNull(),
  blockNumber: integer("block_number"),
  network: text("network").notNull().default("testnet"),
  status: text("status").notNull().default("pending"), // pending | confirmed | failed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDeploymentSchema = createInsertSchema(deploymentsTable).omit({ id: true, createdAt: true });
export type InsertDeployment = z.infer<typeof insertDeploymentSchema>;
export type Deployment = typeof deploymentsTable.$inferSelect;
