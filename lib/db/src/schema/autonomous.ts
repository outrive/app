import {
  pgTable, text, serial, timestamp, numeric, integer, boolean, index,
} from "drizzle-orm/pg-core";

/* ── Agent Vault — one row per connected wallet ───────────────────────── */
export const agentVaultsTable = pgTable("agent_vaults", {
  id:             serial("id").primaryKey(),
  walletAddress:  text("wallet_address").notNull().unique(),
  agentAddress:   text("agent_address"),            // derived from user's PK, stored for display
  pkHint:         text("pk_hint"),                  // e.g. "0x1a2b...ef3c" — first6+last4 of PK
  status:         text("status").notNull().default("idle"), // idle | running | paused
  strategyConfig: text("strategy_config"),          // JSON: { strategy, token, entry, tp_pct, sl_pct, budget_eth, max_concurrent }
  totalTrades:    integer("total_trades").notNull().default(0),
  totalPnlUsd:    numeric("total_pnl_usd", { precision: 28, scale: 4 }).notNull().default("0"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ── API Keys — OTR-prefixed keys for external tool access ───────────── */
export const agentApiKeysTable = pgTable("agent_api_keys", {
  id:           serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  keyHash:      text("key_hash").notNull().unique(), // SHA-256 of full key, never stored plaintext
  keyPrefix:    text("key_prefix").notNull(),        // first 12 chars visible: "OTR-a1b2c3d4"
  name:         text("name"),                        // optional user label
  revoked:      boolean("revoked").notNull().default(false),
  lastUsedAt:   timestamp("last_used_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("api_keys_wallet_idx").on(t.walletAddress),
]);

export type AgentVault   = typeof agentVaultsTable.$inferSelect;
export type AgentApiKey  = typeof agentApiKeysTable.$inferSelect;
