import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Sheet } from '@/components/Sheet';

const BASE_URL = import.meta.env.BASE_URL ?? '/';
function apiUrl(path: string) { return BASE_URL.replace(/\/$/, '') + path; }

/* ─── types ─────────────────────────────────────────────────────────────── */
interface Launch {
  id: number;
  walletAddress: string;
  tokenAddress: string | null;
  name: string;
  ticker: string;
  imageUri: string | null;
  txHash: string;
  network: string;
  status: 'pending' | 'confirmed' | 'failed';
  createdAt: string;
}

/* ─── helpers ────────────────────────────────────────────────────────────── */
const EXPLORER = 'https://robinhoodchain.blockscout.com';

function short(addr: string, chars = 6) {
  if (!addr) return '—';
  return `${addr.slice(0, chars)}…${addr.slice(-4)}`;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function TokenAvatar({ name, ticker, img }: { name: string; ticker: string; img: string | null }) {
  const [err, setErr] = useState(false);
  if (img && !err) {
    return (
      <img src={img} alt={ticker} onError={() => setErr(true)}
        style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover',
          border: '1px solid var(--out-grid-major)', flexShrink: 0 }} />
    );
  }
  const seed = (name.charCodeAt(0) ?? 65) + (ticker.charCodeAt(0) ?? 65);
  const hue  = (seed * 47) % 360;
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 4, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700,
      background: `hsl(${hue},55%,8%)`,
      border: `1px solid hsl(${hue},55%,22%)`,
      color: `hsl(${hue},70%,55%)`,
    }}>
      {ticker.slice(0, 2)}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    confirmed: { label: 'LIVE',    color: 'var(--out-ink)', bg: '#0d1a00' },
    pending:   { label: 'PENDING', color: '#facc15',        bg: '#1a1500' },
    failed:    { label: 'FAILED',  color: '#f87171',        bg: '#1a0000' },
  }[status] ?? { label: status.toUpperCase(), color: 'var(--out-muted)', bg: 'transparent' };

  return (
    <span className="font-mono text-[11px] px-1.5 py-0.5 border uppercase tracking-widest"
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.color }}>
      {cfg.label}
    </span>
  );
}

