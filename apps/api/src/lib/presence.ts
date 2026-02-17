import { EventEmitter } from 'node:events'

const PRESENCE_TTL_MS = 60_000
const PRESENCE_SWEEP_INTERVAL_MS = 15_000

export interface OnlinePresenceUser {
  id: string
  name: string
  avatar: string | null
  currentPage: string
  lastSeen: string
}

export type PresenceUpdateReason = 'connected' | 'disconnected' | 'page-changed' | 'snapshot'

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
  return [...presenceStore.values()]
    .sort((a, b) => b.lastSeenTs - a.lastSeenTs)
    .map(toOnlineUser)
}

function emitUpdate(reason: PresenceUpdateReason, userId: string) {
  presenceEmitter.emit('presence:update', {
    reason,
    userId,
    users: getSortedOnlineUsers(),
  } satisfies PresenceUpdateEvent)
}

function sweepExpiredUsers() {
  const cutoff = nowTs() - PRESENCE_TTL_MS
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

export function subscribeToPresence(signal?: AbortSignal): AsyncIterableIterator<PresenceUpdateEvent> {
  const queue: PresenceUpdateEvent[] = []
  let resolve: (() => void) | null = null
  let done = false

  const handler = (event: PresenceUpdateEvent) => {
    queue.push(event)
    if (resolve) {
      resolve()
      resolve = null
    }
  }

  presenceEmitter.on('presence:update', handler)

  if (signal) {
    signal.addEventListener('abort', () => {
      done = true
      presenceEmitter.off('presence:update', handler)
      if (resolve) {
        resolve()
        resolve = null
      }
    })
  }

  queue.push({
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
      presenceEmitter.off('presence:update', handler)
      return { done: true, value: undefined }
    },
    async throw() {
      done = true
      presenceEmitter.off('presence:update', handler)
      return { done: true, value: undefined }
    },
    [Symbol.asyncIterator]() {
      return this
    },
  }
}
