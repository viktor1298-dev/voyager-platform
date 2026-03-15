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
import { AnimatePresence, m, useInView } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { DURATION, EASING, STAGGER } from '@/lib/animation-constants'

export interface DataTableProps<TData> {
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  /** Global search enabled */
  searchable?: boolean
  searchPlaceholder?: string
  /** Enable pagination (default: false = show all) */
  paginated?: boolean
  pageSize?: number
  /** Extra content rendered beside pagination controls */
  paginationExtra?: ReactNode
  /** Empty state */
  emptyIcon?: ReactNode
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
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

// P3-005: Staggered tbody using useInView (once, -50px margin)
// M3: Uses callback ref to safely merge inView + external ref
function AnimatedTbody({
  children,
  tbodyRef,
}: {
  children: ReactNode
  tbodyRef: React.RefObject<HTMLTableSectionElement | null>
}) {
  const inViewRef = useRef<HTMLTableSectionElement>(null)
  const isInView = useInView(inViewRef, { once: true, margin: '-50px 0px 0px 0px' })

  // Callback ref: merges inViewRef with external tbodyRef
  const callbackRef = (node: HTMLTableSectionElement | null) => {
    ;(inViewRef as React.MutableRefObject<HTMLTableSectionElement | null>).current = node
    ;(tbodyRef as React.MutableRefObject<HTMLTableSectionElement | null>).current = node
  }

  return (
    <m.tbody
      ref={callbackRef}
      variants={{
        hidden: { opacity: 1 },
        visible: { opacity: 1, transition: { staggerChildren: STAGGER.fast } },
      }}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
    >
      {children}
    </m.tbody>
  )
}

export function DataTable<TData>({
  data,
  columns,
  searchable = false,
  searchPlaceholder = 'Search…',
  paginated = false,
  pageSize = 10,
  paginationExtra,
  emptyIcon,
  emptyTitle = 'No data found',
  emptyDescription,
  emptyAction,
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

  // J/K keyboard navigation — listen for voyager:list-down / voyager:list-up events
  const tableBodyRef = useRef<HTMLTableSectionElement>(null)
  useEffect(() => {
    function getDataRows(): HTMLTableRowElement[] {
      if (!tableBodyRef.current) return []
      return Array.from(tableBodyRef.current.querySelectorAll<HTMLTableRowElement>('tr[data-row]'))
    }

    function moveFocus(direction: 'down' | 'up') {
      const rows = getDataRows()
      if (rows.length === 0) return

      const focused = document.activeElement
      const currentIdx = rows.indexOf(focused as HTMLTableRowElement)

      let nextIdx: number
      if (currentIdx === -1) {
        nextIdx = direction === 'down' ? 0 : rows.length - 1
      } else {
        nextIdx = direction === 'down'
          ? Math.min(currentIdx + 1, rows.length - 1)
          : Math.max(currentIdx - 1, 0)
      }

      rows[nextIdx]?.focus()
      rows[nextIdx]?.scrollIntoView({ block: 'nearest' })
    }

    const handleDown = () => moveFocus('down')
    const handleUp = () => moveFocus('up')

    document.addEventListener('voyager:list-down', handleDown)
    document.addEventListener('voyager:list-up', handleUp)
    return () => {
      document.removeEventListener('voyager:list-down', handleDown)
      document.removeEventListener('voyager:list-up', handleUp)
    }
  }, [])

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
                className="text-left py-2 px-3 text-xs font-medium text-muted-foreground select-none"
                style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
              >
                {header.isPlaceholder ? null : canSort ? (
                  <button
                    type="button"
                    aria-label={plainHeader ? `Sort by ${plainHeader}` : undefined}
                    className="flex items-center gap-1 cursor-pointer hover:text-[var(--color-text-secondary)]"
                    onClick={(event) => header.column.getToggleSortingHandler()?.(event)}
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

  // P3-005: row variants for stagger
  const rowVariants = {
    hidden: { opacity: 0, y: 6 },
    visible: { opacity: 1, y: 0, transition: { duration: DURATION.normal, ease: EASING.default } },
  }

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
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
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
        {/* P3-009: AnimatePresence mode="wait" for skeleton → data transition */}
        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <m.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.fast }}
            >
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
                          className="py-1.5 px-3"
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
            </m.div>
          ) : sortedRows.length === 0 ? (
            <m.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.fast }}
            >
              {mobileCard && (
                <div data-testid="empty-state" className="md:hidden flex flex-col items-center justify-center py-10 text-[var(--color-text-muted)]">
                  {emptyIcon && <div className="mb-3 opacity-30">{emptyIcon}</div>}
                  <p className="text-sm font-medium">{emptyTitle}</p>
                  {emptyDescription && (
                    <p className="text-xs text-[var(--color-text-dim)] mt-1">{emptyDescription}</p>
                  )}
                  {emptyAction && <div className="mt-4">{emptyAction}</div>}
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
                      <div data-testid="empty-state" className="flex flex-col items-center justify-center">
                        {emptyIcon && <div className="mb-3 opacity-30">{emptyIcon}</div>}
                        <p className="text-sm font-medium">{emptyTitle}</p>
                        {emptyDescription && (
                          <p className="text-xs text-[var(--color-text-dim)] mt-1">
                            {emptyDescription}
                          </p>
                        )}
                        {emptyAction && <div className="mt-4">{emptyAction}</div>}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </m.div>
          ) : (
            <m.div
              key="data"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.fast }}
            >
              {/* Mobile Cards */}
              {mobileCard && (
                <div className="md:hidden space-y-3 p-3">
                  {sortedRows.map((row, i) => (
                    <div key={row.id}>
                      {mobileCard(row.original, i)}
                    </div>
                  ))}
                </div>
              )}

              {/* P3-005: Desktop Table with staggered rows via useInView */}
              <table className={`w-full text-sm ${mobileCard ? 'hidden md:table' : ''}`}>
                {renderTableHeader()}
                <AnimatedTbody tbodyRef={tableBodyRef}>
                  {sortedRows.map((row) => (
                    <m.tr
                      key={row.id}
                      data-row
                      tabIndex={onRowClick ? 0 : -1}
                      role={onRowClick ? 'button' : undefined}
                      aria-label={onRowClick ? 'Open row details' : undefined}
                      variants={rowVariants}
                      onClick={() => onRowClick?.(row.original)}
                      onKeyDown={(e) => {
                        if (!onRowClick) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onRowClick(row.original)
                        }
                      }}
                      className={`border-b border-[var(--color-table-separator)] hover:bg-muted/50 focus:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] focus:ring-inset transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="py-1.5 px-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </m.tr>
                  ))}
                </AnimatedTbody>
              </table>
            </m.div>
          )}
        </AnimatePresence>
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
          <div className="flex items-center gap-2">
            {paginationExtra}
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
    // P3-007: Button micro-interactions
    <m.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className="p-1.5 rounded-xl border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
    >
      {children}
    </m.button>
  )
}
