'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SSEConnectionState, MetricsStreamEvent } from '@voyager/types'
import {
  SSE_INITIAL_RECONNECT_DELAY_MS,
  SSE_MAX_RECONNECT_DELAY_MS,
  SSE_RECONNECT_BACKOFF_MULTIPLIER,
} from '@voyager/config/sse'
import { MetricsBuffer, convertSSEEvent } from '@/lib/metrics-buffer'
import type { MetricsDataPoint } from '@/components/metrics/MetricsAreaChart'

interface UseMetricsSSEOptions {
  enabled: boolean
  maxPoints: number
  rangeMs: number
}

interface UseMetricsSSEReturn {
  points: MetricsDataPoint[]
  hasData: boolean
  connectionState: SSEConnectionState
  lastTimestamp: number | null
}

/**
 * Hook that manages an EventSource connection to /api/metrics/stream.
 * Provides exponential backoff reconnection (SSE-03) and
 * visibility-aware lifecycle (SSE-04).
 */
export function useMetricsSSE(
  clusterId: string,
  options: UseMetricsSSEOptions,
): UseMetricsSSEReturn {
  const { enabled, maxPoints, rangeMs } = options

  const [points, setPoints] = useState<MetricsDataPoint[]>([])
  const [connectionState, setConnectionState] = useState<SSEConnectionState>('disconnected')
  const [lastTimestamp, setLastTimestamp] = useState<number | null>(null)

  const bufferRef = useRef<MetricsBuffer>(new MetricsBuffer(maxPoints, rangeMs))
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelayRef = useRef(SSE_INITIAL_RECONNECT_DELAY_MS)

  // Recreate buffer when capacity or range changes
  useEffect(() => {
    bufferRef.current = new MetricsBuffer(maxPoints, rangeMs)
    setPoints([])
  }, [maxPoints, rangeMs])

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
    // Close any existing connection first
    closeConnection()

    if (!clusterId) return

    setConnectionState('connecting')
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
    const es = new EventSource(
      `${apiUrl}/api/metrics/stream?clusterId=${encodeURIComponent(clusterId)}`,
      { withCredentials: true },
    )
    eventSourceRef.current = es

    es.addEventListener('open', () => {
      setConnectionState('connected')
      reconnectDelayRef.current = SSE_INITIAL_RECONNECT_DELAY_MS
    })

    es.addEventListener('message', (event) => {
      try {
        const sseEvent = JSON.parse(event.data) as MetricsStreamEvent
        // Skip error events from the server
        if (sseEvent.error) return

        const point = convertSSEEvent(sseEvent)
        bufferRef.current.push(point)
        setPoints(bufferRef.current.toArray())
        setLastTimestamp(new Date(point.timestamp).getTime())
      } catch {
        // Ignore malformed JSON
      }
    })

    es.addEventListener('error', () => {
      es.close()
      eventSourceRef.current = null
      setConnectionState('reconnecting')

      // Schedule reconnect with exponential backoff + jitter
      const baseDelay = reconnectDelayRef.current
      const jitter = Math.random() * 1000
      const delay = baseDelay + jitter
      reconnectDelayRef.current = Math.min(
        baseDelay * SSE_RECONNECT_BACKOFF_MULTIPLIER,
        SSE_MAX_RECONNECT_DELAY_MS,
      )
      reconnectTimeoutRef.current = setTimeout(connect, delay)
    })
  }, [clusterId, closeConnection])

  // Main effect: connect/disconnect based on enabled flag
  useEffect(() => {
    if (!enabled) {
      closeConnection()
      bufferRef.current.clear()
      setPoints([])
      setConnectionState('disconnected')
      setLastTimestamp(null)
      return
    }

    connect()

    return () => {
      closeConnection()
    }
  }, [enabled, connect, closeConnection])

  // Visibility-aware lifecycle (SSE-04)
  useEffect(() => {
    if (!enabled) return
    if (typeof document === 'undefined') return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden: close connection, stop reconnecting
        closeConnection()
        setConnectionState('disconnected')
      } else {
        // Tab visible: clear stale buffer data, reconnect fresh
        bufferRef.current.clear()
        setPoints([])
        reconnectDelayRef.current = SSE_INITIAL_RECONNECT_DELAY_MS
        connect()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, connect, closeConnection])

  return {
    points,
    hasData: points.length > 0,
    connectionState,
    lastTimestamp,
  }
}
