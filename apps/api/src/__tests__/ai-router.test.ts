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

const appRouter = router({ ai: aiRouter })

function createCaller() {
  const insertSpy = vi.fn()
  const db = {
    insert: insertSpy,
  }

  const caller = appRouter.createCaller({
    db: db as unknown as Context['db'],
    user: { id: 'u1', email: 'u1@test.local', name: 'User 1', role: 'member' },
    session: { userId: 'u1', expiresAt: new Date(Date.now() + 60_000) },
    ipAddress: '127.0.0.1',
    res: { header: vi.fn() } as never,
  })

  return { caller, insertSpy }
}

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
})
