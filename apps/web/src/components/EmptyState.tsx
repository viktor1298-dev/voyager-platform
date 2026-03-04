'use client'

import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  /** Alias for action — renders a CTA button */
  cta?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon, title, description, action, cta }: EmptyStateProps) {
  const btn = action ?? cta
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] py-16 px-6 text-center">
      {icon && <div className="mb-4 text-[var(--color-text-dim)] opacity-40">{icon}</div>}
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-[var(--color-text-muted)] max-w-sm">{description}</p>
      )}
      {btn && (
        <button
          type="button"
          onClick={btn.onClick}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          {btn.label}
        </button>
      )}
    </div>
  )
}
