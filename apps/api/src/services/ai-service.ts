import { TRPCError } from '@trpc/server'
import { AI_CONFIG } from '@voyager/config'
import type { Database } from '@voyager/db'
import { events, clusters, userAiKeys } from '@voyager/db'
import { and, desc, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import { AiConversationStore } from './ai-conversation-store.js'
import { type AiChatMessage, type AiCompletionRequest, AiProviderClient } from './ai-provider.js'
import { decryptApiKey } from './ai-key-crypto.js'

const AI_SCORE = {
  MAX: 100,
  CPU_WARNING_THRESHOLD: 80,
  RESTART_WARNING_THRESHOLD: 3,
  MEMORY_WARNING_THRESHOLD: 85,
  LOG_ERROR_RATE_THRESHOLD: 5,
  CPU_PENALTY: 20,
  RESTART_PENALTY: 25,
  IDLE_BONUS: 5,
  MEMORY_PENALTY: 15,
  LOG_ERROR_PENALTY: 10,
} as const

const AI_DB_RETRY = {
  ATTEMPTS: 3,
  BASE_DELAY_MS: 120,
} as const

export const aiSeveritySchema = z.enum(['critical', 'warning', 'info'])

export const aiRecommendationSchema = z.object({
  severity: aiSeveritySchema,
  title: z.string(),
  description: z.string(),
  action: z.string(),
})

export const clusterSnapshotSchema = z.object({
  cpuUsagePercent: z.number().min(0).max(100).optional(),
  memoryUsagePercent: z.number().min(0).max(100).optional(),
  podsRestarting: z.number().int().min(0).optional(),
  recentEventsCount: z.number().int().min(0).optional(),
  logErrorRatePercent: z.number().min(0).max(100).optional(),
  lastEventAt: z.union([z.date(), z.string().datetime()]).optional(),
})

export type AIRecommendation = z.infer<typeof aiRecommendationSchema>
export type ClusterSnapshotInput = z.input<typeof clusterSnapshotSchema>

export interface ClusterAnalysis {
  clusterId: string
  clusterName: string
  snapshot: {
    cpuUsagePercent: number
    memoryUsagePercent: number
    podsRestarting: number
    recentEventsCount: number
    logErrorRatePercent: number
    lastEventAt: Date | null
  }
  score: number
  recommendations: AIRecommendation[]
}

interface ServiceContext {
  db: Database
}

function parseDateOrNull(value: Date | string | undefined): Date | null {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function coerceNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback
}

function isRestartLikeEvent(reason: string | null, message: string | null): boolean {
  const source = `${reason ?? ''} ${message ?? ''}`.toLowerCase()
  return (
    source.includes('restart') ||
    source.includes('backoff') ||
    source.includes('crashloop') ||
    source.includes('oomkilled')
  )
}

function isTransientDbError(error: unknown): boolean {
  const source = error instanceof Error ? error.message : String(error)
  const normalized = source.toLowerCase()

  return (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('econnreset') ||
    normalized.includes('connection terminated') ||
    normalized.includes('connection reset') ||
    normalized.includes('too many clients') ||
    normalized.includes('could not connect')
  )
}

function buildSystemPrompt(analysis: ClusterAnalysis): string {
  return [
    'You are Voyager AI assistant for Kubernetes SRE operations.',
    'Keep answers concise, practical, and action-oriented.',
    `Cluster: ${analysis.clusterName} (${analysis.clusterId})`,
    `Score: ${analysis.score}/100`,
    `Snapshot: CPU=${analysis.snapshot.cpuUsagePercent.toFixed(1)}%; Memory=${analysis.snapshot.memoryUsagePercent.toFixed(1)}%; Restarts=${analysis.snapshot.podsRestarting}; Events=${analysis.snapshot.recentEventsCount}; LogErrorRate=${analysis.snapshot.logErrorRatePercent.toFixed(1)}%`,
    'Top recommendations:',
    ...analysis.recommendations
      .slice(0, 3)
      .map((rec) => `- [${rec.severity}] ${rec.title}: ${rec.action}`),
  ].join('\n')
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export class AIService {
  private readonly db: Database
  private readonly conversationStore: AiConversationStore

  public constructor(ctx: ServiceContext) {
    this.db = ctx.db
    this.conversationStore = new AiConversationStore(ctx.db)
  }

  private async resolveUserAiConfig(userId: string): Promise<{
    provider: 'openai' | 'anthropic'
    model: string
    apiKey: string
  }> {
    const [record] = await this.db
      .select({
        provider: userAiKeys.provider,
        model: userAiKeys.model,
        encryptedKey: userAiKeys.encryptedKey,
      })
      .from(userAiKeys)
      .where(eq(userAiKeys.userId, userId))
      .limit(1)

    if (!record) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'NO_API_KEY' })
    }

    return {
      provider: record.provider === 'claude' ? 'anthropic' : 'openai',
      model: record.model,
      apiKey: decryptApiKey(record.encryptedKey),
    }
  }

  private async withDbRetry<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt < AI_DB_RETRY.ATTEMPTS; attempt += 1) {
      try {
        return await operation()
      } catch (error) {
        lastError = error

        if (!isTransientDbError(error)) {
          throw error
        }

        if (attempt < AI_DB_RETRY.ATTEMPTS - 1) {
          await sleep(AI_DB_RETRY.BASE_DELAY_MS * (attempt + 1))
        }
      }
    }

    if (fallback && isTransientDbError(lastError)) {
      return fallback()
    }

    throw lastError
  }

  public async analyzeClusterHealth(
    clusterId: string,
    snapshot?: ClusterSnapshotInput,
  ): Promise<ClusterAnalysis> {
    const parsedSnapshot = snapshot ? clusterSnapshotSchema.parse(snapshot) : undefined

    const [cluster] = await this.withDbRetry(() =>
      this.db.select().from(clusters).where(eq(clusters.id, clusterId)).limit(1),
    )

    if (!cluster) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cluster not found' })
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentEvents = await this.withDbRetry(
      () =>
        this.db
          .select({
            reason: events.reason,
            message: events.message,
            timestamp: events.timestamp,
          })
          .from(events)
          .where(and(eq(events.clusterId, clusterId), gte(events.timestamp, oneHourAgo)))
          .orderBy(desc(events.timestamp)),
      () => [],
    )

    const latestEvent = await this.withDbRetry(
      () =>
        this.db
          .select({ timestamp: events.timestamp })
          .from(events)
          .where(eq(events.clusterId, clusterId))
          .orderBy(desc(events.timestamp))
          .limit(1),
      () => [],
    )

    const inferredRestartCount = recentEvents.filter((event) =>
      isRestartLikeEvent(event.reason, event.message),
    ).length

    const mergedSnapshot = {
      cpuUsagePercent: coerceNumber(parsedSnapshot?.cpuUsagePercent, 50),
      memoryUsagePercent: coerceNumber(parsedSnapshot?.memoryUsagePercent, 60),
      podsRestarting: coerceNumber(parsedSnapshot?.podsRestarting, inferredRestartCount),
      recentEventsCount: coerceNumber(parsedSnapshot?.recentEventsCount, recentEvents.length),
      logErrorRatePercent: coerceNumber(parsedSnapshot?.logErrorRatePercent, 1),
      lastEventAt:
        parseDateOrNull(parsedSnapshot?.lastEventAt) ?? latestEvent[0]?.timestamp ?? null,
    }

    const recommendations = this.generateRecommendations(mergedSnapshot)
    const score = this.calculateHealthScore(mergedSnapshot)

    return {
      clusterId,
      clusterName: cluster.name,
      snapshot: mergedSnapshot,
      score,
      recommendations,
    }
  }

  private generateRecommendations(snapshot: ClusterAnalysis['snapshot']): AIRecommendation[] {
    const recommendations: AIRecommendation[] = []

    if (snapshot.cpuUsagePercent > AI_SCORE.CPU_WARNING_THRESHOLD) {
      recommendations.push({
        severity: 'warning',
        title: 'High CPU utilization detected',
        description: `CPU usage is ${snapshot.cpuUsagePercent.toFixed(1)}%, above the ${AI_SCORE.CPU_WARNING_THRESHOLD}% threshold.`,
        action: 'Consider scaling up nodes or tuning resource requests/limits for hot workloads.',
      })
    }

    if (snapshot.memoryUsagePercent > AI_SCORE.MEMORY_WARNING_THRESHOLD) {
      recommendations.push({
        severity: 'warning',
        title: 'Memory pressure is rising',
        description: `Memory utilization reached ${snapshot.memoryUsagePercent.toFixed(1)}%.`,
        action:
          'Review memory-heavy workloads and tune limits or add capacity before OOM kills occur.',
      })
    }

    if (snapshot.podsRestarting > AI_SCORE.RESTART_WARNING_THRESHOLD) {
      recommendations.push({
        severity: 'critical',
        title: 'Frequent pod restarts',
        description: `${snapshot.podsRestarting} restart-related events were detected in the last hour.`,
        action:
          'Investigate crash loops, inspect container logs, and verify readiness/liveness probes.',
      })
    }

    if (snapshot.logErrorRatePercent > AI_SCORE.LOG_ERROR_RATE_THRESHOLD) {
      recommendations.push({
        severity: 'warning',
        title: 'Elevated log error rate',
        description: `Error-rate estimate is ${snapshot.logErrorRatePercent.toFixed(1)}% in recent logs.`,
        action: 'Investigate recent deployments and correlate errors with failing services.',
      })
    }

    const oneHourAgo = Date.now() - 60 * 60 * 1000
    if (
      !snapshot.lastEventAt ||
      snapshot.lastEventAt.getTime() < oneHourAgo ||
      snapshot.recentEventsCount === 0
    ) {
      recommendations.push({
        severity: 'info',
        title: 'Cluster appears idle',
        description: 'No meaningful events were recorded in the last hour.',
        action: 'If this is unexpected, validate event pipeline and workload activity.',
      })
    }

    if (recommendations.length === 0) {
      recommendations.push({
        severity: 'info',
        title: 'Cluster health looks stable',
        description: 'No rule-based anomalies were detected in current metrics/events/log signals.',
        action: 'Continue monitoring and keep autoscaling and alerts tuned.',
      })
    }

    return recommendations
  }

  public async getLatestThreadHistory(params: {
    clusterId: string
    userId: string
    messageLimit?: number
  }): Promise<{
    threadId: string
    clusterId: string
    title: string | null
    provider: 'openai' | 'anthropic'
    model: string
    createdAt: Date
    updatedAt: Date
    messages: Array<{
      id: string
      role: 'system' | 'user' | 'assistant'
      content: string
      createdAt: Date
    }>
  } | null> {
    const history = await this.conversationStore.getLatestThreadHistory({
      userId: params.userId,
      clusterId: params.clusterId,
      messageLimit: params.messageLimit,
    })

    if (!history) {
      return null
    }

    return {
      threadId: history.id,
      clusterId: history.clusterId,
      title: history.title,
      provider: history.provider,
      model: history.model,
      createdAt: history.createdAt,
      updatedAt: history.updatedAt,
      messages: history.messages,
    }
  }

  public async answerQuestion(params: {
    clusterId: string
    question: string
    snapshot?: ClusterSnapshotInput
    threadId?: string
    userId?: string
  }): Promise<{ answer: string; threadId?: string; provider?: string; model?: string }> {
    const chunks: string[] = []
    const result = await this.answerQuestionStream(params, async (token) => {
      chunks.push(token)
    })

    return {
      answer: chunks.join(''),
      threadId: result.threadId,
      provider: result.provider,
      model: result.model,
    }
  }

  public async answerQuestionStream(
    params: {
      clusterId: string
      question: string
      snapshot?: ClusterSnapshotInput
      threadId?: string
      userId?: string
    },
    onToken: (token: string) => Promise<void> | void,
  ): Promise<{ threadId?: string; provider?: string; model?: string }> {
    const analysis = await this.analyzeClusterHealth(params.clusterId, params.snapshot)

    if (!params.userId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'NO_API_KEY' })
    }

    const config = await this.resolveUserAiConfig(params.userId)
    const client = new AiProviderClient({
      ...config,
      timeoutMs: AI_CONFIG.REQUEST_TIMEOUT_MS,
      maxOutputTokens: AI_CONFIG.MAX_OUTPUT_TOKENS,
    })

    const promptMessages: AiChatMessage[] = []

    let persistedThreadId: string | undefined
    if (params.userId) {
      const thread = await this.conversationStore.upsertThread({
        threadId: params.threadId,
        clusterId: params.clusterId,
        userId: params.userId,
        provider: config.provider,
        model: config.model,
        title: params.question.slice(0, 120),
      })
      persistedThreadId = thread.id

      const history = await this.conversationStore.getThreadMessages({
        threadId: thread.id,
        userId: params.userId,
        clusterId: params.clusterId,
      })
      promptMessages.push(...history.slice(-20))
    }

    const systemMessage: AiChatMessage = { role: 'system', content: buildSystemPrompt(analysis) }
    const userMessage: AiChatMessage = { role: 'user', content: params.question }

    const request: AiCompletionRequest = {
      messages: [systemMessage, ...promptMessages, userMessage],
      temperature: 0.2,
    }

    if (persistedThreadId && params.userId) {
      await this.conversationStore.appendMessage({
        threadId: persistedThreadId,
        clusterId: params.clusterId,
        userId: params.userId,
        role: 'user',
        content: params.question,
        provider: config.provider,
        model: config.model,
      })
    }

    const assistantTokens: string[] = []

    await client.stream(request, {
      onToken: async (token) => {
        assistantTokens.push(token)
        await onToken(token)
      },
    })

    if (persistedThreadId && params.userId) {
      await this.conversationStore.appendMessage({
        threadId: persistedThreadId,
        clusterId: params.clusterId,
        userId: params.userId,
        role: 'assistant',
        content: assistantTokens.join(''),
        provider: config.provider,
        model: config.model,
      })
    }

    return {
      threadId: persistedThreadId,
      provider: config.provider,
      model: config.model,
    }
  }

  public async persistConversationExchange(params: {
    clusterId: string
    userId: string
    question: string
    answer: string
    threadId?: string
  }): Promise<{ threadId: string; provider: 'openai' | 'anthropic'; model: string }> {
    const providerConfig = await this.resolveUserAiConfig(params.userId)

    const thread = await this.conversationStore.upsertThread({
      threadId: params.threadId,
      clusterId: params.clusterId,
      userId: params.userId,
      provider: providerConfig.provider,
      model: providerConfig.model,
      title: params.question.slice(0, 120),
    })

    await this.conversationStore.appendMessage({
      threadId: thread.id,
      clusterId: params.clusterId,
      userId: params.userId,
      role: 'user',
      content: params.question,
      provider: thread.provider,
      model: thread.model,
    })

    await this.conversationStore.appendMessage({
      threadId: thread.id,
      clusterId: params.clusterId,
      userId: params.userId,
      role: 'assistant',
      content: params.answer,
      provider: thread.provider,
      model: thread.model,
    })

    return {
      threadId: thread.id,
      provider: thread.provider,
      model: thread.model,
    }
  }

  private calculateHealthScore(snapshot: ClusterAnalysis['snapshot']): number {
    let score: number = AI_SCORE.MAX

    if (snapshot.cpuUsagePercent > AI_SCORE.CPU_WARNING_THRESHOLD) {
      score -= AI_SCORE.CPU_PENALTY
    }

    if (snapshot.memoryUsagePercent > AI_SCORE.MEMORY_WARNING_THRESHOLD) {
      score -= AI_SCORE.MEMORY_PENALTY
    }

    if (snapshot.podsRestarting > AI_SCORE.RESTART_WARNING_THRESHOLD) {
      score -= AI_SCORE.RESTART_PENALTY
    }

    if (snapshot.logErrorRatePercent > AI_SCORE.LOG_ERROR_RATE_THRESHOLD) {
      score -= AI_SCORE.LOG_ERROR_PENALTY
    }

    if (snapshot.recentEventsCount === 0) {
      score = Math.min(AI_SCORE.MAX, score + AI_SCORE.IDLE_BONUS)
    }

    return Math.max(0, Math.min(AI_SCORE.MAX, score))
  }
}
