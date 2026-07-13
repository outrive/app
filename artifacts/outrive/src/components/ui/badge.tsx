import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-none px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--out-ink)] focus:ring-offset-2 uppercase tracking-[0.08em]",
  {
    variants: {
      variant: {
        active:
          "border border-[var(--out-ink)] text-[var(--out-ink)] bg-transparent",
        locked:
          "border border-dashed border-[var(--out-muted)] text-[var(--out-muted)] bg-transparent",
        pending:
          "border border-[var(--out-warn)] text-[var(--out-warn)] bg-transparent",
        failed:
          "border border-[var(--out-danger)] text-[var(--out-danger)] bg-transparent",
        default:
          "border border-[var(--out-ink-dim)] text-[var(--out-text)] bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
