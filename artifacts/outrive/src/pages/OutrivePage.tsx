import React from 'react';
import { useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { Sheet } from '@/components/Sheet';
import { fetchCredits, type CreditInfo } from '@/lib/chatStream';

/* ══════════════════════════════════════════════════════════════════════════
   OUTRIVE PAGE  —  $OTR CREDIT STORE
   Credit model:  10 free chats per wallet  →  1 $OTR = 1 chat credit
   TGE:           pending
══════════════════════════════════════════════════════════════════════════ */

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
          : (total - used) <= 3
          ? '#f59e0b'
          : 'var(--out-ink)',
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
  const freeUsed = credits.freeChatsUsed ?? 0;
  const freeTotal = credits.freeChatsTotal ?? 10;
  const otr = credits.otrCredits ?? 0;
  const total = (freeTotal - freeUsed) + otr;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Total access panel */}
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
            ? `${freeTotal - freeUsed} free + ${otr.toFixed(2)} $OTR credits`
            : 'ALL CREDITS EXHAUSTED — purchase $OTR to continue'}
        </div>
        <div className="mt-5">
          <CreditBar used={freeUsed} total={freeTotal} />
        </div>
      </div>

      {/* $OTR balance panel */}
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
            {otr.toFixed(2)}
          </div>
          <div className="text-[9px] mt-1" style={{ color: 'var(--out-muted)' }}>purchased credits</div>
        </div>
      </div>
    </div>
  );
}

function ComingSoonPanel() {
  const RATE_ROWS = [
    { qty: '10 $OTR',  credits: '10 CHATS',  label: 'STARTER' },
    { qty: '50 $OTR',  credits: '50 CHATS',  label: 'BUILDER' },
    { qty: '200 $OTR', credits: '200 CHATS', label: 'OPERATOR' },
  ];

  return (
    <div className="border font-mono" style={{ borderColor: 'var(--out-grid-major)' }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: 'var(--out-grid-major)', background: '#080d08' }}>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--out-ink)' }}>
            PURCHASE $OTR CREDITS
          </span>
        </div>
        <span className="border px-2 py-0.5 text-[9px] uppercase tracking-widest animate-pulse"
          style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>
          COMING SOON
        </span>
      </div>

      {/* Rate table */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 border-b" style={{ borderColor: 'var(--out-grid-major)' }}>
        {RATE_ROWS.map((r, i) => (
          <div
            key={r.label}
            className={`p-5 flex flex-col gap-2 ${i < RATE_ROWS.length - 1 ? 'border-b sm:border-b-0 sm:border-r' : ''}`}
            style={{ borderColor: 'var(--out-grid-major)' }}
          >
            <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--out-muted)' }}>
              {r.label}
            </div>
            <div className="text-[28px] font-bold leading-none select-none" style={{ color: 'var(--out-ink)', filter: 'blur(6px)' }}>
              {r.qty}
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span style={{ color: 'var(--out-ink-dim)' }}>══</span>
              <span style={{ color: 'var(--out-ink)' }}>{r.credits}</span>
            </div>
            <button
              disabled
              className="mt-2 border px-4 py-2 text-[10px] uppercase tracking-widest opacity-30 cursor-not-allowed select-none"
              style={{ borderColor: 'var(--out-ink-dim)', color: 'var(--out-muted)' }}
            >
              BUY — TGE PENDING
            </button>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-[10px]" style={{ background: '#060b06' }}>
        {[
          { step: '01', title: 'ACQUIRE $OTR', body: 'Buy $OTR on the open market once the token is deployed after TGE.' },
          { step: '02', title: 'SEND TO DEPOSIT', body: 'Transfer $OTR to the OUTRIVE deposit address. Credits are applied per wallet automatically.' },
          { step: '03', title: 'CHAT UNLOCKED', body: '1 $OTR = 1 chat credit. Credits never expire. Use them at any time on any wallet.' },
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
    </div>
  );
}

function TokenInfoPanel() {
  const fields = [
    { label: 'TICKER',       val: '$OTR' },
    { label: 'CHAIN',        val: 'ROBINHOOD CHAIN (4663)' },
    { label: 'UTILITY',      val: 'AI CHAT CREDITS — 1 $OTR = 1 CHAT' },
    { label: 'FREE TIER',    val: '10 FREE CHATS PER WALLET — NO $OTR NEEDED' },
    { label: 'TGE',          val: 'PENDING — DATE NOT YET ANNOUNCED' },
    { label: 'DISTRIBUTION', val: 'COMMUNITY-FIRST — DETAILS PENDING TGE' },
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
            <span className="text-[10px] font-bold text-right" style={{ color: 'var(--out-text)' }}>{val}</span>
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
        before any purchase.
      </div>
    </div>
  );
}

export function OutrivePage() {
  const { address } = useAccount();

  const { data: credits, isLoading } = useQuery<CreditInfo | null>({
    queryKey: ['credits', address],
    queryFn: () => fetchCredits(address!),
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

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
              <div className="text-[18px] font-bold leading-none font-mono" style={{
                color: 'var(--out-ink)',
                fontFamily: "'Space Grotesk', sans-serif",
              }}>
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
            <span style={{ color: 'var(--out-ink)', fontWeight: 700 }}>1 $OTR</span> = 1 additional chat credit
          </div>
        </div>

        {!address ? (
          <ConnectPrompt />
        ) : isLoading ? (
          <div className="py-12 text-center font-mono text-[10px] uppercase tracking-widest"
            style={{ color: 'var(--out-muted)' }}>
            READING CHAIN…
          </div>
        ) : credits != null ? (
          <CreditDashboard credits={credits} />
        ) : null}
      </Sheet>

      {/* ── SHEET B — BUY CREDITS ── */}
      <Sheet dwgNo="OUT-OTR-02" figCaption="FIG. 02 — CREDIT PURCHASE · $OTR TOKEN">
        <ComingSoonPanel />
      </Sheet>

      {/* ── SHEET C — TOKEN INFO ── */}
      <Sheet dwgNo="OUT-OTR-03" figCaption="FIG. 03 — TOKEN SPECIFICATIONS · $OTR">
        <TokenInfoPanel />
      </Sheet>

    </div>
  );
}
