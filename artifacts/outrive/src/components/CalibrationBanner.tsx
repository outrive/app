import React from 'react';
import { useGetSystemStatus } from '@workspace/api-client-react';

export function CalibrationBanner() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: status } = useGetSystemStatus({ query: { refetchInterval: 30_000 } as any });

  if (!status || status.calibrated) return null;

  const msg = status.calibrationMessage ?? 'Set VIRTUALS_FACTORY_ADDRESS to enable launches.';

  return (
    <div
      className="w-full font-mono text-[9px] sm:text-[10px] uppercase tracking-widest px-3 sm:px-4 py-1.5 flex items-center gap-2 sm:gap-3 overflow-hidden"
      style={{
        borderBottom: '1px solid var(--out-warn)',
        background: '#1a1200',
        color: 'var(--out-warn)',
        minHeight: 30,
      }}
    >
      {/* Icon always visible */}
      <span className="font-bold shrink-0">⚠</span>

      {/* Label — abbreviated on mobile */}
      <span className="font-bold shrink-0">
        <span className="hidden sm:inline">CALIBRATION </span>REQUIRED
      </span>

      <span className="shrink-0 text-[var(--out-ink-dim)]">—</span>

      {/* Message — truncated on mobile */}
      <span
        className="flex-1 min-w-0 truncate"
        style={{ color: 'var(--out-warn)', opacity: 0.8 }}
      >
        {msg}
      </span>

      {/* Trailing badge — hidden on mobile */}
      <span className="hidden md:inline shrink-0 ml-2" style={{ color: 'var(--out-muted)' }}>
        READ-ONLY MODE ACTIVE
      </span>
    </div>
  );
}
