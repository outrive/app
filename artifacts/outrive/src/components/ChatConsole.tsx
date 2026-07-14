import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sheet } from '@/components/Sheet';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { streamChat, fetchCredits, type ChatEvent, type CreditInfo, type UnsignedTx, type LaunchPreview } from '@/lib/chatStream';
import { useRecordLaunch } from '@workspace/api-client-react';
import { getExplorerUrl } from '@/lib/chains';
import { LaunchSuccessPanel } from '@/components/LaunchSuccessPanel';
import { MarkdownMessage } from '@/components/MarkdownMessage';

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════════════ */
interface LocalMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
}

interface TxPayload {
  needsApproval: false;
  launchTx: UnsignedTx;
  preview: LaunchPreview;
  serverTxHash?: `0x${string}`; // present when OUTRIVE signed server-side
}

type SignStep     = 'idle' | 'launch' | 'pending' | 'confirmed' | 'failed';
type ActivateStep = 'idle' | 'activating' | 'done' | 'failed';
type InputMode   = 'prompt' | 'cli';
type CliColor    = 'ink' | 'dim' | 'text' | 'muted' | 'warn' | 'danger' | 'up' | 'down';

interface CliLine { text: string; color: CliColor; bold?: boolean; }

/* ═══════════════════════════════════════════════════════════════════════════
   COLOR MAP
═══════════════════════════════════════════════════════════════════════════ */
const CLR: Record<CliColor, string> = {
  ink:    'var(--out-ink)',
  dim:    'var(--out-ink-dim)',
  text:   'var(--out-text)',
  muted:  'var(--out-muted)',
  warn:   'var(--out-warn)',
  danger: 'var(--out-danger)',
  up:     'var(--out-up)',
  down:   'var(--out-down)',
};

/* ═══════════════════════════════════════════════════════════════════════════
   LINE HELPERS
═══════════════════════════════════════════════════════════════════════════ */
const L   = (text: string, color: CliColor = 'text', bold = false): CliLine => ({ text, color, bold });
const BL  = (): CliLine => L('', 'muted');
const SEP = (len = 56): CliLine => L('  ' + '─'.repeat(len), 'dim');

/* ═══════════════════════════════════════════════════════════════════════════
   BOOT BANNER
═══════════════════════════════════════════════════════════════════════════ */
const makeBanner = (addr?: string): CliLine[] => [
  L('  ╔══════════════════════════════════════════════════════════╗', 'dim'),
  L('  ║                                                          ║', 'dim'),
  L('  ║   ▲  OUTRIVE  AGENT CLI                    v1.0.0        ║', 'ink', true),
  L('  ║   Virtuals Protocol · Robinhood Chain · chainId 4663     ║', 'muted'),
  L('  ║                                                          ║', 'dim'),
  L('  ╚══════════════════════════════════════════════════════════╝', 'dim'),
  BL(),
  L(`  wallet   ${addr ?? 'NOT CONNECTED — connect your wallet first'}`, addr ? 'text' : 'warn'),
  BL(),
  L("  Run 'help' for the full command reference.", 'muted'),
  L("  ↑ ↓ navigate history · Tab autocomplete.", 'muted'),
  BL(),
];

/* ═══════════════════════════════════════════════════════════════════════════
   HELP OUTPUT
═══════════════════════════════════════════════════════════════════════════ */
const HELP_LINES: CliLine[] = [
  BL(),
  L('  OUTRIVE CLI — COMMAND REFERENCE', 'ink', true),
  SEP(),
  BL(),

  L('  ◆ LAUNCH ─────────────────────────────────────────────────────', 'dim', true),
  BL(),
  L('    launch <name> <ticker>', 'ink'),
  L('        Launch an agent token (gas only, no dev buy)', 'muted'),
  BL(),
  L('    launch <name> <ticker> --desc "…"', 'ink'),
  L('        Launch with a custom description (≤500 chars)', 'muted'),
  BL(),
  L('    Examples:', 'dim'),
  L('        launch SkyNet SKYN', 'muted'),
  L('        launch "Deep Quant" DQNT --desc "AI quantitative trading agent"', 'muted'),
  BL(),

  L('  ◆ WALLET ─────────────────────────────────────────────────────', 'dim', true),
  BL(),
  L('    balance  │  bal', 'ink'),
  L('        ETH gas balance + $VIRTUAL token balance', 'muted'),
  BL(),
  L('    whoami', 'ink'),
  L('        Display connected wallet address', 'muted'),
  BL(),
  L('    fees', 'ink'),
  L('        Accumulated creator fee earnings (requires calibration)', 'muted'),
  BL(),

  L('  ◆ MARKET ─────────────────────────────────────────────────────', 'dim', true),
  BL(),
  L('    market  │  market newest', 'ink'),
  L('        Market overview — newest agent tokens first', 'muted'),
  BL(),
  L('    market trending', 'ink'),
  L('        Trending agents ordered by 24h volume', 'muted'),
  BL(),
  L('    token <address>', 'ink'),
  L('        Token detail — price, curve progress, holders, volume', 'muted'),
  BL(),

  L('  ◆ PORTFOLIO ──────────────────────────────────────────────────', 'dim', true),
  BL(),
  L('    launches  │  my', 'ink'),
  L('        All agent token launches from this wallet', 'muted'),
  BL(),

  L('  ◆ SYSTEM ─────────────────────────────────────────────────────', 'dim', true),
  BL(),
  L('    status', 'ink'),
  L('        Protocol RPC health + calibration status', 'muted'),
  BL(),
  L('    version  │  ver', 'ink'),
  L('        CLI version, build info, and chain params', 'muted'),
  BL(),
  L('    clear  │  cls', 'ink'),
  L('        Clear terminal and reprint boot banner', 'muted'),
  BL(),
  L('    help  │  ?', 'ink'),
  L('        Show this command reference', 'muted'),
  BL(),

  SEP(),
  L('  ◈  Natural language also works — the AI agent interprets it.', 'muted'),
  L('  ◈  ↑ ↓ arrow keys navigate command history (last 50 entries).', 'muted'),
  L('  ◈  Tab autocompletes the first matching command.', 'muted'),
  BL(),
];

