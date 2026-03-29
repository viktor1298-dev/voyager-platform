'use client'

import { authClient } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'
import { useAuthStore } from '@/stores/auth'
import { useClusterContext } from '@/stores/cluster-context'
import { LogOut, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NotificationsPanel } from './NotificationsPanel'
import { ThemeToggle } from './ThemeToggle'

type ClusterStatus = 'healthy' | 'warning' | 'error' | 'unknown'

function normalizeClusterStatus(status: string | null | undefined): ClusterStatus {
  const value = (status ?? 'unknown').toLowerCase()
  if (value === 'healthy' || value === 'active' || value === 'ready') return 'healthy'
  if (value === 'warning' || value === 'degraded') return 'warning'
  if (value === 'error' || value === 'critical' || value === 'down' || value === 'offline')
    return 'error'
  return 'unknown'
}

function statusDot(status: ClusterStatus): string {
  if (status === 'healthy') return '🟢'
  if (status === 'warning') return '🟡'
  if (status === 'error') return '🔴'
  return '⚪'
}

export function TopBar() {
  const logoSrc = '/logo-mark.svg'
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const activeClusterId = useClusterContext((s) => s.activeClusterId)
  const setActiveCluster = useClusterContext((s) => s.setActiveCluster)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (isLoggingOut) return

    setIsLoggingOut(true)

    const loggedOutAt = Date.now()

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('logoutInProgress', String(loggedOutAt))
    }

    try {
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const returnUrl =
        currentPath.startsWith('/') && !currentPath.startsWith('//') ? currentPath : '/'

      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {},
        },
      })

      const loginUrl = new URL('/login', window.location.origin)
      loginUrl.searchParams.set('loggedOut', '1')
      loginUrl.searchParams.set('loggedOutAt', String(loggedOutAt))
      if (returnUrl !== '/') {
        loginUrl.searchParams.set('returnUrl', returnUrl)
      }
      window.location.replace(`${loginUrl.pathname}?${loginUrl.searchParams.toString()}`)
    } finally {
      useAuthStore.getState().clearUser()
    }
  }

  const liveQuery = trpc.clusters.live.useQuery(
    { clusterId: activeClusterId ?? '' },
    {
      retry: 2,
      enabled: Boolean(activeClusterId),
    },
  )

  const clustersQuery = trpc.clusters.list.useQuery(undefined, {
    refetchInterval: 60000,
    retry: 2,
  })

  const statsQuery = trpc.metrics.currentStats.useQuery(undefined, {
    refetchInterval: 30000,
    retry: 1,
  })

  const isConnected = !liveQuery.isError && liveQuery.data !== undefined
  const isReconnecting = liveQuery.isLoading && liveQuery.dataUpdatedAt > 0
  const isDisconnected = liveQuery.isError

  const data = isConnected ? liveQuery.data : undefined
  const totalPods = data ? `${data.runningPods}/${data.totalPods}` : '—'
  const alerts = data
    ? data.events.filter(
        (e: { type?: string | null; kind?: string | null }) =>
          e.type === 'Warning' || e.kind === 'Warning',
      ).length
    : null

  const cpuValue =
    statsQuery.data?.cpuPercent != null
      ? `${statsQuery.data.cpuPercent.toFixed(1)}%`
      : statsQuery.isLoading
        ? '…'
        : '0%'

  const clusterOptions = useMemo(
    () =>
      (clustersQuery.data ?? []).map((cluster) => {
        const status = normalizeClusterStatus((cluster as { status?: string | null }).status)
        return {
          id: String(cluster.id),
          name: cluster.name,
          status,
          label: `${statusDot(status)} ${cluster.name}`,
        }
      }),
    [clustersQuery.data],
  )

  useEffect(() => {
    // Only validate when clusters have actually loaded — if we run this while
    // clustersQuery is still fetching, clusterOptions is empty and we'd
    // incorrectly clear the persisted activeClusterId on direct navigation /
    // hard refresh (BUG-001 fix).
    if (!clustersQuery.isSuccess) return
    if (activeClusterId == null) return
    const exists = clusterOptions.some((cluster) => cluster.id === activeClusterId)
    if (!exists) {
      setActiveCluster(null)
    }
  }, [activeClusterId, clusterOptions, clustersQuery.isSuccess, setActiveCluster])

  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-50 flex items-center justify-between px-3 sm:px-6 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/95 backdrop-blur-lg">
      <div className="flex items-center gap-2.5">
        <img src={logoSrc} alt="Voyager" className="h-8 w-8 object-contain" aria-hidden="true" />
        <span className="font-semibold text-sm tracking-wide text-foreground text-[var(--color-text-primary)]">
          VOYAGER
        </span>
      </div>

      {/* P1-008: Simplified top bar — cluster selector + key metric only */}
      <div className="hidden sm:flex gap-3 items-center">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/80 px-2.5 py-1.5">
          <select
            aria-label="Active cluster"
            value={activeClusterId ?? ''}
            onChange={(event) => setActiveCluster(event.target.value || null)}
            disabled={clustersQuery.isLoading || clusterOptions.length === 0}
            className="max-w-[200px] truncate rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs text-[var(--color-text-primary)] disabled:opacity-60"
          >
            <option value="">Select Cluster</option>
            {clusterOptions.map((cluster) => (
              <option key={cluster.id} value={cluster.id}>
                {cluster.label}
              </option>
            ))}
          </select>
        </div>
        {alerts !== null && alerts > 0 && (
          <Stat label="Alerts" value={String(alerts)} color="var(--color-status-warning)" />
        )}
        <Stat
          label="CPU"
          value={cpuValue}
          color={
            statsQuery.data?.cpuPercent != null && statsQuery.data.cpuPercent > 80
              ? 'var(--color-status-warning)'
              : 'var(--color-text-muted)'
          }
        />
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <span className="hidden sm:inline text-xs text-[var(--color-text-muted)] font-mono truncate max-w-[150px]">
            {user.name ?? user.email}
          </span>
        )}
        <button
          type="button"
          onClick={() =>
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
          }
          className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/60 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] transition-colors"
          title="Command Palette (⌘K)"
          aria-label="Open command palette"
        >
          <Search className="h-3 w-3" />
          <kbd className="text-xs font-mono">⌘K</kbd>
        </button>
        <ThemeToggle />
        <NotificationsPanel />
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          aria-label={isLoggingOut ? 'Logging out' : 'Logout'}
          title={isLoggingOut ? 'Logging out…' : 'Logout'}
          className="flex items-center gap-1.5 px-2.5 min-h-[44px] min-w-[44px] justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] hover:bg-[var(--color-status-error)]/10 transition-colors disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline text-xs font-medium">Logout</span>
        </button>
        <ConnectionStatus
          dataUpdatedAt={liveQuery.dataUpdatedAt}
          isDisconnected={isDisconnected}
          isReconnecting={isReconnecting}
        />
      </div>
    </header>
  )
}

