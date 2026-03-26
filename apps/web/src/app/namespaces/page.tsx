'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { QueryError } from '@/components/ErrorBoundary'
import { trpc } from '@/lib/trpc'
import type { ColumnDef } from '@tanstack/react-table'
import { FolderTree } from 'lucide-react'
import { useMemo, useState } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'

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
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border ${
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
  usePageTitle('Namespaces')

  const clustersQuery = trpc.clusters.list.useQuery()
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null)

  const defaultClusterId = useMemo(() => {
    const clusters = clustersQuery.data
    if (!clusters?.length) return null
    return (clusters.find((c) => c.healthStatus === 'healthy') ?? clusters[0]).id
  }, [clustersQuery.data])

  const clusterId = selectedClusterId ?? defaultClusterId

  const namespacesQuery = trpc.namespaces.list.useQuery(
    { clusterId: clusterId! },
    { enabled: !!clusterId, refetchInterval: 30_000 },
  )

  const data = useMemo(() => (namespacesQuery.data ?? []) as NamespaceRow[], [namespacesQuery.data])

  return (
    <AppLayout>
      <PageTransition>
        <div className="space-y-6">
          <PageHeader
            title="Namespaces"
            icon={<FolderTree className="h-6 w-6" />}
            description="Kubernetes namespaces across your clusters"
            actions={
              clustersQuery.data && clustersQuery.data.length > 1 ? (
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
              ) : undefined
            }
          />

          {namespacesQuery.error ? (
            <QueryError message={namespacesQuery.error.message} onRetry={() => namespacesQuery.refetch()} />
          ) : (
            <DataTable
              columns={columns}
              data={data}
              loading={namespacesQuery.isLoading}
              emptyIcon={<FolderTree className="h-10 w-10" />}
              emptyTitle="No namespaces found"
              emptyDescription="No namespaces found. Try switching to a different cluster."
            />
          )}
        </div>
      </PageTransition>
    </AppLayout>
  )
}
