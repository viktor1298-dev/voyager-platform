'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { DataTable } from '@/components/DataTable'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'

interface DeploymentRow {
  id: string
  name: string
  namespace: string
  ready: string
  image: string
  status: string
  age: string
}

function statusColor(status: string): string {
  if (status === 'Running') return 'var(--color-status-active)'
  if (status === 'Scaling') return 'var(--color-status-warning)'
  if (status === 'Failed') return 'var(--color-status-error)'
  return 'var(--color-text-dim)'
}

const columns: ColumnDef<DeploymentRow, unknown>[] = [
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
      <span className="font-mono text-[12px] text-[var(--color-text-muted)]">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'ready',
    header: 'Ready',
    cell: ({ getValue }) => {
      const val = getValue<string>()
      const [a, b] = val.split('/')
      const ok = a === b
      return (
        <span
          className="font-mono text-[12px] px-1.5 py-0.5 rounded"
          style={{
            color: ok ? 'var(--color-status-active)' : 'var(--color-status-warning)',
            background: `color-mix(in srgb, ${ok ? 'var(--color-status-active)' : 'var(--color-status-warning)'} 12%, transparent)`,
          }}
        >
          {val}
        </span>
      )
    },
  },
  {
    accessorKey: 'image',
    header: 'Image',
    cell: ({ getValue }) => (
      <span className="font-mono text-[11px] text-[var(--color-text-muted)] max-w-[200px] truncate block" title={getValue<string>()}>
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
          {val}
        </span>
      )
    },
  },
  {
    accessorKey: 'age',
    header: 'Age',
    cell: ({ getValue }) => (
      <span className="font-mono text-[11px] text-[var(--color-text-dim)]">
        {getValue<string>()}
      </span>
    ),
  },
]

export default function DeploymentsPage() {
  const { id } = useParams<{ id: string }>()

  const dbCluster = trpc.clusters.get.useQuery({ id })
  const resolvedId = dbCluster.data?.id ?? id

  const hasCredentials = Boolean((dbCluster.data as Record<string, unknown> | undefined)?.hasCredentials)

  const deploymentsQuery = trpc.deployments.list.useQuery(
    { clusterId: resolvedId },
    { enabled: hasCredentials && !!resolvedId, refetchInterval: 30000 },
  )

  const allNamespaces = useMemo(() => {
    const ns = new Set<string>()
    for (const d of deploymentsQuery.data ?? []) {
      if (d.namespace) ns.add(d.namespace)
    }
    return Array.from(ns).sort()
  }, [deploymentsQuery.data])

  const [nsFilter, setNsFilter] = useState<string>('all')

  const rows: DeploymentRow[] = useMemo(() => {
    return (deploymentsQuery.data ?? [])
      .filter((d) => nsFilter === 'all' || d.namespace === nsFilter)
      .map((d, i) => ({
        id: `dep-${i}`,
        name: d.name,
        namespace: d.namespace,
        ready: `${d.ready}/${d.replicas}`,
        image: d.image,
        status: d.status,
        age: d.age,
      }))
  }, [deploymentsQuery.data, nsFilter])

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
          Connect cluster credentials to view deployments.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Namespace filter */}
      {allNamespaces.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-[var(--color-text-muted)]" htmlFor="ns-filter">
            Namespace:
          </label>
          <select
            id="ns-filter"
            value={nsFilter}
            onChange={(e) => setNsFilter(e.target.value)}
            className="text-[12px] font-mono rounded-lg px-2 py-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            <option value="all">All namespaces</option>
            {allNamespaces.map((ns) => (
              <option key={ns} value={ns}>{ns}</option>
            ))}
          </select>
        </div>
      )}

      <DataTable
        data={rows}
        columns={columns}
        loading={deploymentsQuery.isLoading}
        emptyTitle="No deployments found"
        searchable
        paginated
        pageSize={20}
        searchPlaceholder="Search deployments…"
        mobileCard={(d) => (
          <div className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-mono text-[13px] font-medium text-[var(--color-text-primary)] truncate">{d.name}</span>
              <span
                className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
                style={{
                  color: statusColor(d.status),
                  background: `color-mix(in srgb, ${statusColor(d.status)} 15%, transparent)`,
                }}
              >
                {d.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
              <span className="font-mono">{d.namespace}</span>
              <span>Ready: {d.ready}</span>
              <span>{d.age}</span>
            </div>
            <p className="font-mono text-[10px] text-[var(--color-text-dim)] mt-1 truncate">{d.image}</p>
          </div>
        )}
      />
    </div>
  )
}
