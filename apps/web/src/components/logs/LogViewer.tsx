'use client'

import { WrapText } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { LogLine } from './LogLine'
import { LogSearch } from './LogSearch'

interface LogViewerProps {
  lines: string[]
  isLoading?: boolean
  autoScroll?: boolean
}

export function LogViewer({ lines, isLoading, autoScroll = true }: LogViewerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [wordWrap, setWordWrap] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Count matches for the search badge
  const matchCount = useMemo(() => {
    if (!searchQuery) return 0
    const lower = searchQuery.toLowerCase()
    return lines.filter((line) => line.toLowerCase().includes(lower)).length
  }, [lines, searchQuery])

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: 'end' })
    }
  }, [lines.length, autoScroll])

  if (isLoading) {
    return (
      <div
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-log-bg)] p-4 flex-1"
        role="log"
      >
        <div className="space-y-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full opacity-30" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar: search + word wrap toggle */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <LogSearch
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          matchCount={matchCount}
        />
        <button
          type="button"
          onClick={() => setWordWrap((w) => !w)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
            wordWrap
              ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/30 text-[var(--color-accent)]'
              : 'bg-[var(--color-bg-card)] border-[var(--color-border)] text-[var(--color-text-dim)]'
          }`}
          aria-label={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
          title={wordWrap ? 'Word wrap on' : 'Word wrap off'}
        >
          <WrapText className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Wrap</span>
        </button>
      </div>

      {/* Log output container */}
      <div
        ref={scrollRef}
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-log-bg)] overflow-auto flex-1 py-2"
        style={{ overflowX: wordWrap ? 'hidden' : 'auto' }}
        role="log"
        aria-live="polite"
      >
        {lines.length === 0 ? (
          <p className="text-xs font-mono px-4 py-2" style={{ color: 'var(--color-text-dim)' }}>
            No log output.
          </p>
        ) : (
          <>
            {lines.map((line, i) => (
              <LogLine
                key={i}
                line={line}
                lineNumber={i + 1}
                searchQuery={searchQuery}
                wordWrap={wordWrap}
              />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Line count footer */}
      {lines.length > 0 && (
        <p className="text-xs font-mono mt-1" style={{ color: 'var(--color-text-dim)' }}>
          {lines.length} line{lines.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
