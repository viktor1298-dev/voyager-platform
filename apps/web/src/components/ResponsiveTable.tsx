'use client'

import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  label: string
  /** Render cell content */
  render: (row: T, index: number) => ReactNode
  /** Hide this column on desktop table (mobile cards only) */
  mobileOnly?: boolean
  /** Hide this column on mobile cards (desktop table only) */
  desktopOnly?: boolean
  /** Extra className for the table header */
  headerClass?: string
}

interface ResponsiveTableProps<T> {
  data: T[]
  columns: Column<T>[]
  /** Unique key extractor */
  keyExtractor: (row: T, index: number) => string
  /** Called when row/card is clicked */
  onRowClick?: (row: T) => void
  /** Render extra actions on the mobile card */
  cardActions?: (row: T) => ReactNode
  /** Primary field key — shown as card title (bold, larger) */
  primaryKey?: string
  /** Secondary field key — shown as badge next to title */
  secondaryKey?: string
  /** Animation stagger delay per item (ms) */
  staggerMs?: number
}

export function ResponsiveTable<T>({
  data,
  columns,
  keyExtractor,
  onRowClick,
  cardActions,
  primaryKey,
  secondaryKey,
  staggerMs = 30,
}: ResponsiveTableProps<T>) {
  const desktopCols = columns.filter((c) => !c.mobileOnly)
  const mobileCols = columns.filter((c) => !c.desktopOnly)

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {desktopCols.map((col) => (
                <th
                  key={col.key}
                  className={`text-left py-2 px-3 text-xs text-muted-foreground font-medium ${col.headerClass ?? ''}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={keyExtractor(row, i)}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-white/[0.04] transition-colors hover:bg-muted/50 animate-slide-up cursor-pointer`}
                style={{ animationDelay: `${i * staggerMs}ms`, animationFillMode: 'both' }}
              >
                {desktopCols.map((col) => (
                  <td key={col.key} className="py-2.5 px-3">
                    {col.render(row, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {data.map((row, i) => {
          const primary = primaryKey ? mobileCols.find((c) => c.key === primaryKey) : mobileCols[0]
          const secondary = secondaryKey ? mobileCols.find((c) => c.key === secondaryKey) : null
          const rest = mobileCols.filter((c) => c.key !== primary?.key && c.key !== secondary?.key)

          return (
            <div
              key={keyExtractor(row, i)}
              onClick={() => onRowClick?.(row)}
              className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 space-y-2 animate-slide-up ${onRowClick ? 'cursor-pointer active:bg-white/[0.03]' : ''}`}
              style={{ animationDelay: `${i * staggerMs}ms`, animationFillMode: 'both' }}
            >
              {/* Card header */}
              <div className="flex justify-between items-center gap-2">
                <span className="font-semibold text-[var(--color-text-primary)] truncate text-sm">
                  {primary?.render(row, i)}
                </span>
                {secondary && (
                  <span className="shrink-0">{secondary.render(row, i)}</span>
                )}
              </div>

              {/* Key-value grid */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {rest.map((col) => (
                  <div key={col.key} className="contents">
                    <span className="text-[var(--color-text-muted)]">{col.label}</span>
                    <span className="text-[var(--color-text-primary)] truncate">
                      {col.render(row, i)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              {cardActions && (
                <div className="pt-2 border-t border-[var(--color-border)]/50 flex gap-2">
                  {cardActions(row)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
