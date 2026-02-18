'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { QueryError } from '@/components/ErrorBoundary'
import { useOptimisticOptions } from '@/hooks/useOptimisticMutation'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { trpc } from '@/lib/trpc'
import type { ColumnDef } from '@tanstack/react-table'
import { Box, Loader2, RefreshCw, Scale } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface RolloutInfo {
  revision: string
  image: string
  updatedAt: string
}

interface Deployment {
  clusterId: string
  clusterName: string
  name: string
  namespace: string
  replicas: number
  ready: number
  image: string
  imageVersion: string
  status: 'Running' | 'Pending' | 'Failed' | 'Scaling' | 'Restarting...'
  lastUpdated: string
  age: string
  rolloutHistory: RolloutInfo[]
}

function StatusBadge({ status }: { status: Deployment['status'] }) {
  const styles: Record<Deployment['status'], string> = {
    Running: 'bg-[var(--color-status-active)]/20 border-[var(--color-status-active)]/35',
    Pending: 'bg-[var(--color-status-idle)]/20 border-[var(--color-status-idle)]/35',
    Failed: 'bg-[var(--color-status-error)]/20 border-[var(--color-status-error)]/35',
    Scaling: 'bg-[var(--color-status-warning)]/20 border-[var(--color-status-warning)]/35',
    'Restarting...': 'bg-[var(--color-status-warning)]/20 border-[var(--color-status-warning)]/35',
  }

  const dotColor: Record<Deployment['status'], string> = {
    Running: 'bg-[var(--color-status-active)]',
    Pending: 'bg-[var(--color-status-idle)]',
    Failed: 'bg-[var(--color-status-error)]',
    Scaling: 'bg-[var(--color-status-warning)]',
    'Restarting...': 'bg-[var(--color-status-warning)]',
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-[var(--color-badge-label)] border ${styles[status]}`}>
      {status === 'Restarting...' ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className={`h-1.5 w-1.5 rounded-full ${dotColor[status]}`} />}
      {status}
    </span>
  )
}

function ScaleDialog({ deployment, onClose }: { deployment: Deployment; onClose: () => void }) {
  const [replicas, setReplicas] = useState(deployment.replicas)
  const deployQueryKey = [['deployments', 'list'], { type: 'query' }] as const

  const scaleMutation = trpc.deployments.scale.useMutation(
    useOptimisticOptions<Deployment[], { name: string; namespace: string; replicas: number }>({
      queryKey: deployQueryKey,
      updater: (old, vars) =>
        (old ?? []).map((d) =>
          d.name === vars.name && d.namespace === vars.namespace
            ? { ...d, replicas: vars.replicas, status: 'Scaling' }
            : d,
        ),
      successMessage: `Scaled ${deployment.name}`,
      errorMessage: 'Scale failed — rolled back',
      onSuccess: onClose,
    }),
  )

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose} role="presentation">
      <div
        className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-5 w-80 max-w-[calc(100vw-2rem)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Scale ${deployment.name}`}
      >
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-1">Scale Deployment</h3>
        <p className="text-[11px] text-[var(--color-text-muted)] mb-4 font-mono">{deployment.namespace}/{deployment.name}</p>
        <label className="block text-[11px] text-[var(--color-text-muted)] mb-1" htmlFor="replica-input">Replicas</label>
        <input
          id="replica-input"
          type="number"
          min={0}
          max={50}
          value={replicas}
          onChange={(e) => setReplicas(Number(e.target.value))}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]/50 mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-[12px] text-[var(--color-badge-label)] hover:bg-white/[0.04] transition-colors">Cancel</button>
          <button
            type="button"
            onClick={() => scaleMutation.mutate({ name: deployment.name, namespace: deployment.namespace, replicas })}
            disabled={scaleMutation.isPending}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {scaleMutation.isPending ? 'Scaling...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DeploymentsPage() {
  const isAdmin = useIsAdmin()
  const [isClient, setIsClient] = useState(false)
  const [scaleTarget, setScaleTarget] = useState<Deployment | null>(null)
  const [confirmRestart, setConfirmRestart] = useState<Deployment | null>(null)
  const [namespaceFilter, setNamespaceFilter] = useState<string>('all')

  const deploymentsQuery = trpc.deployments.list.useQuery(undefined, { refetchInterval: 30_000 })
  const deployQueryKey = [['deployments', 'list'], { type: 'query' }] as const

  const restartMutation = trpc.deployments.restart.useMutation(
    useOptimisticOptions<Deployment[], { name: string; namespace: string }>({
      queryKey: deployQueryKey,
      updater: (old, vars) =>
        (old ?? []).map((d) =>
          d.name === vars.name && d.namespace === vars.namespace
            ? { ...d, status: 'Restarting...' }
            : d,
        ),
      successMessage: 'Deployment restarted',
      errorMessage: 'Restart failed — rolled back',
      onSuccess: () => setConfirmRestart(null),
    }),
  )

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    const onRefresh = () => deploymentsQuery.refetch()
    document.addEventListener('voyager:refresh', onRefresh)
    return () => document.removeEventListener('voyager:refresh', onRefresh)
  }, [deploymentsQuery])

  const deployments: Deployment[] = (deploymentsQuery.data as Deployment[] | undefined) ?? []

  const namespaces = useMemo(
    () => Array.from(new Set(deployments.map((d) => d.namespace))).sort((a, b) => a.localeCompare(b)),
    [deployments],
  )

  const filteredDeployments = useMemo(
    () =>
      namespaceFilter === 'all'
        ? deployments
        : deployments.filter((deployment) => deployment.namespace === namespaceFilter),
    [deployments, namespaceFilter],
  )

  const groupedByCluster = useMemo(() => {
    const groups = new Map<string, { clusterId: string; clusterName: string; deployments: Deployment[] }>()

    for (const deployment of filteredDeployments) {
      const key = deployment.clusterId
      const existing = groups.get(key)
      if (existing) {
        existing.deployments.push(deployment)
      } else {
        groups.set(key, {
          clusterId: deployment.clusterId,
          clusterName: deployment.clusterName,
          deployments: [deployment],
        })
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.clusterName.localeCompare(b.clusterName))
  }, [filteredDeployments])

  const formatTimestamp = useCallback((timestamp: string) => {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return '—'
    if (!isClient) return `${date.toISOString().replace('T', ' ').slice(0, 19)} UTC`
    return date.toLocaleString()
  }, [isClient])

  const columns = useMemo<ColumnDef<Deployment, unknown>[]>(() => {
    const base: ColumnDef<Deployment, unknown>[] = [
      {
        accessorKey: 'name',
        header: 'Deployment',
        cell: ({ row }) => <span className="text-[var(--color-text-primary)] font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: 'namespace',
        header: 'Namespace',
        cell: ({ row }) => <span className="text-[var(--color-accent)] font-mono text-[11px]">{row.original.namespace}</span>,
      },
      {
        id: 'replicas',
        header: 'Replicas',
        accessorFn: (row) => `${row.ready}/${row.replicas}`,
        cell: ({ row }) => <span className="text-[var(--color-text-primary)] font-mono tabular-nums">{row.original.ready}/{row.original.replicas}</span>,
      },
      {
        accessorKey: 'imageVersion',
        header: 'Version',
        cell: ({ row }) => <span className="text-[var(--color-text-secondary)] font-mono text-[11px]">{row.original.imageVersion}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'rolloutHistory',
        header: 'Rollouts',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1 max-w-[260px]">
            {row.original.rolloutHistory.length === 0 ? (
              <span className="text-[10px] text-[var(--color-text-secondary)]">No history</span>
            ) : (
              row.original.rolloutHistory.slice(0, 3).map((rollout) => (
                <span
                  key={`${rollout.revision}-${rollout.updatedAt}`}
                  className="px-1.5 py-0.5 rounded border border-[var(--color-border)] text-[10px] text-[var(--color-text-secondary)] font-mono"
                  title={`${rollout.image} • ${formatTimestamp(rollout.updatedAt)}`}
                >
                  r{rollout.revision}
                </span>
              ))
            )}
          </div>
        ),
      },
      {
        accessorKey: 'lastUpdated',
        header: 'Updated',
        cell: ({ row }) => <span className="text-[var(--color-text-secondary)] text-[11px]">{formatTimestamp(row.original.lastUpdated)}</span>,
      },
    ]

    if (!isAdmin) return base

    return [
      ...base,
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex gap-1 justify-end">
            <button type="button" onClick={() => setConfirmRestart(row.original)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/35 text-[10px] font-medium text-[var(--color-badge-label)] hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)] transition-colors" title="Restart">
              <RefreshCw className="h-3 w-3" />Restart
            </button>
            <button type="button" onClick={() => setScaleTarget(row.original)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/35 text-[10px] font-medium text-[var(--color-badge-label)] hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)] transition-colors" title="Scale">
              <Scale className="h-3 w-3" />Scale
            </button>
          </div>
        ),
      },
    ]
  }, [formatTimestamp, isAdmin])

  return (
    <AppLayout>
      <PageTransition>
        <Breadcrumbs />

        {deploymentsQuery.error && (
          <QueryError message={deploymentsQuery.error.message} onRetry={() => deploymentsQuery.refetch()} />
        )}

        <div className="mb-6 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Deployments</h1>
            <p className="text-[12px] text-[var(--color-text-muted)] mt-1">
              Track rollout status, replica health, and restart/scale operations.
            </p>
            <p className="text-[11px] text-[var(--color-table-meta)] font-mono uppercase tracking-wider mt-1">
              {filteredDeployments.length} deployments · {groupedByCluster.length} clusters · auto-refresh 30s
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="namespace-filter" className="text-xs text-[var(--color-table-meta)]">Namespace</label>
            <select
              id="namespace-filter"
              value={namespaceFilter}
              onChange={(event) => setNamespaceFilter(event.target.value)}
              className="px-3 py-2 rounded-lg text-sm bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]/50"
            >
              <option value="all">All namespaces</option>
              {namespaces.map((namespace) => (
                <option key={namespace} value={namespace}>{namespace}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-5">
          {groupedByCluster.map((cluster) => (
            <section key={cluster.clusterId} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{cluster.clusterName}</h2>
                <span className="text-[11px] text-[var(--color-table-meta)] font-mono">{cluster.deployments.length} deployments</span>
              </div>

              <DataTable
                data={cluster.deployments}
                columns={columns}
                searchable
                searchPlaceholder={`Search in ${cluster.clusterName}...`}
                loading={deploymentsQuery.isLoading}
                emptyIcon={<Box className="h-7 w-7" />}
                emptyTitle="No deployments in this cluster"
                mobileCard={(deployment) => (
                  <div className="p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-card)] space-y-2">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[var(--color-text-primary)] font-medium text-sm truncate">{deployment.name}</span>
                      <StatusBadge status={deployment.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <span className="text-[var(--color-table-meta)]">Namespace</span>
                      <span className="text-[var(--color-accent)] font-mono truncate">{deployment.namespace}</span>
                      <span className="text-[var(--color-table-meta)]">Replicas</span>
                      <span className="text-[var(--color-text-primary)] font-mono tabular-nums">{deployment.ready}/{deployment.replicas}</span>
                      <span className="text-[var(--color-table-meta)]">Version</span>
                      <span className="text-[var(--color-text-primary)] font-mono">{deployment.imageVersion}</span>
                    </div>
                    {isAdmin && (
                      <div className="pt-2 border-t border-[var(--color-border)]/50 flex gap-2">
                        <button type="button" onClick={() => setConfirmRestart(deployment)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-[var(--color-border)] text-[11px] font-medium text-[var(--color-badge-label)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-card-hover)] transition-colors">
                          <RefreshCw className="h-3 w-3" />Restart
                        </button>
                        <button type="button" onClick={() => setScaleTarget(deployment)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-[var(--color-border)] text-[11px] font-medium text-[var(--color-badge-label)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-card-hover)] transition-colors">
                          <Scale className="h-3 w-3" />Scale
                        </button>
                      </div>
                    )}
                  </div>
                )}
              />
            </section>
          ))}

          {!deploymentsQuery.isLoading && groupedByCluster.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
              <Box className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No deployments found for selected namespace</p>
            </div>
          )}
        </div>

        {scaleTarget && <ScaleDialog deployment={scaleTarget} onClose={() => setScaleTarget(null)} />}

        <ConfirmDialog
          open={confirmRestart !== null}
          onClose={() => setConfirmRestart(null)}
          onConfirm={() => confirmRestart && restartMutation.mutate({ name: confirmRestart.name, namespace: confirmRestart.namespace })}
          title="Restart Deployment?"
          description={
            <>
              This will perform a rolling restart of all pods in{' '}
              <span className="font-mono text-[var(--color-text-primary)]">{confirmRestart?.namespace}/{confirmRestart?.name}</span>.
            </>
          }
          confirmLabel="Restart"
          variant="warning"
          loading={restartMutation.isPending}
          error={restartMutation.error?.message}
        />
      </PageTransition>
    </AppLayout>
  )
}
