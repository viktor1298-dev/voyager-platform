'use client'

import { useQuery } from '@tanstack/react-query'
import { TRPCClientError } from '@trpc/client'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'
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

/** Fix #6: Exponential backoff config for SSE presence reconnect */
const BACKOFF_BASE_MS = 2_000
const BACKOFF_MAX_MS = 60_000
const BACKOFF_JITTER_MS = 1_000

/** SSE fallback: after this many consecutive failures, switch to polling-only mode */
const SSE_FALLBACK_THRESHOLD = 3
/** Periodic recovery interval: try SSE again every 5 minutes while in fallback */
const SSE_RECOVERY_INTERVAL_MS = 5 * 60 * 1_000

function getBackoffDelay(attempt: number): number {
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS)
  const jitter = Math.random() * BACKOFF_JITTER_MS
  return delay + jitter
}

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
  const pathname = usePathname()
  const lastHeartbeatRef = useRef(Date.now())
  const consecutiveDisconnectsRef = useRef(0)
  const failureCountRef = useRef(0)
  const [useFallbackPolling, setUseFallbackPolling] = useState(false)
  const [sseEnabled, setSseEnabled] = useState(true)
  const setOnlineUsers = usePresenceStore((s) => s.setOnlineUsers)
  const upsertUser = usePresenceStore((s) => s.upsertUser)
  const removeUser = usePresenceStore((s) => s.removeUser)
  const setMyStatus = usePresenceStore((s) => s.setMyStatus)

  const heartbeatMutation = trpc.presence.heartbeat.useMutation()
  const heartbeatRef = useRef(heartbeatMutation)
  heartbeatRef.current = heartbeatMutation

  const initialPresenceQuery = useQuery({
    queryKey: ['presence', 'initial'],
    queryFn: fetchPresenceInitial,
    staleTime: 15_000,
    refetchInterval: 45_000,
    retry: 3,
    retryDelay: (attempt) => getBackoffDelay(attempt),
  })

  useEffect(() => {
    if (!initialPresenceQuery.data) return
    setOnlineUsers(initialPresenceQuery.data)
  }, [initialPresenceQuery.data, setOnlineUsers])

  const handleSubscriptionError = useCallback((error: unknown) => {
    if (isTransientPresenceError(error)) {
      failureCountRef.current += 1
      if (failureCountRef.current >= SSE_FALLBACK_THRESHOLD) {
        console.warn('[presence] SSE failed repeatedly, switching to polling fallback')
        setSseEnabled(false)
        setUseFallbackPolling(true)
      }
      return
    }
    failureCountRef.current += 1
    if (failureCountRef.current >= SSE_FALLBACK_THRESHOLD) {
      setSseEnabled(false)
      setUseFallbackPolling(true)
    }
  }, [])

  trpc.presence.subscribe.useSubscription(undefined, {
    enabled: sseEnabled && !useFallbackPolling,
    onData(payload) {
      consecutiveDisconnectsRef.current = 0
      failureCountRef.current = 0
      applyPresencePayload(payload as PresenceEventPayload, {
        setOnlineUsers,
        upsertUser,
        removeUser,
      })
    },
    onError(error) {
      handleSubscriptionError(error)
    },
  })

  // SSE recovery: when in fallback polling mode, attempt to recover SSE on
  // network restore, tab visibility change, or periodically every 5 minutes.
  useEffect(() => {
    if (!useFallbackPolling) return

    const tryRecovery = () => {
      console.info('[presence] Attempting SSE recovery...')
      failureCountRef.current = 0
      consecutiveDisconnectsRef.current = 0
      setSseEnabled(true)
      setUseFallbackPolling(false)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') tryRecovery()
    }

    // Recovery on network restore
    window.addEventListener('online', tryRecovery)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Periodic recovery every 5 minutes
    const timer = setInterval(tryRecovery, SSE_RECOVERY_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', tryRecovery)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(timer)
    }
  }, [useFallbackPolling])

  useEffect(() => {
    const sendHeartbeat = () => {
      heartbeatRef.current.mutate(
        { currentPage: pathname, avatar: null },
        {
          onSuccess() {
            lastHeartbeatRef.current = Date.now()
            setMyStatus('online')
          },
        },
      )
    }

    sendHeartbeat()
    const interval = setInterval(sendHeartbeat, 30_000)

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
