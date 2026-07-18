import React from 'react';
import { cn } from '@/lib/utils';

export interface SheetProps extends React.HTMLAttributes<HTMLDivElement> {
  dwgNo: string;
  rev?: string;
  figCaption?: string;
  children: React.ReactNode;
}

export function Sheet({ dwgNo, rev = 'A', figCaption, children, className, ...props }: SheetProps) {
  return (
    <div
      className={cn(
        'relative border-[1px] border-[var(--out-ink)] bg-[var(--out-bg-sheet)] rounded-none flex flex-col',
        className,
      )}
      {...props}
    >

      {/* Header strip — responsive: abbreviated on mobile, full on sm+ */}
      <div className="flex justify-between items-center gap-3 border-b-[1px] border-[var(--out-ink)] px-3 sm:px-4 py-1.5 shrink-0">
        <div className="text-[9px] sm:text-[10px] text-[var(--out-ink)] tracking-[0.08em] uppercase whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
          {/* Mobile: just the dwgNo */}
          <span className="sm:hidden">{dwgNo}</span>
          {/* sm+: full engineering title block */}
          <span className="hidden sm:inline">
            DWG NO. {dwgNo} &nbsp;&nbsp; SHEET 1/1 &nbsp;&nbsp; SCALE 1:1
          </span>
        </div>
        <div className="text-[9px] sm:text-[10px] text-[var(--out-ink)] tracking-[0.08em] uppercase shrink-0">
          REV. {rev}
        </div>
      </div>

      {/* Content */}
      <div className="p-3 sm:p-4 flex-1 flex flex-col relative z-10">
        {children}
      </div>

    </div>
  );
}
