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
  AXIS_FONT_SIZE,
  CHART_COLORS,
  CHART_GRID_COLOR,
  CHART_HEIGHT,
  CHART_MARGIN,
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

const BAR_RADIUS: [number, number, number, number] = [2, 2, 0, 0]

export function RequestRateChart({ data, range }: RequestRateChartProps) {
  return (
    <div role="img" aria-label="API request success and error rates over time chart">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(v: string) => formatTimestamp(v, range)}
            stroke={CHART_TEXT_COLOR}
            fontSize={AXIS_FONT_SIZE}
          />
          <YAxis stroke={CHART_TEXT_COLOR} fontSize={AXIS_FONT_SIZE} />
          <Tooltip
            {...TOOLTIP_STYLE}
            labelFormatter={(v) => formatTimestamp(v as string, range)}
          />
          <Legend />
          <Bar dataKey="success" fill={CHART_COLORS.success} name="Success" radius={BAR_RADIUS} />
          <Bar dataKey="error" fill={CHART_COLORS.error} name="Errors" radius={BAR_RADIUS} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
