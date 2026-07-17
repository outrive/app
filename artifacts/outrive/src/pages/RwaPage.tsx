import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { RefreshCw, ExternalLink, CheckCircle2, XCircle, TrendingUp, TrendingDown } from 'lucide-react';

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
  { symbol:'SNDK',  name:'SanDisk Corp.',            address:'0xB90A19fF0Af67f7779afF50A882A9CfF42446400', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xb90a19ff0af67f7779aff50a882a9cff42446400.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'SPY',   name:'SPDR S&P 500 ETF',         address:'0x117cc2133c37B721F49dE2A7a74833232B3B4C0C', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x117cc2133c37b721f49de2a7a74833232b3b4c0c.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'QQQ',   name:'Invesco QQQ ETF',           address:'0xD5f3879160bc7c32ebb4dC785F8a4F505888de68', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xd5f3879160bc7c32ebb4dc785f8a4f505888de68.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
];

/* ─── Logo URL via server-side proxy (cdn.robinhood.com blocks browsers) ─── */
function logoProxyUrl(address: string) {
  const hex = address.replace(/^0x/i, '').toLowerCase();
  return api(`/api/rwa/logo/${hex}`);
}

/* ─── Token Logo ─────────────────────────────────────────────────────────── */
// Parqet is a public financial logo CDN — no proxy needed, browser requests work fine.
function parqetUrl(symbol: string) {
  return `https://assets.parqet.com/logos/symbol/${symbol}?format=png`;
}

