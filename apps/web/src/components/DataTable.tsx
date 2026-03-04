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

interface DataTableProps<TData> {
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  /** Global search enabled */
  searchable?: boolean
  searchPlaceholder?: string
  /** Enable pagination (default: false = show all) */
  paginated?: boolean
  pageSize?: number
  /** Empty state */
  emptyIcon?: ReactNode
  emptyTitle?: string
  emptyDescription?: string
  /** Additional toolbar content (right side) */
  toolbar?: ReactNode
  /** Row click handler */
  onRowClick?: (row: TData) => void
  /** Mobile card renderer — if provided, shown on small screens instead of table */
  mobileCard?: (row: TData, index: number) => ReactNode
  /** Stagger animation delay per item (ms) */
  staggerMs?: number
  /** Loading state */
  loading?: boolean
  /** Loading skeleton rows count */
  skeletonRows?: number
}

export function DataTable<TData>({
  data,
  columns,
  searchable = false,
  searchPlaceholder = 'Search…',
  paginated = false,
  pageSize = 10,
  emptyIcon,
  emptyTitle = 'No data found',
  emptyDescription,
  toolbar,
  onRowClick,
  mobileCard,
  staggerMs = 30,
  loading = false,
  skeletonRows = 5,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnVisibility,
      ...(paginated ? { pagination } : {}),
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    ...(paginated ? { onPaginationChange: setPagination } : {}),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(paginated ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    globalFilterFn: 'includesString',
  })

  const rows = paginated ? table.getRowModel().rows : table.getFilteredRowModel().rows
  const sortedRows = paginated ? rows : table.getSortedRowModel().rows

  const renderTableHeader = () => (
    <thead>
      {table.getHeaderGroups().map((headerGroup) => (
        <tr
          key={headerGroup.id}
          className="border-b border-[var(--color-border)] hover:bg-transparent"
        >
          {headerGroup.headers.map((header) => {
            const canSort = header.column.getCanSort()
            const sorted = header.column.getIsSorted()
            const ariaSort =
              canSort && sorted === 'asc'
                ? 'ascending'
                : canSort && sorted === 'desc'
                  ? 'descending'
                  : undefined
            const plainHeader =
              typeof header.column.columnDef.header === 'string'
                ? header.column.columnDef.header
                : null

            return (
              <th
                key={header.id}
                scope="col"
                aria-sort={ariaSort}
                aria-label={plainHeader ?? undefined}
                className="text-left py-2 px-3 text-xs text-muted-foreground font-medium select-none"
                style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
              >
                {header.isPlaceholder ? null : canSort ? (
                  <button
                    type="button"
                    aria-label={plainHeader ? `Sort by ${plainHeader}` : undefined}
                    className="flex items-center gap-1 cursor-pointer hover:text-[var(--color-text-secondary)]"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    <span className="ml-0.5">
                      {sorted === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : sorted === 'desc' ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />
                      )}
                    </span>
                  </button>
                ) : (
                  <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                )}
              </th>
            )
          })}
        </tr>
      ))}
    </thead>
  )

  return (
    <div className="space-y-3 min-w-0">
      {/* Toolbar */}
      {(searchable || toolbar) && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {searchable && (
            <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-[360px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                aria-label={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              />
            </div>
          )}
          {toolbar && <div className="min-w-0 overflow-x-auto">{toolbar}</div>}
        </div>
      )}

      {/* Table Container */}
      <div
        className="w-full max-w-full rounded-xl border border-[var(--color-border)] overflow-hidden"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
        }}
      >
        {loading ? (
          <>
            {mobileCard && (
              <div className="md:hidden p-3 space-y-3">
                {Array.from({ length: Math.min(skeletonRows, 3) }, (_, index) => (
                  <div
                    key={`mobile-skeleton-${index + 1}`}
                    className="rounded-lg p-4 border border-[var(--color-border)] bg-[var(--color-bg-card)] space-y-2"
                  >
                    <div className="skeleton-shimmer h-4 w-1/2 rounded" />
                    <div className="skeleton-shimmer h-3 w-full rounded" />
                    <div className="skeleton-shimmer h-3 w-3/4 rounded" />
                  </div>
                ))}
              </div>
            )}
            <table className={`w-full text-sm ${mobileCard ? 'hidden md:table' : ''}`}>
              {renderTableHeader()}
              <tbody>
                {Array.from({ length: skeletonRows }, (_, index) => `skeleton-${index + 1}`).map(
                  (skeletonKey) => (
                    <tr
                      key={skeletonKey}
                      className="border-b border-[var(--color-table-separator)]"
                    >
                      <td
                        className="py-2.5 px-3"
                        colSpan={Math.max(table.getAllLeafColumns().length, columns.length, 1)}
                      >
                        <div className="flex gap-4">
                          <div className="skeleton-shimmer h-4 flex-[2] rounded" />
                          <div className="skeleton-shimmer h-4 flex-1 rounded" />
                          <div className="skeleton-shimmer h-4 flex-1 rounded" />
                          <div className="skeleton-shimmer h-4 flex-1 rounded" />
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </>
        ) : sortedRows.length === 0 ? (
          <>
            {mobileCard && (
              <div className="md:hidden flex flex-col items-center justify-center py-10 text-[var(--color-text-muted)]">
                {emptyIcon && <div className="mb-3 opacity-30">{emptyIcon}</div>}
                <p className="text-sm font-medium">{emptyTitle}</p>
                {emptyDescription && (
                  <p className="text-xs text-[var(--color-text-dim)] mt-1">{emptyDescription}</p>
                )}
              </div>
            )}

            <table className={`w-full text-sm ${mobileCard ? 'hidden md:table' : ''}`}>
              {renderTableHeader()}
              <tbody>
                <tr className="border-b border-[var(--color-table-separator)]">
                  <td
                    colSpan={Math.max(table.getAllLeafColumns().length, 1)}
                    className="py-16 text-center text-[var(--color-text-muted)]"
                  >
                    <div className="flex flex-col items-center justify-center">
                      {emptyIcon && <div className="mb-3 opacity-30">{emptyIcon}</div>}
                      <p className="text-sm font-medium">{emptyTitle}</p>
                      {emptyDescription && (
                        <p className="text-xs text-[var(--color-text-dim)] mt-1">
                          {emptyDescription}
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        ) : (
          <>
            {/* Mobile Cards */}
            {mobileCard && (
              <div className="md:hidden space-y-3 p-3">
                {sortedRows.map((row, i) => (
                  <div
                    key={row.id}
                    style={{ animationDelay: `${i * staggerMs}ms`, animationFillMode: 'both' }}
                    className="animate-slide-up"
                  >
                    {mobileCard(row.original, i)}
                  </div>
                ))}
              </div>
            )}

            {/* Desktop Table */}
            <table className={`w-full text-sm ${mobileCard ? 'hidden md:table' : ''}`}>
              {renderTableHeader()}
              <tbody>
                {sortedRows.map((row, i) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row.original)}
                    className={`border-b border-[var(--color-table-separator)] transition-colors hover:bg-muted/50 animate-slide-up cursor-pointer`}
                    style={{ animationDelay: `${i * staggerMs}ms`, animationFillMode: 'both' }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-2.5 px-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Pagination */}
      {paginated && sortedRows.length > 0 && (
        <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <span>
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              table.getFilteredRowModel().rows.length,
            )}{' '}
            of {table.getFilteredRowModel().rows.length}
          </span>
          <div className="flex items-center gap-1">
            <PaginationBtn
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              aria-label="First page"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </PaginationBtn>
            <PaginationBtn
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </PaginationBtn>
            <span className="px-2 font-mono tabular-nums">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <PaginationBtn
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </PaginationBtn>
            <PaginationBtn
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              aria-label="Last page"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </PaginationBtn>
          </div>
        </div>
      )}
    </div>
  )
}

function PaginationBtn({
  children,
  onClick,
  disabled,
  'aria-label': ariaLabel,
}: {
  children: ReactNode
  onClick: () => void
  disabled: boolean
  'aria-label'?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
    >
      {children}
    </button>
  )
}
