import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { rwaTradesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

/* ── In-memory logo proxy cache (1h TTL) ─────────────────────────────────── */
const _logoCache = new Map<string, { buf: Buffer; ct: string; exp: number }>();

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

// Windows UA — Yahoo Finance blocks Mac/Linux server IPs with Mac UA; Windows Chrome UA gets 200
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/* ── Quote types ─────────────────────────────────────────────────────────── */
type QuoteResult = {
  symbol: string; name: string; address: string; logoUrl: string;
  price: number; change: number; changePct: number;
  open: number; high: number; low: number; volume: number;
  fiftyTwoHigh: number; fiftyTwoLow: number; currency: string;
};

/* ── Dual cache: Blockscout prices (60s) + Yahoo Finance OHLCV (5 min) ─────── */
// Prices — cheap Blockscout batch, refreshed every 60s
let _prices: Record<string, number> = {};
let _pricesExp = 0;

// OHLCV (changePct, open, high, low, vol, 52w) — expensive YF sequential fetch, 5-min TTL
type OhlcvData = { change: number; changePct: number; open: number; high: number; low: number; volume: number; fiftyTwoHigh: number; fiftyTwoLow: number };
let _ohlcv: Record<string, OhlcvData | null> = {};
let _ohlcvExp = 0;
let _ohlcvInflight: Promise<void> | null = null;

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
    if (!res.ok) {
      console.warn(`[rwa] YF ${symbol} → HTTP ${res.status}`);
      return null;
    }
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) {
      const err = json?.chart?.error;
      console.warn(`[rwa] YF ${symbol} → no result, error:`, JSON.stringify(err));
      return null;
    }

    const meta   = result.meta ?? {};
    const q      = result.indicators?.quote?.[0] ?? {};
    const closes = (q.close  as (number | null)[]) ?? [];
    const opens  = (q.open   as (number | null)[]) ?? [];
    const highs  = (q.high   as (number | null)[]) ?? [];
    const lows   = (q.low    as (number | null)[]) ?? [];
    const vols   = (q.volume as (number | null)[]) ?? [];

    const price     = (meta.regularMarketPrice as number) ?? closes.findLast(v => v != null) ?? 0;
    // find last two valid closes for delta
    const validCloses = closes.filter((v): v is number => v != null);
    const prevClose   = validCloses.at(-2) ?? price;
    const change      = price - prevClose;
    const changePct   = prevClose ? (change / prevClose) * 100 : 0;

    return {
      change: +change.toFixed(4), changePct: +changePct.toFixed(4),
      open:         +((opens.findLast(v => v != null))  ?? meta.regularMarketOpen        ?? 0),
      high:         +((highs.findLast(v => v != null))  ?? meta.regularMarketDayHigh     ?? 0),
      low:          +((lows.findLast(v => v != null))   ?? meta.regularMarketDayLow      ?? 0),
      volume:       +((vols.findLast(v => v != null))   ?? meta.regularMarketVolume      ?? 0),
      fiftyTwoHigh: +(meta.fiftyTwoWeekHigh ?? 0),
      fiftyTwoLow:  +(meta.fiftyTwoWeekLow  ?? 0),
    };
  } catch (e: any) {
    console.warn(`[rwa] YF ${symbol} → CATCH: ${e?.message}`);
    return null;
  }
}

/* ── Map RWA symbol → Yahoo Finance ticker (where they differ) ────────────── */
const YF_SYMBOL: Record<string, string> = {
  SNDK: 'WDC',  // SanDisk acquired by Western Digital; WDC trades on NASDAQ
};

/* ── Refresh Blockscout prices (fast, 60s TTL) ───────────────────────────── */
async function refreshPrices(): Promise<void> {
  const p = await fetchBlockscoutPrices();
  if (Object.keys(p).length) { _prices = p; _pricesExp = Date.now() + 60_000; }
}

