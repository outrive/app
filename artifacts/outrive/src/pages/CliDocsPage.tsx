import React, { useState, useCallback } from 'react';
import { Sheet } from '@/components/Sheet';

/* ─── Copy button ─────────────────────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [text]);
  return (
    <button
      onClick={copy}
      className="shrink-0 font-mono text-[9px] uppercase tracking-widest px-2 py-1 border transition-colors"
      style={{
        borderColor: copied ? 'var(--out-ink)' : 'var(--out-grid-major)',
        color: copied ? 'var(--out-ink)' : 'var(--out-muted)',
        background: copied ? '#12200f' : 'transparent',
      }}
    >
      {copied ? '✓ COPIED' : 'COPY'}
    </button>
  );
}

/* ─── URL row with copy ───────────────────────────────────────────────────── */
function UrlRow({ label, url, note }: { label: string; url: string; note?: string }) {
  return (
    <div className="border p-3 flex flex-col gap-2" style={{ borderColor: 'var(--out-grid-major)' }}>
      <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>{label}</div>
      <div className="flex items-center gap-2 min-w-0">
        <code
          className="flex-1 font-mono text-[11px] px-2 py-1 truncate"
          style={{ background: '#0A0F0A', color: 'var(--out-ink)', border: '1px solid var(--out-grid-major)' }}
          title={url}
        >
          {url}
        </code>
        <CopyButton text={url} />
      </div>
      {note && <div className="font-mono text-[10px]" style={{ color: 'var(--out-muted)' }}>{note}</div>}
    </div>
  );
}

/* ─── Chain badge ─────────────────────────────────────────────────────────── */
function ChainRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: 'var(--out-grid-major)' }}>
      <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>{label}</span>
      <div className="flex items-center gap-2">
        <code className="font-mono text-[10px]" style={{ color: 'var(--out-ink)' }}>{value}</code>
        {mono && <CopyButton text={value} />}
      </div>
    </div>
  );
}