/* ═══════════════════════════════════════════════════════════════════════════
   VERSION OUTPUT
═══════════════════════════════════════════════════════════════════════════ */
const VERSION_LINES: CliLine[] = [
  BL(),
  L('  ▲ OUTRIVE AGENT CLI', 'ink', true),
  SEP(42),
  L('  version      v1.0.0', 'text'),
  L('  build        July 2026', 'text'),
  L('  network      Robinhood Mainnet  ·  chainId 4663', 'text'),
  L('  rpc          https://rpc.mainnet.chain.robinhood.com', 'text'),
  L('  explorer     robinhoodchain.blockscout.com', 'text'),
  L('  protocol     Virtuals Protocol (Agent Factory)', 'text'),
  L('  model        claude-sonnet-4 (Anthropic Messages API)', 'text'),
  L('  custody      non-custodial · user-signed only · no backend keys', 'muted'),
  L('  license      independent software — not affiliated with Virtuals or Robinhood', 'muted'),
  BL(),
];

/* ═══════════════════════════════════════════════════════════════════════════
   TAB AUTOCOMPLETE CANDIDATES
═══════════════════════════════════════════════════════════════════════════ */
const TAB_CMDS = [
  'balance', 'bal', 'clear', 'cls', 'fees', 'help',
  'launch', 'launches', 'market', 'market newest', 'market trending',
  'my', 'status', 'token', 'version', 'ver', 'whoami',
];

/* ═══════════════════════════════════════════════════════════════════════════
   COMMAND PARSER
═══════════════════════════════════════════════════════════════════════════ */
type ParseResult =
  | { kind: 'builtin'; action: 'help' | 'clear' | 'version' }
  | { kind: 'whoami' }
  | { kind: 'stream'; message: string };

