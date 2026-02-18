import { describe, expect, it, beforeEach } from 'vitest'
import { encryptApiKey } from '../services/ai-key-crypto.js'
import { AIService } from '../services/ai-service.js'

function createMockDb(params?: {
  clusterExists?: boolean
  recentEvents?: Array<{ reason: string | null; message: string | null; timestamp: Date }>
  latestEventAt?: Date | null
  failRecentEventsAttempts?: number
  failRecentEventsErrorMessage?: string
}) {
  const clusterExists = params?.clusterExists ?? true
  const recentEvents = params?.recentEvents ?? []
  const latestEventAt = params?.latestEventAt ?? null
  const failRecentEventsAttempts = params?.failRecentEventsAttempts ?? 0
  const failRecentEventsErrorMessage =
    params?.failRecentEventsErrorMessage ?? 'timeout while reading recent events'

  let recentEventsAttempts = 0

  return {
    select: (projection?: Record<string, unknown>) => {
      if (!projection) {
        return {
          from: () => ({
            where: () => ({
              limit: async () =>
                clusterExists
                  ? [
                      {
                        id: '11111111-1111-1111-1111-111111111111',
                        name: 'prod-cluster',
                      },
                    ]
                  : [],
            }),
          }),
        }
      }

      if ('reason' in projection) {
        return {
          from: () => ({
            where: () => ({
              orderBy: async () => {
                recentEventsAttempts += 1
                if (recentEventsAttempts <= failRecentEventsAttempts) {
                  throw new Error(failRecentEventsErrorMessage)
                }

                return recentEvents
              },
            }),
          }),
        }
      }

      return {
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => (latestEventAt ? [{ timestamp: latestEventAt }] : []),
            }),
          }),
        }),
      }
    },
  }
}

