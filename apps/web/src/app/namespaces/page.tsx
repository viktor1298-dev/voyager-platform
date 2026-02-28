'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { DataTable } from '@/components/DataTable'
import { QueryError } from '@/components/ErrorBoundary'
import { trpc } from '@/lib/trpc'
import type { ColumnDef } from '@tanstack/react-table'
import { FolderTree } from 'lucide-react'
import { useMemo, useState } from 'react'

interface NamespaceRow {
  name: string
  status: string | null
  createdAt: string | Date | null
}

function formatAge(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  const diffMs = Date.now() - d.getTime()
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m`
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h`
  return `${Math.floor(diffMs / 86_400_000)}d`
}

const columns: ColumnDef<NamespaceRow>[] = [
  { accessorKey: 'name', header: 'Name' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const status = getValue() as string | null
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
            status === 'Active'
              ? 'bg-[var(--color-status-active)]/20 border-[var(--color-status-active)]/35 text-[var(--color-badge-label)]'
              : 'bg-[var(--color-status-idle)]/20 border-[var(--color-status-idle)]/35 text-[var(--color-badge-label)]'
          }`}
        >
          {status ?? '—'}
        </span>
      )
    },
  },
  {
    id: 'age',
    header: 'Age',
    cell: ({ row }) => formatAge(row.original.createdAt),
  },
]

export default function NamespacesPage() {
  const clustersQuery = trpc.clusters.list.useQuery()
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null)

  const clusterId = selectedClusterId ?? clustersQuery.data?.[0]?.id ?? null

  const namespacesQuery = trpc.namespaces.list.useQuery(
    { clusterId: clusterId! },
    { enabled: !!clusterId, refetchInterval: 30_000 },
  )

  const data = useMemo(() => (namespacesQuery.data ?? []) as NamespaceRow[], [namespacesQuery.data])

  return (
    <AppLayout>
      <PageTransition>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FolderTree className="h-6 w-6 text-[var(--color-accent)]" />
              <div>
                <Breadcrumbs items={[{ label: 'Namespaces' }]} />
                <p className="text-sm text-[var(--color-text-muted)]">
                  Kubernetes namespaces across your clusters
                </p>
              </div>
            </div>

            {clustersQuery.data && clustersQuery.data.length > 1 && (
              <select
                value={clusterId ?? ''}
                onChange={(e) => setSelectedClusterId(e.target.value)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)]"
              >
                {clustersQuery.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {namespacesQuery.error ? (
            <QueryError error={namespacesQuery.error} />
          ) : (
            <DataTable
              columns={columns}
              data={data}
              isLoading={namespacesQuery.isLoading}
              emptyIcon={<FolderTree className="h-10 w-10" />}
              emptyTitle="No namespaces found"
              emptyDescription="No Kubernetes namespaces found in this cluster."
            />
          )}
        </div>
      </PageTransition>
    </AppLayout>
  )
}
