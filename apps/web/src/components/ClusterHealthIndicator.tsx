'use client'

/**
 * ClusterHealthIndicator — IA-007
 * Reusable component: colored dot + rich tooltip + optional latency badge + optional onCheck callback.
 * Used by ClusterCard (page.tsx) and ClusterHealthWidget.
 */

import { useCallback, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { m } from 'motion/react'
import { trpc } from '@/lib/trpc'
import { HEALTH_STATUS_REFETCH_MS } from '@/lib/cluster-constants'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

function timeAgo(ts: string | Date | null | undefined): string {
  if (!ts) return 'Never'
  const diff = Date.now() - new Date(ts).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const STATUS_COLORS: Record<string, string> = {
  healthy: 'var(--color-status-active)',
  degraded: 'var(--color-status-warning)',
  critical: 'var(--color-status-error)',
}

interface ClusterHealthIndicatorProps {
  clusterId: string
  size?: 'sm' | 'md'
  showLatency?: boolean
  onCheck?: (clusterId: string) => void
}

export function ClusterHealthIndicator({
  clusterId,
  size = 'sm',
  showLatency = false,
  onCheck,
}: ClusterHealthIndicatorProps) {
  const [checking, setChecking] = useState(false)
  const utils = trpc.useUtils()

  const statusQuery = trpc.health.status.useQuery({}, {
    refetchInterval: HEALTH_STATUS_REFETCH_MS,
  })
  const entry = statusQuery.data?.find((s) => s.clusterId === clusterId)

  const handleCheck = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setChecking(true)
    try {
      await utils.health.check.fetch({ clusterId })
      await utils.health.status.invalidate()
      onCheck?.(clusterId)
    } finally {
      setChecking(false)
    }
  }, [utils, clusterId, onCheck])

  if (!entry || entry.status === 'unknown') return null

  const color = STATUS_COLORS[entry.status] ?? 'var(--color-text-dim)'
  const statusLabel = entry.status.charAt(0).toUpperCase() + entry.status.slice(1)
  const dotSize = size === 'md' ? 'h-2.5 w-2.5' : 'h-1.5 w-1.5'

  const latencyColor =
    entry.responseTimeMs != null
      ? entry.responseTimeMs > 500
        ? 'var(--color-status-error)'
        : entry.responseTimeMs > 200
          ? 'var(--color-status-warning)'
          : 'var(--color-text-dim)'
      : 'var(--color-text-dim)'

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`${dotSize} rounded-full shrink-0 cursor-default`}
              style={{ backgroundColor: color }}
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-left">
            <div className="space-y-0.5 text-xs">
              <div className="font-semibold">{statusLabel}</div>
              <div className="text-[var(--color-text-muted)]">Last check: {timeAgo(entry.checkedAt)}</div>
              {entry.responseTimeMs != null && (
                <div className="text-[var(--color-text-muted)]">Response: {entry.responseTimeMs}ms</div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* IA-005: optional latency badge */}
      {showLatency && entry.responseTimeMs != null && (
        <m.span
          className="text-[9px] font-mono"
          style={{ color: latencyColor }}
          animate={{ color: latencyColor }}
          transition={{ duration: 0.3 }}
        >
          {entry.responseTimeMs}ms
        </m.span>
      )}

      {/* Optional check now button */}
      {onCheck !== undefined && (
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--color-accent)] hover:text-[var(--color-text-primary)] cursor-pointer disabled:opacity-40"
          title="Check now"
          onClick={handleCheck}
          disabled={checking}
        >
          <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
        </button>
      )}
    </span>
  )
}
