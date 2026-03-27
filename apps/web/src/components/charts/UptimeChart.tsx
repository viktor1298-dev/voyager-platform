'use client'

import { useId } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  TOOLTIP_STYLE,
} from './chart-theme'

interface UptimeEntry {
  cluster: string
  uptime: number
  downtime: number
}

interface UptimeChartProps {
  data: UptimeEntry[]
}

/** Uptime thresholds for color coding */
const UPTIME_EXCELLENT_THRESHOLD = 99.9
const UPTIME_ACCEPTABLE_THRESHOLD = 99.0

/** X-axis domain for uptime chart (percentage range) */
const UPTIME_DOMAIN: [number, number] = [98, 100]

/** Y-axis width for cluster name labels */
const CLUSTER_LABEL_WIDTH = 120

const BAR_RADIUS: [number, number, number, number] = [0, 4, 4, 0]

function getUptimeColor(uptime: number): string {
  if (uptime >= UPTIME_EXCELLENT_THRESHOLD) return CHART_COLORS.healthy
  if (uptime >= UPTIME_ACCEPTABLE_THRESHOLD) return CHART_COLORS.degraded
  return CHART_COLORS.offline
}

export function UptimeChart({ data }: UptimeChartProps) {
  const chartId = useId()
  const summaryId = `${chartId}-summary`

  if (data.length === 0) {
    return (
      <div
        role="img"
        aria-label="Uptime percentage by cluster chart"
        className="flex items-center justify-center"
        style={{ height: CHART_HEIGHT }}
      >
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    )
  }

  return (
    <div role="img" aria-label="Uptime percentage by cluster chart" aria-describedby={summaryId}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={CHART_MARGIN} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
          <XAxis
            type="number"
            domain={UPTIME_DOMAIN}
            stroke={CHART_TEXT_COLOR}
            fontSize={AXIS_FONT_SIZE}
            unit="%"
          />
          <YAxis
            type="category"
            dataKey="cluster"
            stroke={CHART_TEXT_COLOR}
            fontSize={AXIS_FONT_SIZE}
            width={CLUSTER_LABEL_WIDTH}
            tick={({
              x,
              y,
              payload,
            }: {
              x: string | number
              y: string | number
              payload: { value: string }
            }) => (
              <text
                x={Number(x)}
                y={Number(y)}
                textAnchor="end"
                fill={CHART_TEXT_COLOR}
                fontSize={11}
                dy={4}
              >
                {payload.value.length > 15 ? `${payload.value.slice(0, 15)}...` : payload.value}
              </text>
            )}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: number | undefined) => [`${value ?? 0}%`, 'Uptime']}
          />
          <Bar
            dataKey="uptime"
            name="Uptime %"
            radius={BAR_RADIUS}
            animationBegin={0}
            animationDuration={CHART_ANIMATION.duration}
            animationEasing={CHART_ANIMATION.easing}
          >
            {data.map((entry) => (
              <Cell key={entry.cluster} fill={getUptimeColor(entry.uptime)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded" style={{ background: CHART_COLORS.healthy }} />{' '}
          &gt;99.9%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded" style={{ background: CHART_COLORS.degraded }} />{' '}
          &gt;99.0%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded" style={{ background: CHART_COLORS.offline }} />{' '}
          &lt;99.0%
        </span>
      </div>
      <p id={summaryId} className="sr-only">
        Uptime data for {data.length} clusters.{' '}
        {data.filter((d) => d.uptime >= UPTIME_EXCELLENT_THRESHOLD).length} excellent,{' '}
        {
          data.filter(
            (d) => d.uptime >= UPTIME_ACCEPTABLE_THRESHOLD && d.uptime < UPTIME_EXCELLENT_THRESHOLD,
          ).length
        }{' '}
        acceptable, {data.filter((d) => d.uptime < UPTIME_ACCEPTABLE_THRESHOLD).length} below
        threshold.
      </p>
    </div>
  )
}
