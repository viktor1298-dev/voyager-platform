import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mock state ────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const { EventEmitter } = require('node:events')
  const emitter = new EventEmitter()
  emitter.setMaxListeners(100)

  return {
    getSession: vi.fn(),
    dbSelectResult: vi.fn(),
    watchSubscribe: vi.fn().mockResolvedValue(undefined),
    watchUnsubscribe: vi.fn(),
    watchIsWatching: vi.fn().mockReturnValue(true),
    emitter,
    // Also mock resourceWatchManager (current impl import — will be removed)
    rwmSubscribe: vi.fn(),
    rwmUnsubscribe: vi.fn(),
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

// Mock resource-watch-manager (old, needed until resource-stream.ts is rewritten)
vi.mock('../lib/resource-watch-manager.js', () => ({
  resourceWatchManager: {
    subscribe: mocks.rwmSubscribe,
    unsubscribe: mocks.rwmUnsubscribe,
  },
}))

// Mock event-emitter with a real EventEmitter (hoisted)
vi.mock('../lib/event-emitter.js', () => ({
  voyagerEmitter: mocks.emitter,
}))

import type { WatchEvent, WatchEventBatch, WatchStatusEvent } from '@voyager/types'
import Fastify, { type FastifyInstance } from 'fastify'
import { registerResourceStreamRoute } from '../routes/resource-stream.js'

const VALID_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

describe('resource-stream SSE route (data-carrying)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.clearAllMocks()
    mocks.emitter.removeAllListeners()
    app = Fastify({ logger: false })
    await registerResourceStreamRoute(app)
    await app.ready()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await app.close()
  })

  // ── Auth & Validation ──────────────────────────────────────

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

  // ── SSE Format & Data ──────────────────────────────────────

  it('calls watchManager.subscribe on valid SSE connection', async () => {
    mocks.getSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: { id: 'user-1', role: 'admin' },
    })
    mocks.dbSelectResult.mockResolvedValue([{ id: VALID_UUID }])

    const _injectPromise = app.inject({
      method: 'GET',
      url: `/api/resources/stream?clusterId=${VALID_UUID}`,
    })

    await vi.advanceTimersByTimeAsync(50)

    expect(mocks.watchSubscribe).toHaveBeenCalledWith(VALID_UUID)
  })

  it('emits SSE watch events with WatchEventBatch format', async () => {
    mocks.getSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: { id: 'user-1', role: 'admin' },
    })
    mocks.dbSelectResult.mockResolvedValue([{ id: VALID_UUID }])

    const injectPromise = app.inject({
      method: 'GET',
      url: `/api/resources/stream?clusterId=${VALID_UUID}`,
    })

    // Wait for handler to set up
    await vi.advanceTimersByTimeAsync(100)

    // Skip past initial load window (5 seconds)
    await vi.advanceTimersByTimeAsync(5_100)

    // Emit a watch event
    const watchEvent: WatchEvent = {
      type: 'MODIFIED',
      resourceType: 'pods',
      object: { name: 'test-pod', namespace: 'default', status: 'Running' },
    }
    mocks.emitter.emit(`watch-event:${VALID_UUID}`, watchEvent)

    // Advance past batch buffer (1000ms)
    await vi.advanceTimersByTimeAsync(1_100)

    // Close connection to get response
    await app.close()
    const response = await injectPromise

    // Parse SSE data from response body
    const body = response.body
    expect(body).toContain(':connected')
    expect(body).toContain('event: watch')

    // Extract the data line after 'event: watch'
    const watchDataMatch = body.match(/event: watch\ndata: (.+)\n/)
    expect(watchDataMatch).toBeTruthy()

    const batch: WatchEventBatch = JSON.parse(watchDataMatch![1])
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
  })

  it('batches multiple events within 1 second into a single SSE message', async () => {
    mocks.getSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: { id: 'user-1', role: 'admin' },
    })
    mocks.dbSelectResult.mockResolvedValue([{ id: VALID_UUID }])

    const injectPromise = app.inject({
      method: 'GET',
      url: `/api/resources/stream?clusterId=${VALID_UUID}`,
    })

    await vi.advanceTimersByTimeAsync(100)
    // Skip initial load window
    await vi.advanceTimersByTimeAsync(5_100)

    // Emit 3 events rapidly (same tick)
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

    await app.close()
    const response = await injectPromise
    const body = response.body

    // Should have exactly ONE 'event: watch' line (batched)
    const watchMatches = body.match(/event: watch\ndata: (.+)\n/g)
    expect(watchMatches).toHaveLength(1)

    const batchData = body.match(/event: watch\ndata: (.+)\n/)
    const batch: WatchEventBatch = JSON.parse(batchData![1])
    expect(batch.events).toHaveLength(3)
    expect(batch.events[0].type).toBe('ADDED')
    expect(batch.events[1].type).toBe('MODIFIED')
    expect(batch.events[2].type).toBe('DELETED')
  })

  it('sends status events immediately (not batched)', async () => {
    mocks.getSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: { id: 'user-1', role: 'admin' },
    })
    mocks.dbSelectResult.mockResolvedValue([{ id: VALID_UUID }])

    const injectPromise = app.inject({
      method: 'GET',
      url: `/api/resources/stream?clusterId=${VALID_UUID}`,
    })

    await vi.advanceTimersByTimeAsync(100)

    // Emit a status event
    const statusEvent: WatchStatusEvent = {
      clusterId: VALID_UUID,
      state: 'reconnecting',
      resourceType: 'pods',
      error: 'Connection reset',
    }
    mocks.emitter.emit(`watch-status:${VALID_UUID}`, statusEvent)

    // No need to wait for batch timer — status should be immediate
    await vi.advanceTimersByTimeAsync(50)

    await app.close()
    const response = await injectPromise
    const body = response.body

    expect(body).toContain('event: status')
    const statusMatch = body.match(/event: status\ndata: (.+)\n/)
    expect(statusMatch).toBeTruthy()

    const parsed: WatchStatusEvent = JSON.parse(statusMatch![1])
    expect(parsed.state).toBe('reconnecting')
    expect(parsed.clusterId).toBe(VALID_UUID)
  })

  it('sends heartbeat comments at SSE_HEARTBEAT_INTERVAL_MS', async () => {
    mocks.getSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: { id: 'user-1', role: 'admin' },
    })
    mocks.dbSelectResult.mockResolvedValue([{ id: VALID_UUID }])

    const injectPromise = app.inject({
      method: 'GET',
      url: `/api/resources/stream?clusterId=${VALID_UUID}`,
    })

    await vi.advanceTimersByTimeAsync(100)

    // Advance past heartbeat interval (30s)
    await vi.advanceTimersByTimeAsync(30_100)

    await app.close()
    const response = await injectPromise
    const body = response.body

    expect(body).toContain(':heartbeat')
  })

  it('suppresses initial ADDED events within 5s of subscribe', async () => {
    mocks.getSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: { id: 'user-1', role: 'admin' },
    })
    mocks.dbSelectResult.mockResolvedValue([{ id: VALID_UUID }])

    const injectPromise = app.inject({
      method: 'GET',
      url: `/api/resources/stream?clusterId=${VALID_UUID}`,
    })

    await vi.advanceTimersByTimeAsync(100)

    // Emit ADDED events within initial load window (< 5s from subscribe)
    mocks.emitter.emit(`watch-event:${VALID_UUID}`, {
      type: 'ADDED',
      resourceType: 'pods',
      object: { name: 'initial-pod' },
    } satisfies WatchEvent)

    // But MODIFIED within the window should NOT be suppressed
    mocks.emitter.emit(`watch-event:${VALID_UUID}`, {
      type: 'MODIFIED',
      resourceType: 'pods',
      object: { name: 'modified-pod' },
    } satisfies WatchEvent)

    // Advance past batch buffer
    await vi.advanceTimersByTimeAsync(1_100)

    await app.close()
    const response = await injectPromise
    const body = response.body

    // The ADDED should be suppressed, MODIFIED should get through
    const watchMatches = body.match(/event: watch\ndata: (.+)\n/g)
    if (watchMatches) {
      for (const match of watchMatches) {
        const dataStr = match.match(/data: (.+)\n/)![1]
        const batch: WatchEventBatch = JSON.parse(dataStr)
        // No ADDED events should be in any batch
        for (const event of batch.events) {
          expect(event.type).not.toBe('ADDED')
        }
        // MODIFIED should be present
        expect(batch.events.some((e) => e.type === 'MODIFIED')).toBe(true)
      }
    } else {
      // If no watch events at all, the MODIFIED was also missing — fail
      expect(watchMatches).toBeTruthy()
    }
  })

  it('does NOT suppress ADDED events after 5s window', async () => {
    mocks.getSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: { id: 'user-1', role: 'admin' },
    })
    mocks.dbSelectResult.mockResolvedValue([{ id: VALID_UUID }])

    const injectPromise = app.inject({
      method: 'GET',
      url: `/api/resources/stream?clusterId=${VALID_UUID}`,
    })

    await vi.advanceTimersByTimeAsync(100)
    // Wait past the initial load window
    await vi.advanceTimersByTimeAsync(5_100)

    // Now ADDED events should NOT be suppressed
    mocks.emitter.emit(`watch-event:${VALID_UUID}`, {
      type: 'ADDED',
      resourceType: 'pods',
      object: { name: 'new-pod' },
    } satisfies WatchEvent)

    await vi.advanceTimersByTimeAsync(1_100)

    await app.close()
    const response = await injectPromise
    const body = response.body

    const watchData = body.match(/event: watch\ndata: (.+)\n/)
    expect(watchData).toBeTruthy()
    const batch: WatchEventBatch = JSON.parse(watchData![1])
    expect(batch.events.some((e) => e.type === 'ADDED')).toBe(true)
  })

  it('writes :connected immediately after headers', async () => {
    mocks.getSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: { id: 'user-1', role: 'admin' },
    })
    mocks.dbSelectResult.mockResolvedValue([{ id: VALID_UUID }])

    const injectPromise = app.inject({
      method: 'GET',
      url: `/api/resources/stream?clusterId=${VALID_UUID}`,
    })

    await vi.advanceTimersByTimeAsync(100)

    await app.close()
    const response = await injectPromise

    // :connected should be the first thing in the body
    expect(response.body.startsWith(':connected\n\n')).toBe(true)
  })
})
