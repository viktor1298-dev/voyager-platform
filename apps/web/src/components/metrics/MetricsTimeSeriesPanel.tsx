'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { trpc } from '@/lib/trpc'
import { TimeRangeSelector } from './TimeRangeSelector'
import { AutoRefreshToggle } from './AutoRefreshToggle'
import { MetricsAreaChart, type MetricKey, type MetricsDataPoint, getMetricConfig } from './MetricsAreaChart'
import { NodeResourceBreakdown } from './NodeResourceBreakdown'
import { MetricsEmptyState } from './MetricsEmptyState'
import { NodeMetricsTable } from './NodeMetricsTable'
import { useMetricsPreferences } from '@/stores/metrics-preferences'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const LOADING_TIMEOUT_MS = 30_000

interface MetricsTimeSeriesPanelProps {
  clusterId: string
  isLive?: boolean
  compact?: boolean
}

const PANEL_METRICS: Array<{ id: 'cpu' | 'memory' | 'network' | 'pods'; title: string; description: string; metrics: MetricKey[] }> = [
  {
    id: 'cpu',
    title: 'CPU Utilization',
    description: 'Cluster CPU usage percentage over time.',
    metrics: ['cpu'],
  },
  {
    id: 'memory',
    title: 'Memory Utilization',
    description: 'Cluster memory usage percentage over time.',
    metrics: ['memory'],
  },
  {
    id: 'network',
    title: 'Network I/O',
    description: 'Inbound and outbound traffic rendered on a bytes scale.',
    metrics: ['networkIn', 'networkOut'],
  },
  {
    id: 'pods',
    title: 'Pods',
    description: 'Observed pod count over time.',
    metrics: ['pods'],
  },
]

const DEFAULT_VISIBLE_SERIES: MetricKey[] = ['cpu', 'memory', 'networkIn', 'networkOut', 'pods']

function normalizeHistory(data: MetricsDataPoint[] | undefined) {
  return data ?? []
}