describe('AIService', () => {
  beforeEach(() => {
    process.env.AI_KEYS_ENCRYPTION_KEY = 'ai-service-test-secret'
  })

  it('returns scale recommendation for high CPU', async () => {
    const service = new AIService({ db: createMockDb() as never })

    const result = await service.analyzeClusterHealth('11111111-1111-1111-1111-111111111111', {
      cpuUsagePercent: 92,
      podsRestarting: 0,
      recentEventsCount: 4,
      memoryUsagePercent: 45,
      logErrorRatePercent: 1,
      lastEventAt: new Date().toISOString(),
    })

    expect(result.recommendations.some((rec) => rec.title.includes('CPU'))).toBe(true)
    expect(result.score).toBeLessThan(100)
  })

  it('returns crash loop recommendation when restarts exceed threshold', async () => {
    const service = new AIService({ db: createMockDb() as never })

    const result = await service.analyzeClusterHealth('11111111-1111-1111-1111-111111111111', {
      cpuUsagePercent: 35,
      memoryUsagePercent: 50,
      podsRestarting: 5,
      recentEventsCount: 7,
      logErrorRatePercent: 1,
      lastEventAt: new Date().toISOString(),
    })

    expect(result.recommendations.some((rec) => rec.title.includes('Frequent pod restarts'))).toBe(
      true,
    )
    expect(result.score).toBeLessThanOrEqual(75)
  })

  it('returns idle recommendation when no events in the last hour', async () => {
    const service = new AIService({ db: createMockDb({ latestEventAt: null }) as never })

    const result = await service.analyzeClusterHealth('11111111-1111-1111-1111-111111111111', {
      cpuUsagePercent: 20,
      memoryUsagePercent: 30,
      podsRestarting: 0,
      recentEventsCount: 0,
      logErrorRatePercent: 0,
    })

    expect(result.recommendations.some((rec) => rec.title === 'Cluster appears idle')).toBe(true)
  })

  it('aggregates streamed answer tokens into final answer', async () => {
    const service = new AIService({ db: createMockDb() as never })

    service.answerQuestionStream = async (_params, onToken) => {
      await onToken('Detected restart pressure. ')
      await onToken('Investigate crash loops.')
      return { threadId: '11111111-1111-1111-1111-111111111111', provider: 'openai', model: 'gpt-4o-mini' }
    }

    const response = await service.answerQuestion({
      clusterId: '11111111-1111-1111-1111-111111111111',
      question: 'Do we have restart issues?',
      snapshot: {
        podsRestarting: 6,
        cpuUsagePercent: 50,
        memoryUsagePercent: 60,
        recentEventsCount: 10,
        logErrorRatePercent: 2,
        lastEventAt: new Date().toISOString(),
      },
    })

    expect(response.answer.toLowerCase()).toContain('restart')
    expect(response.answer.toLowerCase()).toContain('investigate crash loops')
    expect(response.threadId).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('falls back to snapshot defaults when recent events query keeps timing out', async () => {
    const service = new AIService({
      db: createMockDb({ failRecentEventsAttempts: 3 }) as never,
    })

    const result = await service.analyzeClusterHealth('11111111-1111-1111-1111-111111111111', {
      cpuUsagePercent: 30,
      memoryUsagePercent: 40,
      podsRestarting: 1,
      recentEventsCount: 2,
      logErrorRatePercent: 1,
      lastEventAt: new Date().toISOString(),
    })

    expect(result.clusterName).toBe('prod-cluster')
    expect(result.snapshot.podsRestarting).toBe(1)
    expect(result.score).toBeGreaterThan(0)
  })

  it('propagates non-transient db errors instead of using fallback', async () => {
    const service = new AIService({
      db: createMockDb({
        failRecentEventsAttempts: 1,
        failRecentEventsErrorMessage: 'syntax error at or near "FROM"',
      }) as never,
    })

    await expect(
      service.analyzeClusterHealth('11111111-1111-1111-1111-111111111111', {
        cpuUsagePercent: 30,
        memoryUsagePercent: 40,
        podsRestarting: 1,
        recentEventsCount: 2,
        logErrorRatePercent: 1,
        lastEventAt: new Date().toISOString(),
      }),
    ).rejects.toThrow('syntax error at or near "FROM"')
  })

  it('resolves BYOK config deterministically by latest update then provider preference', async () => {
    const openAiEncrypted = encryptApiKey('sk-openai')
    const claudeEncrypted = encryptApiKey('sk-claude')

    const db = {
      select: () => ({
        from: () => ({
          where: async () => [
            {
              provider: 'claude',
              model: 'claude-3-5-sonnet',
              encryptedKey: claudeEncrypted,
              updatedAt: new Date('2026-02-18T00:00:00.000Z'),
            },
            {
              provider: 'openai',
              model: 'gpt-4o-mini',
              encryptedKey: openAiEncrypted,
              updatedAt: new Date('2026-02-18T00:00:00.000Z'),
            },
          ],
        }),
      }),
    }

    const service = new AIService({ db: db as never })
    const resolved = await (service as any).resolveUserAiConfig({ userId: 'user-1' })

    expect(resolved.provider).toBe('openai')
    expect(resolved.model).toBe('gpt-4o-mini')
    expect(resolved.apiKey).toBe('sk-openai')
  })

  it('uses explicitly requested provider and throws when it is missing', async () => {
    const claudeEncrypted = encryptApiKey('sk-claude')

    const db = {
      select: () => ({
        from: () => ({
          where: async () => [
            {
              provider: 'claude',
              model: 'claude-3-5-sonnet',
              encryptedKey: claudeEncrypted,
              updatedAt: new Date('2026-02-18T00:00:00.000Z'),
            },
          ],
        }),
      }),
    }

    const service = new AIService({ db: db as never })

    await expect(
      (service as any).resolveUserAiConfig({ userId: 'user-1', preferredProvider: 'openai' }),
    ).rejects.toThrow('NO_API_KEY')
  })
})
