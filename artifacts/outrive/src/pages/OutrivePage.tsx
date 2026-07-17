import React, { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseUnits, formatUnits } from 'viem';
import { Sheet } from '@/components/Sheet';
import { fetchCredits, type CreditInfo } from '@/lib/chatStream';
import {
  OTR_CREDIT_POOL_ABI,
  ERC20_ABI,
  OTR_TOKEN_ADDRESS,
  OTR_CREDIT_POOL_ADDRESS,
} from '@/lib/contracts';

/* ══════════════════════════════════════════════════════════════════════════
   OUTRIVE PAGE  —  $OTR CREDIT STORE
   Credit model:  10 free chats per wallet  →  50 $OTR = 1 chat credit
   Contract:      OTRCreditPool on Robinhood Chain (4663)
══════════════════════════════════════════════════════════════════════════ */

const _BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
function apiUrl(path: string) { return _BASE + path; }

/* ── Tier definitions ── */
const TIERS = [
  { id: 0, label: 'STARTER',  otr: 500n * 10n ** 18n,  otrDisplay: '500',  chats: 10  },
  { id: 1, label: 'BUILDER',  otr: 2000n * 10n ** 18n, otrDisplay: '2,000', chats: 50  },
  { id: 2, label: 'OPERATOR', otr: 5000n * 10n ** 18n, otrDisplay: '5,000', chats: 200 },
] as const;

type TierId = 0 | 1 | 2;

const EXPLORER_TX = 'https://robinhoodchain.blockscout.com/tx/';

/* ── Sub-components ─────────────────────────────────────────────────────── */

function CreditBar({ used, total }: { used: number; total: number }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px]">
      <span style={{ color: 'var(--out-muted)' }}>FREE</span>
      <div className="flex gap-[3px]">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 10, height: 10,
              background: i < used ? 'var(--out-ink-dim)' : 'var(--out-ink)',
              opacity:    i < used ? 0.2 : 1,
            }}
          />
        ))}
      </div>
      <span style={{
        color: (total - used) === 0
          ? 'var(--out-warn)'
          : (total - used) <= 3 ? '#f59e0b' : 'var(--out-ink)',
        fontWeight: 700,
      }}>
        {total - used}/{total} REMAINING
      </span>
    </div>
  );
}

function ConnectPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 font-mono text-center">
      <div className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
        WALLET NOT CONNECTED
      </div>
      <div className="text-[10px] max-w-xs leading-relaxed" style={{ color: 'var(--out-muted)' }}>
        Connect your wallet to see your credit balance.
        Every wallet starts with{' '}
        <span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>10 free AI chats</span> — no sign-up required.
      </div>
    </div>
  );
}

function CreditDashboard({ credits }: { credits: CreditInfo }) {
  const freeUsed  = credits.freeChatsUsed ?? 0;
  const freeTotal = credits.freeChatsTotal ?? 10;
  const otr       = credits.otrCredits ?? 0;
  const total     = (freeTotal - freeUsed) + otr;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Total */}
      <div className="sm:col-span-2 border p-5 font-mono" style={{ borderColor: 'var(--out-ink)' }}>
        <div className="text-[9px] uppercase tracking-widest mb-3" style={{ color: 'var(--out-muted)' }}>
          TOTAL CHAT CREDITS AVAILABLE
        </div>
        <div className="text-[48px] font-bold leading-none mb-2" style={{
          color: total > 0 ? 'var(--out-ink)' : 'var(--out-warn)',
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {total > 0 ? total.toFixed(total % 1 === 0 ? 0 : 2) : '0'}
        </div>
        <div className="text-[9px]" style={{ color: 'var(--out-muted)' }}>
          {total > 0
            ? `${freeTotal - freeUsed} free + ${otr.toFixed(0)} $OTR credits`
            : 'ALL CREDITS EXHAUSTED — purchase $OTR to continue'}
        </div>
        <div className="mt-5"><CreditBar used={freeUsed} total={freeTotal} /></div>
      </div>

      {/* Side panel */}
      <div className="border p-5 font-mono flex flex-col gap-4" style={{ borderColor: 'var(--out-grid-major)' }}>
        <div>
          <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-muted)' }}>FREE TIER</div>
          <div className="text-[22px] font-bold leading-none" style={{ color: 'var(--out-ink)' }}>
            {Math.max(0, freeTotal - freeUsed)}
            <span className="text-[12px] font-normal ml-2" style={{ color: 'var(--out-muted)' }}>/ {freeTotal}</span>
          </div>
          <div className="text-[9px] mt-1" style={{ color: 'var(--out-muted)' }}>chats remaining</div>
        </div>
        <div className="border-t pt-4" style={{ borderColor: 'var(--out-grid-major)' }}>
          <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-muted)' }}>$OTR CREDITS</div>
          <div className="text-[22px] font-bold leading-none" style={{
            color: otr > 0 ? 'var(--out-ink)' : 'var(--out-muted)',
          }}>
            {otr.toFixed(0)}
          </div>
          <div className="text-[9px] mt-1" style={{ color: 'var(--out-muted)' }}>purchased credits</div>
        </div>
      </div>
    </div>
  );
}

