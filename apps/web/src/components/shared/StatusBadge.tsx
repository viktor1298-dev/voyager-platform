'use client'

import { cn } from '@/lib/utils'

export type StatusType = 'healthy' | 'warning' | 'error' | 'unknown'

interface StatusBadgeProps {
  status: StatusType
  label?: string
  className?: string
  dot?: boolean
}

const STATUS_CONFIG: Record<StatusType, { label: string; classes: string; dotColor: string }> = {
  healthy: {
    label: 'Healthy',
    classes:
      'bg-[var(--color-status-active)]/15 text-[var(--color-status-active)] border border-[var(--color-status-active)]/30',
    dotColor: 'bg-[var(--color-status-active)]',
  },
  warning: {
    label: 'Warning',
    classes:
      'bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)] border border-[var(--color-status-warning)]/30',
    dotColor: 'bg-[var(--color-status-warning)]',
  },
  error: {
    label: 'Error',
    classes:
      'bg-[var(--color-status-error)]/15 text-[var(--color-status-error)] border border-[var(--color-status-error)]/30',
    dotColor: 'bg-[var(--color-status-error)]',
  },
  unknown: {
    label: 'Unknown',
    classes:
      'bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] border border-[var(--color-border)]',
    dotColor: 'bg-[var(--color-text-muted)]',
  },
}

/** Normalise any status string to one of our canonical StatusType values */
export function normaliseStatus(raw: string | null | undefined): StatusType {
  const s = (raw ?? '').toLowerCase()
  if (s === 'healthy' || s === 'active' || s === 'ready' || s === 'running') return 'healthy'
  if (s === 'warning' || s === 'degraded' || s === 'pending') return 'warning'
  if (s === 'error' || s === 'critical' || s === 'failed' || s === 'crashloopbackoff')
    return 'error'
  return 'unknown'
}

export function StatusBadge({ status, label, className, dot = false }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status]
  const displayLabel = label ?? cfg.label

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        cfg.classes,
        className,
      )}
      role="status"
      aria-label={`Status: ${displayLabel}`}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dotColor)} aria-hidden="true" />}
      {displayLabel}
    </span>
  )
}
