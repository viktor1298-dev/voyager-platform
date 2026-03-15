'use client'

import { useQuery } from '@tanstack/react-query'
import { TRPCClientError, getUntypedClient } from '@trpc/client'
import type { TRPCConnectionState } from '@trpc/client/unstable-internals'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef } from 'react'
import { getTRPCClient, trpc } from '@/lib/trpc'
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

const TRANSIENT_DISCONNECT_WARNING_THRESHOLD = 3
const PERSISTENT_DISCONNECT_ERROR_THRESHOLD = 6

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

function applyPresencePayload(
  payload: PresenceEventPayload,
  options: {
    setOnlineUsers: (users: PresenceUser[]) => void
    upsertUser: (user: PresenceUser) => void
    removeUser: (userId: string) => void
  },
) {
  if (Array.isArray(payload.users)) {
    const users = payload.users
      .map((user) => mapIncomingUser(user))
      .filter((user): user is PresenceUser => user !== null)

    if (payload.reason === 'snapshot') {
      options.setOnlineUsers(users)
      return
    }

    options.setOnlineUsers(users)
    return
  }

  if ((payload.reason === 'remove' || payload.reason === 'offline') && payload.userId) {
    options.removeUser(payload.userId)
  }
}

function isTransientPresenceError(error: unknown) {
  if (!(error instanceof TRPCClientError)) {
    return false
  }

  const code = error.data?.code
  if (code && ['TIMEOUT', 'CLIENT_CLOSED_REQUEST', 'INTERNAL_SERVER_ERROR'].includes(code)) {
    return true
  }

  const message = error.message.toLowerCase()
  return [
    'err_incomplete_chunked_encoding',
    'fetch failed',
    'networkerror',
    'network error',
    'failed to fetch',
    'load failed',
    'stream closed',
    'stream interrupted',
    'the operation was aborted',
    'aborted',
  ].some((fragment) => message.includes(fragment))
}

export function usePresence() {
  const utils = trpc.useUtils()
  const clientRef = useRef(getUntypedClient(getTRPCClient()))
  const pathname = usePathname()
  const lastHeartbeatRef = useRef(Date.now())
  const consecutiveDisconnectsRef = useRef(0)
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
    const subscription = clientRef.current.subscription('presence.subscribe', undefined, {
      onData(payload) {
        consecutiveDisconnectsRef.current = 0
        applyPresencePayload(payload as PresenceEventPayload, {
          setOnlineUsers,
          upsertUser,
          removeUser,
        })
      },
      onConnectionStateChange(state: TRPCConnectionState<TRPCClientError<any>>) {
        if (state.state === 'pending') {
          consecutiveDisconnectsRef.current = 0
          return
        }

        if (state.state !== 'connecting' || !state.error) {
          return
        }

        const attempt = consecutiveDisconnectsRef.current + 1
        consecutiveDisconnectsRef.current = attempt

        if (isTransientPresenceError(state.error)) {
          if (attempt === 1 || attempt === TRANSIENT_DISCONNECT_WARNING_THRESHOLD) {
            console.warn('[presence] subscription disconnected, retrying', {
              attempt,
              message: state.error.message,
            })
          }

          if (attempt >= PERSISTENT_DISCONNECT_ERROR_THRESHOLD) {
            console.error('[presence] subscription still failing after repeated retries', {
              attempt,
              message: state.error.message,
            })
          }

          return
        }

        console.error('[presence] subscription error', state.error)
      },
      onError(error) {
        if (isTransientPresenceError(error)) {
          const attempt = consecutiveDisconnectsRef.current
          if (attempt >= PERSISTENT_DISCONNECT_ERROR_THRESHOLD) {
            console.error('[presence] subscription failed after retry exhaustion', {
              attempt,
              message: error.message,
            })
          }
          return
        }

        console.error('[presence] subscription fatal error', error)
      },
    })

    return () => subscription.unsubscribe()
  }, [removeUser, setOnlineUsers, upsertUser])

  useEffect(() => {
    const sendHeartbeat = async () => {
      await utils.client.mutation('presence.heartbeat', { currentPage: pathname, avatar: null }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[presence] heartbeat failed', { message })
      })

      lastHeartbeatRef.current = Date.now()
      setMyStatus('online')
    }

    void sendHeartbeat()
    const interval = setInterval(() => {
      void sendHeartbeat()
    }, 30_000)

    return () => clearInterval(interval)
  }, [pathname, setMyStatus, utils.client])

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
