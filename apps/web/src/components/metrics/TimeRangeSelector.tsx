'use client'

import { cn } from '@/lib/utils'

export type MetricsRange = '5m' | '15m' | '30m' | '1h' | '3h' | '6h' | '12h' | '24h' | '2d' | '7d'

interface TimeRangeSelectorProps {
  value: MetricsRange
  onChange: (range: MetricsRange) => void
  className?: string
}

const RANGES: { value: MetricsRange; label: string }[] = [
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
  { value: '3h', label: '3h' },
  { value: '6h', label: '6h' },
  { value: '12h', label: '12h' },
  { value: '24h', label: '24h' },
  { value: '2d', label: '2d' },
  { value: '7d', label: '7d' },
]

export function TimeRangeSelector({ value, onChange, className }: TimeRangeSelectorProps) {
  return (
    <div
      className={cn(
        'inline-flex flex-wrap items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-0.5 gap-0.5',
        className,
      )}
      role="tablist"
      aria-label="Metrics time range"
    >
      {RANGES.map((r) => (
        <button
          key={r.value}
          type="button"
          onClick={() => onChange(r.value)}
          role="tab"
          aria-selected={value === r.value}
          className={cn(
            'px-3 py-1 rounded-md text-xs font-mono font-medium transition-all',
            value === r.value
              ? 'bg-[var(--color-accent)] text-white shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5',
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}
