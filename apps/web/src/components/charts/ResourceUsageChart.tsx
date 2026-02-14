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

interface ResourcePoint {
  timestamp: string
  cpu: number
  memory: number
}

interface ResourceUsageChartProps {
  data: ResourcePoint[]
  range: TimeRange
}

const GRADIENT_START_OPACITY = 0.3
const GRADIENT_END_OPACITY = 0
const PERCENTAGE_DOMAIN: [number, number] = [0, 100]

export function ResourceUsageChart({ data, range }: ResourceUsageChartProps) {
  return (
    <div role="img" aria-label="CPU and memory resource usage over time chart">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={data} margin={CHART_MARGIN}>
          <defs>
            <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.cpu} stopOpacity={GRADIENT_START_OPACITY} />
              <stop offset="95%" stopColor={CHART_COLORS.cpu} stopOpacity={GRADIENT_END_OPACITY} />
            </linearGradient>
            <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.memory} stopOpacity={GRADIENT_START_OPACITY} />
              <stop offset="95%" stopColor={CHART_COLORS.memory} stopOpacity={GRADIENT_END_OPACITY} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(v: string) => formatTimestamp(v, range)}
            stroke={CHART_TEXT_COLOR}
            fontSize={AXIS_FONT_SIZE}
          />
          <YAxis stroke={CHART_TEXT_COLOR} fontSize={AXIS_FONT_SIZE} unit="%" domain={PERCENTAGE_DOMAIN} />
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
            strokeWidth={STROKE_WIDTH}
            name="CPU"
          />
          <Area
            type="monotone"
            dataKey="memory"
            stroke={CHART_COLORS.memory}
            fill="url(#memGradient)"
            strokeWidth={STROKE_WIDTH}
            name="Memory"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