function TokenLogo({ symbol, size = 28 }: { address?: string; symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const letters = symbol.replace(/[^A-Z0-9]/g, '').slice(0, 2);

  if (failed) {
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
      src={parqetUrl(symbol)}
      alt={symbol}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{
        width: size, height: size, minWidth: size,
        borderRadius: '50%',
        objectFit: 'contain',
        background: '#fff',
        padding: Math.round(size * 0.08),
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
function OrderPanel({ q, ethUsd, wallet }: { q: Quote; ethUsd: number; wallet?: string }) {
  const [side, setSide]   = useState<'buy' | 'sell'>('buy');
  const [qty, setQty]     = useState('');
  const [busy, setBusy]   = useState(false);
  const [msg, setMsg]     = useState<'ok' | 'err' | null>(null);
  const [tradeId, setTid] = useState<number | null>(null);

  const shares   = parseFloat(qty) || 0;
  const totalUsd = shares * (q.price || 0);
  const ethCost  = ethUsd > 0 ? totalUsd / ethUsd : 0;
  const canGo    = !!(wallet && shares > 0 && q.price > 0 && !busy);

  const explorerUrl = q.address && !q.address.startsWith('0x000000000000')
    ? `https://robinhoodchain.blockscout.com/token/${q.address}` : null;

  async function submit() {
    if (!canGo) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(api('/api/rwa/trades'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: wallet, symbol: q.symbol, side,
          shares: shares.toFixed(8), priceUsd: q.price.toFixed(4),
          ethAmount: ethCost.toFixed(8), totalUsd: totalUsd.toFixed(4),
          source: 'manual',
        }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setTid(d.trade?.id ?? null);
      setMsg('ok'); setQty('');
    } catch { setMsg('err'); }
    finally { setBusy(false); }
  }

  const buyColor  = '#7ecb3b';
  const sellColor = '#e05050';
  const sideColor = side === 'buy' ? buyColor : sellColor;

  return (
    <div className="flex flex-col h-full font-mono">

      {/* BUY / SELL tabs */}
      <div className="flex shrink-0 border-b" style={{ borderColor: 'var(--out-ink-dim)' }}>
        {(['buy', 'sell'] as const).map(s => (
          <button
            key={s}
            onClick={() => { setSide(s); setMsg(null); }}
            className="flex-1 py-2.5 text-[11px] uppercase tracking-widest transition-colors"
            style={{
              color:       side === s ? (s === 'buy' ? buyColor : sellColor) : 'var(--out-muted)',
              background:  side === s ? '#0e1a08' : 'transparent',
              borderBottom: `2px solid ${side === s ? (s === 'buy' ? buyColor : sellColor) : 'transparent'}`,
            }}
          >
            {s === 'buy' ? '▲ BUY' : '▼ SELL'}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 p-4 flex-1 overflow-y-auto">

        {/* Quantity */}
        <div>
          <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--out-muted)' }}>
            Shares
          </label>
          <input
            type="number" min="0" step="0.001" placeholder="0.000000" value={qty}
            onChange={e => { setQty(e.target.value); setMsg(null); }}
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
              <span style={{ color: 'var(--out-muted)' }}>ETH EQUIV</span>
              <span className="font-bold" style={{ color: 'var(--out-ink)' }}>{eth(ethCost)}</span>
            </div>
            <div className="flex justify-between items-center border-t pt-2" style={{ borderColor: 'var(--out-ink-dim)' }}>
              <span style={{ color: 'var(--out-muted)' }}>ETH PRICE</span>
              <span style={{ color: 'var(--out-muted)' }}>{usd(ethUsd, 0)}</span>
            </div>
          </div>
        )}

        {/* Contract link */}
        {explorerUrl && (
          <div className="flex items-center justify-between text-[10px] py-0.5">
            <span style={{ color: 'var(--out-muted)' }}>CONTRACT</span>
            <a href={explorerUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 transition-opacity hover:opacity-80"
              style={{ color: 'var(--out-muted)', fontFamily: 'monospace' }}>
              {q.address.slice(0, 8)}…{q.address.slice(-6)}
              <ExternalLink size={9} />
            </a>
          </div>
        )}

        {/* Submit */}
        {!wallet ? (
          <div className="py-2.5 border text-center text-[11px] uppercase tracking-widest"
            style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
            CONNECT WALLET
          </div>
        ) : (
          <button
            onClick={submit}
            disabled={!canGo}
            className="py-2.5 border text-[11px] uppercase tracking-widest font-mono flex items-center justify-center gap-2 transition-all"
            style={{
              borderColor: canGo ? sideColor : 'var(--out-ink-dim)',
              color:       canGo ? sideColor : 'var(--out-muted)',
              background:  canGo ? '#0e1a08' : 'transparent',
              cursor: canGo ? 'pointer' : 'not-allowed',
            }}
          >
            {busy
              ? <><RefreshCw size={11} className="animate-spin" /> PLACING…</>
              : `${side === 'buy' ? '▲ BUY' : '▼ SELL'} ${q.symbol}`}
          </button>
        )}

        {/* Feedback */}
        {msg === 'ok' && (
          <div className="flex items-center gap-2 text-[11px]" style={{ color: '#7ecb3b' }}>
            <CheckCircle2 size={12} />
            Order #{tradeId} recorded — see Dashboard → RWA Portfolio
          </div>
        )}
        {msg === 'err' && (
          <div className="flex items-center gap-2 text-[11px]" style={{ color: '#e05050' }}>
            <XCircle size={12} /> Failed — please try again
          </div>
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
  const { address: wallet } = useAccount();
  const [selected, setSelected] = useState<Quote>(CATALOGUE[0]);
  const lastSym = useRef(CATALOGUE[0].symbol);

  /* ── quotes */
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<{ quotes: Quote[]; updatedAt: string }>({
    queryKey: ['rwa-quotes'],
    queryFn:  () => fetch(api('/api/rwa/quotes')).then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 2,
  });

  /* ── eth price */
  const { data: ethData } = useQuery<{ usd: number }>({
    queryKey: ['eth-price'],
    queryFn:  () => fetch(api('/api/rwa/eth-price')).then(r => r.json()),
    refetchInterval: 300_000,
    staleTime: 180_000,
  });
  const ethUsd = ethData?.usd ?? 1828;

  const quotes = data?.quotes?.length ? data.quotes : CATALOGUE;

  /* keep selected in sync with live data */
  useEffect(() => {
    if (data?.quotes) {
      const live = data.quotes.find(q => q.symbol === lastSym.current);
      if (live) setSelected(live);
    }
  }, [dataUpdatedAt]);

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
          {/* Uniswap V3 badge */}
          <span className="text-[9px] uppercase tracking-widest border px-1.5 py-0.5 flex items-center gap-1"
            style={{ borderColor: '#7ecb3b33', color: '#7ecb3b88' }}>
            <span className="w-1 h-1 rounded-full" style={{ background: '#7ecb3b' }} />
            Uniswap V3
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
          <div
            className="shrink-0 px-3 py-2 border-t text-[8.5px]"
            style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}
          >
            90+ tokens · Robinscan.io
          </div>
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
            <OrderPanel q={selected} ethUsd={ethUsd} wallet={wallet} />
          </div>
        </div>
      </div>
    </div>
  );
}
