'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export type TrendDirection = 'up' | 'down' | 'neutral'

interface SparklineProps {
  data: number[]
  color?: string
  height?: number
}

function Sparkline({ data, color = 'var(--color-brand)', height = 32 }: SparklineProps) {
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const width = 80
  const step = width / (data.length - 1)

  const points = data
    .map((v, i) => {
      const x = i * step
      const y = height - ((v - min) / range) * height
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="opacity-70"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface MetricCardProps {
  label: string
  value: string | number
  /** Optional trend indicator */
  trend?: TrendDirection
  /** Optional sparkline data points */
  sparklineData?: number[]
  /** Optional icon (lucide or any ReactNode) */
  icon?: ReactNode
  description?: string
  className?: string
  sparklineColor?: string
}

const TREND_CONFIG: Record<TrendDirection, { symbol: string; color: string }> = {
  up: { symbol: '↑', color: 'text-[var(--color-status-active)]' },
  down: { symbol: '↓', color: 'text-[var(--color-status-error)]' },
  neutral: { symbol: '→', color: 'text-[var(--color-text-muted)]' },
}

export function MetricCard({
  label,
  value,
  trend,
  sparklineData,
  icon,
  description,
  className,
  sparklineColor,
}: MetricCardProps) {
  const trendCfg = trend ? TREND_CONFIG[trend] : null

  return (
    <div
      className={cn(
        'relative rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:bg-[var(--color-surface-secondary)]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide truncate">
            {label}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-[var(--color-text-primary)] leading-none">
              {value}
            </span>
            {trendCfg && (
              <span className={cn('text-sm font-medium', trendCfg.color)}>
                {trendCfg.symbol}
              </span>
            )}
          </div>
          {description && (
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">{description}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-secondary)] text-[var(--color-brand)]">
              {icon}
            </div>
          )}
          {sparklineData && sparklineData.length > 1 && (
            <Sparkline data={sparklineData} color={sparklineColor} />
          )}
        </div>
      </div>
    </div>
  )
}
