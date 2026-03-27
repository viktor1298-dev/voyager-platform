import { cn } from '@/lib/utils'
import { type VariantProps, cva } from 'class-variance-authority'
import type * as React from 'react'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]',
        secondary:
          'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-badge-label)]',
        destructive:
          'border-[var(--color-status-error)]/20 bg-[var(--color-status-error)]/10 text-[var(--color-status-error)]',
        success:
          'border-[var(--color-status-healthy)]/20 bg-[var(--color-status-healthy)]/10 text-[var(--color-status-healthy)]',
        warning:
          'border-[var(--color-status-warning)]/20 bg-[var(--color-status-warning)]/10 text-[var(--color-status-warning)]',
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
