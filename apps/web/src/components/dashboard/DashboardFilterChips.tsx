'use client'

import type { ClusterEnvironment } from '@/lib/cluster-meta'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { useRef, useState, useEffect } from 'react'

interface DashboardFilterChipsProps {
  activeEnv: 'all' | ClusterEnvironment
  onEnvChange: (env: 'all' | ClusterEnvironment) => void
  envCounts: Record<'all' | ClusterEnvironment, number>
  statusOptions: string[]
  providerOptions: string[]
  activeStatus: string
  activeProvider: string
  onStatusChange: (status: string) => void
  onProviderChange: (provider: string) => void
}

const ENV_CHIPS: { key: 'all' | ClusterEnvironment; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'prod', label: 'Prod' },
  { key: 'staging', label: 'Staging' },
  { key: 'dev', label: 'Dev' },
]

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all duration-200',
          'hover:-translate-y-px hover:border-[var(--color-border-hover)]',
          value !== 'all'
            ? 'border-[var(--color-accent-glow)] bg-[var(--color-accent)]/12 text-[var(--color-accent)]'
            : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)]/30 text-[var(--color-text-muted)]',
        )}
      >
        <ChevronDown className="h-2.5 w-2.5" />
        {value === 'all' ? label : value}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[120px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] py-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              onChange('all')
              setOpen(false)
            }}
            className={cn(
              'w-full px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--color-bg-card-hover)]',
              value === 'all' && 'text-[var(--color-accent)]',
            )}
          >
            All
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt)
                setOpen(false)
              }}
              className={cn(
                'w-full px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--color-bg-card-hover)]',
                value === opt && 'text-[var(--color-accent)]',
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DashboardFilterChips({
  activeEnv,
  onEnvChange,
  envCounts,
  statusOptions,
  providerOptions,
  activeStatus,
  activeProvider,
  onStatusChange,
  onProviderChange,
}: DashboardFilterChipsProps) {
  return (
    <div className="mb-5 flex items-center gap-1.5 px-1">
      {ENV_CHIPS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onEnvChange(key)}
          className={cn(
            'rounded-lg border px-3 py-1 text-[11px] font-medium transition-all duration-200',
            'hover:-translate-y-px hover:border-[var(--color-border-hover)]',
            'active:scale-[0.97]',
            activeEnv === key
              ? 'border-[var(--color-accent-glow)] bg-[var(--color-accent)]/12 text-[var(--color-accent)] shadow-[0_0_12px_var(--color-accent-glow)]'
              : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)]/30 text-[var(--color-text-muted)]',
          )}
        >
          {label} <span className="opacity-50">{envCounts[key]}</span>
        </button>
      ))}
      <div className="flex-1" />
      <FilterDropdown
        label="status"
        value={activeStatus}
        options={statusOptions}
        onChange={onStatusChange}
      />
      <FilterDropdown
        label="provider"
        value={activeProvider}
        options={providerOptions}
        onChange={onProviderChange}
      />
    </div>
  )
}
