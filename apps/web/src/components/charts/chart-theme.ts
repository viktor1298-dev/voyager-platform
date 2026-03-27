/** Shared chart theme utilities — reads CSS variables for dark/light support */

import { CHART_ANIMATION } from '@/lib/animation-constants'

export { CHART_ANIMATION }

/** Default chart height in pixels */
export const CHART_HEIGHT = 300

/** Standard chart margins */
export const CHART_MARGIN = { top: 5, right: 20, bottom: 5, left: 0 } as const

/** Default axis font size */
export const AXIS_FONT_SIZE = 12

/** Default line stroke width */
export const STROKE_WIDTH = 2

/** Metrics query stale time (ms) — how long data is considered fresh */
export const METRICS_STALE_TIME = 60_000

/** Metrics query garbage collection time (ms) — how long unused data stays in cache */
export const METRICS_GC_TIME = 300_000

/** Max query retry count */
export const QUERY_RETRY_COUNT = 3

export const CHART_COLORS = {
  healthy: 'var(--color-chart-pods)',
  degraded: 'var(--color-chart-warning)',
  offline: 'var(--color-chart-critical)',
  cpu: 'var(--color-chart-cpu)',
  memory: 'var(--color-chart-mem)',
  success: 'var(--color-chart-pods)',
  error: 'var(--color-chart-critical)',
  critical: 'var(--color-chart-critical)',
  warning: 'var(--color-chart-warning)',
  info: 'var(--color-chart-info)',
} as const

export const CHART_GRID_COLOR = 'var(--color-grid-line)'
export const CHART_TEXT_COLOR = 'var(--color-text-dim)'

export const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: '0.5rem',
    color: 'var(--color-text-primary)',
    fontSize: '0.75rem',
  },
} as const

export type TimeRange = '5m' | '15m' | '30m' | '1h' | '3h' | '6h' | '12h' | '24h' | '2d' | '7d'

export function formatTimestamp(iso: string, range: TimeRange): string {
  const d = new Date(iso)
  switch (range) {
    case '5m':
    case '15m':
    case '30m':
    case '1h':
    case '3h':
    case '6h':
    case '12h':
    case '24h':
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    case '2d':
    case '7d':
      return d.toLocaleDateString([], { weekday: 'short', hour: '2-digit' })
  }
}

/**
 * Shared threshold-to-color mapping for resource gauges/bars.
 * Returns CSS variable references for theme-aware coloring.
 */
export function getThresholdColor(value: number, metric: 'cpu' | 'memory'): string {
  if (value > 85) return 'var(--color-threshold-critical)'
  if (value > 65) return 'var(--color-threshold-warn)'
  return metric === 'cpu' ? 'var(--color-chart-cpu)' : 'var(--color-chart-mem)'
}

/**
 * Format a percentage for display — `Math.round` for badges, `toFixed(1)` for charts.
 */
export function formatPercent(value: number, precision: 'chart' | 'badge' = 'badge'): string {
  return precision === 'chart' ? `${value.toFixed(1)}%` : `${Math.round(value)}%`
}
