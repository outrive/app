import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

/* ── Types ────────────────────────────────────────────────────────────── */
interface TickerToken {
  name: string;
  ticker: string;
  image: string | null;
  mcapInVirtual: number;
  priceChange24h: number;
}

/* ── Helpers ──────────────────────────────────────────────────────────── */
const BASE_URL = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

function apiUrl(path: string) {
  return BASE_URL + path;
}

function fmtMcapUsd(vrtl: number, vp: number): string {
  if (!vrtl) return '—';
  const usd = vrtl * vp;
  if (usd <= 0) return '—';
  if (usd >= 1_000_000) return `${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000)     return `${(usd / 1_000).toFixed(1)}K`;
  return `${usd.toFixed(0)}`;
}

const GREENS = ['#4ade80', '#22c55e', '#86efac', '#16a34a', '#bbf7d0'];
function seedColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return GREENS[Math.abs(h) % GREENS.length];
}

/* ── Fetch directly from virtuals proxy (real Robinhood chain data) ──── */
async function fetchTickerTokens(): Promise<TickerToken[]> {
  const p = new URLSearchParams({
    sort: 'mcapInVirtual:desc',
    chain: 'ROBINHOOD',
    page: '1',
    pageSize: '40',
  });
  const res = await fetch(apiUrl(`/api/virtuals/tokens?${p}`));
  if (!res.ok) return [];
  const json = await res.json();
  const items: TickerToken[] = json?.tokens ?? (Array.isArray(json) ? json : []);
  return items.slice(0, 40);
}

/* ── Token chip ───────────────────────────────────────────────────────── */
function TokenChip({ t, vp }: { t: TickerToken; vp: number }) {
  const [imgErr, setImgErr] = useState(false);
  const positive = t.priceChange24h >= 0;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 border-r shrink-0 h-full"
      style={{ borderRightColor: 'var(--out-ink-dim)', fontFamily: 'JetBrains Mono, monospace' }}
    >
      {t.image && !imgErr ? (
        <img
          src={t.image}
          alt={t.ticker}
          onError={() => setImgErr(true)}
          className="w-4 h-4 rounded-full object-cover shrink-0"
          style={{ border: '1px solid var(--out-ink-dim)' }}
        />
      ) : (
        <span
          className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-black font-bold"
          style={{ background: seedColor(t.ticker), fontSize: 7 }}
        >
          {t.ticker.slice(0, 1)}
        </span>
      )}
      <span className="text-[10px] font-bold" style={{ color: 'var(--out-ink)' }}>
        ${t.ticker}
      </span>
      <span className="text-[9px]" style={{ color: 'var(--out-text)' }}>
        {fmtMcapUsd(t.mcapInVirtual, vp)}
      </span>
      {t.priceChange24h !== 0 && (
        <span className="text-[9px]" style={{ color: positive ? 'var(--out-ink)' : '#f87171' }}>
          {positive ? '+' : ''}{t.priceChange24h.toFixed(1)}%
        </span>
      )}
    </span>
  );
}

/* ── Separator ────────────────────────────────────────────────────────── */
function Sep() {
  return (
    <span
      className="shrink-0 px-2 text-[10px]"
      style={{ color: 'var(--out-ink-dim)', fontFamily: 'JetBrains Mono, monospace' }}
    >
      ·
    </span>
  );
}

/* ── TickerStrip — embeddable (no sticky wrapper) ─────────────────────── */
export function TickerStrip() {
  const { data: tokens = [], isLoading } = useQuery<TickerToken[]>({
    queryKey: ['ticker-tokens-virtuals'],
    queryFn: fetchTickerTokens,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  const { data: priceData } = useQuery<{ usd: number }>({
    queryKey: ['virtual-price'],
    queryFn: () => fetch(apiUrl('/api/virtuals/virtual-price')).then(r => r.json()),
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
  const vp = priceData?.usd ?? 0;

  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || tokens.length === 0) return;
    el.style.animation = 'none';
    void el.offsetWidth;
    const approxItemW = 170;
    const totalW = tokens.length * approxItemW;
    const duration = Math.max(20, totalW / 80);
    el.style.animation = `outrive-ticker ${duration}s linear infinite`;
  }, [tokens]);

  return (
    <div
      className="flex items-center overflow-hidden"
      style={{
        height: 28,
        background: 'var(--out-bg)',
        borderTop: '1px solid var(--out-ink-dim)',
      }}
    >
      {/* Static label */}
      <span
        className="shrink-0 px-3 text-[9px] uppercase tracking-widest border-r"
        style={{
          color: 'var(--out-muted)',
          borderColor: 'var(--out-ink-dim)',
          fontFamily: 'JetBrains Mono, monospace',
          whiteSpace: 'nowrap',
          background: 'var(--out-bg)',
        }}
      >
        ▦ MARKET
      </span>

      {/* Scrolling area */}
      <div className="flex-1 overflow-hidden relative" style={{ height: 28 }}>
        <div className="absolute left-0 top-0 h-full w-6 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to right, var(--out-bg), transparent)' }} />
        <div className="absolute right-0 top-0 h-full w-6 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to left, var(--out-bg), transparent)' }} />

        {isLoading && (
          <span
            className="absolute inset-0 flex items-center px-4 text-[9px] uppercase tracking-widest"
            style={{ color: 'var(--out-muted)', fontFamily: 'JetBrains Mono, monospace' }}
          >
            SCANNING ROBINHOOD CHAIN…
          </span>
        )}

        {tokens.length > 0 && (
          <div
            ref={trackRef}
            className="flex items-center whitespace-nowrap"
            style={{ height: 28, willChange: 'transform' }}
          >
            {[...tokens, ...tokens].map((t, i) => (
              <React.Fragment key={`${t.ticker}-${i}`}>
                <TokenChip t={t} vp={vp} />
                {i % 5 === 4 && <Sep />}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* LIVE dot */}
      <span
        className="shrink-0 px-3 flex items-center gap-1.5 border-l"
        style={{ borderColor: 'var(--out-ink-dim)', height: 28 }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
          style={{ background: 'var(--out-ink)' }}
        />
        <span
          className="text-[9px] uppercase"
          style={{ color: 'var(--out-ink)', fontFamily: 'JetBrains Mono, monospace' }}
        >
          LIVE
        </span>
      </span>
    </div>
  );
}

/* ── MarketTicker — standalone sticky version (kept for compat) ───────── */
export function MarketTicker() {
  const TICKER_TOP = 106;
  return (
    <div
      className="sticky z-30 border-b"
      style={{
        top: TICKER_TOP,
        borderColor: 'var(--out-ink-dim)',
      }}
    >
      <TickerStrip />
    </div>
  );
}