function parseCmd(raw: string): ParseResult {
  const t = raw.trim();
  const l = t.toLowerCase();

  if (l === 'help' || l === '?')             return { kind: 'builtin', action: 'help' };
  if (l === 'clear' || l === 'cls')          return { kind: 'builtin', action: 'clear' };
  if (l === 'version' || l === 'ver')        return { kind: 'builtin', action: 'version' };
  if (l === 'whoami')                        return { kind: 'whoami' };

  if (l === 'balance' || l === 'bal')
    return { kind: 'stream', message: 'check my ETH gas balance and $VIRTUAL token balance' };

  if (l === 'launches' || l === 'my')
    return { kind: 'stream', message: 'show all agent token launches from my wallet' };

  if (l === 'status')
    return { kind: 'stream', message: 'show the current system status, RPC health, and calibration status' };

  if (l === 'fees')
    return { kind: 'stream', message: 'show my accumulated creator fee earnings from agent token trades' };

  if (l === 'market' || l === 'market newest')
    return { kind: 'stream', message: 'give me the market overview — newest agent tokens first' };

  if (l === 'market trending')
    return { kind: 'stream', message: 'show trending agent tokens ordered by 24h volume' };

  if (l.startsWith('market ')) {
    const tab = t.slice(7).trim();
    return { kind: 'stream', message: `show market overview, tab: ${tab}` };
  }

  if (l.startsWith('token ')) {
    const addr = t.slice(6).trim();
    if (!addr) return { kind: 'stream', message: 'Usage: token <0x address>' };
    return { kind: 'stream', message: `get token info for address ${addr}` };
  }

  if (l.startsWith('launch ')) {
    const rest      = t.slice(7).trim();
    const descMatch = rest.match(/--desc\s+"([^"]+)"/i) ?? rest.match(/--desc\s+'([^']+)'/i);
    const clean     = rest
      .replace(/--desc\s+"[^"]+"/gi, '')
      .replace(/--desc\s+'[^']+'/gi, '')
      .trim();
    const parts = clean.split(/\s+/).filter(Boolean);

    if (parts.length >= 2) {
      const ticker = parts[parts.length - 1].toUpperCase();
      const name   = parts.slice(0, -1).join(' ');
      let msg      = `launch an agent token called ${name}, ticker ${ticker}`;
      if (descMatch) msg += `, description: "${descMatch[1]}"`;
      return { kind: 'stream', message: msg };
    }
    return {
      kind: 'stream',
      message: 'Usage: launch <name> <ticker> [--desc "…"]\n  Example: launch SkyNet SKYN',
    };
  }

  return { kind: 'stream', message: t };
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
export function ChatConsole() {
  const { address, chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [mode, setMode]           = useState<InputMode>('prompt');
  const [messages, setMessages]   = useState<LocalMessage[]>([]);
  const [cliLines, setCliLines]   = useState<CliLine[]>(() => makeBanner());
  const [input, setInput]         = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [txPayload, setTxPayload]     = useState<TxPayload | null>(null);
  const [signStep, setSignStep]       = useState<SignStep>('idle');
  const [launchSuccess, setLaunchSuccess] = useState<{ name: string; ticker: string; hash: `0x${string}` } | null>(null);
  const [cmdHistory, setCmdHistory]   = useState<string[]>([]);
  const [historyIdx, setHistoryIdx]   = useState(-1);
  const [credits, setCredits]         = useState<CreditInfo | null>(null);
  const [txErrorMsg, setTxErrorMsg]   = useState<string | null>(null);

  const messagesEndRef      = useRef<HTMLDivElement>(null);
  const scrollContainerRef  = useRef<HTMLDivElement>(null);
  const cliEndRef           = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const hasRecordedRef = useRef(false);
  const assistantIdRef = useRef('');

  const { sendTransaction, reset: resetSend, data: hash, isPending: isSigning, isError: isSendError, error: sendTxError } = useSendTransaction();
  const { isSuccess: isConfirmed, isError: isTxFailed, data: receipt } = useWaitForTransactionReceipt({ hash });
  // Track whether we've actually initiated a send — prevents stale isSendError from firing
  const hasSentRef = useRef(false);

  // Activate (launch()) state — step 2 after preLaunch confirms
  const [activateStep, setActivateStep]           = useState<ActivateStep>('idle');
  const [activateTxHash, setActivateTxHash]       = useState<`0x${string}` | undefined>(undefined);
  const [activateUnsignedTx, setActivateUnsignedTx] = useState<UnsignedTx | null>(null);
  const { sendTransaction: sendActivateTx, data: activateHash, isPending: isActivatePending } = useSendTransaction();
  const { isSuccess: isActivateConfirmed } = useWaitForTransactionReceipt({ hash: activateHash });

  const recordLaunch = useRecordLaunch();
  const explorerBase = getExplorerUrl();

  /* ── Refresh banner wallet line when address changes ── */
  useEffect(() => {
    setCliLines(makeBanner(address));
  }, [address]);

  /* ── Credit fetch — refresh on wallet connect/disconnect ── */
  const refreshCredits = useCallback(() => {
    if (!address) { setCredits(null); return; }
    fetchCredits(address).then(c => { if (c) setCredits(c); });
  }, [address]);

  useEffect(() => { refreshCredits(); }, [refreshCredits]);

  /* ── Auto-scroll ── */
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, txPayload, isStreaming]);

  useEffect(() => {
    cliEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [cliLines, txPayload]);

  useEffect(() => {
    hasRecordedRef.current = false;
    hasSentRef.current     = false;
    setSignStep('idle');
    setTxErrorMsg(null);
    setLaunchSuccess(null);
    setActivateStep('idle');
    setActivateTxHash(undefined);
    setActivateUnsignedTx(null);
    resetSend();
  }, [txPayload]);

  /* ── TX confirmation state machine ── */
  useEffect(() => {
    if (isConfirmed && hash && signStep === 'pending') {
      setSignStep('confirmed');
      // Surface post-launch panel with real-time chart
      if (txPayload) {
        setLaunchSuccess({ name: txPayload.preview.name, ticker: txPayload.preview.ticker, hash });
      }
      if (txPayload && address && !hasRecordedRef.current) {
        hasRecordedRef.current = true;
        recordLaunch.mutate({
          data: {
            walletAddress: address,
            name: txPayload.preview.name,
            ticker: txPayload.preview.ticker,
            txHash: hash,
            network: 'mainnet',
          },
        });
      }
    }
    if (isTxFailed  && signStep === 'pending') setSignStep('failed');
    // Guard: only fire isSendError if we actually attempted a send (avoids stale isError from
    // previous failed call triggering FAILED immediately on every RETRY click)
    if (isSendError && hasSentRef.current && signStep === 'pending') setSignStep('failed');
  }, [isConfirmed, isTxFailed, isSendError, hash, signStep]);

  /* ── Step 2: auto-activate after preLaunch confirms ── */
  useEffect(() => {
    if (signStep !== 'confirmed' || activateStep !== 'idle' || !receipt) return;

    // Extract token address from receipt: find Transfer(from=0x0) — minted by the new token contract
    const TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const ZERO_PADDED  = '0x0000000000000000000000000000000000000000000000000000000000000000';
    let tokenAddr: `0x${string}` | null = null;
    for (const log of receipt.logs ?? []) {
      if (
        log.topics?.[0]?.toLowerCase() === TRANSFER_SIG &&
        log.topics?.[1]?.toLowerCase() === ZERO_PADDED
      ) {
        tokenAddr = log.address as `0x${string}`;
        break;
      }
    }
    if (!tokenAddr) { setActivateStep('failed'); return; }

    setActivateStep('activating');
    const baseUrl = (import.meta.env.BASE_URL ?? '').replace(/\/$/, '');
    fetch(`${baseUrl}/api/launch/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenAddress: tokenAddr }),
    })
      .then(r => r.json())
      .then((data: { mode: string; txHash?: string; unsignedTx?: UnsignedTx }) => {
        if (data.mode === 'server' && data.txHash) {
          setActivateTxHash(data.txHash as `0x${string}`);
          setActivateStep('done');
        } else if (data.mode === 'user' && data.unsignedTx) {
          setActivateUnsignedTx(data.unsignedTx);
          setActivateStep('failed'); // shows "ACTIVATE TRADING →" button
        } else {
          setActivateStep('failed');
        }
      })
      .catch(() => setActivateStep('failed'));
  }, [signStep, activateStep, receipt]);

  /* ── Watch for user-signed activate tx ── */
  useEffect(() => {
    if (isActivateConfirmed && activateHash) {
      setActivateTxHash(activateHash);
      setActivateStep('done');
    }
  }, [isActivateConfirmed, activateHash]);

  /* ═══════════════════════════════════════════════════════════════════════
     STREAM RUNNER
  ═══════════════════════════════════════════════════════════════════════ */
  const runStream = useCallback(async (userText: string) => {
    if (!address || isStreaming) return;
    setIsStreaming(true);
    setTxPayload(null);
    assistantIdRef.current = '';

    const newUserMsg: LocalMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
    };

    if (mode === 'prompt') setMessages(prev => [...prev, newUserMsg]);

    const apiMessages = mode === 'prompt'
      ? [...messages, newUserMsg].map(m => ({
          role: m.role === 'tool' || m.role === 'system' ? 'assistant' : m.role,
          content: m.content,
        }))
      : [{ role: 'user', content: userText }];

    await streamChat(apiMessages, address, null, (event: ChatEvent) => {
      if (event.type === 'text') {
        if (mode === 'prompt') {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (assistantIdRef.current && last?.id === assistantIdRef.current) {
              return [...prev.slice(0, -1), { ...last, content: last.content + event.content }];
            }
            assistantIdRef.current = `asst-${Date.now()}`;
            return [...prev, { id: assistantIdRef.current, role: 'assistant', content: event.content }];
          });
        } else {
          // CLI mode — stream text into the last agent line or start a new one
          setCliLines(prev => {
            const last = prev[prev.length - 1];
            if (last && last.color === 'text' && last.text.startsWith('  ▸ ')) {
              return [...prev.slice(0, -1), { ...last, text: last.text + event.content }];
            }
            return [...prev, L(`  ▸ ${event.content}`, 'text')];
          });
        }
      } else if (event.type === 'tool_call') {
        if (event.status === 'running') {
          const ln = L(`  ⟶ ${event.toolName}()  …`, 'dim');
          if (mode === 'prompt') {
            setMessages(prev => [
              ...prev,
              { id: `tool-run-${Date.now()}`, role: 'tool', content: ln.text },
            ]);
          } else {
            setCliLines(prev => [...prev, ln]);
          }
        } else {
          const ln = L(`  ⟶ ${event.toolName}()  [${event.duration ?? 0}ms]  ✓`, 'dim');
          if (mode === 'prompt') {
            setMessages(prev => {
              // replace running line if present
              const idx = [...prev].reverse().findIndex(
                m => m.role === 'tool' && m.content.includes(`${event.toolName}()  …`)
              );
              if (idx !== -1) {
                const real = prev.length - 1 - idx;
                const next = [...prev];
                next[real] = { ...next[real], content: ln.text };
                return next;
              }
              return [...prev, { id: `tool-done-${Date.now()}`, role: 'tool', content: ln.text }];
            });
          } else {
            setCliLines(prev => {
              const idx = [...prev].reverse().findIndex(
                p => p.text.includes(`${event.toolName}()  …`)
              );
              if (idx !== -1) {
                const real = prev.length - 1 - idx;
                const next = [...prev];
                next[real] = ln;
                return next;
              }
              return [...prev, ln];
            });
          }
        }
      } else if (event.type === 'launch_result') {
        // Server signed and broadcast — show confirmed Work Order immediately
        const payload: TxPayload = {
          needsApproval: false,
          launchTx: { to: '0x0000000000000000000000000000000000000000' as `0x${string}`, data: '0x', value: '0' },
          preview: event.preview,
          serverTxHash: event.txHash,
        };
        hasRecordedRef.current = true;
        setTxPayload(payload);
        setSignStep('confirmed');
        setLaunchSuccess({ name: event.preview.name, ticker: event.preview.ticker, hash: event.txHash });
        if (address) {
          recordLaunch.mutate({
            data: {
              walletAddress: address,
              name:          event.preview.name,
              ticker:        event.preview.ticker,
              txHash:        event.txHash,
              network:       'mainnet',
            },
          });
        }
        if (mode === 'cli') setCliLines(prev => [...prev, BL()]);
      } else if (event.type === 'launch_error') {
        if (mode === 'cli') {
          setCliLines(prev => [
            ...prev,
            BL(),
            L(`  ✗ LAUNCH FAILED — ${event.message}`, 'danger', true),
            BL(),
          ]);
        }
      } else if (event.type === 'tx_payload') {
        setTxPayload(event);
        setSignStep('launch');
        if (mode === 'cli') setCliLines(prev => [...prev, BL()]);
      } else if (event.type === 'credits_required') {
        setIsStreaming(false);
        refreshCredits();
        if (mode === 'cli') {
          setCliLines(prev => [
            ...prev,
            BL(),
            L('  ⊘ CREDIT REQUIRED — all 10 free chats used.', 'warn', true),
            L('  Buy $OTR tokens to unlock more chats. 1 $OTR = 1 CHAT', 'muted'),
            BL(),
          ]);
        }
      } else if (event.type === 'done' || event.type === 'error') {
        setIsStreaming(false);
        refreshCredits();   // update remaining count after each chat
        if (event.type === 'error') {
          if (mode === 'cli') {
            setCliLines(prev => [
              ...prev,
              L(`  ✗ ERROR  ${event.message}`, 'danger'),
              BL(),
            ]);
          }
        } else if (mode === 'cli') {
          setCliLines(prev => [...prev, BL()]);
        }
      }
    });
  }, [address, isStreaming, messages, mode, refreshCredits]);

  /* ═══════════════════════════════════════════════════════════════════════
     BUILT-IN COMMAND EXECUTOR  (no API call needed)
  ═══════════════════════════════════════════════════════════════════════ */
  const execBuiltin = useCallback((result: ParseResult) => {
    if (result.kind === 'builtin') {
      if (result.action === 'help')    setCliLines(prev => [...prev, ...HELP_LINES]);
      if (result.action === 'clear')   setCliLines(makeBanner(address));
      if (result.action === 'version') setCliLines(prev => [...prev, ...VERSION_LINES]);
      return true;
    }
    if (result.kind === 'whoami') {
      setCliLines(prev => [
        ...prev,
        BL(),
        L(`  address    ${address ?? 'NOT CONNECTED'}`, address ? 'ink' : 'warn'),
        ...(address ? [
          L(`  short      ${address.slice(0, 6)}…${address.slice(-4)}`, 'muted'),
        ] : []),
        BL(),
      ]);
      return true;
    }
    return false;
  }, [address]);

  /* ═══════════════════════════════════════════════════════════════════════
     SUBMIT
  ═══════════════════════════════════════════════════════════════════════ */
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;
    const raw = input.trim();
    setInput('');
    setHistoryIdx(-1);

    if (mode === 'cli') {
      setCmdHistory(prev => [raw, ...prev.slice(0, 49)]);
      setCliLines(prev => [...prev, L(`  $ ${raw}`, 'ink')]);

      const result = parseCmd(raw);
      if (execBuiltin(result)) return;
      if (result.kind === 'stream') await runStream(result.message);
    } else {
      await runStream(raw);
    }
  };

  /* ═══════════════════════════════════════════════════════════════════════
     KEYBOARD  (history + tab)
  ═══════════════════════════════════════════════════════════════════════ */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mode !== 'cli') return;

    if (e.key === 'Tab') {
      e.preventDefault();
      const partial = input.toLowerCase();
      if (!partial) return;
      const match = TAB_CMDS.find(c => c.startsWith(partial) && c !== partial);
      if (match) setInput(match);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, cmdHistory.length - 1);
      setHistoryIdx(next);
      setInput(cmdHistory[next] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(historyIdx - 1, -1);
      setHistoryIdx(next);
      setInput(next === -1 ? '' : cmdHistory[next] ?? '');
    }
  };

  /* ═══════════════════════════════════════════════════════════════════════
     QUICK ACTIONS
  ═══════════════════════════════════════════════════════════════════════ */
  const quickActions = [
    { label: '▲ LAUNCH TOKEN', text: mode === 'cli' ? 'launch MyAgent MYAG' : 'I want to launch an AI agent token' },
    { label: '◈ BALANCE',      text: mode === 'cli' ? 'balance'             : 'what are my ETH and $VIRTUAL balances?' },
    { label: '▤ MARKET',       text: mode === 'cli' ? 'market newest'       : 'show me the market overview' },
    { label: '▣ MY LAUNCHES',  text: mode === 'cli' ? 'launches'            : 'show my agent token launches' },
  ];

  const handleQuickAction = useCallback(async (text: string) => {
    if (isStreaming || !address) return;
    if (mode === 'cli') {
      setCmdHistory(prev => [text, ...prev.slice(0, 49)]);
      setCliLines(prev => [...prev, L(`  $ ${text}`, 'ink')]);
      const result = parseCmd(text);
      if (execBuiltin(result)) return;
      if (result.kind === 'stream') await runStream(result.message);
    } else {
      await runStream(text);
    }
  }, [isStreaming, address, mode, runStream, execBuiltin]);

  /* ═══════════════════════════════════════════════════════════════════════
     TX HANDLERS
  ═══════════════════════════════════════════════════════════════════════ */
  const handleLaunch = async () => {
    if (!txPayload?.launchTx) return;
    // ── CRITICAL: reset wagmi send state FIRST.
    // Without this, isSendError stays true from the previous attempt.
    // The useEffect watching isSendError would immediately flip signStep back
    // to 'failed' the moment we set it to 'pending', so MetaMask never opens.
    resetSend();
    hasSentRef.current = false;
    setTxErrorMsg(null);
    setSignStep('pending');

    // Step 1: explicit chain switch BEFORE sending tx.
    // Doing this separately lets us give a clear error if the chain switch fails,
    // rather than having wagmi swallow it inside sendTransaction.
    if (chain?.id !== 4663) {
      try {
        await switchChainAsync({ chainId: 4663 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[OUTRIVE] switchChain failed:', msg);
        setTxErrorMsg(`Chain switch failed: ${msg}`);
        setSignStep('failed');
        return;
      }
    }

    // Step 2: send the transaction — wallet is now on Robinhood Chain
    hasSentRef.current = true;
    sendTransaction(
      {
        to:    txPayload.launchTx.to,
        data:  txPayload.launchTx.data,
        value: BigInt(txPayload.launchTx.value || '0'),
        // No chainId here — already switched above; avoids double MetaMask popup
      },
      {
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[OUTRIVE] sendTransaction failed:', msg);
          setTxErrorMsg(msg);
          setSignStep('failed');
        },
      },
    );
  };

  const handleActivate = async () => {
    if (!activateUnsignedTx) return;
    setActivateStep('activating');
    if (chain?.id !== 4663) {
      try {
        await switchChainAsync({ chainId: 4663 });
      } catch {
        setActivateStep('failed');
        return;
      }
    }
    sendActivateTx(
      {
        to:    activateUnsignedTx.to,
        data:  activateUnsignedTx.data,
        value: BigInt(activateUnsignedTx.value || '0'),
      },
      { onError: () => setActivateStep('failed') },
    );
  };

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════════ */
  return (
    <Sheet dwgNo="OUT-CHT-01" className="flex flex-col" style={{ minHeight: 360 }}>

      {/* ── Mode switcher + status + credit bar ── */}
      <div className="flex flex-col gap-2 mb-4 border-b pb-3" style={{ borderColor: 'var(--out-ink-dim)' }}>
        <div className="flex items-center gap-0">
          <div className="flex gap-1.5 text-[10px] font-mono mr-auto">
            {(['prompt', 'cli'] as InputMode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setInput(''); }}
                className="flex items-center gap-1.5 px-3 py-1 uppercase tracking-widest border transition-all"
                style={{
                  borderColor: mode === m ? 'var(--out-ink)' : 'var(--out-ink-dim)',
                  color:       mode === m ? 'var(--out-bg)'  : 'var(--out-muted)',
                  background:  mode === m ? 'var(--out-ink)' : 'transparent',
                  fontWeight:  mode === m ? 700 : 400,
                }}
              >
                {m === 'prompt'
                  ? <><span>◈</span> PROMPT</>
                  : <><span style={{ color: mode === m ? 'var(--out-bg)' : 'var(--out-muted)' }}>$_</span> CLI</>}
              </button>
            ))}
          </div>
          <span className="font-mono text-[10px]" style={{ color: 'var(--out-muted)' }}>
            {address
              ? <><span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: 'var(--out-ink)' }} />{address.slice(0,6)}…{address.slice(-4)}</>
              : <><span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: 'var(--out-warn)' }} /><span style={{ color: 'var(--out-warn)' }}>NOT CONNECTED</span></>}
          </span>
        </div>

        {/* ── Credit meter (only when wallet connected) ── */}
        {address && credits && (
          <div className="flex items-center gap-3 font-mono text-[9px]">
            {/* free tier bar */}
            <div className="flex items-center gap-1.5">
              <span style={{ color: 'var(--out-muted)' }}>FREE</span>
              <div className="flex gap-[2px]">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 7, height: 7,
                      background: i < credits.freeChatsUsed ? 'var(--out-ink-dim)' : 'var(--out-ink)',
                      opacity:    i < credits.freeChatsUsed ? 0.25 : 1,
                    }}
                  />
                ))}
              </div>
              <span style={{
                color: credits.freeRemaining === 0 ? 'var(--out-warn)' :
                       credits.freeRemaining <= 3  ? '#f59e0b' : 'var(--out-ink)',
                fontWeight: 700,
              }}>
                {credits.freeRemaining}/{credits.freeChatsTotal}
              </span>
            </div>

            <span style={{ color: 'var(--out-ink-dim)' }}>·</span>

            {/* OTR credits */}
            <div className="flex items-center gap-1">
              <span style={{ color: 'var(--out-muted)' }}>$OTR CREDITS</span>
              <span style={{ color: credits.otrCredits > 0 ? 'var(--out-ink)' : 'var(--out-muted)', fontWeight: 700 }}>
                {credits.otrCredits.toFixed(2)}
              </span>
            </div>

            {credits.freeRemaining === 0 && credits.otrCredits <= 0 && (
              <span className="ml-auto border px-1.5 py-0.5 text-[8px] uppercase tracking-widest animate-pulse"
                style={{ borderColor: 'var(--out-warn)', color: 'var(--out-warn)' }}>
                ⊘ NO CREDITS
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── PROMPT MODE ── */}
      {mode === 'prompt' && (
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto mb-4 pr-2"
          style={{ minHeight: 240, scrollBehavior: 'smooth' }}
        >
          {messages.length === 0 && !isStreaming && !txPayload ? (
            <div className="flex flex-col items-center justify-center h-full gap-5 py-10">
              <img
                src="/outrive-logo.png"
                alt="OUTRIVE"
                width={56}
                height={56}
                style={{
                  filter: 'drop-shadow(0 0 12px var(--out-ink)) drop-shadow(0 0 28px color-mix(in srgb, var(--out-ink) 40%, transparent))',
                  opacity: 0.92,
                }}
              />
              <div className="text-center space-y-2">
                <div className="text-[11px] font-bold tracking-[0.2em] uppercase"
                  style={{ color: 'var(--out-ink)', fontFamily: "'Space Grotesk', sans-serif" }}>
                  OUTRIVE AGENT
                </div>
                <div className="text-[11px] leading-relaxed max-w-xs"
                  style={{ color: 'var(--out-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                  Describe your agent token.<br />
                  <span style={{ color: 'var(--out-ink)' }}>Your wallet signs. You own it on-chain.</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5 py-2">
              {messages.map(m => (
                <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {m.role === 'tool' ? (
                    /* Tool call indicator — compact, not raw text */
                    <div className="flex items-center gap-2 text-[10px] font-mono px-1"
                      style={{ color: 'var(--out-ink-dim)' }}>
                      <span style={{ color: 'var(--out-ink)', opacity: 0.5 }}>◎</span>
                      <span>{m.content}</span>
                    </div>
                  ) : m.role === 'user' ? (
                    <div className="max-w-[84%]">
                      <div className="text-[9px] font-mono uppercase tracking-widest mb-1 text-right"
                        style={{ color: 'var(--out-muted)' }}>YOU</div>
                      <div className="px-3 py-2 text-[12px] font-mono leading-relaxed"
                        style={{
                          background: '#0E140E',
                          border: '1px solid var(--out-ink-dim)',
                          color: 'var(--out-text)',
                        }}>
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full">
                      <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5"
                        style={{ color: 'var(--out-ink)', opacity: 0.7 }}>AGENT</div>
                      <div className="text-[12px] leading-relaxed"
                        style={{ color: 'var(--out-text)' }}>
                        <MarkdownMessage content={m.content} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Streaming cursor */}
          {isStreaming && (
            <div className="flex items-center gap-2 mt-3 px-1">
              <span className="text-[9px] font-mono uppercase tracking-widest"
                style={{ color: 'var(--out-ink)', opacity: 0.7 }}>AGENT</span>
              <span className="inline-block w-1.5 h-4 animate-pulse"
                style={{ background: 'var(--out-ink)' }} />
            </div>
          )}

          {renderWorkOrder(txPayload, signStep, isSigning, hash, explorerBase, handleLaunch,
            () => setTxPayload(null), activateStep, activateTxHash,
            activateUnsignedTx ? handleActivate : undefined, chain?.id, txErrorMsg)}
          {launchSuccess && (
            <LaunchSuccessPanel
              name={launchSuccess.name}
              ticker={launchSuccess.ticker}
              txHash={launchSuccess.hash}
              explorerBase={explorerBase}
              onDismiss={() => setLaunchSuccess(null)}
            />
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* ── CLI MODE ── */}
      {mode === 'cli' && (
        <div
          className="flex-1 overflow-y-auto mb-4 pr-1 cursor-text"
          style={{
            minHeight: 240,
            background: '#050905',
            padding: '12px 16px',
            border: '1px solid var(--out-ink-dim)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            lineHeight: '1.65',
          }}
          onClick={() => inputRef.current?.focus()}
        >
          {cliLines.map((ln, i) => (
            <div
              key={i}
              style={{
                color: CLR[ln.color],
                fontWeight: ln.bold ? 700 : 400,
                whiteSpace: 'pre',
              }}
            >
              {ln.text || '\u00A0'}
            </div>
          ))}

          {/* streaming cursor */}
          {isStreaming && (
            <div className="flex items-center gap-1" style={{ color: 'var(--out-ink)' }}>
              <span className="inline-block w-[7px] h-[13px] bg-[var(--out-ink)] animate-pulse" />
            </div>
          )}

          {/* work order appears inline in terminal */}
          {renderWorkOrder(txPayload, signStep, isSigning, hash, explorerBase, handleLaunch, () => {
            setTxPayload(null);
            setCliLines(prev => [...prev, L('  ✗ work order discarded', 'muted'), BL()]);
          }, activateStep, activateTxHash, activateUnsignedTx ? handleActivate : undefined, chain?.id, txErrorMsg)}
          {launchSuccess && (
            <LaunchSuccessPanel
              name={launchSuccess.name}
              ticker={launchSuccess.ticker}
              txHash={launchSuccess.hash}
              explorerBase={explorerBase}
              onDismiss={() => setLaunchSuccess(null)}
            />
          )}

          <div ref={cliEndRef} />
        </div>
      )}

      {/* ── Connect wallet gate — hard block when no wallet ── */}
      {!address ? (
        <div className="mt-auto shrink-0 border font-mono"
          style={{ borderColor: 'var(--out-ink-dim)', background: '#050905' }}>
          <div className="border-b flex items-center gap-2 px-4 py-2"
            style={{ borderColor: 'var(--out-ink-dim)' }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--out-warn)' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--out-warn)' }}>WALLET REQUIRED</span>
            <span className="text-[9px] uppercase tracking-wide ml-auto"
              style={{ color: 'var(--out-muted)' }}>AGENT ACCESS LOCKED</span>
          </div>
          <div className="px-4 py-4 flex flex-col gap-3">
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--out-text)' }}>
              Connect your wallet to access the <strong style={{ color: 'var(--out-ink)' }}>OUTRIVE deployment agent</strong>.
              Your wallet is your identity — no sign-up required.
            </p>
            <div className="flex items-start gap-3 text-[10px] font-mono" style={{ color: 'var(--out-muted)' }}>
              <div className="flex flex-col gap-1.5">
                <span><span style={{ color: 'var(--out-ink)' }}>01</span> · Connect wallet</span>
                <span><span style={{ color: 'var(--out-ink)' }}>02</span> · Describe your agent</span>
                <span><span style={{ color: 'var(--out-ink)' }}>03</span> · Sign &amp; launch on-chain</span>
              </div>
            </div>
            <p className="text-[9px]" style={{ color: 'var(--out-muted)' }}>
              Supported: MetaMask, Rabby, and any EIP-1193 wallet · Network: Robinhood Chain (4663)
            </p>
          </div>
        </div>

      ) : /* ── Credit paywall — shown when wallet connected but credits exhausted ── */
      address && credits && !credits.hasAccess ? (
        <div className="mt-auto shrink-0 border font-mono"
          style={{ borderColor: 'var(--out-warn)', background: '#0b0a05' }}>
          <div className="border-b flex items-center gap-2 px-4 py-2"
            style={{ borderColor: 'var(--out-warn)' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--out-warn)' }}>⊘ CREDIT REQUIRED</span>
            <span className="text-[9px] uppercase tracking-wide ml-auto"
              style={{ color: 'var(--out-muted)' }}>AI AGENT ACCESS LOCKED</span>
          </div>
          <div className="px-4 py-3 space-y-2">
            <p className="text-[11px]" style={{ color: 'var(--out-text)' }}>
              All <strong style={{ color: 'var(--out-ink)' }}>10 free AI chats</strong> have been used for this wallet.
              Buy <strong style={{ color: 'var(--out-ink)' }}>$OTR</strong> to unlock more.
            </p>
            <div className="flex items-center gap-2 py-1.5 border-l-2 pl-3 text-[10px]"
              style={{ borderColor: 'var(--out-ink)', color: 'var(--out-muted)' }}>
              <span>1 $OTR</span>
              <span style={{ color: 'var(--out-ink-dim)' }}>═</span>
              <span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>1 CHAT CREDIT</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('outrive:nav', { detail: 'outrive' }))}
                className="flex items-center gap-1.5 border px-3 py-1.5 text-[10px] uppercase tracking-widest cursor-pointer transition-colors"
                style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--out-ink)'; e.currentTarget.style.color = 'var(--out-bg)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--out-ink)'; }}
              >
                ◈ GET $OTR CREDITS →
              </button>
              <div className="flex items-center gap-1.5 border px-3 py-1.5 text-[10px] uppercase tracking-widest opacity-40 cursor-not-allowed select-none"
                style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}
                title="Available after $OTR TGE">
                ◉ DEPOSIT $OTR → SOON
              </div>
            </div>
            <p className="text-[9px]" style={{ color: 'var(--out-muted)' }}>
              On-chain credit top-up activates after the $OTR token generation event (TGE).
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Quick actions ── */}
          {!isStreaming && !txPayload && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {quickActions.map(a => (
                <button
                  key={a.label}
                  onClick={() => handleQuickAction(a.text)}
                  disabled={!address || isStreaming}
                  className="text-[10px] font-mono uppercase tracking-widest border px-2 py-0.5 transition-colors disabled:opacity-30"
                  style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = 'var(--out-ink)';
                    e.currentTarget.style.borderColor = 'var(--out-ink)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--out-muted)';
                    e.currentTarget.style.borderColor = 'var(--out-ink-dim)';
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Input row ── */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center mt-auto shrink-0 border"
            style={{ borderColor: 'var(--out-ink-dim)', background: '#050905' }}
          >
            <span
              className="font-mono text-sm px-3 select-none shrink-0"
              style={{ color: mode === 'cli' ? 'var(--out-ink)' : 'var(--out-muted)' }}
            >
              {mode === 'cli' ? '$_' : '@'}
            </span>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mode === 'cli'
                ? 'command or natural language — Tab to autocomplete'
                : 'Describe your agent token…'}
              className="flex-1 bg-transparent border-0 outline-none font-mono text-[12px] py-3"
              style={{ color: 'var(--out-text)' }}
              disabled={isStreaming || !address}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={isStreaming || !input.trim() || !address}
              className="px-4 py-3 font-mono text-[13px] shrink-0 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
              style={{ color: 'var(--out-ink)' }}
              title={mode === 'cli' ? 'Execute' : 'Send'}
            >
              ➤
            </button>
          </form>
        </>
      )}
    </Sheet>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   WORK ORDER CARD
═══════════════════════════════════════════════════════════════════════════ */
function renderWorkOrder(
  txPayload: TxPayload | null,
  signStep: SignStep,
  isSigning: boolean,
  hash: `0x${string}` | undefined,
  explorerBase: string,
  handleLaunch: () => void,
  handleDiscard: () => void,
  activateStep?: ActivateStep,
  activateTxHash?: `0x${string}`,
  handleActivate?: () => void,
  walletChainId?: number,
  txErrorMsg?: string | null,
) {
  if (!txPayload) return null;

  return (
    <div className="my-4 border border-[var(--out-ink)] bg-[#0A100A] p-4 font-mono text-xs w-full">
      {/* Header */}
      <div className="border-b border-[var(--out-ink)] pb-2 mb-4 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
        <span className="text-[var(--out-ink)] uppercase tracking-[0.12em] font-bold text-[10px] sm:text-[11px]">
          ▲ WORK ORDER — AGENT TOKEN LAUNCH
        </span>
        <span className="sm:ml-auto text-[var(--out-muted)] text-[9px] font-normal uppercase tracking-widest">
          VIRTUALS PROTOCOL / ROBINHOOD CHAIN
        </span>
      </div>

      {/* Fields */}
      <div className="space-y-1.5 mb-5">
        {([
          ['NAME',        txPayload.preview.name],
          ['TICKER',      `${txPayload.preview.ticker}`],
          ['DESCRIPTION', txPayload.preview.description || '—'],
          ['LAUNCH MODE', txPayload.preview.mode],
          ['ANTI-SNIPER', txPayload.preview.antiSniper || '60s (1 MIN) — buy tax 99%→1%'],
          ['NETWORK',     txPayload.preview.network],
          ['FACTORY',     txPayload.preview.targetContract.slice(0,10) + '…' + txPayload.preview.targetContract.slice(-6)],
          ['GAS (EST.)',  txPayload.preview.baseCost],
          ['CREATOR',    'YOUR WALLET  (you sign, you own)'],
        ] as [string, string][]).map(([label, val]) => (
          <div key={label} className="flex items-end gap-1">
            <span className="text-[var(--out-muted)] shrink-0 w-24 sm:w-36 text-[9px] sm:text-[10px]">{label}</span>
            <span className="flex-1 border-b border-dotted border-[var(--out-muted)] mb-[3px]" />
            <span className="text-[var(--out-text)] text-right text-[9px] sm:text-[10px] max-w-[140px] sm:max-w-[200px] truncate">{val}</span>
          </div>
        ))}
      </div>

      <div className="text-[var(--out-warn)] text-[10px] mb-4 uppercase tracking-wide">
        {'⚠ FIELDS ARE SUBMITTED ON-CHAIN AND IMMUTABLE AFTER SIGNING'}
      </div>

      {/* Chain warning — shown when wallet is NOT on Robinhood Chain */}
      {walletChainId !== undefined && walletChainId !== 4663 && walletChainId !== 46630 && signStep !== 'confirmed' && (
        <div className="mb-4 px-3 py-2 border text-[10px] font-mono uppercase tracking-wide flex items-center gap-2"
          style={{ borderColor: 'var(--out-warn)', color: 'var(--out-warn)', background: 'rgba(255,160,0,0.05)' }}>
          <span>⚠</span>
          <span>WALLET ON WRONG CHAIN (chainId {walletChainId}) — clicking SIGN will switch to Robinhood Chain (4663) first</span>
        </div>
      )}

      {/* Action buttons — state-driven */}
      {(signStep === 'pending' || isSigning) ? (
        <div className="flex items-center gap-3">
          <span className="text-[10px] border border-[var(--out-warn)] px-2 py-0.5 text-[var(--out-warn)] animate-pulse">PENDING</span>
          <span className="text-[var(--out-muted)] text-[10px]">AWAITING WALLET CONFIRMATION…</span>
        </div>
      ) : signStep === 'confirmed' ? (
        <div className="space-y-2">
          {/* Step 1 confirmed */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] border border-[var(--out-ink)] px-2 py-0.5 text-[var(--out-ink)]">✓ STEP 1/2 CONFIRMED</span>
            <span className="text-[var(--out-ink)] text-[10px] font-bold">TOKEN CREATED ON-CHAIN</span>
          </div>

          {/* Step 2: activate */}
          {activateStep === 'activating' ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] border border-[var(--out-warn)] px-2 py-0.5 text-[var(--out-warn)] animate-pulse">⟳ ACTIVATING</span>
              <span className="text-[10px]" style={{ color: 'var(--out-muted)' }}>STARTING BONDING CURVE TRADING…</span>
            </div>
          ) : activateStep === 'done' ? (
            <div className="flex items-center gap-3">
              <span className="text-[10px] border border-[var(--out-ink)] px-2 py-0.5 text-[var(--out-ink)]">✓ STEP 2/2 ACTIVE</span>
              <span className="text-[var(--out-ink)] text-[10px] font-bold">TRADING LIVE ON BONDING CURVE</span>
            </div>
          ) : activateStep === 'failed' && handleActivate ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] border border-[var(--out-warn)] px-2 py-0.5 text-[var(--out-warn)]">STEP 2 REQUIRED</span>
              <button onClick={handleActivate}
                className="border border-[var(--out-ink)] px-3 py-0.5 text-[var(--out-ink)] text-[10px] uppercase tracking-widest hover:bg-[var(--out-ink)] hover:text-black transition-colors">
                ACTIVATE TRADING →
              </button>
            </div>
          ) : activateStep === 'idle' ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] border border-[var(--out-warn)] px-2 py-0.5 text-[var(--out-warn)] animate-pulse">⟳ ACTIVATING</span>
              <span className="text-[10px]" style={{ color: 'var(--out-muted)' }}>STARTING BONDING CURVE TRADING…</span>
            </div>
          ) : null}

          {/* TX links */}
          <div className="flex flex-wrap gap-4 mt-1">
            {hash && (
              <a href={`${explorerBase}/tx/${hash}`} target="_blank" rel="noreferrer"
                className="text-[var(--out-ink-dim)] hover:text-[var(--out-ink)] underline decoration-dotted underline-offset-4 text-[10px]">
                VIEW CREATE TX ↗
              </a>
            )}
            {activateTxHash && (
              <a href={`${explorerBase}/tx/${activateTxHash}`} target="_blank" rel="noreferrer"
                className="text-[var(--out-ink-dim)] hover:text-[var(--out-ink)] underline decoration-dotted underline-offset-4 text-[10px]">
                VIEW ACTIVATE TX ↗
              </a>
            )}
            <a href="https://app.virtuals.io" target="_blank" rel="noreferrer"
              className="text-[var(--out-ink-dim)] hover:text-[var(--out-ink)] underline decoration-dotted underline-offset-4 text-[10px]">
              COMPLETE AGENT ON VIRTUALS ↗
            </a>
          </div>
          <div className="text-[var(--out-muted)] text-[10px] mt-1">
            {activateStep === 'done'
              ? 'Token live on bonding curve. Set up agent personality & runtime on app.virtuals.io.'
              : 'Token created on-chain. Activating bonding curve trading…'}
          </div>
        </div>
      ) : signStep === 'failed' ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <span className="text-[10px] border border-[var(--out-danger)] px-2 py-0.5 text-[var(--out-danger)]">✗ FAILED</span>
              <span className="text-[10px]" style={{ color: 'var(--out-danger)' }}>
                {txErrorMsg ? 'TX ERROR — see details below' : 'REJECTED OR REVERTED — check wallet & network'}
              </span>
            </div>
            {txErrorMsg && (
              <div className="px-2 py-1.5 text-[9px] font-mono leading-relaxed break-all"
                style={{ background: 'rgba(255,40,40,0.06)', border: '1px solid rgba(255,40,40,0.25)', color: 'var(--out-danger)', opacity: 0.85 }}>
                {txErrorMsg}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={handleLaunch}
              className="flex-1 border border-[var(--out-ink)] px-4 py-2 text-[var(--out-ink)] font-mono text-[11px] uppercase tracking-widest hover:bg-[var(--out-ink)] hover:text-black transition-colors">
              RETRY →
            </button>
            <button onClick={handleDiscard}
              className="border border-[var(--out-ink-dim)] px-4 py-2 text-[var(--out-muted)] font-mono text-[11px] uppercase hover:text-[var(--out-ink)] transition-colors">
              DISCARD
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <button onClick={handleLaunch}
            className="flex-1 border border-[var(--out-ink)] px-4 py-2 text-[var(--out-ink)] font-mono text-[11px] uppercase tracking-widest hover:bg-[var(--out-ink)] hover:text-black transition-colors">
            SIGN &amp; LAUNCH →
          </button>
          <button onClick={handleDiscard}
            className="border border-[var(--out-ink-dim)] px-4 py-2 text-[var(--out-muted)] font-mono text-[11px] uppercase hover:text-[var(--out-ink)] transition-colors">
            DISCARD
          </button>
        </div>
      )}
    </div>
  );
}
