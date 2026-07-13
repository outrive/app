import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tokensTable, tradesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { cacheGet, cacheSet } from "../lib/cache.js";

const router: IRouter = Router();

router.get("/market/tokens", async (req, res): Promise<void> => {
  const tab = (req.query.tab as string) ?? "newest";
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const cacheKey = `market:tokens:${tab}:${limit}`;

  const cached = cacheGet<unknown>(cacheKey);
  if (cached) { res.json(cached); return; }

  const tokens = await db
    .select()
    .from(tokensTable)
    .orderBy(tab === "trending" ? desc(tokensTable.volume24h) : desc(tokensTable.createdAt))
    .limit(limit);

  cacheSet(cacheKey, tokens, 20_000);
  res.json(tokens);
});

router.get("/market/tokens/:address", async (req, res): Promise<void> => {
  const { address } = req.params;
  const [token] = await db
    .select()
    .from(tokensTable)
    .where(eq(tokensTable.address, address.toLowerCase()));

  if (!token) { res.status(404).json({ error: "Token not found" }); return; }
  res.json(token);
});

router.get("/market/trades/:address", async (req, res): Promise<void> => {
  const { address } = req.params;
  const trades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.tokenAddress, address.toLowerCase()))
    .orderBy(desc(tradesTable.ts))
    .limit(50);

  res.json(trades);
});

router.get("/market/summary", async (_req, res): Promise<void> => {
  const cacheKey = "market:summary";
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) { res.json(cached); return; }

  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(tokensTable);
  const [graduatedResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tokensTable)
    .where(eq(tokensTable.phase, "GRADUATED"));

  const topGainers = await db.select().from(tokensTable).orderBy(desc(tokensTable.priceChange24h)).limit(5);
  const recentLaunches = await db.select().from(tokensTable).orderBy(desc(tokensTable.createdAt)).limit(5);

  const summary = {
    totalTokens: Number(countResult?.count ?? 0),
    totalVolume24h: "0",
    activeTokens: Number(countResult?.count ?? 0) - Number(graduatedResult?.count ?? 0),
    graduatedTokens: Number(graduatedResult?.count ?? 0),
    topGainers,
    recentLaunches,
  };

  cacheSet(cacheKey, summary, 20_000);
  res.json(summary);
});

export default router;
