'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { ResourceType } from '@voyager/types'
import { trpc } from '@/lib/trpc'

// ── Connection state type ──────────────────────────────────
export type ConnectionState = 'initializing' | 'connected' | 'reconnecting' | 'disconnected'

// ── SSE wire format types (Plan 02 adds these to @voyager/types) ──
interface WatchEvent {
  type: 'ADDED' | 'MODIFIED' | 'DELETED'
  resourceType: ResourceType
  object: unknown
}

interface WatchEventBatch {
  clusterId: string
  events: WatchEvent[]
  timestamp: string
}

interface WatchStatusEvent {
  clusterId: string
  state: 'connected' | 'reconnecting' | 'disconnected' | 'initializing'
}

/**
 * Lens-style SSE hook: subscribes to /api/resources/stream for a cluster
 * and applies incoming watch events directly to TanStack Query cache via setQueryData.
 *
 * Flow: K8s Watch -> informer -> SSE -> this hook -> setQueryData (zero-latency UI update)
 *
 * Placed once in the cluster layout -- all tabs get live updates for free.
 * Exposes connectionState for ConnectionStatusBadge to consume.
 */
export function useResourceSSE(clusterId: string | null): { connectionState: ConnectionState } {
  const utils = trpc.useUtils()
  const [connectionState, setConnectionState] = useState<ConnectionState>('initializing')
  const eventSourceRef = useRef<EventSource | null>(null)

  const applyWatchEvent = useCallback(
    (event: WatchEvent) => {
      const applyToList = <T extends { name: string; namespace?: string | null }>(
        old: T[] | undefined,
        obj: T,
        type: WatchEvent['type'],
      ): T[] | undefined => {
        if (!old) return old // Race condition guard: tRPC query not yet loaded
        switch (type) {
          case 'ADDED': {
            const idx = old.findIndex((i) => i.name === obj.name && i.namespace === obj.namespace)
            if (idx >= 0) {
              const copy = [...old]
              copy[idx] = obj
              return copy
            }
            return [...old, obj]
          }
          case 'MODIFIED':
            return old.map((i) => (i.name === obj.name && i.namespace === obj.namespace ? obj : i))
          case 'DELETED':
            return old.filter((i) => !(i.name === obj.name && i.namespace === obj.namespace))
        }
      }

      // Map resourceType -> tRPC utils setter
      // Uses the correct tRPC router key + method name from routers/index.ts
      const obj = event.object as any
      switch (event.resourceType) {
        case 'pods':
          utils.pods.list.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
        case 'deployments':
          utils.deployments.listDetail.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
        case 'services':
          utils.services.list.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          utils.services.listDetail.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
        case 'nodes':
          utils.nodes.listLive.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
        case 'configmaps':
          utils.configMaps.list.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
        case 'secrets':
          utils.secrets.list.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
        case 'pvcs':
          utils.pvcs.list.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
        case 'namespaces':
          utils.namespaces.list.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
        case 'events':
          utils.events.list.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
        case 'ingresses':
          utils.ingresses.list.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
        case 'statefulsets':
          utils.statefulSets.list.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
        case 'daemonsets':
          utils.daemonSets.list.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
        case 'jobs':
          utils.jobs.list.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
        case 'cronjobs':
          utils.cronJobs.list.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
        case 'hpa':
          utils.hpa.list.setData({ clusterId: clusterId! }, (old) =>
            applyToList(old, obj, event.type),
          )
          break
      }
    },
    [clusterId, utils],
  )

  useEffect(() => {
    if (!clusterId) return
    setConnectionState('initializing')

    const url = `/api/resources/stream?clusterId=${encodeURIComponent(clusterId)}`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onopen = () => {
      setConnectionState('connected')
    }

    es.addEventListener('watch', (e: MessageEvent) => {
      try {
        const batch: WatchEventBatch = JSON.parse(e.data)
        for (const event of batch.events) {
          applyWatchEvent(event)
        }
      } catch {
        // Ignore parse errors
      }
    })

    es.addEventListener('status', (e: MessageEvent) => {
      try {
        const status: WatchStatusEvent = JSON.parse(e.data)
        if (status.state === 'reconnecting') setConnectionState('reconnecting')
        else if (status.state === 'disconnected') setConnectionState('disconnected')
        else if (status.state === 'connected') setConnectionState('connected')
      } catch {
        /* ignore */
      }
    })

    es.onerror = () => {
      if (es.readyState === EventSource.CONNECTING) {
        setConnectionState('reconnecting')
      } else if (es.readyState === EventSource.CLOSED) {
        setConnectionState('disconnected')
      }
    }

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [clusterId, applyWatchEvent])

  return { connectionState }
}
