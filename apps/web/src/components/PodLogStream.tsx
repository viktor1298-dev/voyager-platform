'use client'

import { ArrowDown, Pause, Play, Search, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface PodLogStreamProps {
  podName: string
  namespace: string
}

interface LogLine {
  id: number
  timestamp: string
  text: string
}

// Generate mock log lines for demo
function generateMockLog(index: number): LogLine {
  const levels = ['INFO', 'DEBUG', 'WARN', 'ERROR']
  const messages = [
    'Request processed successfully in 12ms',
    'Connection pool: 8/20 active connections',
    'Health check passed — all services healthy',
    'Cache hit ratio: 94.2%',
    'Graceful shutdown initiated',
    'New connection from 10.244.0.5:43210',
    'Certificate renewal check completed',
    'Memory usage: 128Mi / 256Mi (50%)',
    'Readiness probe succeeded',
    'Liveness probe succeeded',
    'Pod scheduled on node minikube-m02',
    'Image pull complete: voyager-api:v12',
    'WARNING: High latency detected on /api/clusters (>500ms)',
    'ERROR: Connection refused to postgres:5432 — retrying in 5s',
    'Deployment rollout status: 3/3 replicas available',
  ]
  const level = levels[Math.floor(Math.random() * (index % 7 === 0 ? 4 : 2))]!
  const msg = messages[index % messages.length]!
  const ts = new Date(Date.now() - (100 - index) * 1200).toISOString()
  return { id: index, timestamp: ts, text: `[${level}] ${msg}` }
}

export function PodLogStream({ podName, namespace }: PodLogStreamProps) {
  const [logs, setLogs] = useState<LogLine[]>([])
  const [streaming, setStreaming] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const counterRef = useRef(0)

  // Simulate streaming logs
  useEffect(() => {
    // Initial batch
    const initial: LogLine[] = []
    for (let i = 0; i < 20; i++) {
      initial.push(generateMockLog(counterRef.current++))
    }
    setLogs(initial)

    if (!streaming) return

    const interval = setInterval(() => {
      setLogs((prev) => {
        const newLine = generateMockLog(counterRef.current++)
        const updated = [...prev, newLine]
        return updated.length > 500 ? updated.slice(-500) : updated
      })
    }, 800 + Math.random() * 1200)

    return () => clearInterval(interval)
  }, [streaming])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 40
    setAutoScroll(atBottom)
  }, [])

  const filteredLogs = searchQuery
    ? logs.filter((l) => l.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : logs

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 })
    } catch {
      return ts
    }
  }

  const levelColor = (text: string) => {
    if (text.includes('[ERROR]')) return 'text-red-400'
    if (text.includes('[WARN]')) return 'text-yellow-400'
    if (text.includes('[DEBUG]')) return 'text-blue-400'
    return 'text-[var(--color-text-secondary)]'
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--surface,#14141f)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="flex items-center gap-2">
          <h4 className="text-xs text-[var(--color-text-muted)] font-mono uppercase tracking-wider">
            Logs
          </h4>
          <span className="text-xs text-[var(--color-text-dim)] font-mono">
            {podName}
          </span>
          {streaming && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-mono">LIVE</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {showSearch && (
            <div className="flex items-center gap-1 mr-2">
              <Search className="h-3 w-3 text-[var(--color-text-dim)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter logs…"
                className="w-32 bg-transparent text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:outline-none border-b border-[var(--color-border)] py-0.5"
                autoFocus
              />
              {searchQuery && (
                <span className="text-xs text-[var(--color-text-dim)] font-mono">
                  {filteredLogs.length}
                </span>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchQuery('') }}
            className="p-1.5 rounded hover:bg-white/[0.06] text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label="Toggle search"
          >
            {showSearch ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setStreaming(!streaming)}
            className="p-1.5 rounded hover:bg-white/[0.06] text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label={streaming ? 'Pause stream' : 'Resume stream'}
          >
            {streaming ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          {!autoScroll && (
            <button
              type="button"
              onClick={() => {
                setAutoScroll(true)
                containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' })
              }}
              className="p-1.5 rounded hover:bg-white/[0.06] text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
              aria-label="Scroll to bottom"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Log lines */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-64 overflow-y-auto overflow-x-hidden font-mono text-xs leading-5 p-3 scrollbar-thin"
      >
        {filteredLogs.map((line) => (
          <div key={line.id} className="flex gap-2 hover:bg-white/[0.02] px-1 rounded">
            <span className="text-[var(--color-text-dim)] shrink-0 select-none">
              {formatTime(line.timestamp)}
            </span>
            <span className={levelColor(line.text)}>{line.text}</span>
          </div>
        ))}
        {filteredLogs.length === 0 && (
          <div className="text-center text-[var(--color-text-dim)] py-8">
            {searchQuery ? 'No matching logs' : 'Waiting for logs…'}
          </div>
        )}
      </div>
    </div>
  )
}
