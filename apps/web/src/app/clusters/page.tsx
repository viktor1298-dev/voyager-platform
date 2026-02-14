'use client'

import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { QueryError } from '@/components/ErrorBoundary'
import { ProviderLogo } from '@/components/ProviderLogo'
import { SkeletonRow } from '@/components/Skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getStatusColor, getStatusDotClass } from '@/lib/status-utils'
import { trpc } from '@/lib/trpc'
import { Database, Search, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

const STATUS_OPTIONS = ['healthy', 'warning', 'degraded', 'unreachable'] as const
const PROVIDER_OPTIONS = ['minikube', 'eks', 'gke', 'aks', 'k3s', 'rancher'] as const

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

export default function ClustersPage() {
  const router = useRouter()
  const clusters = trpc.clusters.list.useQuery()
  const [search, setSearch] = useState('')
  const [filterProvider, setFilterProvider] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

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

  return (
    <AppLayout>
      <Breadcrumbs />

      {clusters.error && (
        <QueryError message={clusters.error.message} onRetry={() => clusters.refetch()} />
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
          Clusters
        </h1>
        <p className="text-[11px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-1">
          {clusterList.length} registered · {filtered.length} shown
        </p>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </AppLayout>
  )
}
