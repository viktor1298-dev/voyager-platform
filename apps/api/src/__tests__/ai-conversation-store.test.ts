import { beforeEach, describe, expect, it, vi } from 'vitest'

const drizzleMocks = vi.hoisted(() => ({
  andMock: vi.fn((...parts: unknown[]) => ({ kind: 'and', parts })),
  eqMock: vi.fn((left: unknown, right: unknown) => ({ kind: 'eq', left, right })),
  descMock: vi.fn((value: unknown) => ({ kind: 'desc', value })),
  ascMock: vi.fn((value: unknown) => ({ kind: 'asc', value })),
}))

const dbSchemaMocks = vi.hoisted(() => ({
  aiThreads: {
    id: { column: 'ai_threads.id' },
    clusterId: { column: 'ai_threads.cluster_id' },
    userId: { column: 'ai_threads.user_id' },
    provider: { column: 'ai_threads.provider' },
    model: { column: 'ai_threads.model' },
    title: { column: 'ai_threads.title' },
    createdAt: { column: 'ai_threads.created_at' },
    updatedAt: { column: 'ai_threads.updated_at' },
  },
  aiMessages: {
    id: { column: 'ai_messages.id' },
    threadId: { column: 'ai_messages.thread_id' },
    role: { column: 'ai_messages.role' },
    content: { column: 'ai_messages.content' },
    createdAt: { column: 'ai_messages.created_at' },
    provider: { column: 'ai_messages.provider' },
    model: { column: 'ai_messages.model' },
  },
}))

vi.mock('drizzle-orm', () => ({
  and: drizzleMocks.andMock,
  eq: drizzleMocks.eqMock,
  desc: drizzleMocks.descMock,
  asc: drizzleMocks.ascMock,
}))

vi.mock('@voyager/db', () => ({
  aiThreads: dbSchemaMocks.aiThreads,
  aiMessages: dbSchemaMocks.aiMessages,
}))

import { AiConversationStore } from '../services/ai-conversation-store.js'

function createDbMock() {
  return {
    select: vi.fn((projection?: Record<string, unknown>) => {
      if (projection && 'clusterId' in projection) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => [
                  {
                    id: 'thread-1',
                    clusterId: 'cluster-1',
                    title: 'Latest',
                    provider: 'openai',
                    model: 'gpt-4o-mini',
                    createdAt: new Date('2026-02-18T01:00:00.000Z'),
                    updatedAt: new Date('2026-02-18T02:00:00.000Z'),
                  },
                ]),
              })),
            })),
          })),
        }
      }

      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(async () => [
                {
                  id: 'msg-1',
                  role: 'user',
                  content: 'Hello',
                  createdAt: new Date('2026-02-18T02:01:00.000Z'),
                },
              ]),
            })),
          })),
        })),
      }
    }),
  }
}

describe('AiConversationStore predicate contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds user+cluster filter predicates for latest history query', async () => {
    const db = createDbMock()
    const store = new AiConversationStore(db as never)

    const result = await store.getLatestThreadHistory({
      userId: 'user-123',
      clusterId: 'cluster-1',
      messageLimit: 20,
    })

    expect(result?.id).toBe('thread-1')

    expect(drizzleMocks.eqMock).toHaveBeenCalledWith(dbSchemaMocks.aiThreads.userId, 'user-123')
    expect(drizzleMocks.eqMock).toHaveBeenCalledWith(dbSchemaMocks.aiThreads.clusterId, 'cluster-1')

    const threadIdComparison = drizzleMocks.eqMock.mock.calls.find(
      ([left, right]) => left === dbSchemaMocks.aiMessages.threadId && right === 'thread-1',
    )
    expect(threadIdComparison).toBeTruthy()

    expect(drizzleMocks.andMock).toHaveBeenCalledTimes(1)
  })
})
