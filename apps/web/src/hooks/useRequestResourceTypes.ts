'use client'

import { useEffect, useRef } from 'react'
import type { ResourceType } from '@voyager/types'
import { trpc } from '@/lib/trpc'

/**
 * Declare which K8s resource types this page needs.
 * On mount: calls resources.subscribe to start informers for these types.
 * On unmount: calls resources.unsubscribe to release ref counts.
 *
 * React strict mode safe: backend ref counting absorbs double-subscribe gracefully.
 */
export function useRequestResourceTypes(
  clusterId: string | null,
  types: readonly ResourceType[],
): void {
  const subscribeMutation = trpc.resources.subscribe.useMutation()
  const unsubscribeMutation = trpc.resources.unsubscribe.useMutation()
  // Stable ref for mutation to avoid useEffect dependency churn
  const subRef = useRef(subscribeMutation)
  subRef.current = subscribeMutation
  const unsubRef = useRef(unsubscribeMutation)
  unsubRef.current = unsubscribeMutation

  useEffect(() => {
    if (!clusterId || types.length === 0) return

    const typesArr = [...types] as ResourceType[]

    subRef.current.mutate({ clusterId, types: typesArr })

    return () => {
      unsubRef.current.mutate({ clusterId, types: typesArr })
    }
  }, [clusterId, types.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
}
