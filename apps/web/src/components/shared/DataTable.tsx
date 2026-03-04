'use client'

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/utils'

export interface DataTableProps<TData> {
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  /** Enable global search */
  searchable?: boolean
  searchPlaceholder?: string
  /** Enable pagination */
  paginated?: boolean
  pageSize?: number
  /** Enable row selection */
  selectable?: boolean
  onSelectionChange?: (rows: TData[]) => void
  /** Row actions — rendered as a trailing column */
  rowActions?: (row: TData) => ReactNode
  /** Row click */
  onRowClick?: (row: TData) => void
  /** Additional toolbar content (right-aligned) */
  toolbar?: ReactNode
  /** Empty state */
  emptyIcon?: ReactNode
  emptyTitle?: string
  emptyDescription?: string
  /** Show loading skeleton */
  loading?: boolean
  /** Sticky header (requires parent to have a bounded height) */
  stickyHeader?: boolean
  className?: string
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

export function DataTable<TData>({
  data,
  columns,
  searchable = false,
  searchPlaceholder = 'Search…',
  paginated = false,
  pageSize = 10,
  selectable = false,
  onSelectionChange,
  rowActions,
  onRowClick,
  toolbar,
  emptyIcon,
  emptyTitle = 'No results',
  emptyDescription,
  loading = false,
  stickyHeader = false,
  className,
}: DataTableProps<TData>) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })

  // Build columns — prepend checkbox if selectable, append actions if provided
  const allColumns: ColumnDef<TData, unknown>[] = [
    ...(selectable
      ? [
          {
            id: '__select__',
            header: ({ table }: { table: ReturnType<typeof useReactTable<TData>> }) => (
              <input
                type="checkbox"
                className="rounded border-[var(--color-border)] accent-[var(--color-brand)]"
                checked={table.getIsAllPageRowsSelected()}
                onChange={table.getToggleAllPageRowsSelectedHandler()}
                aria-label="Select all"
              />
            ),
            cell: ({ row }: { row: { getIsSelected: () => boolean; getToggleSelectedHandler: () => (e: unknown) => void } }) => (
              <input
                type="checkbox"
                className="rounded border-[var(--color-border)] accent-[var(--color-brand)]"
                checked={row.getIsSelected()}
                onChange={row.getToggleSelectedHandler()}
                aria-label="Select row"
                onClick={(e) => e.stopPropagation()}
              />
            ),
            size: 40,
          } as ColumnDef<TData, unknown>,
        ]
      : []),
    ...columns,
    ...(rowActions
      ? [
          {
            id: '__actions__',
            header: '',
            cell: ({ row }: { row: { original: TData } }) => (
              <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                {rowActions(row.original)}
              </div>
            ),
            size: 60,
          } as ColumnDef<TData, unknown>,
        ]
      : []),
  ]

  const table = useReactTable({
    data,
    columns: allColumns,
    state: {
      globalFilter,
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
    enableRowSelection: selectable,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater
      setRowSelection(next)
      if (onSelectionChange) {
        const selectedRows = Object.keys(next)
          .filter((k) => next[k])
          .map((k) => table.getRowModel().rows.find((r) => r.id === k)?.original)
          .filter(Boolean) as TData[]
        onSelectionChange(selectedRows)
      }
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(paginated ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  })

  const pageCount = table.getPageCount()
  const { pageIndex } = table.getState().pagination

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Toolbar */}
      {(searchable || toolbar) && (
        <div className="flex items-center gap-3 flex-wrap">
          {searchable && (
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
              <input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40"
              />
            </div>
          )}
          {toolbar && <div className="ml-auto flex items-center gap-2">{toolbar}</div>}
        </div>
      )}

      {/* Table */}
      <div className={cn('overflow-auto rounded-xl border border-[var(--color-border)]', stickyHeader && 'max-h-[60vh]')}>
        <table className="w-full text-sm">
          <thead className={cn('bg-[var(--color-surface-secondary)]', stickyHeader && 'sticky top-0 z-10')}>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sortDir = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={cn(
                        'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] whitespace-nowrap select-none',
                        canSort && 'cursor-pointer hover:text-[var(--color-text-primary)]',
                      )}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className="ml-1 opacity-60">
                            {sortDir === 'asc' ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : sortDir === 'desc' ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3" />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} cols={allColumns.length} />
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={allColumns.length}>
                  <div className="flex flex-col items-center justify-center gap-2 py-16 text-[var(--color-text-muted)]">
                    {emptyIcon && <div className="opacity-40">{emptyIcon}</div>}
                    <p className="font-medium text-sm">{emptyTitle}</p>
                    {emptyDescription && <p className="text-xs">{emptyDescription}</p>}
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'bg-[var(--color-surface)] transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-[var(--color-surface-secondary)]',
                    row.getIsSelected() && 'bg-[var(--color-brand)]/5',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {paginated && pageCount > 1 && (
        <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <span>
            Page {pageIndex + 1} of {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => table.firstPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded p-1 hover:bg-[var(--color-surface-secondary)] disabled:opacity-30"
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded p-1 hover:bg-[var(--color-surface-secondary)] disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded p-1 hover:bg-[var(--color-surface-secondary)] disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => table.lastPage()}
              disabled={!table.getCanNextPage()}
              className="rounded p-1 hover:bg-[var(--color-surface-secondary)] disabled:opacity-30"
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
