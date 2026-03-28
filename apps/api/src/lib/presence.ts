import { EventEmitter } from 'node:events'
import { CACHE_TTL } from '@voyager/config'

const PRESENCE_SWEEP_INTERVAL_MS = 15_000
/** Send a keepalive every 25s to prevent proxy/LB idle-connection timeouts (typically 60s) */
const PRESENCE_KEEPALIVE_INTERVAL_MS = 25_000

export interface OnlinePresenceUser {
  id: string
  name: string
  avatar: string | null
  currentPage: string
  lastSeen: string
}

export type PresenceUpdateReason =
  | 'connected'
  | 'disconnected'
  | 'page-changed'
  | 'snapshot'
  | 'keepalive'

export interface PresenceUpdateEvent {
  reason: PresenceUpdateReason
  userId: string
  users: OnlinePresenceUser[]
}

interface PresenceEntry {
  id: string
  name: string
  avatar: string | null
  currentPage: string
  lastSeenTs: number
}

const presenceStore = new Map<string, PresenceEntry>()
const presenceEmitter = new EventEmitter()
presenceEmitter.setMaxListeners(200)

function nowTs() {
  return Date.now()
}

function toOnlineUser(entry: PresenceEntry): OnlinePresenceUser {
  return {
    id: entry.id,
    name: entry.name,
    avatar: entry.avatar,
    currentPage: entry.currentPage,
    lastSeen: new Date(entry.lastSeenTs).toISOString(),
  }
}

function getSortedOnlineUsers(): OnlinePresenceUser[] {
  return [...presenceStore.values()].sort((a, b) => b.lastSeenTs - a.lastSeenTs).map(toOnlineUser)
}

function emitUpdate(reason: PresenceUpdateReason, userId: string) {
  presenceEmitter.emit('presence:update', {
    reason,
    userId,
    users: getSortedOnlineUsers(),
  } satisfies PresenceUpdateEvent)
}

function sweepExpiredUsers() {
  const cutoff = nowTs() - CACHE_TTL.PRESENCE_MS
  let changed = false

  for (const [userId, entry] of presenceStore.entries()) {
    if (entry.lastSeenTs < cutoff) {
      presenceStore.delete(userId)
      emitUpdate('disconnected', userId)
      changed = true
    }
  }

  return changed
}

const sweepTimer = setInterval(() => {
  sweepExpiredUsers()
}, PRESENCE_SWEEP_INTERVAL_MS)

sweepTimer.unref()

export function heartbeatPresence(input: {
  id: string
  name: string
  avatar: string | null
  currentPage: string
}): OnlinePresenceUser {
  const existing = presenceStore.get(input.id)
  const ts = nowTs()

  const nextEntry: PresenceEntry = {
    id: input.id,
    name: input.name,
    avatar: input.avatar,
    currentPage: input.currentPage,
    lastSeenTs: ts,
  }

  presenceStore.set(input.id, nextEntry)

  if (!existing) {
    emitUpdate('connected', input.id)
  } else if (existing.currentPage !== input.currentPage) {
    emitUpdate('page-changed', input.id)
  }

  return toOnlineUser(nextEntry)
}

export function getOnlineUsers(): OnlinePresenceUser[] {
  sweepExpiredUsers()
  return getSortedOnlineUsers()
}

export function subscribeToPresence(
  signal?: AbortSignal,
): AsyncIterableIterator<PresenceUpdateEvent> {
  const queue: PresenceUpdateEvent[] = []
  let resolve: (() => void) | null = null
  let done = false
  let destroyed = false
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null

  const enqueue = (event: PresenceUpdateEvent) => {
    if (destroyed || done) return
    queue.push(event)
    if (resolve) {
      resolve()
      resolve = null
    }
  }

  const cleanup = () => {
    if (destroyed) return
    destroyed = true
    presenceEmitter.off('presence:update', handler)
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer)
      keepaliveTimer = null
    }
  }

  const handler = (event: PresenceUpdateEvent) => {
    try {
      enqueue(event)
    } catch {
      // Guard against writes after cleanup — silently ignore
    }
  }

  presenceEmitter.on('presence:update', handler)

  // Keepalive: send periodic snapshot events to prevent proxy idle-connection timeouts
  keepaliveTimer = setInterval(() => {
    if (destroyed || done) return
    enqueue({
      reason: 'keepalive',
      userId: 'keepalive',
      users: getSortedOnlineUsers(),
    })
  }, PRESENCE_KEEPALIVE_INTERVAL_MS)
  keepaliveTimer.unref()

  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        cleanup()
        done = true
        if (resolve) {
          resolve()
          resolve = null
        }
      },
      { once: true },
    )
  }

  enqueue({
    reason: 'snapshot',
    userId: 'snapshot',
    users: getOnlineUsers(),
  })

  return {
    async next() {
      while (queue.length === 0 && !done) {
        await new Promise<void>((r) => {
          resolve = r
        })
      }

      if (done && queue.length === 0) {
        return { done: true, value: undefined }
      }

      return { done: false, value: queue.shift()! }
    },
    async return() {
      done = true
      cleanup()
      return { done: true, value: undefined }
    },
    async throw() {
      done = true
      cleanup()
      return { done: true, value: undefined }
    },
    [Symbol.asyncIterator]() {
      return this
    },
  }
}
