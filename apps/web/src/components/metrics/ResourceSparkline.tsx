'use client'

/**
 * M-P3-002: Real-time sparklines for Services table rows.
 * Shows last 5 minutes of CPU + Memory trend at 5-second resolution (from poll).
 * Data source: metrics.history with range='1h', showing the rightmost N points.
 */

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { trpc } from '@/lib/trpc'

interface SparklinePoint {
  cpu: number
  memory: number
}

interface ResourceSparklineProps {
  clusterId: string
  /** Number of rightmost data points to show (default: 12 = last ~5min at 1h range with 60 buckets) */
  points?: number
  /** Width in pixels (default: 80) */
  width?: number
  /** Height in pixels (default: 28) */
  height?: number
  showTooltip?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SparklineTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as SparklinePoint | undefined
  if (!d) return null
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-[10px] font-mono shadow-lg">
      <div style={{ color: 'hsl(262,83%,58%)' }}>CPU {d.cpu}%</div>
      <div style={{ color: 'hsl(199,89%,48%)' }}>Mem {d.memory}%</div>
    </div>
  )
}

export function ResourceSparkline({
  clusterId,
  points = 12,
  width = 80,
  height = 28,
  showTooltip = true,
}: ResourceSparklineProps) {
  const { data, isLoading } = trpc.metrics.history.useQuery(
    { clusterId, range: '1h' },
    {
      refetchInterval: 30_000,
      staleTime: 30_000,
    },
  )

  const sparkData: SparklinePoint[] = useMemo(() => {
    if (!data?.length) return []
    // Take the last N points for the sparkline
    return data.slice(-points).map((d) => ({
      cpu: d.cpu,
      memory: d.memory,
    }))
  }, [data, points])

  if (isLoading) {
    return (
      <div
        className="rounded bg-white/5 animate-pulse"
        style={{ width, height }}
        aria-label="Loading sparkline..."
      />
    )
  }

  if (sparkData.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded border border-dashed border-[var(--color-border)]"
        style={{ width, height }}
        title="Insufficient data for sparkline"
      >
        <span className="text-[9px] text-[var(--color-text-dim)] font-mono">—</span>
      </div>
    )
  }

  const lastPoint = sparkData[sparkData.length - 1]
  const cpuColor = (lastPoint?.cpu ?? 0) > 85
    ? 'hsl(0,84%,60%)'
    : (lastPoint?.cpu ?? 0) > 65
    ? 'hsl(48,96%,53%)'
    : 'hsl(262,83%,58%)'
  const memColor = (lastPoint?.memory ?? 0) > 85
    ? 'hsl(0,84%,60%)'
    : (lastPoint?.memory ?? 0) > 65
    ? 'hsl(48,96%,53%)'
    : 'hsl(199,89%,48%)'

  return (
    <div className="flex items-center gap-1.5" title={`CPU: ${lastPoint?.cpu ?? 0}% | Mem: ${lastPoint?.memory ?? 0}%`}>
      <ResponsiveContainer width={width} height={height}>
        <LineChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          {showTooltip && <Tooltip content={<SparklineTooltip />} />}
          <Line
            type="monotone"
            dataKey="cpu"
            stroke={cpuColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="memory"
            stroke={memColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            strokeDasharray="2 2"
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-0.5 shrink-0">
        <span className="text-[9px] font-mono tabular-nums leading-none" style={{ color: cpuColor }}>
          {lastPoint?.cpu ?? 0}%
        </span>
        <span className="text-[9px] font-mono tabular-nums leading-none" style={{ color: memColor }}>
          {lastPoint?.memory ?? 0}%
        </span>
      </div>
    </div>
  )
}
