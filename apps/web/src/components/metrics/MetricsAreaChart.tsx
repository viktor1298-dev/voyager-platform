'use client'

import { memo, useId } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
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
  syncId?: string
  showThresholds?: boolean
  onBrushChange?: (startTimestamp: string, endTimestamp: string) => void
}

export const METRIC_CONFIG: Record<
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

export function formatMetricValue(metric: MetricKey, value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '\u2014'
  if (metric === 'networkIn' || metric === 'networkOut') return formatBytes(value)
  if (metric === 'pods') return `${Math.round(value)}`
  return `${value.toFixed(1)}%`
}

/**
 * Format X-axis timestamps -- range-adaptive formatting per STYLE-04.
 * 5m/15m: HH:MM:SS, 30m-24h: HH:MM, 2d/7d: Mon Day
 */
function formatXAxis(iso: string, range: MetricsRange): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''

  switch (range) {
    case '5m':
    case '15m':
      // Short ranges: HH:MM:SS for second-level precision
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    case '30m':
    case '1h':
    case '3h':
    case '6h':
    case '12h':
    case '24h':
      // Medium ranges: HH:MM (no seconds)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    case '2d':
    case '7d':
      // Multi-day: Mon Day (abbreviated month + day number)
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    default:
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
}

function getTickInterval(
  data: MetricsDataPoint[],
  range: MetricsRange,
): number | 'preserveStartEnd' {
  switch (range) {
    case '5m':
    case '15m':
    case '30m':
      return Math.max(0, Math.floor(data.length / 4))
    case '1h':
    case '3h':
    case '6h':
    case '12h':
    case '24h':
      return Math.max(1, Math.floor(data.length / 6))
    case '2d':
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

  if (startLabel && endLabel) return `${startLabel} \u2192 ${endLabel}`
  if (startLabel) return startLabel
  if (endLabel) return endLabel
  return fallbackLabel ? (formatDateTime(fallbackLabel) ?? String(fallbackLabel)) : ''
}

/**
 * Compute auto-scale domain for percent Y-axis based on actual data range.
 * Per STYLE-03: avoid fixed 0-100 when data is e.g. 2-5%.
 */
function computePercentDomain(data: MetricsDataPoint[], metrics: MetricKey[]): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const point of data) {
    for (const key of metrics) {
      const cfg = METRIC_CONFIG[key]
      if (cfg.yAxis !== 'percent') continue
      const val = point[cfg.dataKey]
      if (typeof val === 'number' && !Number.isNaN(val)) {
        if (val < min) min = val
        if (val > max) max = val
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 100]
  // Add 10% padding, floor min to 0, ceil max to nearest 5 (min range 10)
  const paddedMin = Math.max(0, Math.floor((min - (max - min) * 0.1) / 5) * 5)
  const paddedMax = Math.min(100, Math.ceil((max + (max - min) * 0.1) / 5) * 5)
  if (paddedMax - paddedMin < 10) return [Math.max(0, paddedMin - 5), Math.min(100, paddedMax + 5)]
  return [paddedMin, paddedMax]
}

/**
 * Custom crosshair cursor -- renders a dashed vertical line with a timestamp label.
 * Memoized to prevent unnecessary re-renders during crosshair sync (Pitfall 2).
 */
const CustomCursor = memo(function CustomCursor({
  points,
  height,
  payload,
}: {
  points?: Array<{ x: number; y: number }>
  width?: number
  height?: number
  payload?: Array<{ payload?: MetricsDataPoint }>
}) {
  if (!points?.[0] || !height) return null

  const x = points[0].x
  const timestamp = payload?.[0]?.payload?.timestamp
  const label = timestamp
    ? new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : ''

  return (
    <g>
      <line x1={x} y1={0} x2={x} y2={height} stroke="#666" strokeDasharray="3 3" strokeWidth={1} />
      {label && (
        <text
          x={x}
          y={height - 4}
          fill="var(--color-text-dim)"
          fontSize={10}
          fontFamily="monospace"
          textAnchor="middle"
        >
          {label}
        </text>
      )}
    </g>
  )
})

/**
 * Grafana-style dark tooltip per STYLE-05.
 * Dark background, colored dot indicators, mono-spaced values right-aligned.
 */
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
    <div
      className="rounded-lg p-2.5 text-xs shadow-2xl"
      style={{
        background: 'var(--color-tooltip-bg)',
        border: '1px solid var(--color-tooltip-border)',
        minWidth: 180,
      }}
    >
      <p className="mb-1.5 font-mono text-[10px] text-[var(--color-text-dim)]">{bucketLabel}</p>
      {payload.map((entry) => {
        const metricKey = (Object.entries(METRIC_CONFIG).find(
          ([, cfg]) => cfg.label === entry.name,
        )?.[0] ?? 'cpu') as MetricKey
        return (
          <div
            key={`${entry.name}-${entry.dataKey}`}
            className="flex items-center justify-between gap-4 py-0.5"
          >
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-[6px] w-[6px] rounded-full"
                style={{ background: entry.color }}
              />
              <span className="text-[var(--color-text-muted)]">{entry.name}</span>
            </span>
            <span className="font-mono font-medium text-[var(--color-text-primary)]">
              {formatMetricValue(metricKey, entry.value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function MetricsAreaChart({
  data,
  range,
  activeMetrics = ['cpu', 'memory'],
  height = 280,
  syncId,
  showThresholds,
  onBrushChange,
}: MetricsAreaChartProps) {
  // Enrich data -- preserve nulls for gap rendering (connectNulls=false)
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
  const chartId = useId()
  const showBrush = chartData.length > 5 && !!onBrushChange

  // STYLE-03: Auto-scale percent Y-axis based on actual data range
  const [yMin, yMax] = computePercentDomain(chartData, activeMetrics)

  return (
    <div
      className="grafana-panel rounded-lg p-3"
      style={{
        background: 'var(--color-panel-bg)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div
        role="img"
        aria-label={`${activeMetrics.map((k) => METRIC_CONFIG[k].label).join(', ')} chart`}
      >
        <ResponsiveContainer width="100%" height={height} debounce={100}>
          <AreaChart
            key={`${range}-${activeMetrics.join('-')}`}
            data={chartData}
            syncId={syncId}
            margin={{ top: 8, right: 12, bottom: showBrush ? 4 : 0, left: 0 }}
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

            {/* Threshold reference lines -- 65% warning and 85% critical for percent-axis panels */}
            {showThresholds && primaryConfig?.yAxis === 'percent' && (
              <>
                <ReferenceLine
                  yAxisId="percent"
                  y={85}
                  stroke="var(--color-threshold-critical)"
                  strokeDasharray="6 4"
                  strokeWidth={1}
                  label={false}
                />
                <ReferenceLine
                  yAxisId="percent"
                  y={65}
                  stroke="var(--color-threshold-warn)"
                  strokeDasharray="6 4"
                  strokeWidth={1}
                  label={false}
                />
              </>
            )}

            <XAxis
              dataKey="timestamp"
              tickFormatter={(v) => formatXAxis(v as string, range)}
              tick={{
                fontSize: 11,
                fill: 'var(--color-text-dim)',
                fontFamily: 'ui-monospace, monospace',
              }}
              tickLine={false}
              axisLine={false}
              interval={tickInterval}
              minTickGap={24}
              padding={{ left: 8, right: 8 }}
            />

            {primaryConfig?.yAxis === 'percent' && (
              <YAxis
                yAxisId="percent"
                domain={[yMin, yMax]}
                tickCount={5}
                tickFormatter={(v) => `${v}%`}
                tick={{
                  fontSize: 11,
                  fill: 'var(--color-text-dim)',
                  fontFamily: 'ui-monospace, monospace',
                }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
            )}

            {primaryConfig?.yAxis === 'count' && (
              <YAxis
                yAxisId="count"
                domain={['auto', 'auto']}
                allowDecimals={false}
                tick={{
                  fontSize: 11,
                  fill: 'var(--color-text-dim)',
                  fontFamily: 'ui-monospace, monospace',
                }}
                tickLine={false}
                axisLine={false}
                width={36}
              />
            )}

            {primaryConfig?.yAxis === 'bytes' && (
              <YAxis
                yAxisId="bytes"
                domain={['auto', 'auto']}
                tickFormatter={(v) => formatBytes(Number(v))}
                tick={{
                  fontSize: 11,
                  fill: 'var(--color-text-dim)',
                  fontFamily: 'ui-monospace, monospace',
                }}
                tickLine={false}
                axisLine={false}
                width={64}
              />
            )}

            <Tooltip cursor={<CustomCursor />} content={<CustomTooltip />} />

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

            {showBrush && (
              <Brush
                dataKey="timestamp"
                height={24}
                stroke="var(--color-accent)"
                fill="var(--color-bg-card)"
                travellerWidth={8}
                tickFormatter={() => ''}
                onChange={(range: { startIndex?: number; endIndex?: number }) => {
                  if (
                    range.startIndex != null &&
                    range.endIndex != null &&
                    chartData[range.startIndex] &&
                    chartData[range.endIndex]
                  ) {
                    onBrushChange?.(
                      chartData[range.startIndex].timestamp,
                      chartData[range.endIndex].timestamp,
                    )
                  }
                }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
