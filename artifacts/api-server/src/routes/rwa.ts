import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { rwaTradesTable, rwaLimitOrdersTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";

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
  SPY:   { address: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C', name: 'SPDR S&P 500 ETF',       logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0x117cc2133c37b721f49de2a7a74833232b3b4c0c.png', tvSymbol: 'AMEX:SPY'    },
  QQQ:   { address: '0xD5f3879160bc7c32ebb4dC785F8a4F505888de68', name: 'Invesco QQQ ETF',         logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0xd5f3879160bc7c32ebb4dc785f8a4f505888de68.png', tvSymbol: 'NASDAQ:QQQ'  },
  COIN:  { address: '0x6330D8C3178a418788dF01a47479c0ce7CCF450b', name: 'Coinbase Global',         logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0x6330d8c3178a418788df01a47479c0ce7ccf450b.png', tvSymbol: 'NASDAQ:COIN' },
  CRWV:  { address: '0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3', name: 'CoreWeave Inc.',          logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0x5f10a1c971b69e47e059e1dc91901b59b3fb49c3.png', tvSymbol: 'NASDAQ:CRWV' },
  INTC:  { address: '0xc72b96e0E48ecd4DC75E1e45396e26300BC39681', name: 'Intel Corp.',             logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0xc72b96e0e48ecd4dc75e1e45396e26300bc39681.png', tvSymbol: 'NASDAQ:INTC' },
  BE:    { address: '0x822CC93fFD030293E9842c30BBD678F530701867', name: 'Bloom Energy',            logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0x822cc93ffd030293e9842c30bbd678f530701867.png', tvSymbol: 'NYSE:BE'     },
  USAR:  { address: '0xd917B029C761D264c6A312BBbcDA868658eF86a6', name: 'USA Rare Earth',          logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0xd917b029c761d264c6a312bbbcda868658ef86a6.png', tvSymbol: 'NASDAQ:USAR' },
  USO:   { address: '0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344', name: 'United States Oil Fund',  logoUrl: 'https://cdn.robinhood.com/ncw_assets/logos/0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344.png', tvSymbol: 'AMEX:USO'    },
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
type OhlcvData = { change: number; changePct: number; open: number; high: number; low: number; volume: number; fiftyTwoHigh: number; fiftyTwoLow: number; yfPrice: number };
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
      yfPrice: +(+price).toFixed(4),
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
  SPCX: 'SPCX', GOOGL: 'GOOG', USAR: 'USAR', CRWV: 'CRWV', BE: 'BE',
};

/* ── Refresh Blockscout prices (fast, 60s TTL) ───────────────────────────── */
async function refreshPrices(): Promise<void> {
  const p = await fetchBlockscoutPrices();
  if (Object.keys(p).length) { _prices = p; _pricesExp = Date.now() + 60_000; }
}

/* ── Refresh Yahoo Finance OHLCV (sequential 500ms gaps, 5-min TTL) ──────── */
async function refreshOhlcv(): Promise<void> {
  const data: typeof _ohlcv = {};
  for (let i = 0; i < SYMBOLS.length; i++) {
    const sym = SYMBOLS[i];
    data[sym] = await fetchChangePct(YF_SYMBOL[sym] ?? sym);
    if (i < SYMBOLS.length - 1) await sleep(500); // 500ms gap — avoids Yahoo Finance 429
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
      price:        _prices[sym]     || cd?.yfPrice || 0,   // Blockscout oracle → YF fallback
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

/* ═══════════════════════════════════════════════════════════════════════════
   FlapPortal on-chain trading — settlement pools + live quotes (chain 4663)
   Reverse-engineered from live txs, verified via eth_call simulation.
   Buy : ETH →(auto-wrap)→ WETH →(V3 pool)→ USDG →(settlement pool)→ Stock
   Sell: Stock →(settlement pool)→ USDG →(V3 pool)→ WETH →(type-4 unwrap)→ ETH
   Settlement pools are PER-STOCK. Signature words [9]/[10], referrer and
   feeSplit params are optional (proven via simulation of both directions).
   ═══════════════════════════════════════════════════════════════════════════ */
const RPC_URL     = 'https://rpc.mainnet.chain.robinhood.com';
const BS_BASE     = 'https://robinhoodchain.blockscout.com/api/v2';
const FLAP_PORTAL = '0xc94135b63772b91d79d0a2daab2a8801f32359bd';
const _USDG_HEX   = '5fc5360d0400a0fd4f2af552add042d716f1d168';
const _WETH_HEX   = '0bd7d308f8e1639fab988df18a8011f41eacad73';
const _WUSDG_V3   = '52e65b17fb6e5ba00ed806f37afcd2daa50271ca'; // WETH/USDG V3 pool (fee=100)
const _ETH_SENT   = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'; // native-ETH sentinel
const _FLAP_HEX   = 'c94135b63772b91d79d0a2daab2a8801f32359bd';
const SWAP_SEL    = '0x77963966'; // FlapPortal.swap()
const PERMIT_SEL  = '0x8fb4309b'; // swap-with-permit variant (same route layout)
const WETH_FROM   = '0x0bd7d308f8e1639fab988df18a8011f41eacad73'; // WETH contract holds native ETH → usable as eth_call `from`

/* eth_call state-override slots (ERC-7201 'openzeppelin.storage.ERC20').
   Identical for EVERY factory stock token — keyed only by holder(WETH)+spender(FlapPortal):
     balances[WETH_FROM]              → OVR_BAL_SLOT
     allowance[WETH_FROM][FlapPortal] → OVR_ALW_SLOT                          */
const OVR_BAL_SLOT = '0x6d94746bfae4bd07d20f78e449e45ee605807f5f3ded1e22683dec972daba9ab';
const OVR_ALW_SLOT = '0x2dca2eb46b66a676451d33725479d05b6fceca5480681e2e0e31a32c161e4e42';

/* Settlement pools mined from successful FlapPortal swaps (stock → pool, lowercase) */
const FLAP_POOL_SEED: Record<string, string> = {
  '0xaf3d76f1834a1d425780943c99ea8a608f8a93f9': '0x957bb4b86ccc706d44983fb889ed63c6f9bdc662', // AAPL
  '0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec': '0x682fd352329026885366d6649d61cb4ee505e7a4', // NVDA
  '0x86923f96303d656e4aa86d9d42d1e57ad2023fdc': '0xaf7e236fd675a4de1a393516105db8afb53dc1eb', // AMD
  '0x117cc2133c37b721f49de2a7a74833232b3b4c0c': '0x434dc3ed0aed78385b34041e7836c867c6790844', // SPY
  '0x12f190a9f9d7d37a250758b26824b97ce941bf54': '0x3785715b43ed03da120f4ae7b23bb1274d5e02dd', // AMZN
  '0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3': '0x7da0e2609e8dcf31055a8710465516056cf96e64', // GOOGL
  '0x322f0929c4625ed5bad873c95208d54e1c003b2d': '0x08b29f180ae8873897b3b8c2e0ea041172236e63', // TSLA
  '0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea': '0x10ff8720e7b2731399838ff3fe3b73e1d143aa74', // SPCX
  '0x5f10a1c971b69e47e059e1dc91901b59b3fb49c3': '0x67c574d4d5025e93822fc434002d1d36e603d77c', // CRWV
  '0x6330d8c3178a418788df01a47479c0ce7ccf450b': '0x33918df3a039312217524491f60e9e69000c30c9', // COIN
  '0x822cc93ffd030293e9842c30bbd678f530701867': '0xc6a42da6f853decf545e15a8b93ad135f067a66b', // BE
  '0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a': '0x4bf0949f64739f4e493415bcdaa595dee6aa9840', // PLTR
  '0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344': '0xaa3625dd1d51e3c5d6ee3576da526982b1ebaa3c', // USO
  '0xb0992820e760d836549ba69bc7598b4af75dee03': '0xfde9fd3207b26c3607a6ed30b27615c186131698', // ORCL
  '0xc0d6457c16cc70d6790dd43521c899c87ce02f35': '0xb535f7d16c28cc86769be67fa13cdf929c9b5b6d', // META
  '0xc72b96e0e48ecd4dc75e1e45396e26300bc39681': '0xb1742edac0794f792f84e7beb6ab7004e2c26bda', // INTC
  '0xd5f3879160bc7c32ebb4dc785f8a4f505888de68': '0xaf86c97bce104b1836b9972d20ec7c014d32f47d', // QQQ
  '0xd917b029c761d264c6a312bbbcda868658ef86a6': '0x4fa3b64df2756fc6d9d9efef713d9451002e3d58', // USAR
  '0xe93237c50d904957cf27e7b1133b510c669c2e74': '0xee3045339447359e6c021ed63537305debdbd610', // MSFT
  '0xff080c8ce2e5feadaca0da81314ae59d232d4afd': '0xa84a59b1bc44e4f99e7ab84cf68d998f7d5a74e9', // MU
};

const _poolCache = new Map<string, string>();   // runtime-mined pools
const _poolMiss  = new Map<string, number>();   // negative cache (retry-after ts)

/* ── ABI-encoding helpers (dependency-free hex) ──────────────────────────── */
const hexAddr = (s: string) => '000000000000000000000000' + s.replace(/^0x/i, '').toLowerCase().padStart(40, '0');
const hexU    = (n: bigint | number) => BigInt(n).toString(16).padStart(64, '0');
const HZ      = '0'.repeat(64);

/* Buy: swap(ETH→stock), 2 routes: V3 WETH→USDG, settlement USDG→stock */
function buildFlapBuyCalldata(stock: string, pool: string, ethWei: bigint, minOut: bigint, recipient: string, deadline: number): string {
  const cb   = '2203d44a' + hexU(0) + hexU(0) + hexU(minOut) + hexAddr(_FLAP_HEX) + hexU(deadline) + '0'.repeat(56);
  const head = hexAddr(_ETH_SENT) + hexAddr(stock) + hexU(ethWei) + hexU(minOut) + hexAddr(recipient) + hexU(deadline)
             + HZ + HZ + HZ + HZ + HZ + hexU(0x180);
  const rh   = hexU(2) + hexU(0x40) + hexU(0x1a0);
  const r0   = hexU(2) + hexAddr(_WUSDG_V3) + hexAddr(_WETH_HEX) + hexAddr(_USDG_HEX) + hexU(ethWei) + HZ + HZ + hexU(0x120) + HZ + hexU(32) + hexU(100);
  const r1   = HZ + hexAddr(pool) + hexAddr(_USDG_HEX) + hexAddr(stock) + HZ + HZ + hexU(minOut) + hexU(0x120) + hexU(36) + hexU(164) + cb;
  return SWAP_SEL + head + rh + r0 + r1;
}

/* Sell: swap(stock→ETH), 3 routes: settlement stock→USDG, V3 USDG→WETH, type-4 unwrap */
function buildFlapSellCalldata(stock: string, pool: string, amountWei: bigint, minEthOut: bigint, recipient: string, deadline: number): string {
  const cb   = '2203d44a' + hexU(1) + hexU(amountWei) + hexU(1) + hexAddr(_FLAP_HEX) + hexU(deadline) + '0'.repeat(56);
  const head = hexAddr(stock) + hexAddr(_ETH_SENT) + hexU(amountWei) + hexU(minEthOut) + hexAddr(recipient) + hexU(deadline)
             + HZ + HZ + HZ + HZ + HZ + hexU(0x180);
  const rh   = hexU(3) + hexU(0x60) + hexU(0x260) + hexU(0x3c0);
  const r0   = HZ + hexAddr(pool) + hexAddr(stock) + hexAddr(_USDG_HEX) + hexU(amountWei) + HZ + hexU(1) + hexU(0x120) + hexU(36) + hexU(164) + cb;
  const r1   = hexU(2) + hexAddr(_WUSDG_V3) + hexAddr(_USDG_HEX) + hexAddr(_WETH_HEX) + HZ + HZ + hexU(minEthOut) + hexU(0x120) + HZ + hexU(32) + hexU(100);
  const r2   = hexU(4) + hexAddr(_WETH_HEX) + hexAddr(_WETH_HEX) + hexAddr(_ETH_SENT) + HZ + HZ + hexU(1) + hexU(0x120) + HZ + hexU(0);
  return SWAP_SEL + head + rh + r0 + r1 + r2;
}

/* ── JSON-RPC ────────────────────────────────────────────────────────────── */
async function rpcCall(method: string, params: unknown[]): Promise<any> {
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
  return r.json();
}

function decodeRevert(err: any): string {
  const data: unknown = err?.data;
  if (typeof data === 'string' && data.startsWith('0x08c379a0')) {
    try {
      const reason = Buffer.from(data.slice(10 + 128), 'hex').toString('utf8').replace(/\0+/g, '').trim();
      if (reason) return `reverted: ${reason}`;
    } catch { /* fall through */ }
  }
  if (typeof data === 'string' && data.length >= 10) return `reverted: ${data.slice(0, 10)}`;
  return err?.message ?? 'execution reverted';
}

/* ── Pool discovery: seed → cache → mine Blockscout FlapPortal txs ───────── */
function parseSettleRoutes(raw: string): Array<{ stock: string; pool: string }> {
  const out: Array<{ stock: string; pool: string }> = [];
  try {
    if (!raw || raw.length < 74) return out;
    const sel  = raw.slice(0, 10);
    const body = raw.slice(10);
    const W = (i: number) => body.slice(i * 64, i * 64 + 64);
    const N = (i: number) => { const h = W(i); return h.length === 64 ? Number(BigInt('0x' + h)) : NaN; };
    const A = (i: number) => '0x' + W(i).slice(24).toLowerCase();
    let head: number;
    if (sel === SWAP_SEL) head = 12;
    else if (sel === PERMIT_SEL) head = N(12) / 32;
    else return out;
    const cnt = N(head);
    if (!Number.isFinite(cnt) || cnt < 1 || cnt > 5) return out;
    for (let i = 0; i < cnt; i++) {
      const off = N(head + 1 + i);
      if (!Number.isFinite(off)) continue;
      const s = head + 1 + off / 32;
      if (N(s) !== 0) continue;                        // settlement routes only (type 0)
      const pool = A(s + 1), tin = A(s + 2), tout = A(s + 3);
      const stock = tin.slice(2) === _USDG_HEX ? tout : tin;
      const sl = stock.slice(2);
      if (sl === _USDG_HEX || sl === _WETH_HEX || sl === _ETH_SENT || sl.length !== 40) continue;
      out.push({ stock, pool });
    }
  } catch { /* malformed input — skip */ }
  return out;
}

async function mineFlapPool(token: string): Promise<string | null> {
  let url = `${BS_BASE}/addresses/${FLAP_PORTAL}/transactions?filter=to`;
  for (let page = 0; page < 8; page++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) break;
    const d: any = await r.json();
    for (const t of d.items ?? []) {
      if (t?.status !== 'ok') continue;
      for (const { stock, pool } of parseSettleRoutes(t.raw_input ?? '')) {
        if (!_poolCache.has(stock)) _poolCache.set(stock, pool);
      }
    }
    if (_poolCache.has(token)) return _poolCache.get(token)!;
    const npp = d.next_page_params;
    if (!npp) break;
    const qs = new URLSearchParams({ filter: 'to' });
    for (const [k, v] of Object.entries(npp)) if (v != null) qs.set(k, String(v));
    url = `${BS_BASE}/addresses/${FLAP_PORTAL}/transactions?${qs}`;
  }
  return _poolCache.get(token) ?? null;
}

async function getFlapPool(tokenRaw: string): Promise<string | null> {
  const token = tokenRaw.toLowerCase();
  const seeded = FLAP_POOL_SEED[token];
  if (seeded) return seeded;
  const cached = _poolCache.get(token);
  if (cached) return cached;
  const missUntil = _poolMiss.get(token);
  if (missUntil && Date.now() < missUntil) return null;
  try {
    const mined = await mineFlapPool(token);
    if (mined) return mined;
  } catch (e: any) {
    console.warn('[rwa] pool mining failed:', e?.message);
  }
  _poolMiss.set(token, Date.now() + 180_000); // don't rescan for 3 min
  return null;
}

/* ── Live quotes via eth_call (reference amounts, linear-scaled client-side) ── */
const REF_BUY_ETH     = 10n ** 16n; // 0.01 ETH
const REF_SELL_SHARES = 10n ** 16n; // 0.01 share

type BuyQuote  = { token: string; pool: string; ethIn: string; amountOut: string; updatedAt: string };
type SellQuote = { token: string; pool: string; amountIn: string; ethOut: string; exact: boolean; updatedAt: string };
const _buyQuoteCache  = new Map<string, { body: BuyQuote;  exp: number }>();
const _sellQuoteCache = new Map<string, { body: SellQuote; exp: number }>();

async function fetchBuyQuote(token: string): Promise<BuyQuote | { error: string; status: number }> {
  const hit = _buyQuoteCache.get(token);
  if (hit && Date.now() < hit.exp) return hit.body;
  const pool = await getFlapPool(token);
  if (!pool) return { error: 'No settlement pool found for token', status: 404 };
  const deadline = Math.floor(Date.now() / 1000) + 300; // portal enforces a near-term deadline cap
  const data = buildFlapBuyCalldata(token, pool, REF_BUY_ETH, 1n, WETH_FROM, deadline);
  try {
    const r = await rpcCall('eth_call', [{ from: WETH_FROM, to: FLAP_PORTAL, data, value: '0x' + REF_BUY_ETH.toString(16) }, 'latest']);
    if (r?.result && r.result !== '0x') {
      const amountOut = BigInt(String(r.result).slice(0, 66)).toString();
      const body: BuyQuote = { token, pool, ethIn: REF_BUY_ETH.toString(), amountOut, updatedAt: new Date().toISOString() };
      _buyQuoteCache.set(token, { body, exp: Date.now() + 5_000 });
      return body;
    }
    return { error: `Buy quote failed — ${decodeRevert(r?.error)}`, status: 502 };
  } catch (e: any) {
    return { error: `RPC unavailable: ${e?.message}`, status: 502 };
  }
}

/* ── GET /rwa/flap-pool/:address ─────────────────────────────────────────── */
router.get('/rwa/flap-pool/:address', async (req: Request, res: Response) => {
  const address = String(req.params.address ?? '');
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) { res.status(400).json({ error: 'Invalid token address' }); return; }
  const pool = await getFlapPool(address);
  if (!pool) { res.status(404).json({ error: 'No settlement pool found — token may not be tradeable via FlapPortal yet' }); return; }
  res.json({ token: address.toLowerCase(), pool });
});

/* ── GET /rwa/flap-quote?token=0x… — live on-chain buy rate (0.01 ETH ref) ── */
router.get('/rwa/flap-quote', async (req: Request, res: Response) => {
  const token = String(req.query.token ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(token)) { res.status(400).json({ error: 'token query param must be a 0x address' }); return; }
  const q = await fetchBuyQuote(token);
  if ('error' in q) { res.status(q.status).json({ error: q.error }); return; }
  res.json(q);
});

/* ── GET /rwa/flap-sell-quote?token=0x… — live sell rate (0.01 share ref) ──
   Exact simulation: eth_call with state-override granting WETH_FROM a token
   balance + FlapPortal allowance. Falls back to inverse buy rate.          ── */
router.get('/rwa/flap-sell-quote', async (req: Request, res: Response) => {
  const token = String(req.query.token ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(token)) { res.status(400).json({ error: 'token query param must be a 0x address' }); return; }
  const hit = _sellQuoteCache.get(token);
  if (hit && Date.now() < hit.exp) { res.json(hit.body); return; }
  const pool = await getFlapPool(token);
  if (!pool) { res.status(404).json({ error: 'No settlement pool found — token may not be tradeable via FlapPortal yet' }); return; }

  const deadline = Math.floor(Date.now() / 1000) + 300;
  const data = buildFlapSellCalldata(token, pool, REF_SELL_SHARES, 1n, WETH_FROM, deadline);
  const overrides = { [token]: { stateDiff: { [OVR_BAL_SLOT]: '0x' + hexU(REF_SELL_SHARES), [OVR_ALW_SLOT]: '0x' + 'f'.repeat(64) } } };
  try {
    const r = await rpcCall('eth_call', [{ from: WETH_FROM, to: FLAP_PORTAL, data, value: '0x0' }, 'latest', overrides]);
    if (r?.result && r.result !== '0x') {
      const ethOut = BigInt(String(r.result).slice(0, 66)).toString();
      const body: SellQuote = { token, pool, amountIn: REF_SELL_SHARES.toString(), ethOut, exact: true, updatedAt: new Date().toISOString() };
      _sellQuoteCache.set(token, { body, exp: Date.now() + 5_000 });
      res.json(body); return;
    }
    console.warn('[rwa] sell sim reverted:', decodeRevert(r?.error), '— falling back to inverse buy rate');
  } catch (e: any) {
    console.warn('[rwa] sell sim RPC error:', e?.message, '— falling back to inverse buy rate');
  }

  // Fallback: invert the buy rate (settlement pools trade both directions at oracle price)
  const bq = await fetchBuyQuote(token);
  if ('error' in bq) { res.status(bq.status).json({ error: bq.error }); return; }
  const ethOut = (REF_SELL_SHARES * BigInt(bq.ethIn)) / BigInt(bq.amountOut);
  const body: SellQuote = { token, pool, amountIn: REF_SELL_SHARES.toString(), ethOut: ethOut.toString(), exact: false, updatedAt: new Date().toISOString() };
  _sellQuoteCache.set(token, { body, exp: Date.now() + 5_000 });
  res.json(body);
});

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

/* ── FlapPortal on-chain price cache — populated by background sequential refresh ── */
/* Parallel eth_calls caused RPC 429 rate limits → garbage prices.                   */
/* Fix: sequential calls with 150ms gaps, refresh every 30s in background.           */
const _flapPriceCache = new Map<string, { price: number; ts: number }>();
let   _flapRefreshing = false;
let   _flapLastRun    = 0;

/* ── In-memory price history ring buffer (288 pts ≈ 48 min @ 10 s intervals) ──
   Used by GET /rwa/price-history/:symbol for portfolio sparklines.           */
const _priceHistory    = new Map<string, Array<{ price: number; ts: number }>>();
const PRICE_HISTORY_MAX = 288;

function appendPriceHistory(): void {
  for (const [sym, info] of Object.entries(RWA_TOKENS)) {
    const hit = _flapPriceCache.get(info.address.toLowerCase());
    if (!hit) continue;
    const arr = _priceHistory.get(sym) ?? [];
    arr.push({ price: hit.price, ts: Date.now() });
    if (arr.length > PRICE_HISTORY_MAX) arr.shift();
    _priceHistory.set(sym, arr);
  }
}

async function refreshFlapPrices(): Promise<void> {
  if (_flapRefreshing) return;
  _flapRefreshing = true;
  try {
    const ethUsd = await fetchEthPrice();
    if (ethUsd <= 0) return;
    const deadline = Math.floor(Date.now() / 1000) + 300;
    for (const [, info] of Object.entries(RWA_TOKENS)) {
      const token = info.address.toLowerCase();
      const pool  = await getFlapPool(token);
      if (!pool) continue;
      const calldata = buildFlapBuyCalldata(token, pool, REF_BUY_ETH, 1n, WETH_FROM, deadline);
      try {
        const r = await rpcCall('eth_call', [{
          from: WETH_FROM, to: FLAP_PORTAL, data: calldata,
          value: '0x' + REF_BUY_ETH.toString(16),
        }, 'latest']);
        if (r?.result && r.result !== '0x') {
          const amountOut = BigInt(String(r.result).slice(0, 66));
          if (amountOut > 0n) {
            const priceUsd = (Number(REF_BUY_ETH) / Number(amountOut)) * ethUsd;
            // Sanity: reject prices that are clearly wrong (> $50k or < $0.01)
            if (priceUsd >= 0.01 && priceUsd <= 50_000) {
              _flapPriceCache.set(token, { price: +priceUsd.toFixed(4), ts: Date.now() });
            }
          }
        }
      } catch { /* skip this token */ }
      await sleep(150); // 150ms gap — prevents RPC rate limiting
    }
    _flapLastRun = Date.now();
    appendPriceHistory(); // snapshot for sparklines (in-memory ring buffer)
    console.info(`[rwa] flap-prices refreshed — ${_flapPriceCache.size} tokens`);
  } finally {
    _flapRefreshing = false;
  }
}

// Refresh every 10s in background; UI polls /rwa/flap-prices every 6s and gets cached values
setInterval(() => refreshFlapPrices().catch(() => {}), 10_000);

/* ── GET /rwa/flap-prices — returns latest cached on-chain prices immediately ── */
router.get('/rwa/flap-prices', async (_req: Request, res: Response) => {
  const ethUsd = await fetchEthPrice();
  // Kick off a refresh if stale and not already running (non-blocking)
  if (!_flapRefreshing && Date.now() - _flapLastRun > 8_000) {
    refreshFlapPrices().catch(() => {});
  }
  const results = Object.entries(RWA_TOKENS)
    .map(([sym, info]) => {
      const hit = _flapPriceCache.get(info.address.toLowerCase());
      return hit ? { symbol: sym, address: info.address, priceUsd: hit.price, live: true } : null;
    })
    .filter((x): x is { symbol: string; address: string; priceUsd: number; live: boolean } => x !== null);
  results.sort((a, b) => a.symbol.localeCompare(b.symbol));
  res.json({ prices: results, ethUsd: ethUsd || 1828, updatedAt: new Date().toISOString() });
});

/* ── POST /rwa/limit-orders ──────────────────────────────────────────────── */
router.post("/rwa/limit-orders", async (req: Request, res: Response) => {
  const { walletAddress, symbol, side, targetPriceUsd, qtyEth, qtyShares, expiresAt } = req.body ?? {};
  if (!walletAddress || !symbol || !side || !targetPriceUsd) {
    res.status(400).json({ error: "walletAddress, symbol, side, targetPriceUsd required" }); return;
  }
  if (side !== 'buy' && side !== 'sell') {
    res.status(400).json({ error: "side must be buy or sell" }); return;
  }
  const info = RWA_TOKENS[(symbol as string).toUpperCase()];
  if (!info) { res.status(400).json({ error: `Unknown symbol: ${symbol}` }); return; }

  const [order] = await db.insert(rwaLimitOrdersTable).values({
    walletAddress: (walletAddress as string).toLowerCase(),
    symbol:        (symbol as string).toUpperCase(),
    tokenAddress:  info.address,
    name:          info.name,
    side,
    targetPriceUsd: String(targetPriceUsd),
    qtyEth:    qtyEth    ? String(qtyEth)    : null,
    qtyShares: qtyShares ? String(qtyShares) : null,
    status:    'pending',
    expiresAt: expiresAt ? new Date(expiresAt as string) : null,
  }).returning();

  res.status(201).json({ order });
});

/* ── GET /rwa/limit-orders?wallet=0x… ───────────────────────────────────── */
router.get("/rwa/limit-orders", async (req: Request, res: Response) => {
  const wallet = (req.query.wallet as string | undefined)?.toLowerCase();
  if (!wallet) { res.status(400).json({ error: "wallet query param required" }); return; }

  const orders = await db
    .select()
    .from(rwaLimitOrdersTable)
    .where(eq(rwaLimitOrdersTable.walletAddress, wallet))
    .orderBy(desc(rwaLimitOrdersTable.createdAt))
    .limit(100);

  res.json({ orders });
});

/* ── DELETE /rwa/limit-orders/:id ───────────────────────────────────────── */
router.delete("/rwa/limit-orders/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id ?? '0', 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .update(rwaLimitOrdersTable)
    .set({ status: 'cancelled' })
    .where(and(eq(rwaLimitOrdersTable.id, id), eq(rwaLimitOrdersTable.status, 'pending')));

  res.json({ ok: true });
});

/* ── PATCH /rwa/limit-orders/:id/execute ────────────────────────────────── */
router.patch("/rwa/limit-orders/:id/execute", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id ?? '0', 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [order] = await db
    .update(rwaLimitOrdersTable)
    .set({ status: 'executed' })
    .where(eq(rwaLimitOrdersTable.id, id))
    .returning();

  res.json({ order });
});

/* ── Limit order keeper — runs after every flap-price refresh ────────────── */
async function checkLimitOrders(): Promise<void> {
  try {
    const pending = await db
      .select()
      .from(rwaLimitOrdersTable)
      .where(inArray(rwaLimitOrdersTable.status, ['pending', 'triggered']));

    if (pending.length === 0) return;
    const now = Date.now();

    for (const order of pending) {
      // Expire stale orders
      if (order.expiresAt && new Date(order.expiresAt).getTime() < now) {
        await db.update(rwaLimitOrdersTable).set({ status: 'expired' }).where(eq(rwaLimitOrdersTable.id, order.id));
        continue;
      }
      const cached = _flapPriceCache.get(order.tokenAddress.toLowerCase());
      if (!cached) continue;

      const livePrice   = cached.price;
      const targetPrice = parseFloat(String(order.targetPriceUsd));

      const shouldTrigger =
        (order.side === 'buy'  && livePrice <= targetPrice) ||
        (order.side === 'sell' && livePrice >= targetPrice);

      if (shouldTrigger && order.status === 'pending') {
        await db.update(rwaLimitOrdersTable)
          .set({ status: 'triggered', triggeredAt: new Date() })
          .where(eq(rwaLimitOrdersTable.id, order.id));
        console.info(`[rwa] limit order #${order.id} TRIGGERED — ${order.side} ${order.symbol} @ ${livePrice} (target ${targetPrice})`);
      }
    }
  } catch (err) {
    console.error('[rwa] limit order keeper error', err);
  }
}

/* ── GET /rwa/price-history/:symbol — sparkline ring-buffer ─────────────── */
router.get('/rwa/price-history/:symbol', (req: Request, res: Response) => {
  const sym = (req.params.symbol ?? '').toUpperCase();
  res.json({ symbol: sym, snapshots: _priceHistory.get(sym) ?? [] });
});

/* ── Pre-warm on module load ─────────────────────────────────────────────── */
refreshPrices().catch(() => {});           // Blockscout prices (fast, no rate-limit)
setTimeout(() => refreshFlapPrices().catch(() => {}), 2_000); // FlapPortal prices after 2s

// Check limit orders every 10s after price data is fresh
setInterval(() => checkLimitOrders().catch(() => {}), 10_000);

export default router;
