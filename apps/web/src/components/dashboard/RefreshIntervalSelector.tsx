'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { REFRESH_INTERVALS, type RefreshIntervalMs } from '@/hooks/useRefreshInterval'

interface RefreshIntervalSelectorProps {
  intervalMs: RefreshIntervalMs
  onChange: (next: RefreshIntervalMs) => void
  /** When true, show the pulsing LIVE indicator (data is fresh) */
  isLive?: boolean
  className?: string
}

/**
 * FEAT-192-001 — Live refresh interval selector with pulsing LIVE badge.
 * Renders a segmented-control-style dropdown for 30s / 1m / 5m / 15m / 30m / 1h.
 * Persists to localStorage via the useRefreshInterval hook (called from parent).
 */
export function RefreshIntervalSelector({
  intervalMs,
  onChange,
  isLive = false,
  className,
}: RefreshIntervalSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const current = REFRESH_INTERVALS.find((r) => r.value === intervalMs) ?? REFRESH_INTERVALS[2]

  return (
    <div ref={ref} className={cn('flex items-center gap-2', className)}>
      {/* LIVE pulsing indicator */}
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-300',
          isLive
            ? 'bg-[var(--color-status-healthy)]/15 text-[var(--color-status-healthy)] border border-[var(--color-status-healthy)]/30'
            : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-dim)] border border-[var(--color-border)]',
        )}
        title={isLive ? 'Data is live and up to date' : 'Waiting for refresh'}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full shrink-0',
            isLive ? 'animate-pulse' : 'opacity-40',
          )}
          style={{
            backgroundColor: isLive ? 'var(--color-status-healthy)' : 'var(--color-text-dim)',
          }}
        />
        LIVE
      </div>

      {/* Interval selector dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
            'border border-[var(--color-border)] bg-[var(--color-bg-card)]',
            'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            'hover:bg-[var(--color-bg-card-hover)] hover:border-[var(--color-border-hover)]',
            'transition-all duration-150',
          )}
          aria-label="Select refresh interval"
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <RefreshCw className="h-3 w-3 opacity-70" />
          <span>{current.label}</span>
          <ChevronDown
            className={cn(
              'h-3 w-3 opacity-60 transition-transform duration-150',
              open && 'rotate-180',
            )}
          />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label="Refresh interval options"
            className={cn(
              'absolute right-0 top-full mt-1 z-50 min-w-[96px]',
              'rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-xl',
              'overflow-hidden',
            )}
          >
            {REFRESH_INTERVALS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === intervalMs}
                onClick={() => {
                  onChange(opt.value as RefreshIntervalMs)
                  setOpen(false)
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-xs transition-colors',
                  opt.value === intervalMs
                    ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-semibold'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]',
                )}
              >
                <span>{opt.label}</span>
                {opt.value === intervalMs && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
