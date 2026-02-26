'use client'

import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { DataTable } from '@/components/DataTable'
import { LoadingState } from '@/components/LoadingState'
import { QueryError } from '@/components/ErrorBoundary'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { normalizeLiveHealthStatus, healthBadgeLabel } from '@/lib/cluster-status'
import { nodeStatusColor, severityColor } from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { Icon } from '@iconify/react'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowLeft, Server, Box, Globe, Cpu } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

function providerIcon(provider: string): string {
  const map: Record<string, string> = {
    minikube: 'simple-icons:kubernetes',
    aws: 'simple-icons:amazonaws',
    eks: 'simple-icons:amazoneks',
    gcp: 'simple-icons:googlecloud',
    gke: 'simple-icons:googlecloud',
    azure: 'simple-icons:microsoftazure',
    aks: 'simple-icons:microsoftazure',
    digitalocean: 'simple-icons:digitalocean',
    linode: 'simple-icons:linode',
  }
  return map[provider.toLowerCase()] ?? 'simple-icons:kubernetes'
}

function formatMemoryKi(ki: string): string {
  const match = ki.match(/^(\d+)Ki$/)
  if (!match) return ki
  const gb = Number(match[1]) / (1024 * 1024)
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(Number(match[1]) / 1024).toFixed(0)} MB`
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function asText(value: unknown, fallback = '—'): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : fallback
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  return fallback
}

interface NodeRow {
  id: string
  name: string
  status: string
  role: string
  kubeletVersion: string
  os: string
  cpu: string
  memory: string
}

interface EventRow {
  id: string
  type: string
  reason: string
  message: string
  namespace: string
  timestamp: string | null
}

const nodeColumns: ColumnDef<NodeRow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ getValue }) => (
      <span className="font-medium text-[var(--color-text-primary)] text-[13px]">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const status = getValue<string>()
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${nodeStatusColor(status)}`} />
          <span className="text-[var(--color-text-secondary)] text-[13px]">{status}</span>
        </span>
      )
    },
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-muted)] text-[13px]">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'kubeletVersion',
    header: 'Kubelet',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-secondary)] font-mono text-[12px]">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'os',
    header: 'OS',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-muted)] text-[12px]">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'cpu',
    header: 'CPU',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-secondary)] font-mono text-[12px]">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'memory',
    header: 'Memory',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-secondary)] font-mono text-[12px]">{getValue<string>()}</span>
    ),
  },
]

const eventColumns: ColumnDef<EventRow, unknown>[] = [
  {
    accessorKey: 'timestamp',
    header: 'Time',
    cell: ({ getValue }) => {
      const ts = getValue<string | null>()
      return (
        <span className="text-[var(--color-text-dim)] font-mono text-[11px] whitespace-nowrap">
          {ts ? timeAgo(ts) : '—'}
        </span>
      )
    },
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ getValue }) => {
      const type = getValue<string>()
      return (
        <span
          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
          style={{
            color: severityColor(type),
            background: `color-mix(in srgb, ${severityColor(type)} 15%, transparent)`,
          }}
        >
          {type}
        </span>
      )
    },
  },
  {
    accessorKey: 'reason',
    header: 'Reason',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-primary)] text-[13px] font-medium whitespace-nowrap">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'message',
    header: 'Message',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-muted)] text-[12px] max-w-[400px] truncate block">
        {getValue<string>()}
      </span>
    ),
  },
]

