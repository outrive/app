import React, { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useAccount,
  useBalance,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi';
import { parseAbi, encodeFunctionData, parseUnits, formatUnits } from 'viem';
import { Sheet } from '@/components/Sheet';

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════════════ */
interface VToken {
  id: number;
  name: string;
  ticker: string;
  address: string;
  creator: string;
  mcapInVirtual: number;
  fdvInVirtual: number;
  volume24h: number;
  priceChange24h: number;
  holderCount: number;
  liquidityUsd: number;
  status: 'BONDING' | 'GRADUATED';
  curveProgress: number;
  chain: string;
  createdAt: string;
  launchedAt: string;
  description: string;
  image: string | null;
  category: string;
  isVerified: boolean;
  mindshare: number | null;
}

interface VTokensResponse {
  tokens: VToken[];
  meta: { total: number; page: number; pageCount: number; pageSize: number };
  error?: string;
}

interface VSummary {
  totalTokens: number;
  graduatedTokens: number;
  bondingTokens: number;
}

/* ── Blockscout API types ── */
interface BSAddress {
  hash: string;
  name?: string | null;
  is_contract?: boolean;
}
interface BSHolder {
  address: BSAddress;
  value: string; // raw uint256 as decimal string
}
interface BSTransfer {
  timestamp: string;
  from: BSAddress;
  to: BSAddress;
  method: string | null;
  total: { value: string; decimals: string };
  transaction_hash: string;
}
interface BSHoldersResponse  { items: BSHolder[] }
interface BSTransfersResponse { items: BSTransfer[] }

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════════════════════════════════════ */
type SortKey   = 'mcapInVirtual:desc' | 'volume24h:desc' | 'createdAt:desc' | 'priceChangePercent24h:desc' | 'holderCount:desc' | 'mindshare:desc';
type ChainKey  = 'ROBINHOOD' | 'BASE' | 'ALL';
type StatusKey = '' | 'BONDING' | 'GRADUATED';
type TradeTab  = 'buy' | 'sell';

const BASE_URL = import.meta.env.BASE_URL ?? '/';
function apiUrl(path: string) {
  return BASE_URL.replace(/\/$/, '') + path;
}
const REFRESH_MS = 30_000;

/* ── Robinhood Chain DEX (UniswapV2Router02Robinhood) ── */
const ROUTER  = '0x07E9002B1549bE8E5A4f94AD0c9CA586Cf7078a6' as `0x${string}`;
const WETH    = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as `0x${string}`;
const EXPLORER = 'https://robinhoodchain.blockscout.com';

const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
]);

const ROUTER_ABI = parseAbi([
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
]);

