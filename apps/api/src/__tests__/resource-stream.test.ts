import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mock state ────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const { EventEmitter: EE } = require('node:events')
  const emitter = new EE()
  emitter.setMaxListeners(100)

  return {
    getSession: vi.fn(),
    dbSelectResult: vi.fn(),
    watchSubscribe: vi.fn().mockResolvedValue(undefined),
    watchUnsubscribe: vi.fn(),
    watchIsWatching: vi.fn().mockReturnValue(true),
    emitter,
  }
})

// Mock auth module
vi.mock('../lib/auth.js', () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
    },
  },
}))

// Mock @voyager/db
vi.mock('@voyager/db', () => {
  const clusters = { id: 'id' }
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => mocks.dbSelectResult()),
        }),
      }),
    },
    clusters,
    eq: vi.fn(),
  }
})

// Mock connection-tracker
vi.mock('../lib/connection-tracker.js', () => ({
  trackConnection: vi.fn(),
  ConnectionLimiter: class {
    add() {
      return true
    }
    remove() {}
    has() {
      return false
    }
  },
}))

// Mock watch-manager (new unified WatchManager from Plan 01)
vi.mock('../lib/watch-manager.js', () => ({
  watchManager: {
    subscribe: mocks.watchSubscribe,
    unsubscribe: mocks.watchUnsubscribe,
    isWatching: mocks.watchIsWatching,
    getResources: vi.fn().mockReturnValue(null),
    isConnected: vi.fn().mockReturnValue(true),
  },
  RESOURCE_DEFS: [],
}))

// Mock event-emitter with a real EventEmitter (hoisted)
vi.mock('../lib/event-emitter.js', () => ({
  voyagerEmitter: mocks.emitter,
}))

import type { WatchEvent, WatchEventBatch, WatchStatusEvent } from '@voyager/types'
import Fastify, { type FastifyInstance } from 'fastify'
import { handleResourceStream, registerResourceStreamRoute } from '../routes/resource-stream.js'

const VALID_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

// ── Helper: Create mock Fastify request/reply for handler testing ──
function createMockRequestReply(clusterId: string) {
  const writes: string[] = []
  const rawRequest = new EventEmitter()
  const rawReply = new EventEmitter()

  const request = {
    query: { clusterId },
    headers: { authorization: 'Bearer test' },
    raw: rawRequest,
  }

  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn(),
    hijack: vi.fn(),
    raw: Object.assign(rawReply, {
      writeHead: vi.fn(),
      write: vi.fn((data: string) => {
        writes.push(data)
        return true
      }),
      end: vi.fn(),
    }),
  }

  return { request, reply, writes, rawRequest }
}

