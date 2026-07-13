import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGetToken, useGetTokenTrades } from '@workspace/api-client-react';
import { useAccount } from 'wagmi';
import { Sheet } from '@/components/Sheet';
import { PriceChart } from '@/components/PriceChart';
import { getExplorerUrl } from '@/lib/chains';
import type { Time } from 'lightweight-charts';

const GRADUATION_THRESHOLD = 42000;

export default function TokenDetail() {
  const { address } = useParams<{ address: string }>();
  const { address: walletAddress } = useAccount();
  const navigate = useNavigate();
  const explorerBase = getExplorerUrl();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: token, isLoading } = useGetToken(address ?? '', {
    query: { enabled: !!address, refetchInterval: 30_000 } as any,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: trades } = useGetTokenTrades(address ?? '', {
    query: { enabled: !!address, refetchInterval: 20_000 } as any,
  });

  const isCreator = walletAddress && token?.creator?.toLowerCase() === walletAddress.toLowerCase();

  // Build chart data from trades (time-series price)
  const chartData = useMemo(() => {
    if (!trades || trades.length === 0) return [];
    return [...trades]
      .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
      .map(t => ({
        time: Math.floor(new Date(t.ts).getTime() / 1000) as Time,
        value: parseFloat(t.virtualAmount) / parseFloat(t.tokenAmount || '1'),
      }))
      .filter(d => isFinite(d.value) && d.value > 0);
  }, [trades]);

  if (isLoading) {
    return (
      <div className="pt-20 px-4 font-mono text-[var(--out-muted)] uppercase text-xs text-center">
        LOADING TOKEN DATA...
      </div>
    );
  }

  if (!token) {
    return (
      <div className="pt-20 px-4 font-mono text-[var(--out-muted)] uppercase text-xs text-center">
        TOKEN NOT FOUND
        <br />
        <button onClick={() => navigate('/')} className="mt-4 text-[var(--out-ink)] underline decoration-dotted">
          ← RETURN TO FACTORY
        </button>
      </div>
    );
  }

  const curvePercent = Math.min(token.curveProgress ?? 0, 100);
  const raisedNum = parseFloat(token.raisedVirtual ?? '0');

  return (
    <main className="pt-14 min-h-screen px-4 py-6 max-w-[1200px] mx-auto space-y-6"
      style={{ background: 'var(--out-bg)' }}>

      {/* Back */}
      <button
        onClick={() => navigate('/')}
        className="font-mono text-[10px] text-[var(--out-muted)] uppercase tracking-widest hover:text-[var(--out-ink)] transition-colors"
      >
        ← PRODUCTION FLOOR
      </button>

      {/* Identity */}
      <Sheet dwgNo="OUT-TKN-01">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="font-mono text-[var(--out-ink)] text-2xl font-bold">${token.ticker}</span>
              <span className="font-mono text-[var(--out-text)] text-xl">{token.name}</span>
              {isCreator && (
                <span className="border border-[var(--out-ink)] text-[var(--out-ink)] text-[9px] font-mono uppercase px-2 py-0.5">
                  YOU
                </span>
              )}
              <span className={`border text-[9px] font-mono uppercase px-2 py-0.5 ${
                token.phase === 'GRADUATED'
                  ? 'border-[var(--out-ink)] text-[var(--out-ink)]'
                  : 'border-[var(--out-ink-dim)] text-[var(--out-muted)]'
              }`}>
                {token.phase}
              </span>
            </div>
            <div className="font-mono text-[10px] text-[var(--out-muted)] uppercase tracking-widest">
              CREATOR&nbsp;
              <span className="text-[var(--out-text)]">{token.creator}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <a
              href={`https://app.virtuals.io/token/${address}`}
              target="_blank"
              rel="noreferrer"
              className="border border-[var(--out-ink)] text-[var(--out-ink)] font-mono text-[10px] px-3 py-1.5 uppercase tracking-widest hover:bg-[var(--out-ink)] hover:text-black transition-colors"
            >
              OPEN ON VIRTUALS ↗
            </a>
            <a
              href={`${explorerBase}/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="border border-[var(--out-ink-dim)] text-[var(--out-muted)] font-mono text-[10px] px-3 py-1.5 uppercase tracking-widest hover:text-[var(--out-ink)] hover:border-[var(--out-ink)] transition-colors"
            >
              BLOCKSCOUT ↗
            </a>
          </div>
        </div>
      </Sheet>

      {/* Price chart */}
      <Sheet dwgNo="OUT-TKN-02" figCaption="FIG. 02 — PRICE / BONDING CURVE ($VIRTUAL)">
        {chartData.length > 1 ? (
          <PriceChart data={chartData} className="w-full h-64" />
        ) : (
          <div className="h-48 flex items-center justify-center font-mono text-[10px] text-[var(--out-muted)] uppercase tracking-widest">
            INSUFFICIENT TRADE DATA — CHART PENDING
          </div>
        )}
      </Sheet>

      {/* Stats grid */}
      <Sheet dwgNo="OUT-TKN-03">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
          {[
            ['PRICE ($VIRTUAL)', token.lastPriceVirtual ? parseFloat(token.lastPriceVirtual).toFixed(6) : '—'],
            ['RAISED ($VIRTUAL)', raisedNum > 0 ? raisedNum.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'],
            ['VOLUME 24H', token.volume24h ?? '—'],
            ['HOLDERS', (token.holders ?? 0).toString()],
          ].map(([label, val]) => (
            <div key={label}>
              <div className="text-[var(--out-muted)] text-[9px] uppercase tracking-widest mb-1">{label}</div>
              <div className="text-[var(--out-text)] text-sm font-bold">{val}</div>
            </div>
          ))}
        </div>

        {/* Curve progress ruler */}
        <div className="mt-4">
          <div className="flex justify-between font-mono text-[9px] text-[var(--out-muted)] uppercase mb-1">
            <span>BONDING CURVE</span>
            <span>{curvePercent.toFixed(1)}% OF 42,000 $VIRTUAL</span>
          </div>
          <div className="w-full h-3 border border-[var(--out-ink-dim)] bg-[var(--out-bg)] relative overflow-hidden">
            <div
              className="h-full transition-all"
              style={{ width: `${curvePercent}%`, background: 'var(--out-ink)' }}
            />
            {/* 42k tick mark */}
            <div className="absolute top-0 right-0 h-full w-px bg-[var(--out-ink-dim)]" />
          </div>
          <div className="flex justify-between font-mono text-[9px] text-[var(--out-muted)] mt-0.5">
            <span>0</span>
            <span>42,000 $VIRTUAL → UNISWAP LP / LOCKED 10Y</span>
          </div>
        </div>
      </Sheet>

      {/* Creator fees */}
      <Sheet dwgNo="OUT-TKN-04" figCaption="CREATOR FEES">
        <div className="font-mono text-[10px] text-[var(--out-warn)] uppercase tracking-widest">
          AWAITING CONTRACT CALIBRATION — fee reads unavailable with stub ABI.
          Check{' '}
          <a href="https://app.virtuals.io" target="_blank" rel="noreferrer"
            className="underline decoration-dotted hover:text-[var(--out-ink)]">
            app.virtuals.io ↗
          </a>
          {' '}for your creator fee claims.
        </div>
      </Sheet>

      {/* Trade log */}
      <Sheet dwgNo="OUT-TKN-05" figCaption="RECENT TRADES">
        {!trades || trades.length === 0 ? (
          <div className="font-mono text-[10px] text-[var(--out-muted)] uppercase text-center py-6">
            NO TRADE DATA YET
          </div>
        ) : (
          <table className="w-full font-mono text-[10px]">
            <thead>
              <tr className="text-[var(--out-muted)] uppercase tracking-widest">
                <th className="text-left pb-2">SIDE</th>
                <th className="text-right pb-2">$VIRTUAL</th>
                <th className="text-right pb-2">TOKENS</th>
                <th className="text-left pb-2 hidden sm:table-cell">TRADER</th>
                <th className="text-right pb-2">TIME</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 30).map(trade => (
                <tr key={trade.id}
                  className="border-t border-[var(--out-grid-major)]">
                  <td className={`py-1 font-bold ${trade.side === 'buy' ? 'text-[var(--out-up)]' : 'text-[var(--out-down)]'}`}>
                    {trade.side.toUpperCase()}
                  </td>
                  <td className="py-1 text-right text-[var(--out-text)]">
                    {parseFloat(trade.virtualAmount).toFixed(2)}
                  </td>
                  <td className="py-1 text-right text-[var(--out-text)]">
                    {parseFloat(trade.tokenAmount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-1 hidden sm:table-cell text-[var(--out-muted)]">
                    {trade.trader.slice(0, 8)}…
                  </td>
                  <td className="py-1 text-right text-[var(--out-muted)]">
                    {new Date(trade.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sheet>
    </main>
  );
}
