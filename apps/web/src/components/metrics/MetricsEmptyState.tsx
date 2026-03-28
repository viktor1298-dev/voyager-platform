'use client'

import { Activity, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

type MetricsStatus = 'loading' | 'error' | 'unavailable' | 'empty'

interface MetricsEmptyStateProps {
  /** Display message */
  message?: string
  /** Status determines which icon/style to show */
  status?: MetricsStatus
  /** Error detail (shown as secondary text) */
  detail?: string | null
  /** Retry callback — shows a retry button when provided */
  onRetry?: () => void
  /** Compact mode for in-panel usage (smaller padding, no large icon) */
  compact?: boolean
}

export function MetricsEmptyState({
  message,
  status = 'loading',
  detail,
  onRetry,
  compact = false,
}: MetricsEmptyStateProps) {
  const isError = status === 'error' || status === 'unavailable'

  const defaultMessage = isError ? 'Unable to collect metrics' : 'Collecting metrics data...'

  const defaultDetail = isError
    ? 'Metrics server may not be available or the cluster is unreachable.'
    : 'Metrics will appear as data is collected from the cluster'

  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-4', compact ? 'py-8' : 'py-16')}
    >
      {compact ? (
        <div className="flex items-center justify-center">
          {isError ? (
            <AlertTriangle className="h-4 w-4 text-[var(--color-status-error,hsl(0,72%,51%))]" />
          ) : (
            <Activity className="h-4 w-4 text-[var(--color-chart-cpu)]" />
          )}
        </div>
      ) : (
        <div className="relative flex items-center justify-center">
          {isError ? (
            <div className="relative flex items-center justify-center h-14 w-14 rounded-full bg-[var(--color-status-error,hsl(0,72%,51%))]/15 border border-[var(--color-status-error,hsl(0,72%,51%))]/30">
              <AlertTriangle className="h-6 w-6 text-[var(--color-status-error,hsl(0,72%,51%))]" />
            </div>
          ) : (
            <>
              <div className="absolute h-20 w-20 rounded-full bg-[var(--color-chart-cpu)]/10 animate-ping [animation-duration:2s]" />
              <div className="relative flex items-center justify-center h-14 w-14 rounded-full bg-[var(--color-chart-cpu)]/15 border border-[var(--color-chart-cpu)]/30">
                <Activity className="h-6 w-6 text-[var(--color-chart-cpu)]" />
              </div>
            </>
          )}
        </div>
      )}
      <div className="text-center max-w-sm">
        <p
          className={cn(
            'font-medium',
            compact ? 'text-xs' : 'text-sm',
            isError
              ? 'text-[var(--color-status-error,hsl(0,72%,51%))]'
              : 'text-[var(--color-text-primary)]',
          )}
        >
          {message ?? defaultMessage}
        </p>
        <p
          className={cn('text-[var(--color-text-muted)] mt-1', compact ? 'text-[10px]' : 'text-xs')}
        >
          {detail ?? defaultDetail}
        </p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
            'border border-[var(--color-border)] bg-[var(--color-bg-card)]',
            'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]',
            'transition-colors cursor-pointer',
          )}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      )}
    </div>
  )
}
