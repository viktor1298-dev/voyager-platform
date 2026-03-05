'use client'

import { Area, AreaChart, ResponsiveContainer } from 'recharts'

interface SparklineChartProps {
  data: number[]
  color: string
  height?: number
}

export function SparklineChart({ data, color, height = 60 }: SparklineChartProps) {
  const chartData = data.map((value, i) => ({ v: value, i }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#spark-${color.replace(/[^a-z0-9]/gi, '')})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// Generate mock 24h trend data (24 data points, one per hour)
export function generateMockTrend(base: number, volatility = 0.15): number[] {
  const points: number[] = []
  let current = base * (0.85 + Math.random() * 0.15)
  for (let i = 0; i < 24; i++) {
    current += (Math.random() - 0.48) * base * volatility
    current = Math.max(0, current)
    points.push(Math.round(current))
  }
  // Ensure last point is close to actual value
  points[23] = base
  return points
}
