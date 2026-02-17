'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { QueryError } from '@/components/ErrorBoundary'
import { useOptimisticOptions } from '@/hooks/useOptimisticMutation'
import { Shimmer } from '@/components/Skeleton'
import { Dialog } from '@/components/ui/dialog'
import { trpc } from '@/lib/trpc'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, Bell, CheckCircle, History, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

type Metric = 'cpu' | 'memory' | 'pods' | 'restarts'
type Operator = 'gt' | 'lt' | 'eq'

const METRICS: { value: Metric; label: string }[] = [
  { value: 'cpu', label: 'CPU Usage' },
  { value: 'memory', label: 'Memory Usage' },
  { value: 'pods', label: 'Pod Count' },
  { value: 'restarts', label: 'Restart Count' },
]

const OPERATORS: { value: Operator; label: string }[] = [
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'eq', label: '=' },
]

function operatorLabel(op: string) { return OPERATORS.find((o) => o.value === op)?.label ?? op }
function metricLabel(m: string) { return METRICS.find((mt) => mt.value === m)?.label ?? m }

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

interface CreateFormData {
  name: string; metric: Metric; operator: Operator; threshold: string; clusterFilter: string
}
const INITIAL_FORM: CreateFormData = { name: '', metric: 'cpu', operator: 'gt', threshold: '', clusterFilter: '' }

type AlertRow = { id: string; name: string; metric: string; operator: string; threshold: string | number; clusterFilter: string | null; enabled: boolean }

