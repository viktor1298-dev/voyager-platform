'use client'

import { createContext, useContext } from 'react'
import type { RefreshIntervalMs } from '@/hooks/useRefreshInterval'

interface DashboardRefreshContextValue {
  intervalMs: RefreshIntervalMs
}

const DashboardRefreshContext = createContext<DashboardRefreshContextValue>({
  intervalMs: 300_000, // default 5min
})

export function DashboardRefreshProvider({
  children,
  intervalMs,
}: {
  children: React.ReactNode
  intervalMs: RefreshIntervalMs
}) {
  return (
    <DashboardRefreshContext.Provider value={{ intervalMs }}>
      {children}
    </DashboardRefreshContext.Provider>
  )
}

/**
 * Returns the user-configured dashboard refresh interval in milliseconds.
 * Falls back to 5 minutes if not inside a DashboardRefreshProvider.
 */
export function useDashboardRefreshInterval(): RefreshIntervalMs {
  return useContext(DashboardRefreshContext).intervalMs
}
