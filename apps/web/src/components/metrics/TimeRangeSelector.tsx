'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

export type MetricsRange =
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '3h'
  | '6h'
  | '12h'
  | '24h'
  | '2d'
  | '7d'
  | 'custom'

/** Backend-compatible range type (excludes 'custom' which is client-only). */
export type ApiMetricsRange = Exclude<MetricsRange, 'custom'>

interface TimeRangeSelectorProps {
  value: MetricsRange
  onChange: (range: MetricsRange) => void
  customFrom?: string | null
  customTo?: string | null
  onCustomRange?: (from: string, to: string) => void
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

/** Convert an ISO string to datetime-local input value (YYYY-MM-DDTHH:mm). */
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Get a default "last 1 hour" window for the custom picker. */
function getDefaultWindow(): { from: string; to: string } {
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  return {
    from: toDatetimeLocal(oneHourAgo.toISOString()),
    to: toDatetimeLocal(now.toISOString()),
  }
}

export function TimeRangeSelector({
  value,
  onChange,
  customFrom,
  customTo,
  onCustomRange,
  className,
}: TimeRangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(false)
  const [fromValue, setFromValue] = useState('')
  const [toValue, setToValue] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on click outside
  useEffect(() => {
    if (!showCustom) return

    const handleMouseDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCustom(false)
        setValidationError(null)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [showCustom])

  const handlePresetClick = useCallback(
    (range: MetricsRange) => {
      setShowCustom(false)
      setValidationError(null)
      onChange(range)
    },
    [onChange],
  )

  const handleCustomToggle = useCallback(() => {
    if (showCustom) {
      setShowCustom(false)
      setValidationError(null)
      return
    }

    // Pre-fill inputs with existing custom range or default last 1h
    if (customFrom && customTo) {
      setFromValue(toDatetimeLocal(customFrom))
      setToValue(toDatetimeLocal(customTo))
    } else {
      const defaults = getDefaultWindow()
      setFromValue(defaults.from)
      setToValue(defaults.to)
    }
    setValidationError(null)
    setShowCustom(true)
  }, [showCustom, customFrom, customTo])

  const handleApply = useCallback(() => {
    if (!fromValue || !toValue) {
      setValidationError('Both dates are required.')
      return
    }
    const fromDate = new Date(fromValue)
    const toDate = new Date(toValue)
    if (fromDate >= toDate) {
      setValidationError('Start must be before end.')
      return
    }

    setValidationError(null)
    setShowCustom(false)
    onCustomRange?.(fromDate.toISOString(), toDate.toISOString())
  }, [fromValue, toValue, onCustomRange])

  const handleCancel = useCallback(() => {
    setShowCustom(false)
    setValidationError(null)
  }, [])

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      <div
        className="inline-flex flex-wrap items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-0.5 gap-0.5"
        role="tablist"
        aria-label="Metrics time range"
      >
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => handlePresetClick(r.value)}
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

        {/* Custom button */}
        <button
          type="button"
          onClick={handleCustomToggle}
          role="tab"
          aria-selected={value === 'custom'}
          aria-expanded={showCustom}
          className={cn(
            'px-3 py-1 rounded-md text-xs font-mono font-medium transition-all',
            value === 'custom'
              ? 'bg-[var(--color-accent)] text-white shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5',
          )}
        >
          Custom
        </button>
      </div>

      {/* Custom date picker dropdown */}
      {showCustom && (
        <div className="absolute right-0 top-full z-10 mt-2 w-80 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 shadow-lg">
          <div className="space-y-3">
            <div>
              <label
                htmlFor="metrics-custom-from"
                className="mb-1 block text-xs font-mono text-[var(--color-text-secondary)]"
              >
                From
              </label>
              <input
                id="metrics-custom-from"
                type="datetime-local"
                value={fromValue}
                onChange={(e) => {
                  setFromValue(e.target.value)
                  setValidationError(null)
                }}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="metrics-custom-to"
                className="mb-1 block text-xs font-mono text-[var(--color-text-secondary)]"
              >
                To
              </label>
              <input
                id="metrics-custom-to"
                type="datetime-local"
                value={toValue}
                onChange={(e) => {
                  setToValue(e.target.value)
                  setValidationError(null)
                }}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] transition-colors"
              />
            </div>

            {validationError && (
              <p className="text-xs text-[var(--color-error)]">{validationError}</p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:opacity-90"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
