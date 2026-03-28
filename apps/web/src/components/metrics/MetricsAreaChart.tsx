'use client'

import { useId } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { MetricsRange } from './TimeRangeSelector'

export interface MetricsDataPoint {
  timestamp: string
  bucketStart?: string | null
  bucketEnd?: string | null
  cpu: number | null
  memory: number | null
  pods: number | null
  networkBytesIn?: number | null
  networkBytesOut?: number | null
}

export type MetricKey = 'cpu' | 'memory' | 'pods' | 'networkIn' | 'networkOut'
export type MetricFamily = 'cpu' | 'memory' | 'network' | 'pods'

interface MetricsAreaChartProps {
  data: MetricsDataPoint[]
  range: MetricsRange
  activeMetrics?: MetricKey[]
  height?: number
}

const METRIC_CONFIG: Record<
  MetricKey,
  {
    label: string
    color: string
    gradientId: string
    yAxis: string
    dataKey: keyof MetricsDataPoint
    family: MetricFamily
  }
> = {
  cpu: {
    label: 'CPU %',
    color: 'var(--color-chart-cpu)',
    gradientId: 'cpuGradient',
    yAxis: 'percent',
    dataKey: 'cpu',
    family: 'cpu',
  },
  memory: {
    label: 'Memory %',
    color: 'var(--color-chart-mem)',
    gradientId: 'memGradient',
    yAxis: 'percent',
    dataKey: 'memory',
    family: 'memory',
  },
  pods: {
    label: 'Pods',
    color: 'var(--color-chart-pods)',
    gradientId: 'podsGradient',
    yAxis: 'count',
    dataKey: 'pods',
    family: 'pods',
  },
  networkIn: {
    label: 'Net In',
    color: 'var(--color-chart-warning)',
    gradientId: 'netInGradient',
    yAxis: 'bytes',
    dataKey: 'networkBytesIn',
    family: 'network',
  },
  networkOut: {
    label: 'Net Out',
    color: 'var(--color-chart-critical)',
    gradientId: 'netOutGradient',
    yAxis: 'bytes',
    dataKey: 'networkBytesOut',
    family: 'network',
  },
}

export function getMetricConfig(key: MetricKey) {
  return METRIC_CONFIG[key]
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes.toFixed(0)} B`
}

function formatMetricValue(metric: MetricKey, value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (metric === 'networkIn' || metric === 'networkOut') return formatBytes(value)
  if (metric === 'pods') return `${Math.round(value)}`
  return `${value.toFixed(1)}%`
}

/**
 * Format X-axis timestamps — Grafana-style clean labels per range.
 */
function formatXAxis(iso: string, range: MetricsRange): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''

  switch (range) {
    case '7d':
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    case '1h':
    case '6h':
    case '24h':
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    default:
      // Short ranges (30s, 1m, 5m) show seconds for precision
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
}

function getTickInterval(
  data: MetricsDataPoint[],
  range: MetricsRange,
): number | 'preserveStartEnd' {
  switch (range) {
    case '30s':
    case '1m':
    case '5m':
      return Math.max(0, Math.floor(data.length / 4))
    case '1h':
      return Math.max(1, Math.floor(data.length / 6))
    case '6h':
      return Math.max(1, Math.floor(data.length / 6))
    case '24h':
      return Math.max(1, Math.floor(data.length / 6))
    case '7d':
      return Math.max(1, Math.floor(data.length / 7))
    default:
      return 'preserveStartEnd'
  }
}

function formatDateTime(iso?: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(
    [],
    {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    },
  )}`
}

