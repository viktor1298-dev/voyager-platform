import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MetricsRange } from '@/components/metrics/TimeRangeSelector'
import type { RefreshInterval } from '@/components/metrics/AutoRefreshToggle'

interface MetricsPreferencesState {
  range: MetricsRange
  autoRefresh: boolean
  refreshInterval: RefreshInterval
  setRange: (range: MetricsRange) => void
  setAutoRefresh: (enabled: boolean) => void
  setRefreshInterval: (interval: RefreshInterval) => void
}

export const useMetricsPreferences = create<MetricsPreferencesState>()(
  persist(
    (set) => ({
      range: '24h',
      autoRefresh: true,
      refreshInterval: 60000,
      setRange: (range) => set({ range }),
      setAutoRefresh: (autoRefresh) => set({ autoRefresh }),
      setRefreshInterval: (refreshInterval) => set({ refreshInterval }),
    }),
    {
      name: 'voyager-metrics-preferences',
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>
        if (version < 2) {
          const validRanges = ['5m', '15m', '30m', '1h', '3h', '6h', '12h', '24h', '2d', '7d']
          if (!validRanges.includes(state.range as string)) {
            state.range = '24h'
          }
        }
        return state as unknown as MetricsPreferencesState
      },
    },
  ),
)
