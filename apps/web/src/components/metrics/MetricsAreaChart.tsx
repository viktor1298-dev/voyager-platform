'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts'
import type { MetricsRange } from './TimeRangeSelector'

export interface MetricsDataPoint {
  timestamp: string
  cpu: number
  memory: number
  pods: number
  networkBytesIn?: number
  networkBytesOut?: number
}

export type MetricKey = 'cpu' | 'memory' | 'pods' | 'networkIn' | 'networkOut'

interface MetricsAreaChartProps {
  data: MetricsDataPoint[]
  range: MetricsRange
  activeMetrics?: MetricKey[]
  height?: number
}

const METRIC_CONFIG: Record<MetricKey, {
  label: string
  color: string
  gradientId: string
  yAxis: string
  dataKey: string
}> = {
  cpu: {
    label: 'CPU %',
    color: 'hsl(262,83%,58%)',
    gradientId: 'cpuGradient',
    yAxis: 'percent',
    dataKey: 'cpu',
  },
  memory: {
    label: 'Memory %',
    color: 'hsl(199,89%,48%)',
    gradientId: 'memGradient',
    yAxis: 'percent',
    dataKey: 'memory',
  },
  pods: {
    label: 'Pods',
    color: 'hsl(142,71%,45%)',
    gradientId: 'podsGradient',
    yAxis: 'count',
    dataKey: 'pods',
  },
  networkIn: {
    label: 'Net In',
    color: 'hsl(38,92%,50%)',
    gradientId: 'netInGradient',
    yAxis: 'bytes',
    dataKey: 'networkBytesIn',
  },
  networkOut: {
    label: 'Net Out',
    color: 'hsl(340,82%,52%)',
    gradientId: 'netOutGradient',
    yAxis: 'bytes',
    dataKey: 'networkBytesOut',
  },
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${bytes}B`
}

/**
 * BUG-193-003: Format X-axis timestamps with HH:MM for 24h range,
 * showing every 4-6 hours to avoid crowding.
 */
function formatXAxis(iso: string, range: MetricsRange): string {
  const d = new Date(iso)
  if (!iso || isNaN(d.getTime())) return ''

  switch (range) {
    case '1h':
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    case '6h':
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    case '24h':
      // Show HH:MM — recharts interval handles tick density
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    case '7d':
      return d.toLocaleDateString([], { weekday: 'short', hour: '2-digit' })
    default:
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
}

/**
 * Determine tick interval to show approximately every 4-6 hours for 24h range.
 */
function getTickInterval(data: MetricsDataPoint[], range: MetricsRange): number | 'preserveStartEnd' {
  if (range === '24h') {
    // Show ~6 ticks: every 4 hours = every (total/6) points
    const target = Math.max(1, Math.floor(data.length / 6))
    return target
  }
  if (range === '7d') {
    return Math.max(1, Math.floor(data.length / 7))
  }
  return 'preserveStartEnd'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2.5 shadow-xl text-xs">
      <p className="text-[var(--color-text-muted)] font-mono mb-1.5">
        {label ? (() => {
          const d = new Date(label as string)
          return isNaN(d.getTime()) ? String(label) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
        })() : ''}
      </p>
      {payload.map((entry: { name: string; value: number; color: string }) => {
        const isBytes = entry.name === 'Net In' || entry.name === 'Net Out'
        const isPods = entry.name === 'Pods'
        const displayVal = isBytes
          ? formatBytes(entry.value)
          : isPods
          ? String(entry.value)
          : `${entry.value}%`
        return (
          <div key={entry.name} className="flex items-center gap-2 mb-0.5">
            <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-[var(--color-text-secondary)]">{entry.name}:</span>
            <span className="font-mono font-medium text-[var(--color-text-primary)]">
              {displayVal}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * BUG-193-003: Current value badge rendered at rightmost data point.
 * Appears as a pill showing the latest value for each active metric.
 */
function CurrentValueBadge({
  data,
  activeMetrics,
}: {
  data: MetricsDataPoint[]
  activeMetrics: MetricKey[]
}) {
  if (!data.length) return null
  const lastPoint = data[data.length - 1]
  if (!lastPoint) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1">
      {activeMetrics.map((key) => {
        const cfg = METRIC_CONFIG[key]
        if (!cfg) return null
        const dataKey = cfg.dataKey as keyof MetricsDataPoint
        const raw = lastPoint[dataKey]
        const value = typeof raw === 'number' ? raw : 0
        const isBytes = key === 'networkIn' || key === 'networkOut'
        const isPods = key === 'pods'
        const displayVal = isBytes ? formatBytes(value) : isPods ? `${value}` : `${value}%`

        return (
          <span
            key={key}
            className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border"
            style={{
              color: cfg.color,
              borderColor: `color-mix(in srgb, ${cfg.color} 40%, transparent)`,
              background: `color-mix(in srgb, ${cfg.color} 10%, transparent)`,
            }}
            title={`Current ${cfg.label}`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.color }} />
            {cfg.label.split(' ')[0]}: <strong>{displayVal}</strong>
          </span>
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
}: MetricsAreaChartProps) {
  const hasCpuOrMem = activeMetrics.includes('cpu') || activeMetrics.includes('memory')
  const hasNetwork = activeMetrics.includes('networkIn') || activeMetrics.includes('networkOut')
  const hasPods = activeMetrics.includes('pods')

  // Enrich data with aliased keys for recharts
  const chartData = data.map((d) => ({
    ...d,
    networkBytesIn: d.networkBytesIn ?? 0,
    networkBytesOut: d.networkBytesOut ?? 0,
  }))

  const tickInterval = getTickInterval(data, range)

  // BUG-193-003: Subtle horizontal grid at key % values
  const gridLines = hasCpuOrMem ? [25, 50, 75] : []

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            {Object.entries(METRIC_CONFIG).map(([, cfg]) => (
              <linearGradient key={cfg.gradientId} id={cfg.gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={cfg.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {/* BUG-193-003: Subtle horizontal dashed grid lines */}
          <CartesianGrid
            strokeDasharray="3 6"
            stroke="var(--color-grid-line)"
            vertical={false}
          />

          {/* BUG-193-003: Reference lines at 25/50/75% for visual scale */}
          {gridLines.map((val) => (
            <ReferenceLine
              key={val}
              yAxisId="percent"
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
            padding={{ left: 8, right: 8 }}
          />
          {hasCpuOrMem && (
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
          {hasPods && (
            <YAxis
              yAxisId="count"
              orientation={hasCpuOrMem ? 'right' : 'left'}
              tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
          )}
          {hasNetwork && (
            <YAxis
              yAxisId="bytes"
              orientation="right"
              tickFormatter={(v) => formatBytes(v)}
              tick={{ fontSize: 11, fill: 'var(--color-text-dim)' }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
          )}
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />

          {activeMetrics.map((key) => {
            const cfg = METRIC_CONFIG[key]
            if (!cfg) return null
            return (
              <Area
                key={key}
                yAxisId={cfg.yAxis}
                type="monotone"
                dataKey={cfg.dataKey}
                name={cfg.label}
                stroke={cfg.color}
                fill={`url(#${cfg.gradientId})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            )
          })}
        </AreaChart>
      </ResponsiveContainer>

      {/* BUG-193-003: Current value badge row */}
      <CurrentValueBadge data={data} activeMetrics={activeMetrics} />
    </div>
  )
}
