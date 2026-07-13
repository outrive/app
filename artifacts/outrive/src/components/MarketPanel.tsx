import React, { useState, useEffect, useCallback } from 'react';
import { Sheet } from '@/components/Sheet';
import { useListMarketTokens, useGetMarketSummary } from '@workspace/api-client-react';
import { useNavigate } from 'react-router-dom';

type Tab = 'newest' | 'trending' | 'my';

const REFRESH_INTERVAL = 10; // seconds

function useCountdown(seconds: number, onTick: () => void) {
  const [count, setCount] = useState(seconds);
  useEffect(() => {
    const id = setInterval(() => {
      setCount(prev => {
        if (prev <= 1) { onTick(); return seconds; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [seconds, onTick]);
  return count;
}

function ago(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function isNew(isoStr?: string): boolean {
  if (!isoStr) return false;
  return Date.now() - new Date(isoStr).getTime() < 5 * 60 * 1000; // < 5 min
}

export function MarketPanel({ walletAddress }: { walletAddress?: string }) {
  const [tab, setTab] = useState<Tab>('newest');
  const [lastSync, setLastSync] = useState(() => new Date());
  const [pulse, setPulse] = useState(false);
  const navigate = useNavigate();

  // Imperative refetch refs
  const [refetchKey, setRefetchKey] = useState(0);

  const forceRefetch = useCallback(() => {
    setRefetchKey(k => k + 1);
    setLastSync(new Date());
    setPulse(true);
    setTimeout(() => setPulse(false), 800);
  }, []);

  const countdown = useCountdown(REFRESH_INTERVAL, forceRefetch);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tokens, isLoading, refetch: refetchTokens } = useListMarketTokens(
    { tab: tab === 'my' ? 'newest' : tab },
    { query: { refetchInterval: REFRESH_INTERVAL * 1000 } as any }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: summary, refetch: refetchSummary } = useGetMarketSummary(
    { query: { refetchInterval: REFRESH_INTERVAL * 1000 } as any }
  );

  useEffect(() => {
    if (refetchKey > 0) {
      refetchTokens();
      refetchSummary();
    }
  }, [refetchKey]);

  const displayed = tab === 'my' && walletAddress
    ? (tokens ?? []).filter(t => t.creator?.toLowerCase() === walletAddress.toLowerCase())
    : (tokens ?? []);

  const syncStr = lastSync.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';

  // countdown bar width
  const barPct = (countdown / REFRESH_INTERVAL) * 100;

  return (
    <Sheet dwgNo="OUT-MKT-01" className="flex flex-col">

      {/* Live header */}
      <div className="mb-3 border-b border-[var(--out-ink-dim)] pb-3">
        {/* Summary row */}
        <div className="flex items-center gap-3 font-mono text-[10px] mb-2">
          <span className="text-[var(--out-muted)]">
            TOKENS <span className="text-[var(--out-text)]">{summary?.totalTokens ?? '—'}</span>
          </span>
          <span className="text-[var(--out-muted)]">
            GRADUATED <span className="text-[var(--out-ink)]">{summary?.graduatedTokens ?? '—'}</span>
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {/* Pulse dot */}
            <span className={`inline-block w-1.5 h-1.5 rounded-full transition-all ${
              pulse ? 'bg-white scale-125' : 'bg-[var(--out-ink)] animate-pulse'
            }`} />
            <span className="text-[var(--out-ink)] text-[10px] font-mono">LIVE</span>
            <span className="text-[var(--out-muted)] text-[10px] font-mono">· {syncStr}</span>
          </div>
        </div>

        {/* Countdown bar */}
        <div className="relative h-0.5 bg-[var(--out-bg)] border border-[var(--out-ink-dim)] overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-[var(--out-ink)] transition-all duration-1000 ease-linear"
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-3 font-mono text-[10px]">
        {(['newest', 'trending', 'my'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-1 uppercase tracking-widest border transition-colors"
            style={{
              borderColor: tab === t ? 'var(--out-ink)' : 'var(--out-ink-dim)',
              color: tab === t ? 'var(--out-ink)' : 'var(--out-muted)',
              background: tab === t ? '#12180f' : 'transparent',
            }}
          >
            {t === 'my' ? 'MY LAUNCHES' : t}
          </button>
        ))}
        {/* Manual refresh */}
        <button
          onClick={forceRefetch}
          className="ml-auto px-2 py-1 border border-[var(--out-ink-dim)] text-[var(--out-muted)] hover:text-[var(--out-ink)] hover:border-[var(--out-ink)] transition-colors"
          title="Refresh now"
        >
          ↻
        </button>
      </div>

      {/* Token table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 font-mono">
            <div className="flex gap-1">
              {[0,1,2,3].map(i => (
                <span key={i} className="inline-block w-1 h-4 bg-[var(--out-ink)] animate-pulse"
                  style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
            <span className="text-[var(--out-muted)] text-[10px] uppercase tracking-widest">LOADING PRODUCTION FLOOR</span>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 font-mono">
            <div className="text-[var(--out-muted)] text-[40px] opacity-20">▦</div>
            <div className="text-[var(--out-muted)] text-[10px] uppercase tracking-widest text-center leading-6">
              {tab === 'my'
                ? 'NO LAUNCHES FROM THIS WALLET.\nUse the AGENT to deploy your first token.'
                : 'PRODUCTION FLOOR EMPTY.\nDeploy the first token via the AGENT tab.'
              }
            </div>
          </div>
        ) : (
          <table className="w-full font-mono text-[10px] border-collapse">
            <thead>
              <tr className="text-[var(--out-muted)] uppercase tracking-widest">
                <th className="text-left pb-2 pr-2">TICKER</th>
                <th className="text-left pb-2 hidden sm:table-cell">NAME</th>
                <th className="text-right pb-2 pr-1">PRICE<br /><span className="text-[9px] normal-case">$VIRTUAL</span></th>
                <th className="text-right pb-2 hidden md:table-cell">24H %</th>
                <th className="text-right pb-2">CURVE</th>
                <th className="text-right pb-2">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {displayed.slice(0, 25).map(token => {
                const fresh = isNew((token as any).createdAt);
                const pctChange = token.priceChange24h as number | undefined;
                return (
                  <tr
                    key={token.address}
                    onClick={() => navigate(`/token/${token.address}`)}
                    className={`border-t border-[var(--out-grid-major)] cursor-pointer transition-colors group ${
                      fresh ? 'bg-[#0D140D]' : 'hover:bg-[#0E130E]'
                    }`}
                  >
                    {/* Ticker */}
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-1">
                        {fresh && (
                          <span className="text-[8px] border border-[var(--out-ink)] px-1 text-[var(--out-ink)] uppercase leading-none py-px animate-pulse">
                            NEW
                          </span>
                        )}
                        <span className="text-[var(--out-ink)] font-bold">${token.ticker}</span>
                      </div>
                    </td>

                    {/* Name */}
                    <td className="py-1.5 text-[var(--out-text)] hidden sm:table-cell truncate max-w-[70px]">
                      {token.name}
                    </td>

                    {/* Price */}
                    <td className="py-1.5 text-right pr-1 text-[var(--out-text)]">
                      {token.lastPriceVirtual
                        ? parseFloat(token.lastPriceVirtual).toFixed(6)
                        : '—'}
                    </td>

                    {/* 24h % */}
                    <td className={`py-1.5 text-right hidden md:table-cell ${
                      (pctChange ?? 0) >= 0 ? 'text-[var(--out-up,#39d353)]' : 'text-[var(--out-down,#f87171)]'
                    }`}>
                      {pctChange !== null && pctChange !== undefined
                        ? `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%`
                        : '—'}
                    </td>

                    {/* Curve progress bar */}
                    <td className="py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <div className="w-10 h-1.5 bg-[var(--out-bg)] border border-[var(--out-muted)] relative overflow-hidden">
                          <div
                            className="h-full bg-[var(--out-ink)] transition-all"
                            style={{ width: `${Math.min(token.curveProgress ?? 0, 100)}%` }}
                          />
                        </div>
                        <span className="text-[var(--out-muted)] text-[9px] w-6 text-right">
                          {Math.round(token.curveProgress ?? 0)}%
                        </span>
                      </div>
                    </td>

                    {/* Phase */}
                    <td className="py-1.5 text-right">
                      <span className={`text-[9px] font-bold ${
                        token.phase === 'GRADUATED'
                          ? 'text-[var(--out-ink)]'
                          : 'text-[var(--out-muted)]'
                      }`}>
                        {token.phase === 'GRADUATED' ? '✓ GRAD' : 'CURVE'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer note */}
      <div className="mt-3 pt-2 border-t font-mono text-[9px] flex items-center gap-2" style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--out-ink)' }} />
        <span>SHOWING TOKENS DEPLOYED VIA OUTRIVE</span>
        <span className="ml-auto" style={{ color: 'var(--out-ink)' }}>• AUTO-REFRESH</span>
      </div>
      <div className="mt-0.5 pb-1 font-mono text-[9px] uppercase tracking-widest font-bold" style={{ color: 'var(--out-ink)' }}>
        PRODUCTION FLOOR — OUTRIVE / VIRTUALS
      </div>

      {/* WHY OUTRIVE? */}
      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--out-ink-dim)' }}>
        <div className="text-[9px] uppercase tracking-widest font-bold mb-2.5 font-mono" style={{ color: 'var(--out-ink)' }}>
          WHY OUTRIVE?
        </div>
        <div className="flex flex-col gap-2">
          {[
            { title: 'Built on Robinhood Chain',  sub: 'Native to the ecosystem.' },
            { title: 'You Own the Record',         sub: 'You are the creator of record on Virtuals.' },
            { title: 'Agent-Powered',              sub: 'Drafts, builds, and validates your launch.' },
            { title: 'Secure by Design',           sub: 'You sign. You launch. You own.' },
          ].map(item => (
            <div key={item.title} className="flex items-start gap-2.5">
              {/* Checkmark circle */}
              <div className="shrink-0 mt-0.5">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="var(--out-ink)" strokeWidth="1" />
                  <path d="M5 8.5l2 2 4-4" stroke="var(--out-ink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex flex-col gap-0.5 font-mono">
                <span className="text-[10px] font-bold" style={{ color: 'var(--out-ink)' }}>{item.title}</span>
                <span className="text-[10px] leading-snug" style={{ color: 'var(--out-muted)' }}>{item.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
