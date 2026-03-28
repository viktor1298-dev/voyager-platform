'use client'

import { ChevronsUpDown, FoldVertical, UnfoldVertical, Search } from 'lucide-react'

interface SearchFilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  totalCount: number
  filteredCount: number
  expandAll: boolean
  onExpandAllToggle: () => void
  searchPlaceholder?: string
  /** Namespace collapse/expand — undefined hides the buttons (e.g. flatList mode) */
  namespacesOpen?: boolean
  onNamespacesToggle?: () => void
}

export function SearchFilterBar({
  searchQuery,
  onSearchChange,
  totalCount,
  filteredCount,
  expandAll,
  onExpandAllToggle,
  searchPlaceholder = 'Search by name, namespace, or status...',
  namespacesOpen,
  onNamespacesToggle,
}: SearchFilterBarProps) {
  const hasFilter = searchQuery.trim().length > 0

  return (
    <div className="mb-3 flex items-center gap-2">
      {/* Search input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-dim)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] pl-9 pr-3 py-2 text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-colors"
          aria-label="Search resources"
        />
      </div>

      {/* Result count */}
      {hasFilter && (
        <span className="text-xs font-mono text-[var(--color-text-muted)] shrink-0">
          {filteredCount}/{totalCount}
        </span>
      )}

      {/* Namespace collapse/expand */}
      {onNamespacesToggle && (
        <button
          type="button"
          onClick={onNamespacesToggle}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-white/[0.04] transition-colors shrink-0"
          title={namespacesOpen ? 'Collapse all namespaces' : 'Expand all namespaces'}
        >
          {namespacesOpen ? (
            <FoldVertical className="h-3.5 w-3.5" />
          ) : (
            <UnfoldVertical className="h-3.5 w-3.5" />
          )}
          {namespacesOpen ? 'Fold NS' : 'Unfold NS'}
        </button>
      )}

      {/* Expand All / Collapse All cards */}
      <button
        type="button"
        onClick={onExpandAllToggle}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-white/[0.04] transition-colors shrink-0"
      >
        <ChevronsUpDown className="h-3.5 w-3.5" />
        {expandAll ? 'Collapse All' : 'Expand All'}
      </button>
    </div>
  )
}
