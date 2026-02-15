'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { QueryError } from '@/components/ErrorBoundary'
import { Badge } from '@/components/ui/badge'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { trpc } from '@/lib/trpc'
import {
  type ColumnDef,
  type SortingState,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
} from '@tanstack/react-table'
import { ChevronDown, ChevronRight, ClipboardList, Search, X } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { keepPreviousData } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { useRouter } from 'next/navigation'

type AuditEntry = {
  id: string
  userId: string
  userEmail: string
  action: string
  resource: string
  resourceId: string
  details: Record<string, unknown> | null
  ipAddress: string
  timestamp: string
}

const ACTION_COLORS: Record<string, { variant: 'success' | 'destructive' | 'secondary' | 'outline'; label?: string }> = {
  create: { variant: 'success' },
  delete: { variant: 'destructive' },
  update: { variant: 'secondary' },
  restart: { variant: 'secondary' },
  scale: { variant: 'secondary' },
  login: { variant: 'outline' },
  logout: { variant: 'outline' },
}

function ActionBadge({ action }: { action: string }) {
  const config = ACTION_COLORS[action.toLowerCase()] ?? { variant: 'outline' as const }
  return <Badge variant={config.variant}>{action}</Badge>
}

const ACTION_OPTIONS = ['create', 'update', 'delete', 'restart', 'scale', 'login', 'logout']
const PAGE_SIZE = 20

export default function AuditPage() {
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const [sorting, setSorting] = useState<SortingState>([{ id: 'timestamp', desc: true }])
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [page, setPage] = useState(0)
  const [actionFilter, setActionFilter] = useState('')
  const [emailSearch, setEmailSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const query = trpc.audit.list.useQuery(
    {
      page: page + 1,
      limit: PAGE_SIZE,
      ...(actionFilter && { action: actionFilter }),
      ...(emailSearch && { userId: emailSearch }),
      ...(dateFrom && { from: dateFrom }),
      ...(dateTo && { to: dateTo }),
    },
    { enabled: isAdmin === true, placeholderData: keepPreviousData },
  )

  const data: AuditEntry[] = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const columns = useMemo<ColumnDef<AuditEntry, unknown>[]>(
    () => [
      {
        id: 'expand',
        header: '',
        size: 32,
        cell: ({ row }) =>
          row.original.details ? (
            <button
              type="button"
              onClick={() => row.toggleExpanded()}
              className="p-1 rounded hover:bg-white/[0.06] text-[var(--color-text-muted)] transition-colors cursor-pointer"
            >
              {row.getIsExpanded() ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : null,
      },
      {
        accessorKey: 'timestamp',
        header: 'Timestamp',
        cell: ({ row }) => (
          <span className="text-[var(--color-text-muted)] font-mono text-[11px] whitespace-nowrap">
            {new Date(row.original.timestamp).toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: 'userEmail',
        header: 'User',
        cell: ({ row }) => (
          <span className="text-[var(--color-text-secondary)] font-mono text-[12px]">{row.original.userEmail}</span>
        ),
      },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: ({ row }) => <ActionBadge action={row.original.action} />,
      },
      {
        accessorKey: 'resource',
        header: 'Resource',
        cell: ({ row }) => (
          <span className="text-[var(--color-text-primary)] text-sm font-medium">{row.original.resource}</span>
        ),
      },
      {
        accessorKey: 'resourceId',
        header: 'Resource ID',
        cell: ({ row }) => (
          <span className="text-[var(--color-text-muted)] font-mono text-[11px]">{row.original.resourceId}</span>
        ),
      },
      {
        accessorKey: 'ipAddress',
        header: 'IP Address',
        cell: ({ row }) => (
          <span className="text-[var(--color-text-dim)] font-mono text-[11px]">{row.original.ipAddress}</span>
        ),
      },
    ],
    [],
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowCanExpand: (row) => !!row.original.details,
    manualPagination: true,
    pageCount: totalPages,
  })

  if (isAdmin === null) return null // loading
  if (isAdmin === false) {
    router.replace('/')
    return null
  }

  const selectClass =
    'px-3 py-1.5 text-xs rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors'
  const inputClass =
    'px-3 py-1.5 text-xs rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)] transition-colors'

  return (
    <AppLayout>
      <PageTransition>
        <Breadcrumbs />

        {query.error && <QueryError message={query.error.message} onRetry={() => query.refetch()} />}

        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Audit Log</h1>
          <p className="text-[11px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-1">
            {total} entries
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-dim)]" />
            <input
              type="text"
              placeholder="Search by email…"
              value={emailSearch}
              onChange={(e) => { setEmailSearch(e.target.value); setPage(0) }}
              className={`${inputClass} pl-8 w-48`}
            />
            {emailSearch && (
              <button type="button" onClick={() => { setEmailSearch(''); setPage(0) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0) }}
            className={selectClass}
          >
            <option value="">All Actions</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
            className={selectClass}
            title="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
            className={selectClass}
            title="To date"
          />

          {(actionFilter || emailSearch || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setActionFilter(''); setEmailSearch(''); setDateFrom(''); setDateTo(''); setPage(0) }}
              className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] underline cursor-pointer"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-[var(--color-border)]">
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]"
                        style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                        onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                      >
                        <span className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                        </span>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {query.isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={`skel-${i}`} className="border-b border-[var(--color-border)]/50">
                      {columns.map((_, ci) => (
                        <td key={ci} className="px-4 py-3">
                          <div className="h-4 rounded bg-white/[0.04] animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-16 text-center">
                      <ClipboardList className="h-10 w-10 text-[var(--color-text-dim)] mx-auto mb-3" />
                      <p className="text-sm text-[var(--color-text-muted)]">No audit entries found</p>
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <Fragment key={row.id}>
                      <tr
                        className="border-b border-[var(--color-border)]/50 hover:bg-white/[0.02] transition-colors"
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                      <AnimatePresence>
                        {row.getIsExpanded() && row.original.details && (
                          <tr key={`${row.id}-expanded`}>
                            <td colSpan={columns.length} className="px-4 py-0">
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <pre className="text-[11px] font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-primary)] rounded-lg p-4 my-2 overflow-x-auto">
                                  {JSON.stringify(row.original.details, null, 2)}
                                </pre>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-xs text-[var(--color-text-muted)]">
            <span>
              Page {page + 1} of {totalPages} · {total} total
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:bg-white/[0.06] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:bg-white/[0.06] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </PageTransition>
    </AppLayout>
  )
}
