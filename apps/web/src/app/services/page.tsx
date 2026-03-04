'use client'

import { AppLayout } from '@/components/AppLayout'
import { DataTable } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PageTransition } from '@/components/animations'
import type { ColumnDef } from '@tanstack/react-table'
import { Network } from 'lucide-react'
import { useMemo } from 'react'

type ServiceRow = {
  id: string
  name: string
  namespace: string
  type: 'ClusterIP' | 'NodePort' | 'LoadBalancer'
  endpoints: number
  status: 'Healthy' | 'Warning'
}

const mockServices: ServiceRow[] = [
  { id: 'svc-1', name: 'api-gateway', namespace: 'voyager', type: 'LoadBalancer', endpoints: 6, status: 'Healthy' },
  { id: 'svc-2', name: 'auth-service', namespace: 'voyager', type: 'ClusterIP', endpoints: 3, status: 'Healthy' },
  { id: 'svc-3', name: 'metrics-proxy', namespace: 'monitoring', type: 'NodePort', endpoints: 1, status: 'Warning' },
  { id: 'svc-4', name: 'alerts-dispatcher', namespace: 'voyager', type: 'ClusterIP', endpoints: 2, status: 'Healthy' },
]

export default function ServicesPage() {
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
      { accessorKey: 'endpoints', header: 'Endpoints' },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status === 'Healthy' ? 'healthy' : 'warning'}
            dot
          />
        ),
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
            description="Cluster services overview"
            breadcrumb={[{ label: 'Platform' }, { label: 'Services' }]}
          />

          <DataTable
            data={mockServices}
            columns={columns}
            searchable
            searchPlaceholder="Search services…"
            emptyIcon={<Network className="h-6 w-6" />}
            emptyTitle="No services found"
            emptyDescription="No services match your current filters."
          />

          {mockServices.length === 0 && (
            <EmptyState
              icon={<Network className="h-6 w-6" />}
              title="No services"
              description="This cluster has no services yet."
            />
          )}
        </div>
      </PageTransition>
    </AppLayout>
  )
}
