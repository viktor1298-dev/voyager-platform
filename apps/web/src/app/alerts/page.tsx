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
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  History,
  Info,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { toast } from 'sonner'
import { AnomalyCard } from '@/components/anomalies/AnomalyCard'
import {
  type Anomaly,
  type AnomalySeverity,
  type AnomalyStatus,
  filterOpenAnomalies,
  getRelativeTime,
  MOCK_ANOMALIES,
  severityScore,
} from '@/lib/anomalies'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/hooks/usePageTitle'

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

function operatorLabel(op: string) {
  return OPERATORS.find((o) => o.value === op)?.label ?? op
}
function metricLabel(m: string) {
  return METRICS.find((mt) => mt.value === m)?.label ?? m
}

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
  name: string
  metric: Metric
  operator: Operator
  threshold: string
  clusterFilter: string
}
const INITIAL_FORM: CreateFormData = {
  name: '',
  metric: 'cpu',
  operator: 'gt',
  threshold: '',
  clusterFilter: '',
}

type AlertRow = {
  id: string
  name: string
  metric: string
  operator: string
  threshold: string | number
  clusterFilter: string | null
  enabled: boolean
}

export default function AlertsPage() {
  usePageTitle('Alerts')

  const [showCreate, setShowCreate] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateFormData>(INITIAL_FORM)

  const alertsQuery = trpc.alerts.list.useQuery()
  const historyQuery = trpc.alerts.history.useQuery({ limit: 20 })
  const alertQueryKey: unknown[] = [['alerts', 'list'], { type: 'query' }]
  const historyQueryKey: unknown[] = [
    ['alerts', 'history'],
    { input: { limit: 20 }, type: 'query' },
  ]

  const createMut = trpc.alerts.create.useMutation(
    useOptimisticOptions<
      AlertRow[],
      { name: string; metric: string; operator: string; threshold: number; clusterFilter?: string }
    >({
      queryKey: alertQueryKey,
      updater: (old, vars) => [
        {
          id: `temp-${Date.now()}`,
          name: vars.name,
          metric: vars.metric,
          operator: vars.operator,
          threshold: vars.threshold,
          clusterFilter: vars.clusterFilter ?? null,
          enabled: true,
        },
        ...(old ?? []),
      ],
      successMessage: 'Alert rule created',
      errorMessage: 'Failed to create alert — rolled back',
      onSuccess: () => {
        setShowCreate(false)
        setForm(INITIAL_FORM)
      },
    }),
  )
  const updateMut = trpc.alerts.update.useMutation(
    useOptimisticOptions<AlertRow[], { id: string; enabled?: boolean }>({
      queryKey: alertQueryKey,
      updater: (old, vars) =>
        (old ?? []).map((a) =>
          a.id === vars.id
            ? { ...a, ...(vars.enabled !== undefined ? { enabled: vars.enabled } : {}) }
            : a,
        ),
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
    const onRefresh = () => {
      alertsQuery.refetch()
      historyQuery.refetch()
    }
    const onNew = () => setShowCreate(true)
    document.addEventListener('voyager:refresh', onRefresh)
    document.addEventListener('voyager:new', onNew)
    return () => {
      document.removeEventListener('voyager:refresh', onRefresh)
      document.removeEventListener('voyager:new', onNew)
    }
  }, [alertsQuery, historyQuery])

  const handleCreate = useCallback(() => {
    const threshold = Number(form.threshold)
    if (!form.name || Number.isNaN(threshold)) return
    createMut.mutate({
      name: form.name,
      metric: form.metric,
      operator: form.operator,
      threshold,
      clusterFilter: form.clusterFilter || undefined,
    })
  }, [form, createMut])

  const alerts: AlertRow[] = alertsQuery.data ?? []
  const history = historyQuery.data ?? []

  const alertColumns = useMemo<ColumnDef<AlertRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => {
          const name = row.original.name
          // Detect UUID-like or auto-generated names (32+ hex chars or UUID pattern)
          const isAutoGenerated =
            /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(name) || /^[0-9a-f]{24,}$/i.test(name)
          if (isAutoGenerated) {
            return (
              <span
                className="text-[var(--color-text-primary)] font-mono text-xs cursor-help"
                title={name}
              >
                {name.slice(0, 8)}…
              </span>
            )
          }
          return <span className="text-[var(--color-text-primary)]">{name}</span>
        },
      },
      {
        accessorKey: 'metric',
        header: 'Metric',
        cell: ({ row }) => (
          <span className="text-[var(--color-text-secondary)]">
            {metricLabel(row.original.metric)}
          </span>
        ),
      },
      {
        id: 'condition',
        header: 'Condition',
        cell: ({ row }) => (
          <span className="text-[var(--color-text-secondary)]">
            {operatorLabel(row.original.operator)} {row.original.threshold}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'cluster',
        header: 'Cluster',
        accessorFn: (r) => r.clusterFilter,
        cell: ({ row }) => (
          <span className="text-[var(--color-text-muted)]">
            {row.original.clusterFilter ?? 'All'}
          </span>
        ),
      },
      {
        accessorKey: 'enabled',
        header: 'Status',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() =>
              updateMut.mutate({ id: row.original.id, enabled: !row.original.enabled })
            }
            aria-label={`${row.original.enabled ? 'Disable' : 'Enable'} alert ${row.original.name}`}
            className={`rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer ${row.original.enabled ? 'bg-[var(--color-status-active)]/20 text-[var(--color-status-active)]' : 'bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]'}`}
          >
            {row.original.enabled ? 'ON' : 'OFF'}
          </button>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setDeleteId(row.original.id)}
            aria-label={`Delete alert ${row.original.name}`}
            className="text-[var(--color-text-muted)] hover:text-red-400 transition-colors cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ),
      },
    ],
    [updateMut],
  )

  const inputClass =
    'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)]'
  const btnPrimary =
    'rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer'
  const btnSecondary =
    'rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-white/[0.06] transition-colors cursor-pointer'

  return (
    <AppLayout>
      <PageTransition>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Breadcrumbs />
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className={`flex items-center gap-2 ${btnPrimary}`}
            >
              <Plus className="h-4 w-4" />
              Create Alert
            </button>
          </div>

          {/* Create Modal */}
          <Dialog
            open={showCreate}
            onClose={() => {
              setShowCreate(false)
              setForm(INITIAL_FORM)
            }}
            title="Create Alert Rule"
          >
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Alert name"
                aria-label="Alert name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
              />
              <select
                value={form.metric}
                aria-label="Metric"
                onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value as Metric }))}
                className={inputClass}
              >
                {METRICS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select
                value={form.operator}
                aria-label="Operator"
                onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value as Operator }))}
                className={inputClass}
              >
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Threshold value"
                aria-label="Threshold value"
                value={form.threshold}
                onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Cluster filter (optional)"
                aria-label="Cluster filter"
                value={form.clusterFilter}
                onChange={(e) => setForm((f) => ({ ...f, clusterFilter: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false)
                  setForm(INITIAL_FORM)
                }}
                className={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={createMut.isPending}
                className={btnPrimary}
              >
                {createMut.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </Dialog>

          {/* Alerts Table */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[var(--color-accent)]" />
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Alert Rules
              </h2>
              <span className="ml-auto text-xs text-[var(--color-text-dim)]">
                {alerts.length} rules
              </span>
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
                      <span className="font-medium text-[var(--color-text-primary)] text-sm">
                        {alert.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateMut.mutate({ id: alert.id, enabled: !alert.enabled })}
                        aria-label={`${alert.enabled ? 'Disable' : 'Enable'} alert ${alert.name}`}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer ${alert.enabled ? 'bg-[var(--color-status-active)]/20 text-[var(--color-status-active)]' : 'bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]'}`}
                      >
                        {alert.enabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <span className="text-[var(--color-text-muted)]">Metric</span>
                      <span className="text-[var(--color-text-primary)]">
                        {metricLabel(alert.metric)}
                      </span>
                      <span className="text-[var(--color-text-muted)]">Condition</span>
                      <span className="text-[var(--color-text-primary)]">
                        {operatorLabel(alert.operator)} {alert.threshold}
                      </span>
                      <span className="text-[var(--color-text-muted)]">Cluster</span>
                      <span className="text-[var(--color-text-primary)]">
                        {alert.clusterFilter ?? 'All'}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-[var(--color-border)]/50 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setDeleteId(alert.id)}
                        aria-label={`Delete alert ${alert.name}`}
                        className="text-[var(--color-text-muted)] hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              />
            )}
          </div>

          {/* History */}
          <div
            className="rounded-xl border border-[var(--color-border)] overflow-hidden"
            style={{ background: 'var(--glass-bg)' }}
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
              <History className="h-4 w-4 text-[var(--color-status-warning)]" />
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Recent Triggers
              </h2>
            </div>
            {historyQuery.isLoading ? (
              <div className="p-4">
                <Shimmer className="h-16 w-full rounded-lg" />
              </div>
            ) : history.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">
                No alert triggers yet
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]/50">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--color-status-warning)]" />
                    <span className="flex-1 text-sm text-[var(--color-text-secondary)]">
                      {h.message}
                    </span>
                    <span className="text-xs text-[var(--color-text-dim)]">
                      {timeAgo(h.triggeredAt as unknown as string)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${h.acknowledged ? 'bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]' : 'bg-[var(--color-status-warning)]/20 text-[var(--color-status-warning)]'}`}
                    >
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

          {/* ── Anomalies Section (merged from /anomalies) ── */}
          <AnomaliesSection />
        </div>
      </PageTransition>
    </AppLayout>
  )
}

// ─── Anomalies Section (merged from /anomalies page) ─────────────────────────

const severityBadge: Record<AnomalySeverity, string> = {
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
}

const statusBadge: Record<AnomalyStatus, string> = {
  open: 'bg-red-500/15 text-red-300 border-red-500/30',
  acknowledged: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
}

const severityFilterOptions: Array<AnomalySeverity | 'all'> = ['all', 'critical', 'warning', 'info']
const statusFilterOptions: Array<AnomalyStatus | 'all'> = [
  'all',
  'open',
  'acknowledged',
  'resolved',
]

function AnomaliesSection() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>(MOCK_ANOMALIES)
  const [severityFilter, setSeverityFilter] = useState<AnomalySeverity | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<AnomalyStatus | 'all'>('open')
  const [clusterFilter, setClusterFilter] = useState<'all' | string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'detectedAt', desc: true },
    { id: 'severity', desc: true },
  ])

  const clusterOptions = useMemo(
    () => ['all', ...new Set(anomalies.map((a) => a.cluster))],
    [anomalies],
  )

  const filteredAnomalies = useMemo(() => {
    const statusScoped = statusFilter === 'open' ? filterOpenAnomalies(anomalies) : anomalies
    return statusScoped.filter((anomaly) => {
      if (severityFilter !== 'all' && anomaly.severity !== severityFilter) return false
      if (statusFilter !== 'all' && statusFilter !== 'open' && anomaly.status !== statusFilter)
        return false
      if (clusterFilter !== 'all' && anomaly.cluster !== clusterFilter) return false
      return true
    })
  }, [anomalies, severityFilter, statusFilter, clusterFilter])

  const acknowledgeAnomaly = (id: string) => {
    setAnomalies((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'acknowledged' } : item)),
    )
    toast.success('Anomaly acknowledged')
  }

  const resolveAnomaly = (id: string) => {
    setAnomalies((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: 'resolved' } : item)),
    )
    toast.success('Anomaly resolved')
  }

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false
    return Boolean(target.closest('a, button, input, select, textarea, [role="button"]'))
  }

  const columns = useMemo<ColumnDef<Anomaly, unknown>[]>(
    () => [
      {
        id: 'expand',
        header: '',
        size: 44,
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--color-border)] hover:bg-white/[0.04] cursor-pointer transition-colors duration-150"
            onClick={(event) => {
              event.stopPropagation()
              setExpandedId((prev) => (prev === row.original.id ? null : row.original.id))
            }}
            aria-label={expandedId === row.original.id ? 'Collapse' : 'Expand'}
          >
            {expandedId === row.original.id ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ),
      },
      {
        accessorKey: 'severity',
        header: 'Severity',
        sortingFn: (a, b) =>
          severityScore(a.original.severity) - severityScore(b.original.severity),
        cell: ({ row }) => {
          const sev = row.original.severity
          const SevIcon = sev === 'critical' ? XCircle : sev === 'warning' ? AlertTriangle : Info
          return (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide font-semibold',
                severityBadge[sev],
              )}
            >
              <SevIcon className="h-3 w-3" />
              {sev}
            </span>
          )
        },
      },
      { accessorKey: 'type', header: 'Type' },
      {
        accessorKey: 'cluster',
        header: 'Cluster',
        cell: ({ row }) => (
          <Link
            href={`/clusters/${row.original.clusterId}`}
            className="text-[var(--color-accent)] hover:underline"
          >
            {row.original.cluster}
          </Link>
        ),
      },
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => (
          <span className="font-medium text-[var(--color-text-primary)]">{row.original.title}</span>
        ),
      },
      {
        accessorKey: 'detectedAt',
        header: 'Detected',
        sortingFn: (a, b) =>
          new Date(a.original.detectedAt).getTime() - new Date(b.original.detectedAt).getTime(),
        cell: ({ row }) => (
          <div className="text-xs text-[var(--color-text-secondary)]">
            <p>{getRelativeTime(row.original.detectedAt)}</p>
            <p className="text-xs text-[var(--color-text-dim)]">
              {new Date(row.original.detectedAt).toLocaleString()}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span
            className={cn(
              'inline-flex rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide font-semibold',
              statusBadge[row.original.status],
            )}
          >
            {row.original.status}
          </span>
        ),
      },
    ],
    [expandedId],
  )

  const table = useReactTable({
    data: filteredAnomalies,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2 pt-2">
        <div className="flex-1 h-px bg-[var(--color-border)]" />
        <div className="flex items-center gap-2 px-3">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-bold text-[var(--color-text-primary)]">Anomalies</h2>
          <span className="text-xs text-[var(--color-text-dim)]">
            {filteredAnomalies.length} detected
          </span>
        </div>
        <div className="flex-1 h-px bg-[var(--color-border)]" />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(
          [
            {
              label: 'Severity',
              value: severityFilter,
              onChange: setSeverityFilter,
              options: severityFilterOptions,
            },
            {
              label: 'Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: statusFilterOptions,
            },
            {
              label: 'Cluster',
              value: clusterFilter,
              onChange: setClusterFilter,
              options: clusterOptions,
            },
          ] as const
        ).map(({ label, value, onChange, options }) => (
          <label key={label} className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
              {label}
            </span>
            <select
              value={value}
              onChange={(e) => onChange(e.target.value as never)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            >
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {/* Desktop table */}
      <div className="rounded-xl border border-[var(--color-border)] overflow-hidden hidden md:block">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-[var(--color-border)] bg-white/[0.02]">
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2 text-left text-xs uppercase tracking-wider font-mono text-[var(--color-text-dim)]"
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          'inline-flex items-center gap-1',
                          header.column.getCanSort()
                            ? 'cursor-pointer hover:text-[var(--color-text-secondary)] transition-colors duration-150'
                            : '',
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const isExpanded = expandedId === row.original.id
              return (
                <Fragment key={row.id}>
                  <tr
                    className={cn(
                      'border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors duration-150',
                      row.original.severity === 'critical' && 'animate-glow-critical',
                      row.original.severity === 'warning' && 'animate-glow-warning',
                    )}
                    onClick={(e) => {
                      if (isInteractiveTarget(e.target)) return
                      setExpandedId((p) => (p === row.original.id ? null : row.original.id))
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-white/[0.04]">
                    <td colSpan={columns.length} className="p-0">
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="p-3 bg-black/10 dark:bg-white/[0.02] space-y-3">
                              <AnomalyCard
                                anomaly={row.original}
                                onAcknowledge={acknowledgeAnomaly}
                                onResolve={resolveAnomaly}
                              />
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {Object.entries(row.original.metadata).map(([key, val]) => (
                                  <div
                                    key={key}
                                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2"
                                  >
                                    <p className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
                                      {key}
                                    </p>
                                    <p className="text-xs text-[var(--color-text-primary)] mt-0.5">
                                      {val}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {table.getRowModel().rows.map((row) => (
          <motion.div
            key={row.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <AnomalyCard
              anomaly={row.original}
              onAcknowledge={acknowledgeAnomaly}
              onResolve={resolveAnomaly}
            />
          </motion.div>
        ))}
      </div>
    </div>
  )
}
