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

/**
 * Lens-style SSE hook: subscribes to /api/resources/stream for a cluster
 * and triggers immediate refetch when K8s Watch detects changes.
 *
 * Flow: K8s Watch → informer → SSE → this hook → refetch (Redis cache already cleared by watch)
 * Result: ~500ms-1s update latency (K8s API round-trip only)
 *
 * Placed once in the cluster layout — all tabs get live updates for free.
 */
export function useResourceSSE(clusterId: string | null) {
  const utils = trpc.useUtils()
  const eventSourceRef = useRef<EventSource | null>(null)
  const pendingRef = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)

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
          if (routerKey) pendingRef.current.add(routerKey)
        }
        // Use requestAnimationFrame to batch within same frame but fire ASAP
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            for (const key of pendingRef.current) {
              // refetch forces immediate fetch, bypassing staleTime
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ;(utils as Record<string, any>)[key]?.list?.refetch?.({ clusterId })
            }
            pendingRef.current.clear()
            rafRef.current = null
          })
        }
      } catch {
        // Ignore parse errors from malformed SSE data
      }
    })

    es.onerror = () => {
      console.warn('[useResourceSSE] Connection error, auto-reconnecting...')
    }

    return () => {
      es.close()
      eventSourceRef.current = null
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      pendingRef.current.clear()
    }
  }, [clusterId, utils])
}
