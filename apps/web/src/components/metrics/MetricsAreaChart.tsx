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
}

interface MetricsAreaChartProps {
  data: MetricsDataPoint[]
  range: MetricsRange
  activeMetrics?: ('cpu' | 'memory' | 'pods')[]
}

const METRIC_CONFIG = {
  cpu: {
    label: 'CPU',
    color: 'hsl(262,83%,58%)',
    gradientId: 'cpuGradient',
    yAxis: 'percent',
  },
  memory: {
    label: 'Memory',
    color: 'hsl(199,89%,48%)',
    gradientId: 'memGradient',
    yAxis: 'percent',
  },
  pods: {
    label: 'Pods',
    color: 'hsl(142,71%,45%)',
    gradientId: 'podsGradient',
    yAxis: 'count',
  },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2.5 shadow-xl text-xs">
      <p className="text-[var(--color-text-muted)] font-mono mb-1.5">{label}</p>
      {payload.map((entry: { name: string; value: number; color: string }) => (
        <div key={entry.name} className="flex items-center gap-2 mb-0.5">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-[var(--color-text-secondary)]">{entry.name}:</span>
          <span className="font-mono font-medium text-[var(--color-text-primary)]">
            {entry.name === 'Pods' ? entry.value : `${entry.value}%`}
          </span>
        </div>
      ))}
    </div>
  )
}

export function MetricsAreaChart({
  data,
  range,
  activeMetrics = ['cpu', 'memory'],
}: MetricsAreaChartProps) {
  const hasCpuOrMem = activeMetrics.includes('cpu') || activeMetrics.includes('memory')

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(262,83%,58%)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(262,83%,58%)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(199,89%,48%)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(199,89%,48%)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="podsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(142,71%,45%)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(142,71%,45%)" stopOpacity={0} />
          </linearGradient>
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
        {activeMetrics.includes('pods') && (
          <YAxis
            yAxisId="count"
            orientation="right"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground, 0 0% 45%))' }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
        )}
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          iconType="circle"
          iconSize={8}
        />

        {activeMetrics.includes('cpu') && (
          <Area
            yAxisId="percent"
            type="monotone"
            dataKey="cpu"
            name={METRIC_CONFIG.cpu.label}
            stroke={METRIC_CONFIG.cpu.color}
            fill="url(#cpuGradient)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        )}
        {activeMetrics.includes('memory') && (
          <Area
            yAxisId="percent"
            type="monotone"
            dataKey="memory"
            name={METRIC_CONFIG.memory.label}
            stroke={METRIC_CONFIG.memory.color}
            fill="url(#memGradient)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        )}
        {activeMetrics.includes('pods') && (
          <Area
            yAxisId="count"
            type="monotone"
            dataKey="pods"
            name={METRIC_CONFIG.pods.label}
            stroke={METRIC_CONFIG.pods.color}
            fill="url(#podsGradient)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
}
