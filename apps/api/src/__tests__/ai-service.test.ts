import { describe, expect, it } from 'vitest'
import { AIService } from '../services/ai-service.js'

function createMockDb(params?: {
  clusterExists?: boolean
  recentEvents?: Array<{ reason: string | null; message: string | null; timestamp: Date }>
  latestEventAt?: Date | null
}) {
  const clusterExists = params?.clusterExists ?? true
  const recentEvents = params?.recentEvents ?? []
  const latestEventAt = params?.latestEventAt ?? null

  let selectCalls = 0

  return {
    select: () => {
      selectCalls += 1

      if (selectCalls === 1) {
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

      if (selectCalls === 2) {
        return {
          from: () => ({
            where: () => ({
              orderBy: async () => recentEvents,
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

  it('builds contextual answer for restart question', async () => {
    const service = new AIService({ db: createMockDb() as never })

    const answer = await service.answerQuestion({
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

    expect(answer.toLowerCase()).toContain('restart')
    expect(answer.toLowerCase()).toContain('investigate crash loops')
  })
})
