/**
 * TokenDetail page — rendered at /token/:address
 *
 * Fast path: if the user clicked from the market list the VToken data is
 * already in router state (location.state.token) — render immediately, no API call.
 *
 * Fallback path: direct URL / deep link — fetch from the server endpoint.
 */
import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TokenDetailPage } from './TokenDetailPage';
import type { VToken } from './TokenDetailPage';
import { TickerStrip } from '@/components/MarketTicker';

const BASE_URL = import.meta.env.BASE_URL ?? '/';
function apiUrl(path: string) { return BASE_URL.replace(/\/$/, '') + path; }

export default function TokenDetail() {
  const { address } = useParams<{ address: string }>();
  const navigate    = useNavigate();
  const location    = useLocation();

  // ── Fast path: token was already loaded by the market list ──────────
  const stateToken: VToken | undefined = (location.state as { token?: VToken } | null)?.token;

  // ── Slow path: fetch from bulk tokens list (server-cached, fast)
  //    DO NOT call token-by-address — it does a slow 56-second multi-page scan
  const { data: fetchedToken, isLoading, isError } = useQuery<VToken | null>({
    queryKey: ['vtoken-by-addr', address],
    queryFn: async () => {
      if (!address) return null;
      const needle = address.toLowerCase();

      // Fetch two sort orders in parallel (covers newest + highest mcap)
      const [recents, topMcap] = await Promise.all([
        fetch(apiUrl('/api/virtuals/tokens?chain=ROBINHOOD&pageSize=200&sort=createdAt:desc'))
          .then(r => r.ok ? r.json() : { tokens: [] })
          .catch(() => ({ tokens: [] })),
        fetch(apiUrl('/api/virtuals/tokens?chain=ROBINHOOD&pageSize=200&sort=mcapInVirtual:desc'))
          .then(r => r.ok ? r.json() : { tokens: [] })
          .catch(() => ({ tokens: [] })),
      ]);

      const all: VToken[] = [
        ...(recents?.tokens ?? []),
        ...(topMcap?.tokens  ?? []),
      ];

      return all.find(t => t.address.toLowerCase() === needle) ?? null;
    },
    // Skip network call when we already have the data from router state
    enabled: !!address && !stateToken,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const token = stateToken ?? fetchedToken;

  // ── Loading (only shown on deep-link, never on market click) ─────────
  if (!stateToken && isLoading) {
    return (
      <main className="pt-12">
        <div className="pt-20 flex flex-col items-center justify-center gap-3 font-mono"
          style={{ color: 'var(--out-muted)', minHeight: '60vh' }}>
          <span className="text-[24px] opacity-20" style={{ color: 'var(--out-ink)' }}>▦</span>
          <span className="text-[12px] uppercase tracking-widest animate-pulse">◌ LOADING TOKEN DATA…</span>
        </div>
      </main>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────
  if (!stateToken && (isError || !token)) {
    return (
      <main className="pt-12">
        <div className="pt-20 flex flex-col items-center justify-center gap-4 font-mono"
          style={{ minHeight: '60vh' }}>
          <span className="text-[32px] opacity-10" style={{ color: 'var(--out-ink)' }}>▦</span>
          <span className="text-[13px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
            TOKEN NOT FOUND
          </span>
          <span className="text-[11px] font-mono px-4 text-center max-w-md break-all"
            style={{ color: 'var(--out-muted)', opacity: 0.5 }}>
            {address}
          </span>
          <button
            onClick={() => navigate('/')}
            className="border px-4 py-2 text-[12px] uppercase tracking-widest transition-colors mt-2"
            style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--out-ink)'; e.currentTarget.style.color = '#050905'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--out-ink)'; }}>
            ← RETURN TO MARKET
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-12">
      <TickerStrip />
      <TokenDetailPage token={token!} onBack={() => navigate('/')} />
    </main>
  );
}
