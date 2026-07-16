import React, { useState } from 'react';
import { Sheet } from '@/components/Sheet';

/* ─── Shared primitives (match WhitepaperPage style) ─────────────────────── */
function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
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

/* ─── TOC ─────────────────────────────────────────────────────────────────── */
const TOC = [
  '§1 · Overview',
  '§2 · Requirements',
  '§3 · Quick Start (3 steps)',
  '§4 · Authentication',
  '§5 · Command Reference',
  '§6 · Trade Commands',
  '§7 · Work Order',
  '§8 · Config & Storage',
  '§9 · Security Model',
  '§10 · Full Session Example',
];

/* ═══════════════════════════════════════════════════════════════════════════ */
export function CliDocsPage() {
  const [activeSection, setActiveSection] = useState<number | null>(null);

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex gap-6">

      {/* ── Sidebar TOC ── */}
      <aside className="hidden xl:flex flex-col gap-1 w-52 shrink-0 sticky top-28 self-start font-mono text-[10px]">
        <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-muted)' }}>CONTENTS</div>
        {TOC.map((item, i) => (
          <button key={i} onClick={() => setActiveSection(i)}
            className="text-left py-1 px-2 transition-colors border-l-2"
            style={{
              borderLeftColor: activeSection === i ? 'var(--out-ink)' : 'transparent',
              color: activeSection === i ? 'var(--out-ink)' : 'var(--out-muted)',
            }}>
            {item}
          </button>
        ))}
        <div className="mt-4 pt-4 border-t text-[9px] uppercase tracking-widest" style={{ borderColor: 'var(--out-grid-major)', color: 'var(--out-muted)' }}>
          VERSION 1.0 · JULY 2026
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
  ║  API       https://your-api.replit.dev/api-server           ║
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

          {/* §1 Overview */}
          <Section n="§1" title="Overview">
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
          <Section n="§2" title="Requirements">
            <Table
              headers={['REQUIREMENT', 'DETAIL']}
              rows={[
                ['Node.js 18+', 'Uses native fetch + crypto (Web Crypto API). No npm install required.'],
                ['OUTRIVE web app access', 'You need to open the /cli-auth page in a browser once to authorize your wallet.'],
                ['OUTRIVE API URL', 'The base URL of your OUTRIVE API server (e.g. https://xxxxx.replit.dev/api-server).'],
                ['EVM wallet (MetaMask, etc.)', 'For signing authorization message during outrive auth.'],
                ['Connected to Robinhood Chain', 'chainId 4663. RPC: https://rpc.mainnet.chain.robinhood.com'],
              ]}
            />
            <Code label="check node version">{`$ node --version
v20.11.0   ← must be 18.0.0 or higher`}</Code>
          </Section>

          {/* §3 Quick Start */}
          <Section n="§3" title="Quick Start (3 Steps)">

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
  API URL: https://xxxxx.replit.dev/api-server

→ Enter your OUTRIVE web app URL:
  App URL: https://xxxxx.replit.dev/outrive

→ Registering session…

╔══════════════════════════════════════════╗
║   Open this URL in your browser:         ║
║                                          ║
║   https://...outrive/cli-auth?session=…  ║
╚══════════════════════════════════════════╝

Waiting for authorization… .....
✓ Authorization successful!

  Wallet   0x74Ae8C6dE15bfef8798Ea058ef174dE664E6bB45
  API URL  https://xxxxx.replit.dev/api-server
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
          <Section n="§4" title="Authentication">
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
          <Section n="§5" title="Command Reference">
            <Code label="usage">{`node outrive-cli.mjs <command> [arguments] [options]`}</Code>

            <Table
              headers={['COMMAND', 'ARGUMENTS', 'DESCRIPTION']}
              rows={[
                [<span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>auth</span>,     '—',                                  'Authorize via wallet signature. Required once. Prompts for API URL and App URL, then prints a browser link to complete auth.'],
                [<span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>status</span>,   '—',                                  'Show full ASCII dashboard: wallet, API URL, factory address, network status, and quick-command reference.'],
                [<span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>buy</span>,      '<eth_amount> <token_address>',        'Buy a token using ETH. The AI agent detects the correct liquidity route (bonding curve or Uniswap) automatically.'],
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
          <Section n="§6" title="Trade Commands — Detailed Examples">

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
          <Section n="§7" title="Work Order — What You Receive">
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
                ['Uniswap V3', 'Pool found at factory; used when token is graduated', 'Uniswap V3 SwapRouter'],
                ['Uniswap V4', 'V4 pool found', 'Uniswap V4 UniversalRouter'],
                ['Uniswap V2', 'Fallback if V3/V4 not found', 'Uniswap V2 Router02'],
              ]}
            />
          </Section>

          {/* §8 Config & Storage */}
          <Section n="§8" title="Config & Storage">
            <P>The CLI stores one file on your machine after <Cmd>auth</Cmd>:</P>
            <Code label="~/.outrive/config.json">{`{
  "apiUrl":        "https://your-api.replit.dev/api-server",
  "appUrl":        "https://your-app.replit.dev/outrive",
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
          <Section n="§9" title="Security Model">
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
          <Section n="§10" title="Full Session Example">
            <Code label="complete VPS session">{`# ─── Step 1: authorize once ───────────────────────────────────────
$ node outrive-cli.mjs auth
  API URL: https://xxxxxx.replit.dev/api-server
  App URL: https://xxxxxx.replit.dev/outrive

  Open in browser:
  https://xxxxxx.replit.dev/outrive/cli-auth?session=550e8400-…

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
  ║  API       https://xxxxxx.replit.dev/api-server            ║
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

        </div>
      </Sheet>
    </div>
  );
}
