'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { useMemo } from 'react'
import { DataTable } from '@/components/DataTable'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'
import { usePageTitle } from '@/hooks/usePageTitle'

interface ServiceRow {
  id: string
  name: string
  namespace: string
  type: string
  clusterIP: string
  ports: string
  age: string
}

function typeColor(type: string): string {
  if (type === 'LoadBalancer') return 'var(--color-accent)'
  if (type === 'NodePort') return 'var(--color-status-warning)'
  if (type === 'ExternalName') return 'var(--color-status-error)'
  return 'var(--color-text-dim)'
}

const columns: ColumnDef<ServiceRow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ getValue }) => (
      <span className="font-mono text-[13px] font-medium text-[var(--color-text-primary)]">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'namespace',
    header: 'Namespace',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-[var(--color-text-muted)]">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ getValue }) => {
      const val = getValue<string>()
      return (
        <span
          className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
          style={{
            color: typeColor(val),
            background: `color-mix(in srgb, ${typeColor(val)} 15%, transparent)`,
          }}
        >
          {val}
        </span>
      )
    },
  },
  {
    accessorKey: 'clusterIP',
    header: 'ClusterIP',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-[var(--color-text-muted)]">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'ports',
    header: 'Ports',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-[var(--color-text-secondary)]">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'age',
    header: 'Age',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs text-[var(--color-text-dim)]">
        {getValue<string>()}
      </span>
    ),
  },
]

function formatPorts(ports: Array<{ port: number; protocol?: string | null; nodePort?: number | null }>): string {
  if (!ports || ports.length === 0) return '—'
  return ports
    .map((p) => {
      const proto = p.protocol ?? 'TCP'
      const nodePort = p.nodePort ? `:${p.nodePort}` : ''
      return `${p.port}/${proto}${nodePort}`
    })
    .join(', ')
}

export default function ServicesPage() {
  usePageTitle('Cluster Services')

  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId

  const hasCredentials = Boolean((dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials)

  const servicesQuery = trpc.services.list.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials && !!resolvedId, refetchInterval: 30000 },
  )

  const rows: ServiceRow[] = useMemo(() => {
    return (servicesQuery.data ?? []).map((svc, i) => ({
      id: `svc-${i}`,
      name: svc.name,
      namespace: svc.namespace,
      type: svc.type,
      clusterIP: svc.clusterIP ?? '—',
      ports: formatPorts(svc.ports ?? []),
      age: svc.createdAt
        ? timeAgo(
            typeof svc.createdAt === 'object' && svc.createdAt !== null && 'toISOString' in svc.createdAt
              ? (svc.createdAt as Date).toISOString()
              : String(svc.createdAt),
          )
        : '—',
    }))
  }, [servicesQuery.data])

  if (dbCluster.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    )
  }

  if (!hasCredentials) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
        <p className="text-sm font-medium">Live data unavailable</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">
          Connect cluster credentials to view services.
        </p>
      </div>
    )
  }

  return (
    <DataTable
      data={rows}
      columns={columns}
      loading={servicesQuery.isLoading}
      emptyTitle="No services found"
      searchable
      paginated
      pageSize={20}
      searchPlaceholder="Search services…"
      mobileCard={(svc) => (
        <div className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-mono text-[13px] font-medium text-[var(--color-text-primary)] truncate">{svc.name}</span>
            <span
              className="text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
              style={{
                color: typeColor(svc.type),
                background: `color-mix(in srgb, ${typeColor(svc.type)} 15%, transparent)`,
              }}
            >
              {svc.type}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <span className="font-mono">{svc.namespace}</span>
            <span className="font-mono">{svc.clusterIP}</span>
            <span>{svc.ports}</span>
          </div>
        </div>
      )}
    />
  )
}
