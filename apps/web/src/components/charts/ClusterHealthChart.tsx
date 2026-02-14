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
  AXIS_FONT_SIZE,
  CHART_COLORS,
  CHART_GRID_COLOR,
  CHART_HEIGHT,
  CHART_MARGIN,
  CHART_TEXT_COLOR,
  STROKE_WIDTH,
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
    <div role="img" aria-label="Cluster health over time chart">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(v: string) => formatTimestamp(v, range)}
            stroke={CHART_TEXT_COLOR}
            fontSize={AXIS_FONT_SIZE}
          />
          <YAxis stroke={CHART_TEXT_COLOR} fontSize={AXIS_FONT_SIZE} unit="%" />
          <Tooltip
            {...TOOLTIP_STYLE}
            labelFormatter={(v) => formatTimestamp(v as string, range)}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="healthy"
            stroke={CHART_COLORS.healthy}
            strokeWidth={STROKE_WIDTH}
            dot={false}
            name="Healthy"
          />
          <Line
            type="monotone"
            dataKey="degraded"
            stroke={CHART_COLORS.degraded}
            strokeWidth={STROKE_WIDTH}
            dot={false}
            name="Degraded"
          />
          <Line
            type="monotone"
            dataKey="offline"
            stroke={CHART_COLORS.offline}
            strokeWidth={STROKE_WIDTH}
            dot={false}
            name="Offline"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