export default function AlertsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateFormData>(INITIAL_FORM)

  const alertsQuery = trpc.alerts.list.useQuery()
  const historyQuery = trpc.alerts.history.useQuery({ limit: 20 })
  const alertQueryKey: unknown[] = [['alerts', 'list'], { type: 'query' }]
  const historyQueryKey: unknown[] = [['alerts', 'history'], { input: { limit: 20 }, type: 'query' }]

  const createMut = trpc.alerts.create.useMutation(
    useOptimisticOptions<AlertRow[], { name: string; metric: string; operator: string; threshold: number; clusterFilter?: string }>({
      queryKey: alertQueryKey,
      updater: (old, vars) => [
        { id: `temp-${Date.now()}`, name: vars.name, metric: vars.metric, operator: vars.operator, threshold: vars.threshold, clusterFilter: vars.clusterFilter ?? null, enabled: true },
        ...(old ?? []),
      ],
      successMessage: 'Alert rule created',
      errorMessage: 'Failed to create alert — rolled back',
      onSuccess: () => { setShowCreate(false); setForm(INITIAL_FORM) },
    }),
  )
  const updateMut = trpc.alerts.update.useMutation(
    useOptimisticOptions<AlertRow[], { id: string; enabled?: boolean }>({
      queryKey: alertQueryKey,
      updater: (old, vars) =>
        (old ?? []).map((a) => (a.id === vars.id ? { ...a, ...(vars.enabled !== undefined ? { enabled: vars.enabled } : {}) } : a)),
      successMessage: 'Alert updated',
      errorMessage: 'Failed to update alert — rolled back',
    }),
  )
  const deleteMut = trpc.alerts.delete.useMutation(
    useOptimisticOptions<AlertRow[], { id: string }>({
      queryKey: alertQueryKey,
      updater: (old, vars) => (old ?? []).filter((a) => a.id !== vars.id),
      successMessage: 'Alert deleted',
      errorMessage: 'Failed to delete alert — rolled back',
      invalidateKeys: [historyQueryKey],
      onSuccess: () => setDeleteId(null),
    }),
  )

  useEffect(() => {
    const onRefresh = () => { alertsQuery.refetch(); historyQuery.refetch() }
    const onNew = () => setShowCreate(true)
    document.addEventListener('voyager:refresh', onRefresh)
    document.addEventListener('voyager:new', onNew)
    return () => { document.removeEventListener('voyager:refresh', onRefresh); document.removeEventListener('voyager:new', onNew) }
  }, [alertsQuery, historyQuery])

  const handleCreate = useCallback(() => {
    const threshold = Number(form.threshold)
    if (!form.name || Number.isNaN(threshold)) return
    createMut.mutate({ name: form.name, metric: form.metric, operator: form.operator, threshold, clusterFilter: form.clusterFilter || undefined })
  }, [form, createMut])

  const alerts: AlertRow[] = alertsQuery.data ?? []
  const history = historyQuery.data ?? []

  const alertColumns = useMemo<ColumnDef<AlertRow, unknown>[]>(() => [
    { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span className="text-[var(--color-text-primary)]">{row.original.name}</span> },
    { accessorKey: 'metric', header: 'Metric', cell: ({ row }) => <span className="text-[var(--color-text-secondary)]">{metricLabel(row.original.metric)}</span> },
    { id: 'condition', header: 'Condition', cell: ({ row }) => <span className="text-[var(--color-text-secondary)]">{operatorLabel(row.original.operator)} {row.original.threshold}</span>, enableSorting: false },
    { id: 'cluster', header: 'Cluster', accessorFn: (r) => r.clusterFilter, cell: ({ row }) => <span className="text-[var(--color-text-muted)]">{row.original.clusterFilter ?? 'All'}</span> },
    {
      accessorKey: 'enabled', header: 'Status',
      cell: ({ row }) => (
        <button type="button" onClick={() => updateMut.mutate({ id: row.original.id, enabled: !row.original.enabled })}
          aria-label={`${row.original.enabled ? 'Disable' : 'Enable'} alert ${row.original.name}`}
          className={`rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer ${row.original.enabled ? 'bg-[var(--color-status-active)]/20 text-[var(--color-status-active)]' : 'bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]'}`}>
          {row.original.enabled ? 'ON' : 'OFF'}
        </button>
      ),
    },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <button type="button" onClick={() => setDeleteId(row.original.id)} aria-label={`Delete alert ${row.original.name}`} className="text-[var(--color-text-muted)] hover:text-red-400 transition-colors cursor-pointer">
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ], [updateMut])

  const inputClass = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)]'
  const btnPrimary = 'rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer'
  const btnSecondary = 'rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-white/[0.06] transition-colors cursor-pointer'

  return (
    <AppLayout>
      <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Breadcrumbs />
          <button type="button" onClick={() => setShowCreate(true)} className={`flex items-center gap-2 ${btnPrimary}`}>
            <Plus className="h-4 w-4" />Create Alert
          </button>
        </div>

        {/* Create Modal */}
        <Dialog open={showCreate} onClose={() => { setShowCreate(false); setForm(INITIAL_FORM) }} title="Create Alert Rule">
          <div className="space-y-3">
            <input type="text" placeholder="Alert name" aria-label="Alert name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} />
            <select value={form.metric} aria-label="Metric" onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value as Metric }))} className={inputClass}>
              {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={form.operator} aria-label="Operator" onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value as Operator }))} className={inputClass}>
              {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input type="number" placeholder="Threshold value" aria-label="Threshold value" value={form.threshold} onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))} className={inputClass} />
            <input type="text" placeholder="Cluster filter (optional)" aria-label="Cluster filter" value={form.clusterFilter} onChange={(e) => setForm((f) => ({ ...f, clusterFilter: e.target.value }))} className={inputClass} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => { setShowCreate(false); setForm(INITIAL_FORM) }} className={btnSecondary}>Cancel</button>
            <button type="button" onClick={handleCreate} disabled={createMut.isPending} className={btnPrimary}>{createMut.isPending ? 'Creating...' : 'Create'}</button>
          </div>
        </Dialog>

        {/* Alerts Table */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[var(--color-accent)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Alert Rules</h2>
            <span className="ml-auto text-xs text-[var(--color-text-dim)]">{alerts.length} rules</span>
          </div>
          {alertsQuery.isError ? (
            <QueryError message={alertsQuery.error?.message ?? 'Failed to load alerts'} />
          ) : (
            <DataTable
              data={alerts}
              columns={alertColumns}
              loading={alertsQuery.isLoading}
              emptyIcon={<AlertTriangle className="h-8 w-8" />}
              emptyTitle="No alert rules configured"
              mobileCard={(alert) => (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 space-y-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-medium text-[var(--color-text-primary)] text-sm">{alert.name}</span>
                    <button type="button" onClick={() => updateMut.mutate({ id: alert.id, enabled: !alert.enabled })}
                      aria-label={`${alert.enabled ? 'Disable' : 'Enable'} alert ${alert.name}`}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer ${alert.enabled ? 'bg-[var(--color-status-active)]/20 text-[var(--color-status-active)]' : 'bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]'}`}>
                      {alert.enabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-[var(--color-text-muted)]">Metric</span>
                    <span className="text-[var(--color-text-primary)]">{metricLabel(alert.metric)}</span>
                    <span className="text-[var(--color-text-muted)]">Condition</span>
                    <span className="text-[var(--color-text-primary)]">{operatorLabel(alert.operator)} {alert.threshold}</span>
                    <span className="text-[var(--color-text-muted)]">Cluster</span>
                    <span className="text-[var(--color-text-primary)]">{alert.clusterFilter ?? 'All'}</span>
                  </div>
                  <div className="pt-2 border-t border-[var(--color-border)]/50 flex justify-end">
                    <button type="button" onClick={() => setDeleteId(alert.id)} aria-label={`Delete alert ${alert.name}`} className="text-[var(--color-text-muted)] hover:text-red-400 transition-colors cursor-pointer"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              )}
            />
          )}
        </div>

        {/* History */}
        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden" style={{ background: 'var(--glass-bg)' }}>
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
            <History className="h-4 w-4 text-[var(--color-status-warning)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Recent Triggers</h2>
          </div>
          {historyQuery.isLoading ? (
            <div className="p-4"><Shimmer className="h-16 w-full rounded-lg" /></div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">No alert triggers yet</div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]/50">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--color-status-warning)]" />
                  <span className="flex-1 text-sm text-[var(--color-text-secondary)]">{h.message}</span>
                  <span className="text-xs text-[var(--color-text-dim)]">{timeAgo(h.triggeredAt as unknown as string)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${h.acknowledged ? 'bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]' : 'bg-[var(--color-status-warning)]/20 text-[var(--color-status-warning)]'}`}>
                    {h.acknowledged ? 'ACK' : 'NEW'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <ConfirmDialog
          open={deleteId !== null}
          onClose={() => setDeleteId(null)}
          onConfirm={() => deleteId && deleteMut.mutate({ id: deleteId })}
          title="Delete Alert"
          description="Are you sure? This action cannot be undone."
          confirmLabel="Delete"
          variant="danger"
          loading={deleteMut.isPending}
        />
      </div>
      </PageTransition>
    </AppLayout>
  )
}
