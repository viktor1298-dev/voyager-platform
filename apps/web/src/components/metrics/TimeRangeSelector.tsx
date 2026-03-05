'use client'

import { cn } from '@/lib/utils'

export type MetricsRange = '1h' | '6h' | '24h' | '7d'

interface TimeRangeSelectorProps {
  value: MetricsRange
  onChange: (range: MetricsRange) => void
  className?: string
}

const RANGES: { value: MetricsRange; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
]

export function TimeRangeSelector({ value, onChange, className }: TimeRangeSelectorProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-0.5 gap-0.5',
        className,
      )}
    >
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
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
