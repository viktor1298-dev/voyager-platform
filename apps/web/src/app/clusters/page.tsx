'use client'

import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { QueryError } from '@/components/ErrorBoundary'
import { ProviderLogo } from '@/components/ProviderLogo'
import { SkeletonRow } from '@/components/Skeleton'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getStatusDotClass } from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { Database, Plus, Search, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

const STATUS_OPTIONS = ['healthy', 'warning', 'degraded', 'unreachable'] as const
const PROVIDER_OPTIONS = ['minikube', 'eks', 'gke', 'aks', 'k3s', 'rancher'] as const

const ADD_PROVIDER_OPTIONS = [
  { value: 'aws', label: 'AWS (EKS)' },
  { value: 'azure', label: 'Azure (AKS)' },
  { value: 'gcp', label: 'GCP (GKE)' },
  { value: 'on-prem', label: 'On-Prem' },
  { value: 'minikube', label: 'Minikube' },
] as const

function statusBadgeVariant(status: string) {
  if (status === 'healthy') return 'success' as const
  if (status === 'warning') return 'warning' as const
  if (status === 'degraded' || status === 'unreachable') return 'destructive' as const
  return 'outline' as const
}

function formatLastSeen(date: Date | string | null | undefined) {
  if (!date) return '—'
  const d = new Date(date)
  const now = Date.now()
  const diffMs = now - d.getTime()
  if (diffMs < 60_000) return 'just now'
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`
  return `${Math.floor(diffMs / 86_400_000)}d ago`
}

interface AddClusterFormData {
  name: string
  provider: string
  endpoint: string
}

const INITIAL_FORM: AddClusterFormData = { name: '', provider: 'aws', endpoint: '' }

export default function ClustersPage() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const clusters = trpc.clusters.list.useQuery()
  const createCluster = trpc.clusters.create.useMutation({
    onSuccess: () => {
      utils.clusters.list.invalidate()
      setShowAddModal(false)
      setForm(INITIAL_FORM)
    },
  })
  const deleteCluster = trpc.clusters.delete.useMutation({
    onSuccess: () => {
      utils.clusters.list.invalidate()
      setDeleteTarget(null)
    },
  })

  const [search, setSearch] = useState('')
  const [filterProvider, setFilterProvider] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState<AddClusterFormData>(INITIAL_FORM)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const clusterList = clusters.data ?? []

  const filtered = useMemo(() => {
    return clusterList.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterProvider && c.provider !== filterProvider) return false
      if (filterStatus && c.status !== filterStatus) return false
      return true
    })
  }, [clusterList, search, filterProvider, filterStatus])

  const hasActiveFilters = search || filterProvider || filterStatus

  const handleAddSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!form.name || !form.endpoint) return
      createCluster.mutate({
        name: form.name,
        provider: form.provider,
        endpoint: form.endpoint,
      })
    },
    [form, createCluster],
  )

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent, cluster: { id: string; name: string }) => {
      e.stopPropagation()
      setDeleteTarget(cluster)
    },
    [],
  )

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return
    deleteCluster.mutate({ id: deleteTarget.id })
  }, [deleteTarget, deleteCluster])

  const inputClass =
    'w-full px-3 py-2 text-sm rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors'
  const btnPrimary =
    'px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer'
  const btnSecondary =
    'px-4 py-2 text-sm font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-white/[0.06] transition-colors cursor-pointer'

  return (
    <AppLayout>
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
          <p className="text-[11px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-1">
            {clusterList.length} registered · {filtered.length} shown
          </p>
        </div>
        <button type="button" className={btnPrimary} onClick={() => setShowAddModal(true)}>
          <span className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Add Cluster
          </span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-[360px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Search clusters…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
        </div>

        <select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors cursor-pointer"
        >
          <option value="">All Providers</option>
          {PROVIDER_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p.toUpperCase()}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors cursor-pointer"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setFilterProvider('')
              setFilterStatus('')
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-white/[0.04] hover:bg-white/[0.08] border border-[var(--color-border)] transition-colors cursor-pointer"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div
        className="rounded-xl border border-[var(--color-border)] overflow-hidden"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
        }}
      >
        {clusters.isLoading ? (
          <div className="p-4 space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
            <Database className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {hasActiveFilters ? 'No clusters match your filters' : 'No clusters found'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setFilterProvider('')
                  setFilterStatus('')
                }}
                className="mt-2 text-xs text-[var(--color-accent)] hover:underline cursor-pointer"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[var(--color-border)] hover:bg-transparent">
                <TableHead className="text-[10px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider">
                  Name
                </TableHead>
                <TableHead className="text-[10px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider">
                  Provider
                </TableHead>
                <TableHead className="text-[10px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider">
                  Status
                </TableHead>
                <TableHead className="text-[10px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider">
                  Version
                </TableHead>
                <TableHead className="text-[10px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider">
                  Nodes
                </TableHead>
                <TableHead className="text-[10px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider hidden lg:table-cell">
                  Endpoint
                </TableHead>
                <TableHead className="text-[10px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider">
                  Last Seen
                </TableHead>
                <TableHead className="text-[10px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider w-[60px]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cluster, index) => (
                <TableRow
                  key={cluster.id}
                  onClick={() => router.push(`/clusters/${cluster.id}`)}
                  className="border-b border-white/[0.04] cursor-pointer hover:bg-white/[0.03] transition-colors animate-slide-up"
                  style={{
                    animationDelay: `${index * 30}ms`,
                    animationFillMode: 'both',
                  }}
                >
                  <TableCell className="font-semibold text-[var(--color-text-primary)]">
                    {cluster.name}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ProviderLogo provider={cluster.provider ?? 'default'} />
                      <span className="text-xs text-[var(--color-text-secondary)] font-mono uppercase">
                        {cluster.provider}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 animate-pulse-slow ${getStatusDotClass(cluster.status ?? 'unknown')}`}
                      />
                      <Badge variant={statusBadgeVariant(cluster.status ?? 'unknown')}>
                        {cluster.status ?? 'unknown'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-[var(--color-text-muted)] font-mono">
                    {cluster.version ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-[var(--color-text-secondary)] font-mono tabular-nums">
                    {cluster.nodeCount}
                  </TableCell>
                  <TableCell className="text-xs text-[var(--color-text-muted)] font-mono max-w-[200px] truncate hidden lg:table-cell">
                    {cluster.endpoint ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-[var(--color-text-muted)]">
                    {formatLastSeen(cluster.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteClick(e, { id: cluster.id, name: cluster.name })}
                      className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Delete cluster"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add Cluster Modal */}
      <Dialog open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Cluster">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Cluster Name
            </label>
            <input
              type="text"
              required
              placeholder="production-us-east"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Provider
            </label>
            <select
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              className={inputClass}
            >
              {ADD_PROVIDER_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Endpoint URL
            </label>
            <input
              type="url"
              required
              placeholder="https://k8s-api.example.com:6443"
              value={form.endpoint}
              onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))}
              className={inputClass}
            />
          </div>
          {createCluster.error && (
            <p className="text-xs text-red-400">{createCluster.error.message}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className={btnSecondary} onClick={() => setShowAddModal(false)}>
              Cancel
            </button>
            <button type="submit" className={btnPrimary} disabled={createCluster.isPending}>
              {createCluster.isPending ? 'Adding…' : 'Add Cluster'}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Cluster"
      >
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          Are you sure you want to delete{' '}
          <span className="font-semibold text-[var(--color-text-primary)]">
            {deleteTarget?.name}
          </span>
          ? This action cannot be undone.
        </p>
        {deleteCluster.error && (
          <p className="text-xs text-red-400 mb-4">{deleteCluster.error.message}</p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={() => setDeleteTarget(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
            onClick={handleDeleteConfirm}
            disabled={deleteCluster.isPending}
          >
            {deleteCluster.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Dialog>
    </AppLayout>
  )
}
