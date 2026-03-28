'use client'

import { useRouter, useParams } from 'next/navigation'
import { useCallback } from 'react'

/**
 * Hook for cross-resource navigation within a cluster detail view.
 * Navigates to a specific tab (e.g. pods, services) and optionally highlights a resource.
 */
export function useResourceNavigation() {
  const router = useRouter()
  const { id: routeSegment } = useParams<{ id: string }>()

  const navigateToResource = useCallback(
    (tab: string, resourceKey: string) => {
      const highlight = encodeURIComponent(resourceKey)
      router.push(`/clusters/${routeSegment}/${tab}?highlight=${highlight}`)
    },
    [router, routeSegment],
  )

  const navigateToTab = useCallback(
    (tab: string) => {
      router.push(`/clusters/${routeSegment}/${tab}`)
    },
    [router, routeSegment],
  )

  return { navigateToResource, navigateToTab }
}
