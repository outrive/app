/**
 * Proxy for Virtuals Protocol public API.
 * API returns flat objects (not Strapi v4 nested attributes).
 */
import { Router, type IRouter } from "express";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
const VIRTUALS_BASE = "https://api.virtuals.io/api";

// Flat response shape from api.virtuals.io
interface VItem {
  id: number;
  name?: string;
  symbol?: string;
  tokenAddress?: string | null;
  preToken?: string | null;
  walletAddress?: string;
  mcapInVirtual?: number;
  fdvInVirtual?: number;
  volume24h?: number;
  priceChangePercent24h?: number;
  holderCount?: number | null;
  chain?: string;
  status?: string;
  createdAt?: string;
  launchedAt?: string;
  description?: string;
  liquidityUsd?: number;
  isVerified?: boolean;
  mindshare?: number | null;
  image?: { url?: string } | null;
  category?: string;
}

function normalise(item: VItem) {
  // Derive bonding curve % from mcap vs graduation threshold
  // Virtuals graduates at 42,000 $VIRTUAL mcap
  const GRAD_THRESHOLD = 42_000;
  const mcap = Number(item.mcapInVirtual ?? 0);
  const curveProgress = Math.min((mcap / GRAD_THRESHOLD) * 100, 100);

  const rawStatus = (item.status ?? "UNDERGRAD").toUpperCase();
  const status = rawStatus === "GRADUATED" ? "GRADUATED" : "BONDING";

  return {
    id: item.id,
    name: item.name ?? "",
    ticker: (item.symbol ?? "").toUpperCase(),
    address: item.tokenAddress ?? item.preToken ?? "",
    creator: item.walletAddress ?? "",
    mcapInVirtual: mcap,
    fdvInVirtual: Number(item.fdvInVirtual ?? 0),
    volume24h: Number(item.volume24h ?? 0),
    priceChange24h: Number(item.priceChangePercent24h ?? 0),
    holderCount: item.holderCount ?? 0,
    liquidityUsd: Number(item.liquidityUsd ?? 0),
    status,
    curveProgress,
    chain: (item.chain ?? "ROBINHOOD").toUpperCase(),
    createdAt: item.createdAt ?? new Date().toISOString(),
    launchedAt: item.launchedAt ?? item.createdAt ?? new Date().toISOString(),
    description: item.description ?? "",
    image: item.image?.url ?? null,
    category: item.category ?? "",
    isVerified: item.isVerified ?? false,
    mindshare: item.mindshare ?? null,
  };
}

// Sort key mapping: frontend key → Virtuals API field
const SORT_MAP: Record<string, string> = {
  "mcapInVirtual:desc":      "mcapInVirtual:desc",
  "marketCap:desc":          "mcapInVirtual:desc",
  "volume24h:desc":          "volume24h:desc",
  "createdAt:desc":          "createdAt:desc",
  "priceChange24h:desc":     "priceChangePercent24h:desc",
  "priceChangePercent24h:desc": "priceChangePercent24h:desc",
  "holderCount:desc":        "holderCount:desc",
  "mindshare:desc":          "mindshare:desc",
};

async function fetchVirtuals(opts: {
  sort: string;
  page: number;
  pageSize: number;
  search?: string;
  chain: string;
  status?: string;
}) {
  const apiSort = SORT_MAP[opts.sort] ?? "mcapInVirtual:desc";
  const p = new URLSearchParams();
  p.set("pagination[page]", String(opts.page));
  p.set("pagination[pageSize]", String(opts.pageSize));
  p.set("sort[0]", apiSort);

  if (opts.chain !== "ALL") {
    p.set("filters[chain][$eq]", opts.chain);
  }
  if (opts.status && opts.status !== "ALL") {
    // API uses UNDERGRAD for bonding, GRADUATED for graduated
    const apiStatus = opts.status === "BONDING" ? "UNDERGRAD" : opts.status;
    p.set("filters[status][$eq]", apiStatus);
  }
  if (opts.search) {
    p.set("filters[$or][0][name][$containsi]", opts.search);
    p.set("filters[$or][1][symbol][$containsi]", opts.search);
  }

  const url = `${VIRTUALS_BASE}/virtuals?${p.toString()}`;
  logger.debug({ url }, "Fetching Virtuals API");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "OUTRIVE/1.0 (+https://outrive.app)",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Virtuals API ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json() as {
    data: VItem[];
    meta: { pagination: { total: number; page: number; pageCount: number; pageSize: number } };
  };

  return {
    tokens: (json.data ?? []).map(normalise),
    meta: json.meta?.pagination ?? { total: 0, page: 1, pageCount: 1, pageSize: opts.pageSize },
  };
}