function ConnectionStatus({
  dataUpdatedAt,
  isDisconnected,
  isReconnecting,
}: {
  dataUpdatedAt?: number
  isDisconnected: boolean
  isReconnecting: boolean
}) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(interval)
  }, [])

  const secondsAgo = now !== null && dataUpdatedAt ? Math.floor((now - dataUpdatedAt) / 1000) : 0
  const syncLabel = now === null || secondsAgo < 5 ? 'just now' : secondsAgo + 's ago'

  const dotColor = isDisconnected
    ? 'var(--color-status-error, #ef4444)'
    : isReconnecting
      ? 'var(--color-status-warning)'
      : 'var(--color-status-active)'

  const statusText = isDisconnected
    ? 'Disconnected'
    : isReconnecting
      ? 'Reconnecting…'
      : 'Connected'

  const borderColor = isDisconnected
    ? 'color-mix(in srgb, var(--color-status-error) 30%, transparent)'
    : 'var(--color-border)'
  const bgColor = isDisconnected
    ? 'color-mix(in srgb, var(--color-status-error) 5%, transparent)'
    : 'var(--color-bg-secondary)'

  return (
    <div
      aria-live="polite"
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border"
      style={{ borderColor, backgroundColor: bgColor }}
      title={`${statusText}${!isDisconnected ? ` · Synced ${syncLabel}` : ''}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${isDisconnected ? '' : 'animate-pulse-slow'}`}
        style={{ backgroundColor: dotColor }}
      />
      <span className="hidden sm:inline text-xs font-mono font-medium" style={{ color: dotColor }}>
        {isDisconnected ? 'Disconnected' : isReconnecting ? 'Reconnecting…' : 'Live'}
      </span>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-sm font-extrabold leading-none" style={{ color }}>
        {value}
      </div>
      <div className="text-xs text-[var(--color-text-dim)] uppercase tracking-wider mt-0.5 font-mono">
        {label}
      </div>
    </div>
  )
}
