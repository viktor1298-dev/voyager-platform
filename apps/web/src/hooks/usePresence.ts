'use client'

import { useQuery } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef } from 'react'
import { AWAY_AFTER_MS, type PresenceUser, usePresenceStore } from '@/stores/presence'

interface BackendPresenceUser {
  id?: string
  userId?: string
  name?: string
  currentPage?: string
  page?: string
  avatar?: string
  lastSeen?: string
}

interface PresenceEventPayload {
  reason?: string
  userId?: string
  users?: BackendPresenceUser[]
}

const RECONNECT_BASE_DELAY_MS = 1_000
const RECONNECT_MAX_DELAY_MS = 15_000

function mapIncomingUser(user: BackendPresenceUser): PresenceUser | null {
  const id = user.id ?? user.userId
  if (!id) return null

  return {
    id,
    name: user.name ?? 'Unknown user',
    currentPage: user.currentPage ?? user.page ?? '/',
    avatar: user.avatar,
    lastSeen: user.lastSeen ?? new Date().toISOString(),
  }
}

async function fetchPresenceInitial(): Promise<PresenceUser[]> {
  const response = await fetch('/trpc/presence.getOnlineUsers', {
    method: 'GET',
    credentials: 'include',
  })

  if (!response.ok) return []

  const data = (await response.json()) as {
    result?: { data?: { json?: unknown; users?: unknown[]; onlineUsers?: unknown[] } }
  }

  const payload = data.result?.data
  const rawUsers = Array.isArray(payload?.users)
    ? payload.users
    : Array.isArray(payload?.json)
      ? payload.json
      : Array.isArray(payload?.onlineUsers)
        ? payload.onlineUsers
        : []

  return rawUsers
    .map((user) => mapIncomingUser((user as BackendPresenceUser) ?? {}))
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
    let eventSource: EventSource | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempts = 0
    let isUnmounted = false

    const clearReconnectTimer = () => {
      if (!reconnectTimeout) return
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }

    const scheduleReconnect = () => {
      if (isUnmounted || reconnectTimeout) return

      const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempts, RECONNECT_MAX_DELAY_MS)
      reconnectAttempts += 1

      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null
        connect()
      }, delay)
    }

    const connect = () => {
      if (isUnmounted) return

      eventSource?.close()
      eventSource = new EventSource('/trpc/presence.subscribe', { withCredentials: true })

      eventSource.onopen = () => {
        reconnectAttempts = 0
        clearReconnectTimer()
      }

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as PresenceEventPayload

          if (Array.isArray(payload.users)) {
            const users = payload.users
              .map((user) => mapIncomingUser(user))
              .filter((user): user is PresenceUser => user !== null)

            if (payload.reason === 'snapshot') {
              setOnlineUsers(users)
              return
            }

            users.forEach((user) => upsertUser(user))
            return
          }

          if (payload.reason === 'remove' || payload.reason === 'offline') {
            if (payload.userId) removeUser(payload.userId)
          }
        } catch {
          // no-op: ignore malformed event payloads
        }
      }

      eventSource.onerror = () => {
        eventSource?.close()
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      isUnmounted = true
      clearReconnectTimer()
      eventSource?.close()
    }
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
  }, [pathname, setMyStatus])

  useEffect(() => {
    const interval = setInterval(() => {
      const isAway = Date.now() - lastHeartbeatRef.current > AWAY_AFTER_MS
      setMyStatus(isAway ? 'away' : 'online')
    }, 5_000)

    return () => clearInterval(interval)
  }, [setMyStatus])

  const onlineUsers = usePresenceStore((s) => s.onlineUsers)
  const myStatus = usePresenceStore((s) => s.myStatus)

  const usersWithStatus = useMemo(
    () =>
      onlineUsers.map((user) => ({
        ...user,
        status: Date.now() - new Date(user.lastSeen).getTime() > AWAY_AFTER_MS ? ('away' as const) : ('online' as const),
      })),
    [onlineUsers],
  )

  return {
    onlineUsers: usersWithStatus,
    myStatus,
  }
}