/* ═══════════════════════════════════════════════════════════════════════════
   FORMATTERS
═══════════════════════════════════════════════════════════════════════════ */
function fmtVirtual(n: number): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
function fmtUsd(n: number): string {
  if (!n) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtPct(n: number): string {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   HOOKS
═══════════════════════════════════════════════════════════════════════════ */
function useVirtualPrice(): number {
  const { data } = useQuery<{ usd: number }>({
    queryKey: ['virtual-price'],
    queryFn: () => fetch(apiUrl('/api/virtuals/virtual-price')).then(r => r.json()),
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
  return data?.usd ?? 0;
}

function useVirtualsTokens(params: { sort: SortKey; chain: ChainKey; status: StatusKey; search: string; page: number }) {
  return useQuery<VTokensResponse>({
    queryKey: ['virtuals-tokens', params],
    queryFn: async () => {
      const p = new URLSearchParams({ sort: params.sort, chain: params.chain, page: String(params.page), pageSize: '50' });
      if (params.status) p.set('status', params.status);
      if (params.search) p.set('search', params.search);
      const res = await fetch(apiUrl(`/api/virtuals/tokens?${p}`));
      return res.json();
    },
    refetchInterval: REFRESH_MS,
    staleTime: 15_000,
  });
}
function useVirtualsSummary() {
  return useQuery<VSummary>({
    queryKey: ['virtuals-summary'],
    queryFn: () => fetch(apiUrl('/api/virtuals/summary')).then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   AVATAR
═══════════════════════════════════════════════════════════════════════════ */
function TokenAvatar({ token, size = 32 }: { token: VToken; size?: number }) {
  const [err, setErr] = useState(false);
  if (token.image && !err) {
    return (
      <img src={token.image} alt={token.ticker} onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: 4, objectFit: 'cover', border: '1px solid var(--out-grid-major)', flexShrink: 0 }} />
    );
  }
  const seed = token.ticker.charCodeAt(0) + token.ticker.charCodeAt(Math.max(0, token.ticker.length - 1));
  const hue  = (seed * 37) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: 4, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.28, fontWeight: 700,
      background: `hsl(${hue},55%,10%)`,
      border: `1px solid hsl(${hue},55%,28%)`,
      color: `hsl(${hue},70%,60%)`,
    }}>
      {token.ticker.slice(0, 2)}
    </div>
  );
}

function CurveBarInline({ pct, wide = false }: { pct: number; wide?: boolean }) {
  const clamped = Math.min(pct, 100);
  const color   = clamped >= 100 ? 'var(--out-ink)' : `hsl(${80 + clamped * 0.4}, 70%, 45%)`;
  return (
    <div className="flex items-center gap-1.5">
      <div style={{ width: wide ? 80 : 56, height: 6, background: 'var(--out-bg)', border: '1px solid var(--out-muted)', overflow: 'hidden', borderRadius: 2 }}>
        <div style={{ width: `${clamped}%`, height: '100%', background: color, transition: 'width .4s', borderRadius: 2 }} />
      </div>
      <span className="text-[9px]" style={{ color: 'var(--out-muted)', minWidth: 30, textAlign: 'right' }}>{Math.round(clamped)}%</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GECKO TERMINAL CHART EMBED
═══════════════════════════════════════════════════════════════════════════ */
const GECKO_NETWORK = 'robinhood';

/* ═══════════════════════════════════════════════════════════════════════════
   TOKEN DETAIL — FULL SCREEN
═══════════════════════════════════════════════════════════════════════════ */
function TokenDetailPage({ token, onBack }: { token: VToken; onBack: () => void }) {
  const { address } = useAccount();
  const tokenAddr = token.address as `0x${string}`;

  const vp = useVirtualPrice();
  const [tab, setTab]               = useState<TradeTab>('buy');
  const [amount, setAmount]         = useState('');
  const [slippage, setSlippage]     = useState<0.5 | 1 | 2 | 'custom'>(1);
  const [customSlip, setCustomSlip] = useState('');
  const [txStep, setTxStep]         = useState<'idle'|'approving'|'trading'|'pending'|'done'|'error'>('idle');
  const [txError, setTxError]       = useState('');
  const [copied, setCopied]         = useState(false);
  const [infoTab, setInfoTab]       = useState<'trades' | 'holders'>('trades');

  const effectiveSlip = slippage === 'custom'
    ? Math.max(0.01, Math.min(50, parseFloat(customSlip) || 1))
    : slippage;

  /* ── Wagmi hooks ── */
  const { sendTransaction, data: txHash, isPending: isSigning } = useSendTransaction();
  const { isSuccess: txConfirmed, isError: txFailed } = useWaitForTransactionReceipt({ hash: txHash });

  /* ── Balances ── */
  const { data: ethBal } = useBalance({
    address: address ?? undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const { data: tokenBal } = useBalance({
    address: address ?? undefined,
    token: tokenAddr || undefined,
    query: { enabled: !!address && !!tokenAddr, refetchInterval: 15_000 },
  } as any);

  const amountNum = parseFloat(amount) || 0;
  const amountWei = amountNum > 0 ? parseUnits(amount || '0', 18) : 0n;

  /* ── Live price probe: 1 ETH → ? tokens ── */
  const buyPath  = [WETH, tokenAddr] as readonly [`0x${string}`, `0x${string}`];
  const sellPath = [tokenAddr, WETH] as readonly [`0x${string}`, `0x${string}`];
  const activePath = tab === 'buy' ? buyPath : sellPath;

  const ONE_ETH = parseUnits('1', 18);
  const { data: priceProbe, isError: noLiquidity } = useReadContract({
    address: ROUTER, abi: ROUTER_ABI, functionName: 'getAmountsOut',
    args: [ONE_ETH, buyPath],
    query: { enabled: !!tokenAddr, refetchInterval: 10_000 },
  } as any);

  /* ── Trade quote (user's actual amount) ── */
  const { data: amountsOut } = useReadContract({
    address: ROUTER, abi: ROUTER_ABI, functionName: 'getAmountsOut',
    args: amountNum > 0 ? [amountWei, activePath] : [1n, activePath],
    query: { enabled: !!tokenAddr && amountNum > 0, refetchInterval: 5_000 },
  } as any);

  const estimatedOut = amountsOut && Array.isArray(amountsOut) && amountsOut.length > 0
    ? amountsOut[amountsOut.length - 1] as bigint : null;

  /* ── Current token price in ETH ── */
  const priceInEth = (() => {
    if (!priceProbe || !Array.isArray(priceProbe) || (priceProbe as bigint[]).length < 2) return null;
    const tokensOut = (priceProbe as bigint[])[1];
    if (!tokensOut || tokensOut === 0n) return null;
    // 1 ETH = tokensOut tokens → price = 1/tokensOut ETH per token
    return 1 / parseFloat(formatUnits(tokensOut, 18));
  })();

  /* ── Allowance ── */
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddr || undefined, abi: ERC20_ABI, functionName: 'allowance',
    args: address ? [address, ROUTER] : undefined,
    query: { enabled: !!address && tab === 'sell' && !!tokenAddr, refetchInterval: 10_000 },
  } as any);

  const hasAllowance = tab === 'buy' || (
    allowance !== undefined && typeof allowance === 'bigint' && (allowance as bigint) >= amountWei
  );

  useEffect(() => {
    if (txConfirmed && txStep === 'pending') { setTxStep('done'); refetchAllowance(); }
    if (txFailed   && txStep === 'pending') { setTxStep('error'); setTxError('Transaction reverted or rejected.'); }
  }, [txConfirmed, txFailed]);

  const setMax = () => {
    if (tab === 'buy' && ethBal) {
      const reserve = parseUnits('0.001', 18);
      const val = ethBal.value > reserve ? ethBal.value - reserve : 0n;
      setAmount(formatUnits(val, 18));
    } else if (tab === 'sell' && tokenBal) {
      setAmount(formatUnits(tokenBal.value, tokenBal.decimals));
    }
  };

  const handleApprove = () => {
    if (!address) return;
    setTxStep('approving'); setTxError('');
    const MAX = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [ROUTER, MAX] });
    sendTransaction({ to: tokenAddr, data }, {
      onError: e => { setTxStep('error'); setTxError(e.message.slice(0, 160)); },
      onSuccess: () => setTxStep('pending'),
    });
  };

  const handleTrade = () => {
    if (!address || amountNum <= 0) return;
    setTxStep('trading'); setTxError('');
    const deadline   = BigInt(Math.floor(Date.now() / 1000) + 1200);
    const slipFactor = 1 - effectiveSlip / 100;
    const minOut     = estimatedOut ? BigInt(Math.floor(Number(estimatedOut) * slipFactor)) : 0n;
    if (tab === 'buy') {
      const data = encodeFunctionData({ abi: ROUTER_ABI,
        functionName: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
        args: [minOut, [WETH, tokenAddr], address, deadline] });
      sendTransaction({ to: ROUTER, value: amountWei, data }, {
        onError: e => { setTxStep('error'); setTxError(e.message.slice(0, 160)); },
        onSuccess: () => setTxStep('pending'),
      });
    } else {
      const data = encodeFunctionData({ abi: ROUTER_ABI, functionName: 'swapExactTokensForETH',
        args: [amountWei, minOut, [tokenAddr, WETH], address, deadline] });
      sendTransaction({ to: ROUTER, data }, {
        onError: e => { setTxStep('error'); setTxError(e.message.slice(0, 160)); },
        onSuccess: () => setTxStep('pending'),
      });
    }
  };

  /* ── Display strings ── */
  const ethBalStr   = ethBal   ? `${parseFloat(formatUnits(ethBal.value, 18)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH` : address ? '—' : 'NOT CONNECTED';
  const tokenBalStr = tokenBal ? `${parseFloat(formatUnits(tokenBal.value, tokenBal.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${token.ticker}` : address ? '—' : 'NOT CONNECTED';
  const spendBal    = tab === 'buy' ? ethBalStr : tokenBalStr;
  const spendLabel  = tab === 'buy' ? 'ETH' : token.ticker;
  const receiveLabel = tab === 'buy' ? token.ticker : 'ETH';

  const estimatedOutStr = (() => {
    if (!tokenAddr) return '—';
    if (noLiquidity) return '⚠ NO LIQUIDITY ON DEX';
    if (!estimatedOut || !amountNum) return '—';
    return `≈ ${parseFloat(formatUnits(estimatedOut, 18)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${receiveLabel}`;
  })();

  /* ── Blockscout: holders + transfers ── */
  const { data: holdersData, isLoading: holdersLoading } = useQuery<BSHoldersResponse>({
    queryKey: ['bs-holders', tokenAddr],
    queryFn: () => fetch(apiUrl(`/api/virtuals/tokens/${tokenAddr}/holders`)).then(r => r.json()),
    enabled: !!tokenAddr,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const { data: transfersData, isLoading: transfersLoading, refetch: refetchTransfers } = useQuery<BSTransfersResponse>({
    queryKey: ['bs-transfers', tokenAddr],
    queryFn: () => fetch(apiUrl(`/api/virtuals/tokens/${tokenAddr}/transfers`)).then(r => r.json()),
    enabled: !!tokenAddr,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
  const holders   = holdersData?.items   ?? [];
  const transfers = transfersData?.items ?? [];

  /* ── Blockscout helpers ── */
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
  const fmtAddr = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
  const fmtRaw  = (val: string, dec = '18') => {
    try {
      const n = parseFloat(formatUnits(BigInt(val), parseInt(dec)));
      if (n >= 1e9) return `${(n/1e9).toFixed(2)}B`;
      if (n >= 1e6) return `${(n/1e6).toFixed(2)}M`;
      if (n >= 1e3) return `${(n/1e3).toFixed(2)}K`;
      return n.toFixed(2);
    } catch { return '—'; }
  };
  const txKind = (from: string, to: string, method: string | null) => {
    if (from.toLowerCase() === ZERO_ADDR) return 'MINT';
    if (to.toLowerCase()   === ZERO_ADDR) return 'BURN';
    const m = (method ?? '').toLowerCase();
    if (m.includes('swap') || m.includes('buy') || m.includes('sell') || m.includes('trade')) return 'SWAP';
    return 'XFER';
  };
  // % of total among displayed holders
  const holderTotal = holders.reduce((s, h) => { try { return s + BigInt(h.value); } catch { return s; } }, 0n);
  const holderPct = (val: string) => {
    try {
      if (holderTotal === 0n) return '—';
      return (Number(BigInt(val) * 10000n / holderTotal) / 100).toFixed(1) + '%';
    } catch { return '—'; }
  };

  const copyCA = () => {
    if (!token.address) return;
    navigator.clipboard.writeText(token.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onBack]);

  const posChg = token.priceChange24h >= 0;

  // GeckoTerminal chart embed URL — auto-discovers the pool for this token on Robinhood chain
  const geckoUrl = token.address
    ? `https://www.geckoterminal.com/${GECKO_NETWORK}/tokens/${token.address}?embed=1&info=0&swaps=0&grayscale=0&light_chart=0`
    : null;

  return (
    <div className="flex flex-col font-mono" style={{ minHeight: 'calc(100vh - 48px)', background: 'var(--out-bg)' }}>

      {/* ══ STICKY HEADER BAR ══════════════════════════════════════════════ */}
      <div className="sticky top-0 z-10 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: 'var(--out-ink-dim)', background: 'var(--out-bg-sheet)' }}>

        {/* Back */}
        <button onClick={onBack}
          className="flex items-center gap-1.5 border px-2.5 py-1.5 text-[9px] uppercase tracking-widest shrink-0 transition-colors"
          style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--out-ink)'; e.currentTarget.style.borderColor = 'var(--out-ink)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--out-muted)'; e.currentTarget.style.borderColor = 'var(--out-ink-dim)'; }}>
          ← MARKET
        </button>

        <div className="w-px h-5 shrink-0" style={{ background: 'var(--out-ink-dim)' }} />

        {/* Token identity */}
        <TokenAvatar token={token} size={30} />
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-bold shrink-0" style={{ color: 'var(--out-ink)' }}>${token.ticker}</span>
          <span className="text-[10px] hidden sm:inline truncate" style={{ color: 'var(--out-muted)' }}>{token.name}</span>
          {token.isVerified && <span className="text-[8px] border px-1 py-0.5 shrink-0" style={{ borderColor: '#39d353', color: '#39d353' }}>✓</span>}
          <span className="text-[8px] border px-1.5 py-0.5 uppercase shrink-0"
            style={token.status === 'GRADUATED'
              ? { borderColor: 'var(--out-ink)', color: 'var(--out-ink)', background: '#12180f' }
              : { borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
            {token.status === 'GRADUATED' ? '✓ GRAD' : '◉ BONDING'}
          </span>
          {priceInEth && !noLiquidity && (
            <span className="text-[8px] border px-1.5 py-0.5 shrink-0" style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-ink)' }}>
              {priceInEth < 0.000001 ? priceInEth.toExponential(3) : priceInEth.toFixed(8)} ETH
            </span>
          )}
        </div>

        {/* CA + links — right side */}
        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          {token.address && <>
            <span className="text-[8px]" style={{ color: 'var(--out-muted)' }}>CA</span>
            <span className="text-[8px] font-mono" style={{ color: 'var(--out-ink)' }}>
              {token.address.slice(0, 6)}…{token.address.slice(-4)}
            </span>
            <button onClick={copyCA}
              className="text-[8px] border px-2 py-1 uppercase tracking-widest transition-colors"
              style={{ borderColor: copied ? 'var(--out-ink)' : 'var(--out-ink-dim)', color: copied ? 'var(--out-ink)' : 'var(--out-muted)' }}>
              {copied ? '✓' : 'COPY'}
            </button>
          </>}
          <a href={`${EXPLORER}/token/${token.address}`} target="_blank" rel="noreferrer"
            className="text-[8px] border px-2 py-1 uppercase tracking-widest transition-colors"
            style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--out-ink)'; e.currentTarget.style.borderColor = 'var(--out-ink)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--out-muted)'; e.currentTarget.style.borderColor = 'var(--out-ink-dim)'; }}>
            SCAN ↗
          </a>
          <a href={`https://app.virtuals.io/prototypes/${token.id}`} target="_blank" rel="noreferrer"
            className="text-[8px] border px-2 py-1 uppercase tracking-widest transition-colors"
            style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--out-ink)'; e.currentTarget.style.borderColor = 'var(--out-ink)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--out-muted)'; e.currentTarget.style.borderColor = 'var(--out-ink-dim)'; }}>
            VIRTUALS ↗
          </a>
        </div>
      </div>

      {/* ══ STATS STRIP ════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 sm:grid-cols-6 border-b shrink-0" style={{ borderColor: 'var(--out-grid-major)' }}>
        {([
          { label: 'MCAP',      val: vp > 0 ? fmtUsd(token.mcapInVirtual * vp) : `${fmtVirtual(token.mcapInVirtual)} VRTL` },
          { label: 'VOL 24H',   val: token.volume24h > 0 ? (vp > 0 ? fmtUsd(token.volume24h * vp) : `${fmtVirtual(token.volume24h)} VRTL`) : '—' },
          { label: '24H %',     val: fmtPct(token.priceChange24h), color: token.priceChange24h === 0 ? undefined : posChg ? '#39d353' : '#f87171' },
          { label: 'LIQUIDITY', val: fmtUsd(token.liquidityUsd) },
          { label: 'HOLDERS',   val: token.holderCount ? token.holderCount.toLocaleString() : '—' },
          { label: 'AGE',       val: ago(token.launchedAt) },
        ] as { label: string; val: string; color?: string }[]).map(({ label, val, color }, i) => (
          <div key={i} className="px-3 py-2.5 border-r last:border-r-0" style={{ borderColor: 'var(--out-grid-major)' }}>
            <div className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--out-muted)' }}>{label}</div>
            <div className="text-[12px] font-bold" style={{ color: color ?? 'var(--out-text)' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* ══ BODY — two columns ═════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0" style={{ minHeight: 'calc(100vh - 160px)' }}>

        {/* ── LEFT: chart + trades/holders tabs ── */}
        <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r overflow-hidden" style={{ borderColor: 'var(--out-ink-dim)' }}>

          {/* Chart iframe — responsive height */}
          <div className="shrink-0 relative border-b" style={{ height: 'clamp(280px, 52vh, 600px)', borderColor: 'var(--out-grid-major)' }}>
            {geckoUrl ? (
              <iframe
                src={geckoUrl}
                title={`${token.ticker} chart`}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: '#050905' }}
                allow="clipboard-write"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center flex-col gap-2">
                <span className="text-[32px] opacity-10" style={{ color: 'var(--out-ink)' }}>▦</span>
                <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>NO CONTRACT ADDRESS</span>
              </div>
            )}
          </div>

          {/* CA strip */}
          {token.address && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0" style={{ borderColor: 'var(--out-grid-major)', background: '#050905' }}>
              <span className="text-[8px] uppercase tracking-widest shrink-0" style={{ color: 'var(--out-muted)' }}>CA</span>
              <span className="flex-1 text-[11px] truncate font-mono" style={{ color: 'var(--out-ink)' }}>{token.address}</span>
              <button onClick={copyCA}
                className="text-[8px] border px-2 py-1 uppercase tracking-widest shrink-0 transition-colors"
                style={{ borderColor: copied ? 'var(--out-ink)' : 'var(--out-ink-dim)', color: copied ? 'var(--out-ink)' : 'var(--out-muted)' }}>
                {copied ? '✓' : 'COPY'}
              </button>
              <a href={`${EXPLORER}/token/${token.address}`} target="_blank" rel="noreferrer"
                className="text-[8px] border px-2 py-1 uppercase tracking-widest shrink-0 transition-colors"
                style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>↗</a>
            </div>
          )}

          {/* Curve strip */}
          <div className="flex items-center gap-3 px-3 py-1.5 border-b shrink-0" style={{ borderColor: 'var(--out-grid-major)' }}>
            <span className="text-[8px] uppercase tracking-widest shrink-0" style={{ color: 'var(--out-muted)' }}>CURVE</span>
            <CurveBarInline pct={token.curveProgress} wide />
            <span className="text-[8px] shrink-0" style={{ color: 'var(--out-muted)' }}>→ GRAD</span>
          </div>

          {/* ── Tab bar ── */}
          <div className="flex border-b shrink-0 font-mono" style={{ borderColor: 'var(--out-ink-dim)' }}>
            {(['trades', 'holders'] as const).map(t => (
              <button key={t} onClick={() => setInfoTab(t)}
                className="flex-1 py-2 text-[9px] uppercase tracking-widest transition-colors border-r last:border-r-0"
                style={{
                  borderRightColor: 'var(--out-ink-dim)',
                  borderBottom: infoTab === t ? '2px solid var(--out-ink)' : '2px solid transparent',
                  color: infoTab === t ? 'var(--out-ink)' : 'var(--out-muted)',
                  background: infoTab === t ? '#0E130E' : 'transparent',
                  marginBottom: -1,
                }}>
                {t === 'trades' ? '⇄ TRADES' : '◎ HOLDERS'}
              </button>
            ))}
            {infoTab === 'trades' && (
              <button onClick={() => refetchTransfers()}
                className="px-3 py-2 text-[9px] border-l transition-colors"
                style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}
                title="Refresh trades">↻</button>
            )}
          </div>

          {/* ── Tab content ── */}
          <div className="flex-1 overflow-y-auto font-mono">

            {/* TRADES */}
            {infoTab === 'trades' && (
              transfersLoading ? (
                <div className="flex items-center justify-center py-10 text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
                  ◌ LOADING TRADES…
                </div>
              ) : transfers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>NO TRANSFERS FOUND</span>
                  <a href={`${EXPLORER}/token/${token.address}/token-transfers`} target="_blank" rel="noreferrer"
                    className="text-[8px] underline decoration-dotted" style={{ color: 'var(--out-ink)' }}>VIEW ON BLOCKSCOUT ↗</a>
                </div>
              ) : (
                <table className="w-full text-[9px] border-collapse">
                  <thead className="sticky top-0" style={{ background: '#080d08' }}>
                    <tr style={{ borderBottom: '1px solid var(--out-grid-major)' }}>
                      <th className="px-3 py-1.5 text-left font-normal uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>TYPE</th>
                      <th className="px-2 py-1.5 text-left font-normal uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>FROM</th>
                      <th className="px-2 py-1.5 text-left font-normal uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>TO</th>
                      <th className="px-2 py-1.5 text-right font-normal uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>AMOUNT</th>
                      <th className="px-3 py-1.5 text-right font-normal uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>AGE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((tx, i) => {
                      const kind = txKind(tx.from.hash, tx.to.hash, tx.method);
                      const kindColor = kind === 'MINT' ? '#39d353' : kind === 'BURN' ? '#f87171' : kind === 'SWAP' ? 'var(--out-ink)' : 'var(--out-text)';
                      return (
                        <tr key={i} className="border-b transition-colors"
                          style={{ borderColor: 'var(--out-grid-major)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#0E1A0E')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td className="px-3 py-1.5">
                            <span className="border px-1.5 py-0.5 text-[8px] uppercase tracking-widest"
                              style={{ borderColor: kindColor, color: kindColor }}>{kind}</span>
                          </td>
                          <td className="px-2 py-1.5">
                            <a href={`${EXPLORER}/address/${tx.from.hash}`} target="_blank" rel="noreferrer"
                              className="hover:underline" style={{ color: tx.from.is_contract ? 'var(--out-ink-dim)' : 'var(--out-text)' }}>
                              {tx.from.name ? tx.from.name.slice(0, 12) : fmtAddr(tx.from.hash)}
                            </a>
                          </td>
                          <td className="px-2 py-1.5">
                            <a href={`${EXPLORER}/address/${tx.to.hash}`} target="_blank" rel="noreferrer"
                              className="hover:underline" style={{ color: tx.to.is_contract ? 'var(--out-ink-dim)' : 'var(--out-text)' }}>
                              {tx.to.name ? tx.to.name.slice(0, 12) : fmtAddr(tx.to.hash)}
                            </a>
                          </td>
                          <td className="px-2 py-1.5 text-right" style={{ color: 'var(--out-text)' }}>
                            {fmtRaw(tx.total.value, tx.total.decimals)} <span style={{ color: 'var(--out-muted)' }}>{token.ticker}</span>
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <a href={`${EXPLORER}/tx/${tx.transaction_hash}`} target="_blank" rel="noreferrer"
                              className="hover:text-[var(--out-ink)] transition-colors" style={{ color: 'var(--out-muted)' }}>
                              {ago(tx.timestamp)} ↗
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}

            {/* HOLDERS */}
            {infoTab === 'holders' && (
              holdersLoading ? (
                <div className="flex items-center justify-center py-10 text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
                  ◌ LOADING HOLDERS…
                </div>
              ) : holders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>NO HOLDER DATA</span>
                  <a href={`${EXPLORER}/token/${token.address}/token-holders`} target="_blank" rel="noreferrer"
                    className="text-[8px] underline decoration-dotted" style={{ color: 'var(--out-ink)' }}>VIEW ON BLOCKSCOUT ↗</a>
                </div>
              ) : (
                <>
                  <div className="px-3 py-1.5 border-b text-[8px] uppercase tracking-widest" style={{ borderColor: 'var(--out-grid-major)', color: 'var(--out-muted)' }}>
                    TOP {holders.length} HOLDERS · % OF DISPLAYED
                  </div>
                  <table className="w-full text-[9px] border-collapse">
                    <thead className="sticky top-0" style={{ background: '#080d08' }}>
                      <tr style={{ borderBottom: '1px solid var(--out-grid-major)' }}>
                        <th className="px-3 py-1.5 text-left font-normal uppercase tracking-widest w-8" style={{ color: 'var(--out-muted)' }}>#</th>
                        <th className="px-2 py-1.5 text-left font-normal uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>ADDRESS</th>
                        <th className="px-2 py-1.5 text-right font-normal uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>BALANCE</th>
                        <th className="px-3 py-1.5 text-right font-normal uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>SHARE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holders.map((h, i) => {
                        const pct = holderPct(h.value);
                        const pctNum = parseFloat(pct) || 0;
                        const barW = Math.min(100, pctNum);
                        return (
                          <tr key={i} className="border-b transition-colors group"
                            style={{ borderColor: 'var(--out-grid-major)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#0E1A0E')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <td className="px-3 py-1.5 text-[9px]" style={{ color: 'var(--out-muted)' }}>{i + 1}</td>
                            <td className="px-2 py-1.5">
                              <a href={`${EXPLORER}/address/${h.address.hash}`} target="_blank" rel="noreferrer"
                                className="hover:underline"
                                style={{ color: h.address.is_contract ? 'var(--out-ink-dim)' : 'var(--out-text)' }}>
                                {h.address.name ? h.address.name.slice(0, 18) : fmtAddr(h.address.hash)}
                              </a>
                              {h.address.is_contract && (
                                <span className="ml-1.5 text-[7px] border px-1" style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>CONTRACT</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right font-bold" style={{ color: 'var(--out-text)' }}>
                              {fmtRaw(h.value)} <span className="font-normal text-[8px]" style={{ color: 'var(--out-muted)' }}>{token.ticker}</span>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <div className="w-12 h-1 rounded-none overflow-hidden" style={{ background: 'var(--out-grid-major)' }}>
                                  <div style={{ width: `${barW}%`, height: '100%', background: 'var(--out-ink)' }} />
                                </div>
                                <span style={{ color: 'var(--out-ink)', minWidth: 36, textAlign: 'right' }}>{pct}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )
            )}

          </div>

          {/* Description footer */}
          {token.description && (
            <div className="px-3 py-2 border-t shrink-0" style={{ borderColor: 'var(--out-grid-major)' }}>
              <p className="text-[9px] leading-relaxed line-clamp-2" style={{ color: 'var(--out-muted)' }}>
                {token.description}
              </p>
            </div>
          )}
        </div>

        {/* ── RIGHT: trade panel ── */}
        <div className="w-full md:w-[300px] shrink-0 flex flex-col" style={{ background: 'var(--out-bg-sheet)' }}>

          {/* Buy / Sell tabs */}
          <div className="flex border-b shrink-0" style={{ borderColor: 'var(--out-ink-dim)' }}>
            {(['buy', 'sell'] as TradeTab[]).map(t => (
              <button key={t} onClick={() => { setTab(t); setAmount(''); setTxStep('idle'); setTxError(''); }}
                className="flex-1 py-3 text-[11px] uppercase tracking-widest font-bold border-r last:border-r-0 transition-colors"
                style={{
                  borderRightColor: 'var(--out-ink-dim)',
                  borderBottom: tab === t ? '2px solid var(--out-ink)' : '2px solid transparent',
                  color: tab === t ? 'var(--out-ink)' : 'var(--out-muted)',
                  background: tab === t ? '#0E130E' : 'transparent',
                  marginBottom: -1,
                }}>
                {t === 'buy' ? '▲ BUY' : '▼ SELL'}
              </button>
            ))}
          </div>

          <div className="px-4 py-4 flex flex-col gap-3 overflow-y-auto flex-1">

            {!address && (
              <div className="border px-3 py-2 text-[10px]" style={{ borderColor: 'var(--out-warn)', color: 'var(--out-warn)' }}>
                ⚠ Connect wallet to trade
              </div>
            )}

            {/* Amount input */}
            <div>
              <div className="flex justify-between text-[9px] mb-1.5" style={{ color: 'var(--out-muted)' }}>
                <span>YOU PAY ({spendLabel})</span>
                <span>BAL: {spendBal}</span>
              </div>
              <div className="flex items-center border" style={{ borderColor: 'var(--out-ink-dim)', background: '#050905' }}>
                <input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0.00" className="flex-1 bg-transparent px-3 py-2.5 text-[14px] outline-none"
                  style={{ color: 'var(--out-text)', fontFamily: 'JetBrains Mono, monospace' }}
                  disabled={!address || txStep === 'pending' || txStep === 'done'} />
                <span className="px-2 text-[9px] shrink-0" style={{ color: 'var(--out-muted)' }}>{spendLabel}</span>
                <button onClick={setMax} disabled={!address}
                  className="border-l px-2 py-2.5 text-[9px] uppercase tracking-widest transition-colors disabled:opacity-40"
                  style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--out-ink)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--out-muted)'; }}>
                  MAX
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2 text-[9px]" style={{ color: 'var(--out-muted)' }}>
              <div className="flex-1 border-t border-dotted" style={{ borderColor: 'var(--out-grid-major)' }} />
              <span>▼</span>
              <div className="flex-1 border-t border-dotted" style={{ borderColor: 'var(--out-grid-major)' }} />
            </div>

            {/* Receive */}
            <div>
              <div className="flex justify-between text-[9px] mb-1.5" style={{ color: 'var(--out-muted)' }}>
                <span>YOU RECEIVE ({receiveLabel})</span>
                <span>BAL: {tab === 'buy' ? tokenBalStr : ethBalStr}</span>
              </div>
              <div className="border px-3 py-2.5 text-[12px] font-bold"
                style={{ borderColor: 'var(--out-ink-dim)', background: '#050905',
                  color: noLiquidity ? 'var(--out-warn)' : 'var(--out-text)' }}>
                {estimatedOutStr}
              </div>
            </div>

            {/* Slippage */}
            <div>
              <div className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--out-muted)' }}>SLIPPAGE</div>
              <div className="flex gap-1 flex-wrap">
                {([0.5, 1, 2] as const).map(s => (
                  <button key={s} onClick={() => setSlippage(s)}
                    className="border px-2.5 py-1 text-[9px] transition-colors"
                    style={{
                      borderColor: slippage === s ? 'var(--out-ink)' : 'var(--out-ink-dim)',
                      color: slippage === s ? 'var(--out-ink)' : 'var(--out-muted)',
                      background: slippage === s ? '#12180f' : 'transparent',
                    }}>{s}%</button>
                ))}
                <button onClick={() => setSlippage('custom')}
                  className="border px-2.5 py-1 text-[9px] transition-colors"
                  style={{
                    borderColor: slippage === 'custom' ? 'var(--out-ink)' : 'var(--out-ink-dim)',
                    color: slippage === 'custom' ? 'var(--out-ink)' : 'var(--out-muted)',
                    background: slippage === 'custom' ? '#12180f' : 'transparent',
                  }}>CUSTOM</button>
                {slippage === 'custom' && (
                  <div className="flex items-center border" style={{ borderColor: 'var(--out-ink-dim)' }}>
                    <input type="number" min="0.01" max="50" value={customSlip} onChange={e => setCustomSlip(e.target.value)}
                      placeholder="1" className="bg-transparent px-2 py-1 text-[9px] w-12 outline-none"
                      style={{ color: 'var(--out-text)', fontFamily: 'JetBrains Mono, monospace' }} />
                    <span className="text-[9px] pr-1" style={{ color: 'var(--out-muted)' }}>%</span>
                  </div>
                )}
              </div>
            </div>

            {/* TX status */}
            {txStep !== 'idle' && (
              <div className="border px-3 py-2 text-[10px] leading-relaxed" style={{
                borderColor: txStep === 'done' ? 'var(--out-ink)' : txStep === 'error' ? '#f87171' : 'var(--out-warn)',
                color:       txStep === 'done' ? 'var(--out-ink)' : txStep === 'error' ? '#f87171' : 'var(--out-warn)',
              }}>
                {txStep === 'approving' && '● SIGNING APPROVAL — check wallet…'}
                {txStep === 'trading'   && '● SIGNING TRADE — check wallet…'}
                {txStep === 'pending'   && '◉ TX SUBMITTED — awaiting confirmation…'}
                {txStep === 'done'      && `✓ CONFIRMED${txHash ? ' · ' + txHash.slice(0, 10) + '…' : ''}`}
                {txStep === 'error'     && `✗ ${txError}`}
              </div>
            )}

            {/* CTA */}
            {!address ? (
              <div className="border py-3 text-center text-[10px] uppercase tracking-widest"
                style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
                CONNECT WALLET TO TRADE
              </div>
            ) : txStep === 'done' ? (
              <div className="flex gap-2">
                <button onClick={() => { setTxStep('idle'); setAmount(''); }}
                  className="flex-1 border py-2.5 text-[10px] uppercase tracking-widest font-bold transition-colors"
                  style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--out-ink)'; e.currentTarget.style.color = '#050905'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--out-ink)'; }}>
                  TRADE AGAIN
                </button>
                {txHash && (
                  <a href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer"
                    className="border px-3 py-2.5 text-[10px] uppercase tracking-widest transition-colors"
                    style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--out-ink)'; e.currentTarget.style.borderColor = 'var(--out-ink)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--out-muted)'; e.currentTarget.style.borderColor = 'var(--out-ink-dim)'; }}>
                    TX ↗
                  </a>
                )}
              </div>
            ) : !hasAllowance && amountNum > 0 ? (
              <button onClick={handleApprove}
                disabled={txStep === 'approving' || txStep === 'pending' || isSigning}
                className="border py-3 text-[11px] uppercase tracking-widest font-bold transition-colors disabled:opacity-40"
                style={{ borderColor: 'var(--out-warn)', color: 'var(--out-warn)' }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.background = 'var(--out-warn)'; e.currentTarget.style.color = '#050905'; } }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--out-warn)'; }}>
                {txStep === 'approving' || txStep === 'pending' ? '● APPROVING…' : `APPROVE ${token.ticker}`}
              </button>
            ) : (
              <button onClick={handleTrade}
                disabled={!amountNum || noLiquidity || txStep === 'trading' || txStep === 'pending' || isSigning}
                className="border py-3 text-[11px] uppercase tracking-widest font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.background = 'var(--out-ink)'; e.currentTarget.style.color = '#050905'; } }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--out-ink)'; }}>
                {txStep === 'trading' || txStep === 'pending' || isSigning ? '● TRADING…'
                  : noLiquidity ? 'NO LIQUIDITY'
                  : !amountNum  ? 'ENTER AMOUNT'
                  : tab === 'buy' ? `▲ BUY ${token.ticker}`
                  : `▼ SELL ${token.ticker}`}
              </button>
            )}

            {/* Disclaimer */}
            <p className="text-[8px] leading-relaxed pt-2 mt-auto border-t" style={{ color: 'var(--out-muted)', borderColor: 'var(--out-grid-major)' }}>
              ⬡ Non-custodial. OUTRIVE never holds funds.<br/>
              UniswapV2Router02 · {effectiveSlip}% slippage<br/>
              {tab === 'buy' ? `ETH → ${token.ticker}` : `${token.ticker} → ETH`} via WETH pair.<br/>
              Chart: GeckoTerminal · {GECKO_NETWORK}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SKELETON
