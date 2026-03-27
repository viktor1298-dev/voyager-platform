import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MetricsRange } from '@/components/metrics/TimeRangeSelector'
import type { RefreshInterval } from '@/components/metrics/AutoRefreshToggle'

interface MetricsPreferencesState {
  range: MetricsRange
  autoRefresh: boolean
  refreshInterval: RefreshInterval
  customRangeFrom: string | null
  customRangeTo: string | null
  setRange: (range: MetricsRange) => void
  setAutoRefresh: (enabled: boolean) => void
  setRefreshInterval: (interval: RefreshInterval) => void
  setCustomRange: (from: string, to: string) => void
}

export const useMetricsPreferences = create<MetricsPreferencesState>()(
  persist(
    (set) => ({
      range: '24h',
      autoRefresh: true,
      refreshInterval: 60000,
      customRangeFrom: null,
      customRangeTo: null,
      setRange: (range) => set({ range }),
      setAutoRefresh: (autoRefresh) => set({ autoRefresh }),
      setRefreshInterval: (refreshInterval) => set({ refreshInterval }),
      setCustomRange: (from, to) =>
        set({ range: 'custom' as MetricsRange, customRangeFrom: from, customRangeTo: to }),
    }),
    {
      name: 'voyager-metrics-preferences',
    },
  ),
)
