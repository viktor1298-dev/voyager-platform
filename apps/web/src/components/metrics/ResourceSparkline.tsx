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
  points?: number
  width?: number
  height?: number
  showTooltip?: boolean
}

function SparklineTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: SparklinePoint }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs font-mono shadow-lg">
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
    // Filter out null-filled gaps, then take the last N non-null points for sparkline
    return data
      .filter((d) => typeof d.cpu === 'number' && typeof d.memory === 'number')
      .slice(-points)
      .map((d) => ({
        cpu: d.cpu as number,
        memory: d.memory as number,
      }))
  }, [data, points])

  if (isLoading) {
    return (
      <div
        className="animate-pulse rounded bg-white/5"
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
        <span className="font-mono text-xs text-[var(--color-text-dim)]">—</span>
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
      <div className="shrink-0 flex flex-col gap-0.5">
        <span className="font-mono tabular-nums leading-none text-xs" style={{ color: cpuColor }}>
          {lastPoint?.cpu ?? 0}%
        </span>
        <span className="font-mono tabular-nums leading-none text-xs" style={{ color: memColor }}>
          {lastPoint?.memory ?? 0}%
        </span>
      </div>
    </div>
  )
}
