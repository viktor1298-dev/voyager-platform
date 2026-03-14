'use client'

import { cn } from '@/lib/utils'

export type MetricsRange = '30s' | '1m' | '5m' | '1h' | '6h' | '24h' | '7d'

interface TimeRangeSelectorProps {
  value: MetricsRange
  onChange: (range: MetricsRange) => void
  className?: string
}

const RANGES: { value: MetricsRange; label: string }[] = [
  { value: '30s', label: '30s' },
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
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
