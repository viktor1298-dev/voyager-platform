'use client'

import { useQuery } from '@tanstack/react-query'
import { TRPCClientError, getUntypedClient } from '@trpc/client'
import type { TRPCConnectionState } from '@trpc/client/unstable-internals'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

/** Number of consecutive SSE failures before falling back to polling */
const SSE_FALLBACK_THRESHOLD = 3
/** Polling interval when in fallback mode (ms) */
const FALLBACK_POLL_INTERVAL_MS = 15_000
/** Only log at these thresholds to avoid console flooding */
const TRANSIENT_DISCONNECT_WARNING_THRESHOLD = 3

/** Exponential backoff config for SSE presence reconnect */
const BACKOFF_BASE_MS = 1_000
const BACKOFF_MAX_MS = 30_000
const BACKOFF_JITTER_MS = 500

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

    if (payload.reason === 'snapshot' || payload.reason === 'keepalive') {
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

function isTransientPresenceError(error: unknown): boolean {
  // AbortError is always transient (tab close, navigation, cleanup)
  if (error instanceof Error && error.name === 'AbortError') return true
  if (error instanceof DOMException && error.name === 'AbortError') return true

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
  const [useFallbackPolling, setUseFallbackPolling] = useState(false)
  const setOnlineUsers = usePresenceStore((s) => s.setOnlineUsers)
  const upsertUser = usePresenceStore((s) => s.upsertUser)
  const removeUser = usePresenceStore((s) => s.removeUser)
  const setMyStatus = usePresenceStore((s) => s.setMyStatus)

  // ── Initial fetch (always active) ──────────────────────────────────
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

  // ── Fallback polling (active only when SSE fails repeatedly) ───────
  const fallbackPollQuery = useQuery({
    queryKey: ['presence', 'fallback-poll'],
    queryFn: fetchPresenceInitial,
    enabled: useFallbackPolling,
    refetchInterval: FALLBACK_POLL_INTERVAL_MS,
    staleTime: 10_000,
    retry: 2,
    retryDelay: (attempt) => getBackoffDelay(attempt),
  })

  useEffect(() => {
    if (!fallbackPollQuery.data || !useFallbackPolling) return
    setOnlineUsers(fallbackPollQuery.data)
  }, [fallbackPollQuery.data, useFallbackPolling, setOnlineUsers])

  // ── SSE subscription (disabled when in fallback mode) ──────────────
  const handleSSEFailure = useCallback((attempt: number) => {
    if (attempt >= SSE_FALLBACK_THRESHOLD) {
      setUseFallbackPolling(true)
    }
  }, [])

  useEffect(() => {
    // Don't subscribe via SSE if we've fallen back to polling
    if (useFallbackPolling) return

    const subscription = clientRef.current.subscription('presence.subscribe', undefined, {
      onData(payload) {
        // Successful data — reset disconnect counter
        consecutiveDisconnectsRef.current = 0
        applyPresencePayload(payload as PresenceEventPayload, {
          setOnlineUsers,
          upsertUser,
          removeUser,
        })
      },
      onConnectionStateChange(state: TRPCConnectionState<TRPCClientError<any>>) {
        if (state.state === 'pending') {
          // Connection established — reset counter
          consecutiveDisconnectsRef.current = 0
          return
        }

        if (state.state !== 'connecting' || !state.error) {
          return
        }

        const attempt = consecutiveDisconnectsRef.current + 1
        consecutiveDisconnectsRef.current = attempt

        if (isTransientPresenceError(state.error)) {
          // Only log once at the warning threshold — suppress all other noise
          if (attempt === TRANSIENT_DISCONNECT_WARNING_THRESHOLD) {
            console.warn(
              `[presence] SSE disconnected ${attempt} times, switching to polling fallback`,
              { message: state.error.message },
            )
          }
          handleSSEFailure(attempt)
          return
        }

        // Non-transient errors: log once and trigger fallback
        if (attempt === 1) {
          console.warn('[presence] subscription unavailable, falling back to polling', {
            message: state.error.message,
          })
        }
        handleSSEFailure(attempt)
      },
      onError(error) {
        // Suppress all transient errors from console
        if (isTransientPresenceError(error)) {
          const attempt = consecutiveDisconnectsRef.current + 1
          consecutiveDisconnectsRef.current = attempt
          handleSSEFailure(attempt)
          return
        }

        // Non-transient: log once
        console.warn('[presence] subscription error', { message: (error as Error).message })
      },
    })

    return () => subscription.unsubscribe()
  }, [useFallbackPolling, removeUser, setOnlineUsers, upsertUser, handleSSEFailure])

  // ── Heartbeat (always active) ──────────────────────────────────────
  useEffect(() => {
    const sendHeartbeat = async () => {
      await utils.client.mutation('presence.heartbeat', { currentPage: pathname, avatar: null }).catch(() => {
        // Silently swallow heartbeat failures — transient SSE/chunked encoding errors
        // are expected and should not flood the console
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

  // ── Away detection ─────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const isAway = Date.now() - lastHeartbeatRef.current > AWAY_AFTER_MS
      setMyStatus(isAway ? 'away' : 'online')
    }, 5_000)

    return () => clearInterval(interval)
  }, [setMyStatus])

  // ── Return value ───────────────────────────────────────────────────
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
