/**
 * TokenDetail page — rendered at /token/:address
 * Fetches the VToken from the Virtuals API and renders TokenDetailPage.
 */
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery }      from '@tanstack/react-query';
import { TokenDetailPage } from './TokenDetailPage';
import type { VToken }   from './TokenDetailPage';

const BASE_URL = import.meta.env.BASE_URL ?? '/';
function apiUrl(path: string) { return BASE_URL.replace(/\/$/, '') + path; }

export default function TokenDetail() {
  const { address } = useParams<{ address: string }>();
  const navigate    = useNavigate();

  const { data: token, isLoading, isError } = useQuery<VToken | null>({
    queryKey: ['vtoken-by-addr', address],
    queryFn: async () => {
      if (!address) return null;
      const res = await fetch(apiUrl(`/api/virtuals/token-by-address/${address}`));
      if (!res.ok) return null;
      return res.json() as Promise<VToken>;
    },
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="pt-20 flex items-center justify-center font-mono text-[11px] uppercase tracking-widest"
        style={{ color: 'var(--out-muted)', minHeight: '60vh' }}>
        ◌ LOADING TOKEN DATA…
      </div>
    );
  }

  if (isError || !token) {
    return (
      <div className="pt-20 flex flex-col items-center justify-center gap-4 font-mono text-[11px] uppercase tracking-widest"
        style={{ color: 'var(--out-muted)', minHeight: '60vh' }}>
        <span>TOKEN NOT FOUND — {address}</span>
        <button
          onClick={() => navigate('/')}
          className="border px-4 py-2 text-[11px] uppercase tracking-widest transition-colors"
          style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>
          ← RETURN TO MARKET
        </button>
      </div>
    );
  }

  return <TokenDetailPage token={token} onBack={() => navigate('/')} />;
}
