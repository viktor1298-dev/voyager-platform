'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { QueryError } from '@/components/ErrorBoundary'
import { trpc } from '@/lib/trpc'
import type { ColumnDef } from '@tanstack/react-table'
import { Layers } from 'lucide-react'
import { useMemo, useState } from 'react'

interface ServiceRow {
  name: string
  namespace: string
  type: string
  clusterIP: string | null
  ports: Array<{ port: number; protocol?: string | null; targetPort?: string | number | null }>
}

const columns: ColumnDef<ServiceRow>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'namespace', header: 'Namespace' },
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'clusterIP', header: 'Cluster IP', cell: ({ getValue }) => getValue() ?? '—' },
  {
    id: 'ports',
    header: 'Ports',
    cell: ({ row }) =>
      row.original.ports
        .map((p) => `${p.port}${p.protocol ? '/' + p.protocol : ''}`)
        .join(', ') || '—',
  },
]

export default function ServicesPage() {
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
    { enabled: !!clusterId, refetchInterval: 30_000 },
  )

  const data = useMemo(() => (servicesQuery.data ?? []) as ServiceRow[], [servicesQuery.data])

  return (
    <AppLayout>
      <PageTransition>
        <div className="space-y-6">
          <PageHeader
            title="Services"
            icon={<Layers className="h-6 w-6" />}
            description="Kubernetes services across your clusters"
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
            <QueryError error={servicesQuery.error} />
          ) : (
            <DataTable
              columns={columns}
              data={data}
              isLoading={servicesQuery.isLoading}
              emptyIcon={<Layers className="h-10 w-10" />}
              emptyTitle="No services found"
              emptyDescription="No Kubernetes services found in this cluster."
            />
          )}
        </div>
      </PageTransition>
    </AppLayout>
  )
}
