import { TRPCError } from '@trpc/server'
import { describe, expect, it, vi, afterEach } from 'vitest'

vi.mock('../lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
    handler: vi.fn(),
  },
}))

vi.mock('../lib/audit.js', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}))

import { aiRouter } from '../routers/ai.js'
import { AIService } from '../services/ai-service.js'
import { router } from '../trpc.js'

const appRouter = router({ ai: aiRouter })

function createCaller() {
  return appRouter.createCaller({
    db: {} as never,
    user: { id: 'user-1', email: 'user@test.local', name: 'User', role: 'member' },
    session: { userId: 'user-1', expiresAt: new Date(Date.now() + 60_000) },
    ipAddress: '127.0.0.1',
    res: { header: vi.fn() } as never,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('aiRouter.chat BYOK behavior', () => {
  it('returns NO_API_KEY when user has no configured BYOK key', async () => {
    vi.spyOn(AIService.prototype, 'answerQuestion').mockRejectedValueOnce(
      new TRPCError({ code: 'BAD_REQUEST', message: 'NO_API_KEY' }),
    )

    const caller = createCaller()

    await expect(
      caller.ai.chat({
        clusterId: '11111111-1111-4111-8111-111111111111',
        question: 'Check health',
      }),
    ).rejects.toThrow('NO_API_KEY')
  })

  it('returns chat answer when BYOK key is configured', async () => {
    const answerSpy = vi.spyOn(AIService.prototype, 'answerQuestion').mockResolvedValueOnce({
      answer: 'Cluster looks healthy.',
      threadId: '22222222-2222-4222-8222-222222222222',
      provider: 'openai',
      model: 'gpt-4o-mini',
    })

    const caller = createCaller()

    const response = await caller.ai.chat({
      clusterId: '11111111-1111-4111-8111-111111111111',
      question: 'Check health',
      provider: 'openai',
    })

    expect(response.answer).toContain('healthy')
    expect(response.threadId).toBe('22222222-2222-4222-8222-222222222222')
    expect(response.provider).toBe('openai')
    expect(answerSpy).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai' }))
  })
})
