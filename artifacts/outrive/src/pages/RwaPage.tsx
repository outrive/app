import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import {
  TrendingUp, TrendingDown, RefreshCw, Activity,
  ExternalLink, CheckCircle2, Clock, XCircle,
} from 'lucide-react';

/* ── helpers ─────────────────────────────────────────────────────────────── */
const _BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
function apiUrl(p: string) { return _BASE + p; }

function fmt(n: number, dec = 2) {
  if (!n) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return n.toFixed(dec);
}
function fmtVol(n: number) {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
function fmtEth(n: number) {
  if (n === 0) return '0 ETH';
  if (n < 0.0001) return `${n.toFixed(8)} ETH`;
  if (n < 0.01)   return `${n.toFixed(6)} ETH`;
  return `${n.toFixed(4)} ETH`;
}

/* ── Quote type ─────────────────────────────────────────────────────────── */
type Quote = {
  symbol: string; name: string; address: string; logoUrl: string;
  price: number; change: number; changePct: number;
  open: number; high: number; low: number; volume: number;
  fiftyTwoHigh: number; fiftyTwoLow: number; currency: string;
};

/* ── TradingView symbol map ──────────────────────────────────────────────── */
const TV_SYMBOL: Record<string, string> = {
  AAPL: 'NASDAQ:AAPL', NVDA: 'NASDAQ:NVDA', AMZN: 'NASDAQ:AMZN',
  GOOGL: 'NASDAQ:GOOGL', META: 'NASDAQ:META', MSFT: 'NASDAQ:MSFT',
  TSLA: 'NASDAQ:TSLA', AMD: 'NASDAQ:AMD', COIN: 'NASDAQ:COIN',
  NFLX: 'NASDAQ:NFLX', SPY: 'AMEX:SPY', QQQ: 'NASDAQ:QQQ',
};

/* ── Static fallback catalogue ───────────────────────────────────────────── */
const FALLBACK: Quote[] = [
  { symbol:'AAPL',  name:'Apple Inc.',           address:'0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xaf3d76f1834a1d425780943c99ea8a608f8a93f9.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'NVDA',  name:'NVIDIA Corp.',          address:'0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'AMZN',  name:'Amazon.com Inc.',        address:'0x12f190a9F9d7D37a250758b26824B97CE941bF54', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x12f190a9f9d7d37a250758b26824b97ce941bf54.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'GOOGL', name:'Alphabet Inc.',           address:'0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'META',  name:'Meta Platforms Inc.',    address:'0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xc0d6457c16cc70d6790dd43521c899c87ce02f35.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'MSFT',  name:'Microsoft Corp.',         address:'0xe93237C50D904957Cf27E7B1133b510C669c2e74', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xe93237c50d904957cf27e7b1133b510c669c2e74.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'TSLA',  name:'Tesla Inc.',              address:'0x322F0929c4625eD5bAd873c95208D54E1c003b2d', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x322f0929c4625ed5bad873c95208d54e1c003b2d.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'AMD',   name:'Advanced Micro Devices',  address:'0x86923f96303D656E4aa86D9d42D1e57ad2023fdC', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x86923f96303d656e4aa86d9d42d1e57ad2023fdc.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'COIN',  name:'Coinbase Global Inc.',    address:'0x6330D8C3178a418788dF01a47479c0ce7CCF450b', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x6330d8c3178a418788df01a47479c0ce7ccf450b.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'AVGO',  name:'Broadcom Inc.',           address:'0x156E175DD063a8cE274C50654eF40e0032b3fbcF', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x156e175dd063a8ce274c50654ef40e0032b3fbcf.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'SPY',   name:'SPDR S&P 500 ETF',        address:'0x117cc2133c37B721F49dE2A7a74833232B3B4C0C', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0x117cc2133c37b721f49de2a7a74833232b3b4c0c.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
  { symbol:'QQQ',   name:'Invesco QQQ ETF',         address:'0xD5f3879160bc7c32ebb4dC785F8a4F505888de68', logoUrl:'https://cdn.robinhood.com/ncw_assets/logos/0xd5f3879160bc7c32ebb4dc785f8a4f505888de68.png',  price:0,change:0,changePct:0,volume:0,open:0,high:0,low:0,fiftyTwoHigh:0,fiftyTwoLow:0,currency:'USD' },
];

/* ── Token logo with fallback ─────────────────────────────────────────────── */
function TokenLogo({ src, symbol, size = 28 }: { src: string; symbol: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (err || !src) {
    return (
      <div className="rounded-full flex items-center justify-center font-mono font-bold"
        style={{ width: size, height: size, minWidth: size, background: '#1a2a0a', color: 'var(--out-ink)', fontSize: size * 0.3 }}>
        {symbol.slice(0, 2)}
      </div>
    );
  }
  return (
    <img src={src} alt={symbol} onError={() => setErr(true)}
      style={{ width: size, height: size, minWidth: size, borderRadius: '50%', objectFit: 'cover', background: '#111' }} />
  );
}

/* ── TradingView chart iframe ─────────────────────────────────────────────── */
function TvChart({ symbol }: { symbol: string }) {
  const tvSym = encodeURIComponent(TV_SYMBOL[symbol] ?? `NASDAQ:${symbol}`);
  const src = `https://www.tradingview.com/widgetembed/?symbol=${tvSym}&interval=D&hidesidetoolbar=0&hidetoptoolbar=0&theme=dark&style=1&locale=en&enable_publishing=false&save_image=false&hide_legend=0&hide_volume=0&backgroundColor=%23080d08&gridColor=%231a1f1a`;
  return (
    <iframe key={symbol} src={src} title={`${symbol} chart`}
      className="w-full" style={{ height: 380, border: 'none', background: '#080d08' }} allowFullScreen />
  );
}

/* ── Order panel ─────────────────────────────────────────────────────────── */
function OrderPanel({ quote, ethPriceUsd, walletAddress }: {
  quote: Quote; ethPriceUsd: number; walletAddress?: string;
}) {
  const [side, setSide]     = useState<'buy' | 'sell'>('buy');
  const [qty, setQty]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'ok' | 'err' | null>(null);
  const [tradeId, setTradeId] = useState<number | null>(null);

  const shares   = parseFloat(qty) || 0;
  const totalUsd = shares * (quote.price || 0);
  const ethCost  = ethPriceUsd > 0 ? totalUsd / ethPriceUsd : 0;

  const explorerUrl = quote.address && quote.address !== '0x0000000000000000000000000000000000000000'
    ? `https://robinhoodchain.blockscout.com/token/${quote.address}`
    : null;

  const canSubmit = !!(walletAddress && shares > 0 && quote.price > 0 && !submitting);

  async function handleOrder() {
    if (!canSubmit) return;
    setSubmitting(true);
    setResult(null);
    try {
      const r = await fetch(apiUrl('/api/rwa/trades'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          symbol: quote.symbol,
          side,
          shares: shares.toFixed(8),
          priceUsd: (quote.price).toFixed(4),
          ethAmount: ethCost.toFixed(8),
          totalUsd: totalUsd.toFixed(4),
          source: 'manual',
        }),
      });
      if (!r.ok) throw new Error('failed');
      const data = await r.json();
      setTradeId(data.trade?.id ?? null);
      setResult('ok');
      setQty('');
    } catch {
      setResult('err');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-t font-mono" style={{ borderColor: 'var(--out-ink-dim)' }}>
      {/* Side toggle */}
      <div className="flex">
        {(['buy', 'sell'] as const).map(s => (
          <button key={s} onClick={() => { setSide(s); setResult(null); }}
            className="flex-1 py-2.5 text-[12px] uppercase tracking-widest transition-colors border-b-2"
            style={{
              borderColor: side === s ? (s === 'buy' ? 'var(--out-ink)' : 'var(--out-danger)') : 'transparent',
              color:       side === s ? (s === 'buy' ? 'var(--out-ink)' : 'var(--out-danger)') : 'var(--out-muted)',
              background:  side === s ? '#12180f' : 'transparent',
            }}>
            {s === 'buy' ? '▲ BUY' : '▼ SELL'}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">

        {/* Qty input */}
        <div>
          <label className="text-[11px] uppercase tracking-widest mb-1 block" style={{ color: 'var(--out-muted)' }}>
            Shares
          </label>
          <input
            type="number" min="0" step="0.001" placeholder="0.000" value={qty}
            onChange={e => { setQty(e.target.value); setResult(null); }}
            className="w-full bg-transparent border px-3 py-2 text-[14px] font-mono outline-none"
            style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-text)' }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--out-ink)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--out-ink-dim)'}
          />
        </div>

        {/* Cost estimates */}
        {shares > 0 && quote.price > 0 && (
          <div className="border p-2.5 text-[11px] space-y-1.5" style={{ borderColor: 'var(--out-grid-major)', background: '#0a0f0a' }}>
            <div className="flex justify-between">
              <span style={{ color: 'var(--out-muted)' }}>USD COST</span>
              <span style={{ color: 'var(--out-text)' }}>${fmt(totalUsd)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--out-muted)' }}>ETH EQUIV</span>
              <span style={{ color: 'var(--out-ink)' }}>{fmtEth(ethCost)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--out-muted)' }}>ETH PRICE</span>
              <span style={{ color: 'var(--out-muted)' }}>${fmt(ethPriceUsd)}</span>
            </div>
          </div>
        )}

        {/* Token contract */}
        {explorerUrl && (
          <div className="flex items-center justify-between text-[11px] py-1">
            <span style={{ color: 'var(--out-muted)' }}>CONTRACT</span>
            <a href={explorerUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 transition-colors hover:text-[var(--out-ink)]"
              style={{ color: 'var(--out-muted)', fontFamily: 'monospace' }}>
              {quote.address.slice(0, 6)}…{quote.address.slice(-4)}
              <ExternalLink size={9} />
            </a>
          </div>
        )}

        {/* Submit button */}
        {!walletAddress ? (
          <div className="w-full py-2.5 border text-center text-[12px] uppercase tracking-widest"
            style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
            CONNECT WALLET TO TRADE
          </div>
        ) : (
          <button
            onClick={handleOrder}
            disabled={!canSubmit}
            className="w-full py-2.5 border text-[12px] uppercase tracking-widest font-mono flex items-center justify-center gap-2 transition-all"
            style={{
              borderColor: canSubmit ? (side === 'buy' ? 'var(--out-ink)' : 'var(--out-danger)') : 'var(--out-ink-dim)',
              color:       canSubmit ? (side === 'buy' ? 'var(--out-ink)' : 'var(--out-danger)') : 'var(--out-muted)',
              background:  canSubmit ? '#12180f' : 'transparent',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}>
            {submitting
              ? <><RefreshCw size={11} className="animate-spin" /> PLACING ORDER…</>
              : `${side === 'buy' ? '▲ BUY' : '▼ SELL'} ${quote.symbol}`}
          </button>
        )}

        {/* Result feedback */}
        {result === 'ok' && (
          <div className="flex items-center gap-2 text-[12px] py-1" style={{ color: 'var(--out-ink)' }}>
            <CheckCircle2 size={12} />
            Order #{tradeId} placed · visible in Dashboard → RWA Portfolio
          </div>
        )}
        {result === 'err' && (
          <div className="flex items-center gap-2 text-[12px] py-1" style={{ color: 'var(--out-danger)' }}>
            <XCircle size={12} /> Order failed — please try again
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] border-t" style={{ borderColor: 'var(--out-ink-dim)' }}>
          {[
            { k: 'OPEN',  v: quote.open       ? `$${fmt(quote.open)}`       : '—' },
            { k: 'HIGH',  v: quote.high       ? `$${fmt(quote.high)}`       : '—' },
            { k: 'LOW',   v: quote.low        ? `$${fmt(quote.low)}`        : '—' },
            { k: 'VOL',   v: fmtVol(quote.volume) },
            { k: '52W H', v: quote.fiftyTwoHigh ? `$${fmt(quote.fiftyTwoHigh)}` : '—' },
            { k: '52W L', v: quote.fiftyTwoLow  ? `$${fmt(quote.fiftyTwoLow)}`  : '—' },
          ].map(r => (
            <div key={r.k} className="flex justify-between gap-2 pt-2">
              <span style={{ color: 'var(--out-muted)' }}>{r.k}</span>
              <span style={{ color: 'var(--out-text)' }}>{r.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Market list row ─────────────────────────────────────────────────────── */
function MarketRow({ q, selected, onClick, loading }: {
  q: Quote; selected: boolean; onClick: () => void; loading: boolean;
}) {
  const up = q.changePct >= 0;
  const changeColor = loading ? 'var(--out-muted)' : up ? 'var(--out-ink)' : 'var(--out-danger)';

  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 border-b text-left transition-colors hover:bg-[#0d1400] font-mono"
      style={{
        borderColor: 'var(--out-ink-dim)',
        background: selected ? '#12180f' : 'transparent',
        borderLeft: selected ? '2px solid var(--out-ink)' : '2px solid transparent',
      }}>
      {/* Logo */}
      <TokenLogo src={q.logoUrl} symbol={q.symbol} size={28} />

      {/* Symbol + name */}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-bold" style={{ color: selected ? 'var(--out-ink)' : 'var(--out-text)' }}>
          {q.symbol}
        </div>
        <div className="text-[10px] truncate" style={{ color: 'var(--out-muted)' }}>{q.name}</div>
      </div>

      {/* Price + change */}
      <div className="text-right shrink-0">
        <div className="text-[12px] font-bold" style={{ color: 'var(--out-text)' }}>
          {loading || !q.price ? <span style={{ color: 'var(--out-muted)' }}>···</span> : `$${fmt(q.price)}`}
        </div>
        <div className="text-[10px] flex items-center justify-end gap-0.5" style={{ color: changeColor }}>
          {!loading && q.price > 0 && (up ? <TrendingUp size={8} /> : <TrendingDown size={8} />)}
          {loading || !q.price ? <span style={{ color: 'var(--out-muted)' }}>—</span>
            : `${up ? '+' : ''}${q.changePct.toFixed(2)}%`}
        </div>
      </div>
    </button>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export function RwaPage() {
  const { address: walletAddress } = useAccount();
  const [selected, setSelected] = useState<Quote>(FALLBACK[0]);
  const [agentMode, setAgentMode] = useState<'manual' | 'agent'>('manual');

  /* live quotes */
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<{ quotes: Quote[]; updatedAt: string }>({
    queryKey: ['rwa-quotes'],
    queryFn:  () => fetch(apiUrl('/api/rwa/quotes')).then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 2,
  });

  /* eth price */
  const { data: ethData } = useQuery<{ usd: number }>({
    queryKey: ['eth-price'],
    queryFn:  () => fetch(apiUrl('/api/rwa/eth-price')).then(r => r.json()),
    refetchInterval: 300_000,
    staleTime: 180_000,
  });
  const ethPriceUsd = ethData?.usd ?? 1828;

  const quotes = data?.quotes?.length ? data.quotes : FALLBACK;

  useEffect(() => {
    if (data?.quotes) {
      const live = data.quotes.find(q => q.symbol === selected.symbol);
      if (live) setSelected(live);
    }
  }, [dataUpdatedAt]);

  const handleSelect = (q: Quote) => {
    const live = data?.quotes?.find(l => l.symbol === q.symbol) ?? q;
    setSelected(live);
  };

  const up = selected.changePct >= 0;
  const updatedTime = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="font-mono flex flex-col" style={{ height: 'calc(100vh - 48px)', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: 'var(--out-ink-dim)', background: '#080d08' }}>
        <div className="flex items-center gap-3">
          <span className="text-[13px] uppercase tracking-widest font-bold" style={{ color: 'var(--out-ink)' }}>
            RWA TRADE
          </span>
          <span className="text-[10px] uppercase tracking-widest border px-2 py-0.5"
            style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
            Robinhood Chain · 4663
          </span>
          {ethData && (
            <span className="text-[10px]" style={{ color: 'var(--out-muted)' }}>
              ETH ${fmt(ethPriceUsd)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Agent toggle */}
          <div className="flex border overflow-hidden" style={{ borderColor: 'var(--out-ink-dim)' }}>
            {(['manual', 'agent'] as const).map(m => (
              <button key={m} onClick={() => setAgentMode(m)}
                className="px-3 py-1 text-[11px] uppercase tracking-widest transition-colors"
                style={{
                  background: agentMode === m ? '#12180f' : 'transparent',
                  color:      agentMode === m ? 'var(--out-ink)' : 'var(--out-muted)',
                }}>
                {m === 'manual' ? 'MANUAL' : 'AGENT'}
              </button>
            ))}
          </div>
          {/* Refresh */}
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 text-[11px] transition-colors"
            style={{ color: isLoading ? 'var(--out-ink)' : 'var(--out-muted)' }}>
            <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
            {updatedTime && <span>{updatedTime}</span>}
          </button>
        </div>
      </div>

      {/* ── Body: market list + trading panel ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT — market list */}
        <div className="w-52 shrink-0 flex flex-col border-r overflow-y-auto no-scrollbar"
          style={{ borderColor: 'var(--out-ink-dim)', background: '#060b06' }}>

          {/* List header */}
          <div className="flex items-center justify-between px-3 py-2 border-b sticky top-0 z-10"
            style={{ borderColor: 'var(--out-ink-dim)', background: '#060b06' }}>
            <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>SYMBOL</span>
            <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>PRICE / CHG</span>
          </div>

          {(quotes.length ? quotes : FALLBACK).map(q => (
            <MarketRow key={q.symbol} q={q} selected={selected.symbol === q.symbol}
              onClick={() => handleSelect(q)} loading={isLoading} />
          ))}

          {/* Loading indicator when fetching for first time */}
          {isLoading && !data && (
            <div className="p-3 text-center text-[10px]" style={{ color: 'var(--out-muted)' }}>
              <RefreshCw size={10} className="animate-spin inline mr-1" />
              Fetching prices…
            </div>
          )}
        </div>

        {/* RIGHT — trading panel */}
        <div className="flex-1 flex flex-col overflow-y-auto no-scrollbar">

          {/* Token header */}
          <div className="flex items-center justify-between px-5 py-3 border-b shrink-0"
            style={{ borderColor: 'var(--out-ink-dim)', background: '#080d08' }}>
            <div className="flex items-center gap-3">
              {/* Logo */}
              <TokenLogo src={selected.logoUrl} symbol={selected.symbol} size={40} />
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[18px] font-bold" style={{ color: 'var(--out-text)' }}>
                    {selected.symbol}
                  </span>
                  <span className="text-[12px]" style={{ color: 'var(--out-muted)' }}>{selected.name}</span>
                  {selected.address && selected.address !== '0x0000000000000000000000000000000000000000' && (
                    <a href={`https://robinhoodchain.blockscout.com/token/${selected.address}`}
                      target="_blank" rel="noreferrer"
                      className="text-[10px] flex items-center gap-0.5 transition-colors hover:text-[var(--out-ink)]"
                      style={{ color: 'var(--out-muted)' }}>
                      on-chain <ExternalLink size={8} />
                    </a>
                  )}
                </div>
                <div className="flex items-baseline gap-3 mt-0.5">
                  <span className="text-[22px] font-bold" style={{ color: 'var(--out-ink)' }}>
                    {isLoading && !selected.price
                      ? <span className="text-[16px]" style={{ color: 'var(--out-muted)' }}>···</span>
                      : selected.price ? `$${fmt(selected.price)}` : <span className="text-[16px]" style={{ color: 'var(--out-muted)' }}>—</span>}
                  </span>
                  {selected.price > 0 && (
                    <span className="text-[13px] flex items-center gap-1"
                      style={{ color: up ? 'var(--out-ink)' : 'var(--out-danger)' }}>
                      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {up ? '+' : ''}{selected.change.toFixed(2)} ({up ? '+' : ''}{selected.changePct.toFixed(2)}%)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="hidden sm:flex gap-6 text-[11px] text-right">
              {[
                { k: 'VOLUME',  v: fmtVol(selected.volume) },
                { k: '52W H',   v: selected.fiftyTwoHigh ? `$${fmt(selected.fiftyTwoHigh)}` : '—' },
                { k: '52W L',   v: selected.fiftyTwoLow  ? `$${fmt(selected.fiftyTwoLow)}`  : '—' },
              ].map(s => (
                <div key={s.k}>
                  <div style={{ color: 'var(--out-muted)' }}>{s.k}</div>
                  <div style={{ color: 'var(--out-text)' }}>{isLoading ? '···' : s.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div className="shrink-0 border-b" style={{ borderColor: 'var(--out-ink-dim)' }}>
            <TvChart symbol={selected.symbol} />
          </div>

          {/* Agent assist banner */}
          {agentMode === 'agent' && (
            <div className="px-5 py-3 border-b flex items-center gap-3 text-[12px]"
              style={{ borderColor: 'var(--out-ink-dim)', background: '#0a0f0a' }}>
              <Activity size={12} style={{ color: 'var(--out-ink)' }} />
              <span style={{ color: 'var(--out-muted)' }}>
                Agent will DCA into <span style={{ color: 'var(--out-text)' }}>{selected.symbol}</span> on your configured schedule.
                Configure in the <span style={{ color: 'var(--out-ink)' }}>AUTONOMOUS</span> panel.
              </span>
              <span className="ml-auto flex items-center gap-1.5 border px-2 py-0.5 text-[10px] uppercase tracking-widest"
                style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--out-warn)' }} />
                COMING SOON
              </span>
            </div>
          )}

          {/* Order entry */}
          <OrderPanel quote={selected} ethPriceUsd={ethPriceUsd} walletAddress={walletAddress} />
        </div>
      </div>
    </div>
  );
}
