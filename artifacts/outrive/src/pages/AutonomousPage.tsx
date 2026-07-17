import React, { useState } from 'react';
import {
  Zap, ShieldAlert, Activity, Clock,
  ChevronRight, CheckCircle2, XCircle, Pause,
} from 'lucide-react';

/* ── Types ───────────────────────────────────────────────────────────────── */
type Strategy = 'dca' | 'momentum' | 'rebalance' | 'custom';
type RiskLevel = 'conservative' | 'moderate' | 'aggressive';

type AgentState = {
  enabled: boolean;
  strategy: Strategy;
  risk: RiskLevel;
  tokens: string[];
  allocationPct: number;
  intervalH: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxTradesPerDay: number;
};

const DEFAULT_STATE: AgentState = {
  enabled: false,
  strategy: 'dca',
  risk: 'moderate',
  tokens: ['AAPL', 'NVDA', 'SPY'],
  allocationPct: 25,
  intervalH: 24,
  stopLossPct: 5,
  takeProfitPct: 20,
  maxTradesPerDay: 5,
};

const AVAILABLE_TOKENS = ['AAPL', 'NVDA', 'AMZN', 'GOOGL', 'META', 'MSFT', 'TSLA', 'AMD', 'COIN', 'NFLX', 'SPY', 'QQQ'];

const STRATEGIES: { id: Strategy; label: string; desc: string; risk: string }[] = [
  { id: 'dca',       label: 'DCA',        risk: 'Low',    desc: 'Buy fixed $ amounts at fixed intervals regardless of price' },
  { id: 'momentum',  label: 'MOMENTUM',   risk: 'High',   desc: 'Enter on upward price momentum signals from on-chain feeds' },
  { id: 'rebalance', label: 'REBALANCE',  risk: 'Medium', desc: 'Maintain target portfolio weights automatically' },
  { id: 'custom',    label: 'CUSTOM',     risk: 'Custom', desc: 'Fully configurable with advanced parameters' },
];

const RISK_PRESETS: Record<RiskLevel, Partial<AgentState>> = {
  conservative: { stopLossPct: 3, takeProfitPct: 8,  maxTradesPerDay: 2,  allocationPct: 10 },
  moderate:     { stopLossPct: 5, takeProfitPct: 20, maxTradesPerDay: 5,  allocationPct: 25 },
  aggressive:   { stopLossPct: 10,takeProfitPct: 50, maxTradesPerDay: 15, allocationPct: 50 },
};

