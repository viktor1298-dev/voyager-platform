'use client'

import { useId } from 'react'
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
  CHART_ANIMATION,
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
  const chartId = useId()
  const summaryId = `${chartId}-summary`

  if (data.length === 0) {
    return (
      <div
        role="img"
        aria-label="Cluster health over time chart"
        className="flex items-center justify-center"
        style={{ height: CHART_HEIGHT }}
      >
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    )
  }

  const lastPoint = data[data.length - 1]

  return (
    <div role="img" aria-label="Cluster health over time chart" aria-describedby={summaryId}>
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
            formatter={(value) => `${value}%`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="healthy"
            stroke={CHART_COLORS.healthy}
            strokeWidth={STROKE_WIDTH}
            dot={false}
            name="Healthy"
            animationBegin={0}
            animationDuration={CHART_ANIMATION.duration}
            animationEasing={CHART_ANIMATION.easing}
          />
          <Line
            type="monotone"
            dataKey="degraded"
            stroke={CHART_COLORS.degraded}
            strokeWidth={STROKE_WIDTH}
            dot={false}
            name="Degraded"
            animationBegin={CHART_ANIMATION.staggerDelay}
            animationDuration={CHART_ANIMATION.duration}
            animationEasing={CHART_ANIMATION.easing}
          />
          <Line
            type="monotone"
            dataKey="offline"
            stroke={CHART_COLORS.offline}
            strokeWidth={STROKE_WIDTH}
            dot={false}
            name="Offline"
            animationBegin={CHART_ANIMATION.staggerDelay * 2}
            animationDuration={CHART_ANIMATION.duration}
            animationEasing={CHART_ANIMATION.easing}
          />
        </LineChart>
      </ResponsiveContainer>
      <p id={summaryId} className="sr-only">
        Latest values: Healthy {lastPoint?.healthy ?? 0}%, Degraded {lastPoint?.degraded ?? 0}%,
        Offline {lastPoint?.offline ?? 0}%
      </p>
    </div>
  )
}