═══════════════════════════════════════════════════════════════════════════ */
function Skeleton() {
  return (
    <div className="flex flex-col gap-0">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5 px-2 border-b" style={{ borderColor: 'var(--out-grid-major)' }}>
          <div className="w-8 h-8 rounded animate-pulse shrink-0" style={{ background: 'var(--out-grid-major)' }} />
          <div className="flex-1 h-3 rounded animate-pulse" style={{ background: 'var(--out-grid-major)', animationDelay: `${i * 60}ms` }} />
          <div className="w-20 h-3 rounded animate-pulse" style={{ background: 'var(--out-grid-major)', animationDelay: `${i * 80}ms` }} />
          <div className="w-16 h-3 rounded animate-pulse" style={{ background: 'var(--out-grid-major)', animationDelay: `${i * 100}ms` }} />
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════ */
export function MarketPage() {
  const { address } = useAccount();

  const [sort, setSort]         = useState<SortKey>('createdAt:desc');
  const [chain, setChain]       = useState<ChainKey>('ROBINHOOD');
  const [status, setStatus]     = useState<StatusKey>('');
  const [search, setSearch]     = useState('');
  const [debSearch, setDebSearch] = useState('');
  const [page, setPage]         = useState(1);
  const [lastSync, setLastSync] = useState(new Date());
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const [selectedToken, setSelectedToken] = useState<VToken | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const vp = useVirtualPrice();
  const { data, isLoading, isFetching, refetch } = useVirtualsTokens({ sort, chain, status, search: debSearch, page });
  const { data: summary } = useVirtualsSummary();

  useEffect(() => {
    let c = REFRESH_MS / 1000;
    const id = setInterval(() => {
      c--;
      if (c <= 0) { c = REFRESH_MS / 1000; setLastSync(new Date()); }
      setCountdown(c);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const manualRefresh = useCallback(() => {
    refetch(); setLastSync(new Date()); setCountdown(REFRESH_MS / 1000);
  }, [refetch]);

  const tokens = data?.tokens ?? [];
  const meta   = data?.meta;
  const apiErr = data?.error;

  const syncStr = lastSync.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }) + ' UTC';

  const SORT_TABS: { label: string; value: SortKey }[] = [
    { label: 'TOP MCAP',  value: 'mcapInVirtual:desc' },
    { label: 'VOLUME',    value: 'volume24h:desc' },
    { label: 'NEWEST',    value: 'createdAt:desc' },
    { label: '24H GAIN',  value: 'priceChangePercent24h:desc' },
    { label: 'HOLDERS',   value: 'holderCount:desc' },
    { label: 'MINDSHARE', value: 'mindshare:desc' },
  ];
  const CHAIN_BTNS: { label: string; value: ChainKey }[] = [
    { label: 'ROBINHOOD', value: 'ROBINHOOD' },
  ];
  const STATUS_BTNS: [string, StatusKey][] = [['NEW', ''], ['BONDING', 'BONDING'], ['GRADUATED', 'GRADUATED']];

  const btnStyle = (active: boolean) => ({
    borderColor: active ? 'var(--out-ink)' : 'var(--out-ink-dim)',
    color: active ? 'var(--out-ink)' : 'var(--out-muted)',
    background: active ? '#12180f' : 'transparent',
  });

  /* ── Full-screen token detail view ── */
  if (selectedToken) {
    return <TokenDetailPage token={selectedToken} onBack={() => setSelectedToken(null)} />;
  }

  return (
    <>
      <div className="max-w-[1700px] mx-auto px-4 py-6 flex flex-col gap-4">

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
          {[
            { label: 'TOTAL AGENTS',     val: summary?.totalTokens?.toLocaleString() ?? '—',  sub: chain === 'ALL' ? 'BOTH CHAINS' : chain + ' CHAIN' },
            { label: 'ON BONDING CURVE', val: summary?.bondingTokens?.toLocaleString() ?? '—', sub: 'PRE-GRADUATION' },
            { label: 'GRADUATED',        val: summary?.graduatedTokens?.toLocaleString() ?? '—', sub: 'BONDING CURVE COMPLETE' },
            { label: 'MY LAUNCHES',      val: address ? String(tokens.filter(t => t.creator?.toLowerCase() === address.toLowerCase()).length) : '—', sub: address ? 'THIS PAGE' : 'CONNECT WALLET' },
          ].map(s => (
            <div key={s.label} className="border border-[var(--out-grid-major)] px-4 py-3 flex flex-col gap-1">
              <div className="text-[9px] uppercase tracking-widest text-[var(--out-muted)]">{s.label}</div>
              <div className="text-[22px] font-bold leading-none" style={{ color: 'var(--out-ink)' }}>{s.val}</div>
              <div className="text-[9px] text-[var(--out-muted)]">{s.sub}</div>
            </div>
          ))}
        </div>

        <Sheet dwgNo="OUT-MKT-02" figCaption="FIG. 02 — VIRTUALS PROTOCOL MARKET · LIVE DATA">
          <div className="flex flex-col gap-3 py-3">

            {/* Controls */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex font-mono text-[10px]">
                  {CHAIN_BTNS.map(c => (
                    <button key={c.value} onClick={() => { setChain(c.value); setPage(1); }}
                      className="px-2 sm:px-3 py-1.5 uppercase tracking-widest border-y border-l last:border-r transition-colors"
                      style={btnStyle(chain === c.value)}>{c.label}</button>
                  ))}
                </div>
                <div className="flex font-mono text-[10px]">
                  {STATUS_BTNS.map(([label, val]) => (
                    <button key={val}
                      onClick={() => {
                        setStatus(val);
                        setPage(1);
                        if (val === '') setSort('createdAt:desc');
                      }}
                      className="px-2 sm:px-3 py-1.5 uppercase tracking-widest border-y border-l last:border-r transition-colors"
                      style={btnStyle(status === val)}>{label}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] ml-auto shrink-0">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${isFetching ? 'bg-white' : 'bg-[var(--out-ink)] animate-pulse'}`} />
                  <span style={{ color: 'var(--out-ink)' }}>LIVE</span>
                  <span className="hidden sm:inline" style={{ color: 'var(--out-muted)' }}>· {syncStr}</span>
                  <button onClick={manualRefresh}
                    className="px-2 py-1 border transition-colors"
                    style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>↻</button>
                </div>
              </div>

              <div className="flex items-center gap-2 border px-3 py-1.5 font-mono text-[11px]"
                style={{ borderColor: 'var(--out-ink-dim)', background: 'var(--out-bg)' }}>
                <span style={{ color: 'var(--out-muted)' }}>⌕</span>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="SEARCH NAME / TICKER"
                  className="flex-1 bg-transparent outline-none uppercase tracking-wide text-[10px] placeholder:text-[9px]"
                  style={{ color: 'var(--out-text)' }} />
                {search && <button onClick={() => setSearch('')} style={{ color: 'var(--out-muted)' }}>✕</button>}
              </div>
            </div>

            {/* Sort tabs */}
            <div className="flex gap-0 font-mono text-[10px] overflow-x-auto no-scrollbar border-b" style={{ borderColor: 'var(--out-grid-major)' }}>
              {SORT_TABS.map(s => (
                <button key={s.value} onClick={() => { setSort(s.value); setPage(1); }}
                  className="px-4 py-2 uppercase tracking-widest whitespace-nowrap transition-colors border-b-2"
                  style={{ borderBottomColor: sort === s.value ? 'var(--out-ink)' : 'transparent', color: sort === s.value ? 'var(--out-ink)' : 'var(--out-muted)', marginBottom: '-1px' }}>
                  {s.label}
                </button>
              ))}
            </div>

            {apiErr && (
              <div className="border px-4 py-2 font-mono text-[10px] uppercase tracking-widest"
                style={{ borderColor: 'var(--out-warn)', color: 'var(--out-warn)' }}>⚠ API ERROR: {apiErr}</div>
            )}

            {/* Click-to-detail hint */}
            {!isLoading && tokens.length > 0 && (
              <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
                <span className="sm:hidden">◈ TAP ANY ROW TO OPEN TRADE PANEL</span>
                <span className="hidden sm:inline">◈ CLICK ANY ROW TO OPEN TRADE PANEL</span>
              </div>
            )}

            {/* ── EMPTY / LOADING ── */}
            {isLoading ? <Skeleton /> : tokens.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 font-mono">
                <span className="text-5xl opacity-10" style={{ color: 'var(--out-ink)' }}>▦</span>
                <span className="text-[10px] uppercase tracking-widest text-center" style={{ color: 'var(--out-muted)' }}>
                  {debSearch ? `NO RESULTS FOR "${debSearch.toUpperCase()}"` : 'NO TOKENS FOUND'}
                </span>
              </div>
            ) : (<>

              {/* ══ MOBILE CARD LIST (< sm) ══════════════════════════════════ */}
              <div className="sm:hidden flex flex-col">
                {tokens.map((t, i) => {
                  const rank   = (page - 1) * 50 + i + 1;
                  const isNew  = Date.now() - new Date(t.launchedAt).getTime() < 10 * 60 * 1000;
                  const isMine = !!address && t.creator?.toLowerCase() === address.toLowerCase();
                  const posChg = t.priceChange24h >= 0;
                  return (
                    <div key={t.id}
                      className="flex items-center gap-3 px-2 py-2.5 border-b cursor-pointer transition-colors"
                      style={{ borderColor: 'var(--out-grid-major)', background: isMine ? '#0A120A' : 'transparent' }}
                      onClick={() => setSelectedToken(t)}>

                      {/* Rank */}
                      <span className="text-[9px] shrink-0 w-5 text-right font-mono" style={{ color: 'var(--out-muted)' }}>{rank}</span>

                      {/* Avatar */}
                      <TokenAvatar token={t} size={36} />

                      {/* Name + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[12px] font-bold font-mono" style={{ color: 'var(--out-ink)' }}>${t.ticker}</span>
                          {t.isVerified && <span className="text-[7px] border px-1" style={{ borderColor: '#39d353', color: '#39d353' }}>✓</span>}
                          {isNew  && <span className="text-[7px] border px-1 animate-pulse" style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>NEW</span>}
                          {isMine && <span className="text-[7px] border px-1" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>MINE</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap font-mono">
                          <span className="text-[9px]" style={{ color: 'var(--out-text)' }}>{vp > 0 ? fmtUsd(t.mcapInVirtual * vp) : `${fmtVirtual(t.mcapInVirtual)} VRTL`}</span>
                          <span className="text-[9px]" style={{ color: 'var(--out-muted)' }}>·</span>
                          <span className="text-[9px]" style={{ color: 'var(--out-muted)' }}>{ago(t.launchedAt)}</span>
                        </div>
                      </div>

                      {/* 24h % + status */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[11px] font-bold font-mono"
                          style={{ color: t.priceChange24h === 0 ? 'var(--out-muted)' : posChg ? '#39d353' : '#f87171' }}>
                          {t.priceChange24h !== 0 ? fmtPct(t.priceChange24h) : '—'}
                        </span>
                        <span className="text-[8px] border px-1.5 py-0.5 uppercase tracking-widest"
                          style={t.status === 'GRADUATED'
                            ? { borderColor: 'var(--out-ink)', color: 'var(--out-ink)', background: '#12180f' }
                            : { borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
                          {t.status === 'GRADUATED' ? '✓ GRAD' : '◉ CURVE'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ══ DESKTOP TABLE (sm+) ══════════════════════════════════════ */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full font-mono text-[10px] border-collapse" style={{ minWidth: 780 }}>
                  <thead>
                    <tr className="text-left" style={{ borderBottom: '1px solid var(--out-grid-major)' }}>
                      {['#', 'AGENT TOKEN', 'MCAP (USD)', 'VOL 24H', '24H %', 'LIQUIDITY', 'HOLDERS', 'CURVE', 'AGE', 'STATUS'].map(h => (
                        <th key={h} className="py-2 pr-3 last:pr-0 text-[9px] uppercase tracking-widest"
                          style={{ color: 'var(--out-muted)', fontWeight: 400, textAlign: h === '#' || h === 'AGENT TOKEN' ? 'left' : 'right', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((t, i) => {
                      const rank   = (page - 1) * 50 + i + 1;
                      const isNew  = Date.now() - new Date(t.launchedAt).getTime() < 10 * 60 * 1000;
                      const isMine = !!address && t.creator?.toLowerCase() === address.toLowerCase();
                      const posChg = t.priceChange24h >= 0;
                      return (
                        <tr key={t.id}
                          className="border-b cursor-pointer transition-colors group"
                          style={{ borderColor: 'var(--out-grid-major)', background: isMine ? '#0A120A' : 'transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#0E1A0E')}
                          onMouseLeave={e => (e.currentTarget.style.background = isMine ? '#0A120A' : 'transparent')}
                          onClick={() => setSelectedToken(t)}>
                          <td className="py-2.5 pr-3 text-[9px]" style={{ color: 'var(--out-muted)' }}>{rank}</td>
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2">
                              <TokenAvatar token={t} size={32} />
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold" style={{ color: 'var(--out-ink)' }}>${t.ticker}</span>
                                  {t.isVerified && <span className="text-[8px] px-1 border" style={{ borderColor: '#39d353', color: '#39d353' }}>✓</span>}
                                  {isNew  && <span className="text-[8px] border px-1 animate-pulse" style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>NEW</span>}
                                  {isMine && <span className="text-[8px] border px-1" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>MINE</span>}
                                </div>
                                <span className="text-[9px] truncate max-w-[130px]" style={{ color: 'var(--out-muted)' }}>{t.name}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 text-right" style={{ color: 'var(--out-text)' }}>{vp > 0 ? fmtUsd(t.mcapInVirtual * vp) : `${fmtVirtual(t.mcapInVirtual)} VRTL`}</td>
                          <td className="py-2.5 pr-3 text-right" style={{ color: 'var(--out-text)' }}>
                            {t.volume24h > 0 ? (vp > 0 ? fmtUsd(t.volume24h * vp) : `${fmtVirtual(t.volume24h)} VRTL`) : '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-bold"
                            style={{ color: t.priceChange24h === 0 ? 'var(--out-muted)' : posChg ? '#39d353' : '#f87171' }}>
                            {t.priceChange24h !== 0 ? fmtPct(t.priceChange24h) : '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-right" style={{ color: 'var(--out-text)' }}>{fmtUsd(t.liquidityUsd)}</td>
                          <td className="py-2.5 pr-3 text-right" style={{ color: 'var(--out-text)' }}>
                            {t.holderCount ? t.holderCount.toLocaleString() : '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-right">
                            <CurveBarInline pct={t.curveProgress} />
                          </td>
                          <td className="py-2.5 pr-3 text-right text-[9px]" style={{ color: 'var(--out-muted)' }}>{ago(t.launchedAt)}</td>
                          <td className="py-2.5 text-right">
                            <span className="text-[9px] border px-1.5 py-0.5 uppercase tracking-widest group-hover:border-[var(--out-ink)] transition-colors"
                              style={t.status === 'GRADUATED'
                                ? { borderColor: 'var(--out-ink)', color: 'var(--out-ink)', background: '#12180f' }
                                : { borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
                              {t.status === 'GRADUATED' ? '✓ GRAD' : '◉ CURVE'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>)}

            {/* Pagination */}
            {meta && meta.pageCount > 1 && (
              <div className="flex items-center justify-between font-mono text-[10px] pt-2 flex-wrap gap-2">
                <span style={{ color: 'var(--out-muted)' }} className="uppercase tracking-widest">
                  {((page - 1) * 50) + 1}–{Math.min(page * 50, meta.total)} OF {meta.total.toLocaleString()} AGENTS
                </span>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                    className="border px-3 py-1 uppercase tracking-widest disabled:opacity-30"
                    style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>← PREV</button>
                  <span className="border px-3 py-1" style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>
                    {page} / {meta.pageCount}
                  </span>
                  <button disabled={page >= meta.pageCount} onClick={() => setPage(p => p + 1)}
                    className="border px-3 py-1 uppercase tracking-widest disabled:opacity-30"
                    style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>NEXT →</button>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t font-mono text-[9px] uppercase tracking-widest flex-wrap gap-1"
              style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
              <span>
                <span className="inline-block w-1 h-1 rounded-full bg-[var(--out-ink)] mr-1.5" />
                SOURCE: VIRTUALS PROTOCOL API · MCAP/VOL IN USD · AUTO-REFRESH 30S
              </span>
            </div>
          </div>
        </Sheet>
      </div>
    </>
  );
}
