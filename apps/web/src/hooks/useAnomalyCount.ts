import { useMemo } from 'react'
import { MOCK_ANOMALIES, filterOpenAnomalies, getAnomalySeverityCounts } from '@/lib/anomalies'

/**
 * DB-003: Returns anomaly counts from open anomalies.
 * Uses MOCK_ANOMALIES (will be replaced by real API when available).
 */
export function useAnomalyCount() {
  // TODO: Replace empty deps with real data dependency when switching from MOCK_ANOMALIES to API
  return useMemo(() => {
    const open = filterOpenAnomalies(MOCK_ANOMALIES)
    return getAnomalySeverityCounts(open)
  }, [])
}