/* ─── Shared primitives (match WhitepaperPage style) ─────────────────────── */
function Section({ id, n, title, children }: { id: string; n: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="flex flex-col gap-4 scroll-mt-20">
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

function Code({ children, label }: { children: string; label?: string }) {
  return (
    <div>
      {label && (
        <div className="text-[9px] uppercase tracking-widest px-4 py-1.5 font-mono"
          style={{ background: '#0f1a0f', borderTop: '1px solid var(--out-grid-major)', borderLeft: '1px solid var(--out-grid-major)', borderRight: '1px solid var(--out-grid-major)', color: 'var(--out-muted)' }}>
          {label}
        </div>
      )}
      <pre className="text-[10px] leading-relaxed p-4 overflow-x-auto"
        style={{ background: '#0A0F0A', border: '1px solid var(--out-grid-major)', color: 'var(--out-ink)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre', borderTop: label ? 'none' : '1px solid var(--out-grid-major)' }}>
        {children}
      </pre>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] border-collapse font-mono">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--out-ink-dim)' }}>
            {headers.map(h => (
              <th key={h} className="text-left py-1.5 pr-6 uppercase tracking-widest" style={{ color: 'var(--out-muted)', fontWeight: 400 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--out-grid-major)' }}>
              {row.map((cell, j) => (
                <td key={j} className="py-1.5 pr-6 align-top" style={{ color: 'var(--out-text)' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] leading-relaxed" style={{ color: 'var(--out-text)' }}>{children}</p>;
}

function Hl({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>{children}</span>;
}

function Cmd({ children }: { children: string }) {
  return (
    <code className="px-1.5 py-0.5 font-mono text-[10px]"
      style={{ background: '#0f1a0f', color: 'var(--out-ink)', border: '1px solid var(--out-grid-major)' }}>
      {children}
    </code>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center shrink-0">
        <div className="w-7 h-7 flex items-center justify-center font-mono text-[11px] font-bold border"
          style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)', background: '#12180f' }}>
          {n}
        </div>
        <div className="w-px flex-1 mt-1" style={{ background: 'var(--out-grid-major)' }} />
      </div>
      <div className="pb-4 flex-1 flex flex-col gap-2">
        <div className="font-mono text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

/* ─── Setup section — always uses production domain ──────────────────────── */
const PROD_ORIGIN = 'https://outrive.io';

function SetupSection() {
  // Always show the production domain regardless of which host is currently serving
  const appUrl = `${PROD_ORIGIN}/outrive`;
  const apiUrl = `${PROD_ORIGIN}/api-server`;

  return (
    <div id="cli-s0" className="flex flex-col gap-6 scroll-mt-20">

      {/* Section header */}
      <div className="flex items-baseline gap-3 border-b pb-2" style={{ borderColor: 'var(--out-ink)' }}>
        <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--out-ink)' }}>§0</span>
        <h2 className="font-mono text-[13px] font-bold uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>
          Setup &amp; Your URLs
        </h2>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 border"
          style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)', background: '#12200f' }}>
          ● START HERE
        </span>
      </div>

      {/* 3 requirements */}
      <div className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>
        3 things you need before you start
      </div>
      <div className="grid grid-cols-1 gap-3">

        {/* Req 1 — API URL */}
        <div className="border p-4 flex flex-col gap-3" style={{ borderColor: 'var(--out-ink)' }}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5"
              style={{ background: 'var(--out-ink)', color: '#000' }}>01</span>
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>
              API Server URL
            </span>
          </div>
          <p className="font-mono text-[10px] leading-relaxed" style={{ color: 'var(--out-muted)' }}>
            The CLI uses this URL to send commands to the OUTRIVE agent. Auto-resolved from the production domain.
          </p>
          <UrlRow label="Paste when CLI asks for API URL" url={apiUrl}
            note="Format: https://domain.com/api-server" />
        </div>

        {/* Req 2 — App URL */}
        <div className="border p-4 flex flex-col gap-3" style={{ borderColor: 'var(--out-grid-major)' }}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5"
              style={{ background: 'var(--out-ink-dim)', color: '#000' }}>02</span>
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>
              App URL
            </span>
          </div>
          <p className="font-mono text-[10px] leading-relaxed" style={{ color: 'var(--out-muted)' }}>
            The CLI opens the auth page at this URL for the one-time wallet signature step.
          </p>
          <UrlRow label="Paste when CLI asks for App URL" url={appUrl}
            note="Format: https://domain.com/outrive" />
        </div>

        {/* Req 3 — Wallet + Chain */}
        <div className="border p-4 flex flex-col gap-4" style={{ borderColor: 'var(--out-grid-major)' }}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5"
              style={{ background: 'var(--out-ink-dim)', color: '#000' }}>03</span>
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>
              Wallet — Robinhood Chain
            </span>
          </div>
          <p className="font-mono text-[10px] leading-relaxed" style={{ color: 'var(--out-muted)' }}>
            Make sure MetaMask or Rabby has Robinhood Chain added. Use the values below to add the network.
          </p>

          <div className="flex flex-col" style={{ borderTop: '1px solid var(--out-grid-major)' }}>
            <ChainRow label="Network Name"    value="Robinhood Chain" mono={false} />
            <ChainRow label="RPC URL"         value="https://rpc.mainnet.chain.robinhood.com" />
            <ChainRow label="Chain ID"        value="4663" />
            <ChainRow label="Currency"        value="ETH" mono={false} />
            <ChainRow label="Block Explorer"  value="https://explorer.mainnet.chain.robinhood.com" />
          </div>

          <div className="font-mono text-[9px] leading-relaxed p-3 border"
            style={{ borderColor: 'var(--out-grid-major)', color: 'var(--out-muted)', background: '#0a0f0a' }}>
            NOTE · During auth, your wallet only signs a plain text message (EIP-191) — not a transaction.
            No gas. No ETH leaves your wallet.
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-b" style={{ borderColor: 'var(--out-grid-major)' }} />
    </div>
  );
}

/* ─── TOC ─────────────────────────────────────────────────────────────────── */
const TOC = [
  { label: '§0 · Setup & URLs',          id: 'cli-s0' },
  { label: '§1 · Overview',              id: 'cli-s1' },
  { label: '§2 · Requirements',          id: 'cli-s2' },
  { label: '§3 · Quick Start (3 steps)', id: 'cli-s3' },
  { label: '§4 · Authentication',        id: 'cli-s4' },
  { label: '§5 · Command Reference',     id: 'cli-s5' },
  { label: '§6 · Trade Commands',        id: 'cli-s6' },
  { label: '§7 · Work Order',            id: 'cli-s7' },
  { label: '§8 · Config & Storage',      id: 'cli-s8' },
  { label: '§9 · Security Model',        id: 'cli-s9' },
  { label: '§10 · Full Session Example', id: 'cli-s10' },
  { label: '§11 · VPS Setup Guide',      id: 'cli-s11' },
  { label: '§12 · RWA Trade',            id: 'cli-s12' },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
export function CliDocsPage() {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  function scrollTo(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex gap-6">

      {/* ── Sidebar TOC ── */}
      <aside className="hidden xl:flex flex-col gap-1 w-52 shrink-0 sticky top-28 self-start font-mono text-[10px]">
        <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-muted)' }}>CONTENTS</div>
        {TOC.map(({ label, id }) => (
          <button key={id} onClick={() => scrollTo(id)}
            className="text-left py-1 px-2 transition-colors border-l-2"
            style={{
              borderLeftColor: activeSection === id ? 'var(--out-ink)' : 'transparent',
              color: activeSection === id ? 'var(--out-ink)' : 'var(--out-muted)',
            }}>
            {label}
          </button>
        ))}
        <div className="mt-4 pt-4 border-t text-[9px] uppercase tracking-widest" style={{ borderColor: 'var(--out-grid-major)', color: 'var(--out-muted)' }}>
          VERSION 1.1 · JULY 2026
        </div>
      </aside>

      {/* ── Main ── */}
      <Sheet dwgNo="OUT-CLI-01" figCaption="OUTRIVE CLI — COMMAND REFERENCE & ACCESS GUIDE" className="flex-1 min-w-0">
        <div className="py-6 flex flex-col gap-10">

          {/* ── Header ── */}
          <div className="border-b pb-6" style={{ borderColor: 'var(--out-ink-dim)' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="flex flex-col">
                <div className="font-mono text-[13px] font-bold tracking-widest" style={{ color: 'var(--out-ink)' }}>OUTRIVE · CLI</div>
                <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>Command-Line Interface · Access Guide & Reference · v1.0</div>
              </div>
            </div>

            {/* ASCII banner preview */}
            <Code label="terminal preview · outrive status">{`
  ╔══════════════════════════════════════════════════════════════╗
  ║                                                              ║
  ║   ██████╗ ██╗   ██╗████████╗██████╗ ██╗██╗   ██╗███████╗   ║
  ║  ██╔═══██╗██║   ██║╚══██╔══╝██╔══██╗██║██║   ██║██╔════╝   ║
  ║  ██║   ██║██║   ██║   ██║   ██████╔╝██║╚██╗ ██╔╝█████╗     ║
  ║  ██║   ██║██║   ██║   ██║   ██╔══██╗██║ ╚████╔╝ ██╔══╝     ║
  ║  ╚██████╔╝╚██████╔╝   ██║   ██║  ██║██║  ╚██╔╝  ███████╗   ║
  ║   ╚═════╝  ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚═╝   ╚═╝   ╚══════╝   ║
  ║                                                              ║
  ║  AI AGENT CLI           ROBINHOOD CHAIN · VIRTUALS PROTOCOL  ║
  ╠══════════════════════════════════════════════════════════════╣
  ║  WALLET    0x74Ae8C6dE15bf...664E6bB45                      ║
  ║  API       https://outrive.io/api-server                    ║
  ║  NETWORK   Robinhood Chain (chainId 4663)                   ║
  ║  FACTORY   0x43e4c17b15365596caae8e7d00e42bc8e988c2d4       ║
  ║  STATUS    ● ONLINE                                          ║
  ╠══════════════════════════════════════════════════════════════╣
  ║  run:  outrive help   to see all commands                    ║
  ╚══════════════════════════════════════════════════════════════╝
`}</Code>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[10px] mt-4">
              {[
                { k: 'RUNTIME',  v: 'Node.js 18+  (no install needed)' },
                { k: 'AUTH',     v: 'Wallet signature · EIP-191' },
                { k: 'NETWORK',  v: 'Robinhood Chain (chainId 4663)' },
              ].map(r => (
                <div key={r.k} className="border p-3" style={{ borderColor: 'var(--out-grid-major)' }}>
                  <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>{r.k}</div>
                  <div style={{ color: 'var(--out-text)' }}>{r.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* §0 Setup & URLs */}
          <SetupSection />

          {/* §1 Overview */}
          <Section id="cli-s1" n="§1" title="Overview">
            <P>
              The OUTRIVE CLI is a <Hl>zero-install terminal client</Hl> for the OUTRIVE AI agent.
              It lets you buy tokens, sell tokens, and issue free-form natural-language commands to the same AI agent that
              runs in the web app — all from your terminal or VPS.
            </P>
            <P>
              The CLI never holds your private key. Every trade generates a <Hl>Work Order</Hl> — a raw unsigned transaction
              that you must sign in your own wallet. Your key never leaves your device.
            </P>
            <div className="border-l-2 pl-4 py-2 font-mono text-[11px] italic"
              style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>
              The CLI sends natural-language commands → the AI agent builds the trade → you sign it yourself.
              Nothing executes without your wallet signature.
            </div>
          </Section>

          {/* §2 Requirements */}
          <Section id="cli-s2" n="§2" title="Requirements">
            <Table
              headers={['REQUIREMENT', 'DETAIL']}
              rows={[
                ['Node.js 18+', 'Uses native fetch + crypto (Web Crypto API). No npm install required.'],
                ['OUTRIVE web app access', 'You need to open the /cli-auth page in a browser once to authorize your wallet.'],
                ['OUTRIVE API URL', 'The base URL of the OUTRIVE API server: https://outrive.io/api-server'],
                ['EVM wallet (MetaMask, etc.)', 'For signing authorization message during outrive auth.'],
                ['Connected to Robinhood Chain', 'chainId 4663. RPC: https://rpc.mainnet.chain.robinhood.com'],
              ]}
            />
            <Code label="check node version">{`$ node --version
v20.11.0   ← must be 18.0.0 or higher`}</Code>
          </Section>

          {/* §3 Quick Start */}
          <Section id="cli-s3" n="§3" title="Quick Start (3 Steps)">

            <Step n="1" title="Download the CLI">
              <P>Copy <Cmd>outrive-cli.mjs</Cmd> to your machine. No additional packages needed.</P>
              <Code label="make executable (optional)">{`chmod +x outrive-cli.mjs`}</Code>
              <Code label="or run directly with node">{`node outrive-cli.mjs help`}</Code>
            </Step>

            <Step n="2" title="Authorize Your Wallet">
              <P>Run <Cmd>auth</Cmd> once. It will ask for your API URL and App URL, then print a link to open in your browser.</P>
              <Code label="terminal">{`$ node outrive-cli.mjs auth

OUTRIVE cli
→ Enter your OUTRIVE API URL:
  API URL: https://outrive.io/api-server

→ Enter your OUTRIVE web app URL:
  App URL: https://outrive.io/outrive

→ Registering session…

╔══════════════════════════════════════════╗
║   Open this URL in your browser:         ║
║                                          ║
║   https://outrive.io/outrive/            ║
║   cli-auth?session=550e8400-…            ║
╚══════════════════════════════════════════╝

Waiting for authorization… .....
✓ Authorization successful!

  Wallet   0x74Ae8C6dE15bfef8798Ea058ef174dE664E6bB45
  API URL  https://outrive.io/api-server
  Config   ~/.outrive/config.json`}</Code>
            </Step>

            <Step n="3" title="Run Your First Command">
              <Code label="check status">{`$ node outrive-cli.mjs status`}</Code>
              <Code label="buy OTR with 0.05 ETH">{`$ node outrive-cli.mjs buy 0.05 0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef \\
    --name OTR --ticker OTR`}</Code>
              <Code label="free-form chat">{`$ node outrive-cli.mjs chat "what tokens are trending right now?"`}</Code>
            </Step>

          </Section>

          {/* §4 Authentication */}
          <Section id="cli-s4" n="§4" title="Authentication">
            <P>
              OUTRIVE CLI uses a <Hl>wallet-signature auth flow</Hl>. Your private key never leaves the browser —
              only a signed message is transmitted to the API server, which verifies it with viem <Cmd>verifyMessage</Cmd>.
            </P>

            <Code label="auth flow diagram">{`CLI                          API SERVER              YOUR BROWSER
 │                               │                          │
 │── POST /api/cli/auth/request ─►│ creates pending session  │
 │   { sessionId: uuid }          │ (TTL: 5 minutes)         │
 │                               │                          │
 │   prints auth URL in terminal  │                          │
 │   ──────────────────────────────────────────────────────► │
 │                               │                          │
 │                               │◄── POST /cli/auth/confirm │
 │                               │    { sessionId,           │
 │                               │      walletAddress,       │
 │                               │      signature,           │  ← you sign in MetaMask
 │                               │      timestamp }          │
 │                               │                          │
 │                               │  verifyMessage()          │
 │                               │  marks session confirmed  │
 │                               │                          │
 │◄── GET /api/cli/auth/poll ─── │ { status: "confirmed" }  │
 │   polling every 2s             │                          │
 │                               │                          │
 │   saves ~/.outrive/config.json │                          │
 │   { apiUrl, appUrl,            │                          │
 │     walletAddress }            │                          │`}</Code>

            <div className="text-[10px] uppercase tracking-widest mt-1 mb-1" style={{ color: 'var(--out-muted)' }}>SIGNED MESSAGE FORMAT</div>
            <Code>{`OUTRIVE CLI Authorization
Session: <uuid-session-id>
Timestamp: <ISO-8601 timestamp>`}</Code>

            <P>
              Sessions expire after <Hl>5 minutes</Hl> if not confirmed. Re-run <Cmd>outrive auth</Cmd> to get a new link.
              Authorization is persistent — once saved to <Cmd>~/.outrive/config.json</Cmd>, no re-auth is needed until you logout.
            </P>
          </Section>

          {/* §5 Command Reference */}
          <Section id="cli-s5" n="§5" title="Command Reference">
            <Code label="usage">{`node outrive-cli.mjs <command> [arguments] [options]`}</Code>

            <Table
              headers={['COMMAND', 'ARGUMENTS', 'DESCRIPTION']}
              rows={[
                [<span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>auth</span>,     '—',                                  'Authorize via wallet signature. Required once. Prompts for API URL and App URL, then prints a browser link to complete auth.'],
                [<span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>status</span>,   '—',                                  'Show full ASCII dashboard: wallet, API URL, factory address, network status, and quick-command reference.'],
                [<span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>buy</span>,      '<eth_amount> <token_address>',        'Buy a token using ETH. The AI agent detects the correct liquidity route (bonding curve or RobinhoodRouter) automatically.'],
                [<span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>sell</span>,     '<token_amount> <token_address>',      'Sell tokens for ETH. Approval transaction is included if allowance is insufficient.'],
                [<span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>chat</span>,     '"<message>"',                        'Send a free-form message to the OUTRIVE AI agent. Supports market queries, balance checks, and launch instructions.'],
                [<span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>logout</span>,   '—',                                  'Clear stored credentials from ~/.outrive/config.json. Re-run outrive auth to reconnect.'],
                [<span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>help</span>,     '—',                                  'Show full command help, all options, and examples.'],
              ]}
            />

            <div className="text-[10px] uppercase tracking-widest mt-2 mb-1" style={{ color: 'var(--out-muted)' }}>OPTIONS (for buy / sell)</div>
            <Table
              headers={['OPTION', 'DEFAULT', 'DESCRIPTION']}
              rows={[
                ['--name <NAME>',     'token',  'Token name — passed to the AI agent for context. Helps the agent understand which token you mean.'],
                ['--ticker <TICKER>', 'TOKEN',  'Token ticker symbol — used in the agent\'s natural-language instruction.'],
              ]}
            />
          </Section>

          {/* §6 Trade Commands */}
          <Section id="cli-s6" n="§6" title="Trade Commands — Detailed Examples">

            <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>BUY</div>
            <Code label="buy 0.05 ETH of OTR">{`$ node outrive-cli.mjs buy 0.05 0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef \\
    --name OTR --ticker OTR

OUTRIVE cli
→ Buy 0.05 ETH of $OTR

⚙ detect_liquidity_route…
  done (312ms)
⚙ build_buy_tx…
  done (88ms)

╔══════════════════════════════════════════╗
║         OUTRIVE WORK ORDER               ║
╚══════════════════════════════════════════╝

  Side            BUY
  Token           OTR ($OTR)
  Address         0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef
  Amount In       50000000000000000 wei (0.05 ETH)
  Min Out         0
  Protocol        Virtuals Bonding Curve ($VIRTUAL)
  Network         Robinhood Chain (4663)
  Slippage        1%

  Trade tx
  to:    0x7180727d660150F0aD79028C0cef361c89c7e62C
  data:  0x5b7d7482000000000000000000000000d1c26283…
  value: 50000000000000000 wei

→ Sign and broadcast the trade tx in your wallet to execute.`}</Code>

            <div className="text-[10px] uppercase tracking-widest mb-1 mt-3" style={{ color: 'var(--out-muted)' }}>SELL</div>
            <Code label="sell 1,000,000 OTR">{`$ node outrive-cli.mjs sell 1000000 0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef \\
    --name OTR --ticker OTR

OUTRIVE cli
→ Sell 1,000,000 $OTR

⚙ build_sell_tx…
  done (205ms)

╔══════════════════════════════════════════╗
║         OUTRIVE WORK ORDER               ║
╚══════════════════════════════════════════╝

  Side            SELL
  Token           OTR ($OTR)
  Amount In       1000000000000000000000000 (raw)
  Protocol        Virtuals Bonding Curve ($VIRTUAL)

  [1/2] Approve tx
  to:    0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef
  data:  0x095ea7b3…

  [2/2] Trade tx
  to:    0x7180727d660150F0aD79028C0cef361c89c7e62C
  data:  0x1e31c6…
  value: 0 wei

⚠ Send the approve tx first, then the trade tx in your wallet.`}</Code>

            <div className="text-[10px] uppercase tracking-widest mb-1 mt-3" style={{ color: 'var(--out-muted)' }}>FREE-FORM CHAT</div>
            <Code label="ask the agent">{`$ node outrive-cli.mjs chat "what tokens are trending on Robinhood Chain?"

OUTRIVE cli

⚙ get_market_overview…
  done (891ms)

 Here are the top trending agent tokens on Robinhood Chain right now:

  1. $OTR    — OUTRIVE             price: 0.0024 VIRTUAL  +18.4%
  2. $NOVA   — Nova Intelligence   price: 0.0019 VIRTUAL   +9.2%
  3. $DOGE   — DogeAgent           price: 0.0011 VIRTUAL   +5.7%

  Volume is concentrated in OTR and NOVA today.
  Bonding curve progress: OTR at 31%, NOVA at 8%.`}</Code>

          </Section>

          {/* §7 Work Order */}
          <Section id="cli-s7" n="§7" title="Work Order — What You Receive">
            <P>
              Every buy/sell command returns a <Hl>Work Order</Hl>: a set of raw, unsigned transaction payloads.
              The CLI never signs or broadcasts anything. You must take these payloads to your wallet.
            </P>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  title: 'SIMPLE BUY (no approval needed)',
                  body: 'One transaction: the trade tx. ETH is the value. Paste `to`, `data`, and `value` into your wallet\'s raw transaction sender, or use cast / ethers.js.',
                },
                {
                  title: 'SELL (approval may be needed)',
                  body: 'Two transactions if allowance is insufficient: [1/2] Approve — grants the router permission to spend your tokens. [2/2] Trade — the actual sell. Must be sent in order.',
                },
              ].map(b => (
                <div key={b.title} className="border p-4" style={{ borderColor: 'var(--out-grid-major)' }}>
                  <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-ink)' }}>{b.title}</div>
                  <p className="text-[10px] leading-relaxed" style={{ color: 'var(--out-text)' }}>{b.body}</p>
                </div>
              ))}
            </div>

            <div className="text-[10px] uppercase tracking-widest mt-2 mb-1" style={{ color: 'var(--out-muted)' }}>LIQUIDITY ROUTES (AUTO-DETECTED)</div>
            <Table
              headers={['PROTOCOL', 'TRIGGER', 'ROUTER / CONTRACT']}
              rows={[
                ['Virtuals Bonding Curve ($VIRTUAL)', 'BondingV5.tokenInfo → trading=true, tradingOnUniswap=false', '0x7180727d66… (ETH Router)'],
                ['RobinhoodRouter · Protocol V2', 'RWA tokenized equities & ETFs (NVDA, AAPL, TSLA, etc.) — no AMM pools exist for these tokens; only valid on-chain path', '0xEa4F57DbC… (RobinhoodRouter)'],
                ['Uniswap V3', 'Pool found at factory; used when agent token is graduated', 'Uniswap V3 SwapRouter'],
                ['Uniswap V4', 'V4 pool found', 'Uniswap V4 UniversalRouter'],
                ['Uniswap V2', 'Fallback if V3/V4 not found', 'Uniswap V2 Router02'],
              ]}
            />
          </Section>

          {/* §8 Config & Storage */}
          <Section id="cli-s8" n="§8" title="Config & Storage">
            <P>The CLI stores one file on your machine after <Cmd>auth</Cmd>:</P>
            <Code label="~/.outrive/config.json">{`{
  "apiUrl":        "https://outrive.io/api-server",
  "appUrl":        "https://outrive.io/outrive",
  "walletAddress": "0x74Ae8C6dE15bfef8798Ea058ef174dE664E6bB45",
  "sessionId":     "550e8400-e29b-41d4-a716-446655440000"
}`}</Code>
            <Table
              headers={['FIELD', 'DESCRIPTION']}
              rows={[
                ['apiUrl',        'Base URL of the OUTRIVE API server. Prefixed to all API calls.'],
                ['appUrl',        'Base URL of the OUTRIVE web app. Used to construct the /cli-auth link.'],
                ['walletAddress', 'Your confirmed wallet address. Sent as context in every /api/chat request.'],
                ['sessionId',     'The session UUID that was confirmed during auth.'],
              ]}
            />
            <P>
              No private key is ever stored. To remove all credentials: <Cmd>node outrive-cli.mjs logout</Cmd>
            </P>
          </Section>

          {/* §9 Security Model */}
          <Section id="cli-s9" n="§9" title="Security Model">
            <Table
              headers={['PROPERTY', 'HOW IT IS ENFORCED']}
              rows={[
                ['Private key never leaves browser', 'Only a signed message (EIP-191 personal_sign) is sent to the API. No raw key data is transmitted.'],
                ['Signature verification',           'API server calls viem verifyMessage() — recovers the signer address from the signature and compares to the claimed walletAddress.'],
                ['Replay attack prevention',         'Signature includes a timestamp. Server rejects confirmations where timestamp is older than 5 minutes.'],
                ['Session expiry',                   'Unconfirmed sessions are purged from memory after 5 minutes.'],
                ['No auto-execution',                'Work Orders are raw unsigned txs. Nothing is broadcast without your manual wallet signature.'],
                ['Wallet-scoped context',            'Every API/chat request sends your walletAddress. The agent cannot act on behalf of a different wallet.'],
                ['Config file permissions',          'Stored in ~/.outrive/ — restrict with: chmod 600 ~/.outrive/config.json'],
              ]}
            />
          </Section>

          {/* §10 Full Session Example */}
          <Section id="cli-s10" n="§10" title="Full Session Example">
            <Code label="complete VPS session">{`# ─── Step 1: authorize once ───────────────────────────────────────
$ node outrive-cli.mjs auth
  API URL: https://outrive.io/api-server
  App URL: https://outrive.io/outrive

  Open in browser:
  https://outrive.io/outrive/cli-auth?session=550e8400-…

  (open browser → connect MetaMask → sign message)

  ....
  ✓ Authorization successful!
  Wallet   0x74Ae8C6dE15bfef8798Ea058ef174dE664E6bB45

# ─── Step 2: check status ─────────────────────────────────────────
$ node outrive-cli.mjs status

  ╔════════════════════════════════════════════════════════════╗
  ║   ██████╗ ██╗   ██╗████████╗██████╗ ██╗██╗   ██╗███████╗  ║
  ║  ██╔═══██╗██║   ██║╚══██╔══╝██╔══██╗██║██║   ██║██╔════╝  ║
  ║  ██║   ██║██║   ██║   ██║   ██████╔╝██║╚██╗ ██╔╝█████╗    ║
  ║  ██║   ██║██║   ██║   ██║   ██╔══██╗██║ ╚████╔╝ ██╔══╝    ║
  ║  ╚██████╔╝╚██████╔╝   ██║   ██║  ██║██║  ╚██╔╝  ███████╗  ║
  ║   ╚═════╝  ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚═╝   ╚═╝   ╚══════╝  ║
  ╠════════════════════════════════════════════════════════════╣
  ║  WALLET    0x74Ae8C6dE15bf...664E6bB45                     ║
  ║  API       https://outrive.io/api-server                   ║
  ║  NETWORK   Robinhood Chain (4663)                           ║
  ║  FACTORY   0x43e4c17b15365596caae8e7d00e42bc8e988c2d4      ║
  ║  STATUS    ● ONLINE                                         ║
  ╠════════════════════════════════════════════════════════════╣
  ║  buy    <eth>   <address>  [--name N] [--ticker T]          ║
  ║  sell   <amt>   <address>  [--name N] [--ticker T]          ║
  ║  chat   "<message>"                                         ║
  ║  logout                                                     ║
  ╚════════════════════════════════════════════════════════════╝

# ─── Step 3: buy OTR ──────────────────────────────────────────────
$ node outrive-cli.mjs buy 0.05 0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef \\
    --name OTR --ticker OTR

  → Sign and broadcast the trade tx in your wallet to execute.

# ─── Step 4: ask the agent ────────────────────────────────────────
$ node outrive-cli.mjs chat "how much ETH do I have?"

  Your wallet 0x74Ae...bB45 holds:
  ◆ 0.421 ETH   (gas balance on Robinhood Chain)
  ◆ 1,240 VIRTUAL

# ─── Step 5: logout ───────────────────────────────────────────────
$ node outrive-cli.mjs logout
  ✓ Logged out. Run outrive auth to reconnect.`}</Code>
          </Section>

          {/* §11 VPS Setup Guide */}
          <Section id="cli-s11" n="§11" title="VPS Setup Guide">
            <P>
              Run the OUTRIVE CLI on any Linux VPS (Ubuntu / Debian / CentOS).
              Auth happens <Hl>once from your local browser</Hl> — after that the VPS can run commands headlessly.
            </P>

            <Step n="1" title="SSH into your VPS">
              <Code label="terminal (local machine)">{`ssh root@YOUR_VPS_IP`}</Code>
            </Step>

            <Step n="2" title="Install Node.js 20 (if not already installed)">
              <P>Check first — if you already have Node 18+ you can skip this step.</P>
              <Code label="check existing version">{`node --version    # must be v18.0.0 or higher`}</Code>
              <Code label="install via NodeSource (Ubuntu / Debian)">{`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs`}</Code>
              <Code label="install via NodeSource (CentOS / RHEL)">{`curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs`}</Code>
              <Code label="verify">{`node --version    # v20.x.x
npm --version`}</Code>
            </Step>

            <Step n="3" title="Download the CLI">
              <P>Copy <Cmd>outrive-cli.mjs</Cmd> to your VPS. Choose the method that works for you.</P>
              <Code label="option A — wget">{`wget https://outrive.io/api/cli/outrive-cli.mjs -O outrive-cli.mjs`}</Code>
              <Code label="option B — curl">{`curl -fsSL https://outrive.io/api/cli/outrive-cli.mjs -o outrive-cli.mjs`}</Code>
              <Code label="option C — scp from your local machine">{`scp outrive-cli.mjs root@YOUR_VPS_IP:~/outrive-cli.mjs`}</Code>
              <Code label="make executable (optional)">{`chmod +x outrive-cli.mjs`}</Code>
            </Step>

            <Step n="4" title="Run auth — open the URL on your LOCAL browser">
              <P>
                The VPS has no GUI. When auth prints the URL, <Hl>copy it and open it in a browser on your local machine</Hl> (laptop / desktop).
                Connect MetaMask, sign the message, then come back to the VPS terminal.
              </P>
              <Code label="VPS terminal">{`node outrive-cli.mjs auth

→ Enter your OUTRIVE API URL:
  API URL: https://outrive.io/api-server

→ Enter your OUTRIVE web app URL:
  App URL: https://outrive.io/outrive

╔══════════════════════════════════════════╗
║   Open this URL in your LOCAL browser:   ║
║                                          ║
║   https://outrive.io/outrive/            ║
║   cli-auth?session=550e8400-…            ║
╚══════════════════════════════════════════╝

Waiting for authorization… .....
✓ Authorization successful!

  Wallet   0x74Ae8C6dE15bfef8798Ea058ef174dE664E6bB45
  Config   ~/.outrive/config.json`}</Code>
              <div className="font-mono text-[9px] leading-relaxed p-3 border"
                style={{ borderColor: 'var(--out-grid-major)', color: 'var(--out-muted)', background: '#0a0f0a' }}>
                NOTE · Auth is one-time. Once <code style={{ color: 'var(--out-ink)' }}>~/.outrive/config.json</code> is saved on the VPS,
                you can run all commands headlessly — no browser needed again.
              </div>
            </Step>

            <Step n="5" title="Secure the config file">
              <Code label="restrict permissions">{`chmod 600 ~/.outrive/config.json`}</Code>
            </Step>

            <Step n="6" title="Test — run status and a chat command">
              <Code label="verify connection">{`node outrive-cli.mjs status`}</Code>
              <Code label="ask the agent">{`node outrive-cli.mjs chat "what is my ETH balance?"`}</Code>
            </Step>

            <Step n="7" title="(Optional) Run in background with screen or tmux">
              <P>If you want the CLI session to persist after closing SSH, use <Cmd>screen</Cmd> or <Cmd>tmux</Cmd>.</P>
              <Code label="using screen">{`screen -S outrive          # start a named session
node outrive-cli.mjs chat "monitor OTR every 10 minutes"

# detach:  Ctrl+A then D
# reattach: screen -r outrive`}</Code>
              <Code label="using tmux">{`tmux new -s outrive        # start a named session
node outrive-cli.mjs chat "monitor OTR every 10 minutes"

# detach:  Ctrl+B then D
# reattach: tmux attach -t outrive`}</Code>
            </Step>

            <Step n="8" title="(Optional) Add CLI to PATH for shorter commands">
              <Code label="add alias to ~/.bashrc">{`echo 'alias outrive="node ~/outrive-cli.mjs"' >> ~/.bashrc
source ~/.bashrc`}</Code>
              <Code label="then you can just type">{`outrive status
outrive buy 0.05 0xd1c26283... --name OTR --ticker OTR
outrive chat "what tokens are trending?"`}</Code>
            </Step>

            <div className="mt-2">
              <Table
                headers={['ISSUE', 'FIX']}
                rows={[
                  ['node: command not found',         'Node.js not installed — follow Step 2.'],
                  ['fetch is not a function',         'Node version is below 18. Upgrade to Node 20.'],
                  ['Auth URL times out',              'Session expires after 5 min. Re-run outrive auth and open the URL immediately.'],
                  ['Cannot connect to API',           'Check API URL in ~/.outrive/config.json. Must end in /api-server with no trailing slash.'],
                  ['ECONNREFUSED / network error',    'VPS firewall may block outbound HTTPS. Allow port 443 outbound.'],
                  ['Config file not found after auth','Run as the same user each time. Root saves to /root/.outrive/, other users to /home/user/.outrive/.'],
                ]}
              />
            </div>

          </Section>

          {/* §12 RWA Trade */}
          <Section id="cli-s12" n="§12" title="RWA Trade — Real-World Asset Terminal">
            <P>
              OUTRIVE includes a <Hl>Real-World Asset trading interface</Hl> — a live terminal for 15 tokenized equities and ETFs
              issued as ERC-20 tokens on Robinhood Chain. Access it via the <Hl>RWA TRADE</Hl> tab in the sidebar.
              All prices are sourced on-chain from the Blockscout oracle; OHLCV data (changePct, volume, open/high/low)
              is fetched from an institutional market feed with a 10-minute cache.
            </P>

            <div className="text-[10px] uppercase tracking-widest mt-2 mb-1" style={{ color: 'var(--out-muted)' }}>AVAILABLE ASSETS</div>
            <Code label="15 RWA tokens on Robinhood Chain (chainId 4663)">{`SYMBOL  NAME                        ASSET CLASS
──────  ──────────────────────────  ─────────────────────────
NVDA    NVIDIA Corporation          Equity — Semiconductor
AAPL    Apple Inc.                  Equity — Technology
GOOGL   Alphabet Inc.               Equity — Technology
TSLA    Tesla Inc.                  Equity — Automotive / EV
META    Meta Platforms Inc.         Equity — Technology
MSFT    Microsoft Corporation       Equity — Technology
AMZN    Amazon.com Inc.             Equity — E-Commerce / Cloud
AMD     Advanced Micro Devices      Equity — Semiconductor
PLTR    Palantir Technologies       Equity — Data / AI
MU      Micron Technology           Equity — Semiconductor
ORCL    Oracle Corporation          Equity — Enterprise Software
SNDK    SanDisk Corp. (WD)          Equity — Storage
SPCX    Procure Space ETF           ETF — Aerospace & Defense
SPY     SPDR S&P 500 ETF Trust      ETF — Broad Market
QQQ     Invesco QQQ Trust           ETF — Nasdaq-100`}</Code>

            <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: 'var(--out-muted)' }}>CHAT COMMANDS — RWA QUERIES</div>
            <P>Use <Hl>chat</Hl> to query RWA market data from the CLI. The AI agent routes these to the RWA data service automatically.</P>
            <Code label="RWA market queries via CLI chat">{`# Get live prices for all RWA tokens
$ node outrive-cli.mjs chat "show me all RWA token prices"

# Get a specific asset quote
$ node outrive-cli.mjs chat "what is NVDA trading at right now?"

# Check daily change
$ node outrive-cli.mjs chat "which RWA tokens are up today?"

# Portfolio / trade history
$ node outrive-cli.mjs chat "show my RWA trade history"
$ node outrive-cli.mjs chat "what RWA positions do I have open?"`}</Code>

            <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: 'var(--out-muted)' }}>DATA ARCHITECTURE — WHAT POWERS THE QUOTES</div>
            <Table
              headers={['LAYER', 'SOURCE', 'TTL', 'FIELDS']}
              rows={[
                ['Price',    'Blockscout on-chain oracle — exchange_rate field', '60 sec', 'priceUsd, marketCap'],
                ['OHLCV',   'Institutional market data feed — sequential, 800ms gap between symbols', '10 min', 'changePct, open, high, low, volume, 52W H/L'],
                ['Logos',   'TradingView SVG CDN — s3-symbol-logo.tradingview.com', 'Browser cache', 'Company logo per symbol'],
                ['ETH/USD', 'Live ETH price feed for ETH-denominated order sizing', '60 sec', 'ethPriceUsd'],
              ]}
            />

            <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: 'var(--out-muted)' }}>ON-CHAIN SWAP EXECUTION (LIVE IN v1)</div>
            <P>
              Manual buy/sell execution routes through <Hl>RobinhoodRouter</Hl> (0xEa4F57DbC…) on Robinhood Chain.
              RWA tokens have no Uniswap V3/V4 pools — RobinhoodRouter is the only valid on-chain path.
              The swap is non-custodial: the unsigned transaction is presented in the Work Order, and the user signs it in their own wallet.
            </P>
            <Code label="swap flow (v1 — live)">{`BUY NVDA with 0.05 ETH
  → RobinhoodRouter.buy({ protocol: V2, token: NVDA_ADDRESS,
      amountIn: 0, minAmountOut: 0, recipient: wallet, extra: '0x' })
  → tx.value = 0.05e18 wei  |  gas: 400,000
  → Router skims feeBps from ETH, swaps remainder for NVDA via V2
  → wallet_watchAsset called post-confirm (token appears in MetaMask)

SELL NVDA (100 shares)
  → Step 1: approve(RobinhoodRouter, MAX_UINT256) on NVDA contract
  → Step 2: RobinhoodRouter.sell({ protocol: V2, token: NVDA_ADDRESS,
      amountIn: shares_wei, minAmountOut: 0, recipient: wallet, extra: '0x' })
  → Two-step Work Order → sign both txs in order`}</Code>

            <div className="text-[10px] uppercase tracking-widest mt-3 mb-1" style={{ color: 'var(--out-muted)' }}>AUTONOMOUS AGENT TRADING (COMING IN v1.2)</div>
            <P>
              Autonomous agents deployed via <Hl>Virtuals Protocol</Hl> on Robinhood Chain will execute RWA trades
              independently — analyzing live price feeds, constructing orders, and routing swaps through RobinhoodRouter
              without user intervention. Every agent trade is tagged <code style={{ color: 'var(--out-ink)' }}>source="agent"</code> in
              trade history and visible in the Dashboard portfolio view.
            </P>
            <Table
              headers={['AGENT', 'ROLE']}
              rows={[
                ['Market Agent',       'Monitors live RWA prices; detects momentum signals and volume anomalies'],
                ['Portfolio Agent',    'Manages positions; enforces stop-losses and rebalancing policy'],
                ['Execution Agent',    'Routes orders through RobinhoodRouter (Protocol V2) — the verified swap path for all RWA tokens on Robinhood Chain'],
                ['Intelligence Agent', 'Synthesizes macro signals into trade theses; feeds the Market Agent'],
              ]}
            />

            <div className="border p-3 mt-2" style={{ borderColor: 'var(--out-grid-major)', background: '#0A0F0A' }}>
              <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>SEE ALSO</div>
              <p className="text-[10px] leading-relaxed font-mono" style={{ color: 'var(--out-text)' }}>
                Full technical specification in the Whitepaper — <span style={{ color: 'var(--out-ink)' }}>§16 RWA Trade Infrastructure</span> and{' '}
                <span style={{ color: 'var(--out-ink)' }}>§17 Autonomous Agent Trading System</span>. Access via the WHITEPAPER tab in the sidebar.
              </p>
            </div>
          </Section>

        </div>
      </Sheet>
    </div>
  );
}
