import React, { useState, useEffect, useRef } from 'react';
import { Sheet } from '@/components/Sheet';

function Section({ id, n, title, children }: { id: string; n: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="flex flex-col gap-4 scroll-mt-32">
      <div className="flex items-baseline gap-3 border-b pb-2" style={{ borderColor: 'var(--out-ink-dim)' }}>
        <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--out-ink)' }}>{n}</span>
        <h2 className="font-mono text-[13px] font-bold uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>{title}</h2>
      </div>
      <div className="flex flex-col gap-3 font-mono text-[11px] leading-relaxed" style={{ color: 'var(--out-text)' }}>
        {children}
      </div>
    </div>
  );
}

function Table({ headers, rows, mono = true }: { headers: string[]; rows: (string | React.ReactNode)[][]; mono?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] border-collapse font-mono">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--out-ink-dim)' }}>
            {headers.map(h => (
              <th key={h} className="text-left py-1.5 pr-4 uppercase tracking-widest" style={{ color: 'var(--out-muted)', fontWeight: 400 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--out-grid-major)' }}>
              {row.map((cell, j) => (
                <td key={j} className="py-1.5 pr-4 align-top" style={{ color: 'var(--out-text)' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="text-[10px] leading-relaxed p-4 overflow-x-auto"
      style={{ background: '#0A0F0A', border: '1px solid var(--out-grid-major)', color: 'var(--out-ink)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre' }}>
      {children}
    </pre>
  );
}

function P({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <p className="font-mono text-[11px] leading-relaxed" style={{ color: 'var(--out-text)', ...style }}>{children}</p>;
}

function Highlight({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>{children}</span>;
}

function Tag({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="text-[9px] border px-1.5 py-px uppercase tracking-widest font-mono"
      style={ok
        ? { borderColor: 'var(--out-ink)', color: 'var(--out-ink)', background: '#12180f' }
        : { borderColor: '#f59e0b', color: '#f59e0b', background: '#120f02' }}>
      {ok ? '✓ VERIFIED' : '⚠ CALIBRATION-REQ'}
    </span>
  );
}

const TOC = [
  { label: '1. Executive Summary',                   id: 'wp-s1'  },
  { label: '2. Verified vs. Calibration-Required',   id: 'wp-s2'  },
  { label: '3. Network Foundation (Robinhood Chain)', id: 'wp-s3'  },
  { label: '4. Launch Layer (Virtuals Protocol)',     id: 'wp-s4'  },
  { label: '5. System Architecture',                 id: 'wp-s5'  },
  { label: '6. Core Flows (F1–F7)',                  id: 'wp-s6'  },
  { label: '7. AI Agent Design',                     id: 'wp-s7'  },
  { label: '8. Data Model',                          id: 'wp-s8'  },
  { label: '9. CLI Access & Operations',             id: 'wp-s9'  },
  { label: '10. Security Model & Threat Analysis',   id: 'wp-s10' },
  { label: '11. Environment & Configuration',        id: 'wp-s11' },
  { label: '12. Roadmap',                            id: 'wp-s12' },
  { label: '13. Token Economics',                    id: 'wp-s13' },
  { label: '14. Risk Disclosure & Legal Posture',    id: 'wp-s14' },
  { label: '15. Glossary',                           id: 'wp-s15' },
  { label: '16. RWA Trade Infrastructure',           id: 'wp-s16' },
  { label: '17. Autonomous Agent Trading',           id: 'wp-s17' },
];

export function WhitepaperPage() {
  const [activeSection, setActiveSection] = useState<number>(0);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Auto-highlight the TOC item that is currently in view
  useEffect(() => {
    observerRef.current?.disconnect();

    const sectionEls = TOC.map(t => document.getElementById(t.id)).filter(Boolean) as HTMLElement[];
    if (sectionEls.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Pick the topmost visible section
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const idx = TOC.findIndex(t => t.id === visible[0].target.id);
          if (idx >= 0) setActiveSection(idx);
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    );

    sectionEls.forEach(el => observerRef.current!.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  function scrollTo(i: number) {
    setActiveSection(i);
    const el = document.getElementById(TOC[i].id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex gap-6">

      {/* Sidebar TOC */}
      <aside className="hidden xl:flex flex-col gap-1 w-56 shrink-0 sticky top-28 self-start font-mono text-[10px]">
        <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-muted)' }}>CONTENTS</div>
        {TOC.map((item, i) => (
          <button key={i} onClick={() => scrollTo(i)}
            className="text-left py-1 px-2 transition-colors border-l-2"
            style={{
              borderLeftColor: activeSection === i ? 'var(--out-ink)' : 'transparent',
              color: activeSection === i ? 'var(--out-ink)' : 'var(--out-muted)',
            }}>
            {item.label}
          </button>
        ))}
        <div className="mt-4 pt-4 border-t text-[9px] uppercase tracking-widest" style={{ borderColor: 'var(--out-grid-major)', color: 'var(--out-muted)' }}>
          VERSION 1.0 · JULY 2026
        </div>
      </aside>

      {/* Main content */}
      <Sheet dwgNo="OUT-WP-01" figCaption="OUTRIVE TECHNICAL DOCUMENTATION & WHITEPAPER — V1.0" className="flex-1 min-w-0">
        <div className="py-6 flex flex-col gap-10">

          {/* Header */}
          <div className="border-b pb-6" style={{ borderColor: 'var(--out-ink-dim)' }}>
            <div className="flex items-center gap-3 mb-4">
              <img src="/outrive-logo.png" alt="OUTRIVE" className="h-10 w-10 object-contain" />
              <div>
                <div className="font-mono text-[18px] font-bold tracking-widest" style={{ color: 'var(--out-ink)' }}>OUTRIVE</div>
                <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>Technical Documentation & Whitepaper · Version 1.0</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[10px]">
              {[
                { k: 'VERSION', v: '1.0 — July 2026' },
                { k: 'PRODUCT', v: 'AI Agent Launchpad on Robinhood Chain' },
                { k: 'STATUS', v: 'Engineering source of truth' },
              ].map(r => (
                <div key={r.k} className="border p-3" style={{ borderColor: 'var(--out-grid-major)' }}>
                  <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>{r.k}</div>
                  <div style={{ color: 'var(--out-text)' }}>{r.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* §1 Executive Summary */}
          <Section id="wp-s1" n="§1" title="Executive Summary">
            <P>
              OUTRIVE is a <Highlight>chat-first launchpad and autonomous trading platform</Highlight>. A user connects their own wallet, types natural-language instructions to an AI deployment agent (e.g., <em style={{ color: 'var(--out-ink)' }}>"launch an agent token called DogeRiv, ticker DRIV"</em>), and the agent drafts, validates, and simulates an on-chain launch through <Highlight>Virtuals Protocol</Highlight> on <Highlight>Robinhood Chain</Highlight>. The user's wallet signs every transaction; therefore the user — never OUTRIVE — is the on-chain creator of record and the beneficiary of any creator fee share. After launch, OUTRIVE indexes the token's bonding-curve life (prototype → graduation) and presents live market data through both the chat agent and a dashboard. Alongside agent token launching, OUTRIVE operates a <Highlight>Real-World Asset (RWA) trading interface</Highlight> — a live terminal for 15 tokenized equities and ETFs (NVDA, AAPL, GOOGL, TSLA, META, MSFT, AMZN, AMD, PLTR, MU, ORCL, SNDK, SPCX, SPY, QQQ) issued as ERC-20 tokens on Robinhood Chain, with live price feeds, OHLCV data, TradingView-grade charts, and on-chain swap execution via RobinhoodRouter (Protocol FLAP — FlapPortal native minting).
            </P>
            <div className="border-l-2 pl-4 py-2 italic" style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>
              Design doctrine: the LLM decides <em>what</em> to do; deterministic code decides <em>how</em>; the user's wallet decides <em>whether</em>.
            </div>
            <P>OUTRIVE is an independent software tool. It is not affiliated with, endorsed by, or operated by Virtuals Protocol, Robinhood, or Anthropic.</P>
          </Section>

          {/* §2 Verified vs Calibration */}
          <Section id="wp-s2" n="§2" title="Verified vs. Calibration-Required">
            <P>Honest engineering starts with an inventory of certainty. Every downstream decision traces back to this table.</P>

            <div className="font-mono text-[10px] uppercase tracking-widest mb-1 flex items-center gap-2" style={{ color: 'var(--out-ink)' }}>
              <Tag label="VERIFIED" ok={true} /> OFFICIAL SOURCES — SAFE TO HARDCODE
            </div>
            <Table
              headers={['#', 'FACT', 'SOURCE']}
              rows={[
                ['V1', 'Robinhood Chain is a permissionless EVM-compatible L2 on Arbitrum technology; gas token ETH', 'docs.robinhood.com/chain'],
                ['V2', 'Mainnet chainId 4663 · RPC https://rpc.mainnet.chain.robinhood.com · Explorer robinhoodchain.blockscout.com', 'docs.robinhood.com/chain/connecting'],
                ['V3', 'Testnet chainId 46630 · RPC https://rpc.testnet.chain.robinhood.com · Faucet faucet.testnet.chain.robinhood.com', 'docs.robinhood.com/chain/connecting'],
                ['V4', 'Blockscout exposes free REST API v2 at {explorer}/api/v2/... on both networks', 'Blockscout standard · live on both explorers'],
                ['V5', 'Virtuals Protocol powers agentic infrastructure on Robinhood Chain from day one; launch UI offers BASE / SOL / ROBINHOOD chain targets', 'Virtuals official announcement (July 2026) + live app.virtuals.io'],
                ['V6', 'Virtuals launch modes: Instant Launch, Fund Raise, 60 Days Experiment', 'Live app.virtuals.io launch form'],
                ['V7', 'Instant Launch base cost: "No fee required" — creator pays network gas only; token tradable immediately on bonding curve', 'Live launch form + Virtuals whitepaper'],
                ['V8', '1% trading fee applies from day one; creator share of prototype-stage trading fees exists', 'Virtuals whitepaper'],
                ['V9', 'Anti-Sniper Protection: buy-side tax starts 99% and decays to 1% over a founder-configured window (0s–98min); sell tax fixed 1%', 'Virtuals whitepaper (Launch Mechanics)'],
                ['V10', 'Graduation: bonding curve accumulates 42,000 $VIRTUAL → Uniswap LP created automatically, LP tokens locked/staked 10 years', 'Virtuals whitepaper'],
                ['V11', 'Launch fields: profile picture, name, ticker ≤6 chars, description; submitted on-chain and IMMUTABLE', 'Virtuals whitepaper + live form'],
                ['V12', 'Optional paid modules: Launch Radar 100 $VIRTUAL; Capital Formation 10 $VIRTUAL; all other modules free', 'Virtuals whitepaper (Launch Mechanics)'],
              ]}
            />

            <div className="font-mono text-[10px] uppercase tracking-widest mt-2 mb-1 flex items-center gap-2" style={{ color: '#f59e0b' }}>
              <Tag label="CALIBRATION-REQ" ok={false} /> DISCOVERABLE ON-CHAIN — NEVER GUESSED
            </div>
            <Table
              headers={['#', 'UNKNOWN', 'HOW TO DISCOVER']}
              rows={[
                ['C1', 'Virtuals launch entrypoint (factory) contract address on Robinhood Chain', 'Open any Virtuals token with chain=ROBINHOOD → creation tx on Blockscout → the `to` contract is the entrypoint'],
                ['C2', 'Factory ABI (exact launch function signature & event names)', 'Copy verified ABI from Blockscout "Contract" tab; if unverified, decode 4-byte selector via openchain.xyz'],
                ['C3', '$VIRTUAL token address on Robinhood Chain', 'Inspect a real bonding-curve buy tx: the ERC-20 debited from the buyer is $VIRTUAL on this chain'],
                ['C4', 'Bonding-curve read interface (price / raised amount per token)', 'From the factory/curve verified ABI, or decoded getter calls from the Virtuals frontend'],
                ['C5', 'Creator-fee accounting (auto-forwarded vs. claim-based; claim function name)', 'From the calibrated ABI; until then product displays "AWAITING CONTRACT CALIBRATION"'],
                ['C6', 'Whether Virtuals contracts also exist on Robinhood testnet', 'Attempt calibration against testnet explorer; if absent, testing on mainnet with throwaway wallet'],
              ]}
            />
            <P style={{ color: 'var(--out-muted)', fontSize: 10 } as React.CSSProperties}>
              Diagnosis: OUTRIVE can be built end-to-end today. The UI, agent, TX engine, indexer, and database do not depend on C1–C6 at build time — all Virtuals-specific values live behind a config layer with a boot-time health check. The app runs in read-only "CALIBRATION REQUIRED" mode until C1–C4 are filled, then unlocks launching with zero code changes.
            </P>
          </Section>

          {/* §3 Network Foundation */}
          <Section id="wp-s3" n="§3" title="Network Foundation (Robinhood Chain)">
            <P>Robinhood Chain is an Ethereum Layer-2 built on Arbitrum technology, fully EVM-compatible, with ETH as the gas token. Standard EVM tooling (viem, wagmi, Foundry, Hardhat) works unmodified.</P>
            <Code>{`MAINNET                              TESTNET
chainId   4663                       chainId   46630
gas       ETH                        gas       ETH
rpc       https://rpc.mainnet.chain  rpc       https://rpc.testnet.chain
          .robinhood.com                       .robinhood.com
explorer  robinhoodchain             explorer  explorer.testnet
          .blockscout.com                      .chain.robinhood.com
API       {explorer}/api/v2          faucet    faucet.testnet.chain.robinhood.com`}</Code>
            <P>Public RPCs are rate-limited; production deployments should use a commercial provider endpoint via <code style={{ color: 'var(--out-ink)' }}>RPC_URL_OVERRIDE</code> (Alchemy, QuickNode, dRPC, and others officially support the chain).</P>
            <P><Highlight>Why Blockscout matters:</Highlight> it doubles as OUTRIVE's zero-cost historical data source.</P>
            <Table
              headers={['ENDPOINT', 'PURPOSE']}
              rows={[
                ['GET /api/v2/tokens/{address}', 'Token metadata + holders'],
                ['GET /api/v2/tokens/{address}/transfers', 'Transfer history / trades'],
                ['GET /api/v2/tokens/{address}/holders', 'Holder list + concentrations'],
                ['GET /api/v2/addresses/{factory}/logs', 'Factory event backfill (indexer)'],
                ['GET /api/v2/transactions/{hash}', 'Tx receipt + status'],
              ]}
            />
          </Section>

          {/* §4 Launch Layer */}
          <Section id="wp-s4" n="§4" title="Launch Layer (Virtuals Protocol)">
            <P>Virtuals Protocol is the launch and tokenization layer for AI agents. A launch through Virtuals has two halves:</P>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { title: 'ON-CHAIN HALF (OUTRIVE AUTOMATES)', body: 'Token creation with immutable metadata (name, $TICKER ≤6 chars, image/description URI), a bonding curve paired with $VIRTUAL, 1% trading fee, optional anti-sniper tax decay, and automatic graduation at 42,000 $VIRTUAL into a Uniswap pool whose LP is locked for 10 years.' },
                { title: 'OFF-CHAIN HALF (VIRTUALS PLATFORM)', body: "The agent's personality, runtime, inference, and social presence, configured on app.virtuals.io. OUTRIVE links the user there post-launch and never claims to have configured it." },
              ].map(b => (
                <div key={b.title} className="border p-4" style={{ borderColor: 'var(--out-grid-major)' }}>
                  <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-ink)' }}>{b.title}</div>
                  <p className="text-[10px] leading-relaxed" style={{ color: 'var(--out-text)' }}>{b.body}</p>
                </div>
              ))}
            </div>

            <div className="text-[10px] uppercase tracking-widest mt-2 mb-1" style={{ color: 'var(--out-muted)' }}>LAUNCH MODES</div>
            <Table
              headers={['MODE', 'DESCRIPTION', 'OUTRIVE v1']}
              rows={[
                ['INSTANT LAUNCH', 'Immediate bonding-curve launch; no base fee; token tradable at once', '✅ Automated via chat'],
                ['FUND RAISE', 'Structured capital-raise launch', '✓ Explained by agent; link-out'],
                ['60 DAYS EXPERIMENT', 'PMF-trial launch with founder-share lock/commitment mechanics', '✓ Explained by agent; link-out'],
              ]}
            />

            <div className="text-[10px] uppercase tracking-widest mt-2 mb-1" style={{ color: 'var(--out-muted)' }}>TOKEN LIFECYCLE</div>
            <Code>{`INSTANT LAUNCH ──► PROTOTYPE (bonding curve, priced in $VIRTUAL)
                        │  buys/sells, 1% fee, creator share accrues
                        ▼
              raised == 42,000 $VIRTUAL
                        │
                        ▼
                  GRADUATED ──► Uniswap pool (token/$VIRTUAL) on Robinhood Chain
                                LP locked/staked 10 years`}</Code>
          </Section>

          {/* §5 Architecture */}
          <Section id="wp-s5" n="§5" title="System Architecture">
            <Code>{`┌────────────────────────────────────────────────────────────────────┐
│                     FRONTEND — React + Vite                         │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────────────────┐ │
│  │  Chat UI    │  │ Wallet Layer   │  │ Dashboard                │ │
│  │  (SSE)      │  │ wagmi+viem     │  │ market / my launches /   │ │
│  │             │  │ RainbowKit     │  │ token detail + charts    │ │
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
   Blockscout API v2 (history / backfill)`}</Code>

            <div className="text-[10px] uppercase tracking-widest mt-2 mb-1" style={{ color: 'var(--out-muted)' }}>SEPARATION OF POWERS</div>
            <Table
              headers={['COMPONENT', 'MAY DO', 'MAY NEVER DO']}
              rows={[
                ['LLM (orchestrator)', 'Parse intent, ask follow-ups, emit tool-call JSON, summarize data', 'Touch keys, build raw calldata, trigger a broadcast'],
                ['TX Engine', 'Validate params, encode calldata, simulate, return unsigned tx', 'Sign anything'],
                ['Frontend wallet layer', 'Present preview, collect user signature, broadcast', 'Auto-sign, re-order, or mutate the prepared tx'],
                ['Data Service', 'Read chain + Blockscout, persist, cache, push updates', 'Write on-chain state'],
              ]}
            />
          </Section>

          {/* §6 Core Flows */}
          <Section id="wp-s6" n="§6" title="Core Flows (F1–F7)">
            {[
              {
                id: 'F1', title: 'INSTANT LAUNCH via chat (primary flow)',
                code: `USER              FRONTEND          ORCHESTRATOR(LLM)    TX ENGINE      CHAIN
 │ connect wallet ──►│ addr 0xUSER
 │ "launch DogeRiv,  │
 │  ticker DRIV" ───►│── msg + address ──►│
 │                   │                    │ tool: launch_agent_token
 │                   │                    │ {name:"DogeRiv",ticker:"DRIV"}
 │                   │                    │────────────────►│ validate ticker
 │                   │                    │                 │ encode createTx
 │                   │                    │                 │ eth_call simulate ──►│ OK
 │                   │◄── WORK ORDER card + unsigned tx ────│
 │  review: name,    │   (NO FEE — GAS ONLY; CREATOR: 0xUSER; IMMUTABLE)
 │  sign → wallet ──►│──────────── signed tx broadcast ─────────────────────────►│
 │                   │ PENDING badge + tx hash link
 │                   │                    │◄── event Launched(token, creator=0xUSER) ──│
 │                   │                    │  DB: launches += row; tokens += row
 │                   │◄─ "TOKEN COMMISSIONED — view on Blockscout / Virtuals."`,
                note: 'The LLM only fills parameters; every write stops at the WORK ORDER card; simulation precedes any signature request; `from` is always the user.',
              },
              {
                id: 'F2', title: 'LAUNCH WITH INITIAL DEV BUY (two-signature choreography)',
                code: `TX Engine checks: balanceOf($VIRTUAL, user) ≥ amount?  allowance(user→factory) ≥ amount?
  ├─ balance insufficient → agent states the exact shortfall and STOPS (no card)
  ├─ allowance sufficient → single-button card: SIGN & LAUNCH →
  └─ allowance insufficient → card shows STEP A — APPROVE $VIRTUAL →
        user signs approve → receipt → button morphs to STEP B — SIGN & LAUNCH →
        user signs launch → F1 continues from broadcast`,
                note: 'Triggered only when the user asks. Initial buy denominated in $VIRTUAL (ERC-20); allowance may be needed.',
              },
              {
                id: 'F3', title: 'MARKET MONITORING (read-only; no signatures)',
                code: `"what's trending?" / "how is my token doing?"
  → LLM calls get_market_overview / get_token_info / get_my_launches
  → Data Service answers from Postgres + cache (indexer-fed) with
    Blockscout fallback for cold tokens
  → LLM renders a natural-language summary; dashboard shows the same data`,
                note: '',
              },
              {
                id: 'F4', title: 'BACKGROUND INDEXING',
                code: `watcher: logs on VIRTUALS_FACTORY_ADDRESS (event names from calibrated ABI)
  Launched  → insert token (phase=PROTOTYPE)
  curve poll (30s per PROTOTYPE token) → price, raisedVirtual, curveProgress
  raised ≥ 42,000e18 → phase=GRADUATED; price source switches to Uniswap pool
backfill / self-heal: Blockscout /addresses/{factory}/logs (cursor-paged)
frontend: dashboard revalidates every 20s (LIVE dot + last-sync time)`,
                note: '',
              },
              {
                id: 'F5', title: 'CREATOR FEES',
                code: `"how much have I earned?" → get_creator_fees
  ├─ ABI calibrated & exposes accounting → read → answer with real number
  │     └─ claim-based? → "claim" request → standard preview→sign flow (F1 pattern)
  └─ not calibrated → agent answers exactly:
        "Creator-fee accounting is awaiting contract calibration — I won't guess numbers."`,
                note: '',
              },
              {
                id: 'F6', title: 'CALIBRATION (operator flow, one-time per contract version)',
                code: `operator: pick a fresh ROBINHOOD-chain launch on app.virtuals.io
  → open token on robinhoodchain.blockscout.com → creation tx
  → record \`to\` address        = VIRTUALS_FACTORY_ADDRESS   (C1)
  → copy verified ABI (or decode selectors)                  (C2)
  → inspect a curve BUY tx → debited ERC-20 = VIRTUAL_TOKEN_ADDRESS (C3)
  → fill env + config/*.json → restart → boot healthcheck simulates a dummy
    launch via eth_call → PASS → banner clears, launch tool unlocks`,
                note: '',
              },
            ].map(f => (
              <div key={f.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="border px-2 py-0.5 text-[9px] font-bold uppercase font-mono" style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>{f.id}</span>
                  <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>{f.title}</span>
                </div>
                <Code>{f.code}</Code>
                {f.note && <p className="text-[10px] leading-relaxed" style={{ color: 'var(--out-muted)' }}>{f.note}</p>}
              </div>
            ))}

            <div className="text-[10px] uppercase tracking-widest mt-2 mb-1" style={{ color: 'var(--out-muted)' }}>F7 — FAILURE & EDGE HANDLING</div>
            <Table
              headers={['SITUATION', 'BEHAVIOR']}
              rows={[
                ['Simulation reverts', 'No signature requested; agent explains revert reason; logged'],
                ['User rejects in wallet', 'Card returns to editable state; nothing recorded on-chain'],
                ['Tx dropped/stuck', 'PENDING with explorer link; watcher re-checks by hash; user may retry'],
                ['RPC down', 'Read paths fall back to Blockscout; write paths disabled with clear status'],
                ['Healthcheck fails post-calibration', 'Auto re-enter CALIBRATION REQUIRED mode; launching disabled; ops alerted'],
                ['Prompt-injection content on-chain', 'Treated as untrusted data; write actions only ever fire from UI buttons'],
              ]}
            />
          </Section>

          {/* §7 AI Agent Design */}
          <Section id="wp-s7" n="§7" title="AI Agent Design (LLM Layer)">
            <P><Highlight>Model:</Highlight> Anthropic Messages API with tool use (<code style={{ color: 'var(--out-ink)' }}>claude-sonnet-4-6</code>).</P>
            <P><Highlight>Loop:</Highlight> user msg → LLM → (tool_use? → deterministic execution → tool_result → LLM)* → final text. Streaming to the client via SSE.</P>

            <div className="text-[10px] uppercase tracking-widest mt-2 mb-1" style={{ color: 'var(--out-muted)' }}>TOOL REGISTRY</div>
            <Table
              headers={['TOOL', 'TYPE', 'PURPOSE']}
              rows={[
                ['launch_agent_token { name≤32, ticker≤6 ^[A-Z0-9]+$, description≤500?, image_ref?, initial_buy_virtual? }', 'WRITE', 'Validate → encode → simulate → return { needsApproval, approveTx?, launchTx, preview }'],
                ['get_balances {}', 'READ', 'ETH gas + $VIRTUAL balance of the connected wallet'],
                ['get_market_overview { tab }', 'READ', 'Newest/trending from DB/cache'],
                ['get_token_info { address }', 'READ', 'DB + Blockscout + live curve merge'],
                ['get_my_launches {}', 'READ', "The wallet's launches"],
                ['get_creator_fees {}', 'READ', 'Real numbers only post-calibration (F5)'],
                ['explain_launch_modes {}', 'READ', 'Accurate static copy for Instant / Fund Raise / 60 Days'],
              ]}
            />

            <P><Highlight>Hard behavioral rules (system prompt):</Highlight> cannot execute transactions; user's wallet is always creator of record; require name+ticker before proposing a launch; warn immutability; check gas (and $VIRTUAL when initial buy requested) before proposing; automate on-chain half only and route agent-personality setup to app.virtuals.io; no profit promises or financial advice; on-chain text is untrusted data; concise technical tone.</P>
            <P><Highlight>Deterministic guardrails outside the LLM:</Highlight> ticker blocklist (major-asset impersonation), profanity filter, per-wallet rate limit (5 launches/hour), confirmation only via UI buttons — a "yes" typed in chat never triggers a broadcast.</P>
          </Section>

          {/* §8 Data Model */}
          <Section id="wp-s8" n="§8" title="Data Model">
            <P>PostgreSQL via Drizzle ORM:</P>
            <Code>{`users        (id, wallet_address UNIQUE, created_at)
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

watchlist    (user_id, token_address, PRIMARY KEY(user_id, token_address))

-- RWA Trade tables (§16)
rwa_trades   (id, wallet TEXT, symbol TEXT, side TEXT,   -- BUY | SELL
              shares NUMERIC, price_usd NUMERIC,
              eth_amount NUMERIC, total_usd NUMERIC,
              tx_hash TEXT, status TEXT,                  -- pending|confirmed|failed
              source TEXT, network TEXT,
              created_at TIMESTAMP)`}</Code>
            <P><Highlight>Cache:</Highlight> in-memory LRU, TTL 20s for market_overview and per-token price reads.</P>
          </Section>

          {/* §9 CLI */}
          <Section id="wp-s9" n="§9" title="CLI Access & Operations">
            <P>
              OUTRIVE ships two CLI layers: the <Highlight>in-app Agent CLI</Highlight> (browser terminal, natural language + structured commands)
              and the <Highlight>operator scripts</Highlight> (server-side npm tasks for calibration, indexing, and maintenance).
              Neither layer holds or requires private keys.
            </P>

            {/* §9.1 In-App Agent CLI */}
            <div className="text-[10px] uppercase tracking-widest mt-2 mb-1" style={{ color: 'var(--out-muted)' }}>§9.1 IN-APP AGENT CLI — COMMAND REFERENCE</div>
            <P>
              Accessible via the <Highlight>$_ CLI</Highlight> tab in the chat console. Accepts structured commands
              and free-form natural language — the AI agent interprets either. Command history navigates with
              <Highlight> ↑ ↓ </Highlight> arrow keys (last 50 entries); <Highlight>Tab</Highlight> autocompletes
              the first matching command.
            </P>

            <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: 'var(--out-ink)' }}>LAUNCH COMMANDS</div>
            <Table
              headers={['COMMAND', 'DESCRIPTION']}
              rows={[
                ['launch <name> <ticker>', 'Launch an agent token — gas only, no dev buy. ticker ≤ 6 chars, A–Z 0–9.'],
                ['launch <name> <ticker> --buy <n>', 'Launch + initial $VIRTUAL dev buy of <n> tokens. Triggers two-signature flow if allowance is insufficient.'],
                ['launch <name> <ticker> --desc "…"', 'Launch with a custom description (≤ 500 characters). Fields are on-chain and immutable after signing.'],
              ]}
            />
            <Code>{`Examples
  launch SkyNet SKYN
  launch SkyNet SKYN --buy 500
  launch "Deep Quant" DQNT --buy 1000 --desc "AI-powered DeFi trading agent"`}</Code>

            <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: 'var(--out-ink)' }}>WALLET COMMANDS</div>
            <Table
              headers={['COMMAND', 'ALIAS', 'DESCRIPTION']}
              rows={[
                ['balance', 'bal', 'ETH gas balance + $VIRTUAL token balance for the connected wallet.'],
                ['whoami', '—', 'Display connected wallet address (local — no API call).'],
                ['fees', '—', 'Accumulated creator fee earnings from agent token trades. Requires calibration (C5).'],
              ]}
            />

            <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: 'var(--out-ink)' }}>MARKET COMMANDS</div>
            <Table
              headers={['COMMAND', 'DESCRIPTION']}
              rows={[
                ['market', 'Market overview — newest agent tokens first. Same as market newest.'],
                ['market newest', 'Newest launched agents sorted by creation time.'],
                ['market trending', 'Trending agents ordered by 24h trading volume.'],
                ['token <address>', 'Token detail: spot price, bonding curve progress, 24h volume, holders.'],
              ]}
            />

            <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: 'var(--out-ink)' }}>PORTFOLIO COMMANDS</div>
            <Table
              headers={['COMMAND', 'ALIAS', 'DESCRIPTION']}
              rows={[
                ['launches', 'my', 'All agent tokens launched from the connected wallet, with status and curve progress.'],
              ]}
            />

            <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: 'var(--out-ink)' }}>SYSTEM COMMANDS</div>
            <Table
              headers={['COMMAND', 'ALIAS', 'DESCRIPTION']}
              rows={[
                ['status', '—', 'Live protocol RPC health, calibration state, and graduation threshold.'],
                ['version', 'ver', 'CLI version, build date, chain params, model, and custody model.'],
                ['clear', 'cls', 'Clear terminal output and reprint the boot banner.'],
                ['help', '?', 'Print the full command reference in the terminal.'],
              ]}
            />

            <div className="border p-3 mt-2" style={{ borderColor: 'var(--out-grid-major)', background: '#0A0F0A' }}>
              <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>NATURAL LANGUAGE FALLBACK</div>
              <p className="text-[10px] leading-relaxed font-mono" style={{ color: 'var(--out-text)' }}>
                Any input that does not match a structured command is forwarded verbatim to the AI agent as a natural-language
                instruction. The agent calls the appropriate tool and streams its response back to the terminal.
                Example: <span style={{ color: 'var(--out-ink)' }}>"what is the cheapest agent token right now?"</span>
              </p>
            </div>

            {/* §9.2 Operator Scripts */}
            <div className="text-[10px] uppercase tracking-widest mt-4 mb-1" style={{ color: 'var(--out-muted)' }}>§9.2 OPERATOR SCRIPTS (SERVER-SIDE)</div>
            <P>All server-side operational tasks run as npm scripts. No manual chain interaction required in production.</P>
            <Code>{`# DEVELOPMENT
npm run dev                         # Start frontend + API server + indexer (local)
npm run db:migrate                  # Apply Drizzle ORM schema migrations to Postgres
npm run indexer                     # Run the event watcher as a standalone process

# CALIBRATION  (one-time, ~30 minutes — see §9.3)
npm run calibrate -- --tx <hash>    # Auto-discover factory address, ABI, and $VIRTUAL
                                    # address from a real Robinhood Chain launch tx.
                                    # Writes .env.calibration + config/*.json for review.
npm run verify-config               # Standalone boot healthcheck: simulates a dummy
                                    # eth_call against the factory, checks $VIRTUAL
                                    # bytecode exists. Prints PASS or FAIL with reason.

# TESTING
npm run simulate-launch -- \\
  --name <name> --ticker <ticker>   # Dry-run the full TX-engine path: validates params,
  [--buy <virtualAmount>]           # encodes calldata, runs eth_call simulation, prints
                                    # gas estimate. Signs nothing, writes nothing on-chain.

# MAINTENANCE
npm run backfill -- --from-block <n>
                                    # Replay factory event logs from Blockscout into
                                    # Postgres from block <n> forward (for re-indexing
                                    # or recovering from a missed-event gap).`}</Code>

            {/* §9.3 Calibration Runbook */}
            <div className="text-[10px] uppercase tracking-widest mt-4 mb-1" style={{ color: 'var(--out-muted)' }}>§9.3 CALIBRATION RUNBOOK (~30 MINUTES, ONE-TIME)</div>
            <P>
              Calibration resolves the unknown contract addresses C1–C4 (see §2) by reading them directly from
              the blockchain. The process requires one real Virtuals launch transaction on Robinhood Chain as a reference.
            </P>
            <div className="flex flex-col gap-2">
              {[
                'On app.virtuals.io, open any recently launched token whose chain is ROBINHOOD. Open the token page and copy its Blockscout URL to find the creation transaction hash.',
                'Run `npm run calibrate -- --tx <creationTxHash>`. The script fetches the tx via Blockscout, extracts the factory address (C1), pulls the verified ABI (C2), finds the $VIRTUAL address from sibling curve-buy txs (C3), and writes a proposed `.env.calibration` + `config/*.json` for operator review.',
                'Review the emitted `.env.calibration` (C1 factory address, C3 $VIRTUAL address) and generated ABIs (C2/C4). Cross-check addresses against Blockscout\'s verified contract source. Never accept auto-generated values without verification.',
                'Merge the verified values into `.env`. Run `npm run verify-config` — this must print PASS before proceeding.',
                'Run `npm run simulate-launch -- --name TestAgent --ticker TST`. The simulation must succeed (eth_call returns OK or "execution reverted" — both confirm the contract is live).',
                'Restart the app. The CALIBRATION REQUIRED banner clears automatically. Perform one real throwaway launch end-to-end on testnet (or with a dust amount on mainnet) before announcing public availability.',
              ].map((step, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="text-[9px] border px-1.5 py-0.5 shrink-0 font-bold" style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>0{i + 1}</span>
                  <p className="text-[10px] leading-relaxed" style={{ color: 'var(--out-text)' }}>{step}</p>
                </div>
              ))}
            </div>

            {/* §9.4 Operational Invariants */}
            <div className="text-[10px] uppercase tracking-widest mt-4 mb-1" style={{ color: 'var(--out-muted)' }}>§9.4 OPERATIONAL INVARIANTS</div>
            <div className="flex flex-col gap-1.5">
              {[
                '`verify-config` (the boot healthcheck) runs at every app restart and every 10 minutes. A FAIL automatically flips the app to read-only CALIBRATION REQUIRED mode — launching is disabled until PASS is restored.',
                'The backend holds no private keys anywhere. There is no key-shaped secret to leak; the attack surface is config values only.',
                'Public RPC endpoints are rate-limited and acceptable for development only. Production deployments require `RPC_URL_OVERRIDE` (Alchemy, QuickNode, or dRPC — all officially support Robinhood Chain).',
                'The in-app CLI Tab autocomplete and ↑↓ history are client-only features — they never touch the API. Only `stream`-kind commands reach the backend.',
              ].map((inv, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span style={{ color: 'var(--out-ink)' }}>⬡</span>
                  <p className="text-[10px] leading-relaxed" style={{ color: 'var(--out-text)' }}>{inv}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* §10 Security */}
          <Section id="wp-s10" n="§10" title="Security Model & Threat Analysis">
            <Table
              headers={['THREAT', 'MITIGATION']}
              rows={[
                ['LLM hallucinates parameters or targets', 'LLM output is schema-validated JSON; TX Engine re-validates; only the config-layer factory address is ever callable'],
                ['Prompt injection via on-chain names/descriptions', 'All chain text treated as data; broadcasts only from UI button events, never from chat content'],
                ['Malicious frontend mutation of tx', 'Preview card renders decoded fields from the same unsigned tx object the wallet receives; wallets display to/value/data for final verification'],
                ['Impersonation launches (fake $ETH, $BTC, etc.)', 'Deterministic ticker blocklist + report path'],
                ['Spam / Sybil flooding', 'Per-wallet rate limit (5 launches/hour); gas costs remain the user\'s'],
                ['Contract upgrade breaking integration', 'Config layer + 10-minute healthcheck + auto read-only fallback (F7)'],
                ['Custody / regulatory exposure', 'None by design: no user funds, no keys, user signs everything; creator fees flow user↔protocol directly'],
                ['Data poisoning of market stats', 'Indexer trusts only chain logs + Blockscout; no third-party unverified feeds by default'],
              ]}
            />
          </Section>

          {/* §11 Environment */}
          <Section id="wp-s11" n="§11" title="Environment & Configuration Reference">
            <Code>{`# REQUIRED
ANTHROPIC_API_KEY=                 # LLM (Claude Sonnet 4)
DATABASE_URL=                      # PostgreSQL connection string

# CALIBRATION (fill via §9.2 runbook)
VIRTUALS_FACTORY_ADDRESS=          # C1 — from calibration, never guessed
VIRTUAL_TOKEN_ADDRESS=             # C3 — from calibration, never guessed

# NETWORK
NETWORK=mainnet                    # mainnet | testnet
RPC_URL_OVERRIDE=                  # production RPC endpoint (Alchemy, QuickNode, dRPC)
GRADUATION_THRESHOLD=42000000000000000000000   # 42,000e18 default (V10)

# OPTIONAL
VITE_WALLETCONNECT_PROJECT_ID=     # WalletConnect v2 modal
SESSION_SECRET=                    # session signing`}</Code>
            <P><Highlight>Config files:</Highlight> <code style={{ color: 'var(--out-ink)' }}>config/virtualsFactoryAbi.json</code>, <code style={{ color: 'var(--out-ink)' }}>config/bondingCurveAbi.json</code> — shipped as clearly labeled stubs; replaced during calibration (C2/C4).</P>
          </Section>

          {/* §12 Roadmap */}
          <Section id="wp-s12" n="§12" title="Roadmap">
            <div className="flex flex-col gap-3">
              {[
                { ver: 'v1 (CURRENT)', items: ['Chat launch (Instant Launch)', 'Optional initial $VIRTUAL dev buy', 'Live Virtuals Protocol market dashboard', 'Creator-fee readout post-calibration', 'RWA Trade interface — 15 tokenized equities & ETFs live on Robinhood Chain', 'Live price oracle via Blockscout + OHLCV feed (changePct, volume, open/high/low)', 'TradingView candlestick charts embedded natively per asset', 'RWA trade history & portfolio dashboard'] },
                { ver: 'v1.1 (IN PROGRESS)', items: ['On-chain RWA swap execution via Uniswap V3 SwapRouter on Robinhood Chain (exactInputSingle WETH → RWA token)', 'Buy/sell curve trades for agent tokens via chat (same preview→sign doctrine)', 'Watchlist alerts (graduation, ±X% price moves)'] },
                { ver: 'v1.2', items: ['Autonomous agent-driven RWA trade execution — Market Agent detects signal, Execution Agent routes swap, Portfolio Agent manages positions', 'Agent-automated portfolio rebalancing with deterministic policy engine', 'RWA position P&L tracking with unrealised/realised breakdown'] },
                { ver: 'v2', items: ['Multi-asset autonomous portfolio management across agent tokens and RWA tokens', 'Cross-agent coordination: Intelligence Agent feeds macro signals to Execution Agent', 'Optional MPC server wallets (Privy/Turnkey) for headless agent execution behind deterministic policy — targeting trades, NOT launches'] },
                { ver: 'v2.x', items: ['Genesis/Fund-Raise mode support if/when programmatic paths are confirmed', 'Multi-chain (Base) toggle reusing the same config layer', 'Expanded RWA registry beyond 15 tokens as Robinhood Chain lists additional assets'] },
              ].map(r => (
                <div key={r.ver} className="border p-4" style={{ borderColor: 'var(--out-grid-major)' }}>
                  <div className="text-[10px] uppercase tracking-widest mb-2 font-bold" style={{ color: 'var(--out-ink)' }}>{r.ver}</div>
                  <ul className="flex flex-col gap-1">
                    {r.items.map((item, i) => (
                      <li key={i} className="flex gap-2 text-[10px] leading-relaxed" style={{ color: 'var(--out-text)' }}>
                        <span style={{ color: 'var(--out-ink)' }}>▷</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          {/* §13 Token Economics */}
          <Section id="wp-s13" n="§13" title="Token Economics">

            {/* 13.1 Virtuals Bonding Curve */}
            <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>§13.1 VIRTUALS BONDING CURVE — CONSTANT PRODUCT WITH VIRTUAL RESERVES</div>
            <P>
              Virtuals Protocol uses a <Highlight>constant-product AMM</Highlight> (Uniswap v2 mechanics) augmented with virtual reserves so the curve starts with a finite, non-zero price. Each agent token launches its own isolated bonding curve paired with $VIRTUAL.
            </P>
            <Code>{`Invariant:   x · y = k   (held constant across every trade)

  x  =  virtual_reserve_VIRTUAL   (starts at x₀ — protocol-set, calibration C4)
  y  =  virtual_reserve_TOKEN     (starts at y₀ = total_token_supply)
  k  =  x₀ · y₀

Spot price at any point:
  P(x, y)  =  x / y               [ $VIRTUAL per TOKEN ]

After buying Δ_VIRTUAL worth of tokens:
  x'  =  x  +  Δ_VIRTUAL · (1 − fee)       ← fee = 1 % (V8)
  y'  =  k / x'
  tokens_out  =  y − y'

After selling Δ_TOKEN tokens:
  y'  =  y  +  Δ_TOKEN
  x'  =  k / y'
  virtual_out  =  x − x'  −  (x − x') · fee   ← 1 % sell fee

Raised counter  +=  Δ_VIRTUAL · (1 − fee)   [ real $VIRTUAL flowing in ]

Graduation condition:
  raised_VIRTUAL  ≥  42,000 $VIRTUAL          (V10 — verified on-chain)
  → Uniswap v3 pool seeded automatically; bonding curve disabled`}</Code>

            {/* 13.2 Anti-Sniper */}
            <div className="text-[10px] uppercase tracking-widest mt-4 mb-1" style={{ color: 'var(--out-muted)' }}>§13.2 ANTI-SNIPER TAX DECAY</div>
            <P>
              Optional, founder-configured. Buy-side tax linearly decays from 99 % to the 1 % protocol floor over a window T the creator picks (0 – 98 min). Sell tax is fixed at 1 % from block 0.
            </P>
            <Code>{`buy_tax(t)  =  max( 0.01,  0.99 − 0.98 · (t / T) )

  t   =  seconds elapsed since launch block
  T   =  decay_window ∈ [0, 5 880]  seconds (0 = no protection)

  t = 0            →  buy_tax = 99 %
  t = T / 2        →  buy_tax = 50 %
  t = T            →  buy_tax = 1 %  (floor, permanent)
  t > T            →  buy_tax = 1 %

Effective tokens received by a buyer during the window:
  tokens_out_net  =  tokens_out_gross · (1 − buy_tax(t))

sell_tax  =  0.01  (constant, all phases)`}</Code>

            {/* 13.3 Trading Fee Split */}
            <div className="text-[10px] uppercase tracking-widest mt-4 mb-1" style={{ color: 'var(--out-muted)' }}>§13.3 TRADING FEE SPLIT (1 % PROTOCOL FEE)</div>
            <P>
              Every trade generates a 1 % fee denominated in $VIRTUAL. The split between creator and Virtuals Protocol treasury is defined in the calibrated ABI (C5). Below is the structural formula; exact ratios resolved post-calibration.
            </P>
            <Code>{`total_fee  =  trade_virtual_volume · 0.01

creator_share   =  total_fee · r_creator       [r_creator — from calibrated ABI, C5]
protocol_share  =  total_fee · (1 − r_creator)

Cumulative creator earnings for token A:
  earnings_A  =  Σ ( buy_volume_i · 0.01 · r_creator )
              +  Σ ( sell_volume_j · 0.01 · r_creator )

Creator claim: r_creator is auto-forwarded OR claim-based depending on C5.
OUTRIVE exposes this via get_creator_fees tool (F5) and a sign-to-claim flow
once the ABI is calibrated.`}</Code>

            {/* 13.4 OUTRIVE Token Distribution */}
            <div className="text-[10px] uppercase tracking-widest mt-4 mb-1" style={{ color: 'var(--out-muted)' }}>§13.4 $OTR TOKEN — SUPPLY & DISTRIBUTION</div>
            <P>
              $OTR is the OUTRIVE platform token. It is used for fee discounts, staking to earn protocol revenue, and governance. It is <Highlight>not required</Highlight> to launch an agent — the launch flow only needs $VIRTUAL (Virtuals Protocol) and ETH for gas.
            </P>
            <Table
              headers={['TRANCHE', 'ALLOCATION', 'TOKENS', 'VESTING']}
              rows={[
                ['Community & Launch Mining', '40 %', '400,000,000', 'Emitted over 48 months via staking + launch rewards'],
                ['Team & Advisors', '20 %', '200,000,000', '4-yr linear, 1-yr cliff'],
                ['Ecosystem & Partnerships', '15 %', '150,000,000', '3-yr linear, 6-mo cliff'],
                ['Treasury (DAO-controlled)', '15 %', '150,000,000', 'Unlocked; spend requires governance vote'],
                ['Seed Investors', '10 %', '100,000,000', '2-yr linear, 6-mo cliff'],
                ['TOTAL', '100 %', '1,000,000,000', '—'],
              ]}
            />
            <Code>{`Max supply  =  1,000,000,000 $OTR  (hard cap, no additional mint)
Initial circulating supply at TGE:
  ≈ 5 % treasury unlock  +  0 % team (cliff locked)
  =  ~50,000,000 $OTR  (~5 % of max supply)

Token contract: ERC-20 + ERC-20Burnable + Ownable2Step (OpenZeppelin v5)
  mint()   — owner only, disabled after max_supply reached
  burn()   — open to any holder; used by buyback mechanism`}</Code>

            {/* 13.5 OUTRIVE Platform Fee */}
            <div className="text-[10px] uppercase tracking-widest mt-4 mb-1" style={{ color: 'var(--out-muted)' }}>§13.5 OUTRIVE PLATFORM FEE</div>
            <P>
              OUTRIVE charges a small fee on the optional initial dev buy. Standard launches with zero dev buy incur <Highlight>no OUTRIVE fee</Highlight> — gas and the Virtuals 1 % trading fee remain the user's only costs.
            </P>
            <Code>{`outrive_fee  =  initial_dev_buy_VIRTUAL · 0.005   (0.5 %)

  initial_dev_buy = 0     →  outrive_fee = 0  (no charge)
  initial_dev_buy = 1,000 →  outrive_fee = 5  $VIRTUAL

Collected by OutriveFeeCollector contract. Distribution:
  50 %  →  OuTriveStaking reward pool  (claimable by $OTR stakers)
  30 %  →  Treasury multi-sig
  20 %  →  Buyback & burn $OTR     (deflationary pressure)

$OTR stakers receive a 20 % discount on the platform fee:
  discounted_fee  =  initial_dev_buy_VIRTUAL · 0.004   (0.4 %)`}</Code>

            {/* 13.6 Staking Yield */}
            <div className="text-[10px] uppercase tracking-widest mt-4 mb-1" style={{ color: 'var(--out-muted)' }}>§13.6 STAKING YIELD FORMULA</div>
            <P>
              Yield is proportional to stake share of the pool, funded by 50 % of OUTRIVE platform fees. APY is variable and determined by launch volume.
            </P>
            <Code>{`Per-epoch reward (epoch = 7 days):
  reward(user)  =  (stake_user / stake_total) · fee_pool_epoch

where:
  fee_pool_epoch  =  Σ outrive_fees_collected_in_epoch · 0.50

Annualised APY estimate:
  annual_fee_pool  =  avg_daily_launch_volume · 0.5 % · 50 % · 365
  APY              =  annual_fee_pool / stake_total_VIRTUAL_value

Example (illustrative):
  avg daily launch dev-buy volume  =  50,000 $VIRTUAL
  annual fee pool to stakers       =  50,000 · 0.005 · 0.50 · 365  =  45,625 $VIRTUAL eq.
  total staked $OTR value      =  5,000,000 $VIRTUAL eq.
  implied APY                      ≈  0.91 %  base case
  (grows linearly with launch volume)`}</Code>

            <div className="border p-3 mt-2" style={{ borderColor: 'var(--out-grid-major)', background: '#0A0F0A' }}>
              <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>DEPENDENCY NOTE</div>
              <p className="text-[10px] leading-relaxed font-mono" style={{ color: 'var(--out-text)' }}>
                Sections §13.1–13.3 describe Virtuals Protocol mechanics. The exact values of <Highlight>x₀</Highlight>, <Highlight>y₀</Highlight>, and <Highlight>r_creator</Highlight> are resolved during calibration (C4–C5). Sections §13.4–13.6 describe OUTRIVE's own contracts and are fully under OUTRIVE's control.
              </p>
            </div>
          </Section>

          {/* §14 Legal */}
          <Section id="wp-s14" n="§14" title="Risk Disclosure & Legal Posture">
            <div className="border p-4" style={{ borderColor: '#f59e0b', background: '#120f02' }}>
              <p className="text-[11px] leading-relaxed font-mono" style={{ color: '#f59e0b' }}>
                OUTRIVE is a non-custodial software interface. It never holds user funds or keys, executes nothing without a user signature, and provides no financial advice. Agent/launchpad tokens are highly speculative and may lose all value. Protocol parameters cited here (fees, thresholds, modes) belong to Virtuals Protocol and can change at any time; OUTRIVE's healthcheck-and-config architecture exists precisely because of that. OUTRIVE is not affiliated with Virtuals Protocol, Robinhood, or Anthropic. Operators should obtain their own legal advice for their jurisdiction before public release.
              </p>
            </div>
          </Section>

          {/* §15 Glossary */}
          <Section id="wp-s15" n="§15" title="Glossary">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { term: 'Bonding Curve', def: 'Deterministic pricing contract; buying raises price, selling lowers it.' },
                { term: 'Prototype', def: 'Pre-graduation phase on the bonding curve.' },
                { term: 'Graduation', def: 'Automatic migration to a Uniswap pool at 42,000 $VIRTUAL raised.' },
                { term: 'Creator of Record', def: 'The msg.sender of the launch transaction — always the user in OUTRIVE.' },
                { term: 'Calibration', def: 'One-time on-chain discovery of Virtuals contract addresses/ABIs (§9.2).' },
                { term: 'Work Order', def: "OUTRIVE's mandatory pre-signature preview card shown before any tx." },
                { term: 'Instant Launch', def: "Virtuals' immediate, no-base-fee launch mode automated by OUTRIVE v1." },
                { term: 'Anti-Sniper Protection', def: 'Optional buy-side tax starting at 99% and decaying to 1% over 0–98 min; sell tax fixed 1%.' },
                { term: 'TX Engine', def: 'Deterministic backend module that validates, encodes, and simulates transactions without signing.' },
                { term: '$VIRTUAL', def: 'Native ERC-20 of Virtuals Protocol; bonding curves are priced in $VIRTUAL.' },
                { term: 'CALIBRATION REQUIRED', def: 'App mode when C1–C4 env vars are unset; read-only, launching disabled.' },
                { term: 'UNDERGRAD / BONDING', def: 'API status for a token still on its bonding curve, pre-graduation.' },
                { term: 'RWA (Real-World Asset)', def: 'A tokenized representation of a traditional financial asset — equity, ETF, or commodity — issued as an ERC-20 on Robinhood Chain.' },
                { term: 'OHLCV', def: 'Open, High, Low, Close, Volume — the standard daily candlestick data set sourced from institutional market feeds (§16).' },
                { term: 'Blockscout Oracle', def: 'The on-chain price oracle embedded in Blockscout explorer; OUTRIVE reads exchange_rate from /api/v2/tokens to get live USD prices for RWA tokens (§16).' },
                { term: 'RobinhoodRouter', def: 'Fee-taking meta-router at 0xEa4F57DbC… on Robinhood Chain; the only correct on-chain swap path for RWA tokenized equities & ETFs. Routes internally via Uniswap V2 single-hop (WETH↔token). Exposes buy(SwapParams) and sell(SwapParams) (§16, §17).' },
                { term: 'Autonomous Agent', def: 'An on-chain economic actor deployed via Virtuals Protocol that executes market analysis, order construction, and swap execution without human intervention (§17).' },
                { term: 'Market Agent', def: 'Autonomous agent type that monitors live RWA price feeds and detects momentum signals, volume anomalies, and trend reversals (§17).' },
                { term: 'Execution Agent', def: 'Autonomous agent type that routes constructed orders through RobinhoodRouter (Protocol FLAP) on Robinhood Chain — RWA tokens use FlapPortal, not AMM pools (§17).' },
              ].map(g => (
                <div key={g.term} className="border p-3" style={{ borderColor: 'var(--out-grid-major)' }}>
                  <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--out-ink)' }}>{g.term}</div>
                  <div className="text-[10px] leading-relaxed" style={{ color: 'var(--out-muted)' }}>{g.def}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* §16 RWA Trade Infrastructure */}
          <Section id="wp-s16" n="§16" title="RWA Trade Infrastructure">
            <P>
              OUTRIVE operates a <Highlight>Real-World Asset trading interface</Highlight> natively on Robinhood Chain — a live terminal for tokenized equities and ETFs issued as ERC-20 tokens on-chain. The infrastructure is built on a dual data architecture: on-chain prices are sourced from the Blockscout oracle (fast, batch, no rate limit), while OHLCV candlestick data is sourced from an institutional market feed (sequential, cached at 10-minute TTL). Both streams are merged into a unified quote object served to the frontend.
            </P>

            <div className="text-[10px] uppercase tracking-widest mt-2 mb-1" style={{ color: 'var(--out-muted)' }}>TOKEN REGISTRY — 15 RWA ASSETS ON ROBINHOOD CHAIN</div>
            <Table
              headers={['SYMBOL', 'NAME', 'ASSET CLASS']}
              rows={[
                ['NVDA',  'NVIDIA Corporation',      'Equity — Semiconductor'],
                ['AAPL',  'Apple Inc.',               'Equity — Technology'],
                ['GOOGL', 'Alphabet Inc.',            'Equity — Technology'],
                ['TSLA',  'Tesla Inc.',               'Equity — Automotive / EV'],
                ['META',  'Meta Platforms Inc.',      'Equity — Technology'],
                ['MSFT',  'Microsoft Corporation',    'Equity — Technology'],
                ['AMZN',  'Amazon.com Inc.',          'Equity — E-Commerce / Cloud'],
                ['AMD',   'Advanced Micro Devices',   'Equity — Semiconductor'],
                ['PLTR',  'Palantir Technologies',    'Equity — Data / AI'],
                ['MU',    'Micron Technology',        'Equity — Semiconductor'],
                ['ORCL',  'Oracle Corporation',       'Equity — Enterprise Software'],
                ['SNDK',  'SanDisk Corp. (WD)',       'Equity — Storage'],
                ['SPCX',  'Procure Space ETF',        'ETF — Aerospace & Defense'],
                ['SPY',   'SPDR S&P 500 ETF Trust',   'ETF — Broad Market'],
                ['QQQ',   'Invesco QQQ Trust',        'ETF — Nasdaq-100'],
              ]}
            />

            <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: 'var(--out-muted)' }}>DUAL DATA ARCHITECTURE</div>
            <Code>{`PRICE LAYER — Blockscout On-Chain Oracle
  Source     GET /api/v2/tokens?type=ERC-20 → exchange_rate field
  Frequency  Batch, all 15 tokens in one request (~500ms)
  TTL        60 seconds
  No rate limit · No API key required

OHLCV LAYER — Institutional Market Data Feed
  Fields     open, high, low, changePct, volume, 52W high/low
  Frequency  Sequential with 800ms gap between symbols (~13s full cycle)
  TTL        10 minutes
  Startup    Lazy — triggered on first /api/rwa/quotes request

MERGE — buildQuoteList()
  Joins Blockscout spot price with cached OHLCV data per symbol
  Frontend shows "—" for changePct during OHLCV warmup window (hasOhlcv guard)

LOGO LAYER — TradingView SVG CDN
  Source     s3-symbol-logo.tradingview.com/{company}--big.svg
  Direct browser fetch — no proxy required
  Verified working for all 15 symbols`}</Code>

            <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: 'var(--out-muted)' }}>API ENDPOINTS</div>
            <Table
              headers={['ENDPOINT', 'PURPOSE']}
              rows={[
                ['GET /api/rwa/quotes',          'Full quote list for all 15 tokens — price, changePct, OHLCV, market cap'],
                ['GET /api/rwa/tokens',          'Static registry — symbol, name, address, description'],
                ['GET /api/rwa/eth-price',       'Live ETH/USD price for ETH-denominated order sizing'],
                ['GET /api/rwa/logo/:address',   'Server-side logo proxy (legacy Robinhood CDN path — superseded by TradingView direct)'],
                ['POST /api/rwa/trades',         'Record a trade — wallet, symbol, side, shares, priceUsd, ethAmount, txHash'],
                ['GET /api/rwa/trades',          'Trade history for a given wallet address — powers Dashboard portfolio view'],
              ]}
            />

            <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: 'var(--out-muted)' }}>ON-CHAIN SWAP EXECUTION</div>
            <Code>{`Router: RobinhoodRouter — 0xEa4F57DbC875889EbC435722cbFAa4A16B19B452
         (verified source on Robinhood Chain Blockscout)
         Fee-taking meta-router; routes internally via Uniswap V2.
         RWA tokens have NO Uniswap V3/V4 pools — this is the only
         correct on-chain path for tokenized equities & ETFs.

SwapParams struct:
  protocol:     3          // Protocol.FLAP — FlapPortal native mint/redeem for RWA tokens
  token:        <RWA ERC-20 address>
  fee:          0          // ignored for V2 path
  amountIn:     0          // BUY: ignored (router uses msg.value)
  minAmountOut: 0          // v1: no slippage floor
  recipient:    <user wallet address>
  extra:        0x         // empty = WETH↔token single-hop via _v2Path

BUY path  (ETH → RWA token):
  RobinhoodRouter.buy(SwapParams)
  tx.value = ETH amount in wei  |  gas limit: 400,000
  Router skims feeBps from ETH, then swaps remainder for RWA token
  → wallet_watchAsset called post-confirm so token appears in MetaMask

SELL path (RWA token → ETH):
  Step 1: ERC-20 approve(RobinhoodRouter, MAX_UINT256) on token contract
  Step 2: RobinhoodRouter.sell(SwapParams)
  amountIn = token shares in wei  |  gas limit: 400,000`}</Code>
          </Section>

          {/* §17 Autonomous Agent Trading */}
          <Section id="wp-s17" n="§17" title="Autonomous Agent Trading System">
            <P>
              The Autonomous Agent Trading system is OUTRIVE's most advanced capability — a layer of specialized on-chain agents, deployed via Virtuals Protocol on Robinhood Chain, that can analyze market conditions, construct trade orders, and execute swaps without manual user intervention. Each agent is an independent on-chain economic actor with its own wallet, logic, and verifiable trade history. Agents are deterministic by design: they never hallucinate parameters, and every swap routes through the same RobinhoodRouter used in the manual trade flow.
            </P>

            <div className="text-[10px] uppercase tracking-widest mt-2 mb-1" style={{ color: 'var(--out-muted)' }}>AGENT TYPES</div>
            <Table
              headers={['AGENT', 'ROLE', 'DATA INPUTS']}
              rows={[
                ['Market Agent',       'Monitors live RWA price feeds; detects momentum signals, volume anomalies, and trend reversals', 'Blockscout oracle, OHLCV feed, 52W H/L'],
                ['Portfolio Agent',    'Manages open RWA positions; enforces stop-losses, profit-taking thresholds, and periodic rebalancing', 'rwa_trades table, live quotes, user-defined policy'],
                ['Execution Agent',    'Routes constructed orders through RobinhoodRouter (Protocol FLAP) — FlapPortal native minting, no AMM required', 'RobinhoodRouter, token registry, gas oracle'],
                ['Intelligence Agent', 'Synthesizes macro signals and on-chain flow data into actionable trade theses; feeds Market Agent', 'OHLCV, market breadth, agent token sentiment'],
              ]}
            />

            <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: 'var(--out-muted)' }}>END-TO-END AUTONOMOUS TRADE FLOW</div>
            <Code>{`USER / AGENT INTENT
        │
        ▼
 OUTRIVE AGENT FACTORY (Virtuals Protocol — Robinhood Chain)
        │
        ├─► INTELLIGENCE AGENT
        │     Macro signals + on-chain flow → trade thesis
        │     e.g. "NVDA momentum positive, volume +34% vs 10-day avg"
        │
        ├─► MARKET AGENT
        │     Monitors Blockscout oracle (60s TTL) + OHLCV (10min TTL)
        │     Detects signal crossing threshold → emits trade intent
        │     e.g. { symbol: "NVDA", side: "BUY", confidence: 0.87 }
        │
        ├─► PORTFOLIO AGENT
        │     Checks existing position + policy constraints
        │     e.g. max 20% single-asset allocation, no duplicate buys
        │     Approves or rejects trade intent
        │
        ├─► EXECUTION AGENT
        │     Resolves ERC-20 address from token registry
        │     Fetches live ETH/USD price → computes amountIn (wei)
        │     Constructs SwapParams struct (protocol=FLAP, extra=0x)
        │     Simulates via eth_call → check revert
        │     Submits signed transaction → RobinhoodRouter.buy() / .sell()
        │
        └─► TRADE RECORDING
              POST /api/rwa/trades → rwa_trades table
              { wallet, symbol, side, shares, priceUsd,
                ethAmount, txHash, status, source: "agent" }
              Visible in Dashboard under open positions & history`}</Code>

            <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: 'var(--out-muted)' }}>AGENT BEHAVIORAL CONSTRAINTS</div>
            <div className="flex flex-col gap-1.5">
              {[
                'Agents never bypass the TX Engine simulation step. A simulated revert cancels the trade and logs the reason — no gas is wasted.',
                'Position sizing is bounded by the deterministic policy engine. No single agent trade may exceed the user-configured maximum allocation per asset.',
                'Agent-executed trades are tagged source="agent" in rwa_trades, distinguishing them from manual trades (source="manual") in the Dashboard.',
                'The Execution Agent uses the same RobinhoodRouter (Protocol FLAP) as the manual trade flow — identical SwapParams construction, identical gas limits.',
                'All agent wallets are non-custodial — OUTRIVE never holds agent keys. Agents deployed via Virtuals Protocol hold their own keys under the Virtuals custody model.',
                'Intelligence Agent outputs are advisory signals only. The Portfolio Agent applies deterministic policy rules before any execution proceeds — the LLM cannot unilaterally trigger a swap.',
              ].map((rule, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span style={{ color: 'var(--out-ink)' }}>⬡</span>
                  <p className="text-[10px] leading-relaxed" style={{ color: 'var(--out-text)' }}>{rule}</p>
                </div>
              ))}
            </div>

            <div className="border-l-2 pl-4 py-2 mt-2 italic" style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>
              Design doctrine: agents decide <em>what</em> to trade; the policy engine decides <em>whether</em>; RobinhoodRouter executes <em>how</em>. No human in the loop — but no LLM without a deterministic guard either.
            </div>
          </Section>

          {/* Footer */}
          <div className="border-t pt-4 font-mono text-[9px] uppercase tracking-widest flex justify-between items-center" style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
            <span>OUTRIVE WHITEPAPER V1.1 · JULY 2026 · SHEET REV. B</span>
            <span style={{ color: 'var(--out-ink-dim)' }}>NOT FINANCIAL ADVICE · INDEPENDENT SOFTWARE</span>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
