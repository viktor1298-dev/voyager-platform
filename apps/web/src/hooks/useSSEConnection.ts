'use client'

import { useCallback, useRef, useState } from 'react'
import type { SSEConnectionState } from '@voyager/types'
import {
  SSE_INITIAL_RECONNECT_DELAY_MS,
  SSE_MAX_RECONNECT_DELAY_MS,
  SSE_RECONNECT_BACKOFF_MULTIPLIER,
} from '@voyager/config/sse'

/**
 * Hook to track SSE connection state with exponential backoff info.
 * Use with tRPC subscription hooks to show connection indicators in UI.
 */
export function useSSEConnection() {
  const [state, setState] = useState<SSEConnectionState>('disconnected')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const delayRef = useRef(SSE_INITIAL_RECONNECT_DELAY_MS)

  const onConnected = useCallback(() => {
    setState('connected')
    setReconnectAttempt(0)
    delayRef.current = SSE_INITIAL_RECONNECT_DELAY_MS
  }, [])

  const onDisconnected = useCallback(() => {
    setState('reconnecting')
    setReconnectAttempt((prev) => prev + 1)
    delayRef.current = Math.min(
      delayRef.current * SSE_RECONNECT_BACKOFF_MULTIPLIER,
      SSE_MAX_RECONNECT_DELAY_MS,
    )
  }, [])

  const onConnecting = useCallback(() => {
    setState('connecting')
  }, [])

  return {
    state,
    reconnectAttempt,
    nextRetryMs: delayRef.current,
    onConnected,
    onDisconnected,
    onConnecting,
  }
}
