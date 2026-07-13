import { pgTable, text, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tokensTable = pgTable("tokens", {
  address: text("address").primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull().default(""),   // legacy column — mirrors ticker; kept for DB compat
  ticker: text("ticker").notNull(),
  creator: text("creator").notNull(),
  createdBlock: integer("created_block").notNull().default(0),
  network: text("network").notNull().default("mainnet"),
  imageUri: text("image_uri"),
  txHash: text("tx_hash"),
  lastPriceVirtual: text("last_price_virtual"), // $VIRTUAL price as string
  raisedVirtual: text("raised_virtual").default("0"),  // total $VIRTUAL raised on curve
  volume24h: text("volume_24h").default("0"),
  holders: integer("holders").default(0),
  curveProgress: real("curve_progress").default(0), // 0-100 percent toward 42k $VIRTUAL
  phase: text("phase").notNull().default("PROTOTYPE"), // PROTOTYPE | GRADUATED
  graduatedAt: timestamp("graduated_at", { withTimezone: true }),
  priceChange24h: real("price_change_24h"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTokenSchema = createInsertSchema(tokensTable).omit({ updatedAt: true, createdAt: true });
export type InsertToken = z.infer<typeof insertTokenSchema>;
export type Token = typeof tokensTable.$inferSelect;
