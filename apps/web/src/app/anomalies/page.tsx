'use client'

import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'
import { Fragment, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { AnomalyCard } from '@/components/anomalies/AnomalyCard'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import {
  type Anomaly,
  type AnomalySeverity,
  type AnomalyStatus,
  getRelativeTime,
  MOCK_ANOMALIES,
  severityScore,
} from '@/lib/anomalies'
import { cn } from '@/lib/utils'

const severityFilterOptions: Array<AnomalySeverity | 'all'> = ['all', 'critical', 'warning', 'info']
const statusFilterOptions: Array<AnomalyStatus | 'all'> = [
  'all',
  'open',
  'acknowledged',
  'resolved',
]

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

export default function AnomaliesPage() {
  // TODO: replace with trpc.anomalies.list.useQuery() once backend is ready.
  const [anomalies, setAnomalies] = useState<Anomaly[]>(MOCK_ANOMALIES)
  const [severityFilter, setSeverityFilter] = useState<AnomalySeverity | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<AnomalyStatus | 'all'>('all')
  const [clusterFilter, setClusterFilter] = useState<'all' | string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'detectedAt', desc: true },
    { id: 'severity', desc: true },
  ])

  const clusterOptions = useMemo(() => {
    return ['all', ...new Set(anomalies.map((a) => a.cluster))]
  }, [anomalies])

  const filteredAnomalies = useMemo(() => {
    return anomalies.filter((anomaly) => {
      if (severityFilter !== 'all' && anomaly.severity !== severityFilter) return false
      if (statusFilter !== 'all' && anomaly.status !== statusFilter) return false
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
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--color-border)] hover:bg-white/[0.04] cursor-pointer"
            onClick={(event) => {
              event.stopPropagation()
              setExpandedId((prev) => (prev === row.original.id ? null : row.original.id))
            }}
            aria-label={
              expandedId === row.original.id ? 'Collapse anomaly details' : 'Expand anomaly details'
            }
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
        cell: ({ row }) => (
          <span
            className={cn(
              'inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide font-semibold',
              severityBadge[row.original.severity],
            )}
          >
            {row.original.severity}
          </span>
        ),
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
            <p className="text-[10px] text-[var(--color-text-dim)]">
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
              'inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide font-semibold',
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
    <AppLayout>
      <PageTransition>
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <Breadcrumbs />
            <span className="text-xs text-[var(--color-text-dim)]">
              {filteredAnomalies.length} anomalies
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FilterSelect
              label="Severity"
              value={severityFilter}
              onChange={setSeverityFilter}
              options={severityFilterOptions}
            />
            <FilterSelect
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusFilterOptions}
            />
            <FilterSelect
              label="Cluster"
              value={clusterFilter}
              onChange={setClusterFilter}
              options={clusterOptions}
            />
          </div>

          <div className="rounded-xl border border-[var(--color-border)] overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((group) => (
                  <tr
                    key={group.id}
                    className="border-b border-[var(--color-border)] bg-white/[0.02]"
                  >
                    {group.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-mono text-[var(--color-text-dim)]"
                      >
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className={cn(
                              'inline-flex items-center gap-1',
                              header.column.getCanSort()
                                ? 'cursor-pointer hover:text-[var(--color-text-secondary)]'
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
                        className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer"
                        onClick={() =>
                          setExpandedId((prev) =>
                            prev === row.original.id ? null : row.original.id,
                          )
                        }
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
                                  <MetadataGrid metadata={row.original.metadata} />
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
                <div className="mt-2 rounded-lg border border-[var(--color-border)] p-3">
                  <MetadataGrid metadata={row.original.metadata} />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </PageTransition>
    </AppLayout>
  )
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: T[]
  onChange: (value: T) => void
}) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function MetadataGrid({ metadata }: { metadata: Record<string, string> }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {Object.entries(metadata).map(([key, value]) => (
        <div
          key={key}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2"
        >
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">{key}</p>
          <p className="text-xs text-[var(--color-text-primary)] mt-0.5">{value}</p>
        </div>
      ))}
    </div>
  )
}
