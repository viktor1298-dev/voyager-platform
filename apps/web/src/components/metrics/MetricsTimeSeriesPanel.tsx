'use client'

import { useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { TimeRangeSelector } from './TimeRangeSelector'
import { AutoRefreshToggle } from './AutoRefreshToggle'
import { MetricsAreaChart } from './MetricsAreaChart'
import { NodeResourceBreakdown } from './NodeResourceBreakdown'
import { MetricsEmptyState } from './MetricsEmptyState'
import { useMetricsPreferences } from '@/stores/metrics-preferences'
import { Skeleton } from '@/components/ui/skeleton'

interface MetricsTimeSeriesPanelProps {
  clusterId: string
  isLive?: boolean
}

export function MetricsTimeSeriesPanel({ clusterId, isLive = false }: MetricsTimeSeriesPanelProps) {
  const { range, autoRefresh, refreshInterval, setRange, setAutoRefresh, setRefreshInterval } =
    useMetricsPreferences()

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

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Resource Metrics</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            CPU · Memory · Pods over time
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AutoRefreshToggle
            enabled={autoRefresh}
            interval={refreshInterval}
            onToggle={setAutoRefresh}
            onIntervalChange={setRefreshInterval}
          />
          <TimeRangeSelector value={range} onChange={setRange} />
        </div>
      </div>

      {/* Chart area */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
        {isLoading ? (
          <div className="space-y-2" style={{ height: 280 }}>
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        ) : data.length === 0 ? (
          <MetricsEmptyState />
        ) : (
          <MetricsAreaChart data={data} range={range} activeMetrics={['cpu', 'memory', 'pods']} />
        )}
      </div>

      {/* Node breakdown — only if live and data exists */}
      {isLive && nodes.length > 0 && (
        <NodeResourceBreakdown nodes={nodes} />
      )}

      {/* Last updated */}
      {historyQuery.dataUpdatedAt > 0 && (
        <p className="text-[10px] text-[var(--color-text-dim)] font-mono text-right">
          Last updated: {new Date(historyQuery.dataUpdatedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}
