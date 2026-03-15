'use client'

import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'motion/react'
import { Search, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef } from 'react'

export type FilterValue = {
  environment: string
  status: string
  provider: string
  health: string
  tags: string[]
  q: string
}

export type FilterOptions = {
  environments: string[]
  statuses: string[]
  providers: string[]
  health: string[]
  tags: string[]
}

const KEYS = ['environment', 'status', 'provider', 'health', 'tags', 'q'] as const

function getFilterFromParams(params: URLSearchParams): FilterValue {
  return {
    environment: params.get('environment') ?? 'all',
    status: params.get('status') ?? 'all',
    provider: params.get('provider') ?? 'all',
    health: params.get('health') ?? 'all',
    tags: params.getAll('tags'),
    q: params.get('q') ?? '',
  }
}

export function FilterBar({
  options,
  onChange,
  className,
}: {
  options: FilterOptions
  onChange: (value: FilterValue) => void
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => getFilterFromParams(new URLSearchParams(searchParams.toString())), [searchParams])

  useEffect(() => {
    onChange(parsed)
  }, [parsed, onChange])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== '/') return
      const target = event.target as HTMLElement | null
      const isTypingTarget = target && ['INPUT', 'TEXTAREA'].includes(target.tagName)
      if (isTypingTarget) return
      event.preventDefault()
      searchRef.current?.focus()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const updateParams = (updater: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams.toString())
    updater(next)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  const setSingle = (key: 'environment' | 'status' | 'provider' | 'health', value: string) => {
    updateParams((params) => {
      if (value === 'all') params.delete(key)
      else params.set(key, value)
    })
  }

  const toggleTag = (tag: string) => {
    updateParams((params) => {
      const existing = new Set(params.getAll('tags'))
      if (existing.has(tag)) existing.delete(tag)
      else existing.add(tag)
      params.delete('tags')
      for (const nextTag of existing) params.append('tags', nextTag)
    })
  }

  const clearAll = () => {
    updateParams((params) => {
      for (const key of KEYS) params.delete(key)
    })
  }

  const activeChips = [
    parsed.environment !== 'all' ? { key: 'environment', label: `Env: ${parsed.environment}` } : null,
    parsed.status !== 'all' ? { key: 'status', label: `Status: ${parsed.status}` } : null,
    parsed.provider !== 'all' ? { key: 'provider', label: `Provider: ${parsed.provider}` } : null,
    parsed.health !== 'all' ? { key: 'health', label: `Health: ${parsed.health}` } : null,
    ...parsed.tags.map((tag) => ({ key: `tag-${tag}`, label: `Tag: ${tag}` })),
    parsed.q ? { key: 'q', label: `Search: ${parsed.q}` } : null,
  ].filter(Boolean) as Array<{ key: string; label: string }>

  const chipClass =
    'min-h-[44px] rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer'

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-secondary)]" />
          <input
            ref={searchRef}
            value={parsed.q}
            onChange={(e) => {
              const value = e.target.value
              updateParams((params) => {
                if (!value.trim()) params.delete('q')
                else params.set('q', value)
              })
            }}
            placeholder="Search clusters… (press /)"
            className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-bg-surface)] pl-9 pr-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-accent)]/40 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            ['environment', options.environments],
            ['status', options.statuses],
            ['provider', options.providers],
            ['health', options.health],
          ] as const)
            .filter(([, values]) => values.length > 0)
            .map(([key, values]) => (
              <select
                key={key}
                value={parsed[key]}
                onChange={(e) => setSingle(key, e.target.value)}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] focus:border-[var(--color-accent)]/40 focus:outline-none"
              >
                <option value="all">{key}</option>
                {values.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            ))}
        </div>
      </div>

      {options.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.tags.map((tag) => {
            const active = parsed.tags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  chipClass,
                  active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white shadow-[0_10px_24px_rgba(91,135,255,0.3)]'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] hover:bg-white/[0.04] hover:text-[var(--color-text-primary)]',
                )}
                aria-pressed={active}
              >
                #{tag}
              </button>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {activeChips.length > 0 && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={reduceMotion ? {} : { opacity: 1, y: 0 }}
            exit={reduceMotion ? {} : { opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="flex flex-wrap items-center gap-2"
          >
            {activeChips.map((chip) => (
              <motion.span
                key={chip.key}
                layout
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)]/80 bg-[var(--color-bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)]"
              >
                {chip.label}
              </motion.span>
            ))}
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
