import React, { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { useNavigate } from 'react-router-dom';
import { Sheet } from '@/components/Sheet';

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════════════ */
interface VToken {
  id: number;
  name: string;
  ticker: string;
  address: string;
  creator: string;
  mcapInVirtual: number;
  fdvInVirtual: number;
  volume24h: number;
  priceChange24h: number;
  holderCount: number;
  liquidityUsd: number;
  status: 'BONDING' | 'GRADUATED';
  curveProgress: number;
  chain: string;
  createdAt: string;
  launchedAt: string;
  description: string;
  image: string | null;
  category: string;
  isVerified: boolean;
  mindshare: number | null;
}

interface VTokensResponse {
  tokens: VToken[];
  meta: { total: number; page: number; pageCount: number; pageSize: number };
  error?: string;
}

interface VSummary {
  totalTokens: number;
  graduatedTokens: number;
  bondingTokens: number;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════════════════════════════════════ */
type SortKey   = 'mcapInVirtual:desc' | 'volume24h:desc' | 'createdAt:desc' | 'priceChangePercent24h:desc' | 'holderCount:desc' | 'mindshare:desc';
type ChainKey  = 'ROBINHOOD' | 'BASE' | 'ALL';
type StatusKey = '' | 'BONDING' | 'GRADUATED';

const BASE_URL = import.meta.env.BASE_URL ?? '/';
function apiUrl(path: string) {
  return BASE_URL.replace(/\/$/, '') + path;
}
const REFRESH_MS = 30_000;

/* ═══════════════════════════════════════════════════════════════════════════
   FORMATTERS
═══════════════════════════════════════════════════════════════════════════ */
function fmtVirtual(n: number): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
function fmtUsd(n: number): string {
  if (!n) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtPct(n: number): string {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   HOOKS
═══════════════════════════════════════════════════════════════════════════ */
function useVirtualPrice(): number {
  const { data } = useQuery<{ usd: number }>({
    queryKey: ['virtual-price'],
    queryFn: () => fetch(apiUrl('/api/virtuals/virtual-price')).then(r => r.json()),
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
  return data?.usd ?? 0;
}

function useVirtualsTokens(params: { sort: SortKey; chain: ChainKey; status: StatusKey; search: string; page: number }) {
  return useQuery<VTokensResponse>({
    queryKey: ['virtuals-tokens', params],
    queryFn: async () => {
      const p = new URLSearchParams({ sort: params.sort, chain: params.chain, page: String(params.page), pageSize: '50' });
      if (params.status) p.set('status', params.status);
      if (params.search) p.set('search', params.search);
      const res = await fetch(apiUrl(`/api/virtuals/tokens?${p}`));
      return res.json();
    },
    refetchInterval: REFRESH_MS,
    staleTime: 15_000,
  });
}
function useVirtualsSummary() {
  return useQuery<VSummary>({
    queryKey: ['virtuals-summary'],
    queryFn: () => fetch(apiUrl('/api/virtuals/summary')).then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   AVATAR
═══════════════════════════════════════════════════════════════════════════ */
function TokenAvatar({ token, size = 32 }: { token: VToken; size?: number }) {
  const [err, setErr] = useState(false);
  if (token.image && !err) {
    return (
      <img src={token.image} alt={token.ticker} onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: 4, objectFit: 'cover', border: '1px solid var(--out-grid-major)', flexShrink: 0 }} />
    );
  }
  const seed = token.ticker.charCodeAt(0) + token.ticker.charCodeAt(Math.max(0, token.ticker.length - 1));
  const hue  = (seed * 37) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: 4, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.28, fontWeight: 700,
      background: `hsl(${hue},55%,10%)`,
      border: `1px solid hsl(${hue},55%,28%)`,
      color: `hsl(${hue},70%,60%)`,
    }}>
      {token.ticker.slice(0, 2)}
    </div>
  );
}

function CurveBarInline({ pct, wide = false }: { pct: number; wide?: boolean }) {
  const clamped = Math.min(pct, 100);
  const color   = clamped >= 100 ? 'var(--out-ink)' : `hsl(${80 + clamped * 0.4}, 70%, 45%)`;
  return (
    <div className="flex items-center gap-1.5">
      <div style={{ width: wide ? 80 : 56, height: 6, background: 'var(--out-bg)', border: '1px solid var(--out-muted)', overflow: 'hidden', borderRadius: 2 }}>
        <div style={{ width: `${clamped}%`, height: '100%', background: color, transition: 'width .4s', borderRadius: 2 }} />
      </div>
      <span className="text-[12px]" style={{ color: 'var(--out-muted)', minWidth: 30, textAlign: 'right' }}>{Math.round(clamped)}%</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GECKO TERMINAL CHART EMBED
═══════════════════════════════════════════════════════════════════════════ */
const GECKO_NETWORK = 'robinhood';

/* ═══════════════════════════════════════════════════════════════════════════
   SKELETON
═══════════════════════════════════════════════════════════════════════════ */
function Skeleton() {
  return (
    <div className="flex flex-col gap-0">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5 px-2 border-b" style={{ borderColor: 'var(--out-grid-major)' }}>
          <div className="w-8 h-8 rounded animate-pulse shrink-0" style={{ background: 'var(--out-grid-major)' }} />
          <div className="flex-1 h-3 rounded animate-pulse" style={{ background: 'var(--out-grid-major)', animationDelay: `${i * 60}ms` }} />
          <div className="w-20 h-3 rounded animate-pulse" style={{ background: 'var(--out-grid-major)', animationDelay: `${i * 80}ms` }} />
          <div className="w-16 h-3 rounded animate-pulse" style={{ background: 'var(--out-grid-major)', animationDelay: `${i * 100}ms` }} />
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════ */
export function MarketPage() {
  const { address } = useAccount();
  const navigate    = useNavigate();

  const [sort, setSort]         = useState<SortKey>('createdAt:desc');
  const [chain, setChain]       = useState<ChainKey>('ROBINHOOD');
  const [status, setStatus]     = useState<StatusKey>('');
  const [search, setSearch]     = useState('');
  const [debSearch, setDebSearch] = useState('');
  const [page, setPage]         = useState(1);
  const [lastSync, setLastSync] = useState(new Date());
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);

  useEffect(() => {
    const t = setTimeout(() => { setDebSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const vp = useVirtualPrice();
  const { data, isLoading, isFetching, refetch } = useVirtualsTokens({ sort, chain, status, search: debSearch, page });
  const { data: summary } = useVirtualsSummary();

  useEffect(() => {
    let c = REFRESH_MS / 1000;
    const id = setInterval(() => {
      c--;
      if (c <= 0) { c = REFRESH_MS / 1000; setLastSync(new Date()); }
      setCountdown(c);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const manualRefresh = useCallback(() => {
    refetch(); setLastSync(new Date()); setCountdown(REFRESH_MS / 1000);
  }, [refetch]);

  const tokens = data?.tokens ?? [];
  const meta   = data?.meta;
  const apiErr = data?.error;

  const syncStr = lastSync.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }) + ' UTC';

  const SORT_TABS: { label: string; value: SortKey }[] = [
    { label: 'TOP MCAP',  value: 'mcapInVirtual:desc' },
    { label: 'VOLUME',    value: 'volume24h:desc' },
    { label: 'NEWEST',    value: 'createdAt:desc' },
    { label: '24H GAIN',  value: 'priceChangePercent24h:desc' },
    { label: 'HOLDERS',   value: 'holderCount:desc' },
    { label: 'MINDSHARE', value: 'mindshare:desc' },
  ];
  const CHAIN_BTNS: { label: string; value: ChainKey }[] = [
    { label: 'ROBINHOOD', value: 'ROBINHOOD' },
  ];
  const STATUS_BTNS: [string, StatusKey][] = [['NEW', ''], ['BONDING', 'BONDING'], ['GRADUATED', 'GRADUATED']];

  const btnStyle = (active: boolean) => ({
    borderColor: active ? 'var(--out-ink)' : 'var(--out-ink-dim)',
    color: active ? 'var(--out-ink)' : 'var(--out-muted)',
    background: active ? '#12180f' : 'transparent',
  });

  return (
    <>
      <div className="max-w-[1700px] mx-auto px-4 py-6 flex flex-col gap-4">

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
          {[
            { label: 'TOTAL AGENTS',     val: summary?.totalTokens?.toLocaleString() ?? '—',  sub: chain === 'ALL' ? 'BOTH CHAINS' : chain + ' CHAIN' },
            { label: 'ON BONDING CURVE', val: summary?.bondingTokens?.toLocaleString() ?? '—', sub: 'PRE-GRADUATION' },
            { label: 'GRADUATED',        val: summary?.graduatedTokens?.toLocaleString() ?? '—', sub: 'BONDING CURVE COMPLETE' },
            { label: 'MY LAUNCHES',      val: address ? String(tokens.filter(t => t.creator?.toLowerCase() === address.toLowerCase()).length) : '—', sub: address ? 'THIS PAGE' : 'CONNECT WALLET' },
          ].map(s => (
            <div key={s.label} className="border border-[var(--out-grid-major)] px-4 py-3 flex flex-col gap-1">
              <div className="text-[12px] uppercase tracking-widest text-[var(--out-muted)]">{s.label}</div>
              <div className="text-[22px] font-bold leading-none" style={{ color: 'var(--out-ink)' }}>{s.val}</div>
              <div className="text-[12px] text-[var(--out-muted)]">{s.sub}</div>
            </div>
          ))}
        </div>

        <Sheet dwgNo="OUT-MKT-02" figCaption="FIG. 02 — VIRTUALS PROTOCOL MARKET · LIVE DATA">
          <div className="flex flex-col gap-3 py-3">

            {/* Controls */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex font-mono text-[13px]">
                  {CHAIN_BTNS.map(c => (
                    <button key={c.value} onClick={() => { setChain(c.value); setPage(1); }}
                      className="px-2 sm:px-3 py-1.5 uppercase tracking-widest border-y border-l last:border-r transition-colors"
                      style={btnStyle(chain === c.value)}>{c.label}</button>
                  ))}
                </div>
                <div className="flex font-mono text-[13px]">
                  {STATUS_BTNS.map(([label, val]) => (
                    <button key={val}
                      onClick={() => {
                        setStatus(val);
                        setPage(1);
                        if (val === '') setSort('createdAt:desc');
                      }}
                      className="px-2 sm:px-3 py-1.5 uppercase tracking-widest border-y border-l last:border-r transition-colors"
                      style={btnStyle(status === val)}>{label}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2 font-mono text-[13px] ml-auto shrink-0">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${isFetching ? 'bg-white' : 'bg-[var(--out-ink)] animate-pulse'}`} />
                  <span style={{ color: 'var(--out-ink)' }}>LIVE</span>
                  <span className="hidden sm:inline" style={{ color: 'var(--out-muted)' }}>· {syncStr}</span>
                  <button onClick={manualRefresh}
                    className="px-2 py-1 border transition-colors"
                    style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>↻</button>
                </div>
              </div>

              <div className="flex items-center gap-2 border px-3 py-1.5 font-mono text-[11px]"
                style={{ borderColor: 'var(--out-ink-dim)', background: 'var(--out-bg)' }}>
                <span style={{ color: 'var(--out-muted)' }}>⌕</span>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="SEARCH NAME / TICKER"
                  className="flex-1 bg-transparent outline-none uppercase tracking-wide text-[13px] placeholder:text-[13px]"
                  style={{ color: 'var(--out-text)' }} />
                {search && <button onClick={() => setSearch('')} style={{ color: 'var(--out-muted)' }}>✕</button>}
              </div>
            </div>

            {/* Sort tabs */}
            <div className="flex gap-0 font-mono text-[13px] overflow-x-auto no-scrollbar border-b" style={{ borderColor: 'var(--out-grid-major)' }}>
              {SORT_TABS.map(s => (
                <button key={s.value} onClick={() => { setSort(s.value); setPage(1); }}
                  className="px-4 py-2 uppercase tracking-widest whitespace-nowrap transition-colors border-b-2"
                  style={{ borderBottomColor: sort === s.value ? 'var(--out-ink)' : 'transparent', color: sort === s.value ? 'var(--out-ink)' : 'var(--out-muted)', marginBottom: '-1px' }}>
                  {s.label}
                </button>
              ))}
            </div>

            {apiErr && (
              <div className="border px-4 py-2 font-mono text-[13px] uppercase tracking-widest"
                style={{ borderColor: 'var(--out-warn)', color: 'var(--out-warn)' }}>⚠ API ERROR: {apiErr}</div>
            )}

            {/* Click-to-detail hint */}
            {!isLoading && tokens.length > 0 && (
              <div className="font-mono text-[12px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
                <span className="sm:hidden">◈ TAP ANY ROW TO OPEN TRADE PANEL</span>
                <span className="hidden sm:inline">◈ CLICK ANY ROW TO OPEN TRADE PANEL</span>
              </div>
            )}

            {/* ── EMPTY / LOADING ── */}
            {isLoading ? <Skeleton /> : tokens.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 font-mono">
                <span className="text-5xl opacity-10" style={{ color: 'var(--out-ink)' }}>▦</span>
                <span className="text-[13px] uppercase tracking-widest text-center" style={{ color: 'var(--out-muted)' }}>
                  {debSearch ? `NO RESULTS FOR "${debSearch.toUpperCase()}"` : 'NO TOKENS FOUND'}
                </span>
              </div>
            ) : (<>

              {/* ══ MOBILE CARD LIST (< sm) ══════════════════════════════════ */}
              <div className="sm:hidden flex flex-col">
                {tokens.map((t, i) => {
                  const rank   = (page - 1) * 50 + i + 1;
                  const isNew  = Date.now() - new Date(t.launchedAt).getTime() < 10 * 60 * 1000;
                  const isMine = !!address && t.creator?.toLowerCase() === address.toLowerCase();
                  const posChg = t.priceChange24h >= 0;
                  return (
                    <div key={t.id}
                      className="flex items-center gap-3 px-2 py-2.5 border-b cursor-pointer transition-colors"
                      style={{ borderColor: 'var(--out-grid-major)', background: isMine ? '#0A120A' : 'transparent' }}
                      onClick={() => navigate('/token/' + t.address, { state: { token: t } })}>

                      {/* Rank */}
                      <span className="text-[12px] shrink-0 w-5 text-right font-mono" style={{ color: 'var(--out-muted)' }}>{rank}</span>

                      {/* Avatar */}
                      <TokenAvatar token={t} size={36} />

                      {/* Name + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[12px] font-bold font-mono" style={{ color: 'var(--out-ink)' }}>${t.ticker}</span>
                          {t.isVerified && <span className="text-[13px] border px-1" style={{ borderColor: '#39d353', color: '#39d353' }}>✓</span>}
                          {isNew  && <span className="text-[13px] border px-1 animate-pulse" style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>NEW</span>}
                          {isMine && <span className="text-[13px] border px-1" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>MINE</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap font-mono">
                          <span className="text-[12px]" style={{ color: 'var(--out-text)' }}>{vp > 0 ? fmtUsd(t.mcapInVirtual * vp) : `${fmtVirtual(t.mcapInVirtual)} VRTL`}</span>
                          <span className="text-[12px]" style={{ color: 'var(--out-muted)' }}>·</span>
                          <span className="text-[12px]" style={{ color: 'var(--out-muted)' }}>{ago(t.launchedAt)}</span>
                        </div>
                      </div>

                      {/* 24h % + status */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[11px] font-bold font-mono"
                          style={{ color: t.priceChange24h === 0 ? 'var(--out-muted)' : posChg ? '#39d353' : '#f87171' }}>
                          {t.priceChange24h !== 0 ? fmtPct(t.priceChange24h) : '—'}
                        </span>
                        <span className="text-[11px] border px-1.5 py-0.5 uppercase tracking-widest"
                          style={t.status === 'GRADUATED'
                            ? { borderColor: 'var(--out-ink)', color: 'var(--out-ink)', background: '#12180f' }
                            : { borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
                          {t.status === 'GRADUATED' ? '✓ GRAD' : '◉ CURVE'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ══ DESKTOP TABLE (sm+) ══════════════════════════════════════ */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full font-mono text-[13px] border-collapse" style={{ minWidth: 780 }}>
                  <thead>
                    <tr className="text-left" style={{ borderBottom: '1px solid var(--out-grid-major)' }}>
                      {['#', 'AGENT TOKEN', 'MCAP (USD)', 'VOL 24H', '24H %', 'LIQUIDITY', 'HOLDERS', 'CURVE', 'AGE', 'STATUS'].map(h => (
                        <th key={h} className="py-2 pr-3 last:pr-0 text-[12px] uppercase tracking-widest"
                          style={{ color: 'var(--out-muted)', fontWeight: 400, textAlign: h === '#' || h === 'AGENT TOKEN' ? 'left' : 'right', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((t, i) => {
                      const rank   = (page - 1) * 50 + i + 1;
                      const isNew  = Date.now() - new Date(t.launchedAt).getTime() < 10 * 60 * 1000;
                      const isMine = !!address && t.creator?.toLowerCase() === address.toLowerCase();
                      const posChg = t.priceChange24h >= 0;
                      return (
                        <tr key={t.id}
                          className="border-b cursor-pointer transition-colors group"
                          style={{ borderColor: 'var(--out-grid-major)', background: isMine ? '#0A120A' : 'transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#0E1A0E')}
                          onMouseLeave={e => (e.currentTarget.style.background = isMine ? '#0A120A' : 'transparent')}
                          onClick={() => navigate('/token/' + t.address, { state: { token: t } })}>
                          <td className="py-2.5 pr-3 text-[12px]" style={{ color: 'var(--out-muted)' }}>{rank}</td>
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2">
                              <TokenAvatar token={t} size={32} />
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold" style={{ color: 'var(--out-ink)' }}>${t.ticker}</span>
                                  {t.isVerified && <span className="text-[11px] px-1 border" style={{ borderColor: '#39d353', color: '#39d353' }}>✓</span>}
                                  {isNew  && <span className="text-[11px] border px-1 animate-pulse" style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>NEW</span>}
                                  {isMine && <span className="text-[11px] border px-1" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>MINE</span>}
                                </div>
                                <span className="text-[12px] truncate max-w-[130px]" style={{ color: 'var(--out-muted)' }}>{t.name}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 text-right" style={{ color: 'var(--out-text)' }}>{vp > 0 ? fmtUsd(t.mcapInVirtual * vp) : `${fmtVirtual(t.mcapInVirtual)} VRTL`}</td>
                          <td className="py-2.5 pr-3 text-right" style={{ color: 'var(--out-text)' }}>
                            {t.volume24h > 0 ? (vp > 0 ? fmtUsd(t.volume24h * vp) : `${fmtVirtual(t.volume24h)} VRTL`) : '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-bold"
                            style={{ color: t.priceChange24h === 0 ? 'var(--out-muted)' : posChg ? '#39d353' : '#f87171' }}>
                            {t.priceChange24h !== 0 ? fmtPct(t.priceChange24h) : '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-right" style={{ color: 'var(--out-text)' }}>{fmtUsd(t.liquidityUsd)}</td>
                          <td className="py-2.5 pr-3 text-right" style={{ color: 'var(--out-text)' }}>
                            {t.holderCount ? t.holderCount.toLocaleString() : '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-right">
                            <CurveBarInline pct={t.curveProgress} />
                          </td>
                          <td className="py-2.5 pr-3 text-right text-[12px]" style={{ color: 'var(--out-muted)' }}>{ago(t.launchedAt)}</td>
                          <td className="py-2.5 text-right">
                            <span className="text-[12px] border px-1.5 py-0.5 uppercase tracking-widest group-hover:border-[var(--out-ink)] transition-colors"
                              style={t.status === 'GRADUATED'
                                ? { borderColor: 'var(--out-ink)', color: 'var(--out-ink)', background: '#12180f' }
                                : { borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
                              {t.status === 'GRADUATED' ? '✓ GRAD' : '◉ CURVE'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>)}

            {/* Pagination */}
            {meta && meta.pageCount > 1 && (
              <div className="flex items-center justify-between font-mono text-[13px] pt-2 flex-wrap gap-2">
                <span style={{ color: 'var(--out-muted)' }} className="uppercase tracking-widest">
                  {((page - 1) * 50) + 1}–{Math.min(page * 50, meta.total)} OF {meta.total.toLocaleString()} AGENTS
                </span>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                    className="border px-3 py-1 uppercase tracking-widest disabled:opacity-30"
                    style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>← PREV</button>
                  <span className="border px-3 py-1" style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>
                    {page} / {meta.pageCount}
                  </span>
                  <button disabled={page >= meta.pageCount} onClick={() => setPage(p => p + 1)}
                    className="border px-3 py-1 uppercase tracking-widest disabled:opacity-30"
                    style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>NEXT →</button>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t font-mono text-[12px] uppercase tracking-widest flex-wrap gap-1"
              style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
              <span>
                <span className="inline-block w-1 h-1 rounded-full bg-[var(--out-ink)] mr-1.5" />
                SOURCE: VIRTUALS PROTOCOL API · MCAP/VOL IN USD · AUTO-REFRESH 30S
              </span>
            </div>
          </div>
        </Sheet>
      </div>
    </>
  );
}
