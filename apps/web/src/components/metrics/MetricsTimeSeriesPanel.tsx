'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { TimeRangeSelector } from './TimeRangeSelector'
import { AutoRefreshToggle } from './AutoRefreshToggle'
import { MetricsAreaChart, type MetricKey } from './MetricsAreaChart'
import { NodeResourceBreakdown } from './NodeResourceBreakdown'
import { MetricsEmptyState } from './MetricsEmptyState'
import { useMetricsPreferences } from '@/stores/metrics-preferences'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface MetricsTimeSeriesPanelProps {
  clusterId: string
  isLive?: boolean
  /** Compact mode — show fewer controls, less padding (for Overview tab embed) */
  compact?: boolean
}

const METRIC_TOGGLES: { key: MetricKey; label: string; color: string }[] = [
  { key: 'cpu', label: 'CPU %', color: 'hsl(262,83%,58%)' },
  { key: 'memory', label: 'Memory %', color: 'hsl(199,89%,48%)' },
  { key: 'networkIn', label: 'Net In', color: 'hsl(38,92%,50%)' },
  { key: 'networkOut', label: 'Net Out', color: 'hsl(340,82%,52%)' },
  { key: 'pods', label: 'Pods', color: 'hsl(142,71%,45%)' },
]

export function MetricsTimeSeriesPanel({
  clusterId,
  isLive = false,
  compact = false,
}: MetricsTimeSeriesPanelProps) {
  const { range, autoRefresh, refreshInterval, setRange, setAutoRefresh, setRefreshInterval } =
    useMetricsPreferences()

  // Active metric toggles — default CPU + Memory
  const [activeMetrics, setActiveMetrics] = useState<MetricKey[]>(['cpu', 'memory'])

  const refetchInterval = autoRefresh ? refreshInterval : false

  const historyQuery = trpc.metrics.history.useQuery(
    { clusterId, range },
    {
      refetchInterval,
      staleTime: 30_000,
    },
  )

  const nodeQuery = trpc.metrics.nodeBreakdown.useQuery(
    { clusterId },
    {
      refetchInterval,
      staleTime: 30_000,
      enabled: isLive,
    },
  )

  const isLoading = historyQuery.isLoading
  const data = historyQuery.data ?? []
  const nodes = nodeQuery.data ?? []

  function toggleMetric(key: MetricKey) {
    setActiveMetrics((prev) =>
      prev.includes(key)
        ? prev.length > 1
          ? prev.filter((k) => k !== key)
          : prev // keep at least one active
        : [...prev, key],
    )
  }

  const chartHeight = compact ? 200 : 280

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className={cn('font-semibold text-[var(--color-text-primary)]', compact ? 'text-xs' : 'text-sm')}>
            Resource Metrics
          </h3>
          {!compact && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              CPU · Memory · Network I/O · Pods over time
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!compact && (
            <AutoRefreshToggle
              enabled={autoRefresh}
              interval={refreshInterval}
              onToggle={setAutoRefresh}
              onIntervalChange={setRefreshInterval}
            />
          )}
          <TimeRangeSelector value={range} onChange={setRange} />
        </div>
      </div>

      {/* Metric toggles */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {METRIC_TOGGLES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => toggleMetric(m.key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium border transition-all',
              activeMetrics.includes(m.key)
                ? 'border-transparent text-white'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-transparent',
            )}
            style={
              activeMetrics.includes(m.key)
                ? { background: m.color, borderColor: m.color }
                : undefined
            }
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: activeMetrics.includes(m.key) ? 'white' : m.color }}
            />
            {m.label}
          </button>
        ))}
      </div>

      {/* Chart area */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
        {isLoading ? (
          <div className="space-y-2" style={{ height: chartHeight }}>
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        ) : data.length === 0 ? (
          <MetricsEmptyState />
        ) : (
          <MetricsAreaChart
            data={data}
            range={range}
            activeMetrics={activeMetrics}
            height={chartHeight}
          />
        )}
      </div>

      {/* Node breakdown — only if live and data exists */}
      {isLive && nodes.length > 0 && !compact && (
        <NodeResourceBreakdown nodes={nodes} />
      )}

      {/* Last updated */}
      {historyQuery.dataUpdatedAt > 0 && !compact && (
        <p className="text-[10px] text-[var(--color-text-dim)] font-mono text-right">
          Last updated: {new Date(historyQuery.dataUpdatedAt).toLocaleTimeString()}
          {autoRefresh && (
            <span className="ml-2 text-[var(--color-accent)]">
              · Auto-refreshing every {refreshInterval / 1000}s
            </span>
          )}
        </p>
      )}
    </div>
  )
}
