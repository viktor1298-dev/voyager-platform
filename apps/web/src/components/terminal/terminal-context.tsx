'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export interface TerminalSessionData {
  id: string
  podName: string
  container: string
  namespace: string
  clusterId: string
}

interface TerminalContextValue {
  sessions: TerminalSessionData[]
  activeSessionId: string | null
  openTerminal: (session: Omit<TerminalSessionData, 'id'>) => void
  closeSession: (id: string) => void
  setActiveSession: (id: string) => void
  isDrawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
}

const TerminalContext = createContext<TerminalContextValue | null>(null)

export function TerminalProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<TerminalSessionData[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [isDrawerOpen, setDrawerOpen] = useState(false)

  const openTerminal = useCallback((session: Omit<TerminalSessionData, 'id'>) => {
    const id = crypto.randomUUID()
    const newSession: TerminalSessionData = { ...session, id }
    setSessions((prev) => [...prev, newSession])
    setActiveSessionId(id)
    setDrawerOpen(true)
  }, [])

  const closeSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id)
        if (next.length === 0) {
          setActiveSessionId(null)
          setDrawerOpen(false)
        } else if (activeSessionId === id) {
          setActiveSessionId(next[next.length - 1].id)
        }
        return next
      })
    },
    [activeSessionId],
  )

  const setActiveSession = useCallback((id: string) => {
    setActiveSessionId(id)
  }, [])

  return (
    <TerminalContext.Provider
      value={{
        sessions,
        activeSessionId,
        openTerminal,
        closeSession,
        setActiveSession,
        isDrawerOpen,
        setDrawerOpen,
      }}
    >
      {children}
    </TerminalContext.Provider>
  )
}

export function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext)
  if (!ctx) {
    throw new Error('useTerminal must be used within a TerminalProvider')
  }
  return ctx
}
