import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

interface Trade {
  id: number;
  tokenAddress: string;
  trader: string;
  side: string;
  virtualAmount: string;
  tokenAmount: string;
  txHash: string;
  blockNumber: number;
  ts: string;
}

interface MarketToken {
  address: string;
  ticker: string;
  name: string;
  lastPriceVirtual: string | null;
  phase: string;
}

interface LaunchSuccessPanelProps {
  name: string;
  ticker: string;
  txHash: `0x${string}`;
  explorerBase: string;
  onDismiss: () => void;
}

export function LaunchSuccessPanel({ name, ticker, txHash, explorerBase, onDismiss }: LaunchSuccessPanelProps) {
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [indexPhase, setIndexPhase] = useState<'indexing' | 'found'>('indexing');

  const baseUrl = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

  /* ── Poll market index until the token appears ── */
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const res = await fetch(`${baseUrl}/api/market/tokens?tab=newest&limit=100`);
        if (!res.ok) return;
        const tokens: MarketToken[] = await res.json();
        const found = tokens.find(t => t.ticker.toUpperCase() === ticker.toUpperCase());
        if (found?.address && active) {
          setTokenAddress(found.address);
          setIndexPhase('found');
        }
      } catch { /* retry next tick */ }
    };
    check();
    const t = setInterval(check, 10_000);
    return () => { active = false; clearInterval(t); };
  }, [ticker, baseUrl]);

  /* ── Poll trades once token address is known ── */
  useEffect(() => {
    if (!tokenAddress) return;
    let active = true;
    const fetchTrades = async () => {
      try {
        const res = await fetch(`${baseUrl}/api/market/trades/${tokenAddress}`);
        if (!res.ok) return;
        const data: Trade[] = await res.json();
        if (active) setTrades([...data].reverse()); // oldest→newest for chart
      } catch { /* retry */ }
    };
    fetchTrades();
    const t = setInterval(fetchTrades, 10_000);
    return () => { active = false; clearInterval(t); };
  }, [tokenAddress, baseUrl]);

  /* ── Chart: price = $VIRTUAL per token ── */
  const chartData = trades
    .filter(t => Number(t.tokenAmount) > 0 && Number(t.virtualAmount) > 0)
    .map(t => ({
      time: new Date(t.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      price: Number(t.virtualAmount) / Number(t.tokenAmount),
    }));

  const latestPrice = chartData.length > 0
    ? chartData[chartData.length - 1].price.toFixed(6)
    : null;

  return (
    <div className="my-4 border border-[var(--out-ink)] bg-[#060c06] p-4 font-mono text-xs w-full">

      {/* ── Header ── */}
      <div className="border-b border-[var(--out-ink)] pb-2 mb-4 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
        <span className="text-[var(--out-ink)] uppercase tracking-[0.12em] font-bold text-[10px] sm:text-[11px]">
          ✓ COMMISSIONED ON-CHAIN — {name}&nbsp;(${ticker})
        </span>
        <button
          onClick={onDismiss}
          className="sm:ml-auto text-[var(--out-muted)] hover:text-[var(--out-ink)] text-[10px] tracking-widest uppercase transition-colors text-left"
        >
          DISMISS ×
        </button>
      </div>

      {/* ── Quick links ── */}
      <div className="flex flex-wrap gap-4 mb-4">
        <a
          href={`${explorerBase}/tx/${txHash}`}
          target="_blank" rel="noreferrer"
          className="text-[var(--out-ink-dim)] hover:text-[var(--out-ink)] underline decoration-dotted underline-offset-4 text-[10px] transition-colors"
        >
          VIEW TX ON BLOCKSCOUT ↗
        </a>
        {tokenAddress && (
          <a
            href={`${explorerBase}/token/${tokenAddress}`}
            target="_blank" rel="noreferrer"
            className="text-[var(--out-ink-dim)] hover:text-[var(--out-ink)] underline decoration-dotted underline-offset-4 text-[10px] transition-colors"
          >
            VIEW TOKEN CONTRACT ↗
          </a>
        )}
        <a
          href="https://app.virtuals.io"
          target="_blank" rel="noreferrer"
          className="text-[var(--out-ink-dim)] hover:text-[var(--out-ink)] underline decoration-dotted underline-offset-4 text-[10px] transition-colors"
        >
          SET UP AGENT ON VIRTUALS ↗
        </a>
      </div>

      {/* ── Realtime chart panel ── */}
      <div className="border border-[var(--out-grid-major)]" style={{ background: '#040904' }}>
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--out-grid-major)]">
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
            ${ticker} / $VIRTUAL — REALTIME PRICE
          </span>
          <div className="flex items-center gap-3">
            {latestPrice && (
              <span className="text-[9px] font-bold" style={{ color: 'var(--out-ink)' }}>
                {latestPrice} $V
              </span>
            )}
            <span
              className="text-[9px]"
              style={{ color: indexPhase === 'indexing' ? 'var(--out-warn)' : 'var(--out-ink)' }}
            >
              {indexPhase === 'indexing' ? '● INDEXING…' : `● ${trades.length} TRADES`}
            </span>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="h-28 flex flex-col items-center justify-center gap-2">
            <div className="text-[10px] animate-pulse" style={{ color: 'var(--out-muted)' }}>
              {indexPhase === 'indexing'
                ? 'Waiting for indexer to pick up token…'
                : 'Awaiting first trade on the bonding curve…'}
            </div>
            <div className="text-[9px]" style={{ color: 'var(--out-ink-dim)' }}>
              Auto-refreshing every 10 seconds
            </div>
          </div>
        ) : (
          <div className="h-40 px-1 py-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 7, fill: 'var(--out-muted)', fontFamily: 'JetBrains Mono, monospace' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--out-grid-major)' }}
                />
                <YAxis
                  tick={{ fontSize: 7, fill: 'var(--out-muted)', fontFamily: 'JetBrains Mono, monospace' }}
                  tickLine={false}
                  axisLine={false}
                  width={62}
                  tickFormatter={(v: number) => v.toFixed(5)}
                />
                <Tooltip
                  contentStyle={{
                    background: '#060c06',
                    border: '1px solid var(--out-ink)',
                    borderRadius: 0,
                    fontSize: 9,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                  labelStyle={{ color: 'var(--out-muted)' }}
                  itemStyle={{ color: 'var(--out-ink)' }}
                  formatter={(val: number) => [`${val.toFixed(6)} $V`, 'PRICE']}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="var(--out-ink)"
                  dot={false}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-2 text-[9px]" style={{ color: 'var(--out-muted)' }}>
        On-chain launch complete. Configure agent personality, runtime &amp; socials on app.virtuals.io.
      </div>
    </div>
  );
}
