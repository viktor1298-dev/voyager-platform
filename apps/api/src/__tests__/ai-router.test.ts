import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { logAuditMock } = vi.hoisted(() => ({
  logAuditMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
    handler: vi.fn(),
  },
}))

vi.mock('../lib/audit.js', () => ({
  logAudit: logAuditMock,
}))

import { aiRouter } from '../routers/ai.js'
import { AIService } from '../services/ai-service.js'
import { type Context, router } from '../trpc.js'

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn(), trace: vi.fn(), child: () => mockLog, silent: vi.fn() } as any

const appRouter = router({ ai: aiRouter })

function createCaller() {
  const insertSpy = vi.fn()
  const db = {
    insert: insertSpy,
  }

  const caller = appRouter.createCaller({
    db: db as unknown as Context['db'],
    log: mockLog,
    user: { id: 'u1', email: 'u1@test.local', name: 'User 1', role: 'member' },
    session: { userId: 'u1', expiresAt: new Date(Date.now() + 60_000) },
    ipAddress: '127.0.0.1',
    res: { header: vi.fn() } as never,
  })

  return { caller, insertSpy }
}

describe('ai.analyze stability handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    logAuditMock.mockResolvedValue(undefined)
  })

  it('returns analysis even when audit logging fails', async () => {
    vi.spyOn(AIService.prototype, 'analyzeClusterHealth').mockResolvedValueOnce({
      clusterId: '11111111-1111-4111-8111-111111111111',
      clusterName: 'dev-cluster',
      snapshot: {
        cpuUsagePercent: 42,
        memoryUsagePercent: 55,
        podsRestarting: 0,
        recentEventsCount: 3,
        logErrorRatePercent: 1,
        lastEventAt: new Date('2026-02-18T12:00:00.000Z'),
      },
      score: 95,
      recommendations: [
        {
          severity: 'info',
          title: 'Cluster health looks stable',
          description:
            'No rule-based anomalies were detected in current metrics/events/log signals.',
          action: 'Continue monitoring and keep autoscaling and alerts tuned.',
        },
      ],
    })
    logAuditMock.mockRejectedValueOnce(new Error('connection reset during audit insert'))

    const { caller } = createCaller()

    const result = await caller.ai.analyze({
      clusterId: '11111111-1111-4111-8111-111111111111',
    })

    expect(result.score).toBe(95)
    expect(result.clusterName).toBe('dev-cluster')
  })

  it('maps transient analyze failures to SERVICE_UNAVAILABLE', async () => {
    vi.spyOn(AIService.prototype, 'analyzeClusterHealth').mockRejectedValueOnce(
      new Error('database connection refused while reading events'),
    )

    const { caller } = createCaller()

    await expect(
      caller.ai.analyze({
        clusterId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  })

  it('keeps non-transient analyze failures as INTERNAL_SERVER_ERROR', async () => {
    vi.spyOn(AIService.prototype, 'analyzeClusterHealth').mockRejectedValueOnce(
      new Error('invalid cluster metrics shape'),
    )

    const { caller } = createCaller()

    await expect(
      caller.ai.analyze({
        clusterId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
  })
})

describe('ai.chat transient provider handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    logAuditMock.mockResolvedValue(undefined)
  })

  it('maps transient provider failures to SERVICE_UNAVAILABLE', async () => {
    vi.spyOn(AIService.prototype, 'answerQuestion').mockRejectedValueOnce(
      new Error('upstream timeout while calling provider'),
    )

    const { caller, insertSpy } = createCaller()

    await expect(
      caller.ai.chat({
        clusterId: '11111111-1111-4111-8111-111111111111',
        question: 'What is wrong?',
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })

    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('keeps non-transient provider failures as INTERNAL_SERVER_ERROR', async () => {
    vi.spyOn(AIService.prototype, 'answerQuestion').mockRejectedValueOnce(
      new Error('invalid response shape from provider parser'),
    )

    const { caller } = createCaller()

    await expect(
      caller.ai.chat({
        clusterId: '11111111-1111-4111-8111-111111111111',
        question: 'What is wrong?',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
  })

  it('does not remap logical TRPC failures to SERVICE_UNAVAILABLE', async () => {
    vi.spyOn(AIService.prototype, 'answerQuestion').mockRejectedValueOnce(
      new TRPCError({ code: 'BAD_REQUEST', message: 'invalid input prompt' }),
    )

    const { caller } = createCaller()

    await expect(
      caller.ai.chat({
        clusterId: '11111111-1111-4111-8111-111111111111',
        question: 'What is wrong?',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})