function HeaderSkeleton() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border)] p-6 mb-6" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center gap-4 mb-4">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div>
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={`stat-sk-${i}`} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export default function ClusterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const dbCluster = trpc.clusters.get.useQuery({ id })
  const resolvedId = dbCluster.data?.id ?? id
  const hasCredentials = Boolean((dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials)
  const isLive = hasCredentials

  const liveQuery = trpc.clusters.live.useQuery({ clusterId: resolvedId }, {
    enabled: isLive,
    refetchInterval: 30000,
    retry: false,
    staleTime: 30000,
  })

  // Fallback to stored data when live query fails
  const liveFailed = isLive && liveQuery.isError
  const effectiveIsLive = isLive && !liveFailed
  const [activeTab, setActiveTab] = useState(effectiveIsLive ? 'live' : 'stored')

  useEffect(() => {
    setActiveTab(effectiveIsLive ? 'live' : 'stored')
  }, [effectiveIsLive])

  const dbNodes = trpc.nodes.list.useQuery({ clusterId: resolvedId }, { enabled: !effectiveIsLive })
  const dbEvents = trpc.events.list.useQuery({ clusterId: resolvedId, limit: 20 }, { enabled: !effectiveIsLive })

  const isLoading = effectiveIsLive ? liveQuery.isLoading : dbCluster.isLoading

  // useMemo MUST be called before any early return to satisfy Rules of Hooks
  const lastConnectedAtRaw = (() => {
    const v = dbCluster.data?.lastConnectedAt
    if (!v) return null
    if (v instanceof Date) return v.toISOString()
    return String(v)
  })()

  const connectivity = useMemo(() => {
    const ts = lastConnectedAtRaw
    if (!ts) return { dot: 'bg-[var(--color-status-error)]', label: 'Disconnected' }

    const diffMins = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60000))
    if (diffMins < 10) return { dot: 'bg-[var(--color-status-active)]', label: `Connected ${diffMins} min ago` }
    if (diffMins <= 30) return { dot: 'bg-[var(--color-status-warning)]', label: `Last seen ${diffMins} min ago` }
    return { dot: 'bg-[var(--color-status-error)]', label: 'Disconnected' }
  }, [lastConnectedAtRaw])

  const error = dbCluster.error
  if (!isLoading && error) {
    return (
      <AppLayout>
        <Breadcrumbs />
        <QueryError message={error.message} onRetry={() => dbCluster.refetch()} />
      </AppLayout>
    )
  }

  if (isLoading) {
    return (
      <AppLayout>
        <Breadcrumbs />
        <LoadingState message="Loading cluster details..." />
      </AppLayout>
    )
  }

  const liveData = liveQuery.data
  const cluster = effectiveIsLive
    ? {
        name: liveData?.name ?? 'minikube',
        provider: String(liveData?.provider ?? 'minikube'),
        version: String(liveData?.version ?? '—'),
        status: liveData?.status ?? 'unknown',
        healthStatus: String((dbCluster.data as Record<string, unknown>)?.healthStatus ?? dbCluster.data?.status ?? liveData?.status ?? 'unknown'),
        liveStatus: liveData?.status ?? 'unknown',
        endpoint: liveData?.endpoint ?? '—',
        nodeCount: liveData?.nodes?.length ?? 0,
        podCount: liveData?.totalPods ?? 0,
        runningPods: liveData?.runningPods ?? 0,
        namespaceCount: liveData?.namespaces?.length ?? 0,
        lastConnectedAt: (() => {
          const v = dbCluster.data?.lastConnectedAt
          if (!v) return null
          if (v instanceof Date) return v.toISOString()
          return String(v)
        })(),
      }
    : {
        name: String(dbCluster.data?.name ?? ''),
        provider: String(dbCluster.data?.provider ?? ''),
        version: String(dbCluster.data?.version ?? '—'),
        status: String(dbCluster.data?.status ?? 'unknown'),
        healthStatus: String((dbCluster.data as Record<string, unknown>)?.healthStatus ?? dbCluster.data?.status ?? 'unknown'),
        endpoint: String((dbCluster.data as Record<string, unknown>)?.endpoint ?? '—'),
        lastConnectedAt: (() => {
          const v = dbCluster.data?.lastConnectedAt
          if (!v) return null
          if (v instanceof Date) return v.toISOString()
          return String(v)
        })(),
        nodeCount: dbNodes.data?.length ?? 0,
        podCount: 0,
        runningPods: 0,
        namespaceCount: 0,
      }

  const nodes: NodeRow[] = effectiveIsLive
    ? (liveData?.nodes ?? []).map((n, i: number) => ({
        id: `node-${i}`,
        name: asText(n.name, ''),
        status:
          n.status === 'ready'
            ? 'Ready'
            : n.status === 'notready'
              ? 'NotReady'
              : asText(n.status, 'Unknown'),
        role: asText(n.role, 'worker'),
        kubeletVersion: asText(n.kubeletVersion),
        os: asText(n.os),
        cpu: asText(n.cpu),
        memory: typeof n.memory === 'string' ? formatMemoryKi(n.memory) : '—',
      }))
    : (dbNodes.data ?? []).map((n: Record<string, unknown>, i: number) => ({
        id: asText(n.id, `node-db-${i}`),
        name: asText(n.name),
        status: asText(n.status, 'Unknown'),
        role: asText(n.role, 'worker'),
        kubeletVersion: asText(n.k8sVersion),
        os: asText(n.os),
        cpu: `${asText(n.cpuAllocatable)} / ${asText(n.cpuCapacity)}`,
        memory: `${asText(n.memoryAllocatable)} / ${asText(n.memoryCapacity)}`,
      }))

  const events: EventRow[] = effectiveIsLive
    ? (liveData?.events ?? []).slice(0, 20).map((e: Record<string, unknown>, i: number) => ({
        id: `ev-${i}`,
        type: asText(e.type, 'Normal'),
        reason: asText(e.reason),
        message: asText(e.message, ''),
        namespace: asText(e.namespace, ''),
        timestamp: typeof e.lastTimestamp === 'string' ? e.lastTimestamp : null,
      }))
    : (dbEvents.data ?? []).slice(0, 20).map((e: Record<string, unknown>, i: number) => ({
        id: asText(e.id, `ev-db-${i}`),
        type: asText(e.kind, 'Normal'),
        reason: asText(e.reason),
        message: asText(e.message, ''),
        namespace: asText(e.namespace, ''),
        timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : (typeof e.timestamp === 'string' ? e.timestamp : null),
      }))

  const rawStatus = typeof (cluster.healthStatus ?? cluster.status) === 'string' ? (cluster.healthStatus ?? cluster.status) : 'unknown'
  const normalizedStatus = normalizeLiveHealthStatus(rawStatus)

  const statusDotClass = normalizedStatus === 'healthy'
    ? 'bg-[var(--color-status-active)]'
    : normalizedStatus === 'degraded'
      ? 'bg-[var(--color-status-warning)]'
      : normalizedStatus === 'error'
        ? 'bg-[var(--color-status-error)]'
        : 'bg-gray-400'

  const statusLabel = healthBadgeLabel(normalizedStatus)

  return (
    <AppLayout>
      <Breadcrumbs />

      <button type="button" onClick={() => router.back()} className="flex items-center gap-1.5 text-[var(--color-accent)] hover:underline text-xs font-mono mb-5">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {/* Header Card */}
      <div className="rounded-2xl bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border)] p-6 mb-6" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-start gap-4 mb-5">
          <div className="h-11 w-11 rounded-xl bg-white/[0.05] border border-[var(--color-border)] flex items-center justify-center">
            <Icon icon={providerIcon(cluster.provider)} className="h-6 w-6 text-[var(--color-accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
                {cluster.name}
              </h1>
              <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass} animate-pulse`} />
              <span
                className={`h-2.5 w-2.5 rounded-full ${connectivity.dot}`}
                title={connectivity.label}
                aria-label={`Connectivity: ${connectivity.label}`}
              />
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.05] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
                {statusLabel}
              </span>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
                <TabsList className="h-7 px-0.5 py-0.5">
                  <TabsTrigger
                    value="live"
                    disabled={!effectiveIsLive}
                    title={!effectiveIsLive ? 'Live data unavailable for this cluster' : 'Live data'}
                    className="h-6 px-2 text-[10px] font-mono"
                  >
                    Live Data
                  </TabsTrigger>
                  <TabsTrigger value="stored" className="h-6 px-2 text-[10px] font-mono">
                    Stored Data
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20">
                {cluster.provider}
              </span>
            </div>
            <p className="text-[12px] text-[var(--color-text-dim)] font-mono mt-1 break-all">
              Kubernetes {cluster.version} • {cluster.endpoint}
              {cluster.lastConnectedAt && (
                <span className="ml-2 text-[var(--color-text-dim)]">• Last seen: {timeAgo(cluster.lastConnectedAt)}</span>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: Server, label: 'Nodes', value: String(cluster.nodeCount) },
            { icon: Box, label: 'Pods', value: effectiveIsLive ? `${cluster.runningPods} / ${cluster.podCount}` : String(cluster.podCount || '—') },
            { icon: Globe, label: 'Namespaces', value: String(cluster.namespaceCount || '—') },
            { icon: Cpu, label: 'Version', value: cluster.version },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-white/[0.03] border border-[var(--color-border)] p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
                <span className="text-[10px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider">{stat.label}</span>
              </div>
              <p className="text-lg font-bold text-[var(--color-text-primary)]">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Nodes Table — DataTable */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Server className="h-4 w-4 text-[var(--color-text-dim)]" />
          <h2 className="text-base font-extrabold tracking-tight text-[var(--color-text-primary)]">
            Nodes ({nodes.length})
          </h2>
        </div>
        <DataTable
          data={nodes}
          columns={nodeColumns}
          loading={effectiveIsLive ? liveQuery.isLoading : dbNodes.isLoading}
          emptyTitle="No nodes found"
          mobileCard={(node) => (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium text-[var(--color-text-primary)] text-sm">{node.name}</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${nodeStatusColor(node.status)}`} />
                  <span className="text-[var(--color-text-secondary)] text-xs">{node.status}</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="text-[var(--color-text-muted)]">Role</span>
                <span className="text-[var(--color-text-primary)]">{node.role}</span>
                <span className="text-[var(--color-text-muted)]">Kubelet</span>
                <span className="text-[var(--color-text-primary)] font-mono">{node.kubeletVersion}</span>
                <span className="text-[var(--color-text-muted)]">OS</span>
                <span className="text-[var(--color-text-primary)]">{node.os}</span>
                <span className="text-[var(--color-text-muted)]">CPU</span>
                <span className="text-[var(--color-text-primary)] font-mono">{node.cpu}</span>
                <span className="text-[var(--color-text-muted)]">Memory</span>
                <span className="text-[var(--color-text-primary)] font-mono">{node.memory}</span>
              </div>
            </div>
          )}
        />
      </div>

      {/* Recent Events — DataTable */}
      <div>
        <h2 className="text-base font-extrabold tracking-tight text-[var(--color-text-primary)] mb-3">
          Recent Events
        </h2>
        <DataTable
          data={events}
          columns={eventColumns}
          loading={effectiveIsLive ? liveQuery.isLoading : dbEvents.isLoading}
          emptyTitle="No events found"
          searchable
          searchPlaceholder="Search events…"
          mobileCard={(event) => {
            const isWarning = event.type === 'Warning'
            return (
              <div className={`p-3 rounded-lg border border-[var(--color-border)] ${isWarning ? 'bg-[var(--color-status-warning)]/[0.04]' : 'bg-[var(--color-bg-card)]'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                      style={{
                        color: severityColor(event.type),
                        background: `color-mix(in srgb, ${severityColor(event.type)} 15%, transparent)`,
                      }}
                    >
                      {event.type}
                    </span>
                    <span className="text-[var(--color-text-primary)] text-xs font-medium">{event.reason}</span>
                  </div>
                  <span className="text-[var(--color-text-dim)] font-mono text-[10px] shrink-0">
                    {event.timestamp ? timeAgo(event.timestamp) : '—'}
                  </span>
                </div>
                <p className="text-[var(--color-text-muted)] text-xs line-clamp-2">{event.message}</p>
              </div>
            )
          }}
        />
      </div>
    </AppLayout>
  )
}
