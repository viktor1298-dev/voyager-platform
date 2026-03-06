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
} from 'recharts'
import { formatTimestamp } from '@/components/charts/chart-theme'
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2.5 shadow-xl text-xs">
      <p className="text-[var(--color-text-muted)] font-mono mb-1.5">{label}</p>
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {Object.entries(METRIC_CONFIG).map(([, cfg]) => (
            <linearGradient key={cfg.gradientId} id={cfg.gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={cfg.color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border, 0 0% 90%))"
          opacity={0.4}
        />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(v) => formatTimestamp(v, range)}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground, 0 0% 45%))' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        {hasCpuOrMem && (
          <YAxis
            yAxisId="percent"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground, 0 0% 45%))' }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
        )}
        {hasPods && (
          <YAxis
            yAxisId="count"
            orientation={hasCpuOrMem ? 'right' : 'left'}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground, 0 0% 45%))' }}
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
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground, 0 0% 45%))' }}
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
            />
          )
        })}
      </AreaChart>
    </ResponsiveContainer>
  )
}
