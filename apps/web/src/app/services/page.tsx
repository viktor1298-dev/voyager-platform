'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { DataTable } from '@/components/DataTable'
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

  const clusterId = selectedClusterId ?? clustersQuery.data?.[0]?.id ?? null

  const servicesQuery = trpc.services.list.useQuery(
    { clusterId: clusterId! },
    { enabled: !!clusterId, refetchInterval: 30_000 },
  )

  const data = useMemo(() => (servicesQuery.data ?? []) as ServiceRow[], [servicesQuery.data])

  return (
    <AppLayout>
      <PageTransition>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Layers className="h-6 w-6 text-[var(--color-accent)]" />
              <div>
                <Breadcrumbs items={[{ label: 'Services' }]} />
                <p className="text-sm text-[var(--color-text-muted)]">
                  Kubernetes services across your clusters
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
