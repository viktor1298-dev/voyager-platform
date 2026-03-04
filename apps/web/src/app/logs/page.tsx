'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { EmptyState } from '@/components/EmptyState'
import { QueryError } from '@/components/ErrorBoundary'
import { Shimmer } from '@/components/Skeleton'
import { trpc } from '@/lib/trpc'
import { Download, FileText, Pause, Play, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** Try to pretty-print JSON log messages */
function tryFormatJson(message: string): string {
  const trimmed = message.trim()
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return message
  try {
    const parsed = JSON.parse(trimmed)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return message
  }
}

const TAIL_OPTIONS = [50, 100, 500, 1000] as const
const LOG_LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'] as const
const AUTO_REFRESH_INTERVAL = 5000

type LogLevel = (typeof LOG_LEVELS)[number]

function podKey(namespace: string, podName: string) {
  return `${namespace}/${podName}`
}

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
  const [selectedPods, setSelectedPods] = useState<string[]>([]) // keys: namespace/pod

  const [tailLines, setTailLines] = useState(200)
  const [liveTail, setLiveTail] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLevels, setSelectedLevels] = useState<LogLevel[]>([...LOG_LEVELS])
  const [viewMode, setViewMode] = useState<'merged' | 'split'>('merged')
  const logEndRef = useRef<HTMLDivElement>(null)

  const podsQuery = trpc.logs.pods.useQuery(
    selectedNamespace ? { namespace: selectedNamespace } : undefined,
    { refetchOnWindowFocus: false },
  )

  const filteredPods = useMemo(() => {
    const allPods = podsQuery.data ?? []
    if (!selectedNamespace) return allPods
    return allPods.filter((p) => p.namespace === selectedNamespace)
  }, [podsQuery.data, selectedNamespace])

  const namespaces = useMemo(() => {
    const ns = new Set((podsQuery.data ?? []).map((p) => p.namespace))
    return Array.from(ns).sort()
  }, [podsQuery.data])

  const selectedTargets = useMemo(
    () =>
      filteredPods
        .filter((pod) => selectedPods.includes(podKey(pod.namespace, pod.name)))
        .map((pod) => ({ namespace: pod.namespace, podName: pod.name })),
    [filteredPods, selectedPods],
  )

  const logsQuery = trpc.logs.tail.useQuery(
    {
      targets: selectedTargets,
      tailLines,
      search: searchTerm || undefined,
      levels: selectedLevels,
    },
    {
      enabled: selectedTargets.length > 0 && !isPaused,
      refetchOnWindowFocus: false,
      refetchInterval: liveTail && !isPaused ? AUTO_REFRESH_INTERVAL : false,
    },
  )

  useEffect(() => {
    if (autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logsQuery.data?.lines, autoScroll])

  useEffect(() => {
    setSelectedPods((current) =>
      current.filter((key) => filteredPods.some((p) => podKey(p.namespace, p.name) === key)),
    )
  }, [filteredPods])

  const togglePod = useCallback((key: string) => {
    setSelectedPods((current) =>
      current.includes(key) ? current.filter((p) => p !== key) : [...current, key],
    )
  }, [])

  const toggleLevel = useCallback((level: LogLevel) => {
    setSelectedLevels((current) =>
      current.includes(level) ? current.filter((l) => l !== level) : [...current, level],
    )
  }, [])

  const downloadLogs = useCallback(() => {
    const lines = logsQuery.data?.lines ?? []
    if (lines.length === 0) return

    const text = lines
      .map(
        (line) =>
          `${line.timestamp} [${line.level}] ${line.namespace}/${line.podName}/${line.container}: ${line.message}`,
      )
      .join('\n')

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `voyager-logs-${new Date().toISOString().replaceAll(':', '-')}.log`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [logsQuery.data?.lines])

  const targetsWithErrors = logsQuery.data?.targets.filter((target) => target.error) ?? []

  const groupedLines = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof logsQuery.data>['lines']>()
    for (const line of logsQuery.data?.lines ?? []) {
      const key = `${line.namespace}/${line.podName}/${line.container}`
      const existing = groups.get(key)
      if (existing) {
        existing.push(line)
      } else {
        groups.set(key, [line])
      }
    }

    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [logsQuery.data?.lines])

  return (
    <AppLayout>
      <PageTransition>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Breadcrumbs />
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                Live tail from multiple pods with filters and download
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label="Namespace"
              value={selectedNamespace}
              onChange={(ns) => {
                setSelectedNamespace(ns)
                setSelectedPods([])
              }}
            >
              <option value="">All namespaces</option>
              {namespaces.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Tail lines"
              value={tailLines}
              onChange={(v) => setTailLines(Number(v))}
              className="w-24"
            >
              {TAIL_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </SelectField>

            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              disabled={selectedTargets.length === 0 || logsQuery.isFetching}
              onClick={() => logsQuery.refetch()}
            >
              <RefreshCw className={`h-4 w-4 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-white/5"
              disabled={selectedTargets.length === 0}
              onClick={() => setIsPaused((v) => !v)}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-white/5 disabled:opacity-50"
              disabled={!logsQuery.data?.lines.length}
              onClick={downloadLogs}
            >
              <Download className="h-4 w-4" />
              Download
            </button>

            <label className="inline-flex min-h-[44px] items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                checked={liveTail}
                onChange={(e) => setLiveTail(e.target.checked)}
              />
              Live tail (5s)
            </label>

            <label className="inline-flex min-h-[44px] items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              Auto-scroll
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3">
              <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2">Pods</p>
              <div className="max-h-[260px] overflow-auto space-y-2 pr-1">
                {filteredPods.map((pod) => {
                  const targetKey = podKey(pod.namespace, pod.name)
                  return (
                    <label key={targetKey} className="flex min-h-[44px] items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedPods.includes(targetKey)}
                        onChange={() => togglePod(targetKey)}
                        className="shrink-0 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                      />
                      <span className="text-[var(--color-text-primary)] break-all">
                        {pod.name}
                        <span className="ml-1 text-xs text-[var(--color-text-muted)]">({pod.status})</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  placeholder="Search logs…"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] py-2 pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {LOG_LEVELS.map((level) => (
                  <label
                    key={level}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedLevels.includes(level)}
                      onChange={() => toggleLevel(level)}
                      className="rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                    />
                    {level}
                  </label>
                ))}
              </div>

              <div
                role="group"
                aria-label="Log view mode"
                className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 text-xs"
              >
                <button
                  type="button"
                  aria-pressed={viewMode === 'merged'}
                  className={`rounded-md px-2 py-1 ${viewMode === 'merged' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)]'}`}
                  onClick={() => setViewMode('merged')}
                >
                  Merged
                </button>
                <button
                  type="button"
                  aria-pressed={viewMode === 'split'}
                  className={`rounded-md px-2 py-1 ${viewMode === 'split' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)]'}`}
                  onClick={() => setViewMode('split')}
                >
                  Split by pod
                </button>
              </div>
            </div>
          </div>

          {podsQuery.isLoading && <Shimmer className="h-64 w-full rounded-lg" />}
          {podsQuery.isError && <QueryError message={podsQuery.error.message} onRetry={() => podsQuery.refetch()} />}
          {logsQuery.isError && <QueryError message={logsQuery.error.message} onRetry={() => logsQuery.refetch()} />}

          {targetsWithErrors.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              {targetsWithErrors.map((target) => (
                <p key={`${target.namespace}/${target.podName}`}>
                  {target.namespace}/{target.podName}: {target.error}
                </p>
              ))}
            </div>
          )}

          {selectedTargets.length === 0 && !podsQuery.isLoading && (
            <EmptyState
              icon={<FileText className="h-10 w-10" />}
              title="Select a pod to view logs"
              description="Choose one or more pods from the sidebar to start streaming live logs with filtering and search."
            />
          )}

          {selectedTargets.length > 0 && logsQuery.data && (
            <div className="space-y-3">
              <div
                className="relative rounded-xl border border-[var(--color-border)] overflow-hidden"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                {/* Sticky header with search */}
                <div className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-log-header)]">
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-xs text-[var(--color-log-dim)] font-mono">
                      {selectedTargets.length} pod(s) • {selectedLevels.join(', ')}
                    </span>
                    <span className="text-xs text-[var(--color-log-dim)]">{logsQuery.data.lines.length} lines</span>
                  </div>
                  <div className="px-4 pb-2">
                    <div className="relative max-w-sm">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
                      <input
                        type="text"
                        placeholder="Search in log output…"
                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] py-1.5 pl-8 pr-3 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                {viewMode === 'merged' ? (
                  <pre className="overflow-auto max-h-[600px] p-4 text-xs leading-5 text-[var(--color-log-text)] font-mono whitespace-pre-wrap bg-[var(--color-log-bg)]">
                    {logsQuery.data.lines.length === 0 ? (
                      <span className="text-[var(--color-log-dim)] italic">No matching log lines</span>
                    ) : (
                      logsQuery.data.lines.map((line, index) => {
                        const levelColor = line.level === 'ERROR' ? 'text-red-400' : line.level === 'WARN' ? 'text-yellow-400' : line.level === 'INFO' ? 'text-blue-400' : line.level === 'DEBUG' ? 'text-gray-400' : ''
                        const formattedMessage = tryFormatJson(line.message)
                        return (
                          <div key={`${line.timestamp}-${line.podName}-${index}`} className="hover:bg-white/5">
                            <span className="inline-block w-8 text-right text-[var(--color-log-line-number)] select-none mr-3">
                              {index + 1}
                            </span>
                            <span className="text-[var(--color-log-dim)] mr-2">{line.timestamp}</span>
                            <span className={`mr-2 font-bold ${levelColor}`}>[{line.level}]</span>
                            <span className="text-cyan-300 mr-2">
                              {line.namespace}/{line.podName}/{line.container}
                            </span>
                            {formattedMessage}
                          </div>
                        )
                      })
                    )}
                    <div ref={logEndRef} />
                  </pre>
                ) : (
                  <div className="max-h-[600px] overflow-auto bg-[var(--color-log-bg)] p-3 space-y-3">
                    {groupedLines.length === 0 ? (
                      <div className="text-xs italic text-[var(--color-log-dim)]">No matching log lines</div>
                    ) : (
                      groupedLines.map(([groupKey, lines]) => (
                        <div key={groupKey} className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                          <div className="bg-[var(--color-log-header)] px-3 py-1 text-xs text-cyan-300 font-mono">
                            {groupKey} ({lines.length})
                          </div>
                          <pre className="p-3 text-xs leading-5 text-[var(--color-log-text)] font-mono whitespace-pre-wrap">
                            {lines.map((line, index) => {
                              const lvlColor = line.level === 'ERROR' ? 'text-red-400' : line.level === 'WARN' ? 'text-yellow-400' : line.level === 'INFO' ? 'text-blue-400' : line.level === 'DEBUG' ? 'text-gray-400' : ''
                              return (
                                <div key={`${line.timestamp}-${index}`}>
                                  <span className="text-[var(--color-log-dim)] mr-2">{line.timestamp}</span>
                                  <span className={`mr-2 font-bold ${lvlColor}`}>[{line.level}]</span>
                                  {tryFormatJson(line.message)}
                                </div>
                              )
                            })}
                          </pre>
                        </div>
                      ))
                    )}
                    <div ref={logEndRef} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </PageTransition>
    </AppLayout>
  )
}
