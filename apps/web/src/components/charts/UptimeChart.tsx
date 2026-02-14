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
import { CHART_COLORS, CHART_GRID_COLOR, CHART_TEXT_COLOR, TOOLTIP_STYLE } from './chart-theme'

interface UptimeEntry {
  cluster: string
  uptime: number
  downtime: number
}

interface UptimeChartProps {
  data: UptimeEntry[]
}

function getUptimeColor(uptime: number): string {
  if (uptime >= 99.9) return CHART_COLORS.healthy
  if (uptime >= 99.0) return CHART_COLORS.degraded
  return CHART_COLORS.offline
}

export function UptimeChart({ data }: UptimeChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
        <XAxis type="number" domain={[98, 100]} stroke={CHART_TEXT_COLOR} fontSize={12} unit="%" />
        <YAxis
          type="category"
          dataKey="cluster"
          stroke={CHART_TEXT_COLOR}
          fontSize={12}
          width={120}
        />
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value: number) => [`${value}%`, 'Uptime']}
        />
        <Bar dataKey="uptime" name="Uptime %" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getUptimeColor(entry.uptime)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
