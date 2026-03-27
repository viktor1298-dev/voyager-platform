'use client'

import { useCallback } from 'react'
import type { SSEConnectionState } from '@voyager/types'
import { trpc } from '../lib/trpc.js'
import type { MetricsRange, ApiMetricsRange } from '../components/metrics/TimeRangeSelector.js'
import type { MetricsDataPoint } from '../components/metrics/MetricsAreaChart.js'
import { useMetricsSSE } from './useMetricsSSE.js'

type DataSourceMode = 'live' | 'historical' | 'custom'

interface UseMetricsDataReturn {
  data: MetricsDataPoint[]
  isLoading: boolean
  isError: boolean
  isLive: boolean
  connectionState: SSEConnectionState
  lastUpdated: number | null
  error: { message: string } | null
  refetch: () => void
}

/** SSE parameters derived from the selected range. */
const SSE_RANGE_CONFIG: Record<'5m' | '15m', { maxPoints: number; rangeMs: number }> = {
  '5m': { maxPoints: 25, rangeMs: 5 * 60_000 },
  '15m': { maxPoints: 65, rangeMs: 15 * 60_000 },
}

/**
 * Unified data hook that abstracts SSE (live) vs tRPC (historical) data sources.
 * For 5m/15m ranges, data comes from the SSE streaming endpoint.
 * For 30m+ ranges, data comes from the tRPC metrics.history query.
 * For 'custom' ranges, the query is disabled until backend custom range support is added.
 * Consumers see a single interface regardless of data source (TIME-04).
 */
export function useMetricsData(clusterId: string, range: MetricsRange): UseMetricsDataReturn {
  const mode: DataSourceMode =
    range === '5m' || range === '15m' ? 'live' : range === 'custom' ? 'custom' : 'historical'
  const isLive = mode === 'live'
  const isCustom = mode === 'custom'

  // SSE parameters (only used when live)
  const sseConfig = isLive
    ? SSE_RANGE_CONFIG[range as '5m' | '15m']
    : { maxPoints: 25, rangeMs: 5 * 60_000 }

  // Live data via SSE
  const liveData = useMetricsSSE(clusterId, {
    enabled: isLive,
    maxPoints: sseConfig.maxPoints,
    rangeMs: sseConfig.rangeMs,
  })

  // Historical data via tRPC (disabled for live and custom ranges)
  const apiRange = isCustom ? '24h' : (range as ApiMetricsRange)
  const historyQuery = trpc.metrics.history.useQuery(
    { clusterId, range: apiRange },
    {
      enabled: !isLive && !isCustom,
      staleTime: 30_000,
      retry: 2,
    },
  )

  const noop = useCallback(() => {}, [])

  // Unified return shape
  if (isLive) {
    return {
      data: liveData.points,
      isLoading: !liveData.hasData && liveData.connectionState === 'connecting',
      isError: liveData.connectionState === 'disconnected' && !liveData.hasData,
      isLive: true,
      connectionState: liveData.connectionState,
      lastUpdated: liveData.lastTimestamp,
      error: null,
      refetch: noop,
    }
  }

  // Custom range: backend support not yet implemented
  if (isCustom) {
    return {
      data: [],
      isLoading: false,
      isError: false,
      isLive: false,
      connectionState: 'disconnected' as SSEConnectionState,
      lastUpdated: null,
      error: null,
      refetch: noop,
    }
  }

  return {
    data: historyQuery.data?.data ?? [],
    isLoading: historyQuery.isLoading,
    isError: historyQuery.isError,
    isLive: false,
    connectionState: 'disconnected' as SSEConnectionState,
    lastUpdated: historyQuery.dataUpdatedAt || null,
    error: historyQuery.error ?? null,
    refetch: historyQuery.refetch,
  }
}