export function MetricsTimeSeriesPanel({
  clusterId,
  isLive = false,
  compact = false,
}: MetricsTimeSeriesPanelProps) {
  const { range, autoRefresh, refreshInterval, setRange, setAutoRefresh, setRefreshInterval } =
    useMetricsPreferences()

  const [visibleSeries, setVisibleSeries] = useState<Record<MetricKey, boolean>>({
    cpu: true,
    memory: true,
    networkIn: true,
    networkOut: true,
    pods: true,
  })

  const refetchInterval = autoRefresh ? refreshInterval : false

  const historyQuery = trpc.metrics.history.useQuery(
    { clusterId, range },
    {
      refetchInterval,
      staleTime: 30_000,
      retry: 2,
      retryDelay: 3000,
    },
  )

  const nodeQuery = trpc.metrics.nodeBreakdown.useQuery(
    { clusterId },
    {
      refetchInterval,
      staleTime: 30_000,
      enabled: isLive,
      retry: 1,
    },
  )

  const isLoading = historyQuery.isLoading
  const isError = historyQuery.isError
  const nodes = nodeQuery.data ?? []

  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
  const loadingStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (isLoading && !loadingStartRef.current) {
      loadingStartRef.current = Date.now()
      setLoadingTimedOut(false)
      const timer = setTimeout(() => setLoadingTimedOut(true), LOADING_TIMEOUT_MS)
      return () => clearTimeout(timer)
    }
    if (!isLoading) {
      loadingStartRef.current = null
      setLoadingTimedOut(false)
    }
  }, [isLoading])

  useEffect(() => {
    setVisibleSeries((prev) => {
      const next = { ...prev }
      for (const metric of DEFAULT_VISIBLE_SERIES) {
        if (typeof next[metric] !== 'boolean') next[metric] = true
      }
      return next
    })
  }, [])

  const normalizedData = useMemo(
    () => normalizeHistory(historyQuery.data as MetricsDataPoint[] | undefined),
    [historyQuery.data],
  )

  const handleRetry = () => {
    setLoadingTimedOut(false)
    loadingStartRef.current = null
    historyQuery.refetch()
  }

  function toggleMetric(key: MetricKey) {
    setVisibleSeries((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const chartHeight = compact ? 200 : 240
  const panelSkeletonHeight = compact ? 200 : 240
  const hasAnyVisibleSeries = Object.values(visibleSeries).some(Boolean)
  const noVisiblePanels = PANEL_METRICS.every((panel) => panel.metrics.every((metric) => !visibleSeries[metric]))

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className={cn('font-semibold text-[var(--color-text-primary)]', compact ? 'text-xs' : 'text-sm')}>
            Resource Metrics
          </h3>
          {!compact && (
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Dedicated CPU, Memory, Network I/O, and Pods panels with synchronized range controls.
            </p>
          )}
        </div>
        {!compact ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">Refresh</span>
              <AutoRefreshToggle
                enabled={autoRefresh}
                interval={refreshInterval}
                onToggle={setAutoRefresh}
                onIntervalChange={setRefreshInterval}
              />
            </div>
            <div className="h-8 w-px bg-[var(--color-border)] hidden sm:block" aria-hidden="true" />
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">Time Range</span>
              <TimeRangeSelector value={range} onChange={setRange} />
            </div>
          </div>
        ) : (
          <TimeRangeSelector value={range} onChange={setRange} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {DEFAULT_VISIBLE_SERIES.map((metricKey) => {
          const config = getMetricConfig(metricKey)
          const active = visibleSeries[metricKey]
          return (
            <button
              key={metricKey}
              type="button"
              onClick={() => toggleMetric(metricKey)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-mono font-medium transition-all',
                active
                  ? 'border-transparent text-white'
                  : 'border-[var(--color-border)] bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
              )}
              style={active ? { background: config.color, borderColor: config.color } : undefined}
              aria-pressed={active}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: active ? 'white' : config.color }}
              />
              {config.label}
            </button>
          )
        })}
      </div>

      {isError ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <MetricsEmptyState
            status="error"
            message="Failed to load metrics"
            detail={historyQuery.error?.message ?? 'An unexpected error occurred while fetching metrics data.'}
            onRetry={handleRetry}
          />
        </div>
      ) : isLoading && loadingTimedOut ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <MetricsEmptyState
            status="unavailable"
            message="Unable to collect metrics"
            detail="Metrics server may not be available or is taking too long to respond."
            onRetry={handleRetry}
          />
        </div>
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {PANEL_METRICS.map((panel) => (
            <div key={panel.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
              <Skeleton className="mb-3 h-4 w-40 rounded" />
              <Skeleton className="mb-2 h-3 w-56 rounded" />
              <Skeleton className="w-full rounded-lg" style={{ height: panelSkeletonHeight }} />
            </div>
          ))}
        </div>
      ) : normalizedData.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <MetricsEmptyState status="empty" onRetry={handleRetry} />
        </div>
      ) : !hasAnyVisibleSeries || noVisiblePanels ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <MetricsEmptyState
            status="empty"
            message="No visible metrics"
            detail="Enable at least one metric series above to render a panel."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {PANEL_METRICS.map((panel) => {
            const activeMetrics = panel.metrics.filter((metric) => visibleSeries[metric])
            if (activeMetrics.length === 0) return null

            return (
              <section
                key={`${panel.id}-${range}-${activeMetrics.join('-')}`}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">{panel.title}</h4>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">{panel.description}</p>
                  </div>
                </div>

                <MetricsAreaChart
                  data={normalizedData}
                  range={range}
                  activeMetrics={activeMetrics}
                  height={chartHeight}
                />
              </section>
            )
          })}
        </div>
      )}

      {/* MX-005: Per-node metrics table from nodeTimeSeries route (Dima's new route) */}
      {!compact && (
        <NodeMetricsTable clusterId={clusterId} range={range} />
      )}

      {isLive && nodes.length > 0 && !compact && <NodeResourceBreakdown nodes={nodes} />}

      {/* Last updated */}
      {historyQuery.dataUpdatedAt > 0 && !compact && (
        <p className="text-right font-mono text-xs text-[var(--color-text-dim)]">
          Last updated: {new Date(historyQuery.dataUpdatedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
          {autoRefresh && (
            <span className="ml-2 text-[var(--color-accent)]">· Auto-refreshing every {refreshInterval / 1000}s</span>
          )}
        </p>
      )}
    </div>
  )
}
