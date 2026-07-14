import React, { useState, useCallback } from 'react';

interface LaunchSuccessPanelProps {
  name: string;
  ticker: string;
  txHash: `0x${string}`;
  explorerBase: string;
  tokenAddress?: `0x${string}`;
  creatorAddress?: string;
  onDismiss: () => void;
}

function CopyRow({ label, value, href }: { label: string; value: string; href?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);

  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-[var(--out-grid-major)] last:border-b-0">
      <span className="text-[9px] uppercase tracking-[0.14em]" style={{ color: 'var(--out-muted)' }}>
        {label}
      </span>
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className="font-mono text-[11px] break-all"
          style={{ color: 'var(--out-ink)', letterSpacing: '0.04em' }}
        >
          {value}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={copy}
            className="text-[9px] uppercase tracking-widest border px-1.5 py-0.5 transition-colors"
            style={{
              borderColor: copied ? 'var(--out-ink)' : 'var(--out-grid-major)',
              color: copied ? 'var(--out-ink)' : 'var(--out-muted)',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            {copied ? 'COPIED ✓' : 'COPY'}
          </button>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[9px] uppercase tracking-widest transition-colors"
              style={{ color: 'var(--out-ink-dim)' }}
            >
              ↗ EXPLORER
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function LaunchSuccessPanel({
  name, ticker, txHash, explorerBase,
  tokenAddress, creatorAddress, onDismiss,
}: LaunchSuccessPanelProps) {
  const baseUrl = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

  return (
    <div className="my-4 border border-[var(--out-ink)] bg-[#060c06] font-mono text-xs w-full">

      {/* ── Header ── */}
      <div className="border-b border-[var(--out-ink)] px-4 py-2.5 flex items-center gap-3">
        <span className="text-[var(--out-ink)] uppercase tracking-[0.12em] font-bold text-[10px] sm:text-[11px] flex-1">
          ✓ COMMISSIONED ON-CHAIN — {name}&nbsp;(${ticker})
        </span>
        <button
          onClick={onDismiss}
          className="text-[var(--out-muted)] hover:text-[var(--out-ink)] text-[10px] tracking-widest uppercase transition-colors shrink-0"
        >
          DISMISS ×
        </button>
      </div>

      {/* ── Key fields ── */}
      <div className="px-4 pt-2 pb-3">
        {tokenAddress ? (
          <CopyRow
            label="TOKEN CONTRACT ADDRESS (CA)"
            value={tokenAddress}
            href={`${explorerBase}/token/${tokenAddress}`}
          />
        ) : (
          <div className="py-2 border-b border-[var(--out-grid-major)]">
            <span className="text-[9px] uppercase tracking-[0.14em]" style={{ color: 'var(--out-muted)' }}>
              TOKEN CONTRACT ADDRESS (CA)
            </span>
            <div className="mt-0.5 text-[10px] animate-pulse" style={{ color: 'var(--out-ink-dim)' }}>
              Extracting from receipt…
            </div>
          </div>
        )}

        {creatorAddress && (
          <CopyRow
            label="CREATOR WALLET"
            value={creatorAddress}
            href={`${explorerBase}/address/${creatorAddress}`}
          />
        )}

        <CopyRow
          label="LAUNCH TX"
          value={txHash}
          href={`${explorerBase}/tx/${txHash}`}
        />
      </div>

      {/* ── Action links ── */}
      <div className="border-t border-[var(--out-grid-major)] px-4 py-2.5 flex flex-wrap gap-4">
        <a
          href={`${baseUrl}/market?tab=newest`}
          className="text-[9px] uppercase tracking-widest transition-colors"
          style={{ color: 'var(--out-ink)' }}
        >
          ↗ VIEW IN MARKET (NEW TOKENS)
        </a>
        {tokenAddress && (
          <a
            href={`${explorerBase}/token/${tokenAddress}`}
            target="_blank" rel="noreferrer"
            className="text-[9px] uppercase tracking-widest transition-colors"
            style={{ color: 'var(--out-ink-dim)' }}
          >
            ↗ BLOCKSCOUT
          </a>
        )}
        <a
          href="https://app.virtuals.io"
          target="_blank" rel="noreferrer"
          className="text-[9px] uppercase tracking-widest transition-colors"
          style={{ color: 'var(--out-ink-dim)' }}
        >
          ↗ SET UP AGENT ON VIRTUALS
        </a>
      </div>

      <div className="px-4 pb-2.5 text-[9px]" style={{ color: 'var(--out-muted)' }}>
        Token is live on the bonding curve. Configure personality, runtime &amp; socials on app.virtuals.io.
      </div>
    </div>
  );
}
