'use client'

import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { DataTable } from '@/components/DataTable'
import { PageTransition } from '@/components/animations'
import type { ColumnDef } from '@tanstack/react-table'
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
      { accessorKey: 'name', header: 'Service', cell: ({ row }) => <span className="font-medium text-[var(--color-text-primary)]">{row.original.name}</span> },
      { accessorKey: 'namespace', header: 'Namespace' },
      { accessorKey: 'type', header: 'Type' },
      { accessorKey: 'endpoints', header: 'Endpoints' },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              row.original.status === 'Healthy'
                ? 'bg-[var(--color-status-active)]/20 text-[var(--color-status-active)]'
                : 'bg-[var(--color-status-warning)]/20 text-[var(--color-status-warning)]'
            }`}
          >
            {row.original.status}
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <AppLayout>
      <PageTransition>
        <div className="space-y-4">
          <Breadcrumbs />

          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Services</h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Cluster services overview (mock data)</p>
          </div>

          <DataTable
            data={mockServices}
            columns={columns}
            searchPlaceholder="Search services..."
            emptyTitle="No services found"
          />
        </div>
      </PageTransition>
    </AppLayout>
  )
}
