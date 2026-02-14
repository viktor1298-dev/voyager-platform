'use client'

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
  return (
    <div role="img" aria-label="Uptime percentage by cluster chart">
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
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: number) => [`${value}%`, 'Uptime']}
          />
          <Bar dataKey="uptime" name="Uptime %" radius={BAR_RADIUS}>
            {data.map((entry) => (
              <Cell key={entry.cluster} fill={getUptimeColor(entry.uptime)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
