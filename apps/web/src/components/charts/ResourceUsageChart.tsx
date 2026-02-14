'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  CHART_COLORS,
  CHART_GRID_COLOR,
  CHART_TEXT_COLOR,
  TOOLTIP_STYLE,
  type TimeRange,
  formatTimestamp,
} from './chart-theme'

interface ResourcePoint {
  timestamp: string
  cpu: number
  memory: number
}

interface ResourceUsageChartProps {
  data: ResourcePoint[]
  range: TimeRange
}

export function ResourceUsageChart({ data, range }: ResourceUsageChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <defs>
          <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.cpu} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLORS.cpu} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.memory} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLORS.memory} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(v) => formatTimestamp(v, range)}
          stroke={CHART_TEXT_COLOR}
          fontSize={12}
        />
        <YAxis stroke={CHART_TEXT_COLOR} fontSize={12} unit="%" domain={[0, 100]} />
        <Tooltip
          {...TOOLTIP_STYLE}
          labelFormatter={(v) => formatTimestamp(v as string, range)}
        />
        <Legend />
        <Area
          type="monotone"
          dataKey="cpu"
          stroke={CHART_COLORS.cpu}
          fill="url(#cpuGradient)"
          strokeWidth={2}
          name="CPU"
        />
        <Area
          type="monotone"
          dataKey="memory"
          stroke={CHART_COLORS.memory}
          fill="url(#memGradient)"
          strokeWidth={2}
          name="Memory"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
