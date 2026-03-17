'use client'

import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RefreshInterval = 30000 | 60000 | 300000

interface AutoRefreshToggleProps {
  enabled: boolean
  interval: RefreshInterval
  onToggle: (enabled: boolean) => void
  onIntervalChange: (interval: RefreshInterval) => void
  className?: string
}

const INTERVALS: { value: RefreshInterval; label: string }[] = [
  { value: 30000, label: '30s' },
  { value: 60000, label: '1m' },
  { value: 300000, label: '5m' },
]

export function AutoRefreshToggle({
  enabled,
  interval,
  onToggle,
  onIntervalChange,
  className,
}: AutoRefreshToggleProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono font-medium transition-all',
          enabled
            ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]'
            : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
        )}
      >
        <RefreshCw className={cn('h-3 w-3', enabled && 'animate-spin [animation-duration:3s]')} />
        Auto
      </button>
      {enabled && (
        <div className="flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
          {INTERVALS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onIntervalChange(item.value)}
              className={cn(
                'px-2 py-1 text-xs font-mono transition-all',
                interval === item.value
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
