import React, { useState } from 'react';
import {
  TrendingUp, TrendingDown, ChevronRight, Settings2,
  RefreshCw, CheckCircle2,
} from 'lucide-react';

/* ── RWA token catalogue (Robinhood Chain ERC-20 stock tokens) ──────────── */
type RwaToken = {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  address: string;
  sector: string;
};

const RWA_TOKENS: RwaToken[] = [
  { symbol: 'AAPL',  name: 'Apple Inc.',          price: 211.45, change24h:  1.23, address: '0xAAPL', sector: 'Tech'      },
  { symbol: 'NVDA',  name: 'NVIDIA Corp.',         price: 138.92, change24h:  3.41, address: '0xNVDA', sector: 'Tech'      },
  { symbol: 'AMZN',  name: 'Amazon.com Inc.',      price: 198.17, change24h: -0.87, address: '0xAMZN', sector: 'Consumer'  },
  { symbol: 'GOOGL', name: 'Alphabet Inc.',        price: 178.34, change24h:  0.55, address: '0xGOOGL',sector: 'Tech'      },
  { symbol: 'META',  name: 'Meta Platforms Inc.',  price: 632.80, change24h:  2.10, address: '0xMETA', sector: 'Tech'      },
  { symbol: 'MSFT',  name: 'Microsoft Corp.',      price: 449.62, change24h: -0.32, address: '0xMSFT', sector: 'Tech'      },
  { symbol: 'TSLA',  name: 'Tesla Inc.',           price: 287.50, change24h:  4.78, address: '0xTSLA', sector: 'Auto'      },
  { symbol: 'AMD',   name: 'Advanced Micro Devices',price: 162.30, change24h: -1.05, address: '0xAMD',  sector: 'Tech'      },
  { symbol: 'COIN',  name: 'Coinbase Global Inc.', price: 271.40, change24h:  5.22, address: '0xCOIN', sector: 'Finance'   },
  { symbol: 'NFLX',  name: 'Netflix Inc.',         price: 1048.10,change24h:  0.91, address: '0xNFLX', sector: 'Media'     },
  { symbol: 'SPY',   name: 'S&P 500 ETF',          price: 544.30, change24h:  0.40, address: '0xSPY',  sector: 'Index'     },
  { symbol: 'QQQ',   name: 'NASDAQ-100 ETF',       price: 481.90, change24h:  0.68, address: '0xQQQ',  sector: 'Index'     },
];

/* ── Agent parameter config type ─────────────────────────────────────────── */
type AgentConfig = {
  strategy: 'dca' | 'momentum' | 'rebalance';
  maxAllocationPct: number;
  tradeIntervalH: number;
  stopLossPct: number;
  takeProfitPct: number;
};

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  strategy: 'dca',
  maxAllocationPct: 20,
  tradeIntervalH: 24,
  stopLossPct: 5,
  takeProfitPct: 15,
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function fmt(n: number) {
  return n >= 1000
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toFixed(2);
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 font-mono text-[12px] uppercase tracking-widest border transition-colors"
      style={{
        borderColor: active ? 'var(--out-ink)' : 'var(--out-ink-dim)',
        color:       active ? 'var(--out-ink)' : 'var(--out-muted)',
        background:  active ? '#12180f' : 'transparent',
      }}
    >
      {label}
    </button>
  );
}

function SectorBadge({ sector }: { sector: string }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 border"
      style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
      {sector}
    </span>
  );
}

