'use client'

import { trpc } from '@/lib/trpc'
import { useAuthStore } from '@/stores/auth'
import { useClusterContext } from '@/stores/cluster-context'
import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { NotificationsPanel } from './NotificationsPanel'
import { ThemeToggle } from './ThemeToggle'

type ClusterStatus = 'healthy' | 'warning' | 'error' | 'unknown'

function normalizeClusterStatus(status: string | null | undefined): ClusterStatus {
  const value = (status ?? 'unknown').toLowerCase()
  if (value === 'healthy' || value === 'active' || value === 'ready') return 'healthy'
  if (value === 'warning' || value === 'degraded') return 'warning'
  if (value === 'error' || value === 'critical' || value === 'down' || value === 'offline') return 'error'
  return 'unknown'
}

function statusDot(status: ClusterStatus): string {
  if (status === 'healthy') return '🟢'
  if (status === 'warning') return '🟡'
  if (status === 'error') return '🔴'
  return '⚪'
}

export function TopBar() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const { activeClusterId, setActiveCluster } = useClusterContext((s) => ({
    activeClusterId: s.activeClusterId,
    setActiveCluster: s.setActiveCluster,
  }))
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    if (isLoggingOut) return

    setIsLoggingOut(true)
    try {
      await useAuthStore.getState().logout()
    } finally {
      const loggedOutAt = Date.now()
      router.replace(`/login?loggedOut=1&loggedOutAt=${loggedOutAt}`)
      router.refresh()
      setIsLoggingOut(false)
    }
  }

  const liveQuery = trpc.clusters.live.useQuery(undefined, {
    refetchInterval: 30000,
    retry: 2,
  })

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
    ? data.events.filter((e: { type?: string | null; kind?: string | null }) => e.type === 'Warning' || e.kind === 'Warning').length
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
    if (activeClusterId == null) return
    const exists = clusterOptions.some((cluster) => cluster.id === activeClusterId)
    if (!exists) {
      setActiveCluster(null)
    }
  }, [activeClusterId, clusterOptions, setActiveCluster])

  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-50 flex items-center justify-between px-3 sm:px-6 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/95 backdrop-blur-lg">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-indigo-600 flex items-center justify-center text-white text-base shadow-lg shadow-indigo-500/20">
          🚀
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-extrabold bg-gradient-to-r from-[var(--color-text-primary)] to-[var(--color-text-secondary)] bg-clip-text text-transparent tracking-tight">
            Voyager
          </span>
          <span className="text-[10px] text-[var(--color-text-dim)] font-mono tracking-wider">
            PLATFORM
          </span>
        </div>
      </div>

      <div className="hidden sm:flex gap-6 items-center">
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/80 px-2.5 py-1.5">
          <span className="text-[10px] text-[var(--color-text-dim)] font-mono uppercase tracking-wide">Cluster</span>
          <select
            aria-label="Active cluster"
            value={activeClusterId ?? ''}
            onChange={(event) => setActiveCluster(event.target.value || null)}
            disabled={clustersQuery.isLoading || clusterOptions.length === 0}
            className="max-w-[190px] truncate rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs text-[var(--color-text-primary)] disabled:opacity-60"
          >
            <option value="">Select Cluster</option>
            {clusterOptions.map((cluster) => (
              <option key={cluster.id} value={cluster.id}>
                {cluster.label}
              </option>
            ))}
          </select>
        </div>
        <Stat label="Total Pods" value={totalPods} color="var(--color-accent)" />
        <Stat label="CPU Usage" value={cpuValue} color={statsQuery.data?.cpuPercent != null && statsQuery.data.cpuPercent > 80 ? 'var(--color-status-warning)' : 'var(--color-text-muted)'} />
        <Stat label="Alerts" value={alerts === null ? '—' : String(alerts)} color={alerts !== null && alerts > 0 ? 'var(--color-status-warning)' : 'var(--color-text-muted)'} />
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <span className="hidden sm:inline text-[11px] text-[var(--color-text-muted)] font-mono truncate max-w-[150px]">
            {user.name ?? user.email}
          </span>
        )}
        <ThemeToggle />
        <NotificationsPanel />
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex items-center gap-1.5 px-2.5 min-h-[44px] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] hover:bg-[var(--color-status-error)]/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          aria-label={isLoggingOut ? 'Logging out' : 'Logout'}
          title={isLoggingOut ? 'Logging out…' : 'Logout'}
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline text-[11px] font-medium">Logout</span>
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

function ConnectionStatus({ dataUpdatedAt, isDisconnected, isReconnecting }: {
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

  const borderColor = isDisconnected ? 'rgba(239, 68, 68, 0.3)' : 'var(--color-border)'
  const bgColor = isDisconnected ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255, 255, 255, 0.02)'

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
      style={{ borderColor, backgroundColor: bgColor }}
    >
      <span
        className={`h-2 w-2 rounded-full ${isDisconnected ? '' : 'animate-pulse-slow'}`}
        style={{ backgroundColor: dotColor }}
      />
      <span className="hidden sm:inline text-[11px] font-mono font-medium" style={{ color: dotColor }}>
        {statusText}
      </span>
      {!isDisconnected && (
        <span className="hidden sm:contents">
          <span className="text-[10px] text-[var(--color-text-dim)]">·</span>
          <span className="text-[10px] text-[var(--color-text-muted)] font-mono">Synced {syncLabel}</span>
        </span>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-sm font-extrabold leading-none" style={{ color }}>{value}</div>
      <div className="text-[9px] text-[var(--color-text-dim)] uppercase tracking-wider mt-0.5 font-mono">{label}</div>
    </div>
  )
}
