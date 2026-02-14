'use client'

import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { QueryError } from '@/components/ErrorBoundary'
import { trpc } from '@/lib/trpc'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import type { ColumnDef } from '@tanstack/react-table'
import { Box, RefreshCw, Scale } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

interface Deployment {
  name: string
  namespace: string
  replicas: number
  ready: number
  image: string
  age: string
  status: string
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Running: 'bg-[var(--color-status-active)]/10 text-[var(--color-status-active)] border-[var(--color-status-active)]/20',
    Degraded: 'bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)] border-[var(--color-status-warning)]/20',
    Unavailable: 'bg-[var(--color-status-error)]/15 text-[var(--color-status-error)] border-[var(--color-status-error)]/20',
    'Scaled Down': 'bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)] border-[var(--color-text-dim)]/20',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${styles[status] ?? styles.Unavailable}`}>
      {status}
    </span>
  )
}

function ScaleDialog({ deployment, onClose }: { deployment: Deployment; onClose: () => void }) {
  const [replicas, setReplicas] = useState(deployment.replicas)
  const utils = trpc.useUtils()
  const scaleMutation = trpc.deployments.scale.useMutation({
    onSuccess: () => {
      utils.deployments.list.invalidate()
      onClose()
      toast.success(`Scaled ${deployment.name}`, { description: `Replicas set to ${replicas}` })
    },
    onError: (err) => toast.error('Scale failed', { description: err.message }),
  })

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
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-[12px] text-[var(--color-text-muted)] hover:bg-white/[0.04] transition-colors">Cancel</button>
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
  const [scaleTarget, setScaleTarget] = useState<Deployment | null>(null)
  const [confirmRestart, setConfirmRestart] = useState<Deployment | null>(null)

  const deploymentsQuery = trpc.deployments.list.useQuery(undefined, { refetchInterval: 30_000 })
  const utils = trpc.useUtils()
  const restartMutation = trpc.deployments.restart.useMutation({
    onSuccess: () => {
      utils.deployments.list.invalidate()
      const name = confirmRestart?.name
      setConfirmRestart(null)
      toast.success(`Deployment restarted`, { description: name })
    },
    onError: (err) => toast.error('Restart failed', { description: err.message }),
  })

  // Keyboard shortcuts
  useEffect(() => {
    const onRefresh = () => deploymentsQuery.refetch()
    document.addEventListener('voyager:refresh', onRefresh)
    return () => document.removeEventListener('voyager:refresh', onRefresh)
  }, [deploymentsQuery])

  const deployments: Deployment[] = (deploymentsQuery.data as Deployment[] | undefined) ?? []

  const columns = useMemo<ColumnDef<Deployment, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
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
        cell: ({ row }) => <span className="text-[var(--color-text-muted)] font-mono tabular-nums">{row.original.ready}/{row.original.replicas}</span>,
      },
      {
        accessorKey: 'image',
        header: 'Image',
        cell: ({ row }) => <span className="text-[var(--color-text-muted)] font-mono text-[11px] truncate max-w-[200px] block" title={row.original.image}>{row.original.image}</span>,
      },
      {
        accessorKey: 'age',
        header: 'Age',
        cell: ({ row }) => <span className="text-[var(--color-text-dim)] font-mono tabular-nums">{row.original.age}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      ...(isAdmin
        ? [
            {
              id: 'actions',
              header: 'Actions',
              enableSorting: false,
              cell: ({ row }: { row: { original: Deployment } }) => (
                <div className="flex gap-1 justify-end">
                  <button type="button" onClick={() => setConfirmRestart(row.original)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] transition-colors" title="Restart">
                    <RefreshCw className="h-3 w-3" />Restart
                  </button>
                  <button type="button" onClick={() => setScaleTarget(row.original)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] transition-colors" title="Scale">
                    <Scale className="h-3 w-3" />Scale
                  </button>
                </div>
              ),
            } as ColumnDef<Deployment, unknown>,
          ]
        : []),
    ],
    [isAdmin],
  )

  return (
    <AppLayout>
      <Breadcrumbs />

      {deploymentsQuery.error && (
        <QueryError message={deploymentsQuery.error.message} onRetry={() => deploymentsQuery.refetch()} />
      )}

      <div className="mb-6">
        <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Deployments</h1>
        <p className="text-[11px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-1">{deployments.length} deployments · auto-refresh 30s</p>
      </div>

      <DataTable
        data={deployments}
        columns={columns}
        searchable
        searchPlaceholder="Search deployments…"
        loading={deploymentsQuery.isLoading}
        emptyIcon={<Box className="h-8 w-8" />}
        emptyTitle="No deployments found"
        mobileCard={(d) => (
          <div className="p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-card)] space-y-2">
            <div className="flex justify-between items-center gap-2">
              <span className="text-[var(--color-text-primary)] font-medium text-sm truncate">{d.name}</span>
              <StatusBadge status={d.status} />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-[var(--color-text-muted)]">Namespace</span>
              <span className="text-[var(--color-accent)] font-mono truncate">{d.namespace}</span>
              <span className="text-[var(--color-text-muted)]">Replicas</span>
              <span className="text-[var(--color-text-primary)] font-mono tabular-nums">{d.ready}/{d.replicas}</span>
              <span className="text-[var(--color-text-muted)]">Age</span>
              <span className="text-[var(--color-text-primary)] font-mono">{d.age}</span>
            </div>
            {isAdmin && (
              <div className="pt-2 border-t border-[var(--color-border)]/50 flex gap-2">
                <button type="button" onClick={() => setConfirmRestart(d)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium text-[var(--color-text-muted)] bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                  <RefreshCw className="h-3 w-3" />Restart
                </button>
                <button type="button" onClick={() => setScaleTarget(d)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium text-[var(--color-text-muted)] bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                  <Scale className="h-3 w-3" />Scale
                </button>
              </div>
            )}
          </div>
        )}
      />

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
    </AppLayout>
  )
}
