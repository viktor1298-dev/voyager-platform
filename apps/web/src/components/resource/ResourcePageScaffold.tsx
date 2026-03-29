'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ExpandableCard } from '@/components/expandable'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchFilterBar } from './SearchFilterBar'
import { NamespaceGroup } from './NamespaceGroup'

export interface ResourcePageScaffoldProps<T> {
  title: string
  icon: ReactNode
  queryResult: { data: T[] | undefined; isLoading: boolean; error: unknown }
  getNamespace: (item: T) => string
  getKey: (item: T, index: number) => string
  filterFn: (item: T, query: string) => boolean
  renderSummary: (item: T) => ReactNode
  renderDetail: (item: T) => ReactNode
  searchPlaceholder?: string
  emptyMessage?: string
  emptyDescription?: string
  flatList?: boolean
}

export function ResourcePageScaffold<T>({
  title,
  icon,
  queryResult,
  getNamespace,
  getKey,
  filterFn,
  renderSummary,
  renderDetail,
  searchPlaceholder,
  emptyMessage = `No ${title.toLowerCase()} found`,
  emptyDescription = `${title} will appear here when available in the cluster.`,
  flatList = false,
}: ResourcePageScaffoldProps<T>) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandAll, setExpandAll] = useState(false)
  const [namespacesOpen, setNamespacesOpen] = useState(true)
  const searchParams = useSearchParams()
  const highlightRef = useRef<HTMLDivElement>(null)

  // Parse ?highlight= from URL (cross-resource navigation)
  // Format is a plain resource key string like "namespace/name" (from CrossResourceNav)
  const highlightKey = searchParams.get('highlight')

  const isHighlighted = useCallback(
    (item: T) => {
      if (!highlightKey) return false
      const key = getKey(item, 0)
      return (
        key === highlightKey ||
        key.endsWith(`/${highlightKey}`) ||
        key === decodeURIComponent(highlightKey)
      )
    },
    [highlightKey, getKey],
  )

  // Scroll to highlighted item once data loads
  const hasScrolled = useRef(false)
  useEffect(() => {
    if (!highlightKey || hasScrolled.current) return
    if (!queryResult.data || (queryResult.data as T[]).length === 0) return
    // Data loaded — wait for DOM to render the card, then scroll
    const timer = setTimeout(() => {
      if (highlightRef.current) {
        highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        hasScrolled.current = true
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [highlightKey, queryResult.data])

  const items = (queryResult.data ?? []) as T[]

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase().trim()
    return items.filter((item) => filterFn(item, q))
  }, [items, searchQuery, filterFn])

  const grouped = useMemo(() => {
    const map = new Map<string, T[]>()
    for (const item of filteredItems) {
      const ns = flatList ? title : getNamespace(item) || 'default'
      if (!map.has(ns)) map.set(ns, [])
      map.get(ns)?.push(item)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredItems, getNamespace, flatList, title])

  // Loading state
  if (queryResult.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  // Empty state
  if (filteredItems.length === 0 && !searchQuery.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
        <div className="rounded-full bg-white/[0.04] p-3 mb-3">{icon}</div>
        <p className="text-sm font-medium text-[var(--color-text-muted)]">{emptyMessage}</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">{emptyDescription}</p>
      </div>
    )
  }

  return (
    <>
      <h1 className="sr-only">{title}</h1>

      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={items.length}
        filteredCount={filteredItems.length}
        expandAll={expandAll}
        onExpandAllToggle={() => setExpandAll((prev) => !prev)}
        searchPlaceholder={searchPlaceholder}
        namespacesOpen={flatList ? undefined : namespacesOpen}
        onNamespacesToggle={flatList ? undefined : () => setNamespacesOpen((prev) => !prev)}
      />

      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-center">
          <div className="rounded-full bg-white/[0.04] p-3 mb-3">{icon}</div>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">
            No results match your search
          </p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-xs">
            Try adjusting your search query.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {flatList
            ? // Flat list — no namespace grouping
              filteredItems.map((item, idx) => {
                const highlighted = isHighlighted(item)
                return (
                  <div
                    key={getKey(item, idx)}
                    ref={highlighted ? highlightRef : undefined}
                    className={
                      highlighted
                        ? 'ring-2 ring-[var(--color-accent)] rounded-xl transition-all duration-500'
                        : ''
                    }
                  >
                    <ExpandableCard
                      expanded={expandAll || highlighted || undefined}
                      summary={renderSummary(item)}
                    >
                      {renderDetail(item)}
                    </ExpandableCard>
                  </div>
                )
              })
            : // Namespace-grouped
              grouped.map(([namespace, nsItems]) => (
                <NamespaceGroup
                  key={namespace}
                  namespace={namespace}
                  count={nsItems.length}
                  forceOpen={namespacesOpen ? undefined : false}
                >
                  {nsItems.map((item, idx) => {
                    const highlighted = isHighlighted(item)
                    return (
                      <div
                        key={getKey(item, idx)}
                        ref={highlighted ? highlightRef : undefined}
                        className={
                          highlighted
                            ? 'ring-2 ring-[var(--color-accent)] rounded-xl transition-all duration-500'
                            : ''
                        }
                      >
                        <ExpandableCard
                          expanded={expandAll || highlighted || undefined}
                          summary={renderSummary(item)}
                        >
                          {renderDetail(item)}
                        </ExpandableCard>
                      </div>
                    )
                  })}
                </NamespaceGroup>
              ))}
        </div>
      )}
    </>
  )
}
