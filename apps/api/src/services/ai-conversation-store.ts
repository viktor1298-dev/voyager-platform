import { TRPCError } from '@trpc/server'
import { aiMessages, aiThreads, type Database } from '@voyager/db'
import { and, asc, desc, eq } from 'drizzle-orm'
import type { AiChatMessage } from './ai-provider.js'

export interface PersistedThread {
  id: string
  provider: 'openai' | 'anthropic'
  model: string
}

export interface ThreadHistoryMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  createdAt: Date
}

export interface ThreadHistory {
  id: string
  clusterId: string
  title: string | null
  provider: 'openai' | 'anthropic'
  model: string
  createdAt: Date
  updatedAt: Date
  messages: ThreadHistoryMessage[]
}

export class AiConversationStore {
  public constructor(private readonly db: Database) {}

  public async upsertThread(params: {
    threadId?: string
    clusterId: string
    userId: string
    provider: 'openai' | 'anthropic'
    model: string
    title?: string
  }): Promise<PersistedThread> {
    if (params.threadId) {
      const existing = await this.getOwnedThreadById(
        params.threadId,
        params.userId,
        params.clusterId,
      )
      if (existing) {
        return existing
      }

      const threadExists = await this.threadExists(params.threadId)
      if (threadExists) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Thread does not belong to current user for this cluster',
        })
      }
    }

    const [created] = await this.db
      .insert(aiThreads)
      .values({
        clusterId: params.clusterId,
        userId: params.userId,
        provider: params.provider,
        model: params.model,
        title: params.title ?? null,
      })
      .returning({ id: aiThreads.id, provider: aiThreads.provider, model: aiThreads.model })

    return created
  }

  public async appendMessage(params: {
    threadId: string
    clusterId: string
    userId: string
    role: 'system' | 'user' | 'assistant'
    content: string
    provider: 'openai' | 'anthropic'
    model: string
  }): Promise<void> {
    await this.assertThreadOwnership(params.threadId, params.userId, params.clusterId)

    await this.db.insert(aiMessages).values({
      threadId: params.threadId,
      role: params.role,
      content: params.content,
      provider: params.provider,
      model: params.model,
    })
  }

  public async getThreadMessages(params: {
    threadId: string
    userId: string
    clusterId: string
  }): Promise<AiChatMessage[]> {
    await this.assertThreadOwnership(params.threadId, params.userId, params.clusterId)

    const rows = await this.db
      .select({ role: aiMessages.role, content: aiMessages.content })
      .from(aiMessages)
      .where(eq(aiMessages.threadId, params.threadId))
      .orderBy(asc(aiMessages.createdAt))

    return rows.map((row) => ({ role: row.role, content: row.content }))
  }

  public async getLatestThreadHistory(params: {
    userId: string
    clusterId: string
    limit?: number
    messageLimit?: number
  }): Promise<ThreadHistory | null> {
    const normalizedLimit = Math.min(Math.max(params.limit ?? 1, 1), 1)
    const normalizedMessageLimit = Math.min(Math.max(params.messageLimit ?? 100, 1), 500)

    const [thread] = await this.db
      .select({
        id: aiThreads.id,
        clusterId: aiThreads.clusterId,
        title: aiThreads.title,
        provider: aiThreads.provider,
        model: aiThreads.model,
        createdAt: aiThreads.createdAt,
        updatedAt: aiThreads.updatedAt,
      })
      .from(aiThreads)
      .where(and(eq(aiThreads.userId, params.userId), eq(aiThreads.clusterId, params.clusterId)))
      .orderBy(desc(aiThreads.updatedAt))
      .limit(normalizedLimit)

    if (!thread) {
      return null
    }

    const messages = await this.db
      .select({
        id: aiMessages.id,
        role: aiMessages.role,
        content: aiMessages.content,
        createdAt: aiMessages.createdAt,
      })
      .from(aiMessages)
      .where(eq(aiMessages.threadId, thread.id))
      .orderBy(asc(aiMessages.createdAt))
      .limit(normalizedMessageLimit)

    return {
      ...thread,
      messages,
    }
  }

  private async assertThreadOwnership(
    threadId: string,
    userId: string,
    clusterId: string,
  ): Promise<void> {
    const owned = await this.getOwnedThreadById(threadId, userId, clusterId)
    if (owned) {
      return
    }

    const threadExists = await this.threadExists(threadId)
    if (threadExists) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Thread does not belong to current user for this cluster',
      })
    }

    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Thread not found',
    })
  }

  private async getOwnedThreadById(
    threadId: string,
    userId: string,
    clusterId: string,
  ): Promise<PersistedThread | null> {
    const [thread] = await this.db
      .select({ id: aiThreads.id, provider: aiThreads.provider, model: aiThreads.model })
      .from(aiThreads)
      .where(
        and(
          eq(aiThreads.id, threadId),
          eq(aiThreads.userId, userId),
          eq(aiThreads.clusterId, clusterId),
        ),
      )
      .limit(1)

    return thread ?? null
  }

  private async threadExists(threadId: string): Promise<boolean> {
    const [thread] = await this.db
      .select({ id: aiThreads.id })
      .from(aiThreads)
      .where(eq(aiThreads.id, threadId))
      .limit(1)
    return Boolean(thread)
  }
}
