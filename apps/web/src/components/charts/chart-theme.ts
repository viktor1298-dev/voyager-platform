/** Shared chart theme utilities — reads CSS variables for dark/light support */

export const CHART_COLORS = {
  healthy: 'hsl(var(--chart-1, 142 71% 45%))',
  degraded: 'hsl(var(--chart-2, 48 96% 53%))',
  offline: 'hsl(var(--chart-3, 0 84% 60%))',
  cpu: 'hsl(var(--chart-4, 262 83% 58%))',
  memory: 'hsl(var(--chart-5, 199 89% 48%))',
  success: 'hsl(var(--chart-1, 142 71% 45%))',
  error: 'hsl(var(--chart-3, 0 84% 60%))',
  critical: 'hsl(0 84% 60%)',
  warning: 'hsl(48 96% 53%)',
  info: 'hsl(199 89% 48%)',
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

export type TimeRange = '24h' | '7d' | '30d'

export function formatTimestamp(iso: string, range: TimeRange): string {
  const d = new Date(iso)
  switch (range) {
    case '24h':
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    case '7d':
      return d.toLocaleDateString([], { weekday: 'short', hour: '2-digit' })
    case '30d':
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
}
