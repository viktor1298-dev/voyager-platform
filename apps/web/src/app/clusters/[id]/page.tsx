'use client'

import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { LoadingState } from '@/components/LoadingState'
import { QueryError } from '@/components/ErrorBoundary'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTimestamp } from '@/lib/formatters'
import { nodeStatusColor, severityColor } from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { Icon } from '@iconify/react'
import { ArrowLeft, ChevronRight, Server, Box, Globe, Cpu, HardDrive } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

const LIVE_CLUSTER_ID = 'live-minikube'

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

function HeaderSkeleton() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border)] p-6 mb-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
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

function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={`tbl-sk-${i}`} className="h-10 w-full" />
      ))}
    </div>
  )
}

export default function ClusterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const isLive = id === LIVE_CLUSTER_ID

  // Live cluster — single query has everything
  const liveQuery = trpc.clusters.live.useQuery(undefined, {
    enabled: isLive,
    refetchInterval: 30000,
  })

  // DB cluster — separate queries
  const dbCluster = trpc.clusters.get.useQuery({ id }, { enabled: !isLive })
  const dbNodes = trpc.nodes.list.useQuery({ clusterId: id }, { enabled: !isLive })
  const dbEvents = trpc.events.list.useQuery({ clusterId: id, limit: 20 }, { enabled: !isLive })

  const isLoading = isLive ? liveQuery.isLoading : dbCluster.isLoading

  // Error / not found
  const error = isLive ? liveQuery.error : dbCluster.error
  if (!isLoading && error) {
    return (
      <AppLayout>
        <Breadcrumbs />
        <QueryError message={error.message} onRetry={() => isLive ? liveQuery.refetch() : dbCluster.refetch()} />
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

  // Build unified data
  const liveData = liveQuery.data
  const cluster = isLive
    ? {
        name: liveData?.name ?? 'minikube',
        provider: liveData?.provider ?? 'minikube',
        version: liveData?.version ?? '—',
        status: liveData?.status ?? 'unknown',
        endpoint: liveData?.endpoint ?? '—',
        nodeCount: liveData?.nodes?.length ?? 0,
        podCount: liveData?.totalPods ?? 0,
        runningPods: liveData?.runningPods ?? 0,
        namespaceCount: liveData?.namespaces?.length ?? 0,
      }
    : {
        name: dbCluster.data?.name ?? '',
        provider: dbCluster.data?.provider ?? '',
        version: dbCluster.data?.version ?? '—',
        status: dbCluster.data?.status ?? 'unknown',
        endpoint: (dbCluster.data as Record<string, unknown>)?.endpoint as string ?? '—',
        nodeCount: dbNodes.data?.length ?? 0,
        podCount: 0,
        runningPods: 0,
        namespaceCount: 0,
      }

  // Nodes
  const nodes = isLive
    ? (liveData?.nodes ?? []).map((n: Record<string, string>, i: number) => ({
        id: `node-${i}`,
        name: n.name ?? '',
        status: n.status === 'ready' ? 'Ready' : n.status === 'notready' ? 'NotReady' : (n.status ?? 'Unknown'),
        role: n.role ?? 'worker',
        kubeletVersion: n.kubeletVersion ?? '—',
        os: n.os ?? '—',
        cpu: n.cpu ?? '—',
        memory: n.memory ? formatMemoryKi(n.memory) : '—',
      }))
    : (dbNodes.data ?? []).map((n: Record<string, unknown>) => ({
        id: n.id as string,
        name: n.name as string,
        status: n.status as string,
        role: n.role as string ?? 'worker',
        kubeletVersion: (n.k8sVersion as string) ?? '—',
        os: (n.os as string) ?? '—',
        cpu: `${n.cpuAllocatable ?? '—'} / ${n.cpuCapacity ?? '—'}`,
        memory: `${n.memoryAllocatable ?? '—'} / ${n.memoryCapacity ?? '—'}`,
      }))

  // Events (last 20)
  const events = isLive
    ? (liveData?.events ?? []).slice(0, 20).map((e: Record<string, unknown>, i: number) => ({
        id: `ev-${i}`,
        type: (e.type as string) ?? 'Normal',
        reason: (e.reason as string) ?? '—',
        message: (e.message as string) ?? '',
        namespace: (e.namespace as string) ?? '',
        timestamp: (e.lastTimestamp as string) ?? null,
      }))
    : (dbEvents.data ?? []).slice(0, 20).map((e: Record<string, unknown>) => ({
        id: e.id as string,
        type: (e.kind as string) ?? 'Normal',
        reason: (e.reason as string) ?? '—',
        message: (e.message as string) ?? '',
        namespace: (e.namespace as string) ?? '',
        timestamp: (e.timestamp as string) ?? null,
      }))

  const statusDotClass = cluster.status === 'healthy'
    ? 'bg-[var(--color-status-active)]'
    : cluster.status === 'warning' || cluster.status === 'degraded'
      ? 'bg-[var(--color-status-warning)]'
      : 'bg-[var(--color-status-error)]'

  const statusLabel = cluster.status.charAt(0).toUpperCase() + cluster.status.slice(1)

  return (
    <AppLayout>
      <Breadcrumbs />

      {/* Back button */}
      <button type="button" onClick={() => router.back()} className="flex items-center gap-1.5 text-[var(--color-accent)] hover:underline text-xs font-mono mb-5">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {/* Header Card */}
      {isLoading ? (
        <HeaderSkeleton />
      ) : (
        <div className="rounded-2xl bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border)] p-6 mb-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
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
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.05] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
                  {statusLabel}
                </span>
                {isLive && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--color-status-active)]/10 text-[var(--color-status-active)] border border-[var(--color-status-active)]/20">
                    LIVE
                  </span>
                )}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20">
                  {cluster.provider}
                </span>
              </div>
              <p className="text-[12px] text-[var(--color-text-dim)] font-mono mt-1 break-all">
                Kubernetes {cluster.version} • {cluster.endpoint}
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Server, label: 'Nodes', value: String(cluster.nodeCount) },
              { icon: Box, label: 'Pods', value: isLive ? `${cluster.runningPods} / ${cluster.podCount}` : String(cluster.podCount || '—') },
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
      )}

      {/* Nodes Table */}
      <div className="rounded-2xl bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border)] p-5 mb-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-extrabold tracking-tight text-[var(--color-text-primary)]">
            <Server className="h-4 w-4 inline-block mr-2 opacity-50" />
            Nodes ({nodes.length})
          </h2>
        </div>

        {isLoading ? (
          <TableSkeleton rows={3} />
        ) : nodes.length === 0 ? (
          <p className="text-[var(--color-text-muted)] text-sm py-4 text-center">No nodes found.</p>
        ) : (
          <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Name', 'Status', 'Role', 'Kubelet Version', 'OS', 'CPU', 'Memory'].map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-[9px] text-[var(--color-text-dim)] uppercase tracking-wider font-mono font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nodes.map((node, i) => (
                  <tr key={node.id} className={`border-b border-white/[0.03] transition-colors hover:bg-white/[0.03] ${i % 2 === 1 ? 'bg-white/[0.015]' : ''}`}>
                    <td className="py-2.5 px-3 font-medium text-[var(--color-text-primary)] text-[13px]">{node.name}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${nodeStatusColor(node.status)}`} />
                        <span className="text-[var(--color-text-secondary)] text-[13px]">{node.status}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[var(--color-text-muted)] text-[13px]">{node.role}</td>
                    <td className="py-2.5 px-3 text-[var(--color-text-secondary)] font-mono text-[12px]">{node.kubeletVersion}</td>
                    <td className="py-2.5 px-3 text-[var(--color-text-muted)] text-[12px]">{node.os}</td>
                    <td className="py-2.5 px-3 text-[var(--color-text-secondary)] font-mono text-[12px]">{node.cpu}</td>
                    <td className="py-2.5 px-3 text-[var(--color-text-secondary)] font-mono text-[12px]">{node.memory}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {nodes.map((node) => (
              <div key={node.id} className="rounded-lg border border-[var(--color-border)] bg-white/[0.02] p-3 space-y-2">
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
            ))}
          </div>
          </>
        )}
      </div>

      {/* Recent Events Table */}
      <div className="rounded-2xl bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border)] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
        <h2 className="text-base font-extrabold tracking-tight text-[var(--color-text-primary)] mb-4">
          Recent Events
        </h2>

        {isLoading ? (
          <TableSkeleton rows={5} />
        ) : events.length === 0 ? (
          <p className="text-[var(--color-text-muted)] text-sm py-4 text-center">No events found.</p>
        ) : (
          <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Time', 'Type', 'Reason', 'Message'].map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-[9px] text-[var(--color-text-dim)] uppercase tracking-wider font-mono font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((event, i) => {
                  const isWarning = event.type === 'Warning'
                  return (
                    <tr
                      key={event.id}
                      className={`border-b border-white/[0.03] transition-colors hover:bg-white/[0.03] ${isWarning ? 'bg-[var(--color-status-warning)]/[0.04]' : i % 2 === 1 ? 'bg-white/[0.015]' : ''}`}
                    >
                      <td className="py-2 px-3 text-[var(--color-text-dim)] font-mono text-[11px] whitespace-nowrap">
                        {event.timestamp ? timeAgo(event.timestamp) : '—'}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                          style={{
                            color: severityColor(event.type),
                            background: `color-mix(in srgb, ${severityColor(event.type)} 15%, transparent)`,
                          }}
                        >
                          {event.type}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[var(--color-text-primary)] text-[13px] font-medium whitespace-nowrap">
                        {event.reason}
                      </td>
                      <td className="py-2 px-3 text-[var(--color-text-muted)] text-[12px] max-w-[400px] truncate">
                        {event.message}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-0">
            {events.map((event) => {
              const isWarning = event.type === 'Warning'
              return (
                <div key={event.id} className={`p-3 border-b border-white/[0.03] ${isWarning ? 'bg-[var(--color-status-warning)]/[0.04]' : ''}`}>
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
            })}
          </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
