'use client'

import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'

interface SparklineChartProps {
  data: number[]
  color: string
  height?: number
  label?: string
  unit?: string
}

function SparklineTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
  unit?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs shadow-lg">
      <span className="font-mono font-medium text-[var(--color-text-primary)]">
        {payload[0]?.value ?? 0}{unit ? ` ${unit}` : ''}
      </span>
    </div>
  )
}

export function SparklineChart({ data, color, height = 60, label, unit }: SparklineChartProps) {
  const chartData = data.map((value, i) => ({ v: value, i }))
  const gradientId = `spark-${color.replace(/[^a-z0-9]/gi, '')}`

  return (
    <div style={{ height, overflow: 'hidden', width: '100%' }} role="img" aria-label={label ?? 'Sparkline chart'}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={chartData}
          margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            content={<SparklineTooltip unit={unit} />}
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Returns deterministic values [0,1) based on seed integer.
 */
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Convert a string seed to a numeric seed for mulberry32.
 */
function hashStringSeed(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash
}

/**
 * Generate stable 24h mock time-series data (48 points, 30min intervals).
 * Uses seeded PRNG so the same metricName always produces the same shape.
 *
 * @param metricName - stable seed string (e.g. 'nodes', 'pods')
 * @param currentValue - the most recent real value (last point)
 * @param variance - how much to vary from the baseline (default 0.15 = 15%)
 * @returns Array of 48 numbers representing the last 24h at 30min resolution
 */
export function generateStableTimeSeries(
  metricName: string,
  currentValue: number,
  variance = 0.15,
): number[] {
  const rand = mulberry32(hashStringSeed(metricName))
  const POINTS = 48
  const points: number[] = []

  // Start from a value close to current, wander back in time
  let value = currentValue * (0.85 + rand() * 0.15)
  for (let i = 0; i < POINTS - 1; i++) {
    value += (rand() - 0.48) * currentValue * variance
    value = Math.max(0, value)
    points.push(Math.round(value))
  }
  // Ensure final (most recent) point matches actual current value
  points.push(currentValue)
  return points
}


