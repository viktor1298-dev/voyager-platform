import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MetricsRange } from '@/components/metrics/TimeRangeSelector'
import type { RefreshInterval } from '@/components/metrics/AutoRefreshToggle'
import { DB_CLUSTER_REFETCH_MS } from '@/lib/cluster-constants'

interface MetricsPreferencesState {
  range: MetricsRange
  customFrom: string | null
  customTo: string | null
  autoRefresh: boolean
  refreshInterval: RefreshInterval
  setRange: (range: MetricsRange) => void
  setCustomRange: (from: string, to: string) => void
  setAutoRefresh: (enabled: boolean) => void
  setRefreshInterval: (interval: RefreshInterval) => void
}

const validRanges: MetricsRange[] = [
  '5m',
  '15m',
  '30m',
  '1h',
  '3h',
  '6h',
  '12h',
  '24h',
  '2d',
  '7d',
  'custom',
]

export const useMetricsPreferences = create<MetricsPreferencesState>()(
  persist(
    (set) => ({
      range: '24h',
      customFrom: null,
      customTo: null,
      autoRefresh: true,
      refreshInterval: DB_CLUSTER_REFETCH_MS as RefreshInterval,
      setRange: (range) => set({ range }),
      setCustomRange: (from, to) =>
        set({ range: 'custom', customFrom: from, customTo: to, autoRefresh: false }),
      setAutoRefresh: (autoRefresh) => set({ autoRefresh }),
      setRefreshInterval: (refreshInterval) => set({ refreshInterval }),
    }),
    {
      name: 'voyager-metrics-preferences',
      version: 3,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>
        if (version < 2) {
          // v0/v1 -> v2: validate range against Grafana-standard set
          const v2Ranges = ['5m', '15m', '30m', '1h', '3h', '6h', '12h', '24h', '2d', '7d']
          if (!v2Ranges.includes(state.range as string)) {
            state.range = '24h'
          }
        }
        if (version < 3) {
          // v2 -> v3: add custom range fields, validate range with 'custom' included
          state.customFrom = null
          state.customTo = null
          if (!validRanges.includes(state.range as MetricsRange)) {
            state.range = '24h'
          }
        }
        return state as unknown as MetricsPreferencesState
      },
    },
  ),
)
