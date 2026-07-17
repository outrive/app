import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useAccount, useSendTransaction, useWaitForTransactionReceipt,
  useReadContract, useSwitchChain, useBalance,
} from 'wagmi';
import { encodeFunctionData, parseAbi, parseUnits, formatUnits } from 'viem';
import { RefreshCw, ExternalLink, CheckCircle2, XCircle, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

/* ─── On-chain swap constants ────────────────────────────────────────────── */
// FlapPortal — Robinhood Chain's real RWA swap contract.
// Reverse-engineered from live txs + verified via eth_call simulation.
// Buy : ETH →(auto-wrap)→ WETH →(V3)→ USDG →(per-stock settlement pool)→ Stock
// Sell: Stock →(settlement pool)→ USDG →(V3)→ WETH →(type-4 unwrap)→ ETH
// Settlement pools are PER-STOCK (fetched from /api/rwa/flap-pool/:address).
const FLAP_PORTAL  = '0xC94135b63772b91D79d0A2DaAb2a8801f32359bD' as `0x${string}`;
const RH_CHAIN_ID  = 4663;
const TRADE_GAS    = 500_000n;

// Route components (Robinhood Chain)
const _WETH     = '0bd7d308f8e1639fab988df18a8011f41eacad73'; // Wrapped ETH on RH Chain
const _USDG     = '5fc5360d0400a0fd4f2af552add042d716f1d168'; // USDG stablecoin (Robinhood)
const _WUSDG_V3 = '52e65b17fb6e5ba00ed806f37afcd2daa50271ca'; // WETH/USDG Uniswap V3 pool (fee=100)
const _EEE      = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'; // native-ETH sentinel
const _FLAP_HEX = 'c94135b63772b91d79d0a2daab2a8801f32359bd'; // FlapPortal (embedded in callback)
const _BUY_SEL  = '77963966'; // FlapPortal.swap() selector (buys AND sells)

// Allowance target: FlapPortal (for sell direction)
const RH_ROUTER = FLAP_PORTAL; // approve FlapPortal, not old router

const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

/* ─── FlapPortal calldata builder ────────────────────────────────────────── */
// Build raw calldata for FlapPortal.swap(tokenIn, tokenOut, amountIn, minAmountOut,
//   recipient, deadline, referrer=0, feeSplit=0, param8=0, b32_1=0, b32_2=0, Route[])
// Route struct: 9 fixed slots (type, pool, tokenIn, tokenOut, amountIn, f5, minOut,
//   bytesOffset=288, field8) + bytes extra (padded to 32-byte boundary)
function buildFlapBuyData(
  tokenOut: string,     // stock address with 0x
  amountIn: bigint,     // ETH in wei
  minAmountOut: bigint, // min stock tokens out (wei, 18 dec)
  recipient: string,    // user wallet with 0x
  deadline: number,     // unix timestamp seconds
  settlePool: string,   // per-stock settlement pool with 0x
): `0x${string}` {
  const a = (s: string) => '000000000000000000000000' + s.replace(/^0x/i,'').toLowerCase().padStart(40,'0');
  const u = (n: bigint | number) => BigInt(n).toString(16).padStart(64,'0');
  const z = '0'.repeat(64);

  const tok = tokenOut.replace(/^0x/i,'').toLowerCase().padStart(40,'0');

  // Route 1 callback (164 bytes):
  // selector(4) + int256(0)(32) + int256(0)(32) + uint256(minOut)(32) + addr(portal)(32) + uint256(deadline)(32)
  const cbData =
    '2203d44a' +           // selector (4 B = 8 hex)
    u(0n) +                // amount0Delta = 0 (32 B)
    u(0n) +                // amount1Delta = 0 (32 B)
    u(minAmountOut) +      // minAmountOut (32 B)
    a(_FLAP_HEX) +         // FlapPortal address (32 B)
    u(deadline);           // deadline (32 B)
  // = 8+64+64+64+64+64 = 328 hex = 164 bytes; pad to 192 (6 words)
  const cbPadded = cbData + '0'.repeat(56); // 28 bytes padding = 56 hex

  // Fixed params (words 0-11)
  const fixedParams = [
    a(_EEE),                                       // [0] tokenIn = ETH sentinel
    '000000000000000000000000' + tok,              // [1] tokenOut = stock
    u(amountIn),                                   // [2] amountIn
    u(minAmountOut),                               // [3] minAmountOut
    a(recipient),                                  // [4] recipient
    u(deadline),                                   // [5] deadline
    z,                                             // [6] referrer = 0
    z,                                             // [7] feeSplit = 0
    z,                                             // [8] param8 = 0
    z,                                             // [9] bytes32 signature A = 0 (experimental)
    z,                                             // [10] bytes32 signature B = 0
    u(0x180n),                                     // [11] routesOffset = 12*32 = 384
  ].join('');

  // Routes array head (words 12-14)
  const routesHead = [
    u(2n),       // [12] routeCount = 2
    u(0x40n),    // [13] route[0] offset from head = 64
    u(0x1a0n),   // [14] route[1] offset from head = 416
  ].join('');

  // Route 0: WETH→USDG via V3 pool (words 15-25, 11 words)
  // 9 fixed slots + length(1 word) + data(1 word=32 bytes=fee tier)
  const route0 = [
    u(2n),            // [0] type = 2 (V3)
    a(_WUSDG_V3),     // [1] pool = WETH/USDG V3
    a(_WETH),         // [2] tokenIn = WETH
    a(_USDG),         // [3] tokenOut = USDG
    u(amountIn),      // [4] amountIn (no referrer fee)
    z,                // [5] field5 = 0
    z,                // [6] minAmountOut = 0 (not checked in route0)
    u(0x120n),        // [7] bytesOffset = 288 (= 9 slots × 32)
    z,                // [8] field8 = 0 (V3 sqrtPriceLimitX96 = no limit)
    u(32n),           // bytes length = 32
    u(100n),          // bytes data = fee tier 100 (0.01%)
  ].join('');

  // Route 1: USDG→Stock via settlement pool (words 26-41, 16 words)
  // 9 fixed slots + length(1 word) + callback data(6 words=192 bytes)
  const route1 = [
    z,                                 // [0] type = 0 (native settlement)
    a(settlePool),                     // [1] pool = per-stock settlement contract
    a(_USDG),                          // [2] tokenIn = USDG
    '000000000000000000000000' + tok,  // [3] tokenOut = stock
    z,                                 // [4] amountIn = 0 (not pre-specified)
    z,                                 // [5] field5 = 0
    u(minAmountOut),                   // [6] minAmountOut
    u(0x120n),                         // [7] bytesOffset = 288
    u(36n),                            // [8] field8 = 0x24 (settlement reads cb from offset 36)
    u(164n),                           // bytes length = 164
    cbPadded,                          // bytes data (192 bytes = 6 words, padded)
  ].join('');

  const data = fixedParams + routesHead + route0 + route1;
  return `0x${_BUY_SEL}${data}` as `0x${string}`;
}

/* ─── FlapPortal SELL calldata builder ───────────────────────────────────── */
// Same swap() selector, 3 routes (decoded from live sell tx, verified via
// state-override eth_call simulation — signature words NOT required):
//   route0: Stock→USDG via settlement pool (callback = [1, amountIn, 1, portal, deadline])
//   route1: USDG→WETH via V3 pool (fee 100), carries the ETH minOut check
//   route2: type-4 WETH unwrap → native ETH to recipient
function buildFlapSellData(
  tokenIn: string,      // stock address with 0x
  amountIn: bigint,     // stock tokens in (wei, 18 dec)
  minEthOut: bigint,    // min native ETH out (wei)
  recipient: string,    // user wallet with 0x
  deadline: number,     // unix timestamp seconds
  settlePool: string,   // per-stock settlement pool with 0x
): `0x${string}` {
  const a = (s: string) => '000000000000000000000000' + s.replace(/^0x/i,'').toLowerCase().padStart(40,'0');
  const u = (n: bigint | number) => BigInt(n).toString(16).padStart(64,'0');
  const z = '0'.repeat(64);

  // Settlement callback (164 B): selector + [1, amountIn, 1, portal, deadline]
  const cbPadded =
    '2203d44a' + u(1n) + u(amountIn) + u(1n) + a(_FLAP_HEX) + u(deadline) + '0'.repeat(56);

  const fixedParams = [
    a(tokenIn),        // [0] tokenIn = stock
    a(_EEE),           // [1] tokenOut = native ETH sentinel
    u(amountIn),       // [2] amountIn (stock wei)
    u(minEthOut),      // [3] minAmountOut (ETH wei)
    a(recipient),      // [4] recipient
    u(deadline),       // [5] deadline
    z, z, z,           // [6] referrer=0 · [7] feeIn=0 · [8] feeOut=0
    z, z,              // [9][10] signature words = 0 (optional, proven)
    u(0x180n),         // [11] routesOffset = 384
  ].join('');

  const routesHead = [u(3n), u(0x60n), u(0x260n), u(0x3c0n)].join('');

  // Route 0: Stock→USDG via settlement pool (16 words)
  const route0 = [
    z, a(settlePool), a(tokenIn), a(_USDG),
    u(amountIn), z, u(1n), u(0x120n), u(36n), u(164n), cbPadded,
  ].join('');
  // Route 1: USDG→WETH via V3 (11 words) — enforces the ETH minOut
  const route1 = [
    u(2n), a(_WUSDG_V3), a(_USDG), a(_WETH),
    z, z, u(minEthOut), u(0x120n), z, u(32n), u(100n),
  ].join('');
  // Route 2: WETH → native ETH unwrap (10 words, type 4, pool = WETH contract)
  const route2 = [
    u(4n), a(_WETH), a(_WETH), a(_EEE),
    z, z, u(1n), u(0x120n), z, u(0n),
  ].join('');

  return `0x${_BUY_SEL}${fixedParams + routesHead + route0 + route1 + route2}` as `0x${string}`;
}

/* ─── helpers ────────────────────────────────────────────────────────────── */
const _BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
const api = (p: string) => _BASE + p;

function usd(n: number, dec = 2) {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
  return `$${n.toFixed(dec)}`;
}
function pct(n: number) {
  if (!n && n !== 0) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
function vol(n: number) {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}
function eth(n: number) {
  if (!n) return '0 ETH';
  if (n < 0.0001) return `${n.toFixed(8)} ETH`;
  if (n < 0.01)   return `${n.toFixed(6)} ETH`;
  return `${n.toFixed(4)} ETH`;
}

/* ─── Types ──────────────────────────────────────────────────────────────── */
type Quote = {
  symbol: string; name: string; address: string; logoUrl: string;
  price: number; change: number; changePct: number;
  open: number; high: number; low: number; volume: number;
  fiftyTwoHigh: number; fiftyTwoLow: number; currency: string;
};

/* ─── TradingView symbol map ─────────────────────────────────────────────── */
const TV: Record<string, string> = {
  NVDA: 'NASDAQ:NVDA', SPCX: 'NASDAQ:SPCX', AAPL: 'NASDAQ:AAPL',
  GOOGL:'NASDAQ:GOOGL', TSLA:'NASDAQ:TSLA',  PLTR: 'NASDAQ:PLTR',
  AMD:  'NASDAQ:AMD',   META:'NASDAQ:META',  MSFT: 'NASDAQ:MSFT',
  AMZN: 'NASDAQ:AMZN', MU:  'NASDAQ:MU',    ORCL: 'NYSE:ORCL',
  SNDK: 'NASDAQ:WDC',  SPY: 'AMEX:SPY',     QQQ:  'NASDAQ:QQQ',
  COIN: 'NASDAQ:COIN', AVGO:'NASDAQ:AVGO',
};

/* ─── Static catalogue (top 15 by on-chain volume) ──────────────────────── */
const CATALOGUE: Quote[] = [
  { symbol:'NVDA',  name:'NVIDIA Corp.',           address:'0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'SPCX',  name:'Procure Space ETF',       address:'0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'AAPL',  name:'Apple Inc.',              address:'0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xaf3d76f1834a1d425780943c99ea8a608f8a93f9.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'GOOGL', name:'Alphabet Inc.',            address:'0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'TSLA',  name:'Tesla Inc.',               address:'0x322F0929c4625eD5bAd873c95208D54E1c003b2d', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x322f0929c4625ed5bad873c95208d54e1c003b2d.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'PLTR',  name:'Palantir Technologies',   address:'0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'AMD',   name:'Advanced Micro Devices',  address:'0x86923f96303D656E4aa86D9d42D1e57ad2023fdC', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x86923f96303d656e4aa86d9d42d1e57ad2023fdc.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'META',  name:'Meta Platforms Inc.',      address:'0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xc0d6457c16cc70d6790dd43521c899c87ce02f35.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'MSFT',  name:'Microsoft Corp.',          address:'0xe93237C50D904957Cf27E7B1133b510C669c2e74', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xe93237c50d904957cf27e7b1133b510c669c2e74.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'AMZN',  name:'Amazon.com Inc.',          address:'0x12f190a9F9d7D37a250758b26824B97CE941bF54', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x12f190a9f9d7d37a250758b26824b97ce941bf54.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'MU',    name:'Micron Technology',        address:'0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xff080c8ce2e5feadaca0da81314ae59d232d4afd.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'ORCL',  name:'Oracle Corp.',             address:'0xb0992820E760d836549ba69BC7598b4af75dEE03', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xb0992820e760d836549ba69bc7598b4af75dee03.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'SPY',   name:'SPDR S&P 500 ETF',         address:'0x117cc2133c37B721F49dE2A7a74833232B3B4C0C', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x117cc2133c37b721f49de2a7a74833232b3b4c0c.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'QQQ',   name:'Invesco QQQ ETF',           address:'0xD5f3879160bc7c32ebb4dC785F8a4F505888de68', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xd5f3879160bc7c32ebb4dc785f8a4f505888de68.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'COIN',  name:'Coinbase Global',            address:'0x6330D8C3178a418788dF01a47479c0ce7CCF450b', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x6330d8c3178a418788df01a47479c0ce7ccf450b.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'CRWV',  name:'CoreWeave Inc.',             address:'0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x5f10a1c971b69e47e059e1dc91901b59b3fb49c3.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'INTC',  name:'Intel Corp.',                address:'0xc72b96e0E48ecd4DC75E1e45396e26300BC39681', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xc72b96e0e48ecd4dc75e1e45396e26300bc39681.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'BE',    name:'Bloom Energy',               address:'0x822CC93fFD030293E9842c30BBD678F530701867', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x822cc93ffd030293e9842c30bbd678f530701867.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'USAR',  name:'USA Rare Earth',             address:'0xd917B029C761D264c6A312BBbcDA868658eF86a6', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xd917b029c761d264c6a312bbbcda868658ef86a6.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'USO',   name:'United States Oil Fund',     address:'0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
];

/* ─── Logo URL via server-side proxy (cdn.robinhood.com blocks browsers) ─── */
/* ─── TradingView SVG logo map — same source as the chart header icons ────── */
const TV_BASE = 'https://s3-symbol-logo.tradingview.com';
const TV_LOGO: Record<string, string> = {
  NVDA:  `${TV_BASE}/nvidia--big.svg`,
  AAPL:  `${TV_BASE}/apple--big.svg`,
  GOOGL: `${TV_BASE}/alphabet--big.svg`,
  TSLA:  `${TV_BASE}/tesla--big.svg`,
  PLTR:  `${TV_BASE}/palantir--big.svg`,
  AMD:   `${TV_BASE}/advanced-micro-devices--big.svg`,
  META:  `${TV_BASE}/meta-platforms--big.svg`,
  MSFT:  `${TV_BASE}/microsoft--big.svg`,
  AMZN:  `${TV_BASE}/amazon--big.svg`,
  MU:    `${TV_BASE}/micron-technology--big.svg`,
  ORCL:  `${TV_BASE}/oracle--big.svg`,
  SPY:   `${TV_BASE}/state-street--big.svg`,       // SPDR = State Street
  QQQ:   `${TV_BASE}/invesco--big.svg`,            // Invesco QQQ
  SPCX:  '/spacex-logo.jpg', // local asset — parqet CDN blocks browsers
  COIN:  `${TV_BASE}/coinbase--big.svg`,
  CRWV:  `${TV_BASE}/coreweave--big.svg`,
  INTC:  `${TV_BASE}/intel--big.svg`,
  BE:    `${TV_BASE}/bloom-energy--big.svg`,
  USAR:  `${TV_BASE}/usa-rare-earth--big.svg`,
  USO:   `${TV_BASE}/united-states-commodity-funds--big.svg`,
};

/* ─── Token Logo ─────────────────────────────────────────────────────────── */
function TokenLogo({ symbol, size = 28 }: { address?: string; symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const letters = symbol.replace(/[^A-Z0-9]/g, '').slice(0, 2);
  const src = TV_LOGO[symbol];

  if (!src || failed) {
    return (
      <span
        className="flex items-center justify-center rounded-full font-bold font-mono shrink-0"
        style={{
          width: size, height: size, minWidth: size,
          fontSize: Math.round(size * 0.32),
          background: 'linear-gradient(135deg,#1e3a10,#0a1a05)',
          color: 'var(--out-ink)',
          border: '1px solid rgba(158,224,56,0.18)',
        }}
      >
        {letters}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={symbol}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{
        width: size, height: size, minWidth: size,
        borderRadius: '50%',
        objectFit: 'contain',
        background: '#fff',
        padding: Math.round(size * 0.1),
        display: 'block',
        boxSizing: 'border-box',
      }}
    />
  );
}

/* ─── TradingView chart ──────────────────────────────────────────────────── */
function TvChart({ symbol }: { symbol: string }) {
  const tvSym = TV[symbol] ?? `NASDAQ:${symbol}`;
  const src = [
    'https://s.tradingview.com/widgetembed/?',
    `symbol=${encodeURIComponent(tvSym)}`,
    '&interval=D&theme=dark&style=1&locale=en',
    '&hidesidetoolbar=0&hidetoptoolbar=0',
    '&hide_legend=0&hide_volume=0',
    '&enable_publishing=false&save_image=false',
    '&backgroundColor=%23080d08&gridColor=%231a2010',
  ].join('');

  return (
    <iframe
      key={symbol}
      src={src}
      title={`${symbol} chart`}
      style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#080d08' }}
      allowFullScreen
    />
  );
}

/* ─── Market list row ────────────────────────────────────────────────────── */
function MarketRow({ q, active, onClick }: { q: Quote; active: boolean; onClick: () => void }) {
  const up = q.changePct >= 0;
  const hasPrice = q.price > 0;
  const hasOhlcv = q.open > 0 || q.changePct !== 0; // false until Yahoo Finance data loads
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-[9px] border-b text-left transition-colors hover:bg-[#0d1708]"
      style={{
        borderBottomColor: 'var(--out-ink-dim)',
        background:  active ? '#111d08' : 'transparent',
        borderLeft:  active ? '2px solid var(--out-ink)' : '2px solid transparent',
        borderRight: 'none',
      }}
    >
      <TokenLogo address={q.address} symbol={q.symbol} size={26} />

      <div className="flex-1 min-w-0 font-mono">
        <div className="text-[11.5px] font-bold leading-tight" style={{ color: active ? 'var(--out-ink)' : 'var(--out-text)' }}>
          {q.symbol}
        </div>
        <div className="text-[9.5px] truncate leading-tight mt-[1px]" style={{ color: 'var(--out-muted)' }}>
          {q.name}
        </div>
      </div>

      <div className="text-right font-mono shrink-0">
        <div className="text-[11.5px] font-bold leading-tight" style={{ color: 'var(--out-text)' }}>
          {hasPrice ? `$${q.price >= 1000
            ? q.price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
            : q.price.toFixed(2)}` : <span style={{ color: 'var(--out-muted)' }}>···</span>}
        </div>
        <div className="text-[9.5px] leading-tight mt-[1px] flex items-center justify-end gap-[2px]"
          style={{ color: (!hasPrice || !hasOhlcv) ? 'var(--out-muted)' : up ? '#7ecb3b' : '#e05050' }}>
          {hasOhlcv && hasPrice && (up ? <TrendingUp size={8} strokeWidth={2} /> : <TrendingDown size={8} strokeWidth={2} />)}
          {hasOhlcv && hasPrice ? pct(q.changePct) : '—'}
        </div>
      </div>
    </button>
  );
}

/* ─── Stat cell ──────────────────────────────────────────────────────────── */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>{label}</span>
      <span className="text-[12px] font-mono font-bold" style={{ color: 'var(--out-text)' }}>{value}</span>
    </div>
  );
}

/* ─── Order panel ────────────────────────────────────────────────────────── */
type TxStep = 'form' | 'preview' | 'approving' | 'pending_approve' | 'swapping' | 'pending_swap' | 'done' | 'error';

function OrderPanel({ q, ethUsd }: { q: Quote; ethUsd: number }) {
  const { address: wallet, chain } = useAccount();
  const { switchChainAsync }        = useSwitchChain();

  const [side, setSide]   = useState<'buy' | 'sell'>('buy');
  const [qty, setQty]     = useState('');
  const [step, setStep]   = useState<TxStep>('form');
  const [errMsg, setErr]  = useState('');
  const [tradeId, setTid] = useState<number | null>(null);

  /* Computed amounts */
  const shares   = parseFloat(qty) || 0;
  const totalUsd = shares * (q.price || 0);
  const ethCost  = ethUsd > 0 ? totalUsd / ethUsd : 0;
  const sharesWei = shares > 0 ? parseUnits(shares.toFixed(8), 18) : 0n;
  const ethWei    = ethCost > 0 ? parseUnits(ethCost.toFixed(8), 18) : 0n;

  const tokenAddr = (q.address ?? '') as `0x${string}`;
  const explorerUrl = tokenAddr && !tokenAddr.startsWith('0x000000000000')
    ? `https://robinhoodchain.blockscout.com/token/${tokenAddr}` : null;

  /* ── Per-stock settlement pool (required for FlapPortal routing) ── */
  const { data: poolData, isError: poolError } = useQuery<{ pool: string }>({
    queryKey: ['flap-pool', tokenAddr],
    queryFn: async () => {
      const r = await fetch(api(`/api/rwa/flap-pool/${tokenAddr}`));
      if (!r.ok) throw new Error('pool not found');
      return r.json();
    },
    enabled: !!tokenAddr,
    staleTime: Infinity,
    retry: 1,
  });
  const settlePool = poolData?.pool;

  /* ── Live on-chain rates (reference-amount eth_call quotes, 6s poll) ── */
  const { data: buyRate } = useQuery<{ ethIn: string; amountOut: string }>({
    queryKey: ['flap-quote', tokenAddr],
    queryFn: async () => {
      const r = await fetch(api(`/api/rwa/flap-quote?token=${tokenAddr.toLowerCase()}`));
      if (!r.ok) throw new Error('quote failed');
      return r.json();
    },
    enabled: !!settlePool && side === 'buy',
    refetchInterval: 6_000,
    staleTime: 4_000,
  });
  const { data: sellRate } = useQuery<{ amountIn: string; ethOut: string; exact: boolean }>({
    queryKey: ['flap-sell-quote', tokenAddr],
    queryFn: async () => {
      const r = await fetch(api(`/api/rwa/flap-sell-quote?token=${tokenAddr.toLowerCase()}`));
      if (!r.ok) throw new Error('quote failed');
      return r.json();
    },
    enabled: !!settlePool && side === 'sell',
    refetchInterval: 6_000,
    staleTime: 4_000,
  });

  /* Live amounts, linear-scaled from the reference rate:
     buy  → exact ETH to pay so `sharesWei` arrive; sell → exact ETH received */
  const buyEthWei = (buyRate && sharesWei > 0n && BigInt(buyRate.amountOut) > 0n)
    ? (sharesWei * BigInt(buyRate.ethIn)) / BigInt(buyRate.amountOut)
    : 0n;
  const sellEthWei = (sellRate && sharesWei > 0n && BigInt(sellRate.amountIn) > 0n)
    ? (sharesWei * BigInt(sellRate.ethOut)) / BigInt(sellRate.amountIn)
    : 0n;
  const liveEthWei = side === 'buy' ? buyEthWei : sellEthWei;
  const liveEthNum = liveEthWei > 0n ? parseFloat(formatUnits(liveEthWei, 18)) : 0;
  const dispEth    = liveEthNum > 0 ? liveEthNum : ethCost;  // UI: live quote → YF estimate
  const onchainPx  = buyRate && BigInt(buyRate.amountOut) > 0n
    ? (Number(BigInt(buyRate.ethIn)) / Number(BigInt(buyRate.amountOut))) * ethUsd
    : 0;

  /* ── Wagmi: send + wait ──
     IMPORTANT: hashes must be in state (not refs) so useWaitForTransactionReceipt
     re-renders when the hash becomes available after sendTransaction resolves. */
  const { sendTransaction } = useSendTransaction();
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>(undefined);
  const [swapHash,    setSwapHash]    = useState<`0x${string}` | undefined>(undefined);

  const { isSuccess: approveOk, isError: approveFail } =
    useWaitForTransactionReceipt({ hash: approveHash, query: { enabled: !!approveHash } });
  const { isSuccess: swapOk, isError: swapFail } =
    useWaitForTransactionReceipt({ hash: swapHash, query: { enabled: !!swapHash } });

  /* ── ETH balance ── */
  const { data: ethBal } = useBalance({
    address: wallet ?? undefined,
    query: { enabled: !!wallet, refetchInterval: 15_000 },
  });
  const ethBalNum = ethBal ? parseFloat(formatUnits(ethBal.value, 18)) : null;

  /* ── RWA token balance ── */
  const { data: tokenBal } = useBalance({
    address: wallet ?? undefined,
    token: tokenAddr || undefined,
    query: { enabled: !!wallet && !!tokenAddr && side === 'sell', refetchInterval: 15_000 },
  } as any);
  const tokenBalNum = tokenBal ? parseFloat(formatUnits(tokenBal.value, 18)) : null;

  /* ── Allowance (for sell) — approve RH_ROUTER, not any V3 router ── */
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddr || undefined, abi: ERC20_ABI, functionName: 'allowance',
    args: wallet ? [wallet, RH_ROUTER] : undefined,
    query: { enabled: !!wallet && side === 'sell' && !!tokenAddr, refetchInterval: 10_000 },
  } as any);
  const needsApproval = side === 'sell' && sharesWei > 0n
    && (allowance === undefined || (allowance as bigint) < sharesWei);

  /* ── Chain guard ── */
  const ensureChain = useCallback(async (): Promise<boolean> => {
    if (chain?.id === RH_CHAIN_ID || chain?.id === 46630) return true;
    try { await switchChainAsync({ chainId: RH_CHAIN_ID }); return true; }
    catch {
      setErr('Switch your wallet to Robinhood Chain (4663) to trade.');
      setStep('error'); return false;
    }
  }, [chain, switchChainAsync]);

  /* ── React to tx receipts ── */
  useEffect(() => {
    if (approveOk && step === 'pending_approve') {
      refetchAllowance();
      setStep('swapping');
      execSwap();
    }
    if (approveFail && step === 'pending_approve') {
      setErr('Approval transaction failed or was rejected.');
      setStep('error');
    }
  }, [approveOk, approveFail]);

  useEffect(() => {
    if (swapOk && step === 'pending_swap') recordAndFinish(swapHash);
    if (swapFail && step === 'pending_swap') { setErr('Swap transaction failed or was rejected.'); setStep('error'); }
  }, [swapOk, swapFail]);

  /* ── Record trade to DB + prompt wallet to track token ── */
  async function recordAndFinish(txH: `0x${string}` | undefined) {
    // Prompt MetaMask / any EIP-747 wallet to add the token to its asset list
    if (side === 'buy') {
      try {
        await (window as any).ethereum?.request({
          method: 'wallet_watchAsset',
          params: {
            type: 'ERC20',
            options: { address: tokenAddr, symbol: q.symbol, decimals: 18, image: q.logoUrl },
          },
        });
      } catch { /* user dismissed — non-fatal */ }
    }
    try {
      const r = await fetch(api('/api/rwa/trades'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: wallet, symbol: q.symbol, side,
          shares: shares.toFixed(8), priceUsd: q.price.toFixed(4),
          ethAmount: (liveEthNum > 0 ? liveEthNum : ethCost).toFixed(8), totalUsd: totalUsd.toFixed(4),
          txHash: txH ?? null,
          status: 'confirmed', source: 'manual', network: 'robinhood-chain',
        }),
      });
      if (r.ok) { const d = await r.json(); setTid(d.trade?.id ?? null); }
    } catch { /* non-fatal — swap already on-chain */ }
    setStep('done');
  }

  /* ── Approve FlapPortal to spend stock token (sell only) ── */
  async function execApprove() {
    if (!(await ensureChain())) return;
    setStep('approving');
    const MAX  = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [FLAP_PORTAL, MAX] });
    sendTransaction({ to: tokenAddr, data, gas: TRADE_GAS }, {
      onError: e => { setErr(e.message.slice(0, 200)); setStep('error'); },
      onSuccess: hash => { setApproveHash(hash); setStep('pending_approve'); },
    });
  }

  /* ── Swap via FlapPortal directly ── */
  async function execSwap() {
    if (!(await ensureChain())) return;
    if (!settlePool) {
      setErr(`No settlement pool found for ${q.symbol} — this token cannot be traded on FlapPortal yet.`);
      setStep('error'); return;
    }
    setStep('swapping');
    const dl = Math.floor(Date.now() / 1000) + 1800; // 30 min deadline (portal caps far-future deadlines)

    if (side === 'buy') {
      // Pay the live-quoted ETH amount (linear-scaled eth_call rate); fallback = YF estimate
      const payWei = buyEthWei > 0n ? buyEthWei : ethWei;
      if (payWei <= 0n) { setErr('Live quote not ready — wait a second and retry.'); setStep('error'); return; }
      if (ethBal && payWei > ethBal.value) {
        setErr(`Insufficient ETH — need ${formatUnits(payWei, 18).slice(0, 10)} ETH plus gas.`);
        setStep('error'); return;
      }
      const minOut = sharesWei * 98n / 100n; // max 2% slippage, enforced on-chain
      const data   = buildFlapBuyData(tokenAddr, payWei, minOut, wallet as string, dl, settlePool);
      sendTransaction({ to: FLAP_PORTAL, value: payWei, data, gas: TRADE_GAS }, {
        onError: e => { setErr(e.message.slice(0, 200)); setStep('error'); },
        onSuccess: hash => { setSwapHash(hash); setStep('pending_swap'); },
      });
    } else {
      // Sell: stock → USDG (settlement) → WETH (V3) → native ETH (unwrap)
      if (tokenBal && sharesWei > tokenBal.value) {
        setErr(`Insufficient ${q.symbol} — you hold ${formatUnits(tokenBal.value, 18).slice(0, 10)}.`);
        setStep('error'); return;
      }
      if (sellEthWei <= 0n) { setErr('Live sell quote not ready — wait a second and retry.'); setStep('error'); return; }
      const minEthOut = sellEthWei * 98n / 100n; // max 2% slippage, enforced on-chain
      const data = buildFlapSellData(tokenAddr, sharesWei, minEthOut, wallet as string, dl, settlePool);
      sendTransaction({ to: FLAP_PORTAL, value: 0n, data, gas: TRADE_GAS }, {
        onError: e => { setErr(e.message.slice(0, 200)); setStep('error'); },
        onSuccess: hash => { setSwapHash(hash); setStep('pending_swap'); },
      });
    }
  }

  /* ── Main action handler ── */
  async function handleExecute() {
    if (!(await ensureChain())) return;
    if (side === 'sell' && needsApproval) { await execApprove(); }
    else { await execSwap(); }
  }

  /* ── UI helpers ── */
  const buyColor  = '#7ecb3b';
  const sellColor = '#e05050';
  const sideColor = side === 'buy' ? buyColor : sellColor;
  const canPreview = !!(wallet && shares > 0 && q.price > 0 && !poolError);
  const isSpinning = step === 'approving' || step === 'pending_approve' || step === 'swapping' || step === 'pending_swap';

  function reset() {
    setStep('form'); setQty(''); setErr(''); setTid(null);
    setApproveHash(undefined); setSwapHash(undefined);
  }

  const buyColor2  = '#7ecb3b';
  const sellColor2 = '#e05050';

  /* ── Work Order Preview ── */
  if (step === 'preview') {
    const isSell2 = side === 'sell';
    return (
      <div className="flex flex-col gap-0 h-full font-mono">
        <div className="p-4 flex flex-col gap-3 flex-1">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>WORK ORDER</span>
            <span className="text-[9px] uppercase tracking-widest border px-1.5 py-0.5"
              style={{ borderColor: 'var(--out-ink-dim)', color: isSell2 ? sellColor2 : buyColor2 }}>
              {isSell2 ? '▼ SELL' : '▲ BUY'} {q.symbol}
            </span>
          </div>

          {/* Parameter table */}
          <div className="border p-3 text-[10px] space-y-2" style={{ borderColor: 'var(--out-ink)', background: '#08100a' }}>
            {[
              { k: 'ACTION',    v: `${isSell2 ? 'SELL' : 'BUY'} ${q.symbol}` },
              { k: 'SHARES',    v: `${shares.toFixed(6)} ${q.symbol}` },
              { k: isSell2 ? 'RECEIVE' : 'PAY', v: `${isSell2 ? '≈ ' : ''}${eth(dispEth)}` },
              { k: 'QUOTE',     v: liveEthNum > 0 ? 'LIVE ON-CHAIN' : 'ESTIMATE' },
              { k: 'USD VALUE', v: usd(totalUsd) },
              { k: 'ROUTER',    v: 'FlapPortal · per-stock settlement' },
              { k: 'CHAIN',     v: 'Robinhood Chain 4663' },
            ].map(({ k, v }) => (
              <div key={k} className="flex justify-between items-start gap-2">
                <span style={{ color: 'var(--out-muted)' }}>{k}</span>
                <span className="text-right font-bold" style={{ color: 'var(--out-ink)' }}>{v}</span>
              </div>
            ))}
            <div className="border-t pt-2 space-y-1" style={{ borderColor: 'var(--out-ink-dim)' }}>
              <div className="flex justify-between text-[9px]">
                <span style={{ color: 'var(--out-muted)' }}>SLIPPAGE</span>
                <span style={{ color: '#7ecb3b' }}>max 2% (on-chain enforced)</span>
              </div>
              <div className="flex justify-between text-[9px]">
                <span style={{ color: 'var(--out-muted)' }}>GAS LIMIT</span>
                <span style={{ color: 'var(--out-muted)' }}>{TRADE_GAS.toString()}</span>
              </div>
              {isSell2 && needsApproval && (
                <div className="flex justify-between text-[9px]">
                  <span style={{ color: 'var(--out-muted)' }}>STEPS</span>
                  <span style={{ color: '#e09020' }}>1. APPROVE  2. SWAP</span>
                </div>
              )}
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 text-[9px] border px-2 py-1.5"
            style={{ borderColor: '#e0902040', background: '#0d0a05', color: '#e09020' }}>
            <AlertTriangle size={10} className="shrink-0 mt-[1px]" />
            <span>Settles at the live on-chain oracle rate. minAmountOut enforces max 2% slippage — a worse fill reverts the whole swap.</span>
          </div>

          {/* OHLCV mini */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3" style={{ borderColor: 'var(--out-ink-dim)' }}>
            <Stat label="PRICE" value={usd(q.price)} />
            <Stat label="OPEN"  value={q.open  ? usd(q.open) : '—'} />
            <Stat label="HIGH"  value={q.high  ? usd(q.high) : '—'} />
            <Stat label="LOW"   value={q.low   ? usd(q.low)  : '—'} />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-0 border-t shrink-0" style={{ borderColor: 'var(--out-ink-dim)' }}>
          <button onClick={reset}
            className="flex-1 py-3 text-[11px] uppercase tracking-widest border-r transition-colors"
            style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
            CANCEL
          </button>
          <button onClick={handleExecute}
            className="flex-1 py-3 text-[11px] uppercase tracking-widest font-bold transition-all"
            style={{ color: sideColor, background: '#0e1a08' }}>
            {isSell2 && needsApproval ? '① APPROVE FIRST' : '⬡ SIGN & SEND'}
          </button>
        </div>
      </div>
    );
  }

  /* ── Pending / Done / Error states ── */
  if (step !== 'form') {
    const txHash = swapHash ?? approveHash;
    const explorerTx = txHash
      ? `https://robinhoodchain.blockscout.com/tx/${txHash}` : null;
    return (
      <div className="flex flex-col gap-4 p-4 h-full font-mono justify-center">
        {step === 'done' && (
          <>
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 size={28} style={{ color: '#7ecb3b' }} />
              <span className="text-[11px] uppercase tracking-widest" style={{ color: '#7ecb3b' }}>SWAP CONFIRMED</span>
              {tradeId && <span className="text-[10px]" style={{ color: 'var(--out-muted)' }}>Order #{tradeId} · Dashboard → RWA Portfolio</span>}
            </div>
            {explorerTx && (
              <a href={explorerTx} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-1.5 text-[10px] border py-1.5 transition-opacity hover:opacity-80"
                style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
                VIEW ON BLOCKSCOUT <ExternalLink size={9} />
              </a>
            )}
            <button onClick={reset}
              className="py-2 border text-[11px] uppercase tracking-widest text-center transition-colors"
              style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
              NEW ORDER
            </button>
          </>
        )}

        {(step === 'approving' || step === 'pending_approve') && (
          <div className="flex flex-col items-center gap-3 py-4">
            <RefreshCw size={22} className="animate-spin" style={{ color: '#e09020' }} />
            <span className="text-[11px] uppercase tracking-widest" style={{ color: '#e09020' }}>
              {step === 'approving' ? 'AWAITING SIGNATURE…' : 'CONFIRMING APPROVAL…'}
            </span>
            <span className="text-[10px] text-center" style={{ color: 'var(--out-muted)' }}>Step 1 of 2 — Approve {q.symbol} for FlapPortal</span>
            {explorerTx && (
              <a href={explorerTx} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-[10px] transition-opacity hover:opacity-80"
                style={{ color: 'var(--out-muted)' }}>
                View tx <ExternalLink size={9} />
              </a>
            )}
          </div>
        )}

        {(step === 'swapping' || step === 'pending_swap') && (
          <div className="flex flex-col items-center gap-3 py-4">
            <RefreshCw size={22} className="animate-spin" style={{ color: 'var(--out-ink)' }} />
            <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>
              {step === 'swapping' ? 'AWAITING SIGNATURE…' : 'SWAP PENDING ON-CHAIN…'}
            </span>
            <span className="text-[10px] text-center" style={{ color: 'var(--out-muted)' }}>
              FlapPortal.swap() · {side === 'buy' ? `ETH→USDG→${q.symbol}` : `${q.symbol}→USDG→ETH`} · Robinhood Chain
            </span>
            {explorerTx && (
              <a href={explorerTx} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-[10px] transition-opacity hover:opacity-80"
                style={{ color: 'var(--out-muted)' }}>
                Track on Blockscout <ExternalLink size={9} />
              </a>
            )}
          </div>
        )}

        {step === 'error' && (
          <>
            <div className="flex flex-col items-center gap-3 py-4">
              <XCircle size={28} style={{ color: '#e05050' }} />
              <span className="text-[11px] uppercase tracking-widest" style={{ color: '#e05050' }}>TRANSACTION FAILED</span>
              {errMsg && <span className="text-[10px] text-center break-all" style={{ color: 'var(--out-muted)' }}>{errMsg}</span>}
            </div>
            <button onClick={reset}
              className="py-2 border text-[11px] uppercase tracking-widest text-center transition-colors"
              style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
              TRY AGAIN
            </button>
          </>
        )}
      </div>
    );
  }

  /* ── Default: form ── */
  return (
    <div className="flex flex-col h-full font-mono">

      {/* BUY / SELL tabs */}
      <div className="flex shrink-0 border-b" style={{ borderColor: 'var(--out-ink-dim)' }}>
        {(['buy', 'sell'] as const).map(s => (
          <button key={s}
            onClick={() => { setSide(s); setErr(''); }}
            className="flex-1 py-2.5 text-[11px] uppercase tracking-widest transition-colors"
            style={{
              color:        side === s ? (s === 'buy' ? buyColor : sellColor) : 'var(--out-muted)',
              background:   side === s ? '#0e1a08' : 'transparent',
              borderBottom: `2px solid ${side === s ? (s === 'buy' ? buyColor : sellColor) : 'transparent'}`,
            }}>
            {s === 'buy' ? '▲ BUY' : '▼ SELL'}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 p-4 flex-1 overflow-y-auto">

        {/* Balance */}
        {wallet && (
          <div className="flex justify-between text-[10px]" style={{ color: 'var(--out-muted)' }}>
            <span>{side === 'buy' ? 'ETH BALANCE' : `${q.symbol} BALANCE`}</span>
            <button
              onClick={() => {
                if (side === 'buy' && ethBalNum !== null) {
                  const reserve = 0.001;
                  setQty(ethBalNum > reserve
                    ? ((ethBalNum - reserve) * ethUsd / (q.price || 1)).toFixed(6)
                    : '0');
                } else if (side === 'sell' && tokenBalNum !== null) {
                  setQty(tokenBalNum.toFixed(6));
                }
              }}
              className="font-bold underline underline-offset-2 transition-opacity hover:opacity-70"
              style={{ color: 'var(--out-ink)' }}>
              {side === 'buy'
                ? (ethBalNum !== null ? `${ethBalNum.toFixed(4)} ETH` : '—')
                : (tokenBalNum !== null ? `${tokenBalNum.toFixed(4)} ${q.symbol}` : '—')}
            </button>
          </div>
        )}

        {/* Quantity */}
        <div>
          <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--out-muted)' }}>
            Shares ({q.symbol})
          </label>
          <input
            type="number" min="0" step="0.001" placeholder="0.000000" value={qty}
            onChange={e => { setQty(e.target.value); setErr(''); }}
            className="w-full bg-transparent border px-3 py-2 text-[13px] font-mono outline-none transition-colors"
            style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-text)' }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--out-ink)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--out-ink-dim)')}
          />
        </div>

        {/* Cost estimates */}
        {shares > 0 && q.price > 0 && (
          <div className="border p-3 text-[11px] space-y-2" style={{ borderColor: 'var(--out-grid-major)', background: '#08100a' }}>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--out-muted)' }}>USD TOTAL</span>
              <span className="font-bold" style={{ color: 'var(--out-text)' }}>{usd(totalUsd)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--out-muted)' }}>
                {side === 'buy' ? 'ETH COST' : 'ETH RECEIVE'}{liveEthNum > 0 ? ' · LIVE' : ' · EST'}
              </span>
              <span className="font-bold" style={{ color: liveEthNum > 0 ? '#7ecb3b' : 'var(--out-ink)' }}>{eth(dispEth)}</span>
            </div>
            {onchainPx > 0 && side === 'buy' && (
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--out-muted)' }}>ONCHAIN PX</span>
                <span style={{ color: 'var(--out-muted)' }}>{usd(onchainPx)}</span>
              </div>
            )}
            <div className="flex justify-between items-center border-t pt-2" style={{ borderColor: 'var(--out-ink-dim)' }}>
              <span style={{ color: 'var(--out-muted)' }}>ETH PRICE</span>
              <span style={{ color: 'var(--out-muted)' }}>{usd(ethUsd, 0)}</span>
            </div>
            {side === 'sell' && needsApproval && (
              <div className="flex justify-between items-center border-t pt-2" style={{ borderColor: 'var(--out-ink-dim)' }}>
                <span style={{ color: '#e09020' }}>APPROVAL</span>
                <span style={{ color: '#e09020' }}>required (step 1)</span>
              </div>
            )}
          </div>
        )}

        {/* Contract link */}
        {explorerUrl && (
          <div className="flex items-center justify-between text-[10px] py-0.5">
            <span style={{ color: 'var(--out-muted)' }}>CONTRACT</span>
            <a href={explorerUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 transition-opacity hover:opacity-80"
              style={{ color: 'var(--out-muted)', fontFamily: 'monospace' }}>
              {tokenAddr.slice(0, 8)}…{tokenAddr.slice(-6)}
              <ExternalLink size={9} />
            </a>
          </div>
        )}

        {/* Pool missing — trading disabled */}
        {poolError && (
          <div className="flex items-start gap-2 text-[9px] border px-2 py-1.5"
            style={{ borderColor: '#e0505040', background: '#0d0505', color: '#e05050' }}>
            <AlertTriangle size={10} className="shrink-0 mt-[1px]" />
            <span>No FlapPortal settlement pool found for {q.symbol} — trading disabled.</span>
          </div>
        )}

        {/* Execute / connect */}
        {!wallet ? (
          <div className="py-2.5 border text-center text-[11px] uppercase tracking-widest"
            style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
            CONNECT WALLET
          </div>
        ) : (
          <button
            onClick={() => setStep('preview')}
            disabled={!canPreview || isSpinning}
            className="py-2.5 border text-[11px] uppercase tracking-widest font-mono flex items-center justify-center gap-2 transition-all"
            style={{
              borderColor: canPreview ? sideColor : 'var(--out-ink-dim)',
              color:       canPreview ? sideColor : 'var(--out-muted)',
              background:  canPreview ? '#0e1a08' : 'transparent',
              cursor: canPreview ? 'pointer' : 'not-allowed',
            }}>
            {`${side === 'buy' ? '▲ BUY' : '▼ SELL'} ${q.symbol} →`}
          </button>
        )}

        {/* OHLCV mini grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2 border-t" style={{ borderColor: 'var(--out-ink-dim)' }}>
          <Stat label="OPEN"  value={q.open  ? usd(q.open)  : '—'} />
          <Stat label="HIGH"  value={q.high  ? usd(q.high)  : '—'} />
          <Stat label="LOW"   value={q.low   ? usd(q.low)   : '—'} />
          <Stat label="VOL"   value={vol(q.volume)} />
          <Stat label="52W ↑" value={q.fiftyTwoHigh ? usd(q.fiftyTwoHigh) : '—'} />
          <Stat label="52W ↓" value={q.fiftyTwoLow  ? usd(q.fiftyTwoLow)  : '—'} />
        </div>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */
export function RwaPage() {
  const { address: _wallet } = useAccount();
  const [selected, setSelected] = useState<Quote>(CATALOGUE[0]);
  const lastSym = useRef(CATALOGUE[0].symbol);

  /* ── YF + Blockscout quotes (60s, OHLCV data) */
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<{ quotes: Quote[]; updatedAt: string }>({
    queryKey: ['rwa-quotes'],
    queryFn:  () => fetch(api('/api/rwa/quotes')).then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 2,
  });

  /* ── Real-time on-chain prices via FlapPortal eth_call (6s poll) */
  const { data: flapPrices } = useQuery<{ prices: Array<{ symbol: string; priceUsd: number }>; ethUsd: number }>({
    queryKey: ['flap-prices'],
    queryFn:  () => fetch(api('/api/rwa/flap-prices')).then(r => r.json()),
    refetchInterval: 6_000,
    staleTime: 4_000,
    retry: 1,
  });

  /* ── eth price (fallback when flap-prices unavailable) */
  const { data: ethData } = useQuery<{ usd: number }>({
    queryKey: ['eth-price'],
    queryFn:  () => fetch(api('/api/rwa/eth-price')).then(r => r.json()),
    refetchInterval: 300_000,
    staleTime: 180_000,
  });
  const ethUsd = flapPrices?.ethUsd ?? ethData?.usd ?? 1828;

  /* Merge: start from YF/Blockscout base, overlay real-time on-chain prices */
  const flapPriceMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of flapPrices?.prices ?? []) if (p.priceUsd > 0) m[p.symbol] = p.priceUsd;
    return m;
  }, [flapPrices]);

  const quotes: Quote[] = useMemo(() => {
    const base = data?.quotes?.length ? data.quotes : CATALOGUE;
    return base.map(q => flapPriceMap[q.symbol] ? { ...q, price: flapPriceMap[q.symbol] } : q);
  }, [data, flapPriceMap]);

  /* keep selected in sync with live data */
  useEffect(() => {
    const live = quotes.find(q => q.symbol === lastSym.current);
    if (live) setSelected(live);
  }, [dataUpdatedAt, flapPrices]);

  function pick(q: Quote) {
    const live = data?.quotes?.find(l => l.symbol === q.symbol) ?? q;
    lastSym.current = live.symbol;
    setSelected(live);
  }

  const up   = selected.changePct >= 0;
  const time = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <div
      className="flex flex-col font-mono"
      style={{ height: 'calc(100vh - 92px)', minHeight: 0, background: '#070c07' }}
    >
      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 shrink-0 border-b"
        style={{ height: 40, borderColor: 'var(--out-ink-dim)', background: '#080d08' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[12px] uppercase tracking-widest font-bold" style={{ color: 'var(--out-ink)' }}>
            RWA TRADE
          </span>
          <span className="text-[9px] uppercase tracking-widest border px-1.5 py-0.5"
            style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
            Robinhood Chain · 4663
          </span>
          <span className="text-[10px]" style={{ color: 'var(--out-muted)' }}>
            ETH {usd(ethUsd, 0)}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Router badge */}
          <span className="text-[9px] uppercase tracking-widest border px-1.5 py-0.5 flex items-center gap-1"
            style={{ borderColor: '#7ecb3b33', color: '#7ecb3b88' }}>
            <span className="w-1 h-1 rounded-full" style={{ background: '#7ecb3b' }} />
            FlapPortal
          </span>

          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-[10px] transition-colors"
            style={{ color: isLoading ? 'var(--out-ink)' : 'var(--out-muted)' }}
          >
            <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
            {time && <span className="hidden sm:inline">{time}</span>}
          </button>
        </div>
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT: market list ─────────────────────────────────────────── */}
        <div
          className="shrink-0 flex flex-col border-r"
          style={{ width: 224, borderColor: 'var(--out-ink-dim)', background: '#060b06' }}
        >
          {/* Column header */}
          <div
            className="flex items-center justify-between px-3 border-b shrink-0"
            style={{ height: 28, borderColor: 'var(--out-ink-dim)', background: '#060b06' }}
          >
            <span className="text-[8.5px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>ASSET</span>
            <span className="text-[8.5px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>PRICE / CHG</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
            {quotes.map(q => (
              <MarketRow
                key={q.symbol}
                q={q}
                active={selected.symbol === q.symbol}
                onClick={() => pick(q)}
              />
            ))}
          </div>

          {/* Powered-by footnote */}
        </div>

        {/* ── CENTER: chart + token header ──────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">

          {/* Token header strip */}
          <div
            className="flex items-center gap-3 px-4 shrink-0 border-b"
            style={{ height: 64, borderColor: 'var(--out-ink-dim)', background: '#080d08' }}
          >
            <TokenLogo address={selected.address} symbol={selected.symbol} size={36} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[16px] font-bold" style={{ color: 'var(--out-text)' }}>
                  {selected.symbol}
                </span>
                <span className="text-[11px] truncate" style={{ color: 'var(--out-muted)' }}>
                  {selected.name}
                </span>
                {selected.address && !selected.address.startsWith('0x0000000000000000') && (
                  <a
                    href={`https://robinhoodchain.blockscout.com/token/${selected.address}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-0.5 text-[9px] transition-opacity hover:opacity-80"
                    style={{ color: 'var(--out-muted)' }}
                  >
                    on-chain <ExternalLink size={8} />
                  </a>
                )}
              </div>

              <div className="flex items-baseline gap-2 mt-[2px]">
                <span className="text-[20px] font-bold leading-none" style={{ color: 'var(--out-ink)' }}>
                  {selected.price > 0
                    ? `$${selected.price >= 1000
                        ? selected.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : selected.price.toFixed(2)}`
                    : <span className="text-[14px]" style={{ color: 'var(--out-muted)' }}>···</span>}
                </span>
                {selected.price > 0 && (
                  <span className="text-[12px] flex items-center gap-1"
                    style={{ color: up ? '#7ecb3b' : '#e05050' }}>
                    {up ? <TrendingUp size={11} strokeWidth={2} /> : <TrendingDown size={11} strokeWidth={2} />}
                    {selected.change > 0 ? '+' : ''}{selected.change.toFixed(2)}&nbsp;
                    <span>({pct(selected.changePct)})</span>
                  </span>
                )}
              </div>
            </div>

            {/* Quick stats — hidden on narrow */}
            <div className="hidden lg:flex items-center gap-5 text-[10px] shrink-0 border-l pl-4"
              style={{ borderColor: 'var(--out-ink-dim)' }}>
              {[
                { k: 'VOLUME',  v: vol(selected.volume)      },
                { k: '52W ↑',   v: selected.fiftyTwoHigh ? usd(selected.fiftyTwoHigh) : '—' },
                { k: '52W ↓',   v: selected.fiftyTwoLow  ? usd(selected.fiftyTwoLow)  : '—' },
                { k: 'OPEN',    v: selected.open ? usd(selected.open) : '—' },
              ].map(s => (
                <div key={s.k} className="flex flex-col gap-[2px] text-right">
                  <span style={{ color: 'var(--out-muted)' }}>{s.k}</span>
                  <span className="font-bold" style={{ color: 'var(--out-text)' }}>{s.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* TradingView chart — fills remaining space */}
          <div className="flex-1 min-h-0" style={{ background: '#080d08', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              <TvChart symbol={selected.symbol} />
            </div>
          </div>
        </div>

        {/* ── RIGHT: order panel ────────────────────────────────────────── */}
        <div
          className="shrink-0 border-l flex flex-col"
          style={{ width: 260, borderColor: 'var(--out-ink-dim)', background: '#060b06' }}
        >
          {/* Panel label */}
          <div
            className="flex items-center px-4 border-b shrink-0"
            style={{ height: 28, borderColor: 'var(--out-ink-dim)', background: '#060b06' }}
          >
            <span className="text-[8.5px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
              ORDER ENTRY
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
            <OrderPanel q={selected} ethUsd={ethUsd} />
          </div>
        </div>
      </div>
    </div>
  );
}
