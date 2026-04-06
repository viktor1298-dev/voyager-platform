'use client'

import { QueryError } from '@/components/ErrorBoundary'
import { FeatureFlagToggle } from '@/components/FeatureFlagToggle'
import { AnimatedList } from '@/components/animations'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { Activity, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { usePageTitle } from '@/hooks/usePageTitle'
import { trpc } from '@/lib/trpc'

type StatusFilter = 'all' | 'on' | 'off'

type FeatureFlag = {
  id?: string
  name: string
  description: string | null
  enabled: boolean
  targeting: Record<string, unknown> | null
  source: string
  updatedAt?: string | Date
}

/** DA2-B3-005: Format raw flag names (e.g. "audit_log_enabled" → "Audit Log Enabled") */
function formatFlagName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function getRollout(targeting: Record<string, unknown> | null) {
  if (!targeting) return null
  const rollout = targeting.rollout
  if (typeof rollout === 'object' && rollout) {
    const percent = (rollout as { percent?: number }).percent
    if (typeof percent === 'number') return percent
  }
  return null
}

function getStringList(targeting: Record<string, unknown> | null, key: string) {
  if (!targeting) return []
  const value = targeting[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export const dynamic = 'force-dynamic'

export default function SettingsFeaturesPage() {
  usePageTitle('Settings — Feature Flags')

  const isAdmin = useIsAdmin()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [environmentFilter, setEnvironmentFilter] = useState('all')

  useEffect(() => {
    if (isAdmin === false) router.replace('/')
  }, [isAdmin, router])

  const flagsQuery = trpc.features.list.useQuery(undefined, { enabled: isAdmin === true })
  const updateMutation = trpc.features.update.useMutation()

  const flags: FeatureFlag[] = useMemo(() => {
    if (!flagsQuery.data) return []
    return flagsQuery.data.items.map((item) => ({
      id: String(item.id ?? ''),
      name: item.name,
      description: (item.description as string) ?? null,
      enabled: item.enabled,
      targeting: (item.targeting as Record<string, unknown>) ?? null,
      source: item.source,
      updatedAt: String(item.updatedAt ?? ''),
    }))
  }, [flagsQuery.data])

  const handleToggle = useCallback(async (flagName: string, nextEnabled: boolean) => {
    try {
      await updateMutation.mutateAsync({ name: flagName, enabled: nextEnabled })
      flagsQuery.refetch()
      toast.success(`Feature flag ${nextEnabled ? 'enabled' : 'disabled'}`)
    } catch {
      toast.error('Failed to update feature flag')
    }
  }, [updateMutation, flagsQuery])

  const environments = useMemo(() => {
    const all = flags.flatMap((flag) => getStringList(flag.targeting, 'environments'))
    return Array.from(new Set(all))
  }, [flags])

  const filteredFlags = useMemo(() => {
    const q = query.trim().toLowerCase()
    return flags.filter((flag) => {
      const searchMatch = q.length === 0 || flag.name.toLowerCase().includes(q) || (flag.description ?? '').toLowerCase().includes(q)
      const statusMatch = statusFilter === 'all' || (statusFilter === 'on' ? flag.enabled : !flag.enabled)
      const envList = getStringList(flag.targeting, 'environments')
      const envMatch = environmentFilter === 'all' || envList.includes(environmentFilter)
      return searchMatch && statusMatch && envMatch
    })
  }, [flags, query, statusFilter, environmentFilter])

  if (isAdmin === null)
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  if (isAdmin === false) { router.replace('/'); return null }

  return (
    <div>
      <div className="mb-6 space-y-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Feature Flags</h2>
          <p className="mt-1 text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">{filteredFlags.length} of {flags.length} flags</p>
        </div>

        <div className="grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="relative sm:col-span-2 xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or description"
              className="h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
            />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)]">
            <option value="all">All statuses</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
          <select value={environmentFilter} onChange={(e) => setEnvironmentFilter(e.target.value)} className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)]">
            <option value="all">All envs</option>
            {environments.map((env) => <option key={env} value={env}>{env}</option>)}
          </select>
        </div>
      </div>

      {flagsQuery.error && <QueryError message={flagsQuery.error.message} onRetry={() => flagsQuery.refetch()} />}

      {flagsQuery.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="h-72 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]" />
          ))}
        </div>
      ) : (
        <>
          {filteredFlags.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] p-10 text-center text-sm text-[var(--color-text-muted)]">
              No feature flags matched your filters.
            </div>
          )}

          <AnimatedList
            items={filteredFlags}
            keyExtractor={(flag) => flag.name}
            className="grid gap-4 lg:grid-cols-2"
            itemClassName="h-full"
            renderItem={(flag) => {
              const environmentsForFlag = getStringList(flag.targeting, 'environments')
              const rollout = getRollout(flag.targeting)
              return (
                <article className="flex h-full flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 shadow-sm transition-colors hover:border-[var(--color-accent)]/30 md:p-5">
                  <header className="mb-4 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{formatFlagName(flag.name)}</h3>
                      <p className="text-xs font-mono text-[var(--color-text-dim)]" title={flag.name}>{flag.name}</p>
                      <p className="text-sm text-[var(--color-text-secondary)]">{flag.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-wide ${flag.enabled ? 'bg-[var(--color-status-active)]/20 text-[var(--color-status-active)]' : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)]'}`}>
                        {flag.enabled ? 'On' : 'Off'}
                      </span>
                      <FeatureFlagToggle name={flag.name} enabled={flag.enabled} onToggle={async (nextEnabled) => { await handleToggle(flag.name, nextEnabled) }} />
                    </div>
                  </header>

                  <section className="mb-4 grid gap-3 rounded-lg border border-[var(--color-border)]/70 bg-[var(--color-bg-surface)]/40 p-3 text-xs">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">Targeting rules</p>
                    <div className="flex flex-wrap gap-2">
                      {rollout !== null && <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-[var(--color-text-primary)]">Rollout: {rollout}%</span>}
                      {environmentsForFlag.map((env) => <span key={env} className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-[var(--color-text-primary)]">Env: {env}</span>)}
                    </div>
                  </section>

                  <footer className="mt-auto border-t border-[var(--color-border)] pt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--color-text-muted)]">Source</span>
                      <span className="font-medium text-[var(--color-text-primary)]">{flag.source}</span>
                    </div>
                    {flag.updatedAt && (
                      <div className="flex items-center justify-between text-xs mt-1">
                        <span className="text-[var(--color-text-muted)]">Last modified</span>
                        <span className="font-medium text-[var(--color-text-primary)]">{formatDate(flag.updatedAt)}</span>
                      </div>
                    )}
                  </footer>
                </article>
              )
            }}
          />
        </>
      )}
    </div>
  )
}
