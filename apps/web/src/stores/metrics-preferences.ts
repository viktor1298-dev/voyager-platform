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
    },
  ),
)
