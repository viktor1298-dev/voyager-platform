import { cn } from '@/lib/utils'
import { type VariantProps, cva } from 'class-variance-authority'
import type * as React from 'react'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-zinc-50 text-zinc-900',
        secondary: 'border-transparent bg-zinc-800 text-zinc-50',
        destructive: 'border-transparent bg-red-900 text-red-50',
        success: 'border-transparent bg-emerald-900 text-emerald-50',
        warning: 'border-transparent bg-amber-900 text-amber-50',
        outline: 'text-zinc-50 border-zinc-700',
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