function getBucketWindowLabel(point?: MetricsDataPoint | null, fallbackLabel?: string) {
  const startLabel = formatDateTime(point?.bucketStart)
  const endLabel = formatDateTime(point?.bucketEnd)

  if (startLabel && endLabel) return `${startLabel} → ${endLabel}`
  if (startLabel) return startLabel
  if (endLabel) return endLabel
  return fallbackLabel ? (formatDateTime(fallbackLabel) ?? String(fallbackLabel)) : ''
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{
    name: string
    value: number | null
    color: string
    dataKey: string
    payload?: MetricsDataPoint
  }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  const point = payload[0]?.payload
  const bucketLabel = getBucketWindowLabel(point, label)

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2.5 text-xs shadow-xl">
      <p className="mb-1 font-mono text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
        Bucket window
      </p>
      <p className="mb-1.5 font-mono text-[var(--color-text-muted)]">{bucketLabel}</p>
      {payload.map((entry) => {
        const metricKey = (Object.entries(METRIC_CONFIG).find(
          ([, cfg]) => cfg.label === entry.name,
        )?.[0] ?? 'cpu') as MetricKey
        return (
          <div key={`${entry.name}-${entry.dataKey}`} className="mb-0.5 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-[var(--color-text-secondary)]">{entry.name}:</span>
            <span className="font-mono font-medium text-[var(--color-text-primary)]">
              {formatMetricValue(metricKey, entry.value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function CurrentValueBadge({
  data,
  activeMetrics,
}: {
  data: MetricsDataPoint[]
  activeMetrics: MetricKey[]
}) {
  // Find last non-null data point for badge display
  const latestPoint = [...data].reverse().find((point) =>
    activeMetrics.some((key) => {
      const value = point[METRIC_CONFIG[key].dataKey]
      return typeof value === 'number'
    }),
  )

  if (!latestPoint) return null

  const bucketLabel = getBucketWindowLabel(latestPoint, latestPoint.timestamp)

  return (
    <div className="mt-1 space-y-1.5">
      <p className="text-xs font-mono text-[var(--color-text-dim)]">
        Current bucket: {bucketLabel}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {activeMetrics.map((key) => {
          const cfg = METRIC_CONFIG[key]
          const raw = latestPoint[cfg.dataKey]
          return (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-mono"
              style={{
                color: cfg.color,
                borderColor: `color-mix(in srgb, ${cfg.color} 40%, transparent)`,
                background: `color-mix(in srgb, ${cfg.color} 10%, transparent)`,
              }}
              title={`Current ${cfg.label}`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.color }} />
              {cfg.label}:{' '}
              <strong>{formatMetricValue(key, typeof raw === 'number' ? raw : null)}</strong>
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function MetricsAreaChart({
  data,
  range,
  activeMetrics = ['cpu', 'memory'],
  height = 280,
}: MetricsAreaChartProps) {
  // Enrich data — preserve nulls for gap rendering (connectNulls=false)
  const chartData = data.map((d) => ({
    ...d,
    bucketStart: d.bucketStart ?? null,
    bucketEnd: d.bucketEnd ?? null,
    networkBytesIn: d.networkBytesIn ?? null,
    networkBytesOut: d.networkBytesOut ?? null,
  }))

  const primaryMetric = activeMetrics[0]
  const primaryConfig = primaryMetric ? METRIC_CONFIG[primaryMetric] : null
  const tickInterval = getTickInterval(data, range)
  const gridLines = primaryConfig?.yAxis === 'percent' ? [25, 50, 75] : []
  const chartId = useId()

  return (
    <div
      role="img"
      aria-label={`${activeMetrics.map((k) => METRIC_CONFIG[k].label).join(', ')} chart`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          key={`${range}-${activeMetrics.join('-')}`}
          data={chartData}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        >
          <defs>
            {activeMetrics.map((key) => {
              const cfg = METRIC_CONFIG[key]
              const gradId = `${chartId}-${cfg.gradientId}`
              return (
                <linearGradient key={gradId} id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={cfg.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
                </linearGradient>
              )
            })}
          </defs>

          <CartesianGrid strokeDasharray="3 6" stroke="var(--color-grid-line)" vertical={false} />

          {gridLines.map((val) => (
            <ReferenceLine
              key={val}
              yAxisId={primaryConfig?.yAxis}
              y={val}
              stroke="var(--color-grid-line-subtle)"
              strokeDasharray="4 4"
            />
          ))}

          <XAxis
            dataKey="timestamp"
            tickFormatter={(v) => formatXAxis(v as string, range)}
            tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
            tickLine={false}
            axisLine={false}
            interval={tickInterval}
            minTickGap={24}
            padding={{ left: 8, right: 8 }}
          />

          {primaryConfig?.yAxis === 'percent' && (
            <YAxis
              yAxisId="percent"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
              tickLine={false}
              axisLine={false}
              width={40}
              ticks={[0, 25, 50, 75, 100]}
            />
          )}

          {primaryConfig?.yAxis === 'count' && (
            <YAxis
              yAxisId="count"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
          )}

          {primaryConfig?.yAxis === 'bytes' && (
            <YAxis
              yAxisId="bytes"
              tickFormatter={(v) => formatBytes(Number(v))}
              tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
          )}

          <Tooltip content={<CustomTooltip />} />

          {activeMetrics.map((key) => {
            const cfg = METRIC_CONFIG[key]
            return (
              <Area
                key={key}
                yAxisId={cfg.yAxis}
                type="monotone"
                dataKey={cfg.dataKey}
                name={cfg.label}
                stroke={cfg.color}
                fill={`url(#${chartId}-${cfg.gradientId})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls={false}
                isAnimationActive={false}
                animationDuration={0}
              />
            )
          })}
        </AreaChart>
      </ResponsiveContainer>

      <CurrentValueBadge data={chartData} activeMetrics={activeMetrics} />
    </div>
  )
}