/* ── Token grid card ─────────────────────────────────────────────────────── */
function TokenCard({ token, selected, onClick }: { token: RwaToken; selected: boolean; onClick: () => void }) {
  const up = token.change24h >= 0;
  return (
    <button
      onClick={onClick}
      className="border p-3 text-left transition-all hover:border-[var(--out-ink)] font-mono w-full"
      style={{
        borderColor: selected ? 'var(--out-ink)' : 'var(--out-ink-dim)',
        background:  selected ? '#12180f' : 'transparent',
      }}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="text-[14px] font-bold" style={{ color: 'var(--out-text)' }}>{token.symbol}</span>
        <span className={`flex items-center gap-0.5 text-[11px]`}
          style={{ color: up ? 'var(--out-ink)' : 'var(--out-danger)' }}>
          {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {up ? '+' : ''}{token.change24h.toFixed(2)}%
        </span>
      </div>
      <div className="text-[13px] font-bold" style={{ color: 'var(--out-ink)' }}>${fmt(token.price)}</div>
      <div className="text-[11px] truncate mt-0.5" style={{ color: 'var(--out-muted)' }}>{token.name}</div>
    </button>
  );
}

/* ── Manual trade panel ──────────────────────────────────────────────────── */
function ManualTradePanel({ token }: { token: RwaToken }) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const usdValue = amount ? (parseFloat(amount) * token.price).toFixed(2) : null;

  function submit() {
    if (!amount || parseFloat(amount) <= 0) return;
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
    setAmount('');
  }

  return (
    <div className="border font-mono" style={{ borderColor: 'var(--out-ink-dim)', background: '#080d08' }}>
      {/* Token header */}
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--out-ink-dim)' }}>
        <div>
          <span className="text-[16px] font-bold" style={{ color: 'var(--out-text)' }}>{token.symbol}</span>
          <span className="ml-2 text-[13px]" style={{ color: 'var(--out-muted)' }}>{token.name}</span>
        </div>
        <div className="text-right">
          <div className="text-[18px] font-bold" style={{ color: 'var(--out-ink)' }}>${fmt(token.price)}</div>
          <div className="text-[11px]"
            style={{ color: token.change24h >= 0 ? 'var(--out-ink)' : 'var(--out-danger)' }}>
            {token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}% 24h
          </div>
        </div>
      </div>

      {/* Price feed note */}
      <div className="px-4 pt-3 pb-0 flex items-center gap-2 text-[11px]" style={{ color: 'var(--out-muted)' }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--out-ink)', boxShadow: '0 0 4px var(--out-ink)' }} />
        Chainlink price feed · Robinhood Chain
      </div>

      {/* Buy / Sell toggle */}
      <div className="px-4 pt-4 flex gap-2">
        <Pill label="BUY"  active={side === 'buy'}  onClick={() => setSide('buy')}  />
        <Pill label="SELL" active={side === 'sell'} onClick={() => setSide('sell')} />
      </div>

      {/* Amount input */}
      <div className="px-4 pt-4">
        <label className="text-[11px] uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--out-muted)' }}>
          Token Amount
        </label>
        <input
          type="number"
          min="0"
          placeholder="0.00"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="w-full bg-transparent border px-3 py-2.5 text-[14px] font-mono outline-none"
          style={{
            borderColor: 'var(--out-ink-dim)',
            color: 'var(--out-text)',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--out-ink)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--out-ink-dim)'}
        />
        {usdValue && (
          <div className="mt-1.5 text-[12px]" style={{ color: 'var(--out-muted)' }}>
            ≈ ${usdValue} USD
          </div>
        )}
      </div>


      {/* Action button */}
      <div className="px-4 pt-4 pb-4">
        {submitted ? (
          <div className="flex items-center gap-2 border px-4 py-3 text-[13px]"
            style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)', background: '#12180f' }}>
            <CheckCircle2 size={13} />
            Order submitted · awaiting on-chain confirmation
          </div>
        ) : (
          <button
            onClick={submit}
            className="w-full px-4 py-3 font-mono text-[13px] uppercase tracking-widest border transition-colors"
            style={{
              borderColor: side === 'buy' ? 'var(--out-ink)' : 'var(--out-danger)',
              color:       side === 'buy' ? 'var(--out-ink)' : 'var(--out-danger)',
              background: 'transparent',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = side === 'buy' ? '#12180f' : 'rgba(248,113,113,0.06)';
            }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {side === 'buy' ? '▲ BUY' : '▼ SELL'} {token.symbol}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Agent assist config panel ───────────────────────────────────────────── */
function AgentAssistPanel({ token }: { token: RwaToken }) {
  const [cfg, setCfg] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG);
  const [saved, setSaved]= useState(false);

  function save() { setSaved(true); setTimeout(() => setSaved(false), 2500); }

  const strategies = [
    { id: 'dca',       label: 'DCA',       desc: 'Dollar-cost average on fixed intervals' },
    { id: 'momentum',  label: 'MOMENTUM',  desc: 'Follow price momentum signals' },
    { id: 'rebalance', label: 'REBALANCE', desc: 'Keep allocation % within target range' },
  ] as const;

  return (
    <div className="border font-mono" style={{ borderColor: 'var(--out-ink-dim)', background: '#080d08' }}>
      <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--out-ink-dim)' }}>
        <Settings2 size={12} style={{ color: 'var(--out-ink)' }} />
        <span className="text-[13px] uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>
          Agent Config — {token.symbol}
        </span>
      </div>

      <div className="p-4 space-y-5">
        {/* Strategy */}
        <div>
          <div className="text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-muted)' }}>Strategy</div>
          <div className="grid grid-cols-3 gap-2">
            {strategies.map(s => (
              <button key={s.id}
                onClick={() => setCfg(c => ({ ...c, strategy: s.id }))}
                className="border px-2 py-2.5 text-center transition-colors"
                style={{
                  borderColor: cfg.strategy === s.id ? 'var(--out-ink)' : 'var(--out-ink-dim)',
                  color:       cfg.strategy === s.id ? 'var(--out-ink)' : 'var(--out-muted)',
                  background:  cfg.strategy === s.id ? '#12180f' : 'transparent',
                }}>
                <div className="text-[12px] font-bold">{s.label}</div>
                <div className="text-[10px] mt-1 leading-snug" style={{ color: 'var(--out-muted)' }}>{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Numeric params */}
        {[
          { key: 'maxAllocationPct' as const, label: 'Max Allocation', unit: '%',  min: 1,  max: 100 },
          { key: 'tradeIntervalH'   as const, label: 'Trade Interval', unit: 'h',  min: 1,  max: 168 },
          { key: 'stopLossPct'      as const, label: 'Stop Loss',      unit: '%',  min: 1,  max: 50  },
          { key: 'takeProfitPct'    as const, label: 'Take Profit',    unit: '%',  min: 1,  max: 200 },
        ].map(p => (
          <div key={p.key}>
            <div className="flex justify-between mb-1.5">
              <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>{p.label}</span>
              <span className="text-[13px]" style={{ color: 'var(--out-ink)' }}>{cfg[p.key]}{p.unit}</span>
            </div>
            <input
              type="range" min={p.min} max={p.max} value={cfg[p.key]}
              onChange={e => setCfg(c => ({ ...c, [p.key]: +e.target.value }))}
              className="w-full accent-[var(--out-ink)]"
            />
          </div>
        ))}

        {/* Save */}
        <button
          onClick={save}
          className="w-full border px-4 py-2.5 text-[12px] uppercase tracking-widest transition-colors"
          style={{
            borderColor: saved ? 'var(--out-ink)' : 'var(--out-ink-dim)',
            color:       saved ? 'var(--out-ink)' : 'var(--out-muted)',
            background:  saved ? '#12180f' : 'transparent',
          }}
        >
          {saved ? '✓ CONFIG SAVED' : 'SAVE CONFIG'}
        </button>

        <div className="text-[11px] text-center" style={{ color: 'var(--out-muted)' }}>
          Config saved locally. Activate in the{' '}
          <span style={{ color: 'var(--out-ink)' }}>AUTONOMOUS</span> panel to go live.
        </div>
      </div>
    </div>
  );
}

/* ── Portfolio positions (mock) ──────────────────────────────────────────── */
const MOCK_POSITIONS = [
  { symbol: 'AAPL',  qty: 2.5,  avgCost: 205.10, current: 211.45 },
  { symbol: 'NVDA',  qty: 1.0,  avgCost: 125.00, current: 138.92 },
  { symbol: 'TSLA',  qty: 3.2,  avgCost: 310.00, current: 287.50 },
];

function PortfolioSection() {
  if (MOCK_POSITIONS.length === 0) return null;

  return (
    <div className="border font-mono" style={{ borderColor: 'var(--out-ink-dim)', background: '#080d08' }}>
      <div className="px-4 py-3 border-b text-[11px] uppercase tracking-widest"
        style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
        Portfolio Positions
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--out-ink-dim)' }}>
            {['Symbol','Qty','Avg Cost','Current','P&L'].map(h => (
              <th key={h} className="px-4 py-2 text-left text-[11px] uppercase tracking-widest"
                style={{ color: 'var(--out-muted)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MOCK_POSITIONS.map(p => {
            const pnl = (p.current - p.avgCost) * p.qty;
            const pct = ((p.current - p.avgCost) / p.avgCost) * 100;
            return (
              <tr key={p.symbol} className="border-b hover:bg-[#0d1200] transition-colors"
                style={{ borderColor: 'var(--out-ink-dim)' }}>
                <td className="px-4 py-2.5 text-[13px] font-bold" style={{ color: 'var(--out-text)' }}>{p.symbol}</td>
                <td className="px-4 py-2.5 text-[13px]" style={{ color: 'var(--out-muted)' }}>{p.qty}</td>
                <td className="px-4 py-2.5 text-[13px]" style={{ color: 'var(--out-muted)' }}>${fmt(p.avgCost)}</td>
                <td className="px-4 py-2.5 text-[13px]" style={{ color: 'var(--out-ink)' }}>${fmt(p.current)}</td>
                <td className="px-4 py-2.5 text-[13px] font-bold"
                  style={{ color: pnl >= 0 ? 'var(--out-ink)' : 'var(--out-danger)' }}>
                  {pnl >= 0 ? '+' : ''}{fmt(pnl)} ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export function RwaPage() {
  const [mode, setMode] = useState<'manual' | 'agent'>('manual');
  const [selectedToken, setSelectedToken] = useState<RwaToken>(RWA_TOKENS[0]);
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');

  const sectors = ['ALL', ...Array.from(new Set(RWA_TOKENS.map(t => t.sector)))];
  const filtered = sectorFilter === 'ALL' ? RWA_TOKENS : RWA_TOKENS.filter(t => t.sector === sectorFilter);

  return (
    <div className="font-mono">
      {/* ── Page header ── */}
      <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--out-ink-dim)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-[15px] uppercase tracking-widest font-bold" style={{ color: 'var(--out-ink)' }}>
              RWA TRADE
            </h1>
            <p className="text-[12px] mt-1" style={{ color: 'var(--out-muted)' }}>
              Tokenized stock &amp; ETF trading on Robinhood Chain via 0x RFQ
            </p>
          </div>
          <div className="flex gap-2">
            <Pill label="MANUAL"       active={mode === 'manual'} onClick={() => setMode('manual')} />
            <Pill label="AGENT ASSIST" active={mode === 'agent'}  onClick={() => setMode('agent')}  />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* ── Coming soon badge ── */}
        <div className="inline-flex items-center gap-2 border px-3 py-1.5 text-[11px] uppercase tracking-widest"
          style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)', background: '#0a0f0a' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--out-warn)' }} />
          COMING SOON
        </div>

        {/* ── Sector filter ── */}
        <div className="flex flex-wrap gap-2">
          {sectors.map(s => (
            <Pill key={s} label={s} active={sectorFilter === s} onClick={() => setSectorFilter(s)} />
          ))}
        </div>

        {/* ── Main grid: token list + trade panel ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Token grid */}
          <div>
            <div className="text-[11px] uppercase tracking-widest mb-3" style={{ color: 'var(--out-muted)' }}>
              Select Token <ChevronRight size={10} style={{ display: 'inline' }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2">
              {filtered.map(t => (
                <TokenCard
                  key={t.symbol}
                  token={t}
                  selected={selectedToken.symbol === t.symbol}
                  onClick={() => setSelectedToken(t)}
                />
              ))}
            </div>
          </div>

          {/* Trade panel */}
          <div>
            <div className="text-[11px] uppercase tracking-widest mb-3" style={{ color: 'var(--out-muted)' }}>
              {mode === 'manual' ? 'Trade' : 'Agent Config'} <ChevronRight size={10} style={{ display: 'inline' }} />
            </div>
            {mode === 'manual'
              ? <ManualTradePanel token={selectedToken} />
              : <AgentAssistPanel token={selectedToken} />
            }
          </div>
        </div>

        {/* ── Portfolio section ── */}
        <div>
          <div className="text-[11px] uppercase tracking-widest mb-3" style={{ color: 'var(--out-muted)' }}>
            Your Positions (demo data)
          </div>
          <PortfolioSection />
        </div>
      </div>
    </div>
  );
}
