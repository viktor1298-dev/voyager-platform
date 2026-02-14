'use client'

import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import {
  CHART_COLORS,
  CHART_GRID_COLOR,
  CHART_TEXT_COLOR,
  TOOLTIP_STYLE,
  type TimeRange,
  formatTimestamp,
} from './chart-theme'

interface AlertEntry {
  timestamp: string
  severity: 'critical' | 'warning' | 'info'
  type: string
  count: number
}

interface AlertsTimelineChartProps {
  data: AlertEntry[]
  range: TimeRange
}

const SEVERITY_MAP = { critical: 3, warning: 2, info: 1 } as const
const SEVERITY_LABELS = ['', 'Info', 'Warning', 'Critical'] as const

export function AlertsTimelineChart({ data, range }: AlertsTimelineChartProps) {
  const criticalData = data.filter((d) => d.severity === 'critical')
  const warningData = data.filter((d) => d.severity === 'warning')
  const infoData = data.filter((d) => d.severity === 'info')

  const mapPoints = (points: AlertEntry[]) =>
    points.map((d) => ({
      x: new Date(d.timestamp).getTime(),
      y: SEVERITY_MAP[d.severity],
      z: d.count,
      type: d.type,
    }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
        <XAxis
          type="number"
          dataKey="x"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(v) => formatTimestamp(new Date(v).toISOString(), range)}
          stroke={CHART_TEXT_COLOR}
          fontSize={12}
          name="Time"
        />
        <YAxis
          type="number"
          dataKey="y"
          domain={[0.5, 3.5]}
          ticks={[1, 2, 3]}
          tickFormatter={(v) => SEVERITY_LABELS[v] ?? ''}
          stroke={CHART_TEXT_COLOR}
          fontSize={12}
          name="Severity"
        />
        <ZAxis type="number" dataKey="z" range={[50, 400]} name="Count" />
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value: number, name: string) => {
            if (name === 'Time') return formatTimestamp(new Date(value).toISOString(), range)
            if (name === 'Severity') return SEVERITY_LABELS[value] ?? value
            return value
          }}
        />
        <Legend />
        <Scatter name="Critical" data={mapPoints(criticalData)} fill={CHART_COLORS.critical} />
        <Scatter name="Warning" data={mapPoints(warningData)} fill={CHART_COLORS.warning} />
        <Scatter name="Info" data={mapPoints(infoData)} fill={CHART_COLORS.info} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}
