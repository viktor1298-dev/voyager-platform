'use client'

import { useEffect, useRef } from 'react'
import type { WatchEventBatch, WatchStatusEvent } from '@voyager/types'
import { useResourceStore } from '@/stores/resource-store'
import { useConnectionState, type ConnectionState } from '@/hooks/useResources'

export type { ConnectionState }

/**
 * Lens-style SSE hook: subscribes directly to the API SSE endpoint for a cluster
 * and applies incoming watch events to the Zustand resource store.
 *
 * Flow: K8s Watch -> informer -> SSE (direct to API) -> this hook -> Zustand store
 *
 * Placed once in the cluster layout -- all tabs get live updates for free.
 * Exposes connectionState for ConnectionStatusBadge to consume.
 */
export function useResourceSSE(clusterId: string | null): { connectionState: ConnectionState } {
  const connectionState = useConnectionState(clusterId ?? '')
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!clusterId) return

    const { setResources, applyEvent, setConnectionState, clearCluster } =
      useResourceStore.getState()

    setConnectionState(clusterId, 'initializing')

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
    const url = `${apiUrl}/api/resources/stream?clusterId=${encodeURIComponent(clusterId)}`
    const es = new EventSource(url, { withCredentials: true })
    eventSourceRef.current = es

    es.onopen = () => setConnectionState(clusterId, 'connected')

    es.addEventListener('snapshot', (e: MessageEvent) => {
      try {
        const { resourceType, items } = JSON.parse(e.data)
        setResources(clusterId, resourceType, items)
      } catch {
        /* ignore parse errors */
      }
    })

    es.addEventListener('watch', (e: MessageEvent) => {
      try {
        const batch: WatchEventBatch = JSON.parse(e.data)
        for (const event of batch.events) {
          applyEvent(clusterId, event)
        }
      } catch {
        /* ignore */
      }
    })

    es.addEventListener('status', (e: MessageEvent) => {
      try {
        const status: WatchStatusEvent = JSON.parse(e.data)
        setConnectionState(clusterId, status.state as ConnectionState)
      } catch {
        /* ignore */
      }
    })

    es.onerror = () => {
      if (es.readyState === EventSource.CONNECTING) {
        setConnectionState(clusterId, 'reconnecting')
      } else if (es.readyState === EventSource.CLOSED) {
        setConnectionState(clusterId, 'disconnected')
      }
    }

    return () => {
      es.close()
      eventSourceRef.current = null
      clearCluster(clusterId)
    }
  }, [clusterId])

  return { connectionState }
}
