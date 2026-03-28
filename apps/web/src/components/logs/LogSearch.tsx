'use client'

import { Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface LogSearchProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  matchCount: number
}

export function LogSearch({ searchQuery, onSearchChange, matchCount }: LogSearchProps) {
  const [localValue, setLocalValue] = useState(searchQuery)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedChange = useCallback(
    (value: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        onSearchChange(value)
      }, 200)
    },
    [onSearchChange],
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // Sync external changes
  useEffect(() => {
    setLocalValue(searchQuery)
  }, [searchQuery])

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center">
        <Search
          className="absolute left-2 h-3.5 w-3.5"
          style={{ color: 'var(--color-text-dim)' }}
        />
        <input
          type="text"
          value={localValue}
          onChange={(e) => {
            setLocalValue(e.target.value)
            debouncedChange(e.target.value)
          }}
          placeholder="Search logs..."
          className="pl-7 pr-2 py-1 text-xs font-mono rounded-lg border bg-[var(--color-bg-card)] border-[var(--color-border)] text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] w-48"
          aria-label="Search logs"
        />
      </div>
      {searchQuery && (
        <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-dim)' }}>
          {matchCount} match{matchCount !== 1 ? 'es' : ''}
        </span>
      )}
    </div>
  )
}
