'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface CTAButton {
  label: string
  onClick?: () => void
  href?: string
  variant?: 'primary' | 'secondary'
}

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  /** Call-to-action button */
  cta?: CTAButton
  className?: string
}

export function EmptyState({ icon, title, description, cta, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] py-16 px-6 text-center',
        className,
      )}
    >
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] opacity-60">
          {icon}
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-[var(--color-text-muted)] max-w-xs">{description}</p>
        )}
      </div>

      {cta && (
        <>
          {cta.href ? (
            <a
              href={cta.href}
              className={cn(
                'mt-1 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                cta.variant === 'secondary'
                  ? 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
                  : 'bg-[var(--color-brand)] text-white hover:opacity-90',
              )}
            >
              {cta.label}
            </a>
          ) : (
            <button
              onClick={cta.onClick}
              className={cn(
                'mt-1 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                cta.variant === 'secondary'
                  ? 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
                  : 'bg-[var(--color-brand)] text-white hover:opacity-90',
              )}
            >
              {cta.label}
            </button>
          )}
        </>
      )}
    </div>
  )
}
