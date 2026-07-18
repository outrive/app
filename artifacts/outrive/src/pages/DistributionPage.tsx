/**
 * DistributionPage — OUTRIVE protocol fee distribution terminal
 * Redesigned for spacious UX: hero open / stat cards tall / tables wide.
 */

import React, { useEffect, useState } from 'react';
import { useQuery }    from '@tanstack/react-query';
import { useAccount }  from 'wagmi';
import { ExternalLink, Zap, TrendingUp, DollarSign } from 'lucide-react';
import { Sheet } from '@/components/Sheet';

/* ── env / helpers ─────────────────────────────────────────────────────── */
const BASE_URL = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
const apiUrl   = (p: string) => BASE_URL + p;
const EXPLORER = 'https://robinhoodchain.blockscout.com';
const MONO     = { fontFamily: 'JetBrains Mono, monospace' };

function fmtUsd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtEth(n: number) {
  return n >= 0.0001 ? `${n.toFixed(4)} ETH` : `${n.toFixed(6)} ETH`;
}
function fmtDate(d: string | Date) {
  const dt = new Date(d);
  return (
    dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }) +
    ' UTC · ' +
    dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  );
}
function fmtDay(d: string | Date) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function fmtCountdown(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function shortWallet(w: string) { return w ? `${w.slice(0,6)}…${w.slice(-4)}` : '—'; }
function txUrl(h: string)       { return `${EXPLORER}/tx/${h}`; }
function logoUrl(a: string)     { return apiUrl(`/api/rwa/logo/${a}`); }

/* ── types ─────────────────────────────────────────────────────────────── */
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
interface NextResp  { secondsUntil: number; nextAt: string; estimatedPoolUsd: number; }
interface FeeAct    { time: string; walletAddress: string; symbol: string; feeUsd: number; feeEth: number; txHash: string | null; }
interface AllocResp {
  wallet: string;
  allocations: { epochStart: string; epochEnd: string; volumeUsd: number; shareBps: number; amountUsd: number; amountEth: string; status: string; claimable: boolean; }[];
  totalClaimableUsd: number;
}

/* ── BarChart ──────────────────────────────────────────────────────────── */
// Deterministic skeleton heights — no Math.random() in render (breaks React StrictMode).
const SKELETON_HEIGHTS = [18,32,12,44,28,8,52,36,20,60,40,16,48,24,56,10,38,26,50,14];

function BarChart({ data, H = 80 }: { data: number[]; H?: number }) {
  const W = 5, G = 3;
  if (data.length === 0) {
    return (
      <div className="flex items-end opacity-[0.12]" style={{ height: H }}>
        {SKELETON_HEIGHTS.map((h, i) => (
          <div key={i} style={{
            width: W, marginRight: G, flexShrink: 0,
            height: Math.round((h / 60) * H),
            background: 'var(--out-ink)', borderRadius: 1,
          }} />
        ))}
      </div>
    );
  }
  const max = Math.max(...data, 0.000001);
  const totalW = data.length * (W + G) - G;
  return (
    <svg width={totalW} height={H} style={{ display: 'block' }}>
      {data.map((v, i) => {
        const barH = Math.max(3, (v / max) * H);
        return <rect key={i} x={i*(W+G)} y={H-barH} width={W} height={barH} fill="var(--out-ink)" opacity={0.85} rx={1.5} />;
      })}
    </svg>
  );
}

/* ── LiveCountdown ─────────────────────────────────────────────────────── */
function LiveCountdown({ initialSecs }: { initialSecs: number }) {
  const [secs, setSecs] = useState(initialSecs);
  useEffect(() => {
    setSecs(initialSecs);
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [initialSecs]);
  return <span style={MONO}>{fmtCountdown(secs)}</span>;
}

/* ── SymbolPill ────────────────────────────────────────────────────────── */
function SymbolPill({ symbol, volUsd, tokenAddress }: { symbol: string; volUsd: number; tokenAddress: string }) {
  const [err, setErr] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 mr-1 mb-1"
      style={{ border: '1px solid var(--out-ink-dim)', borderRadius: 2 }}>
      {!err
        ? <img src={logoUrl(tokenAddress)} alt={symbol} onError={() => setErr(true)} className="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
        : <span className="w-3.5 h-3.5 rounded-full shrink-0 inline-flex items-center justify-center text-[7px] font-bold"
            style={{ background: '#1a2a0a', color: 'var(--out-ink)' }}>{symbol[0]}</span>
      }
      <span className="text-[10px] font-bold" style={{ color: 'var(--out-ink)', ...MONO }}>{symbol}</span>
      <span className="text-[10px]" style={{ color: 'var(--out-muted)', ...MONO }}>{fmtUsd(volUsd)}</span>
    </span>
  );
}

/* ── StatCard ──────────────────────────────────────────────────────────── */
function StatCard({ idx, label, unit, value, sub, valueSub, chart }:
  { idx: string; label: string; unit: string; value: string; sub?: string; valueSub?: string; chart: number[] }) {
  return (
    <div className="flex flex-col justify-between p-6 sm:p-8 min-h-[200px]"
      style={{ border: '1px solid var(--out-ink-dim)', background: 'var(--out-bg-sheet)' }}>

      {/* label */}
      <div className="text-[9px] uppercase tracking-[0.14em] mb-5" style={{ color: 'var(--out-muted)', ...MONO }}>
        / {idx} / {label}, {unit}
      </div>

      {/* value */}
      <div className="mb-auto">
        <div className="text-3xl sm:text-4xl font-bold leading-none mb-1" style={{ color: 'var(--out-ink)', ...MONO }}>
          {value}
          {valueSub && (
            <span className="text-sm font-normal ml-2" style={{ color: 'var(--out-muted)' }}>{valueSub}</span>
          )}
        </div>
        {sub && (
          <div className="text-[10px] uppercase tracking-widest mt-2" style={{ color: 'var(--out-muted)', ...MONO }}>{sub}</div>
        )}
      </div>

      {/* chart row */}
      <div className="flex items-end justify-between mt-6 pt-4"
        style={{ borderTop: '1px solid var(--out-ink-dim)' }}>
        <div className="overflow-hidden" style={{ maxWidth: 'calc(100% - 56px)' }}>
          <BarChart data={chart} H={72} />
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
          <span className="text-[8px] uppercase tracking-widest" style={{ color: 'var(--out-muted)', ...MONO }}>LAUNCH</span>
          <div className="w-8 border-t" style={{ borderColor: 'var(--out-ink-dim)' }} />
          <span className="text-[8px] uppercase tracking-widest" style={{ color: 'var(--out-muted)', ...MONO }}>NOW</span>
        </div>
      </div>
    </div>
  );
}

/* ── DwgBar (standalone engineering header) ────────────────────────────── */
function DwgBar({ dwgNo }: { dwgNo: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2"
      style={{ borderBottom: '1px solid var(--out-ink)', background: 'var(--out-bg-sheet)' }}>
      <span className="text-[10px] tracking-[0.08em] uppercase" style={{ color: 'var(--out-ink)', ...MONO }}>
        DWG NO. {dwgNo} &nbsp;&nbsp; SHEET 1/1 &nbsp;&nbsp; SCALE 1:1
      </span>
      <span className="text-[10px] tracking-[0.08em] uppercase" style={{ color: 'var(--out-ink)', ...MONO }}>REV. A</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
export function DistributionPage() {
  const { address } = useAccount();

  const { data: stats, isLoading: loadingStats } = useQuery<StatsResp>({
    queryKey: ['dist-stats'],
    queryFn:  () => fetch(apiUrl('/api/distributions/stats')).then(r => r.json()),
    refetchInterval: 30_000, staleTime: 20_000,
  });
  const { data: eventsData, isLoading: loadingEvents } = useQuery<{ events: EventResp[]; total: number }>({
    queryKey: ['dist-events'],
    queryFn:  () => fetch(apiUrl('/api/distributions')).then(r => r.json()),
    refetchInterval: 60_000, staleTime: 30_000,
  });
  const { data: nextData } = useQuery<NextResp>({
    queryKey: ['dist-next'],
    queryFn:  () => fetch(apiUrl('/api/distributions/next')).then(r => r.json()),
    refetchInterval: 10_000, staleTime: 5_000,
  });
  const { data: feeData } = useQuery<{ activities: FeeAct[] }>({
    queryKey: ['dist-fee-activity'],
    queryFn:  () => fetch(apiUrl('/api/distributions/fee-activity')).then(r => r.json()),
    refetchInterval: 20_000, staleTime: 10_000,
  });
  const { data: allocData } = useQuery<AllocResp>({
    queryKey: ['dist-alloc', address],
    queryFn:  () => fetch(apiUrl(`/api/distributions/allocation/${address}`)).then(r => r.json()),
    enabled: !!address, refetchInterval: 60_000, staleTime: 30_000,
  });

  const events     = eventsData?.events ?? [];
  const activities = feeData?.activities ?? [];
  const chart      = stats?.chart ?? [];

  const cumulChart = (() => { let r = 0; return chart.map(d => { r += d.feesUsd; return r; }); })();
  const ethChart   = chart.map(d => d.feesEth);
  const wChart     = chart.map(d => d.wallets);

  /* ── render ── */
  return (
    <div className="flex flex-col gap-6 pb-16">

      {/* ════ HERO — no outer Sheet, free-breathing ════════════════════════ */}
      <div style={{ border: '1px solid var(--out-ink)', background: 'var(--out-bg-sheet)' }}>
        <DwgBar dwgNo="OUT-DST-01" />

        <div className="px-6 sm:px-10 pt-8 pb-10">
          {/* breadcrumb */}
          <div className="text-[9px] uppercase tracking-[0.16em] mb-6" style={{ color: 'var(--out-muted)', ...MONO }}>
            / ACTIVITY / DISTRIBUTIONS /
          </div>

          {/* title + countdown */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            <div>
              <h1 className="font-bold leading-[1.1] mb-3"
                style={{ color: 'var(--out-ink)', ...MONO, fontSize: 'clamp(28px, 4vw, 52px)' }}>
                Protocol revenue and<br />distribution history.
              </h1>
              <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--out-muted)', ...MONO }}>
                0.3% of every confirmed RWA trade · distributed proportionally to traders.
              </p>
            </div>

            {/* countdown box */}
            {nextData && (
              <div className="shrink-0 flex flex-col items-end gap-2 px-6 py-5 sm:px-8 sm:py-6"
                style={{ border: '1px solid var(--out-ink)', background: '#060c05', minWidth: 200 }}>
                <div className="text-[9px] uppercase tracking-[0.14em]" style={{ color: 'var(--out-muted)', ...MONO }}>
                  NEXT DISTRIBUTION IN
                </div>
                <div className="text-3xl sm:text-4xl font-bold tabular-nums" style={{ color: 'var(--out-ink)', ...MONO }}>
                  <LiveCountdown initialSecs={nextData.secondsUntil} />
                </div>
                {nextData.estimatedPoolUsd > 0 && (
                  <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--out-muted)', ...MONO }}>
                    EST. POOL {fmtUsd(nextData.estimatedPoolUsd)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════ STAT CARDS — standalone 3-col, tall ═══════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          idx="01" label="CUMULATIVE DISTRIBUTED" unit="USD"
          value={loadingStats ? '—' : fmtUsd(stats?.cumulativeUsd ?? 0)}
          sub={stats?.totalEvents ? `${stats.totalEvents} EPOCHS COMPLETED` : 'AWAITING FIRST EPOCH'}
          chart={cumulChart}
        />
        <StatCard
          idx="02" label="FEES COLLECTED" unit="ETH / DAY"
          value={loadingStats ? '—' : fmtEth(stats?.todayFeesEth ?? 0)}
          valueSub={stats ? fmtUsd(stats.todayFeesUsd) : undefined}
          sub="TODAY"
          chart={ethChart}
        />
        <StatCard
          idx="03" label="WALLETS" unit="ELIGIBLE"
          value={loadingStats ? '—' : (stats?.totalEligible ?? 0).toLocaleString()}
          sub={`${stats?.todayWallets ?? 0} ACTIVE TODAY`}
          chart={wChart}
        />
      </div>

      {/* ════ YOUR ALLOCATION ═══════════════════════════════════════════════ */}
      {address && allocData && allocData.allocations.length > 0 && (
        <Sheet dwgNo="OUT-DST-02">
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <Zap size={13} color="var(--out-ink)" />
            <span className="text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: 'var(--out-ink)', ...MONO }}>
              YOUR ALLOCATION — {shortWallet(address)}
            </span>
            {allocData.totalClaimableUsd > 0 && (
              <span className="ml-auto text-[10px] font-bold px-3 py-1"
                style={{ color: 'var(--out-ink)', border: '1px solid var(--out-ink)', background: '#0d160b', ...MONO }}>
                {fmtUsd(allocData.totalClaimableUsd)} EARNED
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]" style={MONO}>
              <thead>
                <tr style={{ color: 'var(--out-muted)', borderBottom: '1px solid var(--out-ink-dim)' }}>
                  {['EPOCH', 'YOUR VOLUME', 'SHARE', 'EARNED', 'STATUS'].map(h => (
                    <th key={h} className="text-left pb-3 pr-6 font-normal uppercase tracking-widest last:pr-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allocData.allocations.slice(0, 10).map((a, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #0e120d' }} className="hover:bg-[#0c110b] transition-colors">
                    <td className="py-3 pr-6" style={{ color: 'var(--out-text)' }}>{fmtDay(a.epochStart)}</td>
                    <td className="py-3 pr-6 font-bold" style={{ color: 'var(--out-ink)' }}>{fmtUsd(a.volumeUsd)}</td>
                    <td className="py-3 pr-6" style={{ color: 'var(--out-text)' }}>{(a.shareBps / 100).toFixed(2)}%</td>
                    <td className="py-3 pr-6" style={{ color: 'var(--out-ink)' }}>
                      {fmtUsd(a.amountUsd)}
                      <span className="ml-2 text-[9px] opacity-50">{a.amountEth} ETH</span>
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-1 text-[9px] uppercase tracking-widest"
                        style={{
                          border: `1px solid ${a.status === 'distributed' ? 'var(--out-ink-dim)' : '#e09020'}`,
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

      {/* ════ HISTORY + ACTIVITY two-column ══════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Distribution history — 3/5 */}
        <div className="lg:col-span-3">
          <Sheet dwgNo="OUT-DST-03">
            <div className="flex items-center gap-3 mb-5">
              <TrendingUp size={13} color="var(--out-ink)" />
              <span className="text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: 'var(--out-ink)', ...MONO }}>
                Distribution history
              </span>
              <span className="ml-auto text-[10px]" style={{ color: 'var(--out-muted)', ...MONO }}>
                {eventsData?.total ?? 0} EPOCHS
              </span>
            </div>

            {loadingEvents && (
              <div className="py-16 text-center text-[10px] uppercase tracking-widest" style={{ color: 'var(--out-muted)', ...MONO }}>
                LOADING EPOCHS…
              </div>
            )}

            {events.length === 0 && !loadingEvents && (
              <div className="py-16 flex flex-col items-center gap-3">
                <div className="text-[10px] uppercase tracking-[0.14em] text-center" style={{ color: 'var(--out-muted)', ...MONO }}>
                  NO DISTRIBUTION EPOCHS YET
                </div>
                <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)', ...MONO }}>
                  FIRST EPOCH RUNS AT MIDNIGHT UTC
                </div>
              </div>
            )}

            {events.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]" style={MONO}>
                  <thead>
                    <tr style={{ color: 'var(--out-muted)', borderBottom: '1px solid var(--out-ink-dim)' }}>
                      <th className="text-left pb-3 pr-6 font-normal uppercase tracking-widest whitespace-nowrap">TIME</th>
                      <th className="text-left pb-3 pr-6 font-normal uppercase tracking-widest">ASSETS DISTRIBUTED</th>
                      <th className="text-left pb-3 pr-4 font-normal uppercase tracking-widest">WALLETS</th>
                      <th className="text-left pb-3 font-normal uppercase tracking-widest">TX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map(ev => (
                      <tr key={ev.id} style={{ borderBottom: '1px solid #0e120d' }} className="hover:bg-[#0c110b] transition-colors">
                        <td className="py-3 pr-6 whitespace-nowrap align-top" style={{ color: 'var(--out-muted)' }}>
                          {fmtDate(ev.epochStart)}
                        </td>
                        <td className="py-3 pr-6 align-top">
                          <div className="flex flex-wrap mb-1.5">
                            {ev.topSymbols.map(s => <SymbolPill key={s.symbol} {...s} />)}
                            {ev.topSymbols.length === 0 && <span style={{ color: 'var(--out-muted)' }}>—</span>}
                          </div>
                          <div className="text-[9px]" style={{ color: 'var(--out-muted)' }}>
                            {fmtEth(ev.totalFeesEth)} distributed · {fmtUsd(ev.totalFeesUsd)}
                          </div>
                        </td>
                        <td className="py-3 pr-4 align-top" style={{ color: 'var(--out-text)' }}>
                          {ev.eligibleWallets.toLocaleString()}
                        </td>
                        <td className="py-3 align-top">
                          {ev.txHash
                            ? <a href={txUrl(ev.txHash)} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
                                style={{ color: 'var(--out-ink)' }}>
                                <ExternalLink size={11} />
                              </a>
                            : <span className="text-[9px] px-1.5 py-0.5"
                                style={{ border: '1px solid #e0902040', color: '#e09020', ...MONO }}>
                                {ev.status === 'pending' ? 'PENDING' : '—'}
                              </span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Sheet>
        </div>

        {/* Fee activity — 2/5 */}
        <div className="lg:col-span-2">
          <Sheet dwgNo="OUT-DST-04">
            <div className="flex items-center gap-3 mb-5">
              <DollarSign size={13} color="var(--out-ink)" />
              <span className="text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: 'var(--out-ink)', ...MONO }}>
                Fee collection activity
              </span>
            </div>

            {activities.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--out-muted)', ...MONO }}>
                  NO ACTIVITY YET
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]" style={MONO}>
                  <thead>
                    <tr style={{ color: 'var(--out-muted)', borderBottom: '1px solid var(--out-ink-dim)' }}>
                      <th className="text-left pb-3 pr-5 font-normal uppercase tracking-widest whitespace-nowrap">TIME</th>
                      <th className="text-left pb-3 pr-4 font-normal uppercase tracking-widest">ETH FEE</th>
                      <th className="text-left pb-3 font-normal uppercase tracking-widest">TX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((a, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #0e120d' }} className="hover:bg-[#0c110b] transition-colors">
                        <td className="py-3 pr-5 whitespace-nowrap align-top" style={{ color: 'var(--out-muted)' }}>
                          {fmtDate(a.time)}
                        </td>
                        <td className="py-3 pr-4 align-top">
                          <div className="font-bold" style={{ color: 'var(--out-ink)' }}>{fmtEth(a.feeEth)}</div>
                          <div className="text-[9px] mt-0.5" style={{ color: 'var(--out-muted)' }}>
                            {a.symbol} · {fmtUsd(a.feeUsd)}
                          </div>
                        </td>
                        <td className="py-3 align-top">
                          {a.txHash
                            ? <a href={txUrl(a.txHash)} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center opacity-60 hover:opacity-100 transition-opacity"
                                style={{ color: 'var(--out-ink)' }}>
                                <ExternalLink size={11} />
                              </a>
                            : <span style={{ color: 'var(--out-muted)' }}>—</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Sheet>
        </div>
      </div>

      {/* ════ HOW IT WORKS ══════════════════════════════════════════════════ */}
      <Sheet dwgNo="OUT-DST-05">
        <div className="text-[11px] uppercase tracking-[0.14em] font-bold mb-8" style={{ color: 'var(--out-ink)', ...MONO }}>
          HOW DISTRIBUTION WORKS
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            { n: '01', title: 'FEES COLLECTED',
              body: 'Every confirmed RWA trade incurs a 0.3% protocol fee collected on-chain. Fees accumulate in real-time throughout each 24-hour epoch.' },
            { n: '02', title: 'SNAPSHOT AT MIDNIGHT UTC',
              body: "At epoch close (00:00 UTC), a snapshot records each wallet's trading volume. Your share is proportional to your volume in the epoch." },
            { n: '03', title: 'DISTRIBUTED WITHIN 1H',
              body: 'Allocations are computed and ETH is distributed on-chain within 1 hour of the snapshot. Each distribution links to a verifiable transaction.' },
          ].map(s => (
            <div key={s.n} className="flex flex-col gap-3">
              <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: 'var(--out-muted)', ...MONO }}>/ {s.n} /</div>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--out-ink)', ...MONO }}>{s.title}</div>
              <div className="text-[11px] leading-relaxed" style={{ color: 'var(--out-text)', ...MONO }}>{s.body}</div>
            </div>
          ))}
        </div>
      </Sheet>

    </div>
  );
}
