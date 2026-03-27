'use client'

import { useId } from 'react'
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

interface ScatterPoint {
  x: number
  y: number
  z: number
  type: string
}

const SEVERITY_MAP = { critical: 3, warning: 2, info: 1 } as const
const SEVERITY_LABELS = ['', 'Info', 'Warning', 'Critical'] as const

/** Y-axis domain with padding for scatter visibility */
const SEVERITY_DOMAIN: [number, number] = [0.5, 3.5]
const SEVERITY_TICKS = [1, 2, 3]

/** Bubble size range [min, max] in pixels */
const BUBBLE_SIZE_RANGE: [number, number] = [50, 400]

function mapToScatterPoints(points: AlertEntry[]): ScatterPoint[] {
  return points.map((d) => ({
    x: new Date(d.timestamp).getTime(),
    y: SEVERITY_MAP[d.severity],
    z: d.count,
    type: d.type,
  }))
}

export function AlertsTimelineChart({ data, range }: AlertsTimelineChartProps) {
  const chartId = useId()
  const summaryId = `${chartId}-summary`
  const criticalData = data.filter((d) => d.severity === 'critical')
  const warningData = data.filter((d) => d.severity === 'warning')
  const infoData = data.filter((d) => d.severity === 'info')

  if (data.length === 0) {
    return (
      <div
        role="img"
        aria-label="Alerts timeline by severity chart"
        className="flex items-center justify-center"
        style={{ height: CHART_HEIGHT }}
      >
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    )
  }

  return (
    <div role="img" aria-label="Alerts timeline by severity chart" aria-describedby={summaryId}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ScatterChart margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
          <XAxis
            type="number"
            dataKey="x"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => formatTimestamp(new Date(v).toISOString(), range)}
            stroke={CHART_TEXT_COLOR}
            fontSize={AXIS_FONT_SIZE}
            name="Time"
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={SEVERITY_DOMAIN}
            ticks={SEVERITY_TICKS}
            tickFormatter={(v: number) => SEVERITY_LABELS[v] ?? ''}
            stroke={CHART_TEXT_COLOR}
            fontSize={AXIS_FONT_SIZE}
            name="Severity"
          />
          <ZAxis type="number" dataKey="z" range={BUBBLE_SIZE_RANGE} name="Count" />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: number | undefined, name?: string) => {
              const safeValue = typeof value === 'number' ? value : 0
              if (name === 'Time') return formatTimestamp(new Date(safeValue).toISOString(), range)
              if (name === 'Severity') return SEVERITY_LABELS[safeValue] ?? safeValue
              return safeValue
            }}
          />
          <Legend />
          <Scatter
            name="Critical"
            data={mapToScatterPoints(criticalData)}
            fill={CHART_COLORS.critical}
          />
          <Scatter
            name="Warning"
            data={mapToScatterPoints(warningData)}
            fill={CHART_COLORS.warning}
          />
          <Scatter name="Info" data={mapToScatterPoints(infoData)} fill={CHART_COLORS.info} />
        </ScatterChart>
      </ResponsiveContainer>
      <p id={summaryId} className="sr-only">
        Alert counts: {criticalData.length} critical, {warningData.length} warning,{' '}
        {infoData.length} info
      </p>
    </div>
  )
}
