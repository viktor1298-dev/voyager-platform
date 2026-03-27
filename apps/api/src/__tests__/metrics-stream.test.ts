import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mock state ────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  stopAll: vi.fn(),
  getStatus: vi.fn().mockReturnValue({ activePollers: 0, clusterIds: [] }),
  dbSelectResult: vi.fn(),
}))

// Mock auth module -- avoid DB connection on import
vi.mock('../lib/auth.js', () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
    },
  },
}))

// Mock @voyager/db -- avoid real DB
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

// Mock metricsStreamJob
vi.mock('../jobs/metrics-stream-job.js', () => ({
  metricsStreamJob: {
    subscribe: mocks.subscribe,
    unsubscribe: mocks.unsubscribe,
    stopAll: mocks.stopAll,
    getStatus: mocks.getStatus,
  },
}))

// Mock event-emitter
vi.mock('../lib/event-emitter.js', () => {
  const { EventEmitter } = require('node:events')
  const emitter = new EventEmitter()
  emitter.setMaxListeners(100)
  return { voyagerEmitter: emitter }
})

import { registerMetricsStreamRoute } from '../routes/metrics-stream.js'
import Fastify from 'fastify'

const VALID_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

describe('metrics-stream SSE route', () => {
  const app = Fastify({ logger: false })

  beforeAll(async () => {
    await registerMetricsStreamRoute(app)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without auth', async () => {
    mocks.getSession.mockResolvedValue(null)

    const response = await app.inject({
      method: 'GET',
      url: `/api/metrics/stream?clusterId=${VALID_UUID}`,
    })

    expect(response.statusCode).toBe(401)
    expect(JSON.parse(response.body)).toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 without clusterId query param', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/metrics/stream',
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 400 for invalid UUID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/metrics/stream?clusterId=not-a-uuid',
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
      url: `/api/metrics/stream?clusterId=${VALID_UUID}`,
    })

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.body)).toEqual({ error: 'Cluster not found' })
  })

  it('calls metricsStreamJob.subscribe for valid SSE connection', async () => {
    mocks.getSession.mockResolvedValue({
      session: { id: 'sess-1' },
      user: { id: 'user-1', role: 'admin' },
    })
    mocks.dbSelectResult.mockResolvedValue([{ id: VALID_UUID }])

    // inject() waits for the response to end, which SSE connections don't do
    // Use a timeout race to get enough time for subscribe to be called
    const injectPromise = app.inject({
      method: 'GET',
      url: `/api/metrics/stream?clusterId=${VALID_UUID}`,
    })

    // Wait a brief tick for the async handler to execute and call subscribe
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(mocks.subscribe).toHaveBeenCalledWith(VALID_UUID, expect.any(String))

    // Clean up: the inject will resolve when Fastify closes
  })
})
