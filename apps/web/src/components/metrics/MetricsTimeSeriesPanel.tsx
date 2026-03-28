'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { TimeRangeSelector, type ApiMetricsRange } from './TimeRangeSelector'
import { AutoRefreshToggle } from './AutoRefreshToggle'
import {
  MetricsAreaChart,
  METRIC_CONFIG,
  formatMetricValue,
  type MetricKey,
  type MetricsDataPoint,
  getMetricConfig,
} from './MetricsAreaChart'
import { NodeResourceBreakdown } from './NodeResourceBreakdown'
import { MetricsEmptyState } from './MetricsEmptyState'
import { DataFreshnessBadge } from './DataFreshnessBadge'
import { NodeMetricsTable } from './NodeMetricsTable'
import { useMetricsPreferences } from '@/stores/metrics-preferences'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Maximize2, Minimize2 } from 'lucide-react'

const LOADING_TIMEOUT_MS = 30_000

interface MetricsTimeSeriesPanelProps {
  clusterId: string
  isLive?: boolean
  compact?: boolean
}

const PANEL_METRICS: Array<{
  id: 'cpu' | 'memory' | 'network' | 'pods'
  title: string
  description: string
  metrics: MetricKey[]
}> = [
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

function normalizeHistory(data: MetricsDataPoint[] | undefined) {
  return data ?? []
}

/**
 * Get the latest non-null value for a metric from the data array.
 */
function getLatestValue(data: MetricsDataPoint[], metricKey: MetricKey): string {
  const cfg = METRIC_CONFIG[metricKey]
  for (let i = data.length - 1; i >= 0; i--) {
    const val = data[i][cfg.dataKey]
    if (typeof val === 'number' && !Number.isNaN(val)) {
      return formatMetricValue(metricKey, val)
    }
  }
  return '\u2014'
}

export function MetricsTimeSeriesPanel({
  clusterId,
  isLive = false,
  compact = false,
}: MetricsTimeSeriesPanelProps) {
  const {
    range,
    autoRefresh,
    refreshInterval,
    setRange,
    setAutoRefresh,
    setRefreshInterval,
    setCustomRange,
  } = useMetricsPreferences()

  // STYLE-02: Click-to-isolate legend state (per panel — null means show all)
  const [isolatedSeries, setIsolatedSeries] = useState<MetricKey | null>(null)
  const [hoveredSeries, setHoveredSeries] = useState<MetricKey | null>(null)

  // UX-02: Pause-on-hover refs
  const hoverPauseRef = useRef(false)
  const wasAutoRefreshRef = useRef(false)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChartMouseEnter = useCallback(() => {
    if (autoRefresh) {
      wasAutoRefreshRef.current = true
      setAutoRefresh(false)
      hoverPauseRef.current = true
    }
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
  }, [autoRefresh, setAutoRefresh])

  const handleChartMouseLeave = useCallback(() => {
    if (hoverPauseRef.current) {
      resumeTimerRef.current = setTimeout(() => {
        if (wasAutoRefreshRef.current) {
          setAutoRefresh(true)
        }
        hoverPauseRef.current = false
        wasAutoRefreshRef.current = false
        resumeTimerRef.current = null
      }, 1_000)
    }
  }, [setAutoRefresh])

  // Clean up resume timer on unmount
  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current)
      }
    }
  }, [])

  const refetchInterval = autoRefresh ? refreshInterval : false

  const apiRange = range === 'custom' ? '24h' : (range as ApiMetricsRange)

  const historyQuery = trpc.metrics.history.useQuery(
    { clusterId, range: apiRange },
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

  const normalizedData = useMemo(
    () => normalizeHistory((historyQuery.data as { data?: MetricsDataPoint[] } | undefined)?.data),
    [historyQuery.data],
  )

  const handleRetry = () => {
    setLoadingTimedOut(false)
    loadingStartRef.current = null
    historyQuery.refetch()
  }

  const [expandedPanel, setExpandedPanel] = useState<string | null>(null)

  const handleBrushZoom = useCallback(
    (startTs: string, endTs: string) => {
      setCustomRange(startTs, endTs)
    },
    [setCustomRange],
  )

  const chartHeight = expandedPanel ? 400 : compact ? 200 : 240
  const panelSkeletonHeight = compact ? 200 : 240

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            className={cn(
              'font-semibold text-[var(--color-text-primary)]',
              compact ? 'text-xs' : 'text-sm',
            )}
          >
            Resource Metrics
          </h3>
          {!compact && (
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Dedicated CPU, Memory, Network I/O, and Pods panels with synchronized range controls.
            </p>
          )}
        </div>
        <DataFreshnessBadge dataUpdatedAt={historyQuery.dataUpdatedAt} autoRefresh={autoRefresh} />
        {!compact ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
                Refresh
              </span>
              <AutoRefreshToggle
                enabled={autoRefresh}
                interval={refreshInterval}
                onToggle={setAutoRefresh}
                onIntervalChange={setRefreshInterval}
              />
            </div>
            <div className="h-8 w-px bg-[var(--color-border)] hidden sm:block" aria-hidden="true" />
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
                Time Range
              </span>
              <TimeRangeSelector value={range} onChange={setRange} />
            </div>
          </div>
        ) : (
          <TimeRangeSelector value={range} onChange={setRange} />
        )}
      </div>

      {isError ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <MetricsEmptyState
            status="error"
            message="Failed to load metrics"
            detail={
              historyQuery.error?.message ??
              'An unexpected error occurred while fetching metrics data.'
            }
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
            <div
              key={panel.id}
              className="rounded-xl border border-[var(--color-border)] p-4"
              style={{ background: 'var(--color-panel-bg)' }}
            >
              <Skeleton className="mb-3 h-4 w-40 rounded" />
              <Skeleton className="w-full rounded-lg" style={{ height: panelSkeletonHeight }} />
            </div>
          ))}
        </div>
      ) : normalizedData.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <MetricsEmptyState status="empty" onRetry={handleRetry} />
        </div>
      ) : (
        <div
          className={cn('grid gap-4', expandedPanel ? 'md:grid-cols-1' : 'md:grid-cols-2')}
          onMouseEnter={handleChartMouseEnter}
          onMouseLeave={handleChartMouseLeave}
        >
          {(expandedPanel
            ? PANEL_METRICS.filter((p) => p.id === expandedPanel)
            : PANEL_METRICS
          ).map((panel) => {
            // Compute activeMetrics from isolatedSeries state
            const activeMetrics =
              isolatedSeries && panel.metrics.includes(isolatedSeries)
                ? [isolatedSeries]
                : panel.metrics

            return (
              <section
                key={panel.id}
                className="rounded-xl border border-[var(--color-border)] p-3"
                style={{ background: 'var(--color-panel-bg)' }}
              >
                {/* Grafana-style panel header: uppercase title left, current values right */}
                <div className="mb-2 flex items-center justify-between gap-3 px-1">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                    {panel.title}
                  </h4>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {panel.metrics.map((metricKey) => {
                        const cfg = getMetricConfig(metricKey)
                        const latestValue = getLatestValue(normalizedData, metricKey)
                        return (
                          <span
                            key={metricKey}
                            className="font-mono text-sm font-semibold"
                            style={{ color: cfg.color }}
                          >
                            {latestValue}
                          </span>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedPanel(expandedPanel === panel.id ? null : panel.id)}
                      className="rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] hover:bg-white/5"
                      aria-label={expandedPanel === panel.id ? 'Collapse panel' : 'Expand panel'}
                    >
                      {expandedPanel === panel.id ? (
                        <Minimize2 className="h-3.5 w-3.5" />
                      ) : (
                        <Maximize2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <MetricsAreaChart
                  data={normalizedData}
                  range={range}
                  activeMetrics={activeMetrics}
                  height={chartHeight}
                  syncId="metrics-sync"
                  showThresholds={panel.id === 'cpu' || panel.id === 'memory'}
                  onBrushChange={handleBrushZoom}
                />

                {/* STYLE-02: Interactive legend with click-to-isolate */}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                  {panel.metrics.map((metricKey) => {
                    const cfg = getMetricConfig(metricKey)
                    const isIsolated = isolatedSeries === metricKey
                    const isDimmed = isolatedSeries !== null && !isIsolated
                    const latestValue = getLatestValue(normalizedData, metricKey)

                    return (
                      <button
                        key={metricKey}
                        type="button"
                        onClick={() => {
                          setIsolatedSeries(isolatedSeries === metricKey ? null : metricKey)
                        }}
                        onMouseEnter={() => setHoveredSeries(metricKey)}
                        onMouseLeave={() => setHoveredSeries(null)}
                        className="legend-item flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-mono transition-opacity"
                        style={{ opacity: isDimmed ? 0.3 : 1 }}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: cfg.color }}
                        />
                        <span className="text-[var(--color-text-muted)]">{cfg.label}</span>
                        <span className="font-medium text-[var(--color-text-primary)]">
                          {latestValue}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* MX-005: Per-node metrics table from nodeTimeSeries route (Dima's new route) */}
      {!compact && <NodeMetricsTable clusterId={clusterId} range={range} />}

      {isLive && nodes.length > 0 && !compact && <NodeResourceBreakdown nodes={nodes} />}

      {/* Last updated */}
      {historyQuery.dataUpdatedAt > 0 && !compact && (
        <p className="text-right font-mono text-xs text-[var(--color-text-dim)]">
          Last updated:{' '}
          {new Date(historyQuery.dataUpdatedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
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
