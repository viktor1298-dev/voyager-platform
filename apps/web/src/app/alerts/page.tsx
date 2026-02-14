'use client'

import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { QueryError } from '@/components/ErrorBoundary'
import { Shimmer } from '@/components/Skeleton'
import { trpc } from '@/lib/trpc'
import { Bell, Plus, Trash2, History, AlertTriangle } from 'lucide-react'
import { useState, useCallback } from 'react'

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

function operatorLabel(op: string): string {
  return OPERATORS.find((o) => o.value === op)?.label ?? op
}

function metricLabel(m: string): string {
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
  const days = Math.floor(hours / 24)
  return `${days}d ago`
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

export default function AlertsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateFormData>(INITIAL_FORM)

  const utils = trpc.useUtils()
  const alertsQuery = trpc.alerts.list.useQuery()
  const historyQuery = trpc.alerts.history.useQuery({ limit: 20 })

  const createMut = trpc.alerts.create.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate()
      setShowCreate(false)
      setForm(INITIAL_FORM)
    },
  })

  const updateMut = trpc.alerts.update.useMutation({
    onSuccess: () => utils.alerts.list.invalidate(),
  })

  const deleteMut = trpc.alerts.delete.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate()
      utils.alerts.history.invalidate()
      setDeleteId(null)
    },
  })

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

  const toggleEnabled = useCallback(
    (id: string, currentEnabled: boolean) => {
      updateMut.mutate({ id, enabled: !currentEnabled })
    },
    [updateMut],
  )

  const alerts = alertsQuery.data ?? []
  const history = historyQuery.data ?? []

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Breadcrumbs />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Alert
          </button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
              <h2 className="mb-4 text-lg font-semibold text-white">Create Alert Rule</h2>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Alert name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
                />
                <select
                  value={form.metric}
                  onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value as Metric }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                >
                  {METRICS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <select
                  value={form.operator}
                  onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value as Operator }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
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
                  value={form.threshold}
                  onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
                />
                <input
                  type="text"
                  placeholder="Cluster filter (optional)"
                  value={form.clusterFilter}
                  onChange={(e) => setForm((f) => ({ ...f, clusterFilter: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
                />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false)
                    setForm(INITIAL_FORM)
                  }}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={createMut.isPending}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMut.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
              <h2 className="mb-2 text-lg font-semibold text-white">Delete Alert</h2>
              <p className="mb-4 text-sm text-zinc-400">Are you sure? This action cannot be undone.</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteId(null)}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteMut.mutate({ id: deleteId })}
                  disabled={deleteMut.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMut.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Alerts Table */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <Bell className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Alert Rules</h2>
            <span className="ml-auto text-xs text-zinc-500">{alerts.length} rules</span>
          </div>
          {alertsQuery.isLoading ? (
            <div className="p-4">
              <Shimmer className="h-20 w-full rounded-lg" />
            </div>
          ) : alertsQuery.isError ? (
            <div className="p-4">
              <QueryError message={alertsQuery.error?.message ?? 'Failed to load alerts'} />
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-zinc-500">
              <AlertTriangle className="h-8 w-8" />
              <p className="text-sm">No alert rules configured</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Metric</th>
                  <th className="px-4 py-2">Condition</th>
                  <th className="px-4 py-2">Cluster</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-3 text-white">{alert.name}</td>
                    <td className="px-4 py-3 text-zinc-300">{metricLabel(alert.metric)}</td>
                    <td className="px-4 py-3 text-zinc-300">
                      {operatorLabel(alert.operator)} {alert.threshold}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{alert.clusterFilter ?? 'All'}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleEnabled(alert.id, alert.enabled)}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          alert.enabled
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-zinc-700/50 text-zinc-500'
                        }`}
                      >
                        {alert.enabled ? 'ON' : 'OFF'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDeleteId(alert.id)}
                        className="text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* History Section */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <History className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-white">Recent Triggers</h2>
          </div>
          {historyQuery.isLoading ? (
            <div className="p-4">
              <Shimmer className="h-16 w-full rounded-lg" />
            </div>
          ) : historyQuery.isError ? (
            <div className="p-4">
              <QueryError message={historyQuery.error?.message ?? 'Failed to load history'} />
            </div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">No alert triggers yet</div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span className="flex-1 text-sm text-zinc-300">{h.message}</span>
                  <span className="text-xs text-zinc-500">{timeAgo(h.triggeredAt as unknown as string)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      h.acknowledged
                        ? 'bg-zinc-700/50 text-zinc-500'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {h.acknowledged ? 'ACK' : 'NEW'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
