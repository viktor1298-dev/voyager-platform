'use client'

import { useEffect, useRef } from 'react'
import type { ResourceChangeEvent, ResourceType } from '@voyager/types'
import { trpc } from '@/lib/trpc'

/**
 * Maps SSE ResourceType values to tRPC router keys for cache invalidation.
 * The router keys must match the keys in appRouter (routers/index.ts).
 */
const RESOURCE_INVALIDATION_MAP: Record<ResourceType, string> = {
  pods: 'pods',
  deployments: 'deployments',
  statefulsets: 'statefulSets',
  daemonsets: 'daemonSets',
  services: 'services',
  ingresses: 'ingresses',
  jobs: 'jobs',
  cronjobs: 'cronJobs',
  hpa: 'hpa',
  configmaps: 'configMaps',
  secrets: 'secrets',
  pvcs: 'pvcs',
  namespaces: 'namespaces',
  events: 'events',
  nodes: 'nodes',
}

/** Debounce window for batching tRPC cache invalidations (ms) */
const INVALIDATION_DEBOUNCE_MS = 1_000

/**
 * SSE hook that subscribes to /api/resources/stream for a cluster
 * and automatically invalidates tRPC query cache when resources change.
 *
 * Placed once in the cluster layout — all tabs get live updates for free.
 * Uses EventSource (auto-reconnects on error) with cookie auth.
 */
export function useResourceSSE(clusterId: string | null) {
  const utils = trpc.useUtils()
  const eventSourceRef = useRef<EventSource | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingInvalidations = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!clusterId) return

    const url = `/api/resources/stream?clusterId=${encodeURIComponent(clusterId)}`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.addEventListener('resource-change', (e: MessageEvent) => {
      try {
        const events: ResourceChangeEvent[] = JSON.parse(e.data)
        for (const evt of events) {
          const routerKey = RESOURCE_INVALIDATION_MAP[evt.resourceType]
          if (routerKey) pendingInvalidations.current.add(routerKey)
        }
        // Debounce: batch invalidations within 1s window to prevent UI thrashing
        if (!debounceTimerRef.current) {
          debounceTimerRef.current = setTimeout(() => {
            for (const key of pendingInvalidations.current) {
              // Invalidate the list query for the changed resource type
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ;(utils as Record<string, any>)[key]?.list?.invalidate?.({ clusterId })
            }
            pendingInvalidations.current.clear()
            debounceTimerRef.current = null
          }, INVALIDATION_DEBOUNCE_MS)
        }
      } catch {
        // Ignore parse errors from malformed SSE data
      }
    })

    es.onerror = () => {
      // EventSource auto-reconnects on error (built-in browser behavior)
      console.warn('[useResourceSSE] Connection error, auto-reconnecting...')
    }

    return () => {
      es.close()
      eventSourceRef.current = null
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      pendingInvalidations.current.clear()
    }
  }, [clusterId, utils])
}
