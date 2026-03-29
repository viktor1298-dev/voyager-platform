'use client'

import { ArrowDown, WrapText } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  SSE_INITIAL_RECONNECT_DELAY_MS,
  SSE_MAX_RECONNECT_DELAY_MS,
  SSE_RECONNECT_BACKOFF_MULTIPLIER,
} from '@voyager/config/sse'
import { LogLine } from './LogLine'
import { LogSearch } from './LogSearch'

type SSEConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

interface LogViewerProps {
  lines: string[]
  isLoading?: boolean
  autoScroll?: boolean
  /** Cluster ID for SSE log streaming */
  clusterId?: string
  /** Pod name for SSE log streaming */
  podName?: string
  /** Namespace for SSE log streaming */
  namespace?: string
  /** Container name for SSE log streaming (optional, defaults to first container) */
  container?: string
}

export function LogViewer({
  lines: initialLines,
  isLoading,
  autoScroll = true,
  clusterId,
  podName,
  namespace,
  container,
}: LogViewerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [wordWrap, setWordWrap] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const [sseLines, setSseLines] = useState<string[]>([])
  const [connectionState, setConnectionState] = useState<SSEConnectionState>('disconnected')
  const [isPaused, setIsPaused] = useState(false)
  const [newLineCount, setNewLineCount] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelayRef = useRef(SSE_INITIAL_RECONNECT_DELAY_MS)
  const isPausedRef = useRef(false)

  // Merge initial fetched lines with SSE streamed lines
  const lines = useMemo(() => {
    if (!isFollowing || sseLines.length === 0) return initialLines
    return [...initialLines, ...sseLines]
  }, [initialLines, sseLines, isFollowing])

  // Count matches for the search badge
  const matchCount = useMemo(() => {
    if (!searchQuery) return 0
    const lower = searchQuery.toLowerCase()
    return lines.filter((line) => line.toLowerCase().includes(lower)).length
  }, [lines, searchQuery])

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  // SSE connection management
  const closeConnection = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    closeConnection()

    if (!clusterId || !podName || !namespace) return

    setConnectionState('connecting')
    const params = new URLSearchParams({
      clusterId,
      podName,
      namespace,
      tailLines: '100',
    })
    if (container) params.set('container', container)

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
    const es = new EventSource(`${apiUrl}/api/logs/stream?${params.toString()}`, {
      withCredentials: true,
    })
    eventSourceRef.current = es

    es.addEventListener('open', () => {
      setConnectionState('connected')
      reconnectDelayRef.current = SSE_INITIAL_RECONNECT_DELAY_MS
    })

    es.addEventListener('log', (event: MessageEvent) => {
      try {
        const { line } = JSON.parse(event.data) as { line: string; timestamp: number }
        setSseLines((prev) => [...prev, line])

        if (isPausedRef.current) {
          setNewLineCount((c) => c + 1)
        }
      } catch {
        // Ignore malformed JSON
      }
    })

    es.addEventListener('error', (event: MessageEvent) => {
      // Check if it's a custom error event with data
      try {
        if (event.data) {
          const errorData = JSON.parse(event.data) as { message: string; code: string }
          if (errorData.code === 'MAX_LINES' || errorData.code === 'STREAM_END') {
            // Stream ended normally, don't reconnect
            setConnectionState('disconnected')
            return
          }
        }
      } catch {
        // Not a custom error event, handle as connection error
      }

      es.close()
      eventSourceRef.current = null
      setConnectionState('reconnecting')

      // Schedule reconnect with exponential backoff
      const delay = reconnectDelayRef.current
      reconnectDelayRef.current = Math.min(
        delay * SSE_RECONNECT_BACKOFF_MULTIPLIER,
        SSE_MAX_RECONNECT_DELAY_MS,
      )
      reconnectTimeoutRef.current = setTimeout(connect, delay)
    })

    // Handle native EventSource errors (connection failures)
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setConnectionState('reconnecting')
        const delay = reconnectDelayRef.current
        reconnectDelayRef.current = Math.min(
          delay * SSE_RECONNECT_BACKOFF_MULTIPLIER,
          SSE_MAX_RECONNECT_DELAY_MS,
        )
        reconnectTimeoutRef.current = setTimeout(connect, delay)
      }
    }
  }, [clusterId, podName, namespace, container, closeConnection])

  // Toggle follow mode
  const handleToggleFollow = useCallback(() => {
    setIsFollowing((prev) => {
      const next = !prev
      if (!next) {
        // Turning off: close SSE, clear SSE lines
        closeConnection()
        setSseLines([])
        setConnectionState('disconnected')
        setNewLineCount(0)
        setIsPaused(false)
        isPausedRef.current = false
      }
      return next
    })
  }, [closeConnection])

  // Connect/disconnect SSE based on follow state
  useEffect(() => {
    if (isFollowing && clusterId && podName && namespace) {
      setSseLines([])
      connect()
    } else {
      closeConnection()
      setConnectionState('disconnected')
    }

    return () => {
      closeConnection()
    }
  }, [isFollowing, clusterId, podName, namespace, container, connect, closeConnection])

  // Visibility lifecycle: close SSE when tab hidden, reconnect when visible
  useEffect(() => {
    if (!isFollowing) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        closeConnection()
        setConnectionState('disconnected')
      } else if (isFollowing && clusterId && podName && namespace) {
        reconnectDelayRef.current = SSE_INITIAL_RECONNECT_DELAY_MS
        connect()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isFollowing, clusterId, podName, namespace, connect, closeConnection])

  // Auto-scroll to bottom when new lines arrive (only if following and not paused)
  useEffect(() => {
    if (isFollowing && !isPausedRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' })
    } else if (autoScroll && !isFollowing && bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: 'end' })
    }
  }, [lines.length, autoScroll, isFollowing])

  // Pause-on-hover handlers
  const handleMouseEnter = useCallback(() => {
    if (isFollowing) {
      setIsPaused(true)
      isPausedRef.current = true
    }
  }, [isFollowing])

  const handleMouseLeave = useCallback(() => {
    if (isFollowing) {
      setIsPaused(false)
      isPausedRef.current = false
      setNewLineCount(0)
      // Resume auto-scroll
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' })
      }
    }
  }, [isFollowing])

  const handleJumpToBottom = useCallback(() => {
    setIsPaused(false)
    isPausedRef.current = false
    setNewLineCount(0)
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }
  }, [])

  // Check if SSE streaming is possible (has required props)
  const canFollow = Boolean(clusterId && podName && namespace)

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
      {/* Toolbar: search + word wrap toggle + follow toggle */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <LogSearch
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          matchCount={matchCount}
          isFollowing={isFollowing}
          onToggleFollow={canFollow ? handleToggleFollow : undefined}
          isConnected={connectionState === 'connected'}
        />
        <div className="flex items-center gap-2">
          {/* Reconnecting badge */}
          {connectionState === 'reconnecting' && (
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-yellow-500" />
              </span>
              Reconnecting...
            </span>
          )}

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
      </div>

      {/* Log output container */}
      <div
        ref={scrollRef}
        className="relative rounded-xl border border-[var(--color-border)] bg-[var(--color-log-bg)] overflow-auto flex-1 py-2"
        style={{ overflowX: wordWrap ? 'hidden' : 'auto' }}
        role="log"
        aria-live="polite"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
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

        {/* New lines badge (shown when paused on hover) */}
        {isPaused && newLineCount > 0 && (
          <button
            type="button"
            onClick={handleJumpToBottom}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--color-accent)] text-white shadow-lg hover:opacity-90 transition-opacity z-10"
          >
            <ArrowDown className="h-3 w-3" />
            {newLineCount} new line{newLineCount !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Line count footer */}
      {lines.length > 0 && (
        <p className="text-xs font-mono mt-1" style={{ color: 'var(--color-text-dim)' }}>
          {lines.length} line{lines.length !== 1 ? 's' : ''}
          {isFollowing && sseLines.length > 0 && (
            <span className="ml-2">(+{sseLines.length} streamed)</span>
          )}
        </p>
      )}
    </div>
  )
}
