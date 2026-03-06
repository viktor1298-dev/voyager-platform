'use client'

import { useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'

interface SparklineChartProps {
  data: number[]
  color: string
  height?: number
}

export function SparklineChart({ data, color, height = 60 }: SparklineChartProps) {
  const chartData = data.map((value, i) => ({ v: value, i }))
  const gradientId = `spark-${color.replace(/[^a-z0-9]/gi, '')}`

  return (
    <div style={{ height, overflow: 'hidden', width: '100%' }}>
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
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
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

/**
 * Calculate 24h delta: difference between last point (now) and first point (24h ago).
 */
export function calculate24hDelta(timeSeries: number[]): number {
  if (timeSeries.length < 2) return 0
  const now = timeSeries[timeSeries.length - 1] ?? 0
  const then = timeSeries[0] ?? 0
  return now - then
}

/**
 * Legacy helper — generates 24 hourly data points.
 * @deprecated Use generateStableTimeSeries with a metricName for deterministic output.
 */
export function generateMockTrend(base: number, volatility = 0.15): number[] {
  return generateStableTimeSeries(`legacy-${base}`, base, volatility)
}

/**
 * Hook: returns stable sparkline data memoized by metricName.
 * Use this inside components to avoid re-generating on every render.
 */
export function useStableSparkline(
  metricName: string,
  currentValue: number,
  variance = 0.15,
): { data: number[]; delta: number } {
  const data = useMemo(
    () => generateStableTimeSeries(metricName, currentValue, variance),
    // Only recalculate when metricName changes; currentValue is baked into last point
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metricName],
  )

  const delta = useMemo(() => calculate24hDelta(data), [data])

  return { data, delta }
}