// GET /api/virtuals/tokens
router.get("/virtuals/tokens", async (req, res): Promise<void> => {
  const sort     = (req.query.sort     as string) || "mcapInVirtual:desc";
  const page     = Math.max(1, parseInt(req.query.page     as string) || 1);
  const pageSize = Math.min(50, parseInt(req.query.pageSize as string) || 50);
  const search   = (req.query.search   as string) || "";
  const chain    = ((req.query.chain   as string) || "ROBINHOOD").toUpperCase();
  const status   = (req.query.status   as string) || "";

  const cacheKey = `virtuals:tokens:${sort}:${page}:${pageSize}:${chain}:${status}:${search}`;
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const data = await fetchVirtuals({ sort, page, pageSize, search: search || undefined, chain, status: status || undefined });
    cacheSet(cacheKey, data, 30_000);
    res.json(data);
  } catch (err) {
    logger.warn({ err }, "Virtuals API fetch failed");
    res.status(502).json({
      error: String(err instanceof Error ? err.message : err).slice(0, 200),
      tokens: [],
      meta: { total: 0, page: 1, pageCount: 0, pageSize },
    });
  }
});

// GET /api/virtuals/summary
router.get("/virtuals/summary", async (_req, res): Promise<void> => {
  const cacheKey = "virtuals:summary:v2";
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const [robinhood, graduated] = await Promise.all([
      fetchVirtuals({ sort: "mcapInVirtual:desc", page: 1, pageSize: 1, chain: "ROBINHOOD" }),
      fetchVirtuals({ sort: "mcapInVirtual:desc", page: 1, pageSize: 1, chain: "ROBINHOOD", status: "GRADUATED" }),
    ]);
    const summary = {
      totalTokens:    robinhood.meta.total,
      graduatedTokens: graduated.meta.total,
      bondingTokens:  robinhood.meta.total - graduated.meta.total,
    };
    cacheSet(cacheKey, summary, 60_000);
    res.json(summary);
  } catch (err) {
    logger.warn({ err }, "Virtuals summary fetch failed");
    res.json({ totalTokens: 0, graduatedTokens: 0, bondingTokens: 0 });
  }
});

const BLOCKSCOUT_BASE = "https://robinhoodchain.blockscout.com/api/v2";

// GET /api/virtuals/virtual-price  —  $VIRTUAL token USD price (CoinGecko proxy, 2min cache)
router.get("/virtuals/virtual-price", async (_req, res): Promise<void> => {
  const cacheKey = "virtuals:virtual-price";
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) { res.json(cached); return; }
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=virtual-protocol&vs_currencies=usd",
      { headers: { Accept: "application/json", "User-Agent": "OUTRIVE/1.0" }, signal: AbortSignal.timeout(8_000) }
    );
    if (!r.ok) { res.json({ usd: 0 }); return; }
    const json = await r.json() as { "virtual-protocol"?: { usd?: number } };
    const price = { usd: json["virtual-protocol"]?.usd ?? 0 };
    cacheSet(cacheKey, price, 120_000);
    res.json(price);
  } catch { res.json({ usd: 0 }); }
});

