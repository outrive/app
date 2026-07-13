import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--out-ink)] focus-visible:ring-offset-[var(--out-bg)] disabled:pointer-events-none disabled:opacity-50 uppercase tracking-[0.08em] rounded-none",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--out-accent-fill)] text-[#0A0E0A] hover:brightness-110 hover:shadow-[0_0_12px_rgba(200,255,22,0.25)]",
        destructive:
          "bg-[var(--out-danger)] text-[#0A0E0A] hover:brightness-110 hover:shadow-[0_0_12px_rgba(255,92,92,0.25)]",
        outline:
          "border border-[var(--out-ink)] bg-transparent text-[var(--out-ink)] hover:bg-[rgba(200,255,22,0.1)]",
        secondary:
          "border border-[var(--out-ink-dim)] bg-transparent text-[var(--out-ink-dim)] hover:text-[var(--out-ink)] hover:border-[var(--out-ink)]",
        ghost: "hover:bg-[rgba(200,255,22,0.1)] text-[var(--out-text)]",
        link: "text-[var(--out-ink)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
