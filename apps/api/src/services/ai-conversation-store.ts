import { type Database, aiMessages, aiThreads } from '@voyager/db'
import { asc, eq } from 'drizzle-orm'
import type { AiChatMessage } from './ai-provider.js'

export interface PersistedThread {
  id: string
  provider: 'openai' | 'anthropic'
  model: string
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
      const [existing] = await this.db
        .select({ id: aiThreads.id, provider: aiThreads.provider, model: aiThreads.model })
        .from(aiThreads)
        .where(eq(aiThreads.id, params.threadId))
        .limit(1)

      if (existing) {
        return existing
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
    role: 'system' | 'user' | 'assistant'
    content: string
    provider: 'openai' | 'anthropic'
    model: string
  }): Promise<void> {
    await this.db.insert(aiMessages).values(params)
  }

  public async getThreadMessages(threadId: string): Promise<AiChatMessage[]> {
    const rows = await this.db
      .select({ role: aiMessages.role, content: aiMessages.content })
      .from(aiMessages)
      .where(eq(aiMessages.threadId, threadId))
      .orderBy(asc(aiMessages.createdAt))

    return rows.map((row) => ({ role: row.role, content: row.content }))
  }
}