/* ── Refresh Yahoo Finance OHLCV (sequential 400ms gaps, 5-min TTL) ──────── */
async function refreshOhlcv(): Promise<void> {
  const data: typeof _ohlcv = {};
  for (let i = 0; i < SYMBOLS.length; i++) {
    const sym = SYMBOLS[i];
    data[sym] = await fetchChangePct(YF_SYMBOL[sym] ?? sym);
    if (i < SYMBOLS.length - 1) await sleep(800); // 800ms gap — avoids Yahoo Finance 429
  }
  // Only commit if we got at least one valid result
  if (Object.values(data).some(v => v !== null)) {
    _ohlcv    = data;
    _ohlcvExp = Date.now() + 10 * 60_000; // 10-min TTL
    console.info('[rwa] OHLCV cache refreshed — changePct ready');
  } else {
    console.warn('[rwa] OHLCV refresh: all null (YF rate-limited?), retry in 3 min');
    _ohlcvExp = Date.now() + 3 * 60_000; // back off 3 min before retry
  }
  _ohlcvInflight = null;
}

/* ── Merge both caches into a quote list ─────────────────────────────────── */
function buildQuoteList(): QuoteResult[] {
  return SYMBOLS.map(sym => {
    const info = RWA_TOKENS[sym];
    const cd   = _ohlcv[sym];
    return {
      symbol:       sym,
      name:         info.name,
      address:      info.address,
      logoUrl:      info.logoUrl,
      price:        _prices[sym]     ?? 0,
      change:       cd?.change       ?? 0,
      changePct:    cd?.changePct    ?? 0,
      open:         cd?.open         ?? 0,
      high:         cd?.high         ?? 0,
      low:          cd?.low          ?? 0,
      volume:       cd?.volume       ?? 0,
      fiftyTwoHigh: cd?.fiftyTwoHigh ?? 0,
      fiftyTwoLow:  cd?.fiftyTwoLow  ?? 0,
      currency:     'USD',
    };
  });
}

/* ── GET /rwa/logo/:address  (proxy — cdn.robinhood.com blocks browsers) ─── */
router.get("/rwa/logo/:address", async (req: Request, res: Response) => {
  const raw = (req.params.address ?? '').toLowerCase().replace(/^0x/, '').replace(/[^0-9a-f]/g, '');
  if (raw.length !== 40) { res.status(400).end(); return; }

  const hit = _logoCache.get(raw);
  if (hit && Date.now() < hit.exp) {
    res.setHeader('Content-Type', hit.ct);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(hit.buf);
    return;
  }

  const cdnUrl = `https://cdn.robinhood.com/ncw_assets/logos/0x${raw}.png`;
  try {
    const r = await fetch(cdnUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) { res.status(404).end(); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    const ct  = r.headers.get('content-type') || 'image/png';
    _logoCache.set(raw, { buf, ct, exp: Date.now() + 3_600_000 });
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch {
    res.status(502).end();
  }
});

/* ── GET /rwa/quotes ──────────────────────────────────────────────────────── */
router.get("/rwa/quotes", async (req: Request, res: Response) => {
  try {
    // Refresh prices if stale (fast, ~500ms) — await so response always has current price
    if (Date.now() >= _pricesExp) await refreshPrices();

    // Trigger OHLCV refresh in background if stale (slow ~7s) — never block the response
    if (!_ohlcvInflight && Date.now() >= _ohlcvExp) {
      _ohlcvInflight = refreshOhlcv();
    }

    res.json({ quotes: buildQuoteList(), updatedAt: new Date().toISOString() });
  } catch (err: any) {
    req.log?.error({ err }, "rwa/quotes failed");
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

/* ── Pre-warm prices only on module load (Blockscout, fast, no rate-limit) ── */
/* ── OHLCV is triggered lazily on first /rwa/quotes request ─────────────── */
/* ── (Avoid YF warmup on every dev restart — the IP gets rate-limited)    ── */
refreshPrices().catch(() => {});

export default router;
