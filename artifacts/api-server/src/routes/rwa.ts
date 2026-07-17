import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { rwaTradesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

/* ── Static registry — verified Robinhood Chain (4663) ERC-20 contracts ────
   Addresses from Blockscout · Logos from cdn.robinhood.com
   ──────────────────────────────────────────────────────────────────────── */
export const RWA_TOKENS: Record<string, {
  address: `0x${string}`;
  name: string;
  logoUrl: string;
  tvSymbol: string;
}> = {
  // Sorted by 24h trading volume on Robinhood Chain (Blockscout data)
  NVDA:  { address: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', name: 'NVIDIA Corp.',           logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec.png', tvSymbol: 'NASDAQ:NVDA'  },
  SPCX:  { address: '0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa', name: 'Procure Space ETF',      logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea.png', tvSymbol: 'NASDAQ:SPCX'  },
  AAPL:  { address: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9', name: 'Apple Inc.',              logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0xaf3d76f1834a1d425780943c99ea8a608f8a93f9.png', tvSymbol: 'NASDAQ:AAPL'  },
  GOOGL: { address: '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3', name: 'Alphabet Inc.',           logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3.png', tvSymbol: 'NASDAQ:GOOGL' },
  TSLA:  { address: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d', name: 'Tesla Inc.',              logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0x322f0929c4625ed5bad873c95208d54e1c003b2d.png', tvSymbol: 'NASDAQ:TSLA'  },
  PLTR:  { address: '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A', name: 'Palantir Technologies', logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a.png', tvSymbol: 'NASDAQ:PLTR'  },
  AMD:   { address: '0x86923f96303D656E4aa86D9d42D1e57ad2023fdC', name: 'Advanced Micro Devices', logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0x86923f96303d656e4aa86d9d42d1e57ad2023fdc.png', tvSymbol: 'NASDAQ:AMD'   },
  META:  { address: '0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35', name: 'Meta Platforms Inc.',     logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0xc0d6457c16cc70d6790dd43521c899c87ce02f35.png', tvSymbol: 'NASDAQ:META'  },
  MSFT:  { address: '0xe93237C50D904957Cf27E7B1133b510C669c2e74', name: 'Microsoft Corp.',          logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0xe93237c50d904957cf27e7b1133b510c669c2e74.png', tvSymbol: 'NASDAQ:MSFT'  },
  AMZN:  { address: '0x12f190a9F9d7D37a250758b26824B97CE941bF54', name: 'Amazon.com Inc.',          logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0x12f190a9f9d7d37a250758b26824b97ce941bf54.png', tvSymbol: 'NASDAQ:AMZN'  },
  MU:    { address: '0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD', name: 'Micron Technology',       logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0xff080c8ce2e5feadaca0da81314ae59d232d4afd.png', tvSymbol: 'NASDAQ:MU'    },
  ORCL:  { address: '0xb0992820E760d836549ba69BC7598b4af75dEE03', name: 'Oracle Corp.',             logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0xb0992820e760d836549ba69bc7598b4af75dee03.png', tvSymbol: 'NYSE:ORCL'    },
  SNDK:  { address: '0xB90A19fF0Af67f7779afF50A882A9CfF42446400', name: 'SanDisk Corp.',            logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0xb90a19ff0af67f7779aff50a882a9cff42446400.png', tvSymbol: 'NASDAQ:WDC'   },
  SPY:   { address: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C', name: 'SPDR S&P 500 ETF',       logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0x117cc2133c37b721f49de2a7a74833232b3b4c0c.png', tvSymbol: 'AMEX:SPY'    },
  QQQ:   { address: '0xD5f3879160bc7c32ebb4dC785F8a4F505888de68', name: 'Invesco QQQ ETF',         logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0xd5f3879160bc7c32ebb4dc785f8a4f505888de68.png', tvSymbol: 'NASDAQ:QQQ'  },
};

export const WETH_ADDRESS = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as `0x${string}`;
const SYMBOLS = Object.keys(RWA_TOKENS);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/* ── Quote types ─────────────────────────────────────────────────────────── */
type QuoteResult = {
  symbol: string; name: string; address: string; logoUrl: string;
  price: number; change: number; changePct: number;
  open: number; high: number; low: number; volume: number;
  fiftyTwoHigh: number; fiftyTwoLow: number; currency: string;
};

/* ── Price caches ────────────────────────────────────────────────────────── */
let _quoteCache: { quotes: QuoteResult[]; updatedAt: string } | null = null;
let _quoteCacheExpiry = 0;
let _quoteInflight: Promise<typeof _quoteCache> | null = null;

let _ethPrice = 1828;
let _ethPriceExpiry = 0;

/* ── ETH price (CoinGecko) ───────────────────────────────────────────────── */
async function fetchEthPrice(): Promise<number> {
  if (Date.now() < _ethPriceExpiry) return _ethPrice;
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) },
    );
    if (r.ok) {
      const d: any = await r.json();
      _ethPrice = d?.ethereum?.usd ?? _ethPrice;
      _ethPriceExpiry = Date.now() + 300_000;
    }
  } catch { /* keep cached */ }
  return _ethPrice;
}

/* ── Fetch spot prices from Blockscout on-chain oracle ───────────────────────
   Single batch call, no rate limits, reflects chain oracle prices.
   ─────────────────────────────────────────────────────────────────────────── */
async function fetchBlockscoutPrices(): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  try {
    // Fetch 2 pages sorted by fiat_value — covers all our tokens
    const [r1, r2] = await Promise.all([
      fetch("https://robinhoodchain.blockscout.com/api/v2/tokens?type=ERC-20&limit=50&sort=fiat_value&order=desc",
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }),
      fetch("https://robinhoodchain.blockscout.com/api/v2/tokens?type=ERC-20&limit=50&sort=fiat_value&order=desc&page=2",
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }),
    ]);
    const [d1, d2]: [any, any] = await Promise.all([
      r1.ok ? r1.json() : { items: [] },
      r2.ok ? r2.json() : { items: [] },
    ]);
    for (const item of [...(d1.items ?? []), ...(d2.items ?? [])]) {
      const sym  = (item.symbol as string)?.toUpperCase();
      const rate = parseFloat(item.exchange_rate ?? "0");
      if (sym && rate > 0) prices[sym] = rate;
    }
  } catch { /* return whatever we have */ }
  return prices;
}

/* ── Fetch change % for a single symbol from Yahoo Finance v8 chart ──────── */
async function fetchChangePct(symbol: string): Promise<{ change: number; changePct: number; open: number; high: number; low: number; volume: number; fiftyTwoHigh: number; fiftyTwoLow: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json", "Referer": "https://finance.yahoo.com/" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta   = result.meta ?? {};
    const q      = result.indicators?.quote?.[0] ?? {};
    const closes = (q.close  as number[]) ?? [];
    const opens  = (q.open   as number[]) ?? [];
    const highs  = (q.high   as number[]) ?? [];
    const lows   = (q.low    as number[]) ?? [];
    const vols   = (q.volume as number[]) ?? [];

    const price     = (meta.regularMarketPrice as number) ?? closes.at(-1) ?? 0;
    const prevClose = closes.at(-2) ?? price;
    const change    = price - prevClose;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;

    return {
      change: +change.toFixed(4), changePct: +changePct.toFixed(4),
      open:         +(opens.at(-1)  ?? 0),
      high:         +(highs.at(-1)  ?? meta.regularMarketDayHigh ?? 0),
      low:          +(lows.at(-1)   ?? meta.regularMarketDayLow  ?? 0),
      volume:       +(vols.at(-1)   ?? 0),
      fiftyTwoHigh: +(meta.fiftyTwoWeekHigh ?? 0),
      fiftyTwoLow:  +(meta.fiftyTwoWeekLow  ?? 0),
    };
  } catch {
    return null;
  }
}

/* ── Build complete quote list ────────────────────────────────────────────── */
async function fetchAllQuotes(): Promise<typeof _quoteCache> {
  // 1. Get on-chain oracle prices from Blockscout (single batch, fast)
  const prices = await fetchBlockscoutPrices();

  // 2. Get change/OHLCV for each symbol sequentially from Yahoo Finance
  //    (1s delay between requests to stay under rate limit)
  const changeData: Record<string, Awaited<ReturnType<typeof fetchChangePct>>> = {};
  for (let i = 0; i < SYMBOLS.length; i++) {
    changeData[SYMBOLS[i]] = await fetchChangePct(SYMBOLS[i]);
    if (i < SYMBOLS.length - 1) await sleep(1000);
  }

  const quotes: QuoteResult[] = SYMBOLS.map(sym => {
    const info   = RWA_TOKENS[sym];
    const price  = prices[sym] ?? 0;
    const cd     = changeData[sym];
    return {
      symbol:       sym,
      name:         info.name,
      address:      info.address,
      logoUrl:      info.logoUrl,
      price,
      change:       cd ? cd.change    : 0,
      changePct:    cd ? cd.changePct : 0,
      open:         cd ? cd.open      : 0,
      high:         cd ? cd.high      : 0,
      low:          cd ? cd.low       : 0,
      volume:       cd ? cd.volume    : 0,
      fiftyTwoHigh: cd ? cd.fiftyTwoHigh : 0,
      fiftyTwoLow:  cd ? cd.fiftyTwoLow  : 0,
      currency:     'USD',
    };
  });

  const payload = { quotes, updatedAt: new Date().toISOString() };
  _quoteCache       = payload;
  _quoteCacheExpiry = Date.now() + 60_000;
  _quoteInflight    = null;
  return payload;
}

/* ── Serve prices-only immediately while OHLCV loads in background ────────── */
async function fetchPricesOnly(): Promise<typeof _quoteCache> {
  const prices = await fetchBlockscoutPrices();
  const quotes: QuoteResult[] = SYMBOLS.map(sym => {
    const info = RWA_TOKENS[sym];
    return {
      symbol: sym, name: info.name, address: info.address, logoUrl: info.logoUrl,
      price: prices[sym] ?? 0,
      change: 0, changePct: 0, open: 0, high: 0, low: 0, volume: 0,
      fiftyTwoHigh: 0, fiftyTwoLow: 0, currency: 'USD',
    };
  });
  return { quotes, updatedAt: new Date().toISOString() };
}

/* ── GET /rwa/quotes ──────────────────────────────────────────────────────── */
router.get("/rwa/quotes", async (req: Request, res: Response) => {
  try {
    // Serve from cache if fresh
    if (_quoteCache && Date.now() < _quoteCacheExpiry) { res.json(_quoteCache); return; }

    // For the first request, serve prices-only immediately (fast), kick off full fetch in background
    if (!_quoteCache) {
      const fast = await fetchPricesOnly();
      res.json(fast);
      // Then populate full cache in background
      if (!_quoteInflight) _quoteInflight = fetchAllQuotes();
      return;
    }

    // On subsequent refreshes, wait for full data
    if (!_quoteInflight) _quoteInflight = fetchAllQuotes();
    const payload = await _quoteInflight;
    res.json(payload ?? { quotes: [], updatedAt: new Date().toISOString() });
  } catch (err: any) {
    req.log?.error({ err }, "rwa/quotes failed");
    if (_quoteCache) { res.json(_quoteCache); return; }
    res.status(502).json({ error: "Failed to fetch quotes" });
  }
});

/* ── GET /rwa/tokens ─────────────────────────────────────────────────────── */
router.get("/rwa/tokens", (_req: Request, res: Response) => {
  const tokens = Object.entries(RWA_TOKENS).map(([symbol, info]) => ({
    symbol, ...info, weth: WETH_ADDRESS, chainId: 4663,
    explorerUrl: `https://robinhoodchain.blockscout.com/token/${info.address}`,
  }));
  res.json({ tokens, weth: WETH_ADDRESS });
});

/* ── GET /rwa/eth-price ──────────────────────────────────────────────────── */
router.get("/rwa/eth-price", async (_req: Request, res: Response) => {
  const usd = await fetchEthPrice();
  res.json({ usd, updatedAt: new Date().toISOString() });
});

/* ── POST /rwa/trades ────────────────────────────────────────────────────── */
router.post("/rwa/trades", async (req: Request, res: Response) => {
  const { walletAddress, symbol, side, shares, priceUsd, ethAmount, totalUsd, txHash, source, network } = req.body ?? {};

  if (!walletAddress || !symbol || !side || !shares) {
    res.status(400).json({ error: "walletAddress, symbol, side, shares are required" }); return;
  }
  if (side !== 'buy' && side !== 'sell') {
    res.status(400).json({ error: "side must be buy or sell" }); return;
  }

  const info = RWA_TOKENS[(symbol as string).toUpperCase()];
  if (!info) { res.status(400).json({ error: `Unknown symbol: ${symbol}` }); return; }

  const [trade] = await db.insert(rwaTradesTable).values({
    walletAddress: (walletAddress as string).toLowerCase(),
    symbol:       (symbol as string).toUpperCase(),
    tokenAddress: info.address,
    name:         info.name,
    side:         side as string,
    shares:       String(shares),
    priceUsd:     String(priceUsd  ?? 0),
    ethAmount:    String(ethAmount ?? 0),
    totalUsd:     String(totalUsd  ?? 0),
    txHash:       txHash as string | undefined ?? undefined,
    status:       txHash ? 'confirmed' : 'pending',
    source:       (source as string) ?? 'manual',
    network:      (network as string) ?? 'mainnet',
  }).returning();

  res.status(201).json({ trade });
});

/* ── GET /rwa/trades?wallet=0x… ─────────────────────────────────────────── */
router.get("/rwa/trades", async (req: Request, res: Response) => {
  const wallet = (req.query.wallet as string | undefined)?.toLowerCase();
  if (!wallet) { res.status(400).json({ error: "wallet query param required" }); return; }

  const trades = await db
    .select()
    .from(rwaTradesTable)
    .where(eq(rwaTradesTable.walletAddress, wallet))
    .orderBy(desc(rwaTradesTable.createdAt))
    .limit(200);

  res.json({ trades });
});

/* ── PATCH /rwa/trades/:id ───────────────────────────────────────────────── */
router.patch("/rwa/trades/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id ?? '0', 10);
  const { txHash, status } = req.body as { txHash?: string; status?: string };
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [updated] = await db
    .update(rwaTradesTable)
    .set({ ...(txHash && { txHash }), ...(status && { status }) })
    .where(eq(rwaTradesTable.id, id))
    .returning();

  res.json({ trade: updated });
});

export default router;
