import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useAccount, useBalance, useReadContracts } from 'wagmi';
import { parseAbi, formatUnits } from 'viem';
import {
  Bot, TrendingUp, LayoutDashboard,
  BookOpen, Play, Terminal, Network,
  HelpCircle, Info, ScrollText,
  Menu, X, Coins, Rocket,
  CandlestickChart, Zap,
} from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { ChatConsole } from '@/components/ChatConsole';
import { MarketPanel } from '@/components/MarketPanel';
import { MarketPage } from '@/pages/MarketPage';
import { WhitepaperPage } from '@/pages/WhitepaperPage';
import { LaunchesPage } from '@/pages/LaunchesPage';
import { OutrivePage } from '@/pages/OutrivePage';
import { CliDocsPage } from '@/pages/CliDocsPage';
import { RwaPage } from '@/pages/RwaPage';
import { AutonomousPage } from '@/pages/AutonomousPage';
import { DistributionPage } from '@/pages/DistributionPage';
import { TickerStrip } from '@/components/MarketTicker';
import { CalibrationBanner } from '@/components/CalibrationBanner';
import { useListLaunches, useGetSystemStatus, useGetMarketSummary } from '@workspace/api-client-react';
import type { Launch } from '@workspace/api-client-react';

/* ── API URL helper ── */
const _BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
function apiUrl(path: string) { return _BASE + path; }

type StepState = 'active' | 'locked' | 'done';
type View = 'agent' | 'market' | 'launches' | 'dashboard' | 'outrive' | 'rwa' | 'autonomous' | 'docs' | 'faq' | 'architecture' | 'about' | 'howto' | 'cli' | 'whitepaper' | 'distribution';

function StepBadge({ label, state }: { label: string; state: StepState }) {
  const color = state === 'active'
    ? 'border-[var(--out-ink)] text-[var(--out-ink)]'
    : state === 'done'
    ? 'border-[var(--out-ink)] text-[var(--out-ink)] bg-[#12180f]'
    : 'border-[var(--out-ink-dim)] text-[var(--out-muted)]';
  return (
    <span className={`border px-1.5 sm:px-2 py-0.5 font-mono text-[11px] sm:text-[13px] uppercase tracking-wide sm:tracking-widest shrink-0 whitespace-nowrap ${color}`}>
      {state === 'active' ? '● ' : state === 'done' ? '✓ ' : '○ '}{label}
    </span>
  );
}

type TabDef = { id: View; label: string; Icon: React.ElementType };

const APP_TABS: TabDef[] = [
  { id: 'agent',      label: 'AGENT',      Icon: Bot               },
  { id: 'market',     label: 'MARKET',     Icon: TrendingUp        },
  { id: 'launches',   label: 'LAUNCHES',   Icon: Rocket            },
  { id: 'dashboard',  label: 'DASHBOARD',  Icon: LayoutDashboard   },
  { id: 'outrive',    label: 'OUTRIVE',    Icon: Coins             },
  { id: 'rwa',        label: 'RWA TRADE',  Icon: CandlestickChart  },
  { id: 'autonomous',   label: 'AUTONOMOUS',   Icon: Zap               },
  { id: 'distribution', label: 'DISTRIBUTION', Icon: TrendingUp        },
];
const INFO_TABS: TabDef[] = [
  { id: 'docs',         label: 'DOCS',         Icon: BookOpen    },
  { id: 'howto',        label: 'HOW TO',       Icon: Play        },
  { id: 'cli',          label: 'CLI',          Icon: Terminal    },
  { id: 'architecture', label: 'ARCHITECTURE', Icon: Network     },
  { id: 'faq',          label: 'FAQ',          Icon: HelpCircle  },
  { id: 'about',        label: 'ABOUT',        Icon: Info        },
  { id: 'whitepaper',   label: 'WHITEPAPER',   Icon: ScrollText  },
];

function NavBar({ view, setView }: { view: View; setView: (v: View) => void }) {
  const [open, setOpen] = useState(false);

  const ALL_TABS = [...APP_TABS, ...INFO_TABS];
  const active = ALL_TABS.find(t => t.id === view) ?? APP_TABS[0];

  const choose = (id: View) => { setView(id); setOpen(false); };

  /* Tabs that are not yet live — show SOON badge */
  const SOON_TABS = new Set<View>(['distribution']);

  /* ── Desktop sidebar item ── */
  const sideItem = (t: TabDef) => (
    <button
      key={t.id}
      onClick={() => choose(t.id)}
      className="flex items-center gap-2.5 w-full px-4 py-2.5 transition-colors text-left"
      style={{
        borderLeft: view === t.id ? '2px solid var(--out-ink)' : '2px solid transparent',
        color: view === t.id ? 'var(--out-ink)' : 'var(--out-muted)',
        background: view === t.id ? '#12180f' : 'transparent',
      }}
      onMouseEnter={e => { if (view !== t.id) e.currentTarget.style.color = 'var(--out-text)'; }}
      onMouseLeave={e => { if (view !== t.id) e.currentTarget.style.color = 'var(--out-muted)'; }}
    >
      <t.Icon size={11} strokeWidth={1.75} style={{ flexShrink: 0 }} />
      <span className="flex-1">{t.label}</span>
      {SOON_TABS.has(t.id) && (
        <span className="text-[8px] px-1 py-0.5 border font-mono tracking-widest shrink-0"
          style={{ borderColor: '#e0902060', color: '#e09020', background: '#0d0a05' }}>
          SOON
        </span>
      )}
    </button>
  );

  return (
    <>
      {/* ══════════════════════════════════════════
          MOBILE  —  sticky burger strip + dropdown
      ══════════════════════════════════════════ */}
      <div
        className="md:hidden sticky top-12 z-40 font-mono text-[13px] uppercase tracking-widest"
        style={{ background: 'var(--out-bg)', borderBottom: '1px solid var(--out-ink-dim)' }}
      >
        {/* Active tab + burger toggle */}
        <div className="flex items-center">
          <div
            className="flex items-center gap-2 flex-1 px-4 py-2.5"
            style={{ color: 'var(--out-ink)', borderBottom: '2px solid var(--out-ink)' }}
          >
            <active.Icon size={11} strokeWidth={1.75} />
            <span>{active.label}</span>
          </div>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center justify-center px-4 py-2.5 border-l transition-colors shrink-0"
            style={{
              borderColor: 'var(--out-ink-dim)',
              color: open ? 'var(--out-ink)' : 'var(--out-muted)',
              background: open ? '#12180f' : 'transparent',
              borderBottom: '2px solid transparent',
            }}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X size={13} strokeWidth={1.75} /> : <Menu size={13} strokeWidth={1.75} />}
          </button>
        </div>

        {/* Dropdown */}
        {open && (
          <div style={{ background: '#080d08', borderTop: '1px solid var(--out-ink-dim)' }}>
            <div className="px-3 pt-2 pb-1 text-[11px] tracking-widest" style={{ color: 'var(--out-muted)' }}>APP</div>
            {APP_TABS.map(t => (
              <button key={t.id} onClick={() => choose(t.id)}
                className="w-full flex items-center gap-3 px-4 py-3 border-t transition-colors"
                style={{
                  borderColor: 'var(--out-ink-dim)',
                  color: view === t.id ? 'var(--out-ink)' : 'var(--out-text)',
                  background: view === t.id ? '#12180f' : 'transparent',
                  borderLeft: view === t.id ? '2px solid var(--out-ink)' : '2px solid transparent',
                }}>
                <t.Icon size={13} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                <span className="text-[11px] flex-1">{t.label}</span>
                {SOON_TABS.has(t.id) && (
                  <span className="text-[8px] px-1 py-0.5 border font-mono tracking-widest"
                    style={{ borderColor: '#e0902060', color: '#e09020', background: '#0d0a05' }}>SOON</span>
                )}
                {view === t.id && !SOON_TABS.has(t.id) && <span className="ml-auto text-[11px]" style={{ color: 'var(--out-ink)' }}>●</span>}
              </button>
            ))}
            <div className="px-3 pt-3 pb-1 text-[11px] tracking-widest border-t"
              style={{ color: 'var(--out-muted)', borderColor: 'var(--out-ink-dim)' }}>INFO</div>
            {INFO_TABS.map(t => (
              <button key={t.id} onClick={() => choose(t.id)}
                className="w-full flex items-center gap-3 px-4 py-3 border-t transition-colors"
                style={{
                  borderColor: 'var(--out-ink-dim)',
                  color: view === t.id ? 'var(--out-ink)' : 'var(--out-text)',
                  background: view === t.id ? '#12180f' : 'transparent',
                  borderLeft: view === t.id ? '2px solid var(--out-ink)' : '2px solid transparent',
                }}>
                <t.Icon size={13} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                <span className="text-[11px]">{t.label}</span>
                {view === t.id && <span className="ml-auto text-[11px]" style={{ color: 'var(--out-ink)' }}>●</span>}
              </button>
            ))}
            <div className="h-2" />
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════
          DESKTOP  —  fixed left sidebar
      ══════════════════════════════════════════ */}
      <aside
        className="hidden md:flex flex-col fixed top-12 left-0 bottom-0 z-40 w-52 overflow-y-auto no-scrollbar border-r font-mono text-[13px] uppercase tracking-widest"
        style={{ background: 'var(--out-bg)', borderColor: 'var(--out-ink-dim)' }}
      >
        <div className="px-3 pt-5 pb-1.5 text-[11px] tracking-widest" style={{ color: 'var(--out-muted)' }}>
          APP
        </div>
        {APP_TABS.map(sideItem)}

        <div className="mx-4 my-3 border-t" style={{ borderColor: 'var(--out-ink-dim)' }} />

        <div className="px-3 pb-1.5 text-[11px] tracking-widest" style={{ color: 'var(--out-muted)' }}>
          INFO
        </div>
        {INFO_TABS.map(sideItem)}

        <div className="mt-auto px-4 py-4">
          <span className="text-[11px] tracking-widest" style={{ color: 'var(--out-muted)', opacity: 0.5 }}>outrive.io</span>
        </div>

      </aside>
    </>
  );
}

/* ─── CLAIM FEE BUTTON ───────────────────────────────────────────────────── */
// AgentTaxV2 — confirmed projectTaxRecipient for all Robinhood Chain tokens.
// Proxy:  0x6d80b81d9fc56a7a839b1af9006eb49151961ce7  (verified Blockscout)
// Impl:   0x4D4e8F06FE9a3dB2FA7AD4D17893128600Ec01bB  (AgentTaxV2, verified)
// getTokenTaxAmounts(tokenAddress) returns (amountCollected, amountSwapped)
//   amountCollected = agent-token units collected as trading fees (18 dec)
//   amountSwapped   = assetToken ($VIRTUAL) received after swap (currently 0 until batch swap is triggered)
const AGENT_TAX_V2_ADDRESS = '0x6d80b81d9fc56a7a839b1af9006eb49151961ce7' as const;
const AGENT_TAX_V2_ABI = parseAbi([
  'function getTokenTaxAmounts(address tokenAddress) view returns (uint256 amountCollected, uint256 amountSwapped)',
]);

// Fees are automatically distributed in USDG directly to the creator wallet
// by the Virtuals Protocol on every trade — no manual claim required.
function FeeInfoBadge({ walletAddress }: { walletAddress: string | undefined }) {
  if (!walletAddress) return null;
  return (
    <div className="mt-4 flex items-start gap-2 border px-3 py-2.5 font-mono text-[12px]"
      style={{ borderColor: 'var(--out-ink-dim)', background: '#080d08', color: 'var(--out-muted)' }}>
      <span style={{ color: 'var(--out-ink)', flexShrink: 0 }}>●</span>
      <span>
        Fees are <span style={{ color: 'var(--out-ink)' }}>automatically sent in USDG</span>{' '}
        directly to your creator wallet by Virtuals Protocol on every trade.
        No claim required.
      </span>
    </div>
  );
}

/* ─── DASHBOARD ─────────────────────────────────────────────────────────── */
function CurveBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = clamped >= 100 ? 'var(--out-ink)' : clamped > 60 ? '#8CB80E' : 'var(--out-ink-dim)';
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-[4px] bg-[#1a1f1a] rounded-none overflow-hidden">
        <div style={{ width: `${clamped}%`, background: color, height: '100%', transition: 'width 0.4s' }} />
      </div>
      <span className="text-[12px] font-mono shrink-0" style={{ color, minWidth: 32, textAlign: 'right' }}>
        {clamped.toFixed(0)}%
      </span>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
      style={{ background: ok ? 'var(--out-ink)' : 'var(--out-warn)', boxShadow: ok ? '0 0 4px var(--out-ink)' : '0 0 4px var(--out-warn)' }}
    />
  );
}

function StatCard({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div className="border border-[var(--out-grid-major)] p-4 flex flex-col gap-1 font-mono">
      <div className="text-[12px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>{label}</div>
      <div className="text-[18px] font-bold leading-none" style={{ color: warn ? 'var(--out-warn)' : 'var(--out-ink)' }}>{value}</div>
      {sub && <div className="text-[12px]" style={{ color: 'var(--out-muted)' }}>{sub}</div>}
    </div>
  );
}

