'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { AddClusterWizard, type AddClusterWizardPayload } from '@/components/AddClusterWizard'
import { DataTable } from '@/components/DataTable'
import { FilterBar, type FilterValue } from '@/components/FilterBar'
import { QueryError } from '@/components/ErrorBoundary'
import { ProviderLogo } from '@/components/ProviderLogo'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useOptimisticOptions } from '@/hooks/useOptimisticMutation'
import { usePermission } from '@/hooks/usePermission'
import { getClusterEnvironment, getClusterTags } from '@/lib/cluster-meta'
import { normalizeLiveHealthStatus, healthBadgeVariant, healthBadgeLabel, type LiveHealthStatus } from '@/lib/cluster-status'
import { getBestRelationForUser, getRelationBadgeClass, type Relation } from '@/lib/mock-access-control'
import { getStatusDotClass } from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { useAuthStore } from '@/stores/auth'
import type { ColumnDef } from '@tanstack/react-table'
import { Database, Eye, Plus, Trash2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

function formatLastSeen(date: Date | string | null | undefined, isClient: boolean) {
  if (!date) return '—'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'

  if (!isClient) {
    return `${d.toISOString().replace('T', ' ').slice(0, 19)} UTC`
  }

  const now = Date.now()
  const diffMs = now - d.getTime()
  if (diffMs < 60_000) return 'just now'
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`
  return `${Math.floor(diffMs / 86_400_000)}d ago`
}

type CreateClusterInput = {
  name: string
  provider: 'kubeconfig' | 'aws' | 'azure' | 'gke' | 'minikube'
  endpoint?: string
  connectionConfig?: Record<string, unknown>
}

type ClusterRow = {
  id: string
  name: string
  provider: string | null
  status?: string | null
  healthStatus?: string | null
  version?: string | null
  nodeCount: number
  endpoint?: string | null
  updatedAt?: Date | string | null
  environment?: 'development' | 'staging' | 'production'
}

// P1-010: Primary action (view) + destructive (delete) in correct order
function ClusterActions({ clusterId, clusterName, onDelete }: { clusterId: string; clusterName: string; onDelete: () => void }) {
  const canDelete = usePermission('cluster', clusterId, 'admin')
  const router = useRouter()
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                router.push(`/clusters/${clusterId}`)
              }}
              className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors cursor-pointer"
              aria-label={`View cluster ${clusterName}`}
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>View cluster</TooltipContent>
        </Tooltip>
        {canDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                aria-label={`Delete cluster ${clusterName}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Delete cluster</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}

export default function ClustersPage() {
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const clusters = trpc.clusters.list.useQuery()
  const liveHealth = trpc.health.status.useQuery({}, { refetchInterval: 30000 })
  const clusterQueryKey = [['clusters', 'list'], { type: 'query' }] as const

  const createCluster = trpc.clusters.create.useMutation(
    useOptimisticOptions<ClusterRow[], CreateClusterInput>({
      queryKey: clusterQueryKey,
      updater: (old, vars) => [
        ...(old ?? []),
        { id: `temp-${Date.now()}`, name: vars.name, provider: vars.provider, status: 'pending', version: null, nodeCount: 0, endpoint: vars.endpoint, updatedAt: new Date().toISOString() },
      ],
      successMessage: 'Cluster added successfully',
      errorMessage: 'Failed to add cluster — rolled back',
      onSuccess: () => setShowAddModal(false),
    }),
  )

  const deleteCluster = trpc.clusters.delete.useMutation(
    useOptimisticOptions<ClusterRow[], { id: string }>({
      queryKey: clusterQueryKey,
      updater: (old, vars) => (old ?? []).filter((c) => c.id !== vars.id),
      successMessage: 'Cluster deleted',
      errorMessage: 'Failed to delete cluster — rolled back',
      onSuccess: () => setDeleteTarget(null),
    }),
  )

  const [showAddModal, setShowAddModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [isClient, setIsClient] = useState(false)
  const currentUserId = useAuthStore((state) => state.user?.id)

  const getPermissionForCluster = useCallback((clusterId: string): Relation | null => {
    if (!currentUserId) return null
    return getBestRelationForUser(currentUserId, clusterId)
  }, [currentUserId])

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const onRefresh = () => clusters.refetch()
    const onNew = () => isAdmin && setShowAddModal(true)
    document.addEventListener('voyager:refresh', onRefresh)
    document.addEventListener('voyager:new', onNew)
    return () => {
      document.removeEventListener('voyager:refresh', onRefresh)
      document.removeEventListener('voyager:new', onNew)
    }
  }, [clusters, isAdmin])

  const [filters, setFilters] = useState<FilterValue>({
    environment: 'all',
    status: 'all',
    provider: 'all',
    health: 'all',
    tags: [],
    q: '',
  })

  const clusterList: ClusterRow[] = clusters.data ?? []

  const liveHealthByClusterId = useMemo(() => {
    const map = new Map<string, LiveHealthStatus>()
    for (const item of liveHealth.data ?? []) {
      map.set(item.clusterId, normalizeLiveHealthStatus(item.status))
    }
    return map
  }, [liveHealth.data])

  const filterOptions = useMemo(() => {
    const statuses = new Set<string>()
    const providers = new Set<string>()
    const health = new Set<string>()
    const tags = new Set<string>()

    for (const cluster of clusterList) {
      statuses.add((cluster.healthStatus ?? cluster.status ?? 'unknown').toLowerCase())
      providers.add(cluster.provider ?? 'unknown')
      health.add(normalizeLiveHealthStatus(cluster.healthStatus ?? cluster.status))
      for (const tag of getClusterTags({ name: cluster.name, provider: cluster.provider ?? undefined, source: 'db' })) {
        tags.add(tag)
      }
    }

    return {
      environments: ['prod', 'staging', 'dev'],
      statuses: Array.from(statuses).sort(),
      providers: Array.from(providers).sort(),
      health: Array.from(health),
      tags: Array.from(tags).sort(),
    }
  }, [clusterList])

  const filteredClusters = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return clusterList.filter((cluster) => {
      const env = getClusterEnvironment(cluster.name, cluster.provider)
      if (filters.environment !== 'all' && env !== filters.environment) return false
      const statusValue = (cluster.healthStatus ?? cluster.status ?? 'unknown').toLowerCase()
      if (filters.status !== 'all' && statusValue !== filters.status) return false
      if (filters.provider !== 'all' && (cluster.provider ?? 'unknown') !== filters.provider) return false
      const healthValue = normalizeLiveHealthStatus(cluster.healthStatus ?? cluster.status)
      if (filters.health !== 'all' && healthValue !== filters.health) return false
      const clusterTags = getClusterTags({ name: cluster.name, provider: cluster.provider ?? undefined, source: 'db' })
      if (filters.tags.length > 0 && !filters.tags.every((tag) => clusterTags.includes(tag))) return false
      if (q && !`${cluster.name} ${cluster.provider ?? ''} ${clusterTags.join(' ')}`.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [clusterList, filters])

  const onFiltersChange = useCallback((next: FilterValue) => setFilters(next), [])

  const columns = useMemo<ColumnDef<ClusterRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-semibold text-[var(--color-text-primary)]">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'provider',
        header: 'Provider',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <ProviderLogo provider={row.original.provider ?? 'default'} />
            <span className="text-xs text-[var(--color-text-secondary)] font-mono uppercase">
              {row.original.provider}
            </span>
          </div>
        ),
      },
      {
        id: 'healthStatus',
        header: 'Health',
        cell: ({ row }) => {
          const liveStatus = normalizeLiveHealthStatus(row.original.healthStatus ?? row.original.status)
          return (
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full shrink-0 animate-pulse-slow ${getStatusDotClass(liveStatus)}`} />
              <Badge variant={healthBadgeVariant(liveStatus)}>
                {healthBadgeLabel(liveStatus)}
              </Badge>
            </div>
          )
        },
      },
      {
        id: 'permission',
        header: 'Access',
        cell: ({ row }) => {
          const relation = getPermissionForCluster(row.original.id)
          if (!relation) return <span className="text-xs text-[var(--color-text-muted)]">—</span>
          return <Badge className={getRelationBadgeClass(relation)}>{relation}</Badge>
        },
      },
      {
        accessorKey: 'version',
        header: 'Version',
        cell: ({ row }) => (
          <span className="text-xs text-[var(--color-text-secondary)] font-mono">{row.original.version ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'nodeCount',
        header: 'Nodes',
        cell: ({ row }) => (
          <span className="text-xs text-[var(--color-text-secondary)] font-mono tabular-nums">{row.original.nodeCount}</span>
        ),
      },
      {
        accessorKey: 'endpoint',
        header: 'Endpoint',
        cell: ({ row }) => (
          <span className="text-xs text-[var(--color-text-secondary)] font-mono max-w-[200px] truncate block">{row.original.endpoint ?? '—'}</span>
        ),
        meta: { className: 'hidden lg:table-cell' },
      },
      {
        id: 'lastSeen',
        accessorFn: (row) => row.updatedAt,
        header: 'Last Seen',
        cell: ({ row }) => (
          <span className="text-xs text-[var(--color-text-secondary)]" suppressHydrationWarning>
            {formatLastSeen(row.original.updatedAt, isClient)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        size: 80,
        cell: ({ row }: { row: { original: ClusterRow } }) => (
          <ClusterActions
            clusterId={row.original.id}
            clusterName={row.original.name}
            onDelete={() => setDeleteTarget({ id: row.original.id, name: row.original.name })}
          />
        ),
      } as ColumnDef<ClusterRow, unknown>,
    ],
    [getPermissionForCluster, isAdmin, isClient],
  )

  const toCreateClusterInput = useCallback((payload: AddClusterWizardPayload): CreateClusterInput => {
    const { name, provider, endpoint, connectionConfig } = payload
    return { name, provider, endpoint, connectionConfig }
  }, [])

  const btnPrimary =
    'px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer min-h-[44px]'

  return (
    <AppLayout>
      <PageTransition>
      <Breadcrumbs />

      {clusters.error && (
        <QueryError message={clusters.error.message} onRetry={() => clusters.refetch()} />
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
            Clusters
          </h1>
          <p className="text-[11px] text-[var(--color-text-muted)] font-mono uppercase tracking-wider mt-1">
            {filteredClusters.length}/{clusterList.length} visible
          </p>
        </div>
        {isAdmin && (
          <button type="button" className={btnPrimary} onClick={() => setShowAddModal(true)}>
            <span className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              Add Cluster
            </span>
          </button>
        )}
      </div>

      <FilterBar options={filterOptions} onChange={onFiltersChange} className="mb-4" />

      <DataTable
        data={filteredClusters}
        columns={columns}
        onRowClick={(row) => router.push(`/clusters/${row.id}`)}
        loading={clusters.isLoading}
        emptyIcon={<Database className="h-10 w-10" />}
        emptyTitle="No clusters found"
        mobileCard={(row) => {
          const liveStatus = normalizeLiveHealthStatus(row.healthStatus ?? row.status)
          const relation = getPermissionForCluster(row.id)
          const tags = getClusterTags({ name: row.name, provider: row.provider ?? undefined, source: 'db' })
          return (
            <div
              onClick={() => router.push(`/clusters/${row.id}`)}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 cursor-pointer active:bg-white/[0.03] space-y-3"
            >
              {/* Top: Status dot + Name */}
              <div className="flex items-center gap-2.5">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 animate-pulse-slow ${getStatusDotClass(liveStatus)}`} />
                <span className="font-semibold text-[var(--color-text-primary)] truncate text-sm flex-1">{row.name}</span>
                {/* P3-010: layoutId for shared element transition to cluster detail */}
                <ProviderLogo provider={row.provider ?? 'default'} layoutId={`cluster-icon-${row.id}`} />
              </div>

              {/* Middle: Metrics grid */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Nodes', value: String(row.nodeCount) },
                  { label: 'Version', value: row.version ?? '—' },
                  { label: 'Status', value: healthBadgeLabel(liveStatus) },
                ].map((m) => (
                  <div key={m.label} className="text-center rounded-lg bg-white/[0.03] py-1.5 px-1">
                    <div className="text-[9px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider">{m.label}</div>
                    <div className={`text-xs font-bold ${m.value === '—' || m.value === '0' ? 'text-[var(--color-text-dim)]' : 'text-[var(--color-text-primary)]'}`}>{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Bottom: Tags + Access */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {relation && <Badge className={getRelationBadgeClass(relation)}>{relation}</Badge>}
                {tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-white/[0.05] text-[var(--color-text-dim)] border border-[var(--color-border)]">{tag}</span>
                ))}
                <span className="ml-auto text-[10px] text-[var(--color-text-dim)]" suppressHydrationWarning>
                  {formatLastSeen(row.updatedAt, isClient)}
                </span>
              </div>
            </div>
          )
        }}
      />

      {/* Add Cluster Modal */}
      <Dialog open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Cluster">
        <AddClusterWizard
          pending={createCluster.isPending}
          onCancel={() => setShowAddModal(false)}
          onSubmit={(payload) => createCluster.mutate(toCreateClusterInput(payload))}
        />
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteCluster.mutate({ id: deleteTarget.id })}
        title="Delete Cluster"
        description={
          <>
            Are you sure you want to delete{' '}
            <span className="font-semibold text-[var(--color-text-primary)]">{deleteTarget?.name}</span>?
            This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        loading={deleteCluster.isPending}
        error={deleteCluster.error?.message}
      />
      </PageTransition>
    </AppLayout>
  )
}
