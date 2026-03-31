'use client'

import { createContext, useContext, useRef, useCallback, useEffect, useMemo, useState } from 'react'

interface CrosshairState {
  /** The active timestamp (ISO string) being hovered, or null when not hovering */
  activeTimestamp: string | null
  /** The active X coordinate (pixel offset within the chart area), or null */
  activeX: number | null
  /** Update the crosshair position — throttled via requestAnimationFrame */
  setPosition: (timestamp: string | null, x: number | null) => void
  /** Clear the crosshair (mouse leave) */
  clear: () => void
}

const CrosshairContext = createContext<CrosshairState | null>(null)

export function CrosshairProvider({ children }: { children: React.ReactNode }) {
  const [activeTimestamp, setActiveTimestamp] = useState<string | null>(null)
  const [activeX, setActiveX] = useState<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef<{ timestamp: string | null; x: number | null } | null>(null)

  const setPosition = useCallback((timestamp: string | null, x: number | null) => {
    pendingRef.current = { timestamp, x }

    if (rafRef.current !== null) return

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const pending = pendingRef.current
      if (pending) {
        setActiveTimestamp(pending.timestamp)
        setActiveX(pending.x)
        pendingRef.current = null
      }
    })
  }, [])

  const clear = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    pendingRef.current = null
    setActiveTimestamp(null)
    setActiveX(null)
  }, [])

  // Cancel any pending rAF on unmount to avoid state updates after unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  const value = useMemo(
    () => ({ activeTimestamp, activeX, setPosition, clear }),
    [activeTimestamp, activeX, setPosition, clear],
  )

  return <CrosshairContext.Provider value={value}>{children}</CrosshairContext.Provider>
}

export function useCrosshair(): CrosshairState {
  const ctx = useContext(CrosshairContext)
  if (!ctx) {
    throw new Error('useCrosshair must be used within a <CrosshairProvider>')
  }
  return ctx
}

/**
 * Safe variant that returns null when not inside a CrosshairProvider.
 * Use this in components that may render both inside and outside the provider.
 */
export function useCrosshairOptional(): CrosshairState | null {
  return useContext(CrosshairContext)
}
