'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { useParams } from 'next/navigation'
import { DataTable } from '@/components/DataTable'
import { Progress } from '@/components/ui/progress'
import { nodeStatusColor } from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'

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
      className="text-[var(--color-text-dim)] text-[11px] italic"
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
        <span className="font-medium text-[var(--color-text-primary)] text-[13px]">
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
        <span className="text-[var(--color-text-secondary)] font-mono text-[12px]">
          {getValue<string>()}
        </span>
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
        <span className="text-[var(--color-text-secondary)] font-mono text-[12px]">
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
          <div className="flex items-center gap-2 min-w-[80px]">
            <Progress value={v} className="h-1.5 flex-1" />
            <span className="text-[var(--color-text-secondary)] font-mono text-[11px] tabular-nums w-10 text-right">
              {v}%
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'memory',
      header: 'Memory',
      cell: ({ getValue }) => (
        <span className="text-[var(--color-text-secondary)] font-mono text-[12px]">
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
          <div className="flex items-center gap-2 min-w-[80px]">
            <Progress value={v} className="h-1.5 flex-1" />
            <span className="text-[var(--color-text-secondary)] font-mono text-[11px] tabular-nums w-10 text-right">
              {v}%
            </span>
          </div>
        )
      },
    },
  ]
}

export default function NodesPage() {
  const { id } = useParams<{ id: string }>()

  const dbCluster = trpc.clusters.get.useQuery({ id })
  const resolvedId = dbCluster.data?.id ?? id
  const hasCredentials = Boolean((dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials)
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
          n['status'] === 'ready' ? 'Ready' : n['status'] === 'notready' ? 'NotReady' : asText(n['status'], 'Unknown'),
        role: asText(n['role'], 'worker'),
        kubeletVersion: asText(n['kubeletVersion']),
        os: asText(n['os'] ?? n['operatingSystem']),
        cpu: n['cpuAllocatable'] != null ? `${n['cpuAllocatable']}m / ${n['cpuCapacity'] ?? '?'}m` : '—',
        memory: n['memoryAllocatable'] != null ? `${Math.round(Number(n['memoryAllocatable']) / 1024)}Mi / ${Math.round(Number(n['memoryCapacity'] ?? 0) / 1024)}Mi` : '—',
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
        memory: n['memoryAllocatable'] != null ? `${Math.round(Number(n['memoryAllocatable']) / 1024)}Mi` : '—',
        cpuPercent: null,
        memoryPercent: null,
      }))

  const metricsAvailable = effectiveIsLive && nodes.some((n) => n.cpuPercent != null)

  return (
    <DataTable
      data={nodes}
      columns={makeNodeColumns(metricsAvailable)}
      loading={effectiveIsLive ? liveQuery.isLoading : dbNodes.isLoading}
      emptyTitle="No nodes found"
      paginated
      pageSize={25}
      mobileCard={(node) => (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 space-y-2">
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
            <span className="text-[var(--color-text-muted)]">CPU</span>
            <span className="text-[var(--color-text-primary)] font-mono">{node.cpu}</span>
            <span className="text-[var(--color-text-muted)]">Memory</span>
            <span className="text-[var(--color-text-primary)] font-mono">{node.memory}</span>
          </div>
        </div>
      )}
    />
  )
}
