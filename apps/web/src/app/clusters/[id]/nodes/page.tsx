'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { RefreshCw, Server } from 'lucide-react'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { DataTable } from '@/components/DataTable'
import { nodeStatusColor } from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

interface NodeRow {
  id: string
  name: string
  status: string
  role: string
  kubeletVersion: string
  os: string
  cpu: string
  memory: string
  cpuPercent: number | null
  memoryPercent: number | null
}

function asText(value: unknown, fallback = '—'): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : fallback
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value)
  return fallback
}

function makeNodeColumns(metricsAvailable: boolean): ColumnDef<NodeRow, unknown>[] {
  const metricsUnavailableCell = () => (
    <span
      className="text-[var(--color-text-dim)] text-xs italic"
      title="Install metrics-server in your cluster to enable resource metrics"
    >
      {metricsAvailable ? '—' : 'metrics-server required'}
    </span>
  )
  return [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ getValue }) => (
        <span className="font-medium font-mono text-[var(--color-text-primary)] text-[13px]">
          {getValue<string>()}
        </span>
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
        <span className="text-[var(--color-text-secondary)] font-mono text-xs">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'os',
      header: 'OS',
      cell: ({ getValue }) => (
        <span className="text-[var(--color-text-muted)] text-xs">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'cpu',
      header: 'CPU',
      cell: ({ getValue }) => (
        <span className="text-[var(--color-text-secondary)] font-mono text-xs">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'cpuPercent',
      header: 'CPU %',
      cell: ({ getValue }) => {
        const v = getValue<number | null>()
        if (v == null) return metricsUnavailableCell()
        return (
          <div className="flex items-center gap-2 min-w-[100px]">
            <div className="relative flex-1 h-4 rounded-full bg-[var(--color-track)] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{
                  width: `${Math.max(v, 2)}%`,
                  background:
                    v > 80
                      ? 'var(--color-status-error)'
                      : v > 60
                        ? 'var(--color-status-warning)'
                        : 'var(--color-accent)',
                }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold text-[var(--color-text-primary)] mix-blend-normal drop-shadow-[0_0_2px_rgba(0,0,0,0.5)]">
                {v}%
              </span>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'memory',
      header: 'Memory',
      cell: ({ getValue }) => (
        <span className="text-[var(--color-text-secondary)] font-mono text-xs">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'memoryPercent',
      header: 'Mem %',
      cell: ({ getValue }) => {
        const v = getValue<number | null>()
        if (v == null) return metricsUnavailableCell()
        return (
          <div className="flex items-center gap-2 min-w-[100px]">
            <div className="relative flex-1 h-4 rounded-full bg-[var(--color-track)] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{
                  width: `${Math.max(v, 2)}%`,
                  background:
                    v > 80
                      ? 'var(--color-status-error)'
                      : v > 60
                        ? 'var(--color-status-warning)'
                        : 'var(--color-accent)',
                }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold text-[var(--color-text-primary)] mix-blend-normal drop-shadow-[0_0_2px_rgba(0,0,0,0.5)]">
                {v}%
              </span>
            </div>
          </div>
        )
      },
    },
  ]
}

export default function NodesPage() {
  usePageTitle('Cluster Nodes')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId
  const hasCredentials = Boolean(
    (dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials,
  )
  const isLive = hasCredentials

  const liveQuery = trpc.clusters.live.useQuery(
    { clusterId: resolvedId },
    { enabled: isLive, refetchInterval: 30000, retry: false, staleTime: 30000 },
  )
  const liveFailed = isLive && liveQuery.isError
  const effectiveIsLive = isLive && !liveFailed

  const dbNodes = trpc.nodes.list.useQuery({ clusterId: resolvedId }, { enabled: !effectiveIsLive })

  const liveData = liveQuery.data

  const nodes: NodeRow[] = effectiveIsLive
    ? (liveData?.nodes ?? []).map((n: Record<string, unknown>, i: number) => ({
        id: `node-${i}`,
        name: asText(n['name'], ''),
        status:
          n['status'] === 'ready'
            ? 'Ready'
            : n['status'] === 'notready'
              ? 'NotReady'
              : asText(n['status'], 'Unknown'),
        role: asText(n['role'], 'worker'),
        kubeletVersion: asText(n['kubeletVersion']),
        os: asText(n['os'] ?? n['operatingSystem']),
        cpu:
          n['cpuAllocatable'] != null
            ? `${n['cpuAllocatable']}m / ${n['cpuCapacity'] ?? '?'}m`
            : '—',
        memory:
          n['memoryAllocatable'] != null
            ? `${Math.round(Number(n['memoryAllocatable']) / 1024)}Mi / ${Math.round(Number(n['memoryCapacity'] ?? 0) / 1024)}Mi`
            : '—',
        cpuPercent: typeof n['cpuPercent'] === 'number' ? n['cpuPercent'] : null,
        memoryPercent: typeof n['memoryPercent'] === 'number' ? n['memoryPercent'] : null,
      }))
    : (dbNodes.data ?? []).map((n: Record<string, unknown>, i: number) => ({
        id: `node-db-${i}`,
        name: asText(n['name'], ''),
        status: asText(n['status'], 'Unknown'),
        role: asText(n['role'], 'worker'),
        kubeletVersion: asText(n['k8sVersion']),
        os: '—',
        cpu: n['cpuAllocatable'] != null ? `${n['cpuAllocatable']}m` : '—',
        memory:
          n['memoryAllocatable'] != null
            ? `${Math.round(Number(n['memoryAllocatable']) / 1024)}Mi`
            : '—',
        cpuPercent: null,
        memoryPercent: null,
      }))

  const metricsAvailable = effectiveIsLive && nodes.some((n) => n.cpuPercent != null)
  const isOffline = isLive && liveFailed
  const nodesQuery = effectiveIsLive ? liveQuery : dbNodes

  return (
    <>
      <h1 className="sr-only">Cluster Nodes</h1>
      <DataTable
        data={nodes}
        columns={makeNodeColumns(metricsAvailable)}
        loading={effectiveIsLive ? liveQuery.isLoading : dbNodes.isLoading}
        emptyIcon={<Server className="h-10 w-10" />}
        emptyTitle={isOffline ? 'Cluster is currently offline' : 'No nodes found in this cluster'}
        emptyDescription={
          isOffline
            ? 'Node data is unavailable while the cluster is offline. Check cluster connectivity and try again.'
            : 'Nodes appear here when your cluster has worker nodes registered. Check cluster connectivity.'
        }
        emptyAction={
          <button
            type="button"
            onClick={() => nodesQuery.refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        }
        paginated
        pageSize={25}
        mobileCard={(node) => (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-medium font-mono text-[var(--color-text-primary)] text-sm">
                {node.name}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${nodeStatusColor(node.status)}`} />
                <span className="text-[var(--color-text-secondary)] text-xs">{node.status}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-[var(--color-text-muted)]">Role</span>
              <span className="text-[var(--color-text-primary)]">{node.role}</span>
              <span className="text-[var(--color-text-muted)]">CPU</span>
              <span className="text-[var(--color-text-primary)] font-mono">{node.cpu}</span>
              <span className="text-[var(--color-text-muted)]">Memory</span>
              <span className="text-[var(--color-text-primary)] font-mono">{node.memory}</span>
            </div>
          </div>
        )}
      />
    </>
  )
}
