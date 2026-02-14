'use client'

import {
  Bar,
  BarChart,
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

interface RequestRatePoint {
  timestamp: string
  success: number
  error: number
}

interface RequestRateChartProps {
  data: RequestRatePoint[]
  range: TimeRange
}

export function RequestRateChart({ data, range }: RequestRateChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(v) => formatTimestamp(v, range)}
          stroke={CHART_TEXT_COLOR}
          fontSize={12}
        />
        <YAxis stroke={CHART_TEXT_COLOR} fontSize={12} />
        <Tooltip
          {...TOOLTIP_STYLE}
          labelFormatter={(v) => formatTimestamp(v as string, range)}
        />
        <Legend />
        <Bar dataKey="success" fill={CHART_COLORS.success} name="Success" radius={[2, 2, 0, 0]} />
        <Bar dataKey="error" fill={CHART_COLORS.error} name="Errors" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
