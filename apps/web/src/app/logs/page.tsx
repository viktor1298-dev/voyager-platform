'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { QueryError } from '@/components/ErrorBoundary'
import { Shimmer } from '@/components/Skeleton'
import { trpc } from '@/lib/trpc'
import { FileText, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const TAIL_OPTIONS = [50, 100, 500, 1000] as const
const AUTO_REFRESH_INTERVAL = 5000

function SelectField({
  label,
  value,
  onChange,
  children,
  className = 'w-44',
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-[var(--color-text-muted)]">{label}</label>
      <select
        className={`block ${className} rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  )
}

export default function LogsPage() {
  const [selectedNamespace, setSelectedNamespace] = useState<string>('')
  const [selectedPod, setSelectedPod] = useState<string>('')
  const [selectedContainer, setSelectedContainer] = useState<string>('')
  const [tailLines, setTailLines] = useState(100)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)

  const podsQuery = trpc.logs.pods.useQuery(
    selectedNamespace ? { namespace: selectedNamespace } : undefined,
    { refetchOnWindowFocus: false },
  )

  const logsQuery = trpc.logs.get.useQuery(
    {
      podName: selectedPod,
      namespace: selectedNamespace,
      container: selectedContainer || undefined,
      tailLines,
    },
    {
      enabled: !!selectedPod && !!selectedNamespace,
      refetchOnWindowFocus: false,
      refetchInterval: autoRefresh ? AUTO_REFRESH_INTERVAL : false,
    },
  )

  const namespaces = useMemo(() => {
    const ns = new Set((podsQuery.data ?? []).map((p) => p.namespace))
    return Array.from(ns).sort()
  }, [podsQuery.data])

  const filteredPods = useMemo(() => {
    if (!podsQuery.data) return []
    if (!selectedNamespace) return podsQuery.data
    return podsQuery.data.filter((p) => p.namespace === selectedNamespace)
  }, [podsQuery.data, selectedNamespace])

  const currentPod = useMemo(
    () => filteredPods.find((p) => p.name === selectedPod),
    [filteredPods, selectedPod],
  )

  const filteredLines = useMemo(() => {
    const text = logsQuery.data?.logs ?? ''
    if (!text) return []
    const lines = text.split('\n')
    if (!searchTerm) return lines
    const lower = searchTerm.toLowerCase()
    return lines.filter((l) => l.toLowerCase().includes(lower))
  }, [logsQuery.data?.logs, searchTerm])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filteredLines])

  const handleNamespaceChange = useCallback((ns: string) => {
    setSelectedNamespace(ns)
    setSelectedPod('')
    setSelectedContainer('')
  }, [])

  const handlePodChange = useCallback((pod: string) => {
    setSelectedPod(pod)
    setSelectedContainer('')
  }, [])

  return (
    <AppLayout>
      <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Breadcrumbs />
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Tail pod logs in real time</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3">
          <SelectField label="Namespace" value={selectedNamespace} onChange={handleNamespaceChange}>
            <option value="">All namespaces</option>
            {namespaces.map((ns) => (
              <option key={ns} value={ns}>{ns}</option>
            ))}
          </SelectField>

          <SelectField label="Pod" value={selectedPod} onChange={handlePodChange} className="w-64">
            <option value="">Select a pod…</option>
            {filteredPods.map((p) => (
              <option key={`${p.namespace}/${p.name}`} value={p.name}>
                {p.name} ({p.status})
              </option>
            ))}
          </SelectField>

          {currentPod && currentPod.containers.length > 1 && (
            <SelectField label="Container" value={selectedContainer} onChange={setSelectedContainer}>
              <option value="">All containers</option>
              {currentPod.containers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </SelectField>
          )}

          <SelectField label="Tail lines" value={tailLines} onChange={(v) => setTailLines(Number(v))} className="w-24">
            {TAIL_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </SelectField>

          {/* Refresh */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            disabled={!selectedPod || logsQuery.isFetching}
            onClick={() => logsQuery.refetch()}
          >
            <RefreshCw className={`h-4 w-4 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {/* Auto-refresh toggle */}
          <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-[var(--color-border)] accent-[var(--color-accent)]"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (5s)
          </label>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Filter logs…"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] py-2 pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Log display */}
        {podsQuery.isLoading && <Shimmer className="h-64 w-full rounded-lg" />}
        {podsQuery.isError && <QueryError message={podsQuery.error.message} onRetry={() => podsQuery.refetch()} />}
        {logsQuery.isError && <QueryError message={logsQuery.error.message} onRetry={() => logsQuery.refetch()} />}

        {!selectedPod && !podsQuery.isLoading && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] py-20 text-[var(--color-text-muted)]">
            <FileText className="h-10 w-10 mb-3 opacity-40" />
            <p>Select a pod to view logs</p>
          </div>
        )}

        {selectedPod && logsQuery.isLoading && <Shimmer className="h-64 w-full rounded-lg" />}

        {selectedPod && logsQuery.data && (
          <div className="relative rounded-xl border border-[var(--color-border)] overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-log-header)] px-4 py-2">
              <span className="text-xs text-[var(--color-log-dim)] font-mono">
                {selectedNamespace}/{selectedPod}
                {selectedContainer ? ` → ${selectedContainer}` : ''}
              </span>
              <span className="text-xs text-[var(--color-log-dim)]">{filteredLines.length} lines</span>
            </div>
            <pre className="overflow-auto max-h-[600px] p-4 text-xs leading-5 text-[var(--color-log-text)] font-mono whitespace-pre-wrap bg-[var(--color-log-bg)]">
              {filteredLines.length === 0 ? (
                <span className="text-[var(--color-log-dim)] italic">No matching log lines</span>
              ) : (
                filteredLines.map((line, i) => (
                  <div key={i} className="hover:bg-white/5">
                    <span className="inline-block w-12 text-right text-[var(--color-log-line-number)] select-none mr-4">
                      {i + 1}
                    </span>
                    {line}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </pre>
          </div>
        )}
      </div>
          </PageTransition>
    </AppLayout>
  )
}
