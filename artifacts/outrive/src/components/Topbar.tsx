import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useReadContract } from 'wagmi';
import { parseAbi, formatEther } from 'viem';
import { useGetSystemStatus } from '@workspace/api-client-react';

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

/* ── Robinhood Mainnet params for wallet_addEthereumChain ── */
const ROBINHOOD_CHAIN_PARAMS = {
  chainId: '0x1237',                 // 4663 decimal
  chainName: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
  blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
};

function getEip1193Provider() {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum ?? null;
}

function useAddRobinhoodChain() {
  const [pending, setPending] = useState(false);
  const [done, setDone]       = useState(false);

  const addChain = useCallback(async () => {
    const eth = getEip1193Provider();
    if (!eth) return;
    setPending(true);
    setDone(false);
    try {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [ROBINHOOD_CHAIN_PARAMS],
      });
      setDone(true);
    } catch {
      /* user rejected — silently ignore */
    } finally {
      setPending(false);
    }
  }, []);

  return { addChain, pending, done };
}

export function Topbar() {
  const { login, logout, authenticated, ready } = usePrivy();
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement>(null);

  /* Close dropdown on outside click */
  useEffect(() => {
    if (!walletMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (walletMenuRef.current && !walletMenuRef.current.contains(e.target as Node)) {
        setWalletMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [walletMenuOpen]);
  const { address, chain } = useAccount();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: status } = useGetSystemStatus({ query: { refetchInterval: 30_000 } as any });
  const { addChain, pending, done } = useAddRobinhoodChain();

  /* Detect whether any EIP-1193 wallet is present in the browser */
  const [hasWallet, setHasWallet] = useState(false);
  useEffect(() => {
    setHasWallet(!!getEip1193Provider());
  }, []);

  const virtualAddr = status?.virtualTokenAddress as `0x${string}` | undefined;
  const { data: virtualBalance } = useReadContract({
    address: virtualAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!virtualAddr && !!address, refetchInterval: 30_000 },
  });

  const virtualFormatted = virtualBalance !== undefined
    ? parseFloat(formatEther(virtualBalance as bigint)).toFixed(2)
    : null;

  const isCalibrated = status?.calibrated;
  const isHealthy    = status?.rpcHealthy;
  const chainId      = status?.chainId ?? 4663;

  /* Derived wallet state */
  const isConnected = authenticated && !!address;
  const wrongChain  = isConnected && !!chain && chain.id !== 4663 && chain.id !== 46630;
  const displayName = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : 'CONNECTED';

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between font-mono"
      style={{
        height: 48,
        borderBottom: '1px solid var(--out-ink-dim)',
        background: 'var(--out-bg)',
        padding: '0 12px',
      }}
    >
      {/* ── Left: logo + wordmark ── */}
      <div className="flex items-center gap-2 shrink-0 min-w-0">
        <img
          src="/outrive-logo.png"
          alt="OUTRIVE"
          className="h-6 w-6 sm:h-7 sm:w-7 object-contain shrink-0"
        />
        <div className="flex items-baseline gap-2">
          <span
            className="text-[12px] sm:text-[13px] font-bold tracking-widest uppercase shrink-0"
            style={{ color: 'var(--out-ink)', fontFamily: "'Space Grotesk', sans-serif" }}
          >
            OUTRIVE
          </span>
          <span
            className="text-[12px] uppercase tracking-widest hidden sm:inline shrink-0"
            style={{ color: 'var(--out-muted)' }}
          >
            AGENT FACTORY
          </span>
          <span className="text-[12px] hidden sm:inline shrink-0" style={{ color: 'var(--out-ink-dim)' }}>•</span>
          <span
            className="text-[12px] uppercase tracking-widest hidden lg:inline shrink-0"
            style={{ color: 'var(--out-ink)' }}
          >
            VIRTUALS ON ROBINHOOD
          </span>
        </div>
      </div>

      {/* ── Right: chips (progressive hide) + connect ── */}
      <div className="flex items-center gap-1.5 sm:gap-2 text-[12px] sm:text-[13px] uppercase tracking-widest shrink-0">

        {/* Network dot (xs only) */}
        <span
          className="inline-block w-2 h-2 rounded-full sm:hidden shrink-0"
          style={{ background: isHealthy ? 'var(--out-ink)' : 'var(--out-warn)' }}
        />

        {/* Network chip (sm+) */}
        <div
          className="hidden sm:flex items-center gap-1.5 px-2 py-1 shrink-0"
          style={{
            color: isHealthy ? 'var(--out-text)' : 'var(--out-warn)',
          }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: isHealthy ? 'var(--out-ink)' : 'var(--out-warn)' }}
          />
          <img src="/robinhood-logo.png" alt="Robinhood" className="h-4 w-auto object-contain" />
        </div>

        {/* Calibration badge (md+) */}
        {!isCalibrated && (
          <div
            className="hidden md:flex items-center gap-1.5 px-2 py-1 border shrink-0"
            style={{ borderColor: 'var(--out-warn)', color: 'var(--out-warn)' }}
          >
            <span>⚠</span>
            <span className="hidden xl:inline">CALIBRATION REQUIRED</span>
            <span className="xl:hidden">CALIB.</span>
          </div>
        )}

        {/* ── Connect button area ── */}
        {!ready ? null : !isConnected ? (
          /* NOT CONNECTED */
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={login}
              className="px-3 py-1 font-bold uppercase tracking-widest transition-opacity hover:opacity-90 shrink-0"
              style={{
                fontSize: 'inherit',
                background: 'var(--out-ink)',
                color: 'var(--out-bg)',
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              CONNECT
            </button>
          </div>
        ) : wrongChain ? (
          /* WRONG CHAIN */
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="hidden sm:block text-[12px] uppercase tracking-widest shrink-0"
              style={{ color: 'var(--out-warn)' }}
            >
              WRONG CHAIN
            </span>
            <button
              onClick={addChain}
              disabled={pending}
              className="px-2 sm:px-3 py-1 font-bold uppercase tracking-widest transition-opacity hover:opacity-90 disabled:opacity-50 shrink-0"
              style={{
                fontSize: 'inherit',
                background: 'var(--out-ink)',
                color: 'var(--out-bg)',
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              <span className="sm:hidden">{pending ? '…' : '+RPC'}</span>
              <span className="hidden sm:inline">
                {pending ? 'SWITCHING…' : 'SETUP ROBINHOOD RPC'}
              </span>
            </button>
          </div>
        ) : (
          /* CONNECTED & CORRECT CHAIN — wallet menu */
          <div ref={walletMenuRef} className="relative shrink-0">
            <button
              onClick={() => setWalletMenuOpen(o => !o)}
              className="px-3 py-1 font-bold uppercase tracking-widest transition-opacity hover:opacity-90 shrink-0 flex items-center gap-1.5"
              style={{
                fontSize: 'inherit',
                background: 'var(--out-ink)',
                color: 'var(--out-bg)',
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              <span className="sm:hidden">
                {displayName.length > 10 ? displayName.slice(0, 8) + '…' : displayName}
              </span>
              <span className="hidden sm:inline">{displayName}</span>
              <span style={{ fontSize: 10 }}>{walletMenuOpen ? '▲' : '▼'}</span>
            </button>

            {walletMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 flex flex-col font-mono uppercase tracking-widest z-[100] min-w-[160px]"
                style={{
                  border: '1px solid var(--out-ink)',
                  background: 'var(--out-bg)',
                  fontSize: 11,
                }}
              >
                {/* Wallet address display */}
                <div
                  className="px-4 py-2.5 font-mono"
                  style={{ color: 'var(--out-muted)', borderBottom: '1px solid var(--out-ink-dim)', fontSize: 10, wordBreak: 'break-all' }}
                >
                  {address}
                </div>
                <button
                  onClick={() => {
                    if (address) navigator.clipboard.writeText(address);
                    setWalletMenuOpen(false);
                  }}
                  className="px-4 py-2.5 text-left hover:bg-[var(--out-ink)] hover:text-black transition-colors"
                  style={{ color: 'var(--out-ink)', borderBottom: '1px solid var(--out-ink-dim)' }}
                >
                  ⎘ Copy Address
                </button>
                <button
                  onClick={() => { setWalletMenuOpen(false); logout(); }}
                  className="px-4 py-2.5 text-left hover:bg-[var(--out-ink)] hover:text-black transition-colors"
                  style={{ color: 'var(--out-warn)' }}
                >
                  ✕ Disconnect
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
