import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-none border border-[var(--out-ink-dim)] bg-[#0C110C] px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--out-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--out-ink)] focus-visible:border-[var(--out-ink)] disabled:cursor-not-allowed disabled:opacity-50 text-[var(--out-text)] caret-[var(--out-ink)] font-mono",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
