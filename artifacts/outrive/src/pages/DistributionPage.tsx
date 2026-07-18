/**
 * DistributionPage — OUTRIVE protocol fee distribution terminal
 *
 * Layout mirrors theindex.finance/distributions but in OUTRIVE's
 * black-on-lime engineering aesthetic.
 *
 * Revenue: 0.3% of every confirmed RWA trade flows into the daily
 * distribution pool. Wallets earn proportional to their trade volume.
 */

import React, { useEffect, useState } from 'react';
import { useQuery }    from '@tanstack/react-query';
import { useAccount }  from 'wagmi';
import { ExternalLink, Zap, Clock, TrendingUp, Users, DollarSign } from 'lucide-react';
import { Sheet } from '@/components/Sheet';

/* ── Helpers ──────────────────────────────────────────────────────────── */
const BASE_URL = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
const apiUrl   = (p: string) => BASE_URL + p;

const EXPLORER = 'https://robinhoodchain.blockscout.com';

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtEth(n: number): string {
  return n >= 0.0001 ? `${n.toFixed(4)} ETH` : `${n.toFixed(6)} ETH`;
}
function fmtDate(d: string | Date): string {
  const dt = new Date(d);
  return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }) +
    ' UTC · ' + dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function fmtDay(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function fmtCountdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function shortWallet(w: string): string {
  return w ? `${w.slice(0, 6)}…${w.slice(-4)}` : '—';
}
function txUrl(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}
function logoUrl(addr: string): string {
  return apiUrl(`/api/rwa/logo/${addr}`);
}

/* ── Types ────────────────────────────────────────────────────────────── */
interface StatsResp {
  cumulativeUsd: number; cumulativeEth: number; totalEvents: number;
  todayFeesUsd: number;  todayFeesEth: number;  todayWallets: number;
  totalEligible: number; ethPriceUsd: number;
  chart: { day: string; feesUsd: number; feesEth: number; wallets: number }[];
}
interface EventResp {
  id: number; epochNumber: number; epochStart: string; epochEnd: string;
  totalVolumeUsd: number; totalFeesUsd: number; totalFeesEth: number;
  eligibleWallets: number; status: string; distributedAt: string | null;
  txHash: string | null;
  topSymbols: { symbol: string; volUsd: number; tokenAddress: string }[];
}
interface NextResp {
  secondsUntil: number; nextAt: string; estimatedPoolUsd: number;
}
interface FeeActivity {
  time: string; walletAddress: string; symbol: string;
  feeUsd: number; feeEth: number; txHash: string | null;
}
interface AllocResp {
  wallet: string; allocations: { epochStart: string; epochEnd: string; volumeUsd: number;
    shareBps: number; amountUsd: number; amountEth: string; status: string; claimable: boolean; }[];
  totalClaimableUsd: number;
}

/* ── MiniBarChart ─────────────────────────────────────────────────────── */
function MiniBarChart({ data, color = 'var(--out-ink)' }: { data: number[]; color?: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 0.000001);
  const W = 4, G = 2, H = 52;
  const totalW = data.length * (W + G) - G;
  return (
    <svg width={totalW} height={H} style={{ display: 'block' }}>
      {data.map((v, i) => {
        const barH = Math.max(2, (v / max) * H);
        return (
          <rect key={i}
            x={i * (W + G)} y={H - barH} width={W} height={barH}
            fill={color} opacity={0.8} rx={1}
          />
        );
      })}
    </svg>
  );
}

/* ── LiveCountdown ────────────────────────────────────────────────────── */
function LiveCountdown({ initialSecs }: { initialSecs: number }) {
  const [secs, setSecs] = useState(initialSecs);
  useEffect(() => {
    setSecs(initialSecs);
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [initialSecs]);
  return (
    <span className="font-mono font-bold tabular-nums" style={{ letterSpacing: '0.05em' }}>
      {fmtCountdown(secs)}
    </span>
  );
}

/* ── SymbolPill ───────────────────────────────────────────────────────── */
function SymbolPill({ symbol, volUsd, tokenAddress }: { symbol: string; volUsd: number; tokenAddress: string }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 mr-2 mb-0.5">
      {!imgErr ? (
        <img src={logoUrl(tokenAddress)} alt={symbol} onError={() => setImgErr(true)}
          className="w-3 h-3 rounded-full object-cover shrink-0"
          style={{ border: '1px solid var(--out-ink-dim)' }} />
      ) : (
        <span className="w-3 h-3 rounded-full shrink-0 inline-flex items-center justify-center"
          style={{ background: '#1a2a0a', fontSize: 6, color: 'var(--out-ink)' }}>
          {symbol[0]}
        </span>
      )}
      <span className="text-[10px] font-bold" style={{ color: 'var(--out-ink)', fontFamily: 'JetBrains Mono, monospace' }}>
        {symbol}
      </span>
      <span className="text-[10px]" style={{ color: 'var(--out-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
        {fmtUsd(volUsd)}
      </span>
    </span>
  );
}

/* ── StatCard ─────────────────────────────────────────────────────────── */
function StatCard({
  idx, label, unit, value, sub, chartData,
}: {
  idx: string; label: string; unit: string; value: string; sub?: string; chartData: number[];
}) {
  return (
    <div className="border flex flex-col gap-3 p-4 min-w-0"
      style={{ borderColor: 'var(--out-ink-dim)', background: 'var(--out-bg-sheet)' }}>
      <div className="text-[9px] uppercase tracking-widest font-mono"
        style={{ color: 'var(--out-muted)' }}>
        / {idx} / {label}, {unit}
      </div>
      <div>
        <span className="text-2xl sm:text-3xl font-bold font-mono" style={{ color: 'var(--out-ink)' }}>
          {value}
        </span>
        {sub && (
          <span className="text-[10px] ml-2 uppercase tracking-widest font-mono" style={{ color: 'var(--out-muted)' }}>
            {sub}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between">
        <MiniBarChart data={chartData} />
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[8px] font-mono uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>LAUNCH</span>
          <span className="w-8 border-t" style={{ borderColor: 'var(--out-ink-dim)' }} />
          <span className="text-[8px] font-mono uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>NOW</span>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────── */
export function DistributionPage() {
  const { address } = useAccount();

  const { data: stats, isLoading: loadingStats } = useQuery<StatsResp>({
    queryKey: ['dist-stats'],
    queryFn:  () => fetch(apiUrl('/api/distributions/stats')).then(r => r.json()),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const { data: eventsData, isLoading: loadingEvents } = useQuery<{ events: EventResp[]; total: number }>({
    queryKey: ['dist-events'],
    queryFn:  () => fetch(apiUrl('/api/distributions')).then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: nextData } = useQuery<NextResp>({
    queryKey: ['dist-next'],
    queryFn:  () => fetch(apiUrl('/api/distributions/next')).then(r => r.json()),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const { data: feeData } = useQuery<{ activities: FeeActivity[] }>({
    queryKey: ['dist-fee-activity'],
    queryFn:  () => fetch(apiUrl('/api/distributions/fee-activity')).then(r => r.json()),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  const { data: allocData } = useQuery<AllocResp>({
    queryKey: ['dist-alloc', address],
    queryFn:  () => fetch(apiUrl(`/api/distributions/allocation/${address}`)).then(r => r.json()),
    enabled:  !!address,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const events     = eventsData?.events ?? [];
  const activities = feeData?.activities ?? [];
  const chartDays  = stats?.chart ?? [];

  // Build chart arrays (last 30 days)
  const cumulativeChart = (() => {
    let running = 0;
    return chartDays.map(d => { running += d.feesUsd; return running; });
  })();
  const feesEthChart  = chartDays.map(d => d.feesEth);
  const walletsChart  = chartDays.map(d => d.wallets);

  const MONO = { fontFamily: 'JetBrains Mono, monospace' };

  return (
    <div className="flex flex-col gap-4 pb-12">

      {/* ── Sheet header ── */}
      <Sheet dwgNo="OUT-DST-01">
        {/* Breadcrumb */}
        <div className="text-[9px] uppercase tracking-widest font-mono mb-4"
          style={{ color: 'var(--out-muted)', ...MONO }}>
          / ACTIVITY / DISTRIBUTIONS /
        </div>

        {/* Hero copy */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-1" style={{ color: 'var(--out-ink)', ...MONO }}>
              Protocol revenue and<br />distribution history.
            </h1>
            <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--out-muted)', ...MONO }}>
              0.3% of every confirmed RWA trade · distributed proportionally to traders.
            </p>
          </div>

          {/* Next epoch countdown */}
          {nextData && (
            <div className="border px-4 py-3 shrink-0 flex flex-col items-end gap-1"
              style={{ borderColor: 'var(--out-ink-dim)', background: '#0a0f09' }}>
              <div className="text-[8px] uppercase tracking-widest font-mono" style={{ color: 'var(--out-muted)' }}>
                NEXT DISTRIBUTION IN
              </div>
              <div className="text-xl" style={{ color: 'var(--out-ink)' }}>
                <LiveCountdown initialSecs={nextData.secondsUntil} />
              </div>
              {nextData.estimatedPoolUsd > 0 && (
                <div className="text-[9px] font-mono" style={{ color: 'var(--out-muted)' }}>
                  EST. POOL {fmtUsd(nextData.estimatedPoolUsd)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 3 Stat cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-0">
          <StatCard
            idx="01" label="CUMULATIVE DISTRIBUTED" unit="USD"
            value={loadingStats ? '—' : fmtUsd(stats?.cumulativeUsd ?? 0)}
            sub={stats?.totalEvents ? `${stats.totalEvents} EPOCHS` : undefined}
            chartData={cumulativeChart}
          />
          <StatCard
            idx="02" label="FEES COLLECTED" unit="ETH / DAY"
            value={loadingStats ? '—' : fmtEth(stats?.todayFeesEth ?? 0)}
            sub={`${fmtUsd(stats?.todayFeesUsd ?? 0)} TODAY`}
            chartData={feesEthChart}
          />
          <StatCard
            idx="03" label="WALLETS" unit="ELIGIBLE"
            value={loadingStats ? '—' : (stats?.totalEligible ?? 0).toLocaleString()}
            sub={`${stats?.todayWallets ?? 0} ACTIVE TODAY`}
            chartData={walletsChart}
          />
        </div>
      </Sheet>

      {/* ── Your allocation (connected wallet) ── */}
      {address && allocData && allocData.allocations.length > 0 && (
        <Sheet dwgNo="OUT-DST-02">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={12} color="var(--out-ink)" />
            <span className="text-[10px] uppercase tracking-widest font-bold font-mono"
              style={{ color: 'var(--out-ink)' }}>
              YOUR ALLOCATION — {shortWallet(address)}
            </span>
            {allocData.totalClaimableUsd > 0 && (
              <span className="ml-auto text-[10px] font-bold font-mono px-2 py-0.5 border"
                style={{ color: 'var(--out-ink)', borderColor: 'var(--out-ink)', background: '#12180f' }}>
                {fmtUsd(allocData.totalClaimableUsd)} EARNED
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono" style={MONO}>
              <thead>
                <tr style={{ color: 'var(--out-muted)', borderBottom: '1px solid var(--out-ink-dim)' }}>
                  <th className="text-left pb-2 pr-4 font-normal uppercase tracking-widest">EPOCH</th>
                  <th className="text-left pb-2 pr-4 font-normal uppercase tracking-widest">YOUR VOLUME</th>
                  <th className="text-left pb-2 pr-4 font-normal uppercase tracking-widest">SHARE</th>
                  <th className="text-left pb-2 pr-4 font-normal uppercase tracking-widest">EARNED</th>
                  <th className="text-left pb-2 font-normal uppercase tracking-widest">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {allocData.allocations.slice(0, 10).map((a, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #111' }}>
                    <td className="py-1.5 pr-4" style={{ color: 'var(--out-text)' }}>{fmtDay(a.epochStart)}</td>
                    <td className="py-1.5 pr-4" style={{ color: 'var(--out-ink)' }}>{fmtUsd(a.volumeUsd)}</td>
                    <td className="py-1.5 pr-4" style={{ color: 'var(--out-text)' }}>{(a.shareBps / 100).toFixed(2)}%</td>
                    <td className="py-1.5 pr-4" style={{ color: 'var(--out-ink)' }}>
                      {fmtUsd(a.amountUsd)}
                      <span className="ml-1 opacity-60">{a.amountEth} ETH</span>
                    </td>
                    <td className="py-1.5">
                      <span className="px-1.5 py-0.5 text-[8px] uppercase tracking-widest border font-bold"
                        style={{
                          borderColor: a.status === 'distributed' ? 'var(--out-ink-dim)' : '#e09020',
                          color: a.status === 'distributed' ? 'var(--out-muted)' : '#e09020',
                        }}>
                        {a.status === 'distributed' ? '✓ DISTRIBUTED' : '⏳ PENDING'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sheet>
      )}

      {/* ── Distribution history + Fee activity (two-column) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Distribution history — left (wider) */}
        <div className="lg:col-span-3">
          <Sheet dwgNo="OUT-DST-03">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={12} color="var(--out-ink)" />
              <span className="text-[10px] uppercase tracking-widest font-bold font-mono"
                style={{ color: 'var(--out-ink)' }}>
                Distribution history
              </span>
              <span className="ml-auto text-[9px] font-mono" style={{ color: 'var(--out-muted)' }}>
                {eventsData?.total ?? 0} EPOCHS
              </span>
            </div>

            {loadingEvents && (
              <div className="text-[10px] font-mono uppercase tracking-widest py-8 text-center"
                style={{ color: 'var(--out-muted)' }}>
                LOADING EPOCHS…
              </div>
            )}

            {events.length === 0 && !loadingEvents && (
              <div className="text-[10px] font-mono uppercase tracking-widest py-8 text-center"
                style={{ color: 'var(--out-muted)' }}>
                NO DISTRIBUTION EPOCHS YET — FIRST EPOCH RUNS AT MIDNIGHT UTC
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-[10px]" style={MONO}>
                {events.length > 0 && (
                  <thead>
                    <tr style={{ color: 'var(--out-muted)', borderBottom: '1px solid var(--out-ink-dim)' }}>
                      <th className="text-left pb-2 pr-4 font-normal uppercase tracking-widest whitespace-nowrap">TIME</th>
                      <th className="text-left pb-2 pr-4 font-normal uppercase tracking-widest">ASSETS DISTRIBUTED</th>
                      <th className="text-left pb-2 pr-2 font-normal uppercase tracking-widest">WALLETS</th>
                      <th className="text-left pb-2 font-normal uppercase tracking-widest">TX</th>
                    </tr>
                  </thead>
                )}
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id}
                      style={{ borderBottom: '1px solid #0e120d' }}
                      className="hover:bg-[#0c110b] transition-colors">
                      <td className="py-2 pr-4 whitespace-nowrap align-top" style={{ color: 'var(--out-muted)' }}>
                        {fmtDate(ev.epochStart)}
                      </td>
                      <td className="py-2 pr-4 align-top">
                        <div className="flex flex-wrap gap-x-1 gap-y-0.5 mb-1">
                          {ev.topSymbols.map(s => (
                            <SymbolPill key={s.symbol} symbol={s.symbol} volUsd={s.volUsd} tokenAddress={s.tokenAddress} />
                          ))}
                          {ev.topSymbols.length === 0 && (
                            <span style={{ color: 'var(--out-muted)' }}>—</span>
                          )}
                        </div>
                        <div className="text-[9px] mt-0.5" style={{ color: 'var(--out-muted)' }}>
                          {fmtEth(ev.totalFeesEth)} distributed · {fmtUsd(ev.totalFeesUsd)}
                        </div>
                      </td>
                      <td className="py-2 pr-2 align-top" style={{ color: 'var(--out-text)' }}>
                        {ev.eligibleWallets.toLocaleString()}
                      </td>
                      <td className="py-2 align-top">
                        {ev.txHash ? (
                          <a href={txUrl(ev.txHash)} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
                            style={{ color: 'var(--out-ink)' }}>
                            <ExternalLink size={10} />
                          </a>
                        ) : (
                          <span className="text-[8px] px-1 border uppercase tracking-widest"
                            style={{ borderColor: '#e0902040', color: '#e09020' }}>
                            {ev.status === 'pending' ? 'PENDING' : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Sheet>
        </div>

        {/* Fee activity — right (narrower) */}
        <div className="lg:col-span-2">
          <Sheet dwgNo="OUT-DST-04">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign size={12} color="var(--out-ink)" />
              <span className="text-[10px] uppercase tracking-widest font-bold font-mono"
                style={{ color: 'var(--out-ink)' }}>
                Fee collection activity
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[10px]" style={MONO}>
                {activities.length > 0 && (
                  <thead>
                    <tr style={{ color: 'var(--out-muted)', borderBottom: '1px solid var(--out-ink-dim)' }}>
                      <th className="text-left pb-2 pr-3 font-normal uppercase tracking-widest whitespace-nowrap">TIME</th>
                      <th className="text-left pb-2 pr-3 font-normal uppercase tracking-widest">ETH FEE</th>
                      <th className="text-left pb-2 font-normal uppercase tracking-widest">TX</th>
                    </tr>
                  </thead>
                )}
                <tbody>
                  {activities.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-[10px] uppercase tracking-widest"
                        style={{ color: 'var(--out-muted)' }}>
                        NO ACTIVITY YET
                      </td>
                    </tr>
                  )}
                  {activities.map((a, i) => (
                    <tr key={i}
                      style={{ borderBottom: '1px solid #0e120d' }}
                      className="hover:bg-[#0c110b] transition-colors">
                      <td className="py-2 pr-3 whitespace-nowrap align-top" style={{ color: 'var(--out-muted)' }}>
                        {fmtDate(a.time)}
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <div style={{ color: 'var(--out-ink)' }}>{fmtEth(a.feeEth)}</div>
                        <div className="text-[9px]" style={{ color: 'var(--out-muted)' }}>
                          {a.symbol} · {fmtUsd(a.feeUsd)}
                        </div>
                      </td>
                      <td className="py-2 align-top">
                        {a.txHash ? (
                          <a href={txUrl(a.txHash)} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
                            style={{ color: 'var(--out-ink)' }}>
                            <ExternalLink size={10} />
                          </a>
                        ) : <span style={{ color: 'var(--out-muted)' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Sheet>
        </div>
      </div>

      {/* ── How distribution works ── */}
      <Sheet dwgNo="OUT-DST-05">
        <div className="text-[10px] uppercase tracking-widest font-bold font-mono mb-4"
          style={{ color: 'var(--out-ink)' }}>
          HOW DISTRIBUTION WORKS
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-[10px] font-mono" style={MONO}>
          {[
            {
              n: '01', title: 'FEES COLLECTED',
              body: 'Every confirmed RWA trade incurs a 0.3% protocol fee, collected on-chain. Fees accumulate in real-time throughout each 24-hour epoch.',
            },
            {
              n: '02', title: 'SNAPSHOT AT MIDNIGHT UTC',
              body: 'At epoch close (00:00 UTC), a snapshot records each wallet\'s trading volume for the period. Your share is proportional to your volume.',
            },
            {
              n: '03', title: 'DISTRIBUTED WITHIN 1H',
              body: 'Allocations are computed and ETH is distributed on-chain within 1 hour of the snapshot. Each distribution links to a verifiable transaction.',
            },
          ].map(s => (
            <div key={s.n} className="flex flex-col gap-2">
              <div className="text-[8px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>/ {s.n} /</div>
              <div className="font-bold" style={{ color: 'var(--out-ink)' }}>{s.title}</div>
              <div className="leading-relaxed" style={{ color: 'var(--out-text)' }}>{s.body}</div>
            </div>
          ))}
        </div>
      </Sheet>

    </div>
  );
}