/* ── Mock activity log ───────────────────────────────────────────────────── */
const ACTIVITY_LOG = [
  { time: '09:15',  action: 'CONFIG UPDATED', detail: 'Strategy set to DCA · Interval 24h', status: 'info'    },
  { time: '08:02',  action: 'AGENT PAUSED',   detail: 'Manual pause by user',                status: 'warn'    },
  { time: 'Yesterday', action: 'TRADE PLACED',  detail: 'BUY 0.5 AAPL @ $210.20',           status: 'success' },
  { time: 'Yesterday', action: 'TRADE PLACED',  detail: 'BUY 0.2 NVDA @ $137.80',           status: 'success' },
  { time: 'Jul 16',  action: 'STOP LOSS HIT',  detail: 'SELL 1.0 TSLA @ $285.00',           status: 'danger'  },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border font-mono" style={{ borderColor: 'var(--out-ink-dim)', background: '#080d08' }}>
      <div className="px-4 py-3 border-b text-[11px] uppercase tracking-widest"
        style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function NumParam({
  label, unit, value, min, max, onChange,
}: {
  label: string; unit: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>{label}</span>
        <span className="text-[13px]" style={{ color: 'var(--out-ink)' }}>{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(+e.target.value)}
        className="w-full accent-[var(--out-ink)]"
      />
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export function AutonomousPage() {
  const [state, setState] = useState<AgentState>(DEFAULT_STATE);
  const [saveFlash, setSaveFlash] = useState(false);
  const [launching, setLaunching] = useState(false);

  function patch(partial: Partial<AgentState>) {
    setState(s => ({ ...s, ...partial }));
  }

  function toggleToken(t: string) {
    patch({
      tokens: state.tokens.includes(t)
        ? state.tokens.filter(x => x !== t)
        : [...state.tokens, t],
    });
  }

  function applyRisk(r: RiskLevel) {
    patch({ risk: r, ...RISK_PRESETS[r] });
  }

  function save() {
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2500);
  }

  function toggleAgent() {
    if (!state.enabled) {
      setLaunching(true);
      setTimeout(() => { setLaunching(false); patch({ enabled: true }); }, 1800);
    } else {
      patch({ enabled: false });
    }
  }

  const statusColor = state.enabled ? 'var(--out-ink)' : 'var(--out-muted)';
  const statusLabel = launching ? 'INITIALISING…' : state.enabled ? 'ACTIVE' : 'INACTIVE';

  return (
    <div className="font-mono">
      {/* ── COMING SOON banner ── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b"
        style={{ borderColor: '#e0902060', background: '#0d0a04' }}>
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#e09020' }} />
          <span className="text-[11px] uppercase tracking-widest font-bold" style={{ color: '#e09020' }}>
            COMING IN v1.2
          </span>
        </div>
        <span className="text-[10px] border-l pl-3" style={{ borderColor: '#e0902040', color: '#e09020aa' }}>
          Autonomous agent trading is under development — Market Agent · Portfolio Agent · Execution Agent.
          Config below is a preview. No trades will execute until v1.2 ships.
        </span>
      </div>

      {/* ── Page header ── */}
      <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--out-ink-dim)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[15px] uppercase tracking-widest font-bold" style={{ color: 'var(--out-ink)' }}>
              AUTONOMOUS
            </h1>
            <p className="text-[12px] mt-1" style={{ color: 'var(--out-muted)' }}>
              Configure autonomous agent-driven RWA trading — launching v1.2
            </p>
          </div>

          <div className="inline-flex items-center gap-2 border px-3 py-1.5 text-[11px] uppercase tracking-widest"
            style={{ borderColor: '#e0902060', color: '#e09020', background: '#0d0a05' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#e09020' }} />
            PREVIEW — NOT LIVE
          </div>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN */}
        <div className="space-y-6">

          {/* Strategy selector */}
          <Section title="Strategy">
            <div className="grid grid-cols-2 gap-2">
              {STRATEGIES.map(s => (
                <button
                  key={s.id}
                  onClick={() => patch({ strategy: s.id })}
                  className="border p-3 text-left transition-colors"
                  style={{
                    borderColor: state.strategy === s.id ? 'var(--out-ink)' : 'var(--out-ink-dim)',
                    background:  state.strategy === s.id ? '#12180f' : 'transparent',
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-bold uppercase tracking-widest"
                      style={{ color: state.strategy === s.id ? 'var(--out-ink)' : 'var(--out-text)' }}>
                      {s.label}
                    </span>
                    <span className="text-[10px] border px-1.5 py-0.5"
                      style={{
                        borderColor: 'var(--out-ink-dim)',
                        color: s.risk === 'High' ? 'var(--out-danger)' : s.risk === 'Low' ? 'var(--out-ink)' : 'var(--out-warn)',
                      }}>
                      {s.risk}
                    </span>
                  </div>
                  <div className="text-[11px] leading-snug" style={{ color: 'var(--out-muted)' }}>{s.desc}</div>
                </button>
              ))}
            </div>
          </Section>

          {/* Risk presets */}
          <Section title="Risk Profile">
            <div className="grid grid-cols-3 gap-2">
              {(['conservative', 'moderate', 'aggressive'] as RiskLevel[]).map(r => (
                <button
                  key={r}
                  onClick={() => applyRisk(r)}
                  className="border py-2.5 text-[12px] uppercase tracking-widest transition-colors"
                  style={{
                    borderColor: state.risk === r ? 'var(--out-ink)' : 'var(--out-ink-dim)',
                    color:       state.risk === r ? 'var(--out-ink)' : 'var(--out-muted)',
                    background:  state.risk === r ? '#12180f' : 'transparent',
                  }}>
                  {r}
                </button>
              ))}
            </div>
          </Section>

          {/* Token whitelist */}
          <Section title="Token Whitelist">
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TOKENS.map(t => {
                const active = state.tokens.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleToken(t)}
                    className="border px-2.5 py-1.5 text-[12px] uppercase tracking-widest transition-colors"
                    style={{
                      borderColor: active ? 'var(--out-ink)' : 'var(--out-ink-dim)',
                      color:       active ? 'var(--out-ink)' : 'var(--out-muted)',
                      background:  active ? '#12180f' : 'transparent',
                    }}
                  >
                    {active && <span className="mr-1">✓</span>}{t}
                  </button>
                );
              })}
            </div>
            <div className="mt-2.5 text-[11px]" style={{ color: 'var(--out-muted)' }}>
              {state.tokens.length} token{state.tokens.length !== 1 ? 's' : ''} selected
            </div>
          </Section>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">

          {/* Parameters */}
          <Section title="Parameters">
            <div className="space-y-5">
              <NumParam label="Max Portfolio Allocation" unit="%" value={state.allocationPct} min={1} max={100}
                onChange={v => patch({ allocationPct: v })} />
              <NumParam label="Trade Interval"           unit="h" value={state.intervalH}    min={1} max={168}
                onChange={v => patch({ intervalH: v })} />
              <NumParam label="Stop Loss"                unit="%" value={state.stopLossPct}   min={1} max={50}
                onChange={v => patch({ stopLossPct: v })} />
              <NumParam label="Take Profit"              unit="%" value={state.takeProfitPct} min={1} max={200}
                onChange={v => patch({ takeProfitPct: v })} />
              <NumParam label="Max Trades / Day"         unit=""  value={state.maxTradesPerDay} min={1} max={50}
                onChange={v => patch({ maxTradesPerDay: v })} />
            </div>
          </Section>

          {/* Current config summary */}
          <Section title="Config Summary">
            <div className="space-y-2 text-[12px]">
              {[
                { k: 'Strategy',       v: state.strategy.toUpperCase()           },
                { k: 'Risk',           v: state.risk.toUpperCase()               },
                { k: 'Tokens',         v: state.tokens.join(', ') || '—'        },
                { k: 'Allocation',     v: `${state.allocationPct}% of portfolio` },
                { k: 'Interval',       v: `Every ${state.intervalH}h`            },
                { k: 'Stop Loss',      v: `${state.stopLossPct}%`               },
                { k: 'Take Profit',    v: `${state.takeProfitPct}%`             },
                { k: 'Max Trades/Day', v: `${state.maxTradesPerDay}`             },
              ].map(row => (
                <div key={row.k} className="flex gap-2">
                  <span className="w-36 shrink-0" style={{ color: 'var(--out-muted)' }}>{row.k}</span>
                  <span style={{ color: 'var(--out-text)' }}>{row.v}</span>
                </div>
              ))}
            </div>
            <button
              onClick={save}
              className="w-full mt-4 border px-4 py-2.5 text-[12px] uppercase tracking-widest transition-colors"
              style={{
                borderColor: saveFlash ? 'var(--out-ink)' : 'var(--out-ink-dim)',
                color:       saveFlash ? 'var(--out-ink)' : 'var(--out-muted)',
                background:  saveFlash ? '#12180f' : 'transparent',
              }}
            >
              {saveFlash ? '✓ SAVED' : 'SAVE CONFIG'}
            </button>
          </Section>

          {/* Activity log */}
          <Section title={`Activity Log`}>
            <div className="space-y-2">
              {ACTIVITY_LOG.map((e, i) => {
                const col =
                  e.status === 'success' ? 'var(--out-ink)' :
                  e.status === 'danger'  ? 'var(--out-danger)' :
                  e.status === 'warn'    ? 'var(--out-warn)' :
                  'var(--out-muted)';
                const Icon =
                  e.status === 'success' ? CheckCircle2 :
                  e.status === 'danger'  ? XCircle :
                  e.status === 'warn'    ? Pause :
                  Activity;
                return (
                  <div key={i} className="flex items-start gap-2.5 text-[12px]">
                    <Icon size={11} style={{ color: col, flexShrink: 0, marginTop: 2 }} />
                    <span className="w-16 shrink-0" style={{ color: 'var(--out-muted)' }}>{e.time}</span>
                    <div>
                      <span className="font-bold" style={{ color: col }}>{e.action}</span>
                      <span className="ml-2" style={{ color: 'var(--out-muted)' }}>{e.detail}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 text-[11px] text-center" style={{ color: 'var(--out-muted)' }}>
              <Clock size={10} style={{ display: 'inline', marginRight: 4 }} />
              Live log activates when agent is running
            </div>
          </Section>
        </div>
      </div>

      {/* Safety notice */}
      <div className="mx-6 mb-6 flex items-start gap-3 border px-4 py-3 text-[12px]"
        style={{ borderColor: 'var(--out-warn)', background: 'rgba(250,204,21,0.04)', color: 'var(--out-muted)' }}>
        <ShieldAlert size={12} style={{ color: 'var(--out-warn)', flexShrink: 0, marginTop: 2 }} />
        <span>
          Autonomous trading is <span style={{ color: 'var(--out-warn)' }}>non-custodial</span> and executes on-chain.
          All trades are irreversible. Set conservative risk parameters until you understand the agent's behavior.
          RWA execution requires KYC via Robinhood platform.
        </span>
      </div>
    </div>
  );
}