describe('resource-stream SSE route (data-carrying)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.emitter.removeAllListeners()
    app = Fastify({ logger: false })
    await registerResourceStreamRoute(app)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  // ── Auth & Validation (uses Fastify inject) ────────────────

  it('returns 401 without auth', async () => {
    mocks.getSession.mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/resources/stream?clusterId=${VALID_UUID}`,
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 400 without clusterId', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources/stream',
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 404 for non-existent cluster', async () => {
    mocks.getSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: { id: 'user-1', role: 'admin' },
    })
    mocks.dbSelectResult.mockResolvedValue([])

    const response = await app.inject({
      method: 'GET',
      url: `/api/resources/stream?clusterId=${VALID_UUID}`,
    })

    expect(response.statusCode).toBe(404)
  })

  // ── SSE Behavior (uses handler directly with mocked request/reply) ──

  describe('SSE handler behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      // Set up auth and DB mocks for all SSE tests
      mocks.getSession.mockResolvedValue({
        session: { id: 'sess-1' },
        user: { id: 'user-1', role: 'admin' },
      })
      mocks.dbSelectResult.mockResolvedValue([{ id: VALID_UUID }])
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('calls watchManager.subscribe on valid connection', async () => {
      const { request, reply, rawRequest } = createMockRequestReply(VALID_UUID)
      await handleResourceStream(request as any, reply as any)

      expect(mocks.watchSubscribe).toHaveBeenCalledWith(VALID_UUID)

      // Cleanup
      rawRequest.emit('close')
    })

    it('writes :connected flush immediately after headers', async () => {
      const { request, reply, writes, rawRequest } = createMockRequestReply(VALID_UUID)
      await handleResourceStream(request as any, reply as any)

      expect(reply.raw.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          'content-type': 'text/event-stream; charset=utf-8',
        }),
      )
      expect(writes[0]).toBe(':connected\n\n')

      rawRequest.emit('close')
    })

    it('emits SSE watch events with WatchEventBatch format (event: watch)', async () => {
      const { request, reply, writes, rawRequest } = createMockRequestReply(VALID_UUID)
      await handleResourceStream(request as any, reply as any)

      // Phase 11: no batching — events written immediately
      mocks.emitter.emit(`watch-event:${VALID_UUID}`, {
        type: 'MODIFIED',
        resourceType: 'pods',
        object: { name: 'test-pod', namespace: 'default', status: 'Running' },
      } satisfies WatchEvent)

      // Find the 'event: watch' write (format: event: watch\nid: N\ndata: ...\n\n)
      const watchWrite = writes.find((w) => w.includes('event: watch'))
      expect(watchWrite).toBeTruthy()

      const dataLine = watchWrite!.match(/data: (.+)\n/)
      expect(dataLine).toBeTruthy()

      const batch: WatchEventBatch = JSON.parse(dataLine![1])
      expect(batch.clusterId).toBe(VALID_UUID)
      expect(batch.events).toHaveLength(1)
      expect(batch.events[0].type).toBe('MODIFIED')
      expect(batch.events[0].resourceType).toBe('pods')
      expect(batch.events[0].object).toEqual({
        name: 'test-pod',
        namespace: 'default',
        status: 'Running',
      })
      expect(batch.timestamp).toBeTruthy()

      rawRequest.emit('close')
    })

    it('writes each event immediately (no batching in Phase 11)', async () => {
      const { request, reply, writes, rawRequest } = createMockRequestReply(VALID_UUID)
      await handleResourceStream(request as any, reply as any)

      // Emit 3 events rapidly — Phase 11 writes each one immediately (no batching)
      mocks.emitter.emit(`watch-event:${VALID_UUID}`, {
        type: 'ADDED',
        resourceType: 'pods',
        object: { name: 'pod-1' },
      } satisfies WatchEvent)
      mocks.emitter.emit(`watch-event:${VALID_UUID}`, {
        type: 'MODIFIED',
        resourceType: 'deployments',
        object: { name: 'deploy-1' },
      } satisfies WatchEvent)
      mocks.emitter.emit(`watch-event:${VALID_UUID}`, {
        type: 'DELETED',
        resourceType: 'services',
        object: { name: 'svc-1' },
      } satisfies WatchEvent)

      // Phase 11: each event is a separate SSE message — 3 writes
      const watchWrites = writes.filter((w) => w.includes('event: watch'))
      expect(watchWrites).toHaveLength(3)

      rawRequest.emit('close')
    })

    it('sends status events immediately', async () => {
      const { request, reply, writes, rawRequest } = createMockRequestReply(VALID_UUID)
      await handleResourceStream(request as any, reply as any)

      // Emit a status event
      const statusEvent: WatchStatusEvent = {
        clusterId: VALID_UUID,
        state: 'reconnecting',
        resourceType: 'pods',
        error: 'Connection reset',
      }
      mocks.emitter.emit(`watch-status:${VALID_UUID}`, statusEvent)

      // Status events are immediate — format: event: status\nid: N\ndata: ...\n\n
      const statusWrites = writes.filter((w) => w.includes('event: status'))
      // At least 2: one from the emitted event + one from the isConnected auto-status
      expect(statusWrites.length).toBeGreaterThanOrEqual(1)

      // Find our reconnecting status
      const reconnectingWrite = statusWrites.find((w) => w.includes('reconnecting'))
      expect(reconnectingWrite).toBeTruthy()

      const dataLine = reconnectingWrite!.match(/data: (.+)\n/)
      expect(dataLine).toBeTruthy()

      const parsed: WatchStatusEvent = JSON.parse(dataLine![1])
      expect(parsed.state).toBe('reconnecting')
      expect(parsed.clusterId).toBe(VALID_UUID)
      expect(parsed.error).toBe('Connection reset')

      rawRequest.emit('close')
    })

    it('sends heartbeat events at SSE_HEARTBEAT_INTERVAL_MS', async () => {
      const { request, reply, writes, rawRequest } = createMockRequestReply(VALID_UUID)
      await handleResourceStream(request as any, reply as any)

      // Advance past heartbeat interval (30s)
      await vi.advanceTimersByTimeAsync(30_100)

      // Phase 11: heartbeat is a named event, not a comment
      const heartbeats = writes.filter((w) => w === 'event: heartbeat\ndata: \n\n')
      expect(heartbeats.length).toBeGreaterThanOrEqual(1)

      rawRequest.emit('close')
    })

    it('does NOT suppress ADDED events (no suppression window in Phase 11)', async () => {
      const { request, reply, writes, rawRequest } = createMockRequestReply(VALID_UUID)
      await handleResourceStream(request as any, reply as any)

      // Phase 11: no ADDED suppression — all events written immediately
      mocks.emitter.emit(`watch-event:${VALID_UUID}`, {
        type: 'ADDED',
        resourceType: 'pods',
        object: { name: 'initial-pod' },
      } satisfies WatchEvent)

      mocks.emitter.emit(`watch-event:${VALID_UUID}`, {
        type: 'MODIFIED',
        resourceType: 'pods',
        object: { name: 'modified-pod' },
      } satisfies WatchEvent)

      const watchWrites = writes.filter((w) => w.includes('event: watch'))
      // Both ADDED and MODIFIED should be present
      expect(watchWrites).toHaveLength(2)

      rawRequest.emit('close')
    })

    it('ADDED events are always written regardless of timing', async () => {
      const { request, reply, writes, rawRequest } = createMockRequestReply(VALID_UUID)
      await handleResourceStream(request as any, reply as any)

      // Emit an ADDED event
      mocks.emitter.emit(`watch-event:${VALID_UUID}`, {
        type: 'ADDED',
        resourceType: 'pods',
        object: { name: 'new-pod' },
      } satisfies WatchEvent)

      const watchWrites = writes.filter((w) => w.includes('event: watch'))
      expect(watchWrites).toHaveLength(1)

      const dataLine = watchWrites[0].match(/data: (.+)\n/)
      expect(dataLine).toBeTruthy()
      const batch: WatchEventBatch = JSON.parse(dataLine![1])
      expect(batch.events.some((e) => e.type === 'ADDED')).toBe(true)
      expect(batch.events[0].object).toEqual({ name: 'new-pod' })

      rawRequest.emit('close')
    })

    it('cleans up on connection close', async () => {
      const { request, reply, rawRequest } = createMockRequestReply(VALID_UUID)
      await handleResourceStream(request as any, reply as any)

      // Verify listeners are attached
      expect(mocks.emitter.listenerCount(`watch-event:${VALID_UUID}`)).toBe(1)
      expect(mocks.emitter.listenerCount(`watch-status:${VALID_UUID}`)).toBe(1)

      // Trigger connection close
      rawRequest.emit('close')

      // Verify cleanup
      expect(mocks.watchUnsubscribe).toHaveBeenCalledWith(VALID_UUID)
      expect(mocks.emitter.listenerCount(`watch-event:${VALID_UUID}`)).toBe(0)
      expect(mocks.emitter.listenerCount(`watch-status:${VALID_UUID}`)).toBe(0)
      expect(reply.raw.end).toHaveBeenCalled()
    })
  })
})