// GET /api/virtuals/tokens/:address/holders  —  Blockscout token holders proxy
router.get("/virtuals/tokens/:address/holders", async (req, res): Promise<void> => {
  const { address } = req.params;
  const cacheKey = `blockscout:holders:${address.toLowerCase()}`;
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) { res.json(cached); return; }
  try {
    const r = await fetch(`${BLOCKSCOUT_BASE}/tokens/${address}/holders`, {
      headers: { Accept: "application/json", "User-Agent": "OUTRIVE/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) { res.json({ items: [] }); return; }
    const data = await r.json();
    cacheSet(cacheKey, data, 30_000);
    res.json(data);
  } catch { res.json({ items: [] }); }
});

// GET /api/virtuals/tokens/:address/transfers  —  Blockscout ERC-20 transfers proxy
router.get("/virtuals/tokens/:address/transfers", async (req, res): Promise<void> => {
  const { address } = req.params;
  const cacheKey = `blockscout:transfers:${address.toLowerCase()}`;
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) { res.json(cached); return; }
  try {
    const r = await fetch(`${BLOCKSCOUT_BASE}/tokens/${address}/transfers`, {
      headers: { Accept: "application/json", "User-Agent": "OUTRIVE/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) { res.json({ items: [] }); return; }
    const data = await r.json();
    cacheSet(cacheKey, data, 30_000);
    res.json(data);
  } catch { res.json({ items: [] }); }
});

// GET /api/virtuals/tokens/:id/ohlcv  —  price-history proxy for frontend charts
// Tries Virtuals Protocol's own price endpoint; returns { candles: OHLCCandle[] }
router.get("/virtuals/tokens/:id/ohlcv", async (req, res): Promise<void> => {
  const { id } = req.params;
  const interval = (req.query.interval as string) || "1h";
  const limit    = Math.min(parseInt(req.query.limit as string) || 72, 300);

  const cacheKey = `virtuals:ohlcv:${id}:${interval}:${limit}`;
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) { res.json(cached); return; }

  // Try Virtuals Protocol price history endpoint
  const urls = [
    `${VIRTUALS_BASE}/virtuals/${id}/prices?interval=${interval}&limit=${limit}`,
    `${VIRTUALS_BASE}/virtuals/${id}/tokenomics`,
  ];

  interface RawCandle {
    time?: number; timestamp?: number; t?: number;
    open?: number; o?: number;
    high?: number; h?: number;
    low?: number;  l?: number;
    close?: number; c?: number;
    price?: number;
    volume?: number; v?: number;
  }

  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "OUTRIVE/1.0" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!r.ok) continue;
      const json = await r.json() as { data?: RawCandle[]; prices?: RawCandle[]; candles?: RawCandle[] } | RawCandle[];

      // Normalise whatever shape the API returns
      const raw: RawCandle[] = Array.isArray(json)
        ? json
        : (json as { data?: RawCandle[]; prices?: RawCandle[]; candles?: RawCandle[] }).data
          ?? (json as { data?: RawCandle[]; prices?: RawCandle[]; candles?: RawCandle[] }).prices
          ?? (json as { data?: RawCandle[]; prices?: RawCandle[]; candles?: RawCandle[] }).candles
          ?? [];

      if (!raw.length) continue;

      const candles = raw.slice(-limit).map((c: RawCandle) => {
        const close  = c.close ?? c.c ?? c.price ?? 0;
        const open   = c.open  ?? c.o ?? close;
        const high   = c.high  ?? c.h ?? Math.max(open, close);
        const low    = c.low   ?? c.l ?? Math.min(open, close);
        const volume = c.volume ?? c.v ?? 0;
        const time   = c.time  ?? c.timestamp ?? c.t ?? 0;
        return { time, open, high, low, close, volume };
      }).filter((c: { time: number; open: number; high: number; low: number; close: number; volume: number }) => c.close > 0);

      if (!candles.length) continue;

      const payload = { candles };
      cacheSet(cacheKey, payload, 30_000);
      res.json(payload);
      return;
    } catch {
      continue;
    }
  }

  // Nothing worked — return empty
  res.json({ candles: [] });
});

export default router;
