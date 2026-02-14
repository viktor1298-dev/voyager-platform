'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

interface HealthPoint {
  timestamp: string
  healthy: number
  degraded: number
  offline: number
}

interface ClusterHealthChartProps {
  data: HealthPoint[]
  range: TimeRange
}

export function ClusterHealthChart({ data, range }: ClusterHealthChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(v) => formatTimestamp(v, range)}
          stroke={CHART_TEXT_COLOR}
          fontSize={12}
        />
        <YAxis stroke={CHART_TEXT_COLOR} fontSize={12} unit="%" />
        <Tooltip
          {...TOOLTIP_STYLE}
          labelFormatter={(v) => formatTimestamp(v as string, range)}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="healthy"
          stroke={CHART_COLORS.healthy}
          strokeWidth={2}
          dot={false}
          name="Healthy"
        />
        <Line
          type="monotone"
          dataKey="degraded"
          stroke={CHART_COLORS.degraded}
          strokeWidth={2}
          dot={false}
          name="Degraded"
        />
        <Line
          type="monotone"
          dataKey="offline"
          stroke={CHART_COLORS.offline}
          strokeWidth={2}
          dot={false}
          name="Offline"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
