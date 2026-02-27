import { cn } from '@/lib/utils'
import { type VariantProps, cva } from 'class-variance-authority'
import type * as React from 'react'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-zinc-50 text-zinc-900',
        secondary: 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-badge-label)]',
        destructive: 'border-red-800/40 bg-red-950/60 text-red-300',
        success: 'border-emerald-800/40 bg-emerald-950/60 text-emerald-300',
        warning: 'border-amber-800/40 bg-amber-950/60 text-amber-300',
        outline: 'border-[var(--color-border)] text-[var(--color-badge-label)]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
