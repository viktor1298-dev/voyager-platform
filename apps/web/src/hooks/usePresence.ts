'use client'

import { useQuery } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef } from 'react'
import { AWAY_AFTER_MS, type PresenceUser, usePresenceStore } from '@/stores/presence'

interface PresenceEventPayload {
  type?: 'snapshot' | 'upsert' | 'remove'
  user?: Partial<PresenceUser> & { userId?: string; page?: string; heartbeatAt?: number }
  users?: Array<Partial<PresenceUser> & { userId?: string; page?: string; heartbeatAt?: number }>
  userId?: string
}

function mapIncomingUser(user: Partial<PresenceUser> & { userId?: string; page?: string; heartbeatAt?: number }): PresenceUser | null {
  const id = user.id ?? user.userId
  if (!id) return null

  return {
    id,
    name: user.name ?? 'Unknown user',
    currentPage: user.currentPage ?? user.page ?? '/',
    avatarUrl: user.avatarUrl,
    lastHeartbeatAt: user.lastHeartbeatAt ?? user.heartbeatAt ?? Date.now(),
  }
}

async function fetchPresenceInitial(): Promise<PresenceUser[]> {
  const response = await fetch('/trpc/presence.list', {
    method: 'GET',
    credentials: 'include',
  })

  if (!response.ok) return []

  const data = (await response.json()) as {
    result?: { data?: { json?: unknown[]; onlineUsers?: unknown[] } }
  }

  const rawUsers = data.result?.data?.onlineUsers ?? data.result?.data?.json ?? []
  if (!Array.isArray(rawUsers)) return []

  return rawUsers
    .map((user) => mapIncomingUser((user as PresenceUser) ?? {}))
    .filter((user): user is PresenceUser => user !== null)
}

export function usePresence() {
  const pathname = usePathname()
  const lastHeartbeatRef = useRef(Date.now())
  const setOnlineUsers = usePresenceStore((s) => s.setOnlineUsers)
  const upsertUser = usePresenceStore((s) => s.upsertUser)
  const removeUser = usePresenceStore((s) => s.removeUser)
  const setMyStatus = usePresenceStore((s) => s.setMyStatus)

  const initialPresenceQuery = useQuery({
    queryKey: ['presence', 'initial'],
    queryFn: fetchPresenceInitial,
    staleTime: 15_000,
    refetchInterval: 45_000,
  })

  useEffect(() => {
    if (!initialPresenceQuery.data) return
    setOnlineUsers(initialPresenceQuery.data)
  }, [initialPresenceQuery.data, setOnlineUsers])

  useEffect(() => {
    const eventSource = new EventSource('/trpc/presence.subscribe', { withCredentials: true })

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as PresenceEventPayload

        if (payload.type === 'snapshot' && payload.users) {
          const users = payload.users
            .map((user) => mapIncomingUser(user))
            .filter((user): user is PresenceUser => user !== null)
          setOnlineUsers(users)
          return
        }

        if (payload.type === 'remove') {
          const id = payload.userId ?? payload.user?.id ?? payload.user?.userId
          if (id) removeUser(id)
          return
        }

        const mappedUser = payload.user ? mapIncomingUser(payload.user) : null
        if (mappedUser) upsertUser(mappedUser)
      } catch {
        // no-op: ignore malformed event payloads
      }
    }

    return () => eventSource.close()
  }, [removeUser, setOnlineUsers, upsertUser])

  useEffect(() => {
    const sendHeartbeat = async () => {
      await fetch('/trpc/presence.heartbeat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPage: pathname }),
      }).catch(() => undefined)

      lastHeartbeatRef.current = Date.now()
      setMyStatus('online')
    }

    void sendHeartbeat()
    const interval = setInterval(() => {
      void sendHeartbeat()
    }, 30_000)

    return () => clearInterval(interval)
  }, [pathname])

  useEffect(() => {
    const interval = setInterval(() => {
      const isAway = Date.now() - lastHeartbeatRef.current > AWAY_AFTER_MS
      setMyStatus(isAway ? 'away' : 'online')
    }, 5_000)

    return () => clearInterval(interval)
  }, [setMyStatus])

  const state = usePresenceStore((s) => ({
    onlineUsers: s.onlineUsers,
    myStatus: s.myStatus,
  }))

  const usersWithStatus = useMemo(
    () =>
      state.onlineUsers.map((user) => ({
        ...user,
        status: Date.now() - user.lastHeartbeatAt > AWAY_AFTER_MS ? ('away' as const) : ('online' as const),
      })),
    [state.onlineUsers],
  )

  return {
    onlineUsers: usersWithStatus,
    myStatus: state.myStatus,
  }
}
