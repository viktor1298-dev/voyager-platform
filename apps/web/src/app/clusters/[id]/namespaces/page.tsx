'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { useParams } from 'next/navigation'
import { getClusterIdFromRouteSegment } from '@/components/cluster-route'
import { useMemo } from 'react'
import { DataTable } from '@/components/DataTable'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'

interface NamespaceRow {
  id: string
  name: string
  status: string
  labelsCount: number
  created: string
}

function statusColor(status: string | null): string {
  if (status === 'Active') return 'var(--color-status-active)'
  if (status === 'Terminating') return 'var(--color-status-error)'
  return 'var(--color-text-dim)'
}

const columns: ColumnDef<NamespaceRow, unknown>[] = [
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
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const val = getValue<string>()
      return (
        <span
          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
          style={{
            color: statusColor(val),
            background: `color-mix(in srgb, ${statusColor(val)} 15%, transparent)`,
          }}
        >
          {val || '—'}
        </span>
      )
    },
  },
  {
    accessorKey: 'labelsCount',
    header: 'Labels',
    cell: ({ getValue }) => (
      <span className="text-[12px] text-[var(--color-text-muted)]">
        {getValue<number>()}
      </span>
    ),
  },
  {
    accessorKey: 'created',
    header: 'Created',
    cell: ({ getValue }) => (
      <span className="font-mono text-[11px] text-[var(--color-text-dim)]">
        {getValue<string>()}
      </span>
    ),
  },
]

export default function NamespacesPage() {
  const { id: routeSegment } = useParams<{ id: string }>()
  const clusterId = getClusterIdFromRouteSegment(routeSegment)

  const dbCluster = trpc.clusters.get.useQuery({ id: clusterId })
  const resolvedId = dbCluster.data?.id ?? clusterId

  const hasCredentials = Boolean((dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials)

  const namespacesQuery = trpc.namespaces.list.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials && !!resolvedId, refetchInterval: 30000 },
  )

  const rows: NamespaceRow[] = useMemo(() => {
    return (namespacesQuery.data ?? []).map((ns, i) => ({
      id: `ns-${i}`,
      name: ns.name,
      status: ns.status ?? '—',
      labelsCount: ns.labels ? Object.keys(ns.labels).length : 0,
      created: ns.createdAt
        ? timeAgo(
            typeof ns.createdAt === 'object' && ns.createdAt !== null && 'toISOString' in ns.createdAt
              ? (ns.createdAt as Date).toISOString()
              : String(ns.createdAt),
          )
        : '—',
    }))
  }, [namespacesQuery.data])

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
          Connect cluster credentials to view namespaces.
        </p>
      </div>
    )
  }

  return (
    <DataTable
      data={rows}
      columns={columns}
      loading={namespacesQuery.isLoading}
      emptyTitle="No namespaces found"
      searchable
      paginated
      pageSize={20}
      searchPlaceholder="Search namespaces…"
      mobileCard={(ns) => (
        <div className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-mono text-[13px] font-medium text-[var(--color-text-primary)] truncate">{ns.name}</span>
            <span
              className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
              style={{
                color: statusColor(ns.status),
                background: `color-mix(in srgb, ${statusColor(ns.status)} 15%, transparent)`,
              }}
            >
              {ns.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
            <span>{ns.labelsCount} labels</span>
            <span>{ns.created}</span>
          </div>
        </div>
      )}
    />
  )
}
