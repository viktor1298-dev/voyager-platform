'use client'

/**
 * ClusterHealthIndicator — IA-007
 * Reusable component: colored dot + rich tooltip + optional latency badge + optional onCheck callback.
 * Used by ClusterCard (page.tsx) and ClusterHealthWidget.
 */

import { useCallback, useState } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw, XCircle } from 'lucide-react'
import { motion } from 'motion/react'
import { trpc } from '@/lib/trpc'
import { HEALTH_STATUS_REFETCH_MS } from '@/lib/cluster-constants'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { timeAgo } from '@/lib/time-utils'
import { statusChangeTransition } from '@/lib/animation-constants'

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
  const iconSize = size === 'md' ? 'h-4 w-4' : 'h-3 w-3'

  /** Fix #4: Icon alongside color dot for accessibility — not color-only */
  const HealthStatusIcon = () => {
    switch (entry.status) {
      case 'healthy':
        return <CheckCircle2 className={`${iconSize} text-emerald-400`} aria-hidden="true" />
      case 'degraded':
        return <AlertTriangle className={`${iconSize} text-amber-400`} aria-hidden="true" />
      case 'critical':
        return <XCircle className={`${iconSize} text-red-400`} aria-hidden="true" />
      default:
        return <HelpCircle className={`${iconSize} text-[var(--color-text-dim)]`} aria-hidden="true" />
    }
  }

  // REVIEW-006: use healthDotVariants animation via animate prop (inline to avoid readonly TS issue)
  const dotScaleAnim = entry.status === 'degraded'
    ? [1, 1.3, 1]
    : entry.status === 'critical'
      ? [1, 1.5, 1]
      : 1

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
      <HealthStatusIcon />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* REVIEW-005: keyboard-focusable, screen-reader accessible */}
            {/* REVIEW-006: healthDotVariants — scale pulse on degraded/critical */}
            <motion.span
              className={`${dotSize} rounded-full shrink-0 cursor-default`}
              animate={{ backgroundColor: color, scale: dotScaleAnim }}
              transition={statusChangeTransition}
              tabIndex={0}
              role="status"
              aria-label={`Health: ${statusLabel}`}
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-left">
            <div className="space-y-0.5 text-xs">
              <div className="font-semibold">{statusLabel}</div>
              <div className="text-[var(--color-text-muted)]">Last check: {entry.checkedAt ? timeAgo(entry.checkedAt) : '—'}</div>
              {entry.responseTimeMs != null && (
                <div className="text-[var(--color-text-muted)]">Response: {entry.responseTimeMs}ms</div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* IA-005: optional latency badge */}
      {showLatency && entry.responseTimeMs != null && (
        <motion.span
          className="text-[9px] font-mono"
          style={{ color: latencyColor }}
          animate={{ color: latencyColor }}
          transition={{ duration: 0.3 }}
        >
          {entry.responseTimeMs}ms
        </motion.span>
      )}

      {/* Fix #4: "Check now" always visible at low opacity, full on hover — closer to health dot */}
      {onCheck !== undefined && (
        <button
          type="button"
          className="ml-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-transparent px-1 py-0.5 text-[9px] font-medium text-[var(--color-accent)] opacity-50 transition-all hover:border-[var(--color-accent)]/25 hover:bg-[var(--color-accent)]/10 hover:opacity-100 disabled:opacity-30"
          title="Check now"
          aria-label={`Run health check for cluster ${clusterId}`}
          onClick={handleCheck}
          disabled={checking}
        >
          <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Check</span>
        </button>
      )}
    </span>
  )
}
