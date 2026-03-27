'use client'

import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { CircleDollarSign, RefreshCw, Server, Timer } from 'lucide-react'
import { motion } from 'motion/react'
import { useSearchParams } from 'next/navigation'
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
import { getTRPCClient, trpc } from '@/lib/trpc'
import { CardSkeleton } from '@/components/CardSkeleton'

type TopologyItem = {
  id: string
  name: string
  status: NodePool['status']
  workloads: string[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function normalizeNodePools(input: unknown): NodePool[] {
  if (!Array.isArray(input)) return getMockNodePools()

  const pools = input.map((item, index) => {
    const pool = asRecord(item)
    const statusRaw = asString(pool.status, 'Ready')
    const status: NodePool['status'] =
      statusRaw === 'Scaling' || statusRaw === 'Constrained' ? statusRaw : 'Ready'

    return {
      id: asString(pool.id, `np-${index}`),
      name: asString(pool.name, `NodePool ${index + 1}`),
      status,
      cpuLimit: asNumber(pool.cpuLimit),
      memoryLimitGi: asNumber(pool.memoryLimitGi),
      nodeCount: asNumber(pool.nodeCount),
      disruptionPolicy: asString(
        pool.disruptionPolicy,
        'WhenUnderutilized',
      ) as NodePool['disruptionPolicy'],
      workloads: asStringArray(pool.workloads),
    }
  })

  return pools.length > 0 ? pools : getMockNodePools()
}

function normalizeNodeClasses(input: unknown): EC2NodeClass[] {
  if (!Array.isArray(input)) return getMockEC2NodeClasses()

  const classes = input.map((item, index) => {
    const nodeClass = asRecord(item)
    const amiFamilyRaw = asString(nodeClass.amiFamily, 'AL2')
    const amiFamily: EC2NodeClass['amiFamily'] =
      amiFamilyRaw === 'Bottlerocket' || amiFamilyRaw === 'Ubuntu' ? amiFamilyRaw : 'AL2'

    return {
      id: asString(nodeClass.id, `nc-${index}`),
      name: asString(nodeClass.name, `NodeClass ${index + 1}`),
      amiFamily,
      instanceTypes: asStringArray(nodeClass.instanceTypes),
      subnets: asStringArray(nodeClass.subnets),
    }
  })

  return classes.length > 0 ? classes : getMockEC2NodeClasses()
}

function normalizeMetrics(input: unknown) {
  const fallback = getKarpenterMetrics()
  const metrics = asRecord(input)

  return {
    nodesProvisioned: asNumber(metrics.nodesProvisioned, fallback.nodesProvisioned),
    pendingPods: asNumber(metrics.pendingPods, fallback.pendingPods),
    estimatedCostPerHour: asNumber(metrics.estimatedCostPerHour, fallback.estimatedCostPerHour),
  }
}

function normalizeTopology(input: unknown, fallbackPools: NodePool[]): TopologyItem[] {
  if (!Array.isArray(input)) {
    return fallbackPools.map((pool) => ({
      id: pool.id,
      name: pool.name,
      status: pool.status,
      workloads: pool.workloads,
    }))
  }

  return input.map((item, index) => {
    const topology = asRecord(item)
    const statusRaw = asString(topology.status, 'Ready')
    const status: NodePool['status'] =
      statusRaw === 'Scaling' || statusRaw === 'Constrained' ? statusRaw : 'Ready'

    return {
      id: asString(topology.id, `topology-${index}`),
      name: asString(topology.name, asString(topology.nodePoolName, `NodePool ${index + 1}`)),
      status,
      workloads: asStringArray(topology.workloads),
    }
  })
}

function poolStatusVariant(status: NodePool['status']) {
  if (status === 'Ready') return 'success' as const
  if (status === 'Scaling') return 'warning' as const
  return 'destructive' as const
}

export default function KarpenterPage() {
  const searchParams = useSearchParams()
  const trpcClient = useMemo(
    () =>
      getTRPCClient() as unknown as {
        query: (path: string, input?: unknown) => Promise<unknown>
      },
    [],
  )

  const clustersQuery = trpc.clusters.list.useQuery()
  const selectedClusterId =
    searchParams.get('clusterId') ??
    (clustersQuery.data?.find((c) => c.healthStatus === 'healthy') ?? clustersQuery.data?.[0])
      ?.id ??
    null

  const nodePoolsFallback = useMemo(() => getMockNodePools(), [])
  const nodeClassesFallback = useMemo(() => getMockEC2NodeClasses(), [])

  const nodePoolsQuery = useQuery({
    queryKey: ['karpenter', 'listNodePools', selectedClusterId],
    queryFn: async () => {
      if (!selectedClusterId) return nodePoolsFallback
      try {
        const result = await trpcClient.query('karpenter.listNodePools', {
          clusterId: selectedClusterId,
        })
        return normalizeNodePools(result)
      } catch {
        return nodePoolsFallback
      }
    },
    enabled: !!selectedClusterId,
    initialData: nodePoolsFallback,
  })

  const nodeClassesQuery = useQuery({
    queryKey: ['karpenter', 'listEC2NodeClasses', selectedClusterId],
    queryFn: async () => {
      if (!selectedClusterId) return nodeClassesFallback
      try {
        const result = await trpcClient.query('karpenter.listEC2NodeClasses', {
          clusterId: selectedClusterId,
        })
        return normalizeNodeClasses(result)
      } catch {
        return nodeClassesFallback
      }
    },
    enabled: !!selectedClusterId,
    initialData: nodeClassesFallback,
  })

  const metricsQuery = useQuery({
    queryKey: ['karpenter', 'getMetrics', selectedClusterId],
    queryFn: async () => {
      if (!selectedClusterId) return getKarpenterMetrics()
      try {
        const result = await trpcClient.query('karpenter.getMetrics', {
          clusterId: selectedClusterId,
        })
        return normalizeMetrics(result)
      } catch {
        return getKarpenterMetrics()
      }
    },
    enabled: !!selectedClusterId,
    initialData: getKarpenterMetrics,
  })

  const topologyQuery = useQuery({
    queryKey: ['karpenter', 'getTopology', selectedClusterId, nodePoolsQuery.data],
    queryFn: async () => {
      if (!selectedClusterId) {
        return normalizeTopology(null, nodePoolsQuery.data)
      }
      try {
        const result = await trpcClient.query('karpenter.getTopology', {
          clusterId: selectedClusterId,
        })
        return normalizeTopology(result, nodePoolsQuery.data)
      } catch {
        return normalizeTopology(null, nodePoolsQuery.data)
      }
    },
    enabled: !!selectedClusterId,
    initialData: normalizeTopology(null, nodePoolsQuery.data),
  })

  const nodePools = nodePoolsQuery.data
  const nodeClasses = nodeClassesQuery.data
  const metrics = metricsQuery.data
  const topology = topologyQuery.data

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

  const refetchAll = async () => {
    await Promise.all([
      nodePoolsQuery.refetch(),
      nodeClassesQuery.refetch(),
      metricsQuery.refetch(),
      topologyQuery.refetch(),
    ])
    toast.success('Karpenter data refreshed')
  }

  return (
    <AppLayout>
      <PageTransition>
        <Breadcrumbs />

        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
              Karpenter
            </h1>
            <p className="mt-1 text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
              Autoscaling dashboard{selectedClusterId ? ` · cluster ${selectedClusterId}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={refetchAll}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-accent)]/60 hover:text-[var(--color-text-primary)] transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {metricsQuery.isLoading ? (
            <CardSkeleton count={3} />
          ) : (
            <>
              <MetricCard
                title="Nodes provisioned"
                value={metrics.nodesProvisioned.toString()}
                icon={Server}
              />
              <MetricCard
                title="Pending pods"
                value={metrics.pendingPods.toString()}
                icon={Timer}
              />
              <MetricCard
                title="Estimated cost/hour"
                value={`$${metrics.estimatedCostPerHour.toFixed(2)}`}
                icon={CircleDollarSign}
              />
            </>
          )}
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
              NodePools
            </h2>
            <DataTable
              data={nodePools}
              columns={nodePoolColumns}
              loading={nodePoolsQuery.isLoading}
              searchable
              searchPlaceholder="Search NodePools…"
              mobileCard={(pool) => (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3">
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
              loading={nodeClassesQuery.isLoading}
              searchable
              searchPlaceholder="Search node classes…"
              mobileCard={(nodeClass) => (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3">
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
            {topology.map((pool, index) => (
              <motion.div
                key={pool.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3"
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
                      <span aria-hidden="true">↳ </span>
                      <span className="sr-only">Workload: </span>
                      {workload}
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
      <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--color-text-primary)]">
        {value}
      </p>
    </div>
  )
}
