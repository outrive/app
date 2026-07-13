import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";

export const chatCreditsTable = pgTable("chat_credits", {
  id:            serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),
  freeChatsUsed: integer("free_chats_used").notNull().default(0),
  otrCredits:    numeric("otr_credits", { precision: 18, scale: 4 }).notNull().default("0"),
  totalChats:    integer("total_chats").notNull().default(0),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChatCredits = typeof chatCreditsTable.$inferSelect;

export const FREE_CHAT_LIMIT = 10;
export const OTR_PER_CREDIT  = 1;     // 1 $OTR = 1 chat credit
export const CHATS_PER_OTR   = 1;     // 1 credit = 1 chat
