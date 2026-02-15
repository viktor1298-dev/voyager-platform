'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { CircleDollarSign, RefreshCw, Server, Timer } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import {
  type EC2NodeClass,
  getKarpenterMetrics,
  getMockEC2NodeClasses,
  getMockNodePools,
  type NodePool,
} from '@/lib/mock-karpenter'

function poolStatusVariant(status: NodePool['status']) {
  if (status === 'Ready') return 'success' as const
  if (status === 'Scaling') return 'warning' as const
  return 'destructive' as const
}

export default function KarpenterPage() {
  const nodePools = useMemo(() => getMockNodePools(), [])
  const nodeClasses = useMemo(() => getMockEC2NodeClasses(), [])
  const metrics = useMemo(() => getKarpenterMetrics(), [])

  const nodePoolColumns = useMemo<ColumnDef<NodePool, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'NodePool',
        cell: ({ row }) => (
          <span className="font-semibold text-[var(--color-text-primary)]">
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={poolStatusVariant(row.original.status)}>{row.original.status}</Badge>
        ),
      },
      {
        id: 'limits',
        header: 'Limits',
        cell: ({ row }) => (
          <span className="text-xs text-[var(--color-text-secondary)] font-mono">
            {row.original.cpuLimit} vCPU / {row.original.memoryLimitGi}Gi
          </span>
        ),
      },
      {
        accessorKey: 'nodeCount',
        header: 'Nodes',
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-[var(--color-text-secondary)]">
            {row.original.nodeCount}
          </span>
        ),
      },
      {
        accessorKey: 'disruptionPolicy',
        header: 'Disruption',
        cell: ({ row }) => (
          <span className="text-xs text-[var(--color-text-muted)]">
            {row.original.disruptionPolicy}
          </span>
        ),
      },
    ],
    [],
  )

  const nodeClassColumns = useMemo<ColumnDef<EC2NodeClass, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'EC2NodeClass',
        cell: ({ row }) => (
          <span className="font-semibold text-[var(--color-text-primary)]">
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: 'amiFamily',
        header: 'AMI Family',
        cell: ({ row }) => <Badge variant="outline">{row.original.amiFamily}</Badge>,
      },
      {
        id: 'instanceTypes',
        header: 'Instance Types',
        cell: ({ row }) => (
          <span className="text-xs text-[var(--color-text-secondary)]">
            {row.original.instanceTypes.join(', ')}
          </span>
        ),
      },
      {
        accessorKey: 'subnets',
        header: 'Subnets',
        cell: ({ row }) => (
          <span className="text-xs text-[var(--color-text-muted)]">
            {row.original.subnets.join(', ')}
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <AppLayout>
      <PageTransition>
        <Breadcrumbs />

        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
              Karpenter
            </h1>
            <p className="mt-1 text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
              Autoscaling dashboard · mock data
            </p>
          </div>
          <button
            type="button"
            onClick={() => toast.success('Mock metrics refreshed')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-accent)]/60 hover:text-[var(--color-text-primary)] transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard
            title="Nodes provisioned"
            value={metrics.nodesProvisioned.toString()}
            icon={Server}
          />
          <MetricCard title="Pending pods" value={metrics.pendingPods.toString()} icon={Timer} />
          <MetricCard
            title="Estimated cost/hour"
            value={`$${metrics.estimatedCostPerHour.toFixed(2)}`}
            icon={CircleDollarSign}
          />
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
              NodePools
            </h2>
            <DataTable
              data={nodePools}
              columns={nodePoolColumns}
              searchable
              searchPlaceholder="Search NodePools…"
              mobileCard={(pool) => (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--color-text-primary)]">
                      {pool.name}
                    </span>
                    <Badge variant={poolStatusVariant(pool.status)}>{pool.status}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                    {pool.nodeCount} nodes · {pool.disruptionPolicy}
                  </p>
                </div>
              )}
            />
          </section>

          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
              EC2NodeClasses
            </h2>
            <DataTable
              data={nodeClasses}
              columns={nodeClassColumns}
              searchable
              searchPlaceholder="Search node classes…"
              mobileCard={(nodeClass) => (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3">
                  <p className="font-medium text-[var(--color-text-primary)]">{nodeClass.name}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    AMI: {nodeClass.amiFamily}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {nodeClass.instanceTypes.length} instance families · {nodeClass.subnets.length}{' '}
                    subnets
                  </p>
                </div>
              )}
            />
          </section>
        </div>

        <section className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            NodePool → Workload topology
          </h2>
          <p className="mt-1 text-xs text-[var(--color-text-dim)]">
            Simple mapping view to show scheduling intent
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {nodePools.map((pool, index) => (
              <motion.div
                key={pool.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {pool.name}
                  </h3>
                  <Badge variant={poolStatusVariant(pool.status)}>{pool.status}</Badge>
                </div>
                <ul className="mt-2 space-y-1">
                  {pool.workloads.map((workload) => (
                    <li key={workload} className="text-xs text-[var(--color-text-muted)]">
                      ↳ {workload}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </section>
      </PageTransition>
    </AppLayout>
  )
}

function MetricCard({
  title,
  value,
  icon: Icon,
}: {
  title: string
  value: string
  icon: typeof Server
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-[var(--color-text-dim)] font-mono">
          {title}
        </p>
        <Icon className="h-4 w-4 text-[var(--color-accent)]" />
      </div>
      <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{value}</p>
    </div>
  )
}
