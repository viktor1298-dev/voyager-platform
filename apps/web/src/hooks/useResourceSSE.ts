'use client'

import { useEffect, useRef } from 'react'
import type { WatchEvent, WatchEventBatch, WatchStatusEvent } from '@voyager/types'
import {
  SSE_CLIENT_HEARTBEAT_TIMEOUT_MS,
  SSE_INITIAL_RECONNECT_DELAY_MS,
  SSE_MAX_RECONNECT_DELAY_MS,
  SSE_RECONNECT_BACKOFF_MULTIPLIER,
} from '@voyager/config/sse'
import { useResourceStore } from '@/stores/resource-store'
import { useConnectionState, type ConnectionState } from '@/hooks/useResources'

export type { ConnectionState }

/**
 * Lens-style SSE hook: subscribes directly to the API SSE endpoint for a cluster
 * and applies incoming watch events to the Zustand resource store.
 *
 * Features:
 * - Custom exponential backoff reconnect (1s -> 2s -> 4s -> ... -> 30s cap) (CONN-03)
 * - Client-side heartbeat dead-connection detection within 45s (CONN-02)
 * - 1-second event buffer with Zustand batch flush (PERF-01 + PERF-02)
 * - Stale data preserved during reconnect (D-01) — no data clearing on error
 * - Silent reconnect (D-02) — no toast notifications
 *
 * Placed once in the cluster layout -- all tabs get live updates for free.
 * Exposes connectionState for ConnectionStatusBadge to consume.
 */
export function useResourceSSE(clusterId: string | null): { connectionState: ConnectionState } {
  const connectionState = useConnectionState(clusterId ?? '')
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectDelayRef = useRef(SSE_INITIAL_RECONNECT_DELAY_MS)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bufferRef = useRef<WatchEvent[]>([])
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastDataRef = useRef(Date.now())
  const heartbeatCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!clusterId) return

    const { setResources, setConnectionState, clearCluster } = useResourceStore.getState()

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
    const url = `${apiUrl}/api/resources/stream?clusterId=${encodeURIComponent(clusterId)}`

    /** Close EventSource and cancel any pending reconnect timer */
    function closeConnection() {
      const current = eventSourceRef.current
      if (current) {
        current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }

    /** Stop the heartbeat monitor interval */
    function stopHeartbeatMonitor() {
      if (heartbeatCheckRef.current) {
        clearInterval(heartbeatCheckRef.current)
        heartbeatCheckRef.current = null
      }
    }

    /** Start heartbeat monitor — detects dead connections within SSE_CLIENT_HEARTBEAT_TIMEOUT_MS (CONN-02) */
    function startHeartbeatMonitor() {
      stopHeartbeatMonitor()
      heartbeatCheckRef.current = setInterval(() => {
        if (Date.now() - lastDataRef.current > SSE_CLIENT_HEARTBEAT_TIMEOUT_MS) {
          // Connection appears dead -- force reconnect
          closeConnection()
          stopHeartbeatMonitor()
          setConnectionState(clusterId!, 'reconnecting')
          scheduleReconnect()
        }
      }, 10_000) // Check every 10 seconds
    }

    /** Schedule a reconnect with exponential backoff + jitter (CONN-03) */
    function scheduleReconnect() {
      const baseDelay = reconnectDelayRef.current
      const jitter = Math.random() * 1000
      const delay = baseDelay + jitter
      reconnectDelayRef.current = Math.min(
        baseDelay * SSE_RECONNECT_BACKOFF_MULTIPLIER,
        SSE_MAX_RECONNECT_DELAY_MS,
      )
      reconnectTimeoutRef.current = setTimeout(connect, delay)
    }

    /** Flush buffered events to Zustand in a single batch update (PERF-01 + PERF-02) */
    function flushBuffer() {
      const events = bufferRef.current
      bufferRef.current = []
      flushTimerRef.current = null
      if (events.length === 0) return
      useResourceStore.getState().applyEvents(clusterId!, events)
    }

    /** Wire up all SSE event listeners on an EventSource instance */
    function wireHandlers(es: EventSource) {
      // Reset backoff delay on successful connection, start heartbeat monitor
      es.onopen = () => {
        reconnectDelayRef.current = SSE_INITIAL_RECONNECT_DELAY_MS
        setConnectionState(clusterId!, 'connected')
        lastDataRef.current = Date.now()
        startHeartbeatMonitor()
      }

      es.addEventListener('snapshot', (e: MessageEvent) => {
        lastDataRef.current = Date.now()
        try {
          const { resourceType, items } = JSON.parse(e.data)
          setResources(clusterId!, resourceType, items)
        } catch {
          /* ignore parse errors */
        }
      })

      // Buffered watch handler (PERF-01): accumulate events, flush every 1 second
      es.addEventListener('watch', (e: MessageEvent) => {
        lastDataRef.current = Date.now()
        try {
          const batch: WatchEventBatch = JSON.parse(e.data)
          bufferRef.current.push(...batch.events)
          if (!flushTimerRef.current) {
            flushTimerRef.current = setTimeout(flushBuffer, 1000)
          }
        } catch {
          /* ignore */
        }
      })

      es.addEventListener('status', (e: MessageEvent) => {
        lastDataRef.current = Date.now()
        try {
          const status: WatchStatusEvent = JSON.parse(e.data)
          setConnectionState(clusterId!, status.state as ConnectionState)
        } catch {
          /* ignore */
        }
      })

      // Client heartbeat monitor -- reset timer on server heartbeat event
      // (Plan 01 changed server heartbeat from SSE comment to named event)
      es.addEventListener('heartbeat', () => {
        lastDataRef.current = Date.now()
      })

      // Custom reconnect (CONN-03): close native EventSource to prevent its auto-reconnect,
      // then schedule our own reconnect with exponential backoff
      // Per D-01: do NOT clear data -- keep stale data visible during reconnect
      // Per D-02: no toast on reconnect
      es.onerror = () => {
        es.close() // Prevent native EventSource auto-reconnect (Pitfall 3)
        eventSourceRef.current = null
        stopHeartbeatMonitor()
        setConnectionState(clusterId!, 'reconnecting')
        scheduleReconnect()
      }
    }

    /** Create a new EventSource connection */
    function connect() {
      closeConnection()
      setConnectionState(clusterId!, 'reconnecting')
      const es = new EventSource(url, { withCredentials: true })
      eventSourceRef.current = es
      wireHandlers(es)
    }

    // Initial connection
    setConnectionState(clusterId, 'initializing')
    connect()

    /** Reconnect EventSource when tab returns from background and connection died */
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      const current = eventSourceRef.current
      if (!current || current.readyState === EventSource.CLOSED) {
        connect()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      closeConnection()
      stopHeartbeatMonitor()
      // Flush any buffered events before clearing cluster data
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      // Apply remaining buffered events so they are not lost
      const remaining = bufferRef.current
      if (remaining.length > 0) {
        bufferRef.current = []
        useResourceStore.getState().applyEvents(clusterId, remaining)
      }
      clearCluster(clusterId)
    }
  }, [clusterId])

  return { connectionState }
}
