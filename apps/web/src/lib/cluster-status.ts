export type LiveHealthStatus = 'healthy' | 'degraded' | 'error' | 'unknown'

export function normalizeLiveHealthStatus(status: string | null | undefined): LiveHealthStatus {
  const value = (status ?? '').toLowerCase()
  if (value === 'healthy' || value === 'ready' || value === 'active' || value === 'ok') return 'healthy'
  if (value === 'degraded' || value === 'warning') return 'degraded'
  if (value === 'error' || value === 'critical' || value === 'unreachable') return 'error'
  return 'unknown'
}

export function healthBadgeVariant(status: LiveHealthStatus) {
  if (status === 'healthy') return 'success' as const
  if (status === 'degraded') return 'warning' as const
  if (status === 'error') return 'destructive' as const
  return 'outline' as const
}

export function healthBadgeLabel(status: LiveHealthStatus) {
  if (status === 'healthy') return 'Healthy'
  if (status === 'degraded') return 'Degraded'
  if (status === 'error') return 'Error'
  return 'Unknown'
}
