/** Shared chart theme utilities — reads CSS variables for dark/light support */

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
  healthy: 'hsl(var(--chart-1, 142 71% 45%))',
  degraded: 'hsl(var(--chart-2, 48 96% 53%))',
  offline: 'hsl(var(--chart-3, 0 84% 60%))',
  cpu: 'hsl(var(--chart-4, 262 83% 58%))',
  memory: 'hsl(var(--chart-5, 199 89% 48%))',
  success: 'hsl(var(--chart-1, 142 71% 45%))',
  error: 'hsl(var(--chart-3, 0 84% 60%))',
  critical: 'hsl(var(--chart-3, 0 84% 60%))',
  warning: 'hsl(var(--chart-2, 48 96% 53%))',
  info: 'hsl(var(--chart-5, 199 89% 48%))',
} as const

export const CHART_GRID_COLOR = 'hsl(var(--border, 0 0% 90%))'
export const CHART_TEXT_COLOR = 'hsl(var(--muted-foreground, 0 0% 45%))'

export const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: 'hsl(var(--popover, 0 0% 100%))',
    border: '1px solid hsl(var(--border, 0 0% 90%))',
    borderRadius: '8px',
    color: 'hsl(var(--popover-foreground, 0 0% 0%))',
    fontSize: '13px',
  },
} as const

export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d'

export function formatTimestamp(iso: string, range: TimeRange): string {
  const d = new Date(iso)
  switch (range) {
    case '1h':
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    case '6h':
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    case '24h':
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    case '7d':
      return d.toLocaleDateString([], { weekday: 'short', hour: '2-digit' })
    case '30d':
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
}
