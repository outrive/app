/**
 * AUTONOMOUS AGENT VAULT
 * Monitor & configure your autonomous RWA trading agent.
 * Private key and LLM setup are done on your own VPS — never entered here.
 *
 * Auth flow:
 *  1. Wallet connected → user clicks "AUTHENTICATE VAULT ACCESS"
 *  2. POST /api/autonomous/auth/nonce  → nonce string
 *  3. signMessage(nonce message) via wagmi
 *  4. POST /api/autonomous/auth/verify → session token (1 h)
 *  5. All subsequent API calls: Authorization: Bearer <token>
 *  6. Server derives wallet from session — never trusts client-supplied address
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount, useSignMessage } from 'wagmi';
import {
  Zap, Shield, Copy, Check, Plus, Trash2,
  Activity, Key, Code2, AlertTriangle, Cpu, RefreshCw,
  Download, LogIn, Server, Terminal, Bot, GitBranch, Layers,
} from 'lucide-react';

/* ── Constants ────────────────────────────────────────────────────────── */
const BASE_URL = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
const api      = (p: string) => BASE_URL + p;
const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono, monospace)' };

const TOKENS = ['AAPL','NVDA','TSLA','GOOGL','META','MSFT','AMZN','AMD','PLTR','ORCL','SPY','MU','SPCX'];

const STRATEGIES = [
  { id: 'dca',      label: 'DCA',       desc: 'Fixed ETH at fixed intervals' },
  { id: 'momentum', label: 'MOMENTUM',  desc: 'Enter on price momentum signal' },
  { id: 'dip-buy',  label: 'DIP BUY',   desc: 'Enter when price drops X% from current' },
  { id: 'breakout', label: 'BREAKOUT',  desc: 'Enter on N-day high breakout' },
  { id: 'custom',   label: 'CUSTOM',    desc: 'Define via skill.md or API' },
];

/* ── Types ────────────────────────────────────────────────────────────── */
type StrategyConfig = {
  token:         string;
  strategy:      string;
  entry_type:    string;
  limit_price:   string;
  dip_pct:       string;
  breakout_days: string;
  tp_pct:        string;
  sl_pct:        string;
  budget_eth:    string;
  max_concurrent: string;
};

type VaultResp = {
  vault: null | {
    agentAddress:   string | null;
    pkHint:         string | null;
    status:         string;
    strategyConfig: StrategyConfig | null;
    totalTrades:    number;
    totalPnlUsd:    number;
  };
};

type KeysResp = {
  keys: { id: number; keyPrefix: string; name: string | null; lastUsedAt: string | null; createdAt: string }[];
};

const DEFAULT_STRATEGY: StrategyConfig = {
  token:         'AAPL',
  strategy:      'dca',
  entry_type:    'market',
  limit_price:   '',
  dip_pct:       '3',
  breakout_days: '20',
  tp_pct:        '15',
  sl_pct:        '5',
  budget_eth:    '0.05',
  max_concurrent: '3',
};

/* ── Helpers ─────────────────────────────────────────────────────────── */
function fmtAddr(addr: string) { return addr.slice(0, 6) + '…' + addr.slice(-4); }
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
}

/* ── Shared UI ────────────────────────────────────────────────────────── */
function DwgBar({ dwgNo }: { dwgNo: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b text-[9px] uppercase tracking-[0.16em]"
      style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)', ...MONO }}>
      <span>DWG NO. {dwgNo}</span>
      <div className="flex items-center gap-4"><span>SHEET 1/1</span><span>SCALE 1:1</span></div>
      <span>REV. A</span>
    </div>
  );
}

function Sheet({ dwgNo, children }: { dwgNo: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--out-ink)', background: 'var(--out-bg-sheet)' }}>
      <DwgBar dwgNo={dwgNo} />
      <div className="p-6">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] uppercase tracking-[0.16em] mb-3" style={{ color: 'var(--out-muted)', ...MONO }}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="flex flex-col justify-between p-5 min-h-[110px]"
      style={{ border: '1px solid var(--out-ink-dim)', background: '#060c05' }}>
      <div className="text-[9px] uppercase tracking-[0.16em] mb-3" style={{ color: 'var(--out-muted)', ...MONO }}>{label}</div>
      <div className="text-[20px] font-bold leading-tight break-all" style={{ color: accent ?? 'var(--out-ink)', ...MONO }}>{value}</div>
      {sub && <div className="text-[9px] mt-1.5 uppercase tracking-widest" style={{ color: 'var(--out-muted)', ...MONO }}>{sub}</div>}
    </div>
  );
}

function CodeBlock({ lang, code, onCopy }: { lang: string; code: string; onCopy: () => void }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div style={{ border: '1px solid var(--out-ink-dim)', background: '#040804' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b text-[9px] uppercase tracking-widest"
        style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)', ...MONO }}>
        <span>{lang}</span>
        <button onClick={handle} className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity"
          style={{ color: copied ? 'var(--out-ink)' : 'var(--out-muted)' }}>
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
      <pre className="p-4 text-[10px] leading-relaxed overflow-x-auto whitespace-pre" style={{ color: 'var(--out-ink)', ...MONO }}>
        {code}
      </pre>
    </div>
  );
}