/* ── TierCard ── */
function TierCard({
  tier,
  selected,
  onSelect,
}: {
  tier: typeof TIERS[number];
  selected: boolean;
  onSelect: () => void;
}) {
  const isFirst  = tier.id === 0;
  const isMiddle = tier.id === 1;
  const pricePerChat = (tier.id === 0 ? 50 : tier.id === 1 ? 40 : 25);

  return (
    <div
      onClick={onSelect}
      className={`p-5 flex flex-col gap-2 cursor-pointer transition-all border-b sm:border-b-0 sm:border-r last:border-0 ${
        selected ? 'bg-[#0d1a0d]' : 'hover:bg-[#0a120a]'
      }`}
      style={{ borderColor: 'var(--out-grid-major)' }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>
          {tier.label}
        </div>
        {selected && (
          <div className="text-[9px] border px-1.5 py-0.5 uppercase tracking-widest"
            style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>
            SELECTED
          </div>
        )}
      </div>
      <div className="text-[28px] font-bold leading-none" style={{
        color: 'var(--out-ink)',
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        {tier.otrDisplay} <span className="text-[14px]">$OTR</span>
      </div>
      <div className="flex items-center gap-2 text-[10px]">
        <span style={{ color: 'var(--out-ink-dim)' }}>══</span>
        <span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>{tier.chats} CHATS</span>
      </div>
      <div className="text-[9px]" style={{ color: 'var(--out-muted)' }}>
        {pricePerChat} $OTR per chat
        {tier.id > 0 && <span style={{ color: '#4ade80' }}>{' '}(save {tier.id === 1 ? '10' : '20'}%)</span>}
      </div>
    </div>
  );
}

/* ── CustomTierInput ── */
function CustomTierInput({
  chatCount,
  onChange,
}: {
  chatCount: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="p-5 border-t font-mono" style={{ borderColor: 'var(--out-grid-major)' }}>
      <div className="text-[9px] uppercase tracking-widest mb-3" style={{ color: 'var(--out-muted)' }}>
        CUSTOM AMOUNT — minimum 5 chats · 50 $OTR per chat
      </div>
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={5}
          max={10000}
          value={chatCount}
          onChange={e => onChange(Math.max(5, Math.min(10000, parseInt(e.target.value) || 5)))}
          className="border bg-transparent px-3 py-2 text-[14px] font-mono w-32 outline-none"
          style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-ink)' }}
        />
        <span className="text-[10px]" style={{ color: 'var(--out-muted)' }}>chats</span>
        <span className="text-[10px] font-bold" style={{ color: 'var(--out-ink)' }}>
          = {chatCount * 50} $OTR
        </span>
      </div>
    </div>
  );
}

/* ── Main purchase panel ── */
function CreditPurchasePanel({ walletAddress, onPurchased }: {
  walletAddress: string | undefined;
  onPurchased: () => void;
}) {
  const [selectedTier, setSelectedTier]   = useState<TierId | 'custom'>(0);
  const [customChats, setCustomChats]     = useState(10);
  const [step, setStep]                   = useState<'idle' | 'approving' | 'buying' | 'confirming' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg]           = useState('');
  const [successData, setSuccessData]     = useState<{ chats: number; tier: string; txHash: string } | null>(null);

  const contractReady = !!OTR_CREDIT_POOL_ADDRESS;

  // ── Current tier OTR amount ──
  const currentOtr: bigint = selectedTier === 'custom'
    ? BigInt(customChats) * 50n * 10n ** 18n
    : TIERS[selectedTier].otr;

  const currentChats: number = selectedTier === 'custom'
    ? customChats
    : TIERS[selectedTier].chats;

  const walletConnected = !!walletAddress;

  // ── Read OTR balance ──
  const { data: otrBalance } = useReadContract({
    address: OTR_TOKEN_ADDRESS,
    abi:     ERC20_ABI,
    functionName: 'balanceOf',
    args:    [walletAddress as `0x${string}`],
    query:   { enabled: contractReady && walletConnected },
  });

  // ── Read current allowance ──
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: OTR_TOKEN_ADDRESS,
    abi:     ERC20_ABI,
    functionName: 'allowance',
    args:    [walletAddress as `0x${string}`, OTR_CREDIT_POOL_ADDRESS!],
    query:   { enabled: contractReady && walletConnected && !!OTR_CREDIT_POOL_ADDRESS },
  });

  // ── Write: approve ──
  const { writeContractAsync: writeApprove } = useWriteContract();

  // ── Write: purchaseTier / purchaseCustom ──
  const { writeContractAsync: writePurchase } = useWriteContract();

  // ── TX receipt wait ──
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>(undefined);
  const { data: receipt } = useWaitForTransactionReceipt({
    hash:  pendingHash,
    query: { enabled: !!pendingHash },
  });

  // Watch for receipt and call backend
  React.useEffect(() => {
    if (!receipt || step !== 'confirming') return;
    confirmWithBackend(receipt.transactionHash);
  }, [receipt, step]);

  async function confirmWithBackend(txHash: `0x${string}`) {
    try {
      const res = await fetch(apiUrl('/api/credits/purchase'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ walletAddress, txHash }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message ?? data.error ?? 'Backend verification failed');
        setStep('error');
        return;
      }
      setSuccessData({ chats: data.chatsGranted, tier: data.tier, txHash });
      setStep('success');
      onPurchased();
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Network error confirming purchase');
      setStep('error');
    }
  }

  async function handleBuy() {
    if (!OTR_CREDIT_POOL_ADDRESS || !walletAddress) return;
    setErrorMsg('');
    try {
      // Step 1: approve if needed
      const alreadyApproved = (allowance ?? 0n) >= currentOtr;
      if (!alreadyApproved) {
        setStep('approving');
        await writeApprove({
          address:      OTR_TOKEN_ADDRESS,
          abi:          ERC20_ABI,
          functionName: 'approve',
          args:         [OTR_CREDIT_POOL_ADDRESS, currentOtr],
        });
        await refetchAllowance();
      }

      // Step 2: purchase
      setStep('buying');
      let hash: `0x${string}`;
      if (selectedTier === 'custom') {
        hash = await writePurchase({
          address:      OTR_CREDIT_POOL_ADDRESS,
          abi:          OTR_CREDIT_POOL_ABI,
          functionName: 'purchaseCustom',
          args:         [BigInt(customChats)],
        });
      } else {
        hash = await writePurchase({
          address:      OTR_CREDIT_POOL_ADDRESS,
          abi:          OTR_CREDIT_POOL_ABI,
          functionName: 'purchaseTier',
          args:         [selectedTier],
        });
      }

      // Step 3: wait for confirmation
      setStep('confirming');
      setPendingHash(hash);
    } catch (err: any) {
      const msg = err?.shortMessage ?? err?.message ?? 'Transaction cancelled or failed';
      setErrorMsg(msg);
      setStep('error');
    }
  }

  function reset() {
    setStep('idle');
    setErrorMsg('');
    setSuccessData(null);
    setPendingHash(undefined);
  }

  const otrBalanceFormatted = otrBalance !== undefined
    ? parseFloat(formatUnits(otrBalance, 18)).toFixed(2)
    : '—';

  const insufficientBalance = walletConnected && otrBalance !== undefined && otrBalance < currentOtr;

  if (!contractReady) {
    return (
      <div className="border font-mono" style={{ borderColor: 'var(--out-grid-major)' }}>
        <div className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: 'var(--out-grid-major)', background: '#080d08' }}>
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>
            PURCHASE $OTR CREDITS
          </span>
          <span className="border px-2 py-0.5 text-[9px] uppercase tracking-widest animate-pulse"
            style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>
            DEPLOYING
          </span>
        </div>
        <div className="px-5 py-8 text-center">
          <div className="text-[10px] font-mono" style={{ color: 'var(--out-muted)' }}>
            OTRCreditPool contract is being deployed to Robinhood Chain.<br />
            Credit purchases will be available shortly.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border font-mono" style={{ borderColor: 'var(--out-grid-major)' }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: 'var(--out-grid-major)', background: '#080d08' }}>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>
            PURCHASE $OTR CREDITS
          </span>
          {otrBalance !== undefined && (
            <span className="text-[9px]" style={{ color: 'var(--out-muted)' }}>
              BALANCE: <span style={{ color: 'var(--out-ink)' }}>{otrBalanceFormatted} $OTR</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#4ade80' }} />
          <span className="text-[9px] uppercase tracking-widest" style={{ color: '#4ade80' }}>LIVE</span>
        </div>
      </div>

      {/* Success state */}
      {step === 'success' && successData && (
        <div className="px-5 py-8 flex flex-col items-center gap-4">
          <div className="text-[32px]">✓</div>
          <div className="text-[13px] font-bold uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>
            {successData.chats} CHATS CREDITED
          </div>
          <div className="text-[10px]" style={{ color: 'var(--out-muted)' }}>
            Tier: {successData.tier.toUpperCase()}
          </div>
          <a
            href={`${EXPLORER_TX}${successData.txHash}`}
            target="_blank" rel="noreferrer"
            className="text-[10px] underline decoration-dotted"
            style={{ color: 'var(--out-ink)' }}
          >
            VIEW TX ON BLOCKSCOUT ↗
          </a>
          <button
            onClick={reset}
            className="border px-4 py-2 text-[10px] uppercase tracking-widest mt-2"
            style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}
          >
            BUY MORE
          </button>
        </div>
      )}

      {/* Error state */}
      {step === 'error' && (
        <div className="px-5 py-6 flex flex-col gap-3">
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--out-warn)' }}>
            TRANSACTION FAILED
          </div>
          <div className="text-[10px]" style={{ color: 'var(--out-muted)' }}>{errorMsg}</div>
          <button
            onClick={reset}
            className="self-start border px-4 py-2 text-[10px] uppercase tracking-widest"
            style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}
          >
            TRY AGAIN
          </button>
        </div>
      )}

      {/* Normal purchase flow */}
      {step !== 'success' && step !== 'error' && (
        <>
          {/* Tier cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 border-b" style={{ borderColor: 'var(--out-grid-major)' }}>
            {TIERS.map(tier => (
              <TierCard
                key={tier.id}
                tier={tier}
                selected={selectedTier === tier.id}
                onSelect={() => setSelectedTier(tier.id as TierId)}
              />
            ))}
          </div>

          {/* Custom tier */}
          <div
            className={`cursor-pointer border-b transition-all ${selectedTier === 'custom' ? 'bg-[#0d1a0d]' : 'hover:bg-[#0a120a]'}`}
            style={{ borderColor: 'var(--out-grid-major)' }}
            onClick={() => setSelectedTier('custom')}
          >
            <div className="px-5 pt-4 pb-1 flex items-center gap-3">
              <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--out-muted)' }}>CUSTOM</div>
              {selectedTier === 'custom' && (
                <div className="text-[9px] border px-1.5 py-0.5 uppercase"
                  style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>SELECTED</div>
              )}
            </div>
            {selectedTier === 'custom' && (
              <CustomTierInput chatCount={customChats} onChange={setCustomChats} />
            )}
            {selectedTier !== 'custom' && (
              <div className="px-5 pb-4 text-[10px]" style={{ color: 'var(--out-muted)' }}>
                50 $OTR per chat · min 5 chats
              </div>
            )}
          </div>

          {/* Action row */}
          <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
            style={{ background: '#060b06' }}>
            {/* Summary */}
            <div className="flex-1 font-mono">
              <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>
                ORDER SUMMARY
              </div>
              <div className="text-[12px] font-bold" style={{ color: 'var(--out-ink)' }}>
                {currentChats} CHATS &nbsp;·&nbsp; {formatUnits(currentOtr, 18)} $OTR
              </div>
              {insufficientBalance && (
                <div className="text-[9px] mt-1" style={{ color: 'var(--out-warn)' }}>
                  ⚠ INSUFFICIENT $OTR BALANCE
                </div>
              )}
            </div>

            {/* Step status */}
            {step !== 'idle' && (
              <div className="text-[10px] font-mono animate-pulse" style={{ color: 'var(--out-ink)' }}>
                {step === 'approving'   && '● APPROVING $OTR…'}
                {step === 'buying'      && '● SENDING TX…'}
                {step === 'confirming'  && '● CONFIRMING ON-CHAIN…'}
              </div>
            )}

            {/* Buy button */}
            {!walletConnected ? (
              <div className="border px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-center opacity-50 cursor-not-allowed select-none"
                style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}>
                CONNECT WALLET TO BUY
              </div>
            ) : (
              <button
                onClick={handleBuy}
                disabled={step !== 'idle' || insufficientBalance}
                className="border px-6 py-3 text-[11px] uppercase tracking-widest font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  borderColor: step === 'idle' && !insufficientBalance ? 'var(--out-ink)' : 'var(--out-ink-dim)',
                  color:       step === 'idle' && !insufficientBalance ? 'var(--out-ink)' : 'var(--out-muted)',
                  background:  step !== 'idle' ? '#0d1a0d' : 'transparent',
                }}
              >
                {step === 'idle' ? `BUY ${currentChats} CHATS` : '● PROCESSING…'}
              </button>
            )}
          </div>

          {/* How it works */}
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-[10px] border-t"
            style={{ background: '#040808', borderColor: 'var(--out-grid-major)' }}>
            {[
              { step: '01', title: 'APPROVE $OTR',   body: 'Wallet prompts you to approve $OTR spend for the OTRCreditPool contract.' },
              { step: '02', title: 'CONFIRM PURCHASE', body: 'Sign the purchaseTier or purchaseCustom transaction. No ETH cost beyond gas.' },
              { step: '03', title: 'CHATS CREDITED',  body: 'Credits appear instantly after on-chain confirmation. Never expire.' },
            ].map(s => (
              <div key={s.step} className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[9px]" style={{ color: 'var(--out-ink-dim)' }}>{s.step} ——</span>
                  <span className="font-bold uppercase tracking-wide" style={{ color: 'var(--out-ink)' }}>{s.title}</span>
                </div>
                <p style={{ color: 'var(--out-muted)' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Purchase history table ── */
interface PurchaseRow {
  id: number;
  txHash: string;
  tier: string;
  chatsGranted: number;
  otrAmount: string;
  status: string;
  createdAt: string;
}

function PurchaseHistory({ walletAddress }: { walletAddress: string }) {
  const { data: rows, isLoading } = useQuery<PurchaseRow[]>({
    queryKey: ['credit-history', walletAddress],
    queryFn: () =>
      fetch(apiUrl(`/api/credits/history/${walletAddress}`)).then(r => r.json()),
    enabled: !!walletAddress,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return (
    <div className="border font-mono" style={{ borderColor: 'var(--out-grid-major)' }}>
      <div className="border-b px-5 py-3 text-[9px] uppercase tracking-widest"
        style={{ borderColor: 'var(--out-grid-major)', color: 'var(--out-muted)', background: '#080d08' }}>
        PURCHASE HISTORY
      </div>

      {isLoading ? (
        <div className="px-5 py-6 text-[10px] uppercase tracking-widest animate-pulse"
          style={{ color: 'var(--out-muted)' }}>
          LOADING…
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-[10px]" style={{ color: 'var(--out-muted)' }}>
          No purchases yet. Buy $OTR credits above to get started.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--out-grid-major)' }}>
                {['DATE', 'TIER', 'CHATS', 'OTR PAID', 'TX'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[9px] uppercase tracking-widest"
                    style={{ color: 'var(--out-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const date    = new Date(row.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
                const otrNum  = parseFloat(formatUnits(BigInt(row.otrAmount), 18)).toFixed(0);
                return (
                  <tr key={row.id} className="border-b hover:bg-[#0a120a] transition-colors"
                    style={{ borderColor: 'var(--out-grid-major)' }}>
                    <td className="px-4 py-3" style={{ color: 'var(--out-muted)' }}>{date}</td>
                    <td className="px-4 py-3 font-bold uppercase" style={{ color: 'var(--out-ink)' }}>{row.tier}</td>
                    <td className="px-4 py-3 font-bold" style={{ color: 'var(--out-ink)' }}>{row.chatsGranted}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--out-ink)' }}>{otrNum}</td>
                    <td className="px-4 py-3">
                      <a
                        href={`${EXPLORER_TX}${row.txHash}`}
                        target="_blank" rel="noreferrer"
                        className="underline decoration-dotted underline-offset-2 hover:opacity-80"
                        style={{ color: 'var(--out-ink)' }}
                      >
                        {row.txHash.slice(0, 8)}…{row.txHash.slice(-6)} ↗
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Token info ── */
function TokenInfoPanel() {
  const fields = [
    { label: 'CONTRACT',     val: OTR_TOKEN_ADDRESS },
    { label: 'CHAIN',        val: 'ROBINHOOD CHAIN (4663)' },
    { label: 'UTILITY',      val: 'AI CHAT CREDITS — 50 $OTR = 1 CHAT' },
    { label: 'FREE TIER',    val: '10 FREE CHATS PER WALLET — NO $OTR NEEDED' },
    { label: 'STARTER',      val: '500 OTR → 10 CHATS (50 OTR/CHAT)' },
    { label: 'BUILDER',      val: '2,000 OTR → 50 CHATS (40 OTR/CHAT · 20% SAVE)' },
    { label: 'OPERATOR',     val: '5,000 OTR → 200 CHATS (25 OTR/CHAT · 50% SAVE)' },
  ];

  return (
    <div className="border font-mono" style={{ borderColor: 'var(--out-grid-major)' }}>
      <div className="border-b px-5 py-3 text-[9px] uppercase tracking-widest"
        style={{ borderColor: 'var(--out-grid-major)', color: 'var(--out-muted)', background: '#080d08' }}>
        $OTR TOKEN INFORMATION
      </div>
      <div className="px-5 py-4 flex flex-col gap-0">
        {fields.map(({ label, val }) => (
          <div key={label}
            className="flex items-center gap-2 py-2.5 border-b"
            style={{ borderColor: 'var(--out-grid-major)' }}>
            <span className="text-[9px] uppercase tracking-widest shrink-0 w-28" style={{ color: 'var(--out-muted)' }}>
              {label}
            </span>
            <span className="flex-1 border-b border-dotted" style={{ borderColor: 'var(--out-ink-dim)' }} />
            <span className="text-[10px] font-bold text-right break-all max-w-[60%]" style={{ color: 'var(--out-text)' }}>
              {val}
            </span>
          </div>
        ))}
      </div>
      <div className="px-5 pb-4 pt-1 text-[9px] leading-relaxed" style={{ color: 'var(--out-muted)' }}>
        $OTR is a utility token native to OUTRIVE. It is not an investment. Token value is not guaranteed.
        Always verify contract addresses on{' '}
        <a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noreferrer"
          className="underline decoration-dotted" style={{ color: 'var(--out-ink)' }}>
          Blockscout ↗
        </a>{' '}
        before any transaction.
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   OUTRIVE PAGE ROOT
══════════════════════════════════════════════════════════════════════════ */
export function OutrivePage() {
  const { address } = useAccount();
  const queryClient = useQueryClient();

  const { data: credits, isLoading } = useQuery<CreditInfo | null>({
    queryKey: ['credits', address],
    queryFn:  () => fetchCredits(address!),
    enabled:  !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  function handlePurchased() {
    // Refresh credit balance after a successful purchase
    queryClient.invalidateQueries({ queryKey: ['credits', address] });
    queryClient.invalidateQueries({ queryKey: ['credit-history', address] });
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col gap-6">

      {/* ── SHEET A — CREDIT BALANCE ── */}
      <Sheet dwgNo="OUT-OTR-01" figCaption="FIG. 01 — OUTRIVE CREDIT SYSTEM · $OTR">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: 'var(--out-muted)' }}>
              AI CHAT CREDITS
            </div>
            <div className="flex items-baseline gap-3">
              <div className="text-[18px] font-bold leading-none font-mono"
                style={{ color: 'var(--out-ink)', fontFamily: "'Space Grotesk', sans-serif" }}>
                OUTRIVE
              </div>
              <div className="text-[11px] font-mono border px-2 py-0.5"
                style={{ borderColor: 'var(--out-ink)', color: 'var(--out-ink)' }}>
                $OTR
              </div>
            </div>
          </div>
          <div className="text-[9px] font-mono text-right leading-relaxed" style={{ color: 'var(--out-muted)' }}>
            <span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>10 FREE CHATS</span> per wallet · no sign-up<br />
            <span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>50 $OTR</span> = 1 additional chat credit
          </div>
        </div>

        {!address ? (
          <ConnectPrompt />
        ) : isLoading ? (
          <div className="py-12 text-center font-mono text-[10px] uppercase tracking-widest animate-pulse"
            style={{ color: 'var(--out-muted)' }}>
            READING CHAIN…
          </div>
        ) : credits != null ? (
          <CreditDashboard credits={credits} />
        ) : null}
      </Sheet>

      {/* ── SHEET B — BUY CREDITS ── */}
      <Sheet dwgNo="OUT-OTR-02" figCaption="FIG. 02 — CREDIT PURCHASE · $OTR TOKEN">
        <CreditPurchasePanel
          walletAddress={address}
          onPurchased={handlePurchased}
        />
      </Sheet>

      {/* ── SHEET C — PURCHASE HISTORY ── */}
      {address && (
        <Sheet dwgNo="OUT-OTR-03" figCaption="FIG. 03 — PURCHASE HISTORY · $OTR CREDITS">
          <PurchaseHistory walletAddress={address} />
        </Sheet>
      )}

      {/* ── SHEET D — TOKEN INFO ── */}
      <Sheet dwgNo="OUT-OTR-04" figCaption="FIG. 04 — TOKEN SPECIFICATIONS · $OTR">
        <TokenInfoPanel />
      </Sheet>

    </div>
  );
}
