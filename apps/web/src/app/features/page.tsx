'use client'

import { AppLayout } from '@/components/AppLayout'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { QueryError } from '@/components/ErrorBoundary'
import { FeatureFlagToggle } from '@/components/FeatureFlagToggle'
import { AnimatedList, PageTransition } from '@/components/animations'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { type FeatureFlag, mockAdminApi } from '@/lib/mock-admin-api'
import { Activity, ChevronDown, ChevronUp, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

type StatusFilter = 'all' | 'on' | 'off'

const MAX_VISIBLE_ACTIVITIES = 3

function formatDate(date: string) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getRollout(targeting: Record<string, unknown>) {
  const rollout = targeting.rollout
  if (typeof rollout === 'object' && rollout) {
    const percent = (rollout as { percent?: number }).percent
    if (typeof percent === 'number') return percent
  }
  return null
}

function getStringList(targeting: Record<string, unknown>, key: string) {
  const value = targeting[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function ActivityLog({
  activity,
  flagId,
}: {
  activity: FeatureFlag['activity']
  flagId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? activity : activity.slice(0, MAX_VISIBLE_ACTIVITIES)
  const hasMore = activity.length > MAX_VISIBLE_ACTIVITIES

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
        aria-expanded={expanded}
        aria-controls={`activity-log-${flagId}`}
      >
        <span className="flex items-center gap-1">
          <Activity className="h-3.5 w-3.5" />
          Activity log
          <span className="ml-1 rounded-full bg-[var(--color-bg-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
            {activity.length}
          </span>
        </span>
        {hasMore &&
          (expanded ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ))}
      </button>

      {expanded && <ul
        id={`activity-log-${flagId}`}
        className="space-y-1.5"
      >
        {visible.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center justify-between rounded-md border border-[var(--color-border)]/60 px-2 py-1.5 text-xs"
          >
            <span className="text-[var(--color-text-secondary)]">
              <strong className="font-semibold text-[var(--color-text-primary)]">
                {entry.actor}
              </strong>{' '}
              {entry.action} the flag
            </span>
            <span className="text-[var(--color-text-muted)] whitespace-nowrap ml-2">{formatDate(entry.at)}</span>
          </li>
        ))}
      </ul>}

      {expanded && hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full rounded-md border border-dashed border-[var(--color-border)] py-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:border-[var(--color-accent)]/40 transition-colors"
        >
          {expanded
            ? `Show less`
            : `+${activity.length - MAX_VISIBLE_ACTIVITIES} more entries`}
        </button>
      )}
    </div>
  )
}

