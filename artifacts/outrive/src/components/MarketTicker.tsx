import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

/* ── Types ────────────────────────────────────────────────────────────── */
interface TickerToken {
  name: string;
  ticker: string;
  image: string | null;
  mcapInVirtual: number;
  priceChange24h: number;
}

interface FlapPrice {
  symbol: string;
  address: string;
  priceUsd: number;
  live: boolean;
}

interface RwaQuote {
  symbol: string;
  priceChange24h?: number;
  changePercent?: number;
}

type TickerMode = 'virtuals' | 'stocks';

/* ── Helpers ──────────────────────────────────────────────────────────── */
const BASE_URL = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
function apiUrl(path: string) { return BASE_URL + path; }

function fmtMcapUsd(vrtl: number, vp: number): string {
  if (!vrtl) return '—';
  const usd = vrtl * vp;
  if (usd <= 0) return '—';
  if (usd >= 1_000_000) return `${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000)     return `${(usd / 1_000).toFixed(1)}K`;
  return `${usd.toFixed(0)}`;
}

function fmtPrice(p: number): string {
  if (p >= 10_000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (p >= 100)    return `$${p.toFixed(2)}`;
  if (p >= 1)      return `$${p.toFixed(3)}`;
  return `$${p.toFixed(4)}`;
}

const GREENS = ['#4ade80', '#22c55e', '#86efac', '#16a34a', '#bbf7d0'];
function seedColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return GREENS[Math.abs(h) % GREENS.length];
}

/* ── Fetch virtuals ───────────────────────────────────────────────────── */
async function fetchTickerTokens(): Promise<TickerToken[]> {
  const p = new URLSearchParams({ sort: 'mcapInVirtual:desc', chain: 'ROBINHOOD', page: '1', pageSize: '40' });
  const res = await fetch(apiUrl(`/api/virtuals/tokens?${p}`));
  if (!res.ok) return [];
  const json = await res.json();
  const items: TickerToken[] = json?.tokens ?? (Array.isArray(json) ? json : []);
  return items.slice(0, 40);
}

const TICKER_H = 34;

/* ── Crypto token chip ────────────────────────────────────────────────── */
function TokenChip({ t, vp }: { t: TickerToken; vp: number }) {
  const [imgErr, setImgErr] = useState(false);
  const positive = t.priceChange24h >= 0;
  return (
    <span className="inline-flex items-center gap-2 px-3.5 border-r shrink-0 h-full"
      style={{ borderRightColor: 'var(--out-ink-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
      {t.image && !imgErr ? (
        <img src={t.image} alt={t.ticker} onError={() => setImgErr(true)}
          className="w-4 h-4 rounded-full object-cover shrink-0"
          style={{ border: '1px solid var(--out-ink-dim)' }} />
      ) : (
        <span className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center font-bold"
          style={{ background: seedColor(t.ticker), fontSize: 8, color: '#050905' }}>
          {t.ticker.slice(0, 1)}
        </span>
      )}
      <span className="text-[12px] font-bold tracking-wide" style={{ color: 'var(--out-ink)' }}>
        ${t.ticker}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--out-text)' }}>
        {fmtMcapUsd(t.mcapInVirtual, vp)}
      </span>
      {t.priceChange24h !== 0 && (
        <span className="text-[11px] font-medium" style={{ color: positive ? 'var(--out-ink)' : '#f87171' }}>
          {positive ? '+' : ''}{t.priceChange24h.toFixed(1)}%
        </span>
      )}
    </span>
  );
}

/* ── Stock chip ───────────────────────────────────────────────────────── */
function StockChip({ price, change }: { price: FlapPrice; change?: number }) {
  const [imgErr, setImgErr] = useState(false);
  const logoSrc = apiUrl(`/api/rwa/logo/${price.address}`);
  const hasChange = change !== undefined && change !== null && !isNaN(change);
  const positive  = hasChange && change! >= 0;

  return (
    <span className="inline-flex items-center gap-2 px-3.5 border-r shrink-0 h-full"
      style={{ borderRightColor: 'var(--out-ink-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
      {!imgErr ? (
        <img src={logoSrc} alt={price.symbol} onError={() => setImgErr(true)}
          className="w-4 h-4 rounded-full object-cover shrink-0"
          style={{ border: '1px solid var(--out-ink-dim)' }} />
      ) : (
        <span className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center font-bold"
          style={{ background: '#1a2a0a', fontSize: 8, color: 'var(--out-ink)' }}>
          {price.symbol.slice(0, 1)}
        </span>
      )}
      <span className="text-[12px] font-bold tracking-wide" style={{ color: 'var(--out-ink)' }}>
        {price.symbol}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--out-text)' }}>
        {fmtPrice(price.priceUsd)}
      </span>
      {hasChange && (
        <span className="text-[11px] font-medium" style={{ color: positive ? 'var(--out-ink)' : '#f87171' }}>
          {positive ? '+' : ''}{change!.toFixed(1)}%
        </span>
      )}
    </span>
  );
}

/* ── Separator ────────────────────────────────────────────────────────── */
function Sep() {
  return (
    <span className="shrink-0 px-3 text-[12px]"
      style={{ color: 'var(--out-ink-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
      ·
    </span>
  );
}

/* ── TickerStrip — embeddable (no sticky wrapper) ─────────────────────── */
export function TickerStrip() {
  /* ── Mode — persisted to localStorage ── */
  const [mode, setMode] = useState<TickerMode>(() => {
    try { return (localStorage.getItem('outrive-ticker-mode') as TickerMode) || 'virtuals'; }
    catch { return 'virtuals'; }
  });

  const switchMode = useCallback((m: TickerMode) => {
    setMode(m);
    try { localStorage.setItem('outrive-ticker-mode', m); } catch {}
  }, []);

  /* ── Virtuals data ── */
  const { data: tokens = [], isLoading: loadingTokens } = useQuery<TickerToken[]>({
    queryKey: ['ticker-tokens-virtuals'],
    queryFn:  fetchTickerTokens,
    refetchInterval: 30_000,
    staleTime: 20_000,
    enabled: mode === 'virtuals',
  });
  const { data: priceData } = useQuery<{ usd: number }>({
    queryKey: ['virtual-price'],
    queryFn:  () => fetch(apiUrl('/api/virtuals/virtual-price')).then(r => r.json()),
    refetchInterval: 120_000,
    staleTime: 60_000,
    enabled: mode === 'virtuals',
  });
  const vp = priceData?.usd ?? 0;

  /* ── Stocks data ── */
  const { data: flapData, isLoading: loadingFlap } = useQuery<{ prices: FlapPrice[] }>({
    queryKey: ['flap-prices-ticker'],
    queryFn:  () => fetch(apiUrl('/api/rwa/flap-prices')).then(r => r.json()),
    refetchInterval: 10_000,
    staleTime: 6_000,
    enabled: mode === 'stocks',
  });
  const { data: quotesData } = useQuery<{ quotes: RwaQuote[] }>({
    queryKey: ['rwa-quotes-ticker'],
    queryFn:  () => fetch(apiUrl('/api/rwa/quotes')).then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: mode === 'stocks',
  });

  const stockPrices  = flapData?.prices ?? [];
  const changeMap    = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const q of quotesData?.quotes ?? []) {
      const pct = (q as any).changePct ?? (q as any).changePercent ?? (q as any).priceChange24h;
      if (pct !== undefined && !isNaN(Number(pct))) m[q.symbol] = Number(pct);
    }
    return m;
  }, [quotesData]);

  const isLoading = mode === 'virtuals' ? loadingTokens : loadingFlap;

  /* ── Animation reset when items change ── */
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const count = mode === 'virtuals' ? tokens.length : stockPrices.length;
    if (count === 0) return;
    el.style.animation = 'none';
    void el.offsetWidth;
    const approxItemW = mode === 'virtuals' ? 185 : 160;
    const totalW  = count * approxItemW;
    const duration = Math.max(20, totalW / 80);
    el.style.animation = `outrive-ticker ${duration}s linear infinite`;
  }, [tokens, stockPrices, mode]);

  /* ── Label for mode tag ── */
  const modeLabel = mode === 'virtuals' ? 'ROBINHOOD CHAIN' : 'STOCK MARKET';

  return (
    <div className="flex items-center overflow-hidden"
      style={{ height: TICKER_H, background: 'var(--out-bg)', borderTop: '1px solid var(--out-ink-dim)' }}>

      {/* ── Mode switch ── */}
      <div className="shrink-0 flex items-center border-r"
        style={{ borderColor: 'var(--out-ink-dim)', height: TICKER_H }}>
        <button
          onClick={() => switchMode('virtuals')}
          className="px-2.5 h-full text-[9px] font-bold uppercase tracking-widest transition-colors font-mono"
          style={{
            color:      mode === 'virtuals' ? 'var(--out-ink)' : 'var(--out-muted)',
            background: mode === 'virtuals' ? '#12180f' : 'transparent',
            borderRight: '1px solid var(--out-ink-dim)',
          }}>
          CRYPTO
        </button>
        <button
          onClick={() => switchMode('stocks')}
          className="px-2.5 h-full text-[9px] font-bold uppercase tracking-widest transition-colors font-mono"
          style={{
            color:      mode === 'stocks' ? 'var(--out-ink)' : 'var(--out-muted)',
            background: mode === 'stocks' ? '#12180f' : 'transparent',
          }}>
          STOCKS
        </button>
      </div>

      {/* ── Scrolling area ── */}
      <div className="flex-1 overflow-hidden relative" style={{ height: TICKER_H }}>
        <div className="absolute left-0 top-0 h-full w-8 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to right, var(--out-bg), transparent)' }} />
        <div className="absolute right-0 top-0 h-full w-8 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to left, var(--out-bg), transparent)' }} />

        {isLoading && (
          <span className="absolute inset-0 flex items-center px-4 text-[11px] uppercase tracking-widest font-mono"
            style={{ color: 'var(--out-muted)' }}>
            LOADING {modeLabel}…
          </span>
        )}

        {/* Virtuals strip */}
        {mode === 'virtuals' && tokens.length > 0 && (
          <div ref={trackRef} className="flex items-center whitespace-nowrap"
            style={{ height: TICKER_H, willChange: 'transform' }}>
            {[...tokens, ...tokens].map((t, i) => (
              <React.Fragment key={`${t.ticker}-${i}`}>
                <TokenChip t={t} vp={vp} />
                {i % 5 === 4 && <Sep />}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Stocks strip */}
        {mode === 'stocks' && stockPrices.length > 0 && (
          <div ref={trackRef} className="flex items-center whitespace-nowrap"
            style={{ height: TICKER_H, willChange: 'transform' }}>
            {[...stockPrices, ...stockPrices].map((p, i) => (
              <React.Fragment key={`${p.symbol}-${i}`}>
                <StockChip price={p} change={changeMap[p.symbol]} />
                {i % 5 === 4 && <Sep />}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* ── LIVE dot ── */}
      <span className="shrink-0 px-3 flex items-center gap-1.5 border-l font-mono"
        style={{ borderColor: 'var(--out-ink-dim)', height: TICKER_H }}>
        <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: 'var(--out-ink)' }} />
        <span className="text-[11px] uppercase tracking-widest hidden sm:block" style={{ color: 'var(--out-ink)' }}>LIVE</span>
      </span>
    </div>
  );
}

/* ── MarketTicker — standalone sticky version ─────────────────────────── */
export function MarketTicker() {
  const TICKER_TOP = 48;
  return (
    <div className="sticky z-30 border-b" style={{ top: TICKER_TOP, borderColor: 'var(--out-ink-dim)' }}>
      <TickerStrip />
    </div>
  );
}