/* ─── main page ──────────────────────────────────────────────────────────── */
export function LaunchesPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading, dataUpdatedAt, refetch } = useQuery<Launch[]>({
    queryKey: ['launches-page'],
    queryFn: () => fetch(apiUrl('/api/launches?limit=500')).then(r => r.json()),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const launches = Array.isArray(data) ? data : [];
  const filtered = search.trim()
    ? launches.filter(l =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.ticker.toLowerCase().includes(search.toLowerCase()) ||
        l.walletAddress.toLowerCase().includes(search.toLowerCase()) ||
        (l.tokenAddress ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : launches;

  const confirmed      = launches.filter(l => l.status === 'confirmed').length;
  const uniqueDeployers = new Set(launches.map(l => l.walletAddress.toLowerCase())).size;

  const syncStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }) + ' UTC'
    : '—';

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col gap-4">

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono">
        {[
          { label: 'TOTAL LAUNCHES',   val: isLoading ? '—' : String(launches.length), sub: 'VIA OUTRIVE CHAT AGENT' },
          { label: 'CONFIRMED',        val: isLoading ? '—' : String(confirmed),        sub: 'ON-CHAIN' },
          { label: 'UNIQUE DEPLOYERS', val: isLoading ? '—' : String(uniqueDeployers),  sub: 'WALLET ADDRESSES' },
        ].map(s => (
          <div key={s.label} className="border border-[var(--out-grid-major)] px-4 py-3 flex flex-col gap-1">
            <div className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>{s.label}</div>
            <div className="text-[22px] font-bold leading-none" style={{ color: 'var(--out-ink)' }}>{s.val}</div>
            <div className="text-[11px]" style={{ color: 'var(--out-muted)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <Sheet dwgNo="OUT-LNC-01" figCaption="FIG. 03 — OUTRIVE LAUNCHES · CHAT AGENT INDEXED">
        <div className="flex flex-col gap-3 py-3">

          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 border px-3 py-1.5 font-mono text-[11px] flex-1 min-w-[200px]"
              style={{ borderColor: 'var(--out-ink-dim)', background: 'var(--out-bg)' }}>
              <span style={{ color: 'var(--out-muted)' }}>⌕</span>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="SEARCH NAME / TICKER / WALLET"
                className="flex-1 bg-transparent outline-none uppercase tracking-wide text-[13px] placeholder:text-[13px]"
                style={{ color: 'var(--out-text)' }}
              />
              {search && <button onClick={() => setSearch('')} style={{ color: 'var(--out-muted)' }}>✕</button>}
            </div>
            <div className="flex items-center gap-2 font-mono text-[13px] shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--out-ink)] animate-pulse inline-block" />
              <span style={{ color: 'var(--out-ink)' }}>LIVE</span>
              <span className="hidden sm:inline text-[12px]" style={{ color: 'var(--out-muted)' }}>· {syncStr}</span>
              <button onClick={() => refetch()}
                className="px-2 py-1 border text-[12px]"
                style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>↻</button>
            </div>
          </div>

          {/* Column headers — desktop */}
          {launches.length > 0 && (
            <div className="hidden sm:grid font-mono text-[11px] uppercase tracking-widest px-3 py-1 border-b"
              style={{ gridTemplateColumns: '36px 1fr 160px 160px 100px 80px 90px', gap: '12px', borderColor: 'var(--out-grid-major)', color: 'var(--out-muted)' }}>
              <span /><span>TOKEN</span><span>DEPLOYER</span><span>TOKEN ADDR</span>
              <span>TX</span><span>TIME</span><span>STATUS</span>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col gap-2 py-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 border animate-pulse"
                  style={{ borderColor: 'var(--out-grid-major)', background: 'var(--out-bg)', opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && launches.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-5 font-mono">
              <div className="text-6xl opacity-10" style={{ color: 'var(--out-ink)' }}>▲</div>
              <div className="flex flex-col items-center gap-2 text-center max-w-sm">
                <span className="text-[13px] uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>
                  AWAITING FIRST LAUNCH
                </span>
                <span className="text-[12px] leading-relaxed" style={{ color: 'var(--out-muted)' }}>
                  TOKENS LAUNCHED VIA THE OUTRIVE CHAT AGENT WILL APPEAR HERE.
                  OPEN THE AGENT TAB AND DEPLOY YOUR FIRST TOKEN.
                </span>
              </div>
              <a href="#agent"
                onClick={e => { e.preventDefault(); (window as any).__outriveNav?.('agent'); }}
                className="px-4 py-2 border font-mono text-[12px] uppercase tracking-widest transition-colors hover:bg-[#0d1200]"
                style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>
                ▲ OPEN AGENT
              </a>
            </div>
          )}

          {/* No search results */}
          {!isLoading && launches.length > 0 && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 font-mono">
              <span className="text-[13px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
                NO RESULTS FOR "{search.toUpperCase()}"
              </span>
            </div>
          )}

          {/* Rows */}
          {!isLoading && filtered.length > 0 && (
            <div className="flex flex-col">
              {filtered.map((l, i) => (
                <LaunchRow key={l.id} launch={l} rank={i + 1} />
              ))}
            </div>
          )}

          <div className="font-mono text-[11px] pt-2 border-t" style={{ borderColor: 'var(--out-grid-major)', color: 'var(--out-muted)' }}>
            · SOURCE: OUTRIVE CHAT AGENT · ROBINHOOD CHAIN · AUTO-REFRESH 30S
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function LaunchRow({ launch: l, rank }: { launch: Launch; rank: number }) {
  const navigate       = useNavigate();
  const explorerTx     = l.txHash      ? `${EXPLORER}/tx/${l.txHash}` : null;
  const explorerAddr   = l.tokenAddress ? `${EXPLORER}/token/${l.tokenAddress}` : null;
  const explorerWallet = `${EXPLORER}/address/${l.walletAddress}`;
  const canOpen        = !!l.tokenAddress;

  const handleRowClick = () => {
    if (canOpen) navigate(`/token/${l.tokenAddress}`);
  };

  return (
    <>
      {/* MOBILE */}
      <div className="sm:hidden flex gap-3 py-3 border-b items-start"
        onClick={handleRowClick}
        style={{ borderColor: 'var(--out-grid-major)', cursor: canOpen ? 'pointer' : 'default' }}>
        <TokenAvatar name={l.name} ticker={l.ticker} img={l.imageUri} />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-[14px]" style={{ color: 'var(--out-ink)' }}>{l.name}</span>
            <span className="font-mono text-[12px]" style={{ color: 'var(--out-muted)' }}>${l.ticker}</span>
            <StatusBadge status={l.status} />
          </div>
          <div className="font-mono text-[11px]" style={{ color: 'var(--out-muted)' }}>
            DEPLOYER&nbsp;
            <a href={explorerWallet} target="_blank" rel="noopener noreferrer"
              className="hover:underline" style={{ color: 'var(--out-text)' }}>{short(l.walletAddress)}</a>
          </div>
          {l.tokenAddress && (
            <div className="font-mono text-[11px]" style={{ color: 'var(--out-muted)' }}>
              ADDR&nbsp;
              <a href={explorerAddr!} target="_blank" rel="noopener noreferrer"
                className="hover:underline" style={{ color: 'var(--out-text)' }}>{short(l.tokenAddress)}</a>
            </div>
          )}
          <div className="font-mono text-[11px]" style={{ color: 'var(--out-muted)' }}>
            {timeAgo(l.createdAt)}
            {explorerTx && (
              <>&nbsp;·&nbsp;
                <a href={explorerTx} target="_blank" rel="noopener noreferrer"
                  className="hover:underline" style={{ color: 'var(--out-text)' }}>TX ↗</a>
              </>
            )}
          </div>
        </div>
      </div>

      {/* DESKTOP */}
      <div className="hidden sm:grid items-center gap-3 px-3 py-2 border-b transition-colors hover:bg-[#0d1200]"
        onClick={handleRowClick}
        style={{ gridTemplateColumns: '36px 1fr 160px 160px 100px 80px 90px', borderColor: 'var(--out-grid-major)', cursor: canOpen ? 'pointer' : 'default' }}>
        <TokenAvatar name={l.name} ticker={l.ticker} img={l.imageUri} />
        <div className="flex flex-col min-w-0">
          <span className="font-mono font-bold text-[14px] truncate" style={{ color: 'var(--out-ink)' }}>{l.name}</span>
          <span className="font-mono text-[12px]" style={{ color: 'var(--out-muted)' }}>${l.ticker}</span>
        </div>
        <a href={explorerWallet} target="_blank" rel="noopener noreferrer"
          className="font-mono text-[12px] hover:underline truncate" style={{ color: 'var(--out-text)' }}>
          {short(l.walletAddress)}
        </a>
        {l.tokenAddress
          ? <a href={explorerAddr!} target="_blank" rel="noopener noreferrer"
              className="font-mono text-[12px] hover:underline truncate" style={{ color: 'var(--out-text)' }}>
              {short(l.tokenAddress)}
            </a>
          : <span className="font-mono text-[12px]" style={{ color: 'var(--out-muted)' }}>—</span>
        }
        {explorerTx
          ? <a href={explorerTx} target="_blank" rel="noopener noreferrer"
              className="font-mono text-[12px] hover:underline truncate" style={{ color: 'var(--out-text)' }}>
              {short(l.txHash, 6)}
            </a>
          : <span className="font-mono text-[12px]" style={{ color: 'var(--out-muted)' }}>—</span>
        }
        <span className="font-mono text-[12px]" style={{ color: 'var(--out-muted)' }}>{timeAgo(l.createdAt)}</span>
        <StatusBadge status={l.status} />
      </div>
    </>
  );
}
