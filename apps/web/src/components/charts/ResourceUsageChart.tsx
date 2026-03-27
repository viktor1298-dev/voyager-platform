'use client'

import { useId } from 'react'
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
  const chartId = useId()
  const cpuGradientId = `${chartId}-cpuGradient`
  const memGradientId = `${chartId}-memGradient`
  const summaryId = `${chartId}-summary`

  if (data.length === 0) {
    return (
      <div
        role="img"
        aria-label="CPU and memory resource usage over time chart"
        className="flex items-center justify-center"
        style={{ height: CHART_HEIGHT }}
      >
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    )
  }

  const lastPoint = data[data.length - 1]

  return (
    <div
      role="img"
      aria-label="CPU and memory resource usage over time chart"
      aria-describedby={summaryId}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={data} margin={CHART_MARGIN}>
          <defs>
            <linearGradient id={cpuGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.cpu} stopOpacity={GRADIENT_START_OPACITY} />
              <stop offset="95%" stopColor={CHART_COLORS.cpu} stopOpacity={GRADIENT_END_OPACITY} />
            </linearGradient>
            <linearGradient id={memGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={CHART_COLORS.memory}
                stopOpacity={GRADIENT_START_OPACITY}
              />
              <stop
                offset="95%"
                stopColor={CHART_COLORS.memory}
                stopOpacity={GRADIENT_END_OPACITY}
              />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(v: string) => formatTimestamp(v, range)}
            stroke={CHART_TEXT_COLOR}
            fontSize={AXIS_FONT_SIZE}
          />
          <YAxis
            stroke={CHART_TEXT_COLOR}
            fontSize={AXIS_FONT_SIZE}
            unit="%"
            domain={PERCENTAGE_DOMAIN}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            labelFormatter={(v) => formatTimestamp(v as string, range)}
            formatter={(value) => `${value}%`}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="cpu"
            stroke={CHART_COLORS.cpu}
            fill={`url(#${cpuGradientId})`}
            strokeWidth={STROKE_WIDTH}
            name="CPU"
          />
          <Area
            type="monotone"
            dataKey="memory"
            stroke={CHART_COLORS.memory}
            fill={`url(#${memGradientId})`}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray="6 3"
            name="Memory"
          />
        </AreaChart>
      </ResponsiveContainer>
      <p id={summaryId} className="sr-only">
        Latest values: CPU {lastPoint?.cpu ?? 0}%, Memory {lastPoint?.memory ?? 0}%
      </p>
    </div>
  )
}