/* Pill badge — no internal wrapping */
function StatusPill({ status }: { status: string }) {
  const cfg =
    status === 'confirmed' ? { label: 'LIVE',    color: 'var(--out-ink)',    bg: 'rgba(130,200,0,.08)' } :
    status === 'failed'    ? { label: 'FAILED',  color: 'var(--out-danger)', bg: 'rgba(248,113,113,.06)' } :
                             { label: 'PENDING', color: 'var(--out-warn)',   bg: 'rgba(250,204,21,.06)' };
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[10px] border px-2 py-0.5 uppercase tracking-widest whitespace-nowrap shrink-0"
      style={{ borderColor: cfg.color, color: cfg.color, background: cfg.bg }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

function LaunchRow({ launch, explorerUrl }: { launch: Launch; explorerUrl?: string }) {
  const navigate = useNavigate();
  const canOpen  = launch.status === 'confirmed'
    && !!launch.tokenAddress
    && !launch.tokenAddress.startsWith('0x000');

  const date = new Date(launch.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC',
  });

  const txLink = explorerUrl && launch.txHash
    ? `${explorerUrl}/tx/${launch.txHash}` : null;

  const handleClick = () => { if (canOpen) navigate(`/token/${launch.tokenAddress}`); };

  return (
    <>
      {/* ── MOBILE card (< sm) ──────────────────────────────────── */}
      <div
        className="sm:hidden flex items-start gap-3 py-3 border-b border-[var(--out-grid-major)] transition-colors hover:bg-[#0d1200]"
        style={{ cursor: canOpen ? 'pointer' : 'default' }}
        onClick={handleClick}
      >
        {/* left: name + meta */}
        <div className="flex-1 min-w-0 font-mono">
          <div className="font-bold text-[14px] truncate" style={{ color: 'var(--out-text)' }}>{launch.name}</div>
          <div className="text-[12px] mt-0.5" style={{ color: 'var(--out-muted)' }}>${launch.ticker} · {date}</div>
          {launch.status === 'confirmed' && (
            <div className="mt-1.5">
              <CurveBar pct={0} />
            </div>
          )}
        </div>
        {/* right: pill + TX */}
        <div className="flex flex-col items-end gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          <StatusPill status={launch.status} />
          {txLink ? (
            <a href={txLink} target="_blank" rel="noreferrer"
              className="font-mono text-[11px] underline decoration-dotted underline-offset-2 hover:text-[var(--out-ink)]"
              style={{ color: 'var(--out-muted)' }}>TX ↗</a>
          ) : <span className="text-[11px]" style={{ color: 'var(--out-muted)' }}>—</span>}
        </div>
      </div>

      {/* ── DESKTOP row (≥ sm) ──────────────────────────────────── */}
      <div
        className="hidden sm:grid font-mono text-[13px] border-b border-[var(--out-grid-major)] py-2.5 items-center gap-3 transition-colors hover:bg-[#0d1200]"
        style={{ gridTemplateColumns: '1fr 80px 1fr 52px', cursor: canOpen ? 'pointer' : 'default' }}
        onClick={handleClick}
      >
        {/* Name + ticker */}
        <div className="min-w-0">
          <div className="font-bold truncate" style={{ color: 'var(--out-text)' }}>{launch.name}</div>
          <div className="text-[12px]" style={{ color: 'var(--out-muted)' }}>${launch.ticker} · {date}</div>
        </div>

        {/* Status pill — fixed width, no wrap */}
        <div className="flex items-center">
          <StatusPill status={launch.status} />
        </div>

        {/* Curve bar */}
        <div className="min-w-0">
          {launch.status === 'confirmed'
            ? <CurveBar pct={0} />
            : <span className="text-[12px]" style={{ color: 'var(--out-muted)' }}>—</span>}
        </div>

        {/* TX link */}
        <div className="text-right" onClick={e => e.stopPropagation()}>
          {txLink ? (
            <a href={txLink} target="_blank" rel="noreferrer"
              className="text-[12px] underline decoration-dotted underline-offset-4 hover:text-[var(--out-ink)]"
              style={{ color: 'var(--out-muted)' }}>TX ↗</a>
          ) : <span style={{ color: 'var(--out-muted)' }}>—</span>}
        </div>
      </div>
    </>
  );
}

function Dashboard({ walletAddress, onTradeClick }: { walletAddress?: string; onTradeClick?: (symbol: string, side: 'buy' | 'sell') => void }) {
  const { data: launches, isLoading: launchesLoading, refetch: refetchLaunches } = useListLaunches(
    { walletAddress: walletAddress ?? '' },
    { query: { enabled: !!walletAddress, refetchInterval: 30_000 } as any },
  );
  const { data: status } = useGetSystemStatus({ query: { refetchInterval: 30_000 } as any });
  const { data: summary } = useGetMarketSummary({ query: { refetchInterval: 60_000 } as any });
  const { data: ethBalance } = useBalance({
    address: walletAddress as `0x${string}` | undefined,
    chainId: 4663,
    query: { enabled: !!walletAddress, refetchInterval: 15_000 } as any,
  });

  const explorerUrl = status?.explorerUrl ?? 'https://robinhoodchain.blockscout.com';

  const confirmed = (launches ?? []).filter(l => l.status === 'confirmed');
  const pending   = (launches ?? []).filter(l => l.status === 'pending');
  const failed    = (launches ?? []).filter(l => l.status === 'failed');

  // ── AgentTaxV2 fee read (on-chain, per token) ─────────────────────────────
  // creatorFee(address) does NOT exist on the factory; fees tracked per tokenAddress.
  const confirmedWithTokens = confirmed.filter(
    l => l.tokenAddress && l.tokenAddress.startsWith('0x') && !l.tokenAddress.startsWith('0x000'),
  );
  const { data: taxAmountResults, refetch: refetchTaxAmounts } = useReadContracts({
    contracts: confirmedWithTokens.map(l => ({
      address: AGENT_TAX_V2_ADDRESS,
      abi: AGENT_TAX_V2_ABI,
      functionName: 'getTokenTaxAmounts' as const,
      args: [l.tokenAddress as `0x${string}`],
    })),
    query: {
      enabled: !!walletAddress && confirmedWithTokens.length > 0,
      refetchInterval: 30_000,
    } as any,
  });

  // ── $VIRTUAL price in USD (for USDG conversion) ────────────────────────────
  const { data: virtualPriceUSD, refetch: refetchVirtualPrice } = useQuery<number>({
    queryKey: ['virtual-price-dash'],
    queryFn: () =>
      fetch(apiUrl('/api/virtuals/virtual-price'))
        .then(r => r.json())
        .then((d: { usd: number }) => d.usd),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // ── Token market data (mcapInVirtual → derive token price in USD) ──────────
  // Standard Virtuals total supply = 1,000,000,000 tokens (1e9).
  // priceUSD per token = (mcapInVirtual / 1e9) * virtualPriceUSD
  const tokenMarketQueries = useQueries({
    queries: confirmedWithTokens.map(l => ({
      queryKey: ['vtoken-dash', l.tokenAddress],
      queryFn: () =>
        fetch(apiUrl(`/api/virtuals/token-by-address/${l.tokenAddress}`))
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),
      enabled: !!l.tokenAddress,
      staleTime: 60_000,
      refetchInterval: 60_000,
    })),
  });

  // ── Visibility-change refresh (user returns after claiming on Virtuals) ─────
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refetchTaxAmounts();
        refetchVirtualPrice();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetchTaxAmounts, refetchVirtualPrice]);

  // ── USDG fee computation ───────────────────────────────────────────────────
  // feeUSDG_i = (amountCollected_i / 1e18) × (mcapInVirtual_i / 1e9) × virtualPriceUSD
  const { feeBalanceDisplay, feeBalanceLoading } = (() => {
    if (!walletAddress) return { feeBalanceDisplay: '—', feeBalanceLoading: false };
    if (confirmedWithTokens.length === 0) return { feeBalanceDisplay: '0.00', feeBalanceLoading: false };
    if (!taxAmountResults || virtualPriceUSD === undefined)
      return { feeBalanceDisplay: '…', feeBalanceLoading: true };

    let totalUSDG = 0;
    let hasAnyData = false;
    for (let i = 0; i < confirmedWithTokens.length; i++) {
      const tax = taxAmountResults[i];
      if (tax?.status !== 'success' || !tax.result) continue;
      const [amountCollected] = tax.result as [bigint, bigint];
      const collected = parseFloat(formatUnits(amountCollected, 18));
      if (collected === 0) { hasAnyData = true; continue; }
      const tokenData = tokenMarketQueries[i]?.data as { mcapInVirtual?: number } | null;
      if (!tokenData?.mcapInVirtual) continue;
      // priceUSD per token = mcap_in_virtual / total_supply_in_virtual_units
      const priceUSD = (tokenData.mcapInVirtual / 1_000_000_000) * virtualPriceUSD;
      totalUSDG += collected * priceUSD;
      hasAnyData = true;
    }
    if (!hasAnyData) return { feeBalanceDisplay: '…', feeBalanceLoading: true };
    return { feeBalanceDisplay: totalUSDG.toFixed(2), feeBalanceLoading: false };
  })();

  return (
    <div className="flex flex-col gap-5 max-w-[1400px] mx-auto px-4 py-6">

      {/* ── NOT CONNECTED banner ── */}
      {!walletAddress && (
        <div className="border border-[var(--out-warn)] bg-[#0f0e06] p-4 font-mono text-[11px] flex items-center gap-3" style={{ color: 'var(--out-warn)' }}>
          <span className="text-lg">⚠</span>
          <div>
            <div className="font-bold uppercase tracking-widest">Wallet Not Connected</div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--out-muted)' }}>
              Connect your wallet via the top bar to view your launches, fees, and portfolio.
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          SHEET A — PORTFOLIO OVERVIEW
      ═══════════════════════════════════════ */}
      <Sheet dwgNo="OUT-DSH-01" figCaption="FIG. 03 — CREATOR PORTFOLIO">

        {/* Wallet header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5 pb-4 border-b border-[var(--out-grid-major)]">
          {/* Wallet identity */}
          <div className="font-mono">
            <div className="text-[12px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>CONNECTED WALLET</div>
            {walletAddress ? (
              <>
                <div className="text-[13px] font-bold" style={{ color: 'var(--out-ink)' }}>
                  {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}
                </div>
                <div className="text-[12px] mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--out-muted)' }}>
                  <StatusDot ok={status?.rpcHealthy ?? false} />
                  ROBINHOOD CHAIN · chainId {status?.chainId ?? 4663}
                </div>
              </>
            ) : (
              <div className="text-[12px]" style={{ color: 'var(--out-warn)' }}>NOT CONNECTED</div>
            )}
          </div>

          {/* ETH balance — top border on mobile, left border on sm+ */}
          {walletAddress && (
            <div className="font-mono pt-3 border-t sm:pt-0 sm:border-t-0 sm:border-l border-[var(--out-grid-major)] sm:pl-4 sm:ml-1">
              <div className="text-[12px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>ETH BALANCE</div>
              <div className="text-[13px] font-bold" style={{ color: 'var(--out-ink)' }}>
                {ethBalance ? `${parseFloat(ethBalance.formatted).toFixed(6)} ETH` : '—'}
              </div>
              <div className="text-[12px] mt-0.5" style={{ color: 'var(--out-muted)' }}>gas on Robinhood Chain</div>
            </div>
          )}

          {/* Action buttons — full width on mobile, auto right on sm+ */}
          <div className="sm:ml-auto flex flex-col sm:flex-row gap-2 pt-1 sm:pt-0">
            <button
              onClick={() => refetchLaunches()}
              className="font-mono text-[12px] border px-3 py-2 sm:py-1.5 uppercase tracking-widest transition-colors text-center"
              style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--out-ink)'; e.currentTarget.style.borderColor = 'var(--out-ink)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--out-muted)'; e.currentTarget.style.borderColor = 'var(--out-ink-dim)'; }}
            >↻ REFRESH</button>
            {walletAddress && (
              <a
                href={`${explorerUrl}/address/${walletAddress}`}
                target="_blank" rel="noreferrer"
                className="font-mono text-[12px] border px-3 py-2 sm:py-1.5 uppercase tracking-widest transition-colors text-center"
                style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--out-ink)'; e.currentTarget.style.borderColor = 'var(--out-ink)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--out-muted)'; e.currentTarget.style.borderColor = 'var(--out-ink-dim)'; }}
              >VIEW ON BLOCKSCOUT ↗</a>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="TOTAL LAUNCHES"   value={launchesLoading ? '—' : (launches?.length ?? 0)} sub="all time" />
          <StatCard label="LIVE ON CURVE"    value={launchesLoading ? '—' : confirmed.length}         sub="PROTOTYPE phase" />
          <StatCard label="PENDING"          value={launchesLoading ? '—' : pending.length}           sub="awaiting confirm" warn={pending.length > 0} />
          <StatCard label="FAILED"           value={launchesLoading ? '—' : failed.length}            sub="rejected / reverted" warn={failed.length > 0} />
        </div>

        {/* ── MY LAUNCHES TABLE ── */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[12px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>MY TOKEN LAUNCHES</div>
            <div className="text-[12px] font-mono" style={{ color: 'var(--out-muted)' }}>
              {confirmed.length > 0 ? `${confirmed.length} active` : ''}
            </div>
          </div>

          {/* Table header — desktop only, matches LaunchRow desktop grid */}
          {(launches?.length ?? 0) > 0 && (
            <div className="hidden sm:grid font-mono text-[11px] uppercase tracking-widest border-b border-[var(--out-ink-dim)] pb-1.5 mb-0.5 gap-3"
              style={{ gridTemplateColumns: '1fr 80px 1fr 52px', color: 'var(--out-muted)' }}>
              <span>NAME / TICKER</span>
              <span>STATUS</span>
              <span>CURVE</span>
              <span className="text-right">TX</span>
            </div>
          )}

          {/* Rows */}
          {launchesLoading ? (
            <div className="py-8 text-center font-mono text-[13px]" style={{ color: 'var(--out-muted)' }}>
              LOADING…
            </div>
          ) : !walletAddress ? (
            <div className="py-8 text-center font-mono text-[13px]" style={{ color: 'var(--out-muted)' }}>
              Connect wallet to see your launches.
            </div>
          ) : launches?.length === 0 ? (
            <div className="py-10 text-center font-mono border border-dashed border-[var(--out-grid-major)] flex flex-col items-center gap-3">
              <div className="text-[32px] opacity-20" style={{ color: 'var(--out-ink)' }}>▲</div>
              <div className="text-[13px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>No launches yet</div>
              <div className="text-[12px]" style={{ color: 'var(--out-muted)' }}>Use the AGENT tab to launch your first AI agent token.</div>
            </div>
          ) : (
            <div>
              {(launches ?? []).map(l => (
                <LaunchRow key={l.id} launch={l} explorerUrl={explorerUrl} />
              ))}
            </div>
          )}
        </div>
      </Sheet>

      {/* ═══════════════════════════════════════
          SHEET B — CREATOR FEES
      ═══════════════════════════════════════ */}
      <Sheet dwgNo="OUT-DSH-02" figCaption="FIG. 04 — CREATOR FEE REVENUE">
        <div className="mb-3">
          <div className="text-[12px] uppercase tracking-widest mb-4" style={{ color: 'var(--out-muted)' }}>CREATOR FEE EARNINGS</div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="border border-[var(--out-grid-major)] p-4 font-mono col-span-1 sm:col-span-2">
              <div className="text-[12px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-muted)' }}>FEES COLLECTED (PROTOCOL)</div>
              <div className="flex items-baseline gap-2">
                <div className="text-[28px] font-bold leading-none" style={{ color: (feeBalanceDisplay !== '—' && feeBalanceDisplay !== '…') ? 'var(--out-ink)' : 'var(--out-muted)' }}>
                  {feeBalanceDisplay}
                </div>
                {feeBalanceDisplay !== '—' && feeBalanceDisplay !== '…' && (
                  <div className="text-[14px] font-bold" style={{ color: 'var(--out-muted)' }}>USDG</div>
                )}
              </div>
              <div className="text-[12px] mt-1" style={{ color: 'var(--out-muted)' }}>
                {confirmedWithTokens.length > 0
                  ? `USD value of trading fees · AgentTaxV2 on-chain · ${confirmedWithTokens.length} token${confirmedWithTokens.length !== 1 ? 's' : ''} tracked · updates every 30s`
                  : 'connect wallet and launch a token to see fee data'}
              </div>
              <FeeInfoBadge walletAddress={walletAddress} />
            </div>

            <div className="border border-[var(--out-grid-major)] p-4 font-mono flex flex-col gap-3">
              <div>
                <div className="text-[12px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>FEE RATE</div>
                <div className="text-[14px] font-bold" style={{ color: 'var(--out-ink)' }}>1%</div>
                <div className="text-[12px]" style={{ color: 'var(--out-muted)' }}>of every trade on your tokens</div>
              </div>
            </div>
          </div>

          <div className="border border-[var(--out-grid-major)] p-3 font-mono text-[12px] leading-relaxed" style={{ color: 'var(--out-muted)', background: '#080d08' }}>
            <span style={{ color: 'var(--out-ink)' }}>HOW FEES WORK — </span>
            As creator of an agent token, you earn a 1% fee on every buy and sell trade routed through the Virtuals bonding curve.
            The Virtuals Protocol automatically distributes your share in{' '}
            <span style={{ color: 'var(--out-ink)' }}>USDG directly to your creator wallet</span>{' '}
            on every trade — no manual claim or action required on your part.
          </div>
        </div>
      </Sheet>

      {/* ═══════════════════════════════════════
          SHEET C — RWA PORTFOLIO & TRADE HISTORY
      ═══════════════════════════════════════ */}
      <RwaPortfolioSheet walletAddress={walletAddress} onTradeClick={onTradeClick} />

      {/* ═══════════════════════════════════════
          SHEET D — SYSTEM STATUS
      ═══════════════════════════════════════ */}
      <Sheet dwgNo="OUT-DSH-04" figCaption="FIG. 06 — PROTOCOL & SYSTEM STATUS">
        <div className="text-[12px] uppercase tracking-widest mb-4" style={{ color: 'var(--out-muted)' }}>SYSTEM STATUS</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Left — protocol fields */}
          <div className="border border-[var(--out-grid-major)] p-4 font-mono flex flex-col gap-3">
            {([
              { label: 'NETWORK',      val: (status?.network ?? '—').toUpperCase() },
              { label: 'CHAIN ID',     val: String(status?.chainId ?? '—') },
              { label: 'BLOCK',        val: status?.blockNumber ? `#${status.blockNumber.toLocaleString()}` : '—' },
              { label: 'RPC',          val: status?.rpcHealthy ? 'HEALTHY' : 'DEGRADED', ok: status?.rpcHealthy },
              { label: 'CALIBRATION', val: status?.calibrated ? 'CALIBRATED' : 'REQUIRED', ok: status?.calibrated },
              { label: 'PROTOCOL',     val: 'VIRTUALS INSTANT LAUNCH' },
              { label: 'GRADUATION',   val: 'AUTO (CURVE FILLS)' },
            ] as { label: string; val: string; ok?: boolean }[]).map(({ label, val, ok }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[12px] uppercase tracking-widest shrink-0 w-28" style={{ color: 'var(--out-muted)' }}>{label}</span>
                <span className="flex-1 border-b border-dotted border-[var(--out-grid-major)]" />
                <span className="text-[13px] font-bold text-right" style={{
                  color: ok === undefined
                    ? 'var(--out-text)'
                    : ok ? 'var(--out-ink)' : 'var(--out-warn)',
                }}>
                  {ok !== undefined && <StatusDot ok={ok} />}{val}
                </span>
              </div>
            ))}
          </div>

          {/* Right — market summary */}
          <div className="border border-[var(--out-grid-major)] p-4 font-mono flex flex-col gap-3">
            <div className="text-[12px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>PROTOCOL MARKET (GLOBAL)</div>
            {([
              { label: 'TOTAL TOKENS',     val: String(summary?.totalTokens ?? '—') },
              { label: 'ACTIVE / BONDING', val: String(summary?.activeTokens ?? '—') },
              { label: 'GRADUATED',        val: String(summary?.graduatedTokens ?? '—') },
              { label: '24H VOLUME',       val: summary?.totalVolume24h ?? '—' },
              { label: 'AI ENGINE',        val: 'OUTRIVE AI' },
              { label: 'TOOLS ACTIVE',     val: '7' },
              { label: 'CUSTODY MODEL',    val: 'NON-CUSTODIAL' },
            ] as { label: string; val: string }[]).map(({ label, val }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[12px] uppercase tracking-widest shrink-0 w-32" style={{ color: 'var(--out-muted)' }}>{label}</span>
                <span className="flex-1 border-b border-dotted border-[var(--out-grid-major)]" />
                <span className="text-[13px] font-bold text-right" style={{ color: 'var(--out-text)' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Explorer link */}
        <div className="mt-4 mb-6 flex flex-col gap-2 font-mono text-[12px]">
          <a href={explorerUrl} target="_blank" rel="noreferrer"
            className="underline decoration-dotted underline-offset-4 hover:text-[var(--out-ink)] transition-colors"
            style={{ color: 'var(--out-muted)' }}>
            BLOCKSCOUT EXPLORER ↗
          </a>
          <a href="https://app.virtuals.io" target="_blank" rel="noreferrer"
            className="underline decoration-dotted underline-offset-4 hover:text-[var(--out-ink)] transition-colors"
            style={{ color: 'var(--out-muted)' }}>
            VIRTUALS PROTOCOL ↗
          </a>
          {status?.virtualTokenAddress && (
            <a href={`${explorerUrl}/address/${status.virtualTokenAddress}`} target="_blank" rel="noreferrer"
              className="underline decoration-dotted underline-offset-4 hover:text-[var(--out-ink)] transition-colors"
              style={{ color: 'var(--out-muted)' }}>
              $VIRTUAL CONTRACT ↗
            </a>
          )}
        </div>
      </Sheet>

    </div>
  );
}

/* ─── Price Sparkline ───────────────────────────────────────────────────── */
function PriceSparkline({ symbol }: { symbol: string }) {
  const { data } = useQuery<{ snapshots: Array<{ price: number; ts: number }> }>({
    queryKey: ['rwa-price-history', symbol],
    queryFn:  () => fetch(apiUrl(`/api/rwa/price-history/${symbol}`)).then(r => r.json()),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  const snaps = data?.snapshots ?? [];
  if (snaps.length < 4) return <div style={{ width: 80, height: 24 }} />;
  const prices = snaps.map(s => s.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = max - min || 1;
  const W = 80, H = 24;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W;
    const y = H - ((p - min) / range) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const isUp = prices[prices.length - 1] >= prices[0];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
      <polyline points={pts} fill="none"
        stroke={isUp ? '#7ecb3b' : '#e05050'}
        strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ─── RWA Portfolio Sheet ────────────────────────────────────────────────── */
type RwaTrade = {
  id: number; symbol: string; name: string; tokenAddress: string;
  side: string; shares: string; priceUsd: string; ethAmount: string;
  totalUsd: string; status: string; source: string; createdAt: string;
  txHash?: string | null;
};

const RWA_LOGOS: Record<string, string> = {
  AAPL:  'https://cdn.robinhood.com/ncw_assets/logos/0xaf3d76f1834a1d425780943c99ea8a608f8a93f9.png',
  NVDA:  'https://cdn.robinhood.com/ncw_assets/logos/0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec.png',
  AMZN:  'https://cdn.robinhood.com/ncw_assets/logos/0x12f190a9f9d7d37a250758b26824b97ce941bf54.png',
  GOOGL: 'https://cdn.robinhood.com/ncw_assets/logos/0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3.png',
  META:  'https://cdn.robinhood.com/ncw_assets/logos/0xc0d6457c16cc70d6790dd43521c899c87ce02f35.png',
  MSFT:  'https://cdn.robinhood.com/ncw_assets/logos/0xe93237c50d904957cf27e7b1133b510c669c2e74.png',
  TSLA:  'https://cdn.robinhood.com/ncw_assets/logos/0x322f0929c4625ed5bad873c95208d54e1c003b2d.png',
  AMD:   'https://cdn.robinhood.com/ncw_assets/logos/0x86923f96303d656e4aa86d9d42d1e57ad2023fdc.png',
  COIN:  'https://cdn.robinhood.com/ncw_assets/logos/0x6330d8c3178a418788df01a47479c0ce7ccf450b.png',
  NFLX:  'https://financialmodelingprep.com/image-stock/NFLX.png',
  SPY:   'https://cdn.robinhood.com/ncw_assets/logos/0x117cc2133c37b721f49de2a7a74833232b3b4c0c.png',
  QQQ:   'https://cdn.robinhood.com/ncw_assets/logos/0xd5f3879160bc7c32ebb4dc785f8a4f505888de68.png',
};

function RwaTokenLogo({ symbol }: { symbol: string }) {
  const [err, setErr] = React.useState(false);
  const src = RWA_LOGOS[symbol];
  if (err || !src) {
    return (
      <div className="rounded-full flex items-center justify-center font-mono font-bold text-[9px]"
        style={{ width: 22, height: 22, minWidth: 22, background: '#1a2a0a', color: 'var(--out-ink)' }}>
        {symbol.slice(0, 2)}
      </div>
    );
  }
  return <img src={src} alt={symbol} onError={() => setErr(true)}
    style={{ width: 22, height: 22, minWidth: 22, borderRadius: '50%', objectFit: 'cover', background: '#111' }} />;
}

function RwaPortfolioSheet({ walletAddress, onTradeClick }: { walletAddress?: string; onTradeClick?: (symbol: string, side: 'buy' | 'sell') => void }) {
  const { data, isLoading, refetch } = useQuery<{ trades: RwaTrade[] }>({
    queryKey: ['rwa-trades', walletAddress],
    queryFn: () => fetch(apiUrl(`/api/rwa/trades?wallet=${walletAddress}`)).then(r => r.json()),
    enabled: !!walletAddress,
    refetchInterval: 15_000,
    staleTime: 8_000,
  });

  // Live on-chain prices for P&L
  const { data: flapPrices } = useQuery<{ prices: Array<{ symbol: string; priceUsd: number }> }>({
    queryKey: ['flap-prices-dashboard'],
    queryFn: () => fetch(apiUrl('/api/rwa/flap-prices')).then(r => r.json()),
    refetchInterval: 10_000,
    staleTime: 6_000,
  });
  const flapMap = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of flapPrices?.prices ?? []) if (p.priceUsd > 0) m[p.symbol] = p.priceUsd;
    return m;
  }, [flapPrices]);

  const trades = data?.trades ?? [];

  // Compute portfolio summary with realized P&L (average cost method, oldest-first)
  const { realizedPnl, positions } = React.useMemo(() => {
    let realizedPnl = 0;
    const sorted = [...trades].reverse(); // oldest-first for correct avg-cost tracking
    const pos: Record<string, { shares: number; buyShares: number; buyUsd: number; name: string }> = {};
    for (const t of sorted) {
      const shares = parseFloat(t.shares) || 0;
      const usd    = parseFloat(t.totalUsd) || 0;
      if (t.side === 'buy') {
        pos[t.symbol] = pos[t.symbol] ?? { shares: 0, buyShares: 0, buyUsd: 0, name: t.name };
        pos[t.symbol].shares    += shares;
        pos[t.symbol].buyShares += shares;
        pos[t.symbol].buyUsd   += usd;
      } else if (t.side === 'sell') {
        if (pos[t.symbol] && pos[t.symbol].buyShares > 0) {
          const avgCost      = pos[t.symbol].buyUsd / pos[t.symbol].buyShares;
          const actualShares = Math.min(shares, pos[t.symbol].buyShares);
          realizedPnl       += usd - avgCost * actualShares;
          pos[t.symbol].buyUsd    -= avgCost * actualShares;
          pos[t.symbol].buyShares -= actualShares;
        }
        if (pos[t.symbol]) pos[t.symbol].shares -= shares;
      }
    }
    return { realizedPnl, positions: Object.entries(pos).filter(([, v]) => v.shares > 0.0001) };
  }, [trades]);

  const agentTrades  = trades.filter(t => t.source === 'agent');
  const manualTrades = trades.filter(t => t.source === 'manual');

  const statusIcon = (s: string) => {
    if (s === 'confirmed') return <span style={{ color: 'var(--out-ink)' }}>✓</span>;
    if (s === 'failed')    return <span style={{ color: 'var(--out-danger)' }}>✗</span>;
    return <span style={{ color: 'var(--out-warn)' }}>○</span>;
  };

  return (
    <Sheet dwgNo="OUT-DSH-03" figCaption="FIG. 05 — RWA PORTFOLIO & TRADE HISTORY">
      <div className="text-[11px] uppercase tracking-widest mb-4" style={{ color: 'var(--out-muted)' }}>
        RWA PORTFOLIO OVERVIEW
      </div>

      {/* ── Stats bar — portfolio value + P&L ── */}
      {(() => {
        const totalPortfolioValue = positions.reduce((sum, [sym, pos]) => {
          const px = flapMap[sym] || 0;
          return sum + (px > 0 ? px * pos.shares : 0);
        }, 0);
        const totalCostBasis = positions.reduce((sum, [, pos]) => {
          const avg = pos.buyShares > 0 ? pos.buyUsd / pos.buyShares : 0;
          return sum + avg * pos.shares;
        }, 0);
        const unrealizedPnl = totalPortfolioValue > 0 ? totalPortfolioValue - totalCostBasis : 0;
        const totalReturn   = realizedPnl + unrealizedPnl;
        const fmt = (n: number) => n >= 0 ? `+${n.toFixed(2)}` : `-${Math.abs(n).toFixed(2)}`;
        type StatRow = { label: string; value: string; sub: string; pnl: number | null };
        const stats: StatRow[] = [
          { label: 'PORTFOLIO VALUE', value: isLoading ? '—' : totalPortfolioValue > 0 ? `${totalPortfolioValue.toFixed(2)}` : '—', sub: `${positions.length} position${positions.length !== 1 ? 's' : ''}`, pnl: null },
          { label: 'UNREALIZED P&L',  value: isLoading ? '—' : unrealizedPnl !== 0 ? fmt(unrealizedPnl) : '—', sub: 'open holdings',         pnl: unrealizedPnl },
          { label: 'REALIZED P&L',    value: isLoading ? '—' : realizedPnl   !== 0 ? fmt(realizedPnl)   : '—', sub: 'closed trades',          pnl: realizedPnl   },
          { label: 'TOTAL RETURN',    value: isLoading ? '—' : totalReturn    !== 0 ? fmt(totalReturn)   : '—', sub: 'unrealized + realized',   pnl: totalReturn   },
        ];
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {stats.map(s => (
              <div key={s.label} className="border border-[var(--out-grid-major)] p-4 font-mono flex flex-col gap-1">
                <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>{s.label}</div>
                <div className="text-[20px] font-bold leading-none mt-1" style={{
                  color: s.pnl === null ? 'var(--out-ink)' : s.pnl >= 0 ? '#7ecb3b' : '#e05050',
                }}>{s.value}</div>
                <div className="text-[9px] mt-1" style={{ color: 'var(--out-ink-dim)' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Open positions ── */}
      {positions.length > 0 && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--out-muted)' }}>
            OPEN POSITIONS · {positions.length}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {positions.map(([sym, pos]) => {
              const avgCost   = pos.buyShares > 0 ? pos.buyUsd / pos.buyShares : 0;
              const currentPx = flapMap[sym] || 0;
              const costBasis = avgCost * pos.shares;
              const curValue  = currentPx * pos.shares;
              const pnl       = currentPx > 0 ? curValue - costBasis : 0;
              const pnlPct    = costBasis > 0 && currentPx > 0 ? (pnl / costBasis) * 100 : 0;
              const hasPnl    = currentPx > 0;
              const pnlUp     = pnl >= 0;
              return (
                <div key={sym} className="border border-[var(--out-grid-major)] p-4 font-mono flex flex-col gap-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <RwaTokenLogo symbol={sym} />
                      <div>
                        <div className="text-[14px] font-bold leading-none" style={{ color: 'var(--out-ink)' }}>{sym}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--out-muted)' }}>{pos.name}</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-[13px] font-bold" style={{ color: 'var(--out-ink)' }}>
                        {pos.shares.toFixed(4)}
                      </div>
                      <div className="text-[9px]" style={{ color: 'var(--out-muted)' }}>shares</div>
                      {/* Sparkline */}
                      <PriceSparkline symbol={sym} />
                    </div>
                  </div>
                  {/* Metrics grid */}
                  <div className="border-t pt-3 grid grid-cols-3 gap-x-4 gap-y-2" style={{ borderColor: 'var(--out-ink-dim)' }}>
                    <div>
                      <div className="text-[9px] uppercase" style={{ color: 'var(--out-muted)' }}>AVG COST</div>
                      <div className="text-[11px] font-bold mt-0.5" style={{ color: 'var(--out-text)' }}>${avgCost.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase" style={{ color: 'var(--out-muted)' }}>LIVE PX</div>
                      <div className="text-[11px] font-bold mt-0.5" style={{ color: hasPnl ? 'var(--out-text)' : 'var(--out-muted)' }}>
                        {hasPnl ? `${currentPx.toFixed(2)}` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase" style={{ color: 'var(--out-muted)' }}>VALUE</div>
                      <div className="text-[11px] font-bold mt-0.5" style={{ color: 'var(--out-ink)' }}>
                        {hasPnl ? `${curValue.toFixed(2)}` : '—'}
                      </div>
                    </div>
                    {hasPnl && (
                      <div className="col-span-3 border-t pt-2" style={{ borderColor: 'var(--out-ink-dim)' }}>
                        <div className="text-[9px] uppercase mb-0.5" style={{ color: 'var(--out-muted)' }}>UNREALIZED P&amp;L</div>
                        <div className="text-[13px] font-bold" style={{ color: pnlUp ? '#7ecb3b' : '#e05050' }}>
                          {pnlUp ? '+' : ''}${pnl.toFixed(2)}
                          <span className="text-[10px] ml-2 font-normal">
                            ({pnlUp ? '+' : ''}{pnlPct.toFixed(2)}%)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Quick trade buttons */}
                  {onTradeClick && (
                    <div className="flex gap-2 border-t pt-3" style={{ borderColor: 'var(--out-ink-dim)' }}>
                      <button
                        onClick={() => onTradeClick(sym, 'buy')}
                        className="flex-1 py-1.5 text-[9px] font-bold uppercase tracking-widest border transition-all hover:opacity-80 active:scale-95"
                        style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>
                        ▲ BUY
                      </button>
                      <button
                        onClick={() => onTradeClick(sym, 'sell')}
                        className="flex-1 py-1.5 text-[9px] font-bold uppercase tracking-widest border transition-all hover:opacity-80 active:scale-95"
                        style={{ borderColor: '#e05050', color: '#e05050' }}>
                        ▼ SELL
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Trade history ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
            TRADE HISTORY
            {agentTrades.length > 0 && <span className="ml-2 px-1.5 py-0.5 border text-[9px]" style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-ink)' }}>{agentTrades.length} AGENT</span>}
            {manualTrades.length > 0 && <span className="ml-1.5 px-1.5 py-0.5 border text-[9px]" style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>{manualTrades.length} MANUAL</span>}
          </div>
          <button onClick={() => refetch()}
            className="text-[10px] font-mono border px-2 py-1 transition-opacity hover:opacity-70 flex items-center gap-1"
            style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
            ↻ REFRESH
          </button>
        </div>

        {!walletAddress ? (
          <div className="py-10 text-center font-mono text-[12px] border border-dashed border-[var(--out-grid-major)]" style={{ color: 'var(--out-muted)' }}>
            Connect wallet to view trade history.
          </div>
        ) : isLoading ? (
          <div className="py-10 text-center font-mono text-[12px]" style={{ color: 'var(--out-muted)' }}>LOADING…</div>
        ) : trades.length === 0 ? (
          <div className="py-12 text-center font-mono border border-dashed border-[var(--out-grid-major)] flex flex-col items-center gap-3">
            <div className="text-[32px] opacity-20" style={{ color: 'var(--out-ink)' }}>◈</div>
            <div className="text-[12px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>No RWA trades yet</div>
            <div className="text-[11px]" style={{ color: 'var(--out-muted)' }}>Use RWA TRADE to place your first order.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: '680px' }}>
              {/* Header */}
              <div className="font-mono text-[9px] uppercase tracking-widest border-b pb-2 mb-1 grid items-center"
                style={{ gridTemplateColumns: '28px 72px minmax(120px,1fr) 64px 88px 88px 72px 48px 36px', gap: '12px', borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
                <span />
                <span>ASSET</span>
                <span>NAME</span>
                <span>SIDE</span>
                <span className="text-right">SHARES</span>
                <span className="text-right">PRICE</span>
                <span className="text-right">TOTAL</span>
                <span className="text-center">SRC</span>
                <span className="text-center">ST</span>
              </div>

              {trades.map(t => {
                const isBuy = t.side === 'buy';
                return (
                  <div key={t.id}
                    className="grid font-mono py-2.5 border-b items-center"
                    style={{ gridTemplateColumns: '28px 72px minmax(120px,1fr) 64px 88px 88px 72px 48px 36px', gap: '12px', borderColor: 'var(--out-ink-dim)' }}>
                    <RwaTokenLogo symbol={t.symbol} />
                    <span className="text-[12px] font-bold" style={{ color: 'var(--out-ink)' }}>{t.symbol}</span>
                    <span className="truncate text-[10px]" style={{ color: 'var(--out-muted)' }}>{t.name}</span>
                    <span className="text-[11px] font-bold" style={{ color: isBuy ? 'var(--out-ink)' : '#e05050' }}>
                      {isBuy ? '▲ BUY' : '▼ SELL'}
                    </span>
                    <span className="text-right text-[11px]" style={{ color: 'var(--out-text)' }}>
                      {parseFloat(t.shares).toFixed(4)}
                    </span>
                    <span className="text-right text-[11px]" style={{ color: 'var(--out-text)' }}>
                      ${parseFloat(t.priceUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-right text-[12px] font-bold" style={{ color: 'var(--out-ink)' }}>
                      ${parseFloat(t.totalUsd).toFixed(2)}
                    </span>
                    <span className="text-center text-[9px] uppercase tracking-wide border px-1 py-0.5"
                      style={{ borderColor: t.source === 'agent' ? 'var(--out-ink-dim)' : 'transparent', color: t.source === 'agent' ? 'var(--out-ink)' : 'var(--out-muted)' }}>
                      {t.source === 'agent' ? 'AGT' : 'MAN'}
                    </span>
                    <span className="text-center text-[12px]">{statusIcon(t.status)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ─── RWA Portfolio Mini Widget ─────────────────────────────────────────── */
function RwaPortfolioMini({ walletAddress, onNavigate }: { walletAddress?: string; onNavigate?: () => void }) {
  const { data } = useQuery<{ trades: RwaTrade[] }>({
    queryKey: ['rwa-trades', walletAddress],
    queryFn:  () => fetch(apiUrl(`/api/rwa/trades?wallet=${walletAddress}`)).then(r => r.json()),
    enabled:  !!walletAddress,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
  const { data: flapPrices } = useQuery<{ prices: Array<{ symbol: string; priceUsd: number }> }>({
    queryKey: ['flap-prices-mini'],
    queryFn:  () => fetch(apiUrl('/api/rwa/flap-prices')).then(r => r.json()),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const flapMap = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of flapPrices?.prices ?? []) if (p.priceUsd > 0) m[p.symbol] = p.priceUsd;
    return m;
  }, [flapPrices]);
  const trades = data?.trades ?? [];

  const { totalPortfolioValue, unrealizedPnl, posCount } = React.useMemo(() => {
    const sorted = [...trades].reverse();
    const pos: Record<string, { shares: number; buyShares: number; buyUsd: number }> = {};
    for (const t of sorted) {
      const shares = parseFloat(t.shares) || 0;
      const usd    = parseFloat(t.totalUsd) || 0;
      if (t.side === 'buy') {
        pos[t.symbol] = pos[t.symbol] ?? { shares: 0, buyShares: 0, buyUsd: 0 };
        pos[t.symbol].shares += shares; pos[t.symbol].buyShares += shares; pos[t.symbol].buyUsd += usd;
      } else if (t.side === 'sell' && pos[t.symbol]) {
        const avg    = pos[t.symbol].buyShares > 0 ? pos[t.symbol].buyUsd / pos[t.symbol].buyShares : 0;
        const actual = Math.min(shares, pos[t.symbol].buyShares);
        pos[t.symbol].buyUsd -= avg * actual; pos[t.symbol].buyShares -= actual; pos[t.symbol].shares -= shares;
      }
    }
    const open = Object.entries(pos).filter(([, v]) => v.shares > 0.0001);
    const totalPortfolioValue = open.reduce((s, [sym, p]) => s + (flapMap[sym] || 0) * p.shares, 0);
    const totalCost = open.reduce((s, [, p]) => {
      const avg = p.buyShares > 0 ? p.buyUsd / p.buyShares : 0;
      return s + avg * p.shares;
    }, 0);
    return { totalPortfolioValue, unrealizedPnl: totalPortfolioValue > 0 ? totalPortfolioValue - totalCost : 0, posCount: open.length };
  }, [trades, flapMap]);

  if (!walletAddress || trades.length === 0) return null;
  const up = unrealizedPnl >= 0;
  return (
    <button onClick={onNavigate}
      className="w-full border border-[var(--out-grid-major)] p-4 font-mono flex items-center justify-between gap-4 transition-colors hover:border-[var(--out-ink-dim)]"
      style={{ background: '#060b0640', textAlign: 'left', cursor: onNavigate ? 'pointer' : 'default' }}>
      <div className="flex flex-col gap-0.5">
        <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
          RWA PORTFOLIO · {posCount} POSITION{posCount !== 1 ? 'S' : ''}
        </div>
        <div className="text-[22px] font-bold leading-tight" style={{ color: totalPortfolioValue > 0 ? 'var(--out-ink)' : 'var(--out-muted)' }}>
          {totalPortfolioValue > 0 ? `${totalPortfolioValue.toFixed(2)}` : '—'}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {unrealizedPnl !== 0 && (
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--out-muted)' }}>UNREALIZED</div>
            <div className="text-[14px] font-bold" style={{ color: up ? '#7ecb3b' : '#e05050' }}>
              {up ? '+' : ''}${unrealizedPnl.toFixed(2)}
            </div>
          </div>
        )}
        <div className="text-[10px] shrink-0" style={{ color: 'var(--out-muted)' }}>→ DASHBOARD</div>
      </div>
    </button>
  );
}

/* ─── DOCS ───────────────────────────────────────────────────────────────── */
function Docs() {
  const Row = ({ r }: { r: { method: string; path: string; desc: string } }) => (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3 py-2 sm:py-1.5 border-b" style={{ borderColor: 'var(--out-grid-major)' }}>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[12px] border px-1.5 py-0.5 shrink-0 w-10 text-center font-mono"
          style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-ink)' }}>{r.method}</span>
        <span className="font-mono text-[13px] sm:text-[13px] sm:w-64" style={{ color: 'var(--out-ink)' }}>{r.path}</span>
      </div>
      <span className="font-mono text-[13px] sm:text-[13px] pl-12 sm:pl-0" style={{ color: 'var(--out-muted)' }}>{r.desc}</span>
    </div>
  );
  const SectionHead = ({ n, t }: { n: string; t: string }) => (
    <div className="text-[12px] uppercase tracking-widest mb-3 border-b pb-1" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>
      {n} · {t}
    </div>
  );

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col gap-6">
      <Sheet dwgNo="OUT-DOC-01" figCaption="FIG. 04 — DEVELOPER DOCUMENTATION & API REFERENCE">
        <div className="py-4 flex flex-col gap-8 font-mono">

          {/* 01 Overview */}
          <div>
            <SectionHead n="01" t="OVERVIEW" />
            <p className="text-[11px] leading-relaxed max-w-3xl mb-4" style={{ color: 'var(--out-text)' }}>
              OUTRIVE is a non-custodial, chat-first AI agent launchpad built on{' '}
              <span style={{ color: 'var(--out-ink)' }}>Virtuals Protocol Instant Launch</span> on{' '}
              <span style={{ color: 'var(--out-ink)' }}>Robinhood Chain (chainId 4663)</span>.
              Natural-language interface → unsigned transaction → user signs → user is creator of record on-chain.
              Design doctrine: <em style={{ color: 'var(--out-ink)' }}>the LLM decides what; deterministic code decides how; the user's wallet decides whether.</em>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
              {[
                { k: 'CHAIN',    v: 'Robinhood Chain · chainId 4663 (mainnet) / 46630 (testnet)' },
                { k: 'PROTOCOL', v: 'Virtuals Protocol · Instant Launch · Bonding curve → Uniswap LP' },
                { k: 'AI ENGINE', v: 'OUTRIVE AI · 7 tools · SSE streaming' },
              ].map(r => (
                <div key={r.k} className="border p-3" style={{ borderColor: 'var(--out-grid-major)' }}>
                  <div className="text-[12px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>{r.k}</div>
                  <div style={{ color: 'var(--out-text)' }}>{r.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 02 Network specs */}
          <div>
            <SectionHead n="02" t="NETWORK SPECIFICATIONS (VERIFIED — V1–V4)" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0 text-[13px]">
              {[
                { k: 'MAINNET chainId',  v: '4663' },
                { k: 'MAINNET RPC',      v: 'https://rpc.mainnet.chain.robinhood.com' },
                { k: 'MAINNET EXPLORER', v: 'https://robinhoodchain.blockscout.com' },
                { k: 'MAINNET API',      v: 'https://robinhoodchain.blockscout.com/api/v2' },
                { k: 'TESTNET chainId',  v: '46630' },
                { k: 'TESTNET RPC',      v: 'https://rpc.testnet.chain.robinhood.com' },
                { k: 'TESTNET EXPLORER', v: 'https://explorer.testnet.chain.robinhood.com' },
                { k: 'TESTNET FAUCET',   v: 'https://faucet.testnet.chain.robinhood.com' },
              ].map(r => (
                <div key={r.k} className="flex gap-2 items-baseline py-1 border-b" style={{ borderColor: 'var(--out-grid-major)' }}>
                  <span className="shrink-0 text-[12px] uppercase tracking-widest w-24 sm:w-36" style={{ color: 'var(--out-muted)' }}>{r.k}</span>
                  <span className="break-all min-w-0" style={{ color: 'var(--out-ink)' }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 03 OUTRIVE API */}
          <div>
            <SectionHead n="03" t="OUTRIVE API ENDPOINTS" />
            {[
              { method: 'POST', path: '/api/chat',               desc: 'SSE stream — AI agent session with tool-use loop' },
              { method: 'GET',  path: '/api/launches',           desc: 'List all OUTRIVE-deployed tokens (DB-backed)' },
              { method: 'GET',  path: '/api/virtuals/tokens',    desc: 'Live Virtuals Protocol market — chain/sort/status/search/page filters' },
              { method: 'GET',  path: '/api/virtuals/summary',   desc: 'Aggregate stats: total / bonding / graduated counts' },
              { method: 'GET',  path: '/api/market/tokens',      desc: 'OUTRIVE-indexed token feed with price data' },
              { method: 'GET',  path: '/api/market/token/:addr', desc: 'Single token detail + trade log' },
              { method: 'GET',  path: '/api/system/status',      desc: 'RPC health + system status + version' },
              { method: 'GET',  path: '/api/conversations',      desc: 'Conversation history for current session' },
            ].map((r, i) => <Row key={i} r={r} />)}
          </div>

          {/* 04 Blockscout */}
          <div>
            <SectionHead n="04" t="BLOCKSCOUT API v2 ENDPOINTS USED (V4)" />
            {[
              { method: 'GET', path: '/api/v2/tokens/{address}',           desc: 'Token metadata + holder count' },
              { method: 'GET', path: '/api/v2/tokens/{address}/transfers', desc: 'Transfer history / trade log' },
              { method: 'GET', path: '/api/v2/tokens/{address}/holders',   desc: 'Holder list + concentrations' },
              { method: 'GET', path: '/api/v2/addresses/{factory}/logs',   desc: 'Factory event backfill (indexer)' },
              { method: 'GET', path: '/api/v2/transactions/{hash}',        desc: 'Tx receipt + status' },
            ].map((r, i) => <Row key={i} r={r} />)}
          </div>

          {/* 05 Protocol facts */}
          <div>
            <SectionHead n="05" t="VIRTUALS PROTOCOL FACTS (VERIFIED — V5–V12)" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0 text-[13px]">
              {[
                { k: 'INSTANT LAUNCH FEE',    v: 'No base fee — gas only (ETH). Token tradable immediately.' },
                { k: 'TRADING FEE',           v: '1% on all buys and sells from day one.' },
                { k: 'CREATOR FEE SHARE',     v: 'Creator share of prototype-stage trading fees, tracked by the Virtuals Protocol.' },
                { k: 'ANTI-SNIPER TAX',       v: 'Optional. Buy tax 99%→1% over 0s–98min window; sell tax fixed 1%.' },
                { k: 'GRADUATION THRESHOLD',  v: '42,000 $VIRTUAL raised → Uniswap pool created, LP locked 10 years.' },
                { k: 'TOKEN NAME',            v: 'Max 32 characters · immutable after launch.' },
                { k: 'TOKEN TICKER',          v: 'Max 6 chars · alphanumeric [A-Z0-9] · immutable after launch.' },
                { k: 'LAUNCH MODES',          v: 'Instant Launch / Fund Raise / 60 Days Experiment.' },
                { k: 'PAID MODULES',          v: 'Launch Radar 100 $VIRTUAL · Capital Formation 10 $VIRTUAL · others free.' },
              ].map(r => (
                <div key={r.k} className="flex gap-2 items-baseline py-1.5 border-b" style={{ borderColor: 'var(--out-grid-major)' }}>
                  <span className="shrink-0 text-[12px] uppercase tracking-widest w-44" style={{ color: 'var(--out-muted)' }}>{r.k}</span>
                  <span style={{ color: 'var(--out-text)' }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 06 Env vars */}
          <div>
            <SectionHead n="06" t="ENVIRONMENT VARIABLES" />
            {[
              { method: 'REQ', path: 'ANTHROPIC_API_KEY',             desc: 'Claude Sonnet 4 LLM access' },
              { method: 'REQ', path: 'DATABASE_URL',                  desc: 'PostgreSQL connection string' },
              { method: 'OPT', path: 'NETWORK',                       desc: 'mainnet (default) | testnet' },
              { method: 'OPT', path: 'RPC_URL_OVERRIDE',              desc: 'Production RPC (Alchemy, QuickNode, dRPC)' },
              { method: 'OPT', path: 'GRADUATION_THRESHOLD',          desc: '42000000000000000000000 — 42,000e18 (V10)' },
              { method: 'OPT', path: 'VITE_WALLETCONNECT_PROJECT_ID', desc: 'WalletConnect v2 modal (cloud.walletconnect.com)' },
              { method: 'OPT', path: 'SESSION_SECRET',                desc: 'Session signing secret' },
            ].map((r, i) => <Row key={i} r={r} />)}
          </div>

          {/* 07 Autonomous Vault API */}
          <div>
            <SectionHead n="07" t="AUTONOMOUS VAULT API — OTR KEY AUTH" />
            <p className="text-[11px] leading-relaxed max-w-3xl mb-4" style={{ color: 'var(--out-text)' }}>
              The Autonomous Vault API is protected by{' '}
              <span style={{ color: 'var(--out-ink)' }}>signed-nonce session tokens</span>.
              Clients authenticate once via EIP-191 wallet signature (valid 1 hour), then include a Bearer token on every request.
              External agents running on a VPS use{' '}
              <span style={{ color: 'var(--out-ink)' }}>OTR API keys</span>{' '}
              (format: <code style={{ color: 'var(--out-ink)' }}>OTR-&#123;32 hex chars&#125;</code>) to read vault config and report execution results.
            </p>
            {[
              { method: 'POST', path: '/api/autonomous/auth/nonce',   desc: 'Step 1 — send walletAddress → receive one-time nonce (5 min TTL)' },
              { method: 'POST', path: '/api/autonomous/auth/verify',  desc: 'Step 2 — send walletAddress + nonce + EIP-191 signature → receive session token (1 h)' },
              { method: 'GET',  path: '/api/autonomous/vault',        desc: 'Read vault config + stats for the authenticated wallet (Bearer required)' },
              { method: 'POST', path: '/api/autonomous/vault',        desc: 'Create or update vault: strategyConfig (token/TP/SL/budget), status (idle|running|paused)' },
              { method: 'GET',  path: '/api/autonomous/api-keys',     desc: 'List active OTR API keys for the authenticated wallet (Bearer required)' },
              { method: 'POST', path: '/api/autonomous/api-keys',     desc: 'Generate a new OTR key — returns full key once, stores SHA-256 hash only' },
              { method: 'DELETE', path: '/api/autonomous/api-keys/:id', desc: 'Revoke an OTR key by id — must be owned by the authenticated wallet' },
              { method: 'GET',  path: '/api/autonomous/market-intel',  desc: 'Hermes AI — vault state + live RWA prices in one call (OTR key auth); used by Hermes strategy orchestrator' },
            ].map((r, i) => <Row key={i} r={r} />)}
          </div>

          {/* 08 Auth + rate limit */}
          <div>
            <SectionHead n="08" t="AUTHENTICATION & RATE LIMITS" />
            <p className="text-[11px] leading-relaxed max-w-3xl" style={{ color: 'var(--out-text)' }}>
              No account or login required. Your{' '}
              <span style={{ color: 'var(--out-ink)' }}>wallet address is the only identity</span>.
              Every transaction is built unsigned and delivered to your browser — the server never holds private keys.
              Launch rate limit:{' '}
              <span style={{ color: 'var(--out-ink)' }}>5 launches per wallet per hour</span>,
              enforced server-side. Chat requests are unlimited.
            </p>
          </div>

          {/* 09 RWA contract addresses */}
          <div>
            <SectionHead n="09" t="RWA TOKEN CONTRACTS — ROBINHOOD CHAIN (chainId 4663)" />
            <p className="text-[11px] leading-relaxed max-w-3xl mb-4" style={{ color: 'var(--out-text)' }}>
              All RWA tokens below are ERC-20 contracts on Robinhood Chain. Trading routes through{' '}
              <span style={{ color: 'var(--out-ink)' }}>FlapPortal</span> — a native mint/redeem gateway
              that prices assets at the on-chain oracle rate. Every address is verifiable on{' '}
              <a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noreferrer"
                className="underline" style={{ color: 'var(--out-ink)' }}>robinhoodchain.blockscout.com</a>.
            </p>

            {/* Infrastructure */}
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-muted)' }}>INFRASTRUCTURE</div>
              {[
                { k: 'FLAPPORTAL',  v: '0xC94135b63772b91D79d0A2DaAb2a8801f32359bD', desc: 'RWA swap router — buy & sell entry point' },
                { k: 'WETH',        v: '0x0bd7d308f8e1639fab988df18a8011f41eacad73', desc: 'Wrapped ETH on Robinhood Chain' },
                { k: 'USDG',        v: '0x5fc5360d0400a0fd4f2af552add042d716f1d168', desc: 'Robinhood stablecoin (intermediate)' },
              ].map(r => (
                <div key={r.k} className="grid py-1.5 border-b items-baseline gap-2" style={{ borderColor: 'var(--out-grid-major)', gridTemplateColumns: '72px 1fr auto' }}>
                  <span className="text-[11px] font-bold uppercase" style={{ color: 'var(--out-ink)' }}>{r.k}</span>
                  <span className="font-mono text-[10px] break-all" style={{ color: 'var(--out-text)' }}>{r.v}</span>
                  <span className="text-[10px] hidden sm:block" style={{ color: 'var(--out-muted)' }}>{r.desc}</span>
                </div>
              ))}
            </div>

            {/* Stock tokens */}
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-muted)' }}>STOCK & ETF TOKENS (20)</div>
              <div className="grid gap-0" style={{ gridTemplateColumns: '1fr' }}>
                {[
                  { k: 'NVDA',  name: 'NVIDIA Corp.',           v: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC' },
                  { k: 'AAPL',  name: 'Apple Inc.',             v: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9' },
                  { k: 'TSLA',  name: 'Tesla Inc.',             v: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d' },
                  { k: 'META',  name: 'Meta Platforms Inc.',    v: '0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35' },
                  { k: 'GOOGL', name: 'Alphabet Inc.',          v: '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3' },
                  { k: 'MSFT',  name: 'Microsoft Corp.',        v: '0xe93237C50D904957Cf27E7B1133b510C669c2e74' },
                  { k: 'AMZN',  name: 'Amazon.com Inc.',        v: '0x12f190a9F9d7D37a250758b26824B97CE941bF54' },
                  { k: 'AMD',   name: 'Advanced Micro Devices', v: '0x86923f96303D656E4aa86D9d42D1e57ad2023fdC' },
                  { k: 'PLTR',  name: 'Palantir Technologies',  v: '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A' },
                  { k: 'MU',    name: 'Micron Technology',      v: '0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD' },
                  { k: 'ORCL',  name: 'Oracle Corp.',           v: '0xb0992820E760d836549ba69BC7598b4af75dEE03' },
                  { k: 'COIN',  name: 'Coinbase Global',        v: '0x6330D8C3178a418788dF01a47479c0ce7CCF450b' },
                  { k: 'INTC',  name: 'Intel Corp.',            v: '0xc72b96e0E48ecd4DC75E1e45396e26300BC39681' },
                  { k: 'CRWV',  name: 'CoreWeave Inc.',         v: '0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3' },
                  { k: 'SPY',   name: 'SPDR S&P 500 ETF',       v: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C' },
                  { k: 'QQQ',   name: 'Invesco QQQ ETF',        v: '0xD5f3879160bc7c32ebb4dC785F8a4F505888de68' },
                  { k: 'BE',    name: 'Bloom Energy',           v: '0x822CC93fFD030293E9842c30BBD678F530701867' },
                  { k: 'USAR',  name: 'USA Rare Earth',         v: '0xd917B029C761D264c6A312BBbcDA868658eF86a6' },
                  { k: 'USO',   name: 'United States Oil Fund', v: '0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344' },
                  { k: 'SPCX',  name: 'Procure Space ETF',      v: '0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa' },
                ].map(r => (
                  <div key={r.k} className="grid py-1.5 border-b items-center gap-2"
                    style={{ borderColor: 'var(--out-grid-major)', gridTemplateColumns: '52px 160px 1fr' }}>
                    <span className="text-[11px] font-bold" style={{ color: 'var(--out-ink)' }}>{r.k}</span>
                    <span className="text-[10px] hidden sm:block truncate" style={{ color: 'var(--out-muted)' }}>{r.name}</span>
                    <a
                      href={`https://robinhoodchain.blockscout.com/token/${r.v}`}
                      target="_blank" rel="noreferrer"
                      className="font-mono text-[10px] break-all transition-opacity hover:opacity-70"
                      style={{ color: 'var(--out-text)' }}
                    >
                      {r.v}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </Sheet>
    </div>
  );
}

/* ─── HOW TO ─────────────────────────────────────────────────────────────── */
function HowTo() {
  const steps = [
    {
      n: '01', title: 'INSTALL A WALLET',
      body: 'Install MetaMask or Rabby browser extension. Create a new wallet or import an existing one. Keep your seed phrase offline — OUTRIVE never asks for it. Both wallets support EVM chains including Robinhood Chain.',
    },
    {
      n: '02', title: 'ADD ROBINHOOD CHAIN (chainId 4663)',
      body: 'In your wallet, go to Add Network and enter: Name: Robinhood Chain · RPC: https://rpc.mainnet.chain.robinhood.com · Chain ID: 4663 · Symbol: ETH · Explorer: https://robinhoodchain.blockscout.com',
    },
    {
      n: '03', title: 'GET ETH AND $VIRTUAL FOR GAS',
      body: 'You need ETH on Robinhood Chain to pay gas fees. For an optional initial buy at launch you also need $VIRTUAL (the native trading token of Virtuals Protocol on Robinhood Chain). Bridge both from a supported exchange or L1.',
    },
    {
      n: '04', title: 'CONNECT TO OUTRIVE',
      body: 'Click CONNECT in the top-right corner. Approve the connection for Robinhood Chain (chainId 4663). Your address appears in the top bar. The Dashboard shows your ETH balance (gas) and any pending launches.',
    },
    {
      n: '05', title: 'INSTRUCT THE AGENT',
      body: 'Go to the AGENT tab and type a natural-language prompt. Example: "launch an agent called SkyNet, ticker SKYN". Claude Sonnet 4 asks for any missing parameters before building anything. No command syntax required.',
    },
    {
      n: '06', title: 'REVIEW THE WORK ORDER',
      body: 'The agent presents a Work Order before touching your wallet: token name, ticker (≤6 characters, permanently immutable on-chain), optional initial buy amount, and gas estimate. Read it carefully — the ticker cannot be changed after launch.',
    },
    {
      n: '07', title: 'SIGN THE TRANSACTION',
      body: 'One wallet signature is required to launch. Your wallet pops a signature request — review the calldata, approve, and the transaction broadcasts directly to Robinhood Chain. You are the on-chain creator of record (msg.sender). OUTRIVE never holds or touches your keys.',
    },
    {
      n: '08', title: 'MONITOR YOUR TOKEN',
      body: 'Your token appears in the MARKET tab immediately after confirmation. All market cap and volume figures are shown in USD. The bonding curve progress bar shows how far the token is toward graduation, at which point Virtuals Protocol automatically creates a Uniswap LP locked for 10 years.',
    },
  ];

  const rwaSteps = [
    {
      n: '01', title: 'CONNECT YOUR WALLET',
      body: 'Click CONNECT in the top-right corner. Make sure you are on Robinhood Chain (chainId 4663). You need a small amount of ETH for gas — trades cost roughly 418,000 gas units per transaction.',
    },
    {
      n: '02', title: 'OPEN RWA TRADE',
      body: 'Click the RWA TRADE tab in the left sidebar. The terminal loads a live list of 20 US stocks — NVDA, AAPL, TSLA, META, GOOGL, MSFT, AMZN and more — with real-time on-chain prices pulled from FlapPortal.',
    },
    {
      n: '03', title: 'SELECT A STOCK',
      body: 'Click any stock in the left panel. The order panel on the right loads the live on-chain buy and sell price, your current holdings, and a TradingView chart for that ticker. All prices are fetched directly from FlapPortal — not from a stale oracle.',
    },
    {
      n: '04', title: 'CHOOSE INPUT MODE',
      body: 'Toggle between SHARES, ETH, or USD input mode. SHARES: type how many fractional shares you want. ETH: type how much ETH to spend. USD: type a dollar amount — the app converts it to shares automatically using the live on-chain price.',
    },
    {
      n: '05', title: 'REVIEW THE ORDER',
      body: 'The panel shows: on-chain price, total cost in ETH and USD, and estimated output. A 3% slippage buffer is applied automatically. The ONCHAIN PX row shows the exact FlapPortal execution price — what you see is what you get.',
    },
    {
      n: '06', title: 'APPROVE (SELL ONLY — ONE TIME)',
      body: 'First-time sellers must approve FlapPortal to spend the RWA token. This is a standard ERC-20 approval — max allowance, one transaction, never needed again for that token. The UI shows "APPROVAL required (step 1)" when needed.',
    },
    {
      n: '07', title: 'SIGN THE TRANSACTION',
      body: 'Click BUY or SELL. Your wallet shows the transaction details. Approve it — the trade broadcasts directly to Robinhood Chain via FlapPortal. No intermediary holds your funds at any point.',
    },
    {
      n: '08', title: 'TRACK YOUR POSITION',
      body: 'After confirmation, your RWA holdings appear in the DASHBOARD tab under RWA PORTFOLIO. Every trade is recorded on-chain and viewable on robinhoodchain.blockscout.com. You are the on-chain owner of record.',
    },
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col gap-6">
      <Sheet dwgNo="OUT-HOW-01" figCaption="FIG. 05 — STEP-BY-STEP LAUNCH GUIDE">
        <div className="py-4 flex flex-col gap-3 font-mono">
          <div className="text-[12px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-muted)' }}>
            USER LAUNCH GUIDE — STEPS 01–08
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {steps.map((s) => (
              <div key={s.n} className="border border-[var(--out-grid-major)] p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--out-ink)] text-[20px] font-bold leading-none">{s.n}</span>
                  <span className="text-[13px] uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>{s.title}</span>
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--out-text)' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Sheet>

      <Sheet dwgNo="OUT-HOW-02" figCaption="FIG. 06 — RWA TRADE GUIDE">
        <div className="py-4 flex flex-col gap-3 font-mono">
          <div className="text-[12px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-muted)' }}>
            RWA TRADE GUIDE — STEPS 01–08
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rwaSteps.map((s) => (
              <div key={s.n} className="border border-[var(--out-grid-major)] p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--out-ink)] text-[20px] font-bold leading-none">{s.n}</span>
                  <span className="text-[13px] uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>{s.title}</span>
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--out-text)' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Sheet>

      <Sheet dwgNo="OUT-HOW-03" figCaption="FIG. 07 — AUTONOMOUS AGENT SETUP GUIDE">
        <div className="py-4 flex flex-col gap-3 font-mono">
          <div className="text-[12px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-muted)' }}>
            AUTONOMOUS AGENT VPS SETUP — STEPS 01–07
          </div>
          <p className="text-[11px] leading-relaxed max-w-3xl mb-4" style={{ color: 'var(--out-text)' }}>
            OUTRIVE's Autonomous Vault lets you run a self-hosted trading agent on your own server.
            You configure strategy (token, TP%, SL%, budget) on this site; the agent running on your VPS
            reads that config via OTR API key and executes trades on-chain independently.
            Your private key stays on your server — OUTRIVE never sees it.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                n: '01', title: 'CREATE A DEDICATED AGENT WALLET',
                body: 'Generate a brand-new EVM wallet exclusively for the agent — never reuse your main wallet. Fund it with 0.02–0.05 ETH on Robinhood Chain (chainId 4663) for gas. Separate keys = contained risk.',
                cmd: null,
              },
              {
                n: '02', title: 'PROVISION YOUR VPS',
                body: 'Any Ubuntu 22.04+ server works (1 vCPU / 512 MB RAM minimum). Install Node.js 20 LTS with the following two commands, then verify with node --version.',
                cmd: 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -\nsudo apt install -y nodejs git',
              },
              {
                n: '03', title: 'CREATE THE AGENT DIRECTORY',
                body: 'Make a project folder, initialise npm, and install viem — the on-chain signing library the agent uses to build and submit trades to FlapPortal on Robinhood Chain.',
                cmd: 'mkdir outrive-agent && cd outrive-agent\nnpm init -y\nnpm install viem',
              },
              {
                n: '04', title: 'GENERATE AN OTR API KEY',
                body: 'Navigate to AUTONOMOUS in the left sidebar. Connect your wallet → click Authenticate (one-time wallet signature, no gas) → open the API Access panel → enter an optional label → click Generate. Copy the full key — shown only once.',
                cmd: null,
              },
              {
                n: '05', title: 'CREATE YOUR .ENV FILE',
                body: 'On your VPS, create a .env file in your agent directory. Never commit this file to git — add it to .gitignore immediately. The file needs three values: your agent wallet private key, the OTR key, and your main wallet address.',
                cmd: 'nano .env\n# AGENT_PRIVATE_KEY=0xYOUR_AGENT_PRIVATE_KEY\n# OUTRIVE_API_KEY=OTR-…\n# WALLET_ADDRESS=0xYOUR_MAIN_WALLET\necho ".env" >> .gitignore',
              },
              {
                n: '06', title: 'CONFIGURE STRATEGY ON THIS PAGE',
                body: 'Go to AUTONOMOUS → Strategy Configuration. Choose a token, strategy type (DCA / Momentum / Dip Buy / Breakout), entry condition, TP%, SL%, budget per trade, and max concurrent positions. Click Save Configuration. The agent will pick this up on its next poll.',
                cmd: null,
              },
              {
                n: '07', title: 'START THE AGENT AND MONITOR',
                body: 'Run the agent directly or use Docker Compose for a persistent production deployment. Once running, it polls OUTRIVE every 30 seconds, reads your latest strategy, and executes qualifying trades. Monitor activity back on this page.',
                cmd: '# direct\nnode index.mjs\n\n# or Docker (recommended)\ndocker compose up -d\ndocker compose logs -f outrive-agent',
              },
            ].map((s) => (
              <div key={s.n} className="border border-[var(--out-grid-major)] p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--out-ink)] text-[20px] font-bold leading-none">{s.n}</span>
                  <span className="text-[13px] uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>{s.title}</span>
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--out-text)' }}>{s.body}</p>
                {s.cmd && (
                  <pre className="mt-1 p-3 text-[11px] leading-relaxed overflow-x-auto whitespace-pre rounded"
                    style={{ background: 'var(--out-bg)', border: '1px solid var(--out-grid-major)', color: 'var(--out-ink)', fontFamily: 'var(--font-mono, monospace)' }}>
                    {s.cmd}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      </Sheet>
    </div>
  );
}

/* ─── CLI ────────────────────────────────────────────────────────────────── */
function CliDocs() {
  const chatCommands = [
    { cmd: 'launch <name> <ticker>',        desc: 'Draft a gas-only launch tx for the named token.' },
    { cmd: 'launch <name> <ticker> <amt>',  desc: 'Draft a launch tx with an initial $VIRTUAL buy of <amt>.' },
    { cmd: 'balance',                       desc: 'Fetch your $ETH and $VIRTUAL balances on Robinhood Chain.' },
    { cmd: 'market',                        desc: 'Show latest tokens on Virtuals Protocol (Robinhood chain).' },
    { cmd: 'token <address>',               desc: 'Fetch price, volume, and bonding curve data for a token.' },
    { cmd: 'launches',                      desc: 'List all tokens you have launched via OUTRIVE.' },
    { cmd: 'fees <address>',                desc: 'Show creator fee accrual for a given wallet address.' },
    { cmd: 'explain modes',                 desc: 'Describe Instant Launch / Fund Raise / 60 Days Experiment.' },
    { cmd: 'clear',                         desc: 'Clear the terminal output.' },
    { cmd: 'help',                          desc: 'Print the full command reference.' },
  ];
  const npmCommands = [
    { cmd: 'npm run dev',                        desc: 'App + indexer, local development.' },
    { cmd: 'npm run db:migrate',                 desc: 'Drizzle ORM migrations.' },
    { cmd: 'npm run backfill -- --from-block <n>', desc: 'Replay factory logs from Blockscout into Postgres.' },
    { cmd: 'npm run indexer',                    desc: 'Standalone watcher (production: separate process).' },
    { cmd: 'npm run simulate-launch -- --name X --ticker Y [--buy <amt>]', desc: 'Dry-run TX engine; prints calldata, simulation result, gas estimate; signs nothing.' },
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col gap-6">
      <Sheet dwgNo="OUT-CLI-01" figCaption="FIG. 06 — COMMAND LINE INTERFACE & OPERATOR SCRIPTS">
        <div className="py-4 font-mono flex flex-col gap-8">

          {/* Chat CLI commands */}
          <div>
            <div className="text-[12px] uppercase tracking-widest mb-3 border-b pb-1" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>
              01 · IN-APP CHAT COMMANDS (SWITCH TO CLI MODE IN AGENT TAB)
            </div>
            <div className="flex flex-col gap-0">
              {chatCommands.map((c, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-0.5 sm:gap-4 py-2 border-b text-[13px] sm:text-[13px]" style={{ borderColor: 'var(--out-grid-major)' }}>
                  <span className="sm:shrink-0 sm:w-64 flex items-start gap-1" style={{ color: 'var(--out-ink)' }}>
                    <span style={{ color: 'var(--out-muted)' }}>$</span> {c.cmd}
                  </span>
                  <span style={{ color: 'var(--out-text)' }}>{c.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* npm/operator scripts */}
          <div>
            <div className="text-[12px] uppercase tracking-widest mb-3 border-b pb-1" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>
              02 · OPERATOR SCRIPTS (§9.1 CLI REFERENCE)
            </div>
            <div className="flex flex-col gap-0">
              {npmCommands.map((c, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-0.5 sm:gap-4 py-2 border-b text-[13px]" style={{ borderColor: 'var(--out-grid-major)' }}>
                  <span className="sm:shrink-0 sm:w-80 flex items-start gap-1 break-all" style={{ color: 'var(--out-ink)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {c.cmd}
                  </span>
                  <span style={{ color: 'var(--out-muted)' }}>{c.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Example session */}
          <div>
            <div className="text-[12px] uppercase tracking-widest mb-3 border-b pb-1" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>
              03 · EXAMPLE CHAT SESSION
            </div>
            <div className="border p-4" style={{ borderColor: 'var(--out-grid-major)', background: '#0A0F0A' }}>
              <pre className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--out-ink)' }}>
{`$ balance
→ ETH: 0.0312 · $VIRTUAL: 1,250.00

$ launch SkyNet SKYN 500
→ Drafting launch tx…
→ Name: SkyNet · Ticker: SKYN · Initial buy: 500 $VIRTUAL
→ Warning: ticker is IMMUTABLE after launch.
→ Work order ready — review and SIGN.

[STEP A — APPROVE] → [STEP B — SIGN & LAUNCH]
→ Awaiting wallet signature 1/2 (APPROVE $VIRTUAL)…
→ Approve confirmed. 
→ Awaiting wallet signature 2/2 (LAUNCH)…
→ TOKEN COMMISSIONED — 0xABCD…1234
→ View: https://robinhoodchain.blockscout.com/token/0xABCD…1234
→ Finish agent profile: https://app.virtuals.io`}
              </pre>
            </div>
          </div>

          {/* Operational invariants */}
          <div>
            <div className="text-[12px] uppercase tracking-widest mb-3 border-b pb-1" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>
              04 · OPERATIONAL INVARIANTS (§9.3)
            </div>
            <div className="flex flex-col gap-2">
              {[
                '`verify-config` runs at every boot and every 10 minutes. A FAIL flips the app to read-only CALIBRATION REQUIRED mode automatically — handles silent contract upgrades.',
                'The backend holds no private keys anywhere. There is nothing key-shaped to leak.',
                'Public RPC is acceptable for development only. Production requires RPC_URL_OVERRIDE (Alchemy, QuickNode, dRPC).',
              ].map((inv, i) => (
                <div key={i} className="flex gap-2 items-start text-[13px]">
                  <span style={{ color: 'var(--out-ink)' }}>⬡</span>
                  <p style={{ color: 'var(--out-text)' }}>{inv}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

/* ─── ARCHITECTURE ───────────────────────────────────────────────────────── */
function Architecture() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col gap-6">
      <Sheet dwgNo="OUT-ARC-01" figCaption="FIG. 07 — SYSTEM ARCHITECTURE & DATA MODEL">
        <div className="py-4 font-mono flex flex-col gap-8">

          {/* Stack */}
          <div>
            <div className="text-[12px] uppercase tracking-widest mb-3 border-b pb-1" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>01 · STACK</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { layer: 'FRONTEND',    tech: 'React + Vite',              detail: 'wagmi v2, viem, Privy wallet adapter, TanStack Query v5, JetBrains Mono' },
                { layer: 'BACKEND',     tech: 'Express 5 (API Server)',     detail: 'SSE streaming, tool-use loop, rate limiting, Drizzle ORM' },
                { layer: 'AI ENGINE',   tech: 'Anthropic Claude Sonnet 4',  detail: '7 tools: launch, balance, market, token, launches, fees, explain' },
                { layer: 'DATABASE',    tech: 'PostgreSQL + Drizzle ORM',   detail: 'users, conversations, messages, launches, tokens, trades, watchlist' },
                { layer: 'CHAIN',       tech: 'Robinhood Chain (4663)',     detail: 'viem public client · Blockscout API v2 (zero-cost data source)' },
                { layer: 'PROTOCOL',    tech: 'Virtuals Instant Launch',    detail: 'Factory → bonding curve → Uniswap LP (auto-graduation when curve fills, 10-year LP lock)' },
              ].map((r) => (
                <div key={r.layer} className="border border-[var(--out-grid-major)] p-3 flex flex-col gap-1">
                  <div className="text-[12px]" style={{ color: 'var(--out-muted)' }}>{r.layer}</div>
                  <div className="text-[11px]" style={{ color: 'var(--out-ink)' }}>{r.tech}</div>
                  <div className="text-[12px] leading-relaxed" style={{ color: 'var(--out-muted)' }}>{r.detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Architecture diagram */}
          <div>
            <div className="text-[12px] uppercase tracking-widest mb-3 border-b pb-1" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>02 · SYSTEM ARCHITECTURE DIAGRAM (§5)</div>
            <pre className="text-[12px] leading-relaxed p-4 overflow-x-auto" style={{ background: '#0A0F0A', border: '1px solid var(--out-grid-major)', color: 'var(--out-ink)', whiteSpace: 'pre' }}>
{`┌────────────────────────────────────────────────────────────────────┐
│                     FRONTEND — React + Vite                         │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────────────────┐ │
│  │  Chat UI    │  │ Wallet Layer   │  │ Dashboard / Market       │ │
│  │  (SSE)      │  │ wagmi+viem     │  │ token detail + charts    │ │
│  │             │  │ Privy          │  │                          │ │
│  └──────┬──────┘  └───────┬────────┘  └───────────┬──────────────┘ │
└─────────┼─────────────────┼───────────────────────┼────────────────┘
          │ SSE             │ eth_sign / broadcast  │ REST
┌─────────▼─────────────────▼───────────────────────▼────────────────┐
│                    BACKEND — Express 5 API Server                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ AGENT ORCHESTRATOR — Anthropic Messages API (tool use)       │  │
│  │ intent → tool call JSON → deterministic execution → answer   │  │
│  └───────┬──────────────────────────────────────┬───────────────┘  │
│  ┌───────▼────────────┐              ┌──────────▼───────────────┐  │
│  │ TX ENGINE          │              │ DATA SERVICE             │  │
│  │ validate → encode  │              │ indexer + Blockscout     │  │
│  │ → simulate → emit  │              │ client + Postgres/cache  │  │
│  │ UNSIGNED tx        │              └──────────┬───────────────┘  │
│  └───────┬────────────┘                         │                  │
│  ┌───────▼──────────────────────────────────────▼───────────────┐  │
│  │ VIRTUALS CONFIG LAYER (lib/virtuals.ts)                      │  │
│  │ factory addr/ABI · $VIRTUAL addr · curve reader · healthcheck│  │
│  └───────┬──────────────────────────────────────────────────────┘  │
└──────────┼──────────────────────────────────────────────────────── ┘
           ▼
   ROBINHOOD CHAIN RPC ──► Virtuals contracts (factory, curves, pools)
           ▲
   Blockscout API v2 (history / backfill)`}
            </pre>
          </div>

          {/* Separation of powers */}
          <div>
            <div className="text-[12px] uppercase tracking-widest mb-3 border-b pb-1" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>03 · SEPARATION OF POWERS (SECURITY MODEL)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse font-mono" style={{ minWidth: 600 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--out-ink-dim)' }}>
                    {['COMPONENT', 'MAY DO', 'MAY NEVER DO'].map(h => (
                      <th key={h} className="text-left py-1.5 pr-6 text-[12px] uppercase tracking-widest" style={{ color: 'var(--out-muted)', fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['LLM (orchestrator)',     'Parse intent, ask follow-ups, emit tool-call JSON, summarize data', 'Touch keys, build raw calldata, trigger a broadcast'],
                    ['TX Engine',              'Validate params, encode calldata, simulate, return unsigned tx', 'Sign anything'],
                    ['Frontend wallet layer',  'Present preview, collect user signature, broadcast', 'Auto-sign, re-order, or mutate the prepared tx'],
                    ['Data Service',           'Read chain + Blockscout, persist, cache, push updates', 'Write on-chain state'],
                  ].map(([comp, can, cannot], i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--out-grid-major)' }}>
                      <td className="py-2 pr-6 font-bold" style={{ color: 'var(--out-ink)' }}>{comp}</td>
                      <td className="py-2 pr-6" style={{ color: 'var(--out-text)' }}>{can}</td>
                      <td className="py-2" style={{ color: '#f87171' }}>{cannot}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Data model */}
          <div>
            <div className="text-[12px] uppercase tracking-widest mb-3 border-b pb-1" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>04 · DATABASE SCHEMA (§8 DATA MODEL)</div>
            <pre className="text-[12px] leading-relaxed p-4 overflow-x-auto" style={{ background: '#0A0F0A', border: '1px solid var(--out-grid-major)', color: 'var(--out-ink)', whiteSpace: 'pre' }}>
{`users        (id, wallet_address UNIQUE, created_at)
conversations(id, user_id, title, created_at)
messages     (id, conversation_id, role, content, tool_calls JSONB, created_at)

launches     (id, user_id, token_address UNIQUE, name, ticker, image_uri,
              tx_hash, block_number, status,      -- pending|confirmed|failed
              created_at)

tokens       (address PK, name, ticker, creator, created_block,
              phase,                               -- PROTOTYPE|GRADUATED
              last_price_virtual NUMERIC, raised_virtual NUMERIC,
              curve_progress NUMERIC,              -- raised / 42000e18
              volume_24h NUMERIC, holders INT, graduated_at, updated_at)

trades       (id, token_address, trader, side, virtual_amount, token_amount,
              tx_hash, block_number, ts)

watchlist    (user_id, token_address, PRIMARY KEY(user_id, token_address))`}
            </pre>
            <p className="text-[13px] mt-2" style={{ color: 'var(--out-muted)' }}>Cache: in-memory LRU, TTL 20s for market_overview and per-token price reads.</p>
          </div>

          {/* Threat analysis */}
          <div>
            <div className="text-[12px] uppercase tracking-widest mb-3 border-b pb-1" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>05 · THREAT ANALYSIS (§10)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse font-mono" style={{ minWidth: 500 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--out-ink-dim)' }}>
                    {['THREAT', 'MITIGATION'].map(h => (
                      <th key={h} className="text-left py-1.5 pr-6 text-[12px] uppercase tracking-widest" style={{ color: 'var(--out-muted)', fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['LLM hallucinates params', 'Schema-validated JSON; TX Engine re-validates; only config-layer factory address callable'],
                    ['Prompt injection on-chain', 'All chain text treated as data; broadcasts only from UI button events, never chat content'],
                    ['Frontend tx mutation', 'Preview card decodes the same unsigned tx object the wallet receives; wallet shows to/value/data'],
                    ['Impersonation launches', 'Deterministic ticker blocklist (major assets) + report path'],
                    ['Spam / Sybil', 'Per-wallet rate limit (5/hr); gas costs remain the user\'s'],
                    ['Contract upgrade', 'Config layer + 10-min healthcheck + auto read-only fallback'],
                    ['Custody/regulatory', 'None by design: no user funds, no keys; creator fees flow user↔protocol directly'],
                    ['Data poisoning', 'Indexer trusts only chain logs + Blockscout; no unverified third-party feeds'],
                  ].map(([threat, mitigation], i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--out-grid-major)' }}>
                      <td className="py-2 pr-6" style={{ color: '#f87171' }}>{threat}</td>
                      <td className="py-2" style={{ color: 'var(--out-text)' }}>{mitigation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Token lifecycle */}
          <div>
            <div className="text-[12px] uppercase tracking-widest mb-3 border-b pb-1" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>06 · TOKEN LIFECYCLE (§4.3)</div>
            <svg viewBox="0 0 720 200" className="w-full" style={{ stroke: 'var(--out-ink)', fill: 'none', strokeWidth: 1 }}>
              {[
                { x: 10,  y: 80, w: 90,  h: 40, label: 'BROWSER\nWALLET' },
                { x: 160, y: 80, w: 90,  h: 40, label: 'OUTRIVE\nFRONTEND' },
                { x: 310, y: 80, w: 90,  h: 40, label: 'API\nSERVER' },
                { x: 460, y: 30, w: 90,  h: 40, label: 'ANTHROPIC\nCLAUDE' },
                { x: 460, y: 130, w: 90, h: 40, label: 'ROBINHOOD\nCHAIN RPC' },
                { x: 610, y: 80, w: 90,  h: 40, label: 'VIRTUALS\nFACTORY' },
              ].map((b, i) => (
                <g key={i}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} />
                  {b.label.split('\n').map((line, li) => (
                    <text key={li} x={b.x + b.w / 2} y={b.y + 18 + li * 11}
                      textAnchor="middle" fill="var(--out-ink)" stroke="none"
                      style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                      {line}
                    </text>
                  ))}
                </g>
              ))}
              <line x1="100" y1="100" x2="158" y2="100" />
              <polygon points="156,97 164,100 156,103" fill="var(--out-ink)" stroke="none" />
              <line x1="250" y1="100" x2="308" y2="100" />
              <polygon points="306,97 314,100 306,103" fill="var(--out-ink)" stroke="none" />
              <line x1="355" y1="80"  x2="458" y2="52" />
              <line x1="355" y1="120" x2="458" y2="148" />
              <line x1="550" y1="148" x2="608" y2="120" />
              <polygon points="606,118 614,121 606,124" fill="var(--out-ink)" stroke="none" />
              <text x="129" y="96" textAnchor="middle" fill="var(--out-muted)" stroke="none" style={{ fontSize: 7, fontFamily: 'JetBrains Mono, monospace' }}>SSE</text>
              <text x="279" y="96" textAnchor="middle" fill="var(--out-muted)" stroke="none" style={{ fontSize: 7, fontFamily: 'JetBrains Mono, monospace' }}>HTTP</text>
              <defs>
                <marker id="arr2" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="var(--out-ink)" stroke="none" />
                </marker>
              </defs>
            </svg>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

/* ─── FAQ ────────────────────────────────────────────────────────────────── */
function Faq() {
  const items = [
    {
      q: 'DOES OUTRIVE HOLD MY FUNDS OR PRIVATE KEYS?',
      a: 'No. OUTRIVE is entirely non-custodial. The server constructs unsigned transactions and sends them to your browser. Your wallet extension signs them — your private key never leaves your device. The server holds no keys whatsoever.',
    },
    {
      q: 'DO I NEED $VIRTUAL TO LAUNCH A TOKEN?',
      a: 'You need ETH for gas on Robinhood Chain. Virtuals Instant Launch has no base fee (V7) — gas only. $VIRTUAL is optional and only needed if you want an initial dev buy on the bonding curve at launch. A gas-only launch = one signature (ETH for gas).',
    },
    {
      q: 'WHAT IS VIRTUALS INSTANT LAUNCH?',
      a: 'Instant Launch is one of three Virtuals launch modes. It deploys a bonding curve contract immediately, with no base fee, so the token is tradable at once. The other modes are Fund Raise and 60 Days Experiment — the agent can explain each.',
    },
    {
      q: 'WHAT IS THE GRADUATION THRESHOLD?',
      a: 'When the bonding curve accumulates 42,000 $VIRTUAL in cumulative buys, Virtuals Protocol automatically creates a Uniswap V2 liquidity pool (token/$VIRTUAL) on Robinhood Chain and locks the LP tokens for 10 years (V10). Trading then continues on the open market.',
    },
    {
      q: 'HOW MANY SIGNATURES ARE REQUIRED TO LAUNCH?',
      a: 'Gas-only launch: one signature (LAUNCH tx). With an initial $VIRTUAL buy: two signatures — first APPROVE (ERC-20 allowance for $VIRTUAL so the factory can debit it), then LAUNCH (F2). The Work Order card shows which path applies before you sign anything.',
    },
    {
      q: 'ARE TOKEN NAMES AND TICKERS IMMUTABLE?',
      a: 'Yes. The launch form fields — name, ticker (≤6 alphanumeric chars), description, image URI — are submitted on-chain and are IMMUTABLE (V11). The agent warns you before building any transaction. Choose carefully.',
    },
    {
      q: 'WHAT IS THE TRADING FEE?',
      a: '1% on all buys and sells from day one. As creator, you earn a share of those fees — automatically sent in USDG directly to your creator wallet by the Virtuals Protocol on every trade. No manual claim needed. Track your earnings in the DASHBOARD.',
    },
    {
      q: 'WHAT IS ANTI-SNIPER PROTECTION?',
      a: 'An optional buy-side tax that starts at 99% and decays linearly to 1% over a founder-configured window (0s to 98min). Sell tax is fixed at 1% (V9). This discourages automated sniper bots at launch.',
    },
    {
      q: 'HOW DOES THE AI AGENT KNOW WHAT PARAMETERS TO USE?',
      a: 'The agent is powered by Claude Sonnet 4 with tool use. It fetches your wallet balances (get_balances), validates tickers, builds the transaction (launch_agent_token), and checks your past launches (get_my_launches). It uses slot-filling: if you omit name or ticker, it asks before building anything.',
    },
    {
      q: 'WHAT IS THE RATE LIMIT?',
      a: '5 token launches per wallet address per hour, enforced server-side. Chat requests (without a launch) are unlimited. Gas costs are always the user\'s own.',
    },
    {
      q: 'IS OUTRIVE AFFILIATED WITH VIRTUALS PROTOCOL OR ROBINHOOD?',
      a: 'No. OUTRIVE is an independent software tool. It is not affiliated with, endorsed by, or operated by Virtuals Protocol, Robinhood Markets, or Anthropic.',
    },
    {
      q: 'WHICH WALLETS ARE SUPPORTED?',
      a: 'MetaMask, Rabby, Coinbase Wallet, and any WalletConnect v2-compatible wallet. For optimal experience on Robinhood Chain, MetaMask or Rabby is recommended.',
    },
    {
      q: 'WHAT HAPPENS AFTER MY TOKEN LAUNCHES ON THE MARKET TAB?',
      a: 'The MARKET tab shows all Virtuals Protocol tokens on Robinhood Chain (and Base) in real time, pulling live data from the Virtuals API with 30-second auto-refresh. Your token appears there once confirmed on-chain.',
    },
  ];
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col gap-6">
      <Sheet dwgNo="OUT-FAQ-01" figCaption="FIG. 08 — FREQUENTLY ASKED QUESTIONS">
        <div className="py-4 flex flex-col gap-3 font-mono">
          {items.map((item, i) => (
            <div key={i} className="border border-[var(--out-grid-major)] p-4">
              <div className="text-[13px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-ink)' }}>
                <span className="mr-2" style={{ color: 'var(--out-muted)' }}>{String(i + 1).padStart(2, '0')}</span>
                {item.q}
              </div>
              <div className="text-[13px] leading-relaxed" style={{ color: 'var(--out-text)' }}>{item.a}</div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

/* ─── ABOUT ──────────────────────────────────────────────────────────────── */
function About() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col gap-6">
      <Sheet dwgNo="OUT-ABT-01" figCaption="FIG. 09 — ABOUT OUTRIVE">
        <div className="py-6 flex flex-col gap-8 font-mono">
          {/* Logotype */}
          <div className="flex items-center gap-4">
            <img src="/outrive-logo.png" alt="OUTRIVE" className="h-12 w-12 object-contain" />
            <div>
              <div className="text-[22px] font-bold tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'var(--out-ink)' }}>OUTRIVE</div>
              <div className="text-[12px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>AI AGENT LAUNCHPAD — VIRTUALS PROTOCOL ON ROBINHOOD CHAIN</div>
            </div>
          </div>

          {/* Mission */}
          <div>
            <div className="text-[12px] uppercase tracking-widest mb-2 border-b pb-1" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>MISSION</div>
            <p className="text-[11px] leading-relaxed max-w-3xl" style={{ color: 'var(--out-text)' }}>
              OUTRIVE is a <span style={{ color: 'var(--out-ink)' }}>chat-first launchpad client</span>.
              A user connects their own wallet, types natural-language instructions to an AI deployment agent, and the agent drafts, validates, and simulates an on-chain launch through{' '}
              <span style={{ color: 'var(--out-ink)' }}>Virtuals Protocol</span> on{' '}
              <span style={{ color: 'var(--out-ink)' }}>Robinhood Chain</span>.
              The user's wallet signs every transaction; therefore the user — never OUTRIVE — is the on-chain creator of record and the beneficiary of any creator fee share.
            </p>
            <div className="mt-4 border-l-2 pl-4 py-2 italic" style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>
              Design doctrine: the LLM decides <em>what</em> to do; deterministic code decides <em>how</em>; the user's wallet decides <em>whether</em>.
            </div>
          </div>

          {/* Principles */}
          <div>
            <div className="text-[12px] uppercase tracking-widest mb-3 border-b pb-1" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>CORE PRINCIPLES</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
              {[
                { n: '01', title: 'NON-CUSTODIAL',   body: 'Your keys, your tokens. Server never holds funds or private keys. Always.' },
                { n: '02', title: 'TRANSPARENT',      body: 'Work Order card shows every tx parameter before you sign. Nothing hidden.' },
                { n: '03', title: 'PERMISSIONLESS',   body: 'No account. No KYC. Wallet address is the only identity.' },
                { n: '04', title: 'PROTOCOL-NATIVE',  body: 'Directly invokes Virtuals factory contracts. No intermediary custody layer.' },
              ].map((p) => (
                <div key={p.n} className="border border-[var(--out-grid-major)] p-4 flex flex-col gap-2">
                  <span className="text-[16px] font-bold" style={{ color: 'var(--out-ink)' }}>{p.n}</span>
                  <span className="text-[12px] uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>{p.title}</span>
                  <span className="leading-relaxed" style={{ color: 'var(--out-muted)' }}>{p.body}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Roadmap */}
          <div>
            <div className="text-[12px] uppercase tracking-widest mb-3 border-b pb-1" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>ROADMAP (§12)</div>
            <div className="flex flex-col gap-3">
              {[
                { ver: 'v1 — CURRENT', items: ['Chat launch (Instant Launch)', 'Optional initial $VIRTUAL dev buy (2-sig)', 'Live Virtuals Protocol market dashboard', 'Creator fee readout post-calibration'] },
                { ver: 'v1.1', items: ['Buy/sell curve trades via chat (same preview→sign doctrine)', 'Watchlist alerts: graduation events, ±X% price moves'] },
                { ver: 'v2', items: ['Optional auto-pilot via MPC server wallets (Privy/Turnkey) behind a deterministic policy engine — targeting trades only, NOT launches (auto-pilot launch = agent wallet as creator, not user)'] },
                { ver: 'v2.x', items: ['Genesis/Fund-Raise mode if/when programmatic paths confirmed', 'Multi-chain (Base) toggle reusing the same config layer'] },
              ].map(r => (
                <div key={r.ver} className="border p-4 flex flex-col gap-2" style={{ borderColor: 'var(--out-grid-major)' }}>
                  <div className="text-[13px] font-bold uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>{r.ver}</div>
                  <ul className="flex flex-col gap-1">
                    {r.items.map((item, i) => (
                      <li key={i} className="flex gap-2 text-[13px] leading-relaxed" style={{ color: 'var(--out-text)' }}>
                        <span style={{ color: 'var(--out-ink)' }}>▷</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Legal posture */}
          <div className="border p-4" style={{ borderColor: '#f59e0b', background: '#120f02' }}>
            <div className="text-[12px] uppercase tracking-widest mb-2" style={{ color: '#f59e0b' }}>RISK DISCLOSURE & LEGAL POSTURE (§13)</div>
            <p className="text-[13px] leading-relaxed" style={{ color: '#d97706' }}>
              OUTRIVE is a non-custodial software interface. It never holds user funds or keys, executes nothing without a user signature, and provides no financial advice.
              Agent/launchpad tokens are highly speculative and may lose all value.
              Protocol parameters cited here (fees, thresholds, modes) belong to Virtuals Protocol and can change at any time;
              OUTRIVE's healthcheck-and-config architecture exists precisely because of that.
              OUTRIVE is not affiliated with Virtuals Protocol, Robinhood, or Anthropic.
              Operators should obtain their own legal advice for their jurisdiction before public release.
            </p>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

/* ─── HOME ───────────────────────────────────────────────────────────────── */
export default function Home() {
  const { isConnected, address } = useAccount();
  const [view, setView] = useState<View>('agent');

  // ── RWA quick-trade pre-selection ──────────────────────────────────────────
  const [rwaInitSymbol, setRwaInitSymbol] = React.useState<string | undefined>();
  const [rwaInitSide,   setRwaInitSide]   = React.useState<'buy' | 'sell' | undefined>();
  const [rwaInitKey,    setRwaInitKey]     = React.useState(0);

  // ── Global triggered limit-orders poll (visible on every tab) ─────────────
  const { data: triggeredData } = useQuery<{ orders: Array<{ id: number; symbol: string; side: string; targetPriceUsd: string }> }>({
    queryKey: ['triggered-limit-orders', address],
    queryFn:  async () => {
      const r = await fetch(apiUrl(`/api/rwa/limit-orders?wallet=${address}`));
      const j = await r.json() as { orders: Array<{ status: string } & Record<string, unknown>> };
      return { orders: (j.orders ?? []).filter((o) => o.status === 'triggered') as any };
    },
    enabled:         !!address,
    refetchInterval: 8_000,
    staleTime:       5_000,
  });
  const triggeredOrders = triggeredData?.orders ?? [];

  // Navigate to RWA tab with pre-selected asset + side
  const handleTradeClick = React.useCallback((symbol: string, side: 'buy' | 'sell') => {
    setRwaInitSymbol(symbol);
    setRwaInitSide(side);
    setRwaInitKey(k => k + 1);
    setView('rwa');
  }, []);

  // Scroll to top on every view change
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view]);

  // ── Copy CA helper — clipboard API + execCommand fallback ─────────────────
  const [caCopied, setCaCopied] = React.useState(false);
  const handleCopyCa = () => {
    const CA = '0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef';
    const flash = () => { setCaCopied(true); setTimeout(() => setCaCopied(false), 1800); };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(CA).then(flash).catch(() => {
        // fallback if clipboard promise rejects
        try {
          const el = document.createElement('textarea');
          el.value = CA;
          el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
          document.body.appendChild(el);
          el.focus(); el.select();
          document.execCommand('copy');
          document.body.removeChild(el);
          flash();
        } catch {}
      });
    } else {
      // no clipboard API at all — execCommand only
      try {
        const el = document.createElement('textarea');
        el.value = CA;
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(el);
        el.focus(); el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        flash();
      } catch {}
    }
  };

  const step1: StepState = isConnected ? 'done' : 'active';
  const step2: StepState = !isConnected ? 'locked' : 'active';
  const step3: StepState = !isConnected ? 'locked' : 'locked';

  const renderView = () => {
    if (view === 'dashboard')    return <Dashboard walletAddress={address} onTradeClick={handleTradeClick} />;
    if (view === 'docs')         return <Docs />;
    if (view === 'howto')        return <HowTo />;
    if (view === 'cli')          return <CliDocsPage />;
    if (view === 'architecture') return <Architecture />;
    if (view === 'faq')          return <Faq />;
    if (view === 'about')        return <About />;
    if (view === 'whitepaper')   return <WhitepaperPage />;
    if (view === 'launches')     return <LaunchesPage />;
    if (view === 'outrive')      return <OutrivePage />;
    if (view === 'rwa')          return <RwaPage key={rwaInitKey} initialSymbol={rwaInitSymbol} initialSide={rwaInitSide} />;
    if (view === 'autonomous')   return <AutonomousPage />;
    if (view === 'distribution') return <DistributionPage />;

    // market — full-width rich page
    if (view === 'market') return <MarketPage />;

    // agent (default)
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col gap-6 xl:flex-row xl:items-start xl:gap-6">
        {/* Main column — Agent */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          <Sheet dwgNo="OUT-HER-01">
            <div className="py-5 sm:py-7">
              <h1
                className="font-bold uppercase leading-[0.9] mb-4"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  color: 'var(--out-ink)',
                  letterSpacing: '0.01em',
                  fontSize: 'clamp(56px, 9vw, 112px)',
                }}
              >
                OUTRIVE<br />FACTORY
              </h1>
              <p
                className="text-[13px] leading-relaxed max-w-xl"
                style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--out-text)' }}
              >
                Chat with the Deployment Agent — it drafts the launch,{' '}
                <span style={{ color: 'var(--out-ink)' }}>your wallet signs it</span>,
                and you are the creator of record on Virtuals Protocol.
              </p>

              {/* $OTR Contract Address */}
              <div className="mt-4 inline-flex flex-wrap items-center gap-2 border px-3 py-2"
                style={{ borderColor: 'var(--out-grid-major)', fontFamily: 'JetBrains Mono, monospace' }}>
                <span className="text-[11px]" style={{ color: 'var(--out-muted)' }}>$OTR CA</span>
                <span className="text-[11px] sm:text-[12px]" style={{ color: 'var(--out-ink)' }}>
                  0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef
                </span>
                <button
                  onClick={handleCopyCa}
                  className="shrink-0 text-[10px] border px-1.5 py-0.5 transition-colors hover:border-[var(--out-ink)] hover:text-[var(--out-ink)]"
                  style={{
                    borderColor: caCopied ? 'var(--out-ink)' : 'var(--out-muted)',
                    color:       caCopied ? 'var(--out-ink)' : 'var(--out-muted)',
                  }}
                  title="Copy contract address"
                >{caCopied ? '✓ COPIED' : '⎘ COPY'}</button>
              </div>
            </div>
          </Sheet>

          {/* Step tracker — abbreviated labels on mobile, full on ≥sm */}
          <div className="flex items-center gap-1 sm:gap-2 font-mono px-1">
            {/* Step 1 */}
            <StepBadge label="CONNECT" state={step1} />
            <span className="flex-1 border-b border-dotted border-[var(--out-muted)] min-w-[8px]" />
            {/* Step 2 */}
            <StepBadge label="INSTRUCT" state={step2} />
            <span className="flex-1 border-b border-dotted border-[var(--out-muted)] min-w-[8px]" />
            {/* Step 3 — "SIGN" on mobile, "SIGN & LAUNCH" on sm+ */}
            <span className="sm:hidden">
              <StepBadge label="SIGN" state={step3} />
            </span>
            <span className="hidden sm:inline">
              <StepBadge label="SIGN & LAUNCH" state={step3} />
            </span>
          </div>

          {/* RWA portfolio mini — visible from agent tab */}
          <RwaPortfolioMini walletAddress={address} onNavigate={() => setView('dashboard')} />

          <ChatConsole />
        </div>
      </div>
    );
  };

  return (
    <main className="pt-12 min-h-screen" style={{ background: 'var(--out-bg)' }}>
      <NavBar view={view} setView={setView} />

      {/* Content — offset right on desktop to clear fixed sidebar */}
      <div className="md:pl-52">
        <CalibrationBanner />
        <TickerStrip />

        {/* ── Triggered limit orders — global banner, visible on any tab ── */}
        {triggeredOrders.length > 0 && (
          <div className="border-b flex items-center justify-between gap-3 px-4 py-2"
            style={{ borderColor: '#e0902055', background: '#100c0335', fontFamily: 'JetBrains Mono, monospace' }}>
            <div className="flex items-center gap-2 min-w-0">
              <Zap size={10} color="#e09020" style={{ flexShrink: 0 }} />
              <span className="text-[10px] font-bold uppercase tracking-widest shrink-0" style={{ color: '#e09020' }}>
                {triggeredOrders.length} LIMIT ORDER{triggeredOrders.length > 1 ? 'S' : ''} TRIGGERED
              </span>
              <span className="text-[10px] truncate hidden sm:block" style={{ color: 'var(--out-muted)' }}>
                — {triggeredOrders.map(o => `${o.side === 'buy' ? '▲' : '▼'} ${o.symbol} @${parseFloat(o.targetPriceUsd).toFixed(2)}`).join(' · ')}
              </span>
            </div>
            <button
              onClick={() => setView('rwa')}
              className="shrink-0 text-[9px] border px-3 py-1 font-bold uppercase tracking-widest transition-opacity hover:opacity-80"
              style={{ borderColor: '#e09020', color: '#e09020' }}>
              EXECUTE NOW →
            </button>
          </div>
        )}

        <div className="pt-3 md:pt-4">
          {renderView()}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-16 md:pl-52 border-t font-mono" style={{ borderColor: 'var(--out-ink-dim)', background: 'var(--out-bg)' }}>
        <div className="max-w-[1400px] mx-auto px-4 py-8 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <img src="/outrive-logo.png" alt="OUTRIVE" className="h-8 w-8 object-contain" />
              <div>
                <div className="text-[11px] font-bold tracking-widest" style={{ color: 'var(--out-ink)' }}>OUTRIVE</div>
                <div className="text-[12px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>AI AGENT LAUNCHPAD</div>
              </div>
            </div>

            {/* Link columns */}
            <div className="flex flex-wrap gap-8 sm:gap-12 text-[13px] uppercase tracking-widest">
              <div className="flex flex-col gap-2">
                <span className="text-[12px] mb-1" style={{ color: 'var(--out-muted)' }}>APP</span>
                {[
                  { label: 'AGENT',     tab: 'agent' as View },
                  { label: 'MARKET',    tab: 'market' as View },
                  { label: 'DASHBOARD', tab: 'dashboard' as View },
                  { label: 'OUTRIVE',   tab: 'outrive' as View },
                ].map(l => (
                  <button key={l.tab} onClick={() => setView(l.tab)}
                    className="text-left transition-colors" style={{ color: 'var(--out-text)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--out-ink)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--out-text)')}>
                    {l.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[12px] mb-1" style={{ color: 'var(--out-muted)' }}>LEARN</span>
                {[
                  { label: 'DOCS',          tab: 'docs' as View },
                  { label: 'HOW TO',        tab: 'howto' as View },
                  { label: 'CLI',           tab: 'cli' as View },
                  { label: 'ARCHITECTURE',  tab: 'architecture' as View },
                  { label: 'FAQ',           tab: 'faq' as View },
                  { label: 'ABOUT',         tab: 'about' as View },
                  { label: 'WHITEPAPER',    tab: 'whitepaper' as View },
                ].map(l => (
                  <button key={l.tab} onClick={() => setView(l.tab)}
                    className="text-left transition-colors" style={{ color: 'var(--out-text)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--out-ink)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--out-text)')}>
                    {l.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[12px] mb-1" style={{ color: 'var(--out-muted)' }}>COMMUNITY</span>
                <a href="https://outrive.io" target="_blank" rel="noopener noreferrer"
                  className="transition-colors" style={{ color: 'var(--out-text)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--out-ink)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--out-text)')}>
                  WEBSITE
                </a>
                <a href="https://x.com/outrive_io" target="_blank" rel="noopener noreferrer"
                  className="transition-colors" style={{ color: 'var(--out-text)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--out-ink)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--out-text)')}>
                  X (TWITTER)
                </a>
                <a href="https://t.me/outrive_io" target="_blank" rel="noopener noreferrer"
                  className="transition-colors" style={{ color: 'var(--out-text)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--out-ink)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--out-text)')}>
                  TELEGRAM
                </a>
                <a href="https://discord.gg/outriveio" target="_blank" rel="noopener noreferrer"
                  className="transition-colors" style={{ color: 'var(--out-text)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--out-ink)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--out-text)')}>
                  DISCORD
                </a>
                <a href="https://github.com/outrive" target="_blank" rel="noopener noreferrer"
                  className="transition-colors" style={{ color: 'var(--out-text)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--out-ink)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--out-text)')}>
                  GITHUB
                </a>
                <button onClick={() => setView('whitepaper')}
                  className="text-left transition-colors" style={{ color: 'var(--out-text)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--out-ink)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--out-text)')}>
                  WHITEPAPER
                </button>
              </div>
            </div>
          </div>

          <div className="border-t" style={{ borderColor: 'var(--out-grid-major)' }} />

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-[12px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
            <p>
              OUTRIVE IS A SOFTWARE TOOL BUILT ON VIRTUALS PROTOCOL. NOT AFFILIATED WITH OR ENDORSED BY VIRTUALS OR ROBINHOOD.
              NOT FINANCIAL ADVICE. AGENT TOKENS ARE HIGHLY SPECULATIVE AND MAY LOSE ALL VALUE.
            </p>
            <p className="shrink-0" style={{ color: 'var(--out-ink-dim)' }}>SHEET REV. D — ROBINHOOD CHAIN · V1.0</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
