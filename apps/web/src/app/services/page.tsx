'use client'

import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { DataTable } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PageTransition } from '@/components/animations'
import { QueryError } from '@/components/ErrorBoundary'
import { trpc } from '@/lib/trpc'
import type { ColumnDef } from '@tanstack/react-table'
import { Layers } from 'lucide-react'
import { useMemo, useState } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'

interface ServiceRow {
  name: string
  namespace: string
  type: string
  clusterIP: string | null
  ports: Array<{ port: number; protocol?: string | null; targetPort?: string | number | null }>
}

export default function ServicesPage() {
  usePageTitle('Services')

  const clustersQuery = trpc.clusters.list.useQuery()
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null)

  const defaultClusterId = useMemo(() => {
    const clusters = clustersQuery.data
    if (!clusters?.length) return null
    return (clusters.find((c) => c.healthStatus === 'healthy') ?? clusters[0]).id
  }, [clustersQuery.data])

  const clusterId = selectedClusterId ?? defaultClusterId

  const servicesQuery = trpc.services.list.useQuery(
    { clusterId: clusterId! },
    { enabled: !!clusterId },
  )

  const data = useMemo(() => (servicesQuery.data ?? []) as ServiceRow[], [servicesQuery.data])

  const columns = useMemo<ColumnDef<ServiceRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Service',
        cell: ({ row }) => (
          <span className="font-medium text-[var(--color-text-primary)]">{row.original.name}</span>
        ),
      },
      { accessorKey: 'namespace', header: 'Namespace' },
      { accessorKey: 'type', header: 'Type' },
      {
        accessorKey: 'clusterIP',
        header: 'Cluster IP',
        cell: ({ getValue }) => (getValue() as string | null) ?? '—',
      },
      {
        id: 'ports',
        header: 'Ports',
        cell: ({ row }) =>
          row.original.ports
            .map((p) => `${p.port}${p.protocol ? '/' + p.protocol : ''}`)
            .join(', ') || '—',
      },
      {
        id: 'status',
        header: 'Status',
        cell: () => <StatusBadge status="healthy" dot />,
      },
    ],
    [],
  )

  return (
    <AppLayout>
      <PageTransition>
        <div className="space-y-4">
          <PageHeader
            title="Services"
            description="Kubernetes services across your clusters"
            breadcrumb={[{ label: 'Platform' }, { label: 'Services' }]}
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

          {servicesQuery.error ? (
            <QueryError message={servicesQuery.error.message} />
          ) : data.length === 0 && !servicesQuery.isLoading ? (
            <EmptyState
              icon={<Layers className="h-6 w-6" />}
              title="No services found"
              description="No Kubernetes services found in this cluster. Try selecting a different namespace or cluster."
            />
          ) : (
            <DataTable
              data={data}
              columns={columns}
              searchable
              searchPlaceholder="Search services…"
              emptyIcon={<Layers className="h-6 w-6" />}
              emptyTitle="No services found"
              emptyDescription="No Kubernetes services found in this cluster. Try selecting a different namespace or cluster."
            />
          )}
        </div>
      </PageTransition>
    </AppLayout>
  )
}
