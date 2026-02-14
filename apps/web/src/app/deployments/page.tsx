'use client'

import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { QueryError } from '@/components/ErrorBoundary'
import { Shimmer } from '@/components/Skeleton'
import { trpc } from '@/lib/trpc'
import { Box, RefreshCw, Scale } from 'lucide-react'
import { useState } from 'react'

const REFETCH_INTERVAL = 30_000

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
    Running:
      'bg-[var(--color-status-active)]/10 text-[var(--color-status-active)] border-[var(--color-status-active)]/20',
    Degraded:
      'bg-[var(--color-status-warning)]/15 text-[var(--color-status-warning)] border-[var(--color-status-warning)]/20',
    Unavailable:
      'bg-[var(--color-status-error)]/15 text-[var(--color-status-error)] border-[var(--color-status-error)]/20',
    'Scaled Down':
      'bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)] border-[var(--color-text-dim)]/20',
  }
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${styles[status] ?? styles.Unavailable}`}
    >
      {status}
    </span>
  )
}

function ScaleDialog({
  deployment,
  onClose,
}: {
  deployment: Deployment
  onClose: () => void
}) {
  const [replicas, setReplicas] = useState(deployment.replicas)
  const utils = trpc.useUtils()
  const scaleMutation = trpc.deployments.scale.useMutation({
    onSuccess: () => {
      utils.deployments.list.invalidate()
      onClose()
    },
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
        <p className="text-[11px] text-[var(--color-text-muted)] mb-4 font-mono">
          {deployment.namespace}/{deployment.name}
        </p>
        <label className="block text-[11px] text-[var(--color-text-muted)] mb-1" htmlFor="replica-input">
          Replicas
        </label>
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
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[12px] text-[var(--color-text-muted)] hover:bg-white/[0.04] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              scaleMutation.mutate({
                name: deployment.name,
                namespace: deployment.namespace,
                replicas,
              })
            }
            disabled={scaleMutation.isPending}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {scaleMutation.isPending ? 'Scaling...' : 'Apply'}
          </button>
        </div>
        {scaleMutation.error && (
          <p className="text-[11px] text-[var(--color-status-error)] mt-2">
            {scaleMutation.error.message}
          </p>
        )}
      </div>
    </div>
  )
}

export default function DeploymentsPage() {
  const [scaleTarget, setScaleTarget] = useState<Deployment | null>(null)
  const [confirmRestart, setConfirmRestart] = useState<Deployment | null>(null)

  const deploymentsQuery = trpc.deployments.list.useQuery(undefined, {
    refetchInterval: REFETCH_INTERVAL,
  })

  const utils = trpc.useUtils()
  const restartMutation = trpc.deployments.restart.useMutation({
    onSuccess: () => {
      utils.deployments.list.invalidate()
      setConfirmRestart(null)
    },
  })

  const deployments: Deployment[] = (deploymentsQuery.data as Deployment[] | undefined) ?? []
  const isLoading = deploymentsQuery.isLoading

  return (
    <AppLayout>
      <Breadcrumbs />

      {deploymentsQuery.error && (
        <QueryError message={deploymentsQuery.error.message} onRetry={() => deploymentsQuery.refetch()} />
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
          Deployments
        </h1>
        <p className="text-[11px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-1">
          {deployments.length} deployments · auto-refresh 30s
        </p>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex gap-4">
            <Shimmer className="h-3 w-20" />
            <Shimmer className="h-3 w-16" />
            <Shimmer className="h-3 w-24" />
            <Shimmer className="h-3 flex-1" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`shimmer-${i.toString()}`} className="px-4 py-3 border-b border-[var(--color-border)]/30 flex gap-4">
              <Shimmer className="h-4 w-20" />
              <Shimmer className="h-4 w-16" />
              <Shimmer className="h-4 w-24" />
              <Shimmer className="h-4 flex-1" />
            </div>
          ))}
        </div>
      ) : deployments.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-12 text-center">
          <Box className="h-8 w-8 text-[var(--color-text-dim)] mx-auto mb-3" />
          <p className="text-sm text-[var(--color-text-muted)]">No deployments found</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
          {/* Desktop Table Header */}
          <div className="hidden md:grid grid-cols-[1fr_100px_90px_1fr_70px_70px_120px] gap-2 px-4 py-2.5 border-b border-[var(--color-border)] text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
            <span>Name</span>
            <span>Namespace</span>
            <span>Replicas</span>
            <span>Image</span>
            <span>Age</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>

          {/* Desktop Rows */}
          <div className="hidden md:block max-h-[calc(100vh-320px)] overflow-y-auto">
            {deployments.map((d) => (
              <div
                key={`d-${d.namespace}/${d.name}`}
                className="grid grid-cols-[1fr_100px_90px_1fr_70px_70px_120px] gap-2 px-4 py-2.5 text-[12px] border-b border-[var(--color-border)]/20 hover:bg-white/[0.02] transition-colors items-center"
              >
                <span className="text-[var(--color-text-primary)] font-medium truncate">{d.name}</span>
                <span className="text-[var(--color-accent)] font-mono text-[11px] truncate">{d.namespace}</span>
                <span className="text-[var(--color-text-muted)] font-mono tabular-nums">{d.ready}/{d.replicas}</span>
                <span className="text-[var(--color-text-muted)] font-mono text-[11px] truncate" title={d.image}>{d.image}</span>
                <span className="text-[var(--color-text-dim)] font-mono tabular-nums">{d.age}</span>
                <StatusBadge status={d.status} />
                <div className="flex gap-1 justify-end">
                  <button type="button" onClick={() => setConfirmRestart(d)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] transition-colors" title="Restart">
                    <RefreshCw className="h-3 w-3" />Restart
                  </button>
                  <button type="button" onClick={() => setScaleTarget(d)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] transition-colors" title="Scale">
                    <Scale className="h-3 w-3" />Scale
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden max-h-[calc(100vh-320px)] overflow-y-auto space-y-0">
            {deployments.map((d) => (
              <div
                key={`m-${d.namespace}/${d.name}`}
                className="p-3 border-b border-[var(--color-border)]/20 space-y-2"
              >
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
                  <span className="text-[var(--color-text-muted)]">Image</span>
                  <span className="text-[var(--color-text-primary)] font-mono text-[10px] truncate">{d.image}</span>
                </div>
                <div className="pt-2 border-t border-[var(--color-border)]/50 flex gap-2">
                  <button type="button" onClick={() => setConfirmRestart(d)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium text-[var(--color-text-muted)] bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                    <RefreshCw className="h-3 w-3" />Restart
                  </button>
                  <button type="button" onClick={() => setScaleTarget(d)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium text-[var(--color-text-muted)] bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                    <Scale className="h-3 w-3" />Scale
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scale Dialog */}
      {scaleTarget && (
        <ScaleDialog deployment={scaleTarget} onClose={() => setScaleTarget(null)} />
      )}

      {/* Restart Confirmation Dialog */}
      {confirmRestart && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setConfirmRestart(null)} role="presentation">
          <div
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl p-5 w-80 max-w-[calc(100vw-2rem)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Restart ${confirmRestart.name}`}
          >
            <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-1">Restart Deployment?</h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-4 font-mono">
              {confirmRestart.namespace}/{confirmRestart.name}
            </p>
            <p className="text-[12px] text-[var(--color-text-muted)] mb-4">
              This will perform a rolling restart of all pods in this deployment.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmRestart(null)}
                className="px-3 py-1.5 rounded-lg text-[12px] text-[var(--color-text-muted)] hover:bg-white/[0.04] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  restartMutation.mutate({
                    name: confirmRestart.name,
                    namespace: confirmRestart.namespace,
                  })
                }
                disabled={restartMutation.isPending}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-status-warning)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {restartMutation.isPending ? 'Restarting...' : 'Restart'}
              </button>
            </div>
            {restartMutation.error && (
              <p className="text-[11px] text-[var(--color-status-error)] mt-2">
                {restartMutation.error.message}
              </p>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
