'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const TimeAgoCtx = createContext(0)

export function TimeAgoProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  return <TimeAgoCtx.Provider value={tick}>{children}</TimeAgoCtx.Provider>
}

export function useTimeAgoTick(): number {
  return useContext(TimeAgoCtx)
}