function ParamInput({ label, value, unit, onChange }: {
  label: string; value: string; unit: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      {label && <div className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--out-muted)', ...MONO }}>{label}</div>}
      <div className="flex items-center border" style={{ borderColor: 'var(--out-ink-dim)' }}>
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          className="flex-1 px-3 py-2 bg-transparent text-[11px] outline-none"
          style={{ color: 'var(--out-text)', ...MONO }} />
        <span className="px-3 text-[9px] uppercase tracking-widest shrink-0" style={{ color: 'var(--out-muted)', ...MONO }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────── */
export function AutonomousPage() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const qc = useQueryClient();

  /* ── Auth state — persisted in sessionStorage per wallet ── */
  const storageKey = address ? `outrive_vault_token_${address.toLowerCase()}` : null;
  const [sessionToken, _setSessionToken] = useState<string | null>(() => {
    if (!address) return null;
    return sessionStorage.getItem(`outrive_vault_token_${address.toLowerCase()}`);
  });
  const setSessionToken = useCallback((token: string | null) => {
    _setSessionToken(token);
    if (!storageKey) return;
    if (token) sessionStorage.setItem(storageKey, token);
    else        sessionStorage.removeItem(storageKey);
  }, [storageKey]);

  /* Restore token when wallet changes (e.g. switch accounts) */
  useEffect(() => {
    if (!address) { _setSessionToken(null); return; }
    const saved = sessionStorage.getItem(`outrive_vault_token_${address.toLowerCase()}`);
    _setSessionToken(saved);
  }, [address]);

  const [authenticating, setAuthenticating] = useState(false);
  const [authError,      setAuthError]      = useState<string | null>(null);

  /* ── Strategy / vault form state ── */
  const [strategy, setStrategy] = useState<StrategyConfig>(DEFAULT_STRATEGY);
  const [saving,       setSaving]       = useState(false);
  const [saveFlash,    setSaveFlash]    = useState<'ok' | 'err' | null>(null);

  /* ── API key state ── */
  const [generating, setGenerating] = useState(false);
  const [newKey,     setNewKey]     = useState<string | null>(null);
  const [keyName,    setKeyName]    = useState('');
  const [copiedKey,  setCopiedKey]  = useState(false);
  const [revoking,   setRevoking]   = useState<number | null>(null);

  /* ── Authenticate: nonce → sign → token ── */
  const authenticate = useCallback(async (): Promise<string | null> => {
    if (!address) return null;
    if (sessionToken) return sessionToken;
    setAuthenticating(true);
    setAuthError(null);
    try {
      const nonceResp = await fetch(api('/api/autonomous/auth/nonce'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });
      if (!nonceResp.ok) { setAuthError('Server error — try again'); return null; }
      const { nonce, message } = await nonceResp.json();

      const signature = await signMessageAsync({ message });

      const verifyResp = await fetch(api('/api/autonomous/auth/verify'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, nonce, signature }),
      });
      if (!verifyResp.ok) { setAuthError('Signature rejected — try again'); return null; }
      const { token } = await verifyResp.json();
      setSessionToken(token);
      qc.invalidateQueries({ queryKey: ['vault'] });
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      return token;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('User rejected') || msg.includes('denied')) {
        setAuthError('Signature rejected by wallet');
      } else {
        setAuthError('Authentication failed — try again');
      }
      return null;
    } finally {
      setAuthenticating(false);
    }
  }, [address, sessionToken, signMessageAsync, qc]);

  /* Helper: auth-headers for fetch */
  const authHeaders = useCallback((): Record<string, string> => {
    return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
  }, [sessionToken]);

  /* Handle 401 — clear stale session */
  const handle401 = useCallback(() => { setSessionToken(null); }, []);

  /* ── Queries (only active when authenticated) ── */
  const { data: vaultData, refetch: refetchVault } = useQuery<VaultResp>({
    queryKey:  ['vault', address, sessionToken],
    enabled:   !!address && !!sessionToken,
    staleTime: 15_000,
    queryFn:   async () => {
      const r = await fetch(api('/api/autonomous/vault'), {
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      });
      if (r.status === 401) { handle401(); return { vault: null }; }
      return r.json();
    },
  });

  const { data: keysData, refetch: refetchKeys } = useQuery<KeysResp>({
    queryKey:  ['api-keys', address, sessionToken],
    enabled:   !!address && !!sessionToken,
    staleTime: 15_000,
    queryFn:   async () => {
      const r = await fetch(api('/api/autonomous/api-keys'), {
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      });
      if (r.status === 401) { handle401(); return { keys: [] }; }
      return r.json();
    },
  });

  const vault = vaultData?.vault;
  const keys  = keysData?.keys ?? [];

  /* Sync strategy form from vault data whenever vault loads */
  useEffect(() => {
    if (vault?.strategyConfig) {
      setStrategy(cfg => ({ ...DEFAULT_STRATEGY, ...vault.strategyConfig, ...cfg }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault?.strategyConfig]);

  /* ── Vault mutations ── */
  const patchStrategy = useCallback((k: keyof StrategyConfig, v: string) => {
    setStrategy(s => ({ ...s, [k]: v }));
  }, []);

  const saveVault = async () => {
    const token = sessionToken ?? await authenticate();
    if (!token) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { strategyConfig: strategy };
      const r = await fetch(api('/api/autonomous/vault'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (r.status === 401) { handle401(); setSaveFlash('err'); return; }
      if (r.ok) { setSaveFlash('ok'); refetchVault(); }
      else       { setSaveFlash('err'); }
    } catch { setSaveFlash('err'); }
    finally { setSaving(false); setTimeout(() => setSaveFlash(null), 3000); }
  };

  const setVaultStatus = async (status: 'running' | 'paused' | 'idle') => {
    const token = sessionToken ?? await authenticate();
    if (!token) return;
    const r = await fetch(api('/api/autonomous/vault'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    if (r.status === 401) handle401();
    else refetchVault();
  };

  const generateKey = async () => {
    const token = sessionToken ?? await authenticate();
    if (!token) return;
    setGenerating(true); setNewKey(null);
    try {
      const r = await fetch(api('/api/autonomous/api-keys'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: keyName || null }),
      });
      if (r.status === 401) { handle401(); return; }
      if (r.ok) { const d = await r.json(); setNewKey(d.key); setKeyName(''); refetchKeys(); }
    } finally { setGenerating(false); }
  };

  const revokeKey = async (id: number) => {
    const token = sessionToken ?? await authenticate();
    if (!token) return;
    setRevoking(id);
    try {
      const r = await fetch(api(`/api/autonomous/api-keys/${id}`), {
        method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) handle401();
      else refetchKeys();
    } finally { setRevoking(null); }
  };

  /* ── Derived display ── */
  const statusColor = vault?.status === 'running' ? 'var(--out-ink)'
    : vault?.status === 'paused'  ? '#e09020' : 'var(--out-muted)';

  const isAuthenticated = !!sessionToken;

  /* ── VPS setup snippets ── */
  const apiKey = keys[0]?.keyPrefix ? keys[0].keyPrefix + '…' : 'OTR-your-key-here';
  const snippetEnv = `# Save this as ~/outrive-agent/.env
# Never commit this file to git

# Agent wallet private key — stays on your VPS ONLY, never enters the browser
AGENT_PRIVATE_KEY=0xYOUR_AGENT_WALLET_PRIVATE_KEY

# OTR API key — generated from the API Access panel on this page
OUTRIVE_API_KEY=${apiKey}

# Your main wallet address — used to bind the vault
WALLET_ADDRESS=${address ?? '0xYOUR_MAIN_WALLET_ADDRESS'}

# OUTRIVE API base URL
OUTRIVE_API_URL=https://api.outrive.io`;

  const snippetAgent = `// Save as ~/outrive-agent/index.mjs
import "dotenv/config";
import { createPublicClient, createWalletClient, http, formatEther, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Robinhood Chain — chain ID 4663
const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
    public:  { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
});

const API     = process.env.OUTRIVE_API_URL;
const OTR_KEY = process.env.OUTRIVE_API_KEY;
const PK      = process.env.AGENT_PRIVATE_KEY;

const account      = privateKeyToAccount(PK);
const pubClient    = createPublicClient({ chain: robinhoodChain, transport: http() });
const walletClient = createWalletClient({ account, chain: robinhoodChain, transport: http() });
const H = { "Content-Type": "application/json", "Authorization": \`Bearer \${OTR_KEY}\` };

console.log("[agent] started | wallet:", account.address);

async function ensureVault() {
  const { vault } = await fetch(\`\${API}/api/autonomous/vault\`, { headers: H }).then(r => r.json());
  if (vault) return vault;
  const r = await fetch(\`\${API}/api/autonomous/vault\`, {
    method: "POST", headers: H,
    body: JSON.stringify({ agentAddress: account.address, pkHint: PK.slice(0,6)+"..."+PK.slice(-4), status: "running" }),
  });
  const result = await r.json();
  console.log("[agent] vault registered:", result.vault?.agentAddress);
  return result.vault;
}

async function tick() {
  try {
    const { vault } = await fetch(\`\${API}/api/autonomous/vault\`, { headers: H }).then(r => r.json());
    if (!vault || vault.status === "paused") { console.log("[tick]", vault ? "PAUSED" : "no vault"); return; }
    const bal = await pubClient.getBalance({ address: account.address });
    if (!vault.strategyConfig) {
      console.log(\`[tick] IDLE — set strategy at outrive.io | bal: \${formatEther(bal)} ETH\`);
      return;
    }
    const { token, strategy, budget_eth } = vault.strategyConfig;
    console.log(\`[tick] OK | \${token} | \${strategy} | budget=\${budget_eth} ETH | trades=\${vault.totalTrades} | pnl=$\${vault.totalPnlUsd} | bal=\${formatEther(bal)} ETH\`);
    // Add your trade execution logic here
  } catch (err) { console.error("[tick] error:", err.message); }
}

await ensureVault();
tick();
setInterval(tick, 30_000);`;

  const snippetDocker = `# ── docker-compose.yml ──────────────────────────────
services:
  outrive-agent:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - ./:/app
    env_file: .env
    command: sh -c "npm install && node index.mjs"
    restart: unless-stopped

# ── Commands ─────────────────────────────────────────
# Start:       docker compose up -d
# Live logs:   docker compose logs -f outrive-agent
# Stop:        docker compose down
# Restart:     docker compose restart outrive-agent

# ── PM2 (alternative to Docker) ──────────────────────
# npm install -g pm2
# pm2 start index.mjs --name outrive-agent
# pm2 save && pm2 startup
# pm2 logs outrive-agent`;

  /* ── Hermes AI Strategy snippets ── */
  const snippetHermesTools = `"""
OUTRIVE Hermes Tools
Save as ~/outrive-agent/hermes_tools.py

These three functions are loaded by Hermes Agent and give it
read + write access to your OUTRIVE vault and live market data.
Register with: hermes tool add ~/outrive-agent/hermes_tools.py
"""
import os, requests
from dotenv import load_dotenv

load_dotenv(os.path.expanduser("~/outrive-agent/.env"))

API   = os.environ.get("OUTRIVE_API_URL", "https://api.outrive.io")
TOKEN = os.environ.get("OUTRIVE_API_KEY")   # OTR-xxxxxxxxxx
HDR   = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}

def get_market_intel() -> dict:
    """
    Get current live RWA token prices, vault status, portfolio P&L,
    and current strategy config from OUTRIVE.
    Returns a summary string and full market + vault JSON.
    """
    r = requests.get(f"{API}/api/autonomous/market-intel", headers=HDR, timeout=10)
    r.raise_for_status()
    return r.json()

def update_strategy(
    token: str,
    strategy: str,
    budget_eth: str,
    tp_pct: str   = "5",
    sl_pct: str   = "3",
    entry_type: str = "market",
    status: str   = "running",
) -> dict:
    """
    Update the OUTRIVE vault strategy configuration.

    token      : RWA ticker — AAPL | NVDA | TSLA | GOOGL | META | MSFT
                              AMZN | AMD | PLTR | ORCL | SPY | MU | SPCX
    strategy   : dca | momentum | dip-buy | breakout | custom
    budget_eth : ETH per trade cycle, e.g. '0.002'
    tp_pct     : take-profit %, e.g. '5'  (close position at +5%)
    sl_pct     : stop-loss   %, e.g. '3'  (close position at -3%)
    entry_type : market | limit | dip | breakout
    status     : running | paused | idle
    """
    r = requests.post(
        f"{API}/api/autonomous/vault",
        headers=HDR, timeout=10,
        json={
            "status": status,
            "strategyConfig": {
                "token":          token,
                "strategy":       strategy,
                "budget_eth":     budget_eth,
                "tp_pct":         tp_pct,
                "sl_pct":         sl_pct,
                "entry_type":     entry_type,
                "max_concurrent": "1",
            },
        },
    )
    r.raise_for_status()
    return r.json()

def get_vault_status() -> dict:
    """Get current vault configuration, agent status, and performance stats."""
    r = requests.get(f"{API}/api/autonomous/vault", headers=HDR, timeout=10)
    r.raise_for_status()
    return r.json()`;

  const snippetHermesConfig = `# ~/.hermes/config.yaml
# Hermes AI Strategy — OUTRIVE integration
#
# Run "hermes setup --portal" for interactive setup, or fill this manually.
# Full provider list: https://hermes-agent.nousresearch.com/docs/integrations/providers

# ── LLM provider (pick one) ──────────────────────────────────────────
# Option A: Nous Portal (subscription, includes Hermes-3 models)
# model: nous/hermes-3-llama-3.1-70b

# Option B: OpenRouter (pay-per-token, wide model choice)
model: openrouter/nousresearch/hermes-3-llama-3.1-70b:free

# Option C: Anthropic (high quality, slightly higher cost)
# model: anthropic/claude-sonnet-4-5

# Option D: Local model via Ollama (free, needs GPU or fast CPU)
# model: ollama/nous-hermes-3

# ── OUTRIVE custom tools ──────────────────────────────────────────────
tools:
  custom:
    - path: ~/outrive-agent/hermes_tools.py

# ── Environment (OUTRIVE_API_KEY loaded from .env by hermes_tools.py) ─
# No secrets needed here — the tools file handles auth.`;

  const snippetHermesScheduler = `"""
OUTRIVE Hermes Strategy Scheduler
Save as ~/outrive-agent/hermes_scheduler.py

Runs a Hermes AI analysis cycle on a fixed interval.
Hermes reads market intel, reasons with its LLM, and
updates vault strategy parameters if conditions change.

Run with PM2:
  pm2 start hermes_scheduler.py \\
    --name hermes-strategy \\
    --interpreter python3
  pm2 save
  pm2 logs hermes-strategy
"""
import subprocess, time, logging
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# How often Hermes runs an analysis cycle (seconds)
INTERVAL = 3600   # 1 hour — adjust to your preference

HERMES_PROMPT = """
You are an autonomous RWA trading strategy advisor for OUTRIVE.

Your task each cycle:
1. Call get_market_intel() — read live prices, vault status, current P&L
2. Analyze conditions for the configured target token
3. Decide whether the current strategy parameters are still optimal
4. If adjustment is warranted, call update_strategy() with improved params
5. Briefly explain your reasoning and what you changed (or why you kept it)

Hard rules you must follow:
- Never set budget_eth above 0.01 ETH without explicit user instruction
- Always set a stop-loss (sl_pct) between 2 and 10
- Use dca for sideways / unclear markets, momentum for strong uptrends
- If total P&L is below -5% of initial budget, set status to 'paused'
  and explain the pause in your reasoning
- Make conservative incremental changes — not full strategy overhauls
- All token tickers must be uppercase (AAPL not aapl)

Begin the analysis cycle now.
"""

def run_cycle():
    logging.info("Starting Hermes strategy analysis cycle...")
    try:
        result = subprocess.run(
            ["hermes", "run", "--once", HERMES_PROMPT],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode == 0:
            output = (result.stdout or "").strip()
            logging.info("Cycle complete.")
            # Print last 600 chars of Hermes reasoning to logs
            if output:
                logging.info("Hermes output (tail):\\n%s", output[-600:])
        else:
            logging.error("Hermes returned non-zero exit: %s", result.stderr[-300:])
    except subprocess.TimeoutExpired:
        logging.error("Hermes cycle timed out after 120s — skipping")
    except FileNotFoundError:
        logging.error("hermes binary not found — run: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash")

if __name__ == "__main__":
    logging.info("OUTRIVE Hermes Scheduler started | interval=%ds", INTERVAL)
    while True:
        run_cycle()
        next_run = datetime.now().strftime("%H:%M:%S")
        logging.info("Next cycle in %d min | sleeping...", INTERVAL // 60)
        time.sleep(INTERVAL)`;

  /* ── Render ── */
  return (
    <div className="flex flex-col gap-6 pb-16" style={MONO}>

      {/* ════ HERO ══════════════════════════════════════════════════════ */}
      <div style={{ border: '1px solid var(--out-ink)', borderLeft: '3px solid #e0902080', background: 'var(--out-bg-sheet)' }}>
        <DwgBar dwgNo="OUT-AUT-00" />
        <div className="px-6 sm:px-10 pt-8 pb-10">
          <div className="flex items-center gap-3 text-[9px] uppercase tracking-[0.16em] mb-6" style={{ color: 'var(--out-muted)' }}>
            <span>/ APP / AUTONOMOUS /</span>
            <span className="px-1.5 py-px text-[9px] font-bold tracking-widest"
              style={{ border: '1px solid #8CB80E60', color: '#8CB80E', background: '#060c05' }}>LIVE</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <h1 className="font-bold leading-[1.1] mb-3"
                style={{ color: 'var(--out-ink)', fontSize: 'clamp(26px, 3.5vw, 48px)' }}>
                Autonomous<br />Agent Vault.
              </h1>
              <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: 'var(--out-muted)' }}>
                Monitor your agent · configure strategy · deploy agent on your own VPS.
              </p>
            </div>

            {/* Auth / Status block */}
            <div className="shrink-0 flex flex-col gap-2 px-6 py-5"
              style={{ border: '1px solid var(--out-ink)', background: '#060c05', minWidth: 220 }}>
              {!address ? (
                <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
                  CONNECT WALLET TO BEGIN
                </div>
              ) : !isAuthenticated ? (
                <>
                  <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>
                    VAULT ACCESS REQUIRED
                  </div>
                  <button onClick={authenticate} disabled={authenticating}
                    className="flex items-center gap-2 py-2.5 px-3 border text-[11px] uppercase tracking-widest font-bold transition-opacity"
                    style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)', opacity: authenticating ? 0.5 : 1 }}>
                    {authenticating
                      ? <><RefreshCw size={11} className="animate-spin" /> SIGNING…</>
                      : <><LogIn size={11} /> AUTHENTICATE VAULT</>}
                  </button>
                  {authError && <div className="text-[9px]" style={{ color: 'var(--out-danger)' }}>{authError}</div>}
                  <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
                    Signs once · session lasts 1h · no gas
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
                    VAULT STATUS
                  </div>
                  <div className="text-2xl font-bold uppercase tracking-widest" style={{ color: statusColor }}>
                    ● {vault?.status?.toUpperCase() ?? 'IDLE'}
                  </div>
                  {vault && (
                    <div className="flex gap-2 mt-1">
                      {vault.status !== 'running' && (
                        <button onClick={() => setVaultStatus('running')}
                          className="text-[9px] px-2 py-1 uppercase tracking-widest border hover:opacity-100 opacity-70 transition-opacity"
                          style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>RUN</button>
                      )}
                      {vault.status === 'running' && (
                        <button onClick={() => setVaultStatus('paused')}
                          className="text-[9px] px-2 py-1 uppercase tracking-widest border hover:opacity-100 opacity-70 transition-opacity"
                          style={{ borderColor: '#e09020', color: '#e09020' }}>PAUSE</button>
                      )}
                      <button onClick={() => setVaultStatus('idle')}
                        className="text-[9px] px-2 py-1 uppercase tracking-widest border hover:opacity-100 opacity-70 transition-opacity"
                        style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>STOP</button>
                    </div>
                  )}
                  <div className="text-[9px] mt-1 flex items-center gap-1.5" style={{ color: 'var(--out-ink)' }}>
                    <Shield size={9} /> VAULT AUTHENTICATED
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ════ OUT-AUT-01 — VAULT STATUS ══════════════════════════════════ */}
      <div style={{ border: '1px solid var(--out-ink)', background: 'var(--out-bg-sheet)' }}>
        <DwgBar dwgNo="OUT-AUT-01" />
        <div className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <Cpu size={12} color="var(--out-ink)" />
            <span className="text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: 'var(--out-ink)' }}>
              Vault Status
            </span>
          </div>
          {!isAuthenticated ? (
            <div className="py-12 text-center">
              <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--out-muted)' }}>
                {address ? 'AUTHENTICATE TO VIEW VAULT STATUS' : 'CONNECT WALLET TO VIEW VAULT'}
              </div>
              {address && !isAuthenticated && (
                <button onClick={authenticate} disabled={authenticating}
                  className="inline-flex items-center gap-2 px-4 py-2 border text-[10px] uppercase tracking-widest"
                  style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>
                  {authenticating ? <RefreshCw size={10} className="animate-spin" /> : <LogIn size={10} />}
                  {authenticating ? 'SIGNING…' : 'AUTHENTICATE VAULT'}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Agent Address" value={vault?.agentAddress ? fmtAddr(vault.agentAddress) : '—'}
                sub={vault?.agentAddress ? 'REGISTERED ON-CHAIN' : 'NOT REGISTERED — SETUP VPS'} />
              <StatCard label="Status" value={vault?.status?.toUpperCase() ?? 'IDLE'}
                accent={statusColor} sub={vault ? 'VAULT ACTIVE' : 'NOT CONFIGURED'} />
              <StatCard label="Total Trades" value={vault?.totalTrades?.toLocaleString() ?? '0'}
                sub="EXECUTED ON-CHAIN" />
              <StatCard label="Total P&L"
                value={vault ? `$${vault.totalPnlUsd.toFixed(2)}` : '$0.00'}
                accent={vault && vault.totalPnlUsd >= 0 ? 'var(--out-ink)' : 'var(--out-danger)'}
                sub="USD REALIZED" />
            </div>
          )}
        </div>
      </div>

      {/* ════ OUT-AUT-02 — STRATEGY CONFIG ══════════════════════════════ */}
      <Sheet dwgNo="OUT-AUT-02">
        <div className="flex items-center gap-2 mb-6">
          <Zap size={12} color="var(--out-ink)" />
          <span className="text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: 'var(--out-ink)' }}>
            Strategy Configuration
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* LEFT — Token + Strategy */}
          <div className="flex flex-col gap-6">
            {/* Token */}
            <div>
              <SectionLabel>Target Token</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {TOKENS.map(t => (
                  <button key={t} onClick={() => patchStrategy('token', t)}
                    className="px-2.5 py-1 text-[10px] uppercase tracking-widest border transition-colors"
                    style={{
                      borderColor: strategy.token === t ? 'var(--out-ink)' : 'var(--out-ink-dim)',
                      color:       strategy.token === t ? 'var(--out-ink)' : 'var(--out-muted)',
                      background:  strategy.token === t ? '#12180f' : 'transparent',
                    }}>{t}</button>
                ))}
              </div>
            </div>

            {/* Strategy */}
            <div>
              <SectionLabel>Strategy Type</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
                {STRATEGIES.map(s => (
                  <button key={s.id} onClick={() => patchStrategy('strategy', s.id)}
                    className="border p-3 text-left transition-colors"
                    style={{
                      borderColor: strategy.strategy === s.id ? 'var(--out-ink)' : 'var(--out-ink-dim)',
                      background:  strategy.strategy === s.id ? '#12180f' : 'transparent',
                    }}>
                    <div className="text-[11px] font-bold uppercase tracking-widest mb-1"
                      style={{ color: strategy.strategy === s.id ? 'var(--out-ink)' : 'var(--out-text)' }}>
                      {s.label}
                    </div>
                    <div className="text-[9px] leading-snug" style={{ color: 'var(--out-muted)' }}>{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — Entry/TP/SL/Budget */}
          <div className="flex flex-col gap-5">
            {/* Entry condition */}
            <div>
              <SectionLabel>Entry Condition</SectionLabel>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {(['market','limit','dip','breakout'] as const).map(type => (
                  <button key={type} onClick={() => patchStrategy('entry_type', type)}
                    className="border py-2 text-[10px] uppercase tracking-widest transition-colors"
                    style={{
                      borderColor: strategy.entry_type === type ? 'var(--out-ink)' : 'var(--out-ink-dim)',
                      color:       strategy.entry_type === type ? 'var(--out-ink)' : 'var(--out-muted)',
                      background:  strategy.entry_type === type ? '#12180f' : 'transparent',
                    }}>
                    {type === 'dip' ? 'DIP %' : type === 'breakout' ? 'BREAKOUT' : type.toUpperCase()}
                  </button>
                ))}
              </div>
              {strategy.entry_type === 'limit' && (
                <ParamInput label="Limit Price (USD)" value={strategy.limit_price} unit="$"
                  onChange={v => patchStrategy('limit_price', v)} />
              )}
              {strategy.entry_type === 'dip' && (
                <ParamInput label="Dip Required" value={strategy.dip_pct} unit="%"
                  onChange={v => patchStrategy('dip_pct', v)} />
              )}
              {strategy.entry_type === 'breakout' && (
                <ParamInput label="Breakout Lookback" value={strategy.breakout_days} unit="days"
                  onChange={v => patchStrategy('breakout_days', v)} />
              )}
            </div>

            {/* TP / SL */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <SectionLabel>Take Profit</SectionLabel>
                <ParamInput label="" value={strategy.tp_pct} unit="%" onChange={v => patchStrategy('tp_pct', v)} />
                <div className="mt-1 text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>
                  CLOSE AT +{strategy.tp_pct || 0}%
                </div>
              </div>
              <div>
                <SectionLabel>Stop Loss</SectionLabel>
                <ParamInput label="" value={strategy.sl_pct} unit="%" onChange={v => patchStrategy('sl_pct', v)} />
                <div className="mt-1 text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-danger)' }}>
                  CLOSE AT −{strategy.sl_pct || 0}%
                </div>
              </div>
            </div>

            {/* Budget + concurrent */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <SectionLabel>Budget per Trade</SectionLabel>
                <ParamInput label="" value={strategy.budget_eth} unit="ETH" onChange={v => patchStrategy('budget_eth', v)} />
              </div>
              <div>
                <SectionLabel>Max Concurrent</SectionLabel>
                <ParamInput label="" value={strategy.max_concurrent} unit="pos" onChange={v => patchStrategy('max_concurrent', v)} />
              </div>
            </div>

            {/* Summary bar */}
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[{ k: 'TOKEN', v: strategy.token }, { k: 'TP', v: `+${strategy.tp_pct||0}%` }, { k: 'SL', v: `−${strategy.sl_pct||0}%` }].map(r => (
                <div key={r.k} className="border px-3 py-2 text-center" style={{ borderColor: 'var(--out-ink-dim)', background: '#060c05' }}>
                  <div className="text-[8px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>{r.k}</div>
                  <div className="text-[13px] font-bold" style={{ color: 'var(--out-ink)' }}>{r.v}</div>
                </div>
              ))}
            </div>

            {/* Save button */}
            {!address ? (
              <div className="mt-2 text-[10px] uppercase tracking-widest text-center py-3"
                style={{ border: '1px solid var(--out-ink-dim)', color: 'var(--out-muted)' }}>
                CONNECT WALLET TO SAVE
              </div>
            ) : (
              <button onClick={saveVault} disabled={saving || authenticating}
                className="mt-2 w-full py-3 text-[11px] uppercase tracking-widest font-bold border transition-colors"
                style={{
                  borderColor: saveFlash === 'ok' ? 'var(--out-ink)' : saveFlash === 'err' ? 'var(--out-danger)' : 'var(--out-ink)',
                  color:       saveFlash === 'ok' ? 'var(--out-ink)' : saveFlash === 'err' ? 'var(--out-danger)' : 'var(--out-ink)',
                  background:  saveFlash === 'ok' ? '#12180f' : '#060c05',
                  opacity: (saving || authenticating) ? 0.6 : 1,
                }}>
                {saving          ? 'SAVING…'
                : authenticating  ? 'SIGNING AUTH…'
                : !sessionToken   ? '[ SIGN & SAVE CONFIGURATION ]'
                : saveFlash === 'ok'  ? '✓ VAULT SAVED'
                : saveFlash === 'err' ? '✗ SAVE FAILED'
                : '[ SAVE CONFIGURATION ]'}
              </button>
            )}
          </div>
        </div>
      </Sheet>

      {/* ════ OUT-AUT-03 + OUT-AUT-04 ════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* OUT-AUT-03 — LIVE MONITOR */}
        <Sheet dwgNo="OUT-AUT-03">
          <div className="flex items-center gap-2 mb-5">
            <Activity size={12} color="var(--out-ink)" />
            <span className="text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: 'var(--out-ink)' }}>Live Monitor</span>
          </div>
          <div className="mb-6">
            <div className="text-[9px] uppercase tracking-widest mb-3 pb-2 border-b"
              style={{ color: 'var(--out-muted)', borderColor: 'var(--out-ink-dim)' }}>OPEN POSITIONS</div>
            <div className="py-8 text-center text-[10px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
              {isAuthenticated ? 'NO OPEN POSITIONS' : 'AUTHENTICATE TO VIEW'}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest mb-3 pb-2 border-b"
              style={{ color: 'var(--out-muted)', borderColor: 'var(--out-ink-dim)' }}>RECENT EXECUTIONS</div>
            {isAuthenticated && vault && vault.totalTrades > 0 ? (
              <div className="text-[10px] text-center py-4" style={{ color: 'var(--out-muted)' }}>
                {vault.totalTrades} TRADES EXECUTED
              </div>
            ) : (
              <div className="py-6 text-center">
                <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
                  {isAuthenticated ? 'NO EXECUTIONS YET' : 'AUTHENTICATE TO VIEW'}
                </div>
              </div>
            )}
          </div>
        </Sheet>

        {/* OUT-AUT-04 — API ACCESS */}
        <Sheet dwgNo="OUT-AUT-04">
          <div className="flex items-center gap-2 mb-5">
            <Key size={12} color="var(--out-ink)" />
            <span className="text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: 'var(--out-ink)' }}>API Access</span>
            {isAuthenticated && <span className="ml-auto text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>{keys.length}/5 ACTIVE</span>}
          </div>

          {!isAuthenticated ? (
            <div className="py-10 text-center">
              <div className="text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--out-muted)' }}>
                AUTHENTICATE TO MANAGE API KEYS
              </div>
              {address && (
                <button onClick={authenticate} disabled={authenticating}
                  className="inline-flex items-center gap-2 px-4 py-2 border text-[10px] uppercase tracking-widest"
                  style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>
                  {authenticating ? <RefreshCw size={10} className="animate-spin" /> : <LogIn size={10} />}
                  {authenticating ? 'SIGNING…' : 'AUTHENTICATE'}
                </button>
              )}
            </div>
          ) : (
            <>
              {/* New key banner */}
              {newKey && (
                <div className="mb-5 p-4" style={{ border: '1px solid var(--out-ink)', background: '#0a140a' }}>
                  <div className="text-[9px] uppercase tracking-widest font-bold mb-2" style={{ color: 'var(--out-ink)' }}>
                    ✓ KEY GENERATED — COPY NOW, SHOWN ONCE
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[10px] break-all" style={{ color: 'var(--out-ink)' }}>{newKey}</code>
                    <button onClick={async () => { await copyText(newKey); setCopiedKey(true); setTimeout(() => setCopiedKey(false), 2000); }}
                      className="shrink-0 p-1.5 border transition-colors"
                      style={{ borderColor: 'var(--out-ink)', color: copiedKey ? 'var(--out-ink)' : 'var(--out-muted)' }}>
                      {copiedKey ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                  <button onClick={() => setNewKey(null)} className="mt-2 text-[9px] uppercase tracking-widest"
                    style={{ color: 'var(--out-muted)' }}>DISMISS ×</button>
                </div>
              )}

              {/* Generate form */}
              <div className="flex gap-2 mb-5">
                <input value={keyName} onChange={e => setKeyName(e.target.value)}
                  placeholder="Key label (optional)"
                  className="flex-1 px-3 py-2 text-[10px] bg-transparent border outline-none"
                  style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-text)', ...MONO }} />
                <button onClick={generateKey} disabled={generating || keys.length >= 5}
                  className="flex items-center gap-1.5 px-3 py-2 border text-[10px] uppercase tracking-widest transition-opacity"
                  style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)', opacity: (generating || keys.length >= 5) ? 0.4 : 1 }}>
                  <Plus size={10} />
                  {generating ? 'GEN…' : 'GENERATE'}
                </button>
              </div>

              {/* Key list */}
              {keys.length === 0 ? (
                <div className="py-8 text-center text-[10px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
                  NO ACTIVE KEYS — GENERATE ONE ABOVE
                </div>
              ) : (
                <div className="space-y-2">
                  {keys.map(k => (
                    <div key={k.id} className="flex items-center gap-3 px-4 py-3 border"
                      style={{ borderColor: 'var(--out-ink-dim)', background: '#060c05' }}>
                      <Key size={10} color="var(--out-muted)" style={{ flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px]" style={{ color: 'var(--out-ink)' }}>
                          {k.keyPrefix}<span style={{ color: 'var(--out-muted)' }}>…</span>
                        </div>
                        <div className="text-[9px] mt-0.5 uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
                          {k.name ? `${k.name} · ` : ''}
                          CREATED {fmtDate(k.createdAt)}
                          {k.lastUsedAt ? ` · USED ${fmtDate(k.lastUsedAt)}` : ' · NEVER USED'}
                        </div>
                      </div>
                      <button onClick={() => revokeKey(k.id)} disabled={revoking === k.id}
                        className="shrink-0 p-1.5 opacity-40 hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--out-danger)' }}>
                        {revoking === k.id ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 pt-4 border-t text-[9px] uppercase tracking-widest"
                style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
                BASE URL · https://api.outrive.io · HEADER: Authorization: Bearer OTR-…
              </div>
            </>
          )}
        </Sheet>
      </div>

      {/* ════ OUT-AUT-05 — VPS AGENT SETUP ════════════════════════════ */}
      <Sheet dwgNo="OUT-AUT-05">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Server size={12} color="var(--out-ink)" />
            <span className="text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: 'var(--out-ink)' }}>VPS Agent Setup</span>
          </div>
          <a href={`${BASE_URL}/agent-skill-template.md`} download="agent-skill-template.md"
            className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: 'var(--out-ink)' }}>
            <Download size={10} /> SKILL.MD TEMPLATE
          </a>
        </div>

        {/* Step-by-step guide */}
        <div className="mb-8">
          <div className="text-[9px] uppercase tracking-[0.16em] mb-4" style={{ color: 'var(--out-muted)', ...MONO }}>
            SETUP GUIDE — STEPS 01 – 07
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {([
              {
                n: '01', title: 'INSTALL NODE.JS ON YOUR VPS',
                body: 'SSH into your VPS and install Node.js 20 LTS. Any Ubuntu 22.04+ server works (min 1 vCPU / 512 MB RAM).',
                cmd: 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -\nsudo apt install -y nodejs\nnode -v   # should print v20.x.x',
              },
              {
                n: '02', title: 'CREATE AGENT DIRECTORY',
                body: 'Create a fresh folder for the agent, initialise npm, and install the two required packages.',
                cmd: 'mkdir ~/outrive-agent && cd ~/outrive-agent\nnpm init -y\nnpm install dotenv viem',
              },
              {
                n: '03', title: 'GENERATE AN OTR API KEY',
                body: 'On this page: connect wallet → Authenticate → open API Access panel → enter a label → click Generate. Copy the full key — it is shown only once.',
                cmd: null,
              },
              {
                n: '04', title: 'CREATE YOUR .ENV FILE',
                body: 'Create the .env file with your agent wallet private key, OTR key, and wallet address. Never commit this file to git.',
                cmd: 'cat > ~/outrive-agent/.env << \'EOF\'\nAGENT_PRIVATE_KEY=0xYOUR_AGENT_PRIVATE_KEY\nOUTRIVE_API_KEY=OTR-your-key-here\nWALLET_ADDRESS=0xYOUR_WALLET\nOUTRIVE_API_URL=https://api.outrive.io\nEOF',
              },
              {
                n: '05', title: 'COPY INDEX.MJS TO YOUR VPS',
                body: 'Copy the full agent script from the AGENT LOOP snippet below into ~/outrive-agent/index.mjs. The script reads Robinhood Chain (chain ID 4663) — do not use Base or Ethereum mainnet.',
                cmd: 'nano ~/outrive-agent/index.mjs\n# paste the full AGENT LOOP snippet below\n# save with Ctrl+O, exit with Ctrl+X',
              },
              {
                n: '06', title: 'TEST & RUN THE AGENT',
                body: 'Test the OTR key first, then start the agent. You should see vault registered and tick logs every 30 seconds.',
                cmd: '# Test connection\ncurl -s https://api.outrive.io/api/autonomous/vault \\\n  -H "Authorization: Bearer OTR-your-key" | python3 -m json.tool\n\n# Run agent\ncd ~/outrive-agent && node index.mjs',
              },
              {
                n: '07', title: 'RUN PERMANENTLY WITH PM2',
                body: 'Use PM2 to keep the agent running after disconnecting from SSH and automatically restart it on server reboot.',
                cmd: 'npm install -g pm2\ncd ~/outrive-agent\npm2 start index.mjs --name outrive-agent\npm2 save && pm2 startup\n\n# Check live logs\npm2 logs outrive-agent\n\n# Stop / restart\npm2 stop outrive-agent\npm2 restart outrive-agent',
              },
            ] as { n: string; title: string; body: string; cmd: string | null }[]).map(s => (
              <div key={s.n} className="flex flex-col gap-2 p-4 border"
                style={{ borderColor: 'var(--out-ink-dim)', background: '#060c05' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[20px] font-bold leading-none" style={{ color: 'var(--out-ink)', ...MONO }}>{s.n}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>{s.title}</span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--out-text)' }}>{s.body}</p>
                {s.cmd && (
                  <pre className="mt-1 p-3 text-[10px] leading-relaxed overflow-x-auto whitespace-pre"
                    style={{ background: '#030703', border: '1px solid var(--out-ink-dim)', color: 'var(--out-ink)', ...MONO }}>
                    {s.cmd}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Code snippets */}
        <div className="text-[9px] uppercase tracking-[0.16em] mb-4" style={{ color: 'var(--out-muted)', ...MONO }}>
          REFERENCE CONFIG — COPY TO YOUR VPS
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <CodeBlock lang=".ENV — VPS CONFIG"       code={snippetEnv}    onCopy={() => copyText(snippetEnv)} />
          <CodeBlock lang="AGENT LOOP — NODE.JS"    code={snippetAgent}  onCopy={() => copyText(snippetAgent)} />
          <CodeBlock lang="DOCKER COMPOSE — DEPLOY" code={snippetDocker} onCopy={() => copyText(snippetDocker)} />
        </div>
        <div className="mt-4 flex items-center gap-2 text-[9px] uppercase tracking-widest"
          style={{ color: 'var(--out-muted)' }}>
          <Terminal size={9} />
          <span>Strategy config is read from this page · agent polls OUTRIVE API · private key stays on your VPS only</span>
        </div>
      </Sheet>

      {/* ════ OUT-AUT-06 — HERMES AI STRATEGY ════════════════════════════ */}
      <Sheet dwgNo="OUT-AUT-06">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Bot size={12} color="var(--out-ink)" />
            <span className="text-[11px] uppercase tracking-[0.12em] font-bold" style={{ color: 'var(--out-ink)' }}>
              Hermes AI Strategy
            </span>
            <span className="ml-2 px-2 py-px text-[9px] font-bold uppercase tracking-widest"
              style={{ border: '1px solid #4a6aff60', color: '#7090ff', background: '#04060f' }}>
              OPTIONAL LAYER
            </span>
          </div>
          <a href="https://hermes-agent.nousresearch.com/docs/" target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: 'var(--out-ink)' }}>
            <Code2 size={10} /> HERMES DOCS ↗
          </a>
        </div>

        {/* What is this */}
        <div className="mb-8 p-5" style={{ border: '1px solid var(--out-ink-dim)', background: '#050a05' }}>
          <div className="text-[9px] uppercase tracking-[0.16em] mb-3" style={{ color: 'var(--out-muted)' }}>
            WHAT IS HERMES AI STRATEGY
          </div>
          <p className="text-[11px] leading-relaxed mb-4" style={{ color: 'var(--out-text)' }}>
            Hermes Agent (NousResearch) is an open-source autonomous AI agent that runs on your VPS.
            When connected to OUTRIVE, it acts as an intelligent strategy orchestrator — it reads live
            market data and your portfolio state, reasons about conditions using an LLM, and updates
            your vault strategy parameters automatically.
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--out-text)' }}>
            Your existing trading agent (<code style={{ color: 'var(--out-ink)' }}>index.mjs</code>) keeps running
            unchanged — Hermes only writes to the vault config. Zero disruption to the current flow.
          </p>

          {/* Architecture diagram */}
          <div className="mt-5 p-4" style={{ background: '#030703', border: '1px solid var(--out-ink-dim)' }}>
            <div className="text-[9px] uppercase tracking-widest mb-3" style={{ color: 'var(--out-muted)' }}>
              ARCHITECTURE — HOW IT FITS
            </div>
            <div className="flex flex-col gap-2 text-[10px]" style={{ ...MONO }}>
              {[
                { label: 'HERMES AGENT',      desc: 'Reads market intel → reasons with LLM → updates strategy', color: '#7090ff', icon: <Bot size={9} /> },
                { label: '       ↓ writes vault config', desc: '', color: 'var(--out-muted)', icon: null },
                { label: 'OUTRIVE API',        desc: 'Stores vault config — /api/autonomous/market-intel', color: 'var(--out-ink)', icon: <Layers size={9} /> },
                { label: '       ↓ reads vault config', desc: '', color: 'var(--out-muted)', icon: null },
                { label: 'index.mjs (VPS)',    desc: 'Executes trades on Robinhood Chain (unchanged)', color: 'var(--out-ink)', icon: <Server size={9} /> },
                { label: '       ↓ signs + broadcasts', desc: '', color: 'var(--out-muted)', icon: null },
                { label: 'ROBINHOOD CHAIN',   desc: 'On-chain settlement (unchanged)', color: 'var(--out-ink-dim)', icon: <GitBranch size={9} /> },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  {row.icon && <span style={{ color: row.color, flexShrink: 0 }}>{row.icon}</span>}
                  {!row.icon && <span className="w-[9px] shrink-0" />}
                  <span style={{ color: row.color }}>{row.label}</span>
                  {row.desc && <span className="text-[9px]" style={{ color: 'var(--out-muted)' }}>— {row.desc}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Setup steps */}
        <div className="mb-8">
          <div className="text-[9px] uppercase tracking-[0.16em] mb-4" style={{ color: 'var(--out-muted)', ...MONO }}>
            SETUP GUIDE — STEPS 01 – 06
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {([
              {
                n: '01', title: 'INSTALL HERMES ON YOUR VPS',
                body: 'SSH into the same VPS running index.mjs. Install Hermes Agent with the one-line installer. Requires Python 3.10+ (usually pre-installed on Ubuntu 22.04).',
                cmd: '# Install Hermes Agent (NousResearch)\ncurl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash\n\n# Verify installation\nhermes --version',
              },
              {
                n: '02', title: 'INSTALL PYTHON REQUESTS',
                body: 'The OUTRIVE tools file uses the requests library to call the OUTRIVE API. Install it in your Python environment.',
                cmd: 'pip3 install requests python-dotenv\n\n# Or with pip if pip3 is not aliased\npip install requests python-dotenv',
              },
              {
                n: '03', title: 'CREATE OUTRIVE TOOLS FILE',
                body: 'Create the OUTRIVE tools file at ~/outrive-agent/hermes_tools.py. Copy the full HERMES TOOLS snippet below into this file. These three functions are what Hermes calls to interact with OUTRIVE.',
                cmd: 'nano ~/outrive-agent/hermes_tools.py\n# Paste the HERMES TOOLS snippet below\n# Save with Ctrl+O, exit with Ctrl+X',
              },
              {
                n: '04', title: 'CONFIGURE HERMES',
                body: 'Run Hermes setup wizard or manually create ~/.hermes/config.yaml. Copy the HERMES CONFIG snippet below. You need an LLM provider — OpenRouter with Hermes-3 is recommended (free tier available).',
                cmd: '# Interactive setup (easiest)\nhermes setup --portal\n\n# Or manually create config\nmkdir -p ~/.hermes\nnano ~/.hermes/config.yaml\n# Paste HERMES CONFIG snippet below',
              },
              {
                n: '05', title: 'ADD OTR KEY TO ENV',
                body: 'Add your OUTRIVE OTR key to your .env file (the same one used by index.mjs). Hermes reads this via python-dotenv in the tools file.',
                cmd: '# Add to ~/outrive-agent/.env (same file as index.mjs)\necho "OUTRIVE_API_URL=https://api.outrive.io" >> ~/outrive-agent/.env\n\n# OUTRIVE_API_KEY should already be there from index.mjs setup\n# Verify it is present:\ncat ~/outrive-agent/.env | grep OUTRIVE',
              },
              {
                n: '06', title: 'RUN THE SCHEDULER',
                body: 'Copy the HERMES SCHEDULER snippet to hermes_scheduler.py and run it with PM2. It triggers a Hermes analysis cycle every hour — Hermes reads market data, reasons with the LLM, and updates vault strategy if conditions warrant it.',
                cmd: 'nano ~/outrive-agent/hermes_scheduler.py\n# Paste HERMES SCHEDULER snippet below\n\n# Run with PM2 (keeps it alive on reboot)\npm2 start hermes_scheduler.py \\\n  --name hermes-strategy \\\n  --interpreter python3\npm2 save\n\n# Check live output\npm2 logs hermes-strategy',
              },
            ] as { n: string; title: string; body: string; cmd: string }[]).map(s => (
              <div key={s.n} className="flex flex-col gap-2 p-4 border"
                style={{ borderColor: '#4a6aff40', background: '#04060f' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[20px] font-bold leading-none" style={{ color: '#7090ff', ...MONO }}>{s.n}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#7090ff' }}>{s.title}</span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--out-text)' }}>{s.body}</p>
                <pre className="mt-1 p-3 text-[10px] leading-relaxed overflow-x-auto whitespace-pre"
                  style={{ background: '#020508', border: '1px solid #4a6aff30', color: '#a0b8ff', ...MONO }}>
                  {s.cmd}
                </pre>
              </div>
            ))}
          </div>
        </div>

        {/* Code snippets */}
        <div className="text-[9px] uppercase tracking-[0.16em] mb-4" style={{ color: 'var(--out-muted)', ...MONO }}>
          REFERENCE FILES — COPY TO YOUR VPS
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <CodeBlock
            lang="HERMES TOOLS — hermes_tools.py"
            onCopy={() => copyText(snippetHermesTools)}
            code={snippetHermesTools}
          />
          <CodeBlock
            lang="HERMES CONFIG — ~/.hermes/config.yaml"
            onCopy={() => copyText(snippetHermesConfig)}
            code={snippetHermesConfig}
          />
          <CodeBlock
            lang="HERMES SCHEDULER — hermes_scheduler.py"
            onCopy={() => copyText(snippetHermesScheduler)}
            code={snippetHermesScheduler}
          />
        </div>

        {/* What it DOES NOT change */}
        <div className="mt-6 p-4 flex items-start gap-3"
          style={{ border: '1px solid #4a6aff40', background: '#04060f' }}>
          <Bot size={11} style={{ color: '#7090ff', flexShrink: 0, marginTop: 1 }} />
          <div className="text-[11px] leading-relaxed" style={{ color: 'var(--out-muted)' }}>
            <span style={{ color: '#7090ff' }}>Non-disruptive by design.</span>{' '}
            Hermes only writes to <code style={{ color: '#7090ff' }}>strategyConfig</code> via{' '}
            <code style={{ color: '#7090ff' }}>POST /api/autonomous/vault</code>.{' '}
            It does not touch <code style={{ color: 'var(--out-ink)' }}>index.mjs</code>, does not sign transactions,
            does not hold your private key, and does not interfere with the trading loop.
            You can disable Hermes at any time by stopping <code style={{ color: '#7090ff' }}>hermes-strategy</code> in PM2
            — the trading agent continues running with the last saved config.
          </div>
        </div>
      </Sheet>

      {/* ════ Safety notice ══════════════════════════════════════════════ */}
      <div className="flex items-start gap-3 px-5 py-4 text-[11px]"
        style={{ border: '1px solid #e0902040', background: 'rgba(224,144,32,0.04)', color: 'var(--out-muted)' }}>
        <AlertTriangle size={12} style={{ color: '#e09020', flexShrink: 0, marginTop: 1 }} />
        <span>
          <span style={{ color: '#e09020' }}>Non-custodial.</span> Your private key is configured only on your own VPS —
          OUTRIVE never sees or stores it. This page shows monitor data and lets you update strategy;
          the agent running on your server handles all signing and on-chain execution.
          All trades are irreversible — start with small <code style={{ color: 'var(--out-ink)' }}>budget_eth</code> values.
        </span>
      </div>
    </div>
  );
}
