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

// Mock watch-manager (new unified WatchManager from Plan 01)
vi.mock('../lib/watch-manager.js', () => ({
  watchManager: {
    subscribe: mocks.watchSubscribe,
    unsubscribe: mocks.watchUnsubscribe,
    isWatching: mocks.watchIsWatching,
  },
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

      // Skip past initial load window
      await vi.advanceTimersByTimeAsync(5_100)

      // Emit a watch event
      mocks.emitter.emit(`watch-event:${VALID_UUID}`, {
        type: 'MODIFIED',
        resourceType: 'pods',
        object: { name: 'test-pod', namespace: 'default', status: 'Running' },
      } satisfies WatchEvent)

      // Advance past batch buffer (1000ms)
      await vi.advanceTimersByTimeAsync(1_100)

      // Find the 'event: watch' write
      const watchWrite = writes.find((w) => w.startsWith('event: watch'))
      expect(watchWrite).toBeTruthy()

      const dataLine = watchWrite!.match(/event: watch\ndata: (.+)\n/)
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

    it('batches multiple events within 1 second into a single SSE message', async () => {
      const { request, reply, writes, rawRequest } = createMockRequestReply(VALID_UUID)
      await handleResourceStream(request as any, reply as any)

      // Skip initial load window
      await vi.advanceTimersByTimeAsync(5_100)

      // Emit 3 events rapidly
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

      // Advance past batch buffer
      await vi.advanceTimersByTimeAsync(1_100)

      // Should have exactly ONE 'event: watch' write (all batched together)
      const watchWrites = writes.filter((w) => w.startsWith('event: watch'))
      expect(watchWrites).toHaveLength(1)

      const dataLine = watchWrites[0].match(/event: watch\ndata: (.+)\n/)
      const batch: WatchEventBatch = JSON.parse(dataLine![1])
      expect(batch.events).toHaveLength(3)
      expect(batch.events[0].type).toBe('ADDED')
      expect(batch.events[1].type).toBe('MODIFIED')
      expect(batch.events[2].type).toBe('DELETED')

      rawRequest.emit('close')
    })

    it('sends status events immediately (not batched)', async () => {
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

      // Status events are immediate — no need to advance batch timer
      const statusWrite = writes.find((w) => w.startsWith('event: status'))
      expect(statusWrite).toBeTruthy()

      const dataLine = statusWrite!.match(/event: status\ndata: (.+)\n/)
      expect(dataLine).toBeTruthy()

      const parsed: WatchStatusEvent = JSON.parse(dataLine![1])
      expect(parsed.state).toBe('reconnecting')
      expect(parsed.clusterId).toBe(VALID_UUID)
      expect(parsed.error).toBe('Connection reset')

      rawRequest.emit('close')
    })

    it('sends heartbeat comments at SSE_HEARTBEAT_INTERVAL_MS', async () => {
      const { request, reply, writes, rawRequest } = createMockRequestReply(VALID_UUID)
      await handleResourceStream(request as any, reply as any)

      // Advance past heartbeat interval (30s)
      await vi.advanceTimersByTimeAsync(30_100)

      const heartbeats = writes.filter((w) => w === ':heartbeat\n\n')
      expect(heartbeats.length).toBeGreaterThanOrEqual(1)

      rawRequest.emit('close')
    })

    it('suppresses initial ADDED events within 5s of subscribe', async () => {
      const { request, reply, writes, rawRequest } = createMockRequestReply(VALID_UUID)
      await handleResourceStream(request as any, reply as any)

      // Emit ADDED within initial load window — should be suppressed
      mocks.emitter.emit(`watch-event:${VALID_UUID}`, {
        type: 'ADDED',
        resourceType: 'pods',
        object: { name: 'initial-pod' },
      } satisfies WatchEvent)

      // Emit MODIFIED within same window — should NOT be suppressed
      mocks.emitter.emit(`watch-event:${VALID_UUID}`, {
        type: 'MODIFIED',
        resourceType: 'pods',
        object: { name: 'modified-pod' },
      } satisfies WatchEvent)

      // Advance past batch buffer
      await vi.advanceTimersByTimeAsync(1_100)

      const watchWrites = writes.filter((w) => w.startsWith('event: watch'))
      expect(watchWrites).toHaveLength(1)

      const dataLine = watchWrites[0].match(/event: watch\ndata: (.+)\n/)
      const batch: WatchEventBatch = JSON.parse(dataLine![1])

      // Only MODIFIED should be present — ADDED was suppressed
      expect(batch.events).toHaveLength(1)
      expect(batch.events[0].type).toBe('MODIFIED')
      expect(batch.events[0].object).toEqual({ name: 'modified-pod' })

      rawRequest.emit('close')
    })

    it('does NOT suppress ADDED events after 5s window', async () => {
      const { request, reply, writes, rawRequest } = createMockRequestReply(VALID_UUID)
      await handleResourceStream(request as any, reply as any)

      // Wait past the initial load window
      await vi.advanceTimersByTimeAsync(5_100)

      // Now ADDED events should NOT be suppressed
      mocks.emitter.emit(`watch-event:${VALID_UUID}`, {
        type: 'ADDED',
        resourceType: 'pods',
        object: { name: 'new-pod' },
      } satisfies WatchEvent)

      await vi.advanceTimersByTimeAsync(1_100)

      const watchWrites = writes.filter((w) => w.startsWith('event: watch'))
      expect(watchWrites).toHaveLength(1)

      const dataLine = watchWrites[0].match(/event: watch\ndata: (.+)\n/)
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