export default function FeatureFlagsPage() {
  const isAdmin = useIsAdmin()
  const router = useRouter()
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [environmentFilter, setEnvironmentFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')

  useEffect(() => {
    if (isAdmin === false) router.replace('/')
  }, [isAdmin, router])

  useEffect(() => {
    if (!isAdmin) return
    let mounted = true

    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const data = await mockAdminApi.features.listWithMeta()
        if (mounted) setFlags(data)
      } catch {
        if (mounted) setError('Failed to load feature flags')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void run()
    return () => {
      mounted = false
    }
  }, [isAdmin])

  const handleToggle = useCallback(async (flagId: string, nextEnabled: boolean) => {
    let previousFlag: FeatureFlag | null = null
    const now = new Date().toISOString()
    const optimisticActivity = {
      id: crypto.randomUUID(),
      actor: 'You',
      action: nextEnabled ? 'enabled' : 'disabled',
      at: now,
    } as const

    setFlags((prev) =>
      prev.map((flag) => {
        if (flag.id !== flagId) return flag
        previousFlag = flag
        return {
          ...flag,
          enabled: nextEnabled,
          updatedAt: now,
          activity: [optimisticActivity, ...flag.activity],
        }
      }),
    )

    try {
      await mockAdminApi.features.update({ id: flagId, enabled: nextEnabled })
      toast.success(`Feature flag ${nextEnabled ? 'enabled' : 'disabled'}`)
    } catch {
      if (previousFlag) {
        setFlags((prev) => prev.map((flag) => (flag.id === flagId ? previousFlag! : flag)))
      }
      toast.error('Failed to update feature flag')
      throw new Error('Failed to update feature flag')
    }
  }, [])

  const environments = useMemo(() => {
    const all = flags.flatMap((flag) => getStringList(flag.targeting, 'environments'))
    return Array.from(new Set(all))
  }, [flags])

  const tags = useMemo(() => {
    const all = flags.flatMap((flag) => flag.tags ?? [])
    return Array.from(new Set(all))
  }, [flags])

  const filteredFlags = useMemo(() => {
    const q = query.trim().toLowerCase()

    return flags.filter((flag) => {
      const searchMatch =
        q.length === 0 ||
        flag.name.toLowerCase().includes(q) ||
        flag.description.toLowerCase().includes(q) ||
        (flag.tags ?? []).some((tag) => tag.toLowerCase().includes(q))

      const statusMatch =
        statusFilter === 'all' || (statusFilter === 'on' ? flag.enabled : !flag.enabled)

      const envList = getStringList(flag.targeting, 'environments')
      const envMatch = environmentFilter === 'all' || envList.includes(environmentFilter)

      const tagMatch = tagFilter === 'all' || (flag.tags ?? []).includes(tagFilter)

      return searchMatch && statusMatch && envMatch && tagMatch
    })
  }, [flags, query, statusFilter, environmentFilter, tagFilter])

  if (isAdmin === null)
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  if (isAdmin === false) {
    router.replace('/')
    return null
  }

  return (
    <AppLayout>
      <PageTransition>
        <Breadcrumbs />

        <div className="mb-6 space-y-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
              Feature Flags
            </h1>
            <p className="mt-1 text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
              {filteredFlags.length} of {flags.length} flags
            </p>
          </div>

          <div className="grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="relative sm:col-span-2 xl:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-dim)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, description, or tag"
                className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>

            <select
              value={environmentFilter}
              onChange={(event) => setEnvironmentFilter(event.target.value)}
              className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
            >
              <option value="all">All envs</option>
              {environments.map((environment) => (
                <option key={environment} value={environment}>
                  {environment}
                </option>
              ))}
            </select>

            <select
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
            >
              <option value="all">All tags</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <QueryError message={error} onRetry={() => window.location.reload()} />}

        {isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`skeleton-${index}`}
                className="h-72 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]"
              />
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
              keyExtractor={(flag) => flag.id}
              className="grid gap-4 lg:grid-cols-2"
              itemClassName="h-full"
              renderItem={(flag) => {
                const environmentsForFlag = getStringList(flag.targeting, 'environments')
                const segments = getStringList(flag.targeting, 'segments')
                const roles = getStringList(flag.targeting, 'roles')
                const rollout = getRollout(flag.targeting)

                return (
                  <article className="flex h-full flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 shadow-sm transition-colors hover:border-[var(--color-accent)]/30 md:p-5">
                    <header className="mb-4 flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{flag.name}</h2>
                        <p className="text-sm text-[var(--color-text-secondary)]">{flag.description}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                            flag.enabled
                              ? 'bg-[var(--color-status-active)]/20 text-[var(--color-status-active)]'
                              : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)]'
                          }`}
                        >
                          {flag.enabled ? 'On' : 'Off'}
                        </span>
                        <FeatureFlagToggle
                          name={flag.name}
                          enabled={flag.enabled}
                          critical={flag.critical}
                          onToggle={async (nextEnabled) => {
                            await handleToggle(flag.id, nextEnabled)
                          }}
                        />
                      </div>
                    </header>

                    <section className="mb-4 grid gap-3 rounded-xl border border-[var(--color-border)]/70 bg-[var(--color-bg-surface)]/40 p-3 text-xs">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                        Targeting rules
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {rollout !== null && (
                          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-[var(--color-text-primary)]">
                            Rollout: {rollout}%
                          </span>
                        )}
                        {environmentsForFlag.map((environment) => (
                          <span
                            key={environment}
                            className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-[var(--color-text-primary)]"
                          >
                            Env: {environment}
                          </span>
                        ))}
                        {segments.map((segment) => (
                          <span
                            key={`seg-${segment}`}
                            className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-[var(--color-text-primary)]"
                          >
                            Segment: {segment}
                          </span>
                        ))}
                        {roles.map((role) => (
                          <span
                            key={`role-${role}`}
                            className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-[var(--color-text-primary)]"
                          >
                            Role: {role}
                          </span>
                        ))}
                        {(flag.tags ?? []).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-[var(--color-text-muted)]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </section>

                    <footer className="mt-auto space-y-3 border-t border-[var(--color-border)] pt-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--color-text-muted)]">Last modified</span>
                        <span className="font-medium text-[var(--color-text-primary)]">
                          {formatDate(flag.updatedAt)}
                        </span>
                      </div>

                      <ActivityLog activity={flag.activity} flagId={flag.id} />
                    </footer>
                  </article>
                )
              }}
            />
          </>
        )}
      </PageTransition>
    </AppLayout>
  )
}
