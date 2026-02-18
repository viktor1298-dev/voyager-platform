import { TRPCError } from '@trpc/server'
import { aiRecommendations } from '@voyager/db'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { AIService, aiRecommendationSchema, clusterSnapshotSchema } from '../services/ai-service.js'
import { protectedProcedure, router } from '../trpc.js'

const analyzeInputSchema = z.object({
  clusterId: z.string().uuid(),
  snapshot: clusterSnapshotSchema.optional(),
})

const chatInputSchema = z.object({
  clusterId: z.string().uuid(),
  question: z.string().min(1).max(2000),
  snapshot: clusterSnapshotSchema.optional(),
  threadId: z.string().uuid().optional(),
})

const suggestionsInputSchema = z.object({
  clusterId: z.string().uuid(),
  snapshot: clusterSnapshotSchema.optional(),
})

const historyInputSchema = z.object({
  clusterId: z.string().uuid(),
  messageLimit: z.number().int().min(1).max(500).optional(),
})

const LOGICAL_AI_ERROR_CODES = new Set(['NOT_FOUND', 'BAD_REQUEST'])
const TRANSIENT_AI_ERROR_PATTERNS = [
  'timeout',
  'timed out',
  'econnreset',
  'econnrefused',
  'connection refused',
  'connection reset',
  'connection terminated',
  'could not connect',
]

function isTransientAiError(error: unknown): boolean {
  if (error instanceof TRPCError && LOGICAL_AI_ERROR_CODES.has(error.code)) {
    return false
  }

  const message = error instanceof Error ? error.message : String(error)
  const normalizedMessage = message.toLowerCase()

  const rawCode =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code).toLowerCase()
      : ''

  return (
    TRANSIENT_AI_ERROR_PATTERNS.some((pattern) => normalizedMessage.includes(pattern)) ||
    rawCode === 'econnreset' ||
    rawCode === 'econnrefused' ||
    rawCode === 'etimedout'
  )
}

function buildDegradedChatAnswer(
  question: string,
  snapshot?: z.infer<typeof clusterSnapshotSchema>,
): string {
  const q = question.trim().toLowerCase()

  if (q.includes('cpu') && snapshot?.cpuUsagePercent !== undefined) {
    return `Live AI analysis is temporarily unavailable, but the latest provided CPU signal is ${snapshot.cpuUsagePercent.toFixed(1)}%. Please retry in a few seconds for full recommendations.`
  }

  if ((q.includes('restart') || q.includes('crash')) && snapshot?.podsRestarting !== undefined) {
    return `Live AI analysis is temporarily unavailable. Latest provided restart signal: ${snapshot.podsRestarting} restarting pods/events. Please retry in a few seconds for deeper diagnosis.`
  }

  return 'Live AI analysis is temporarily unavailable. I can still respond with cached/basic signals, and full analysis should recover shortly. Please retry in a few seconds.'
}

const analysisOutputSchema = z.object({
  clusterId: z.string().uuid(),
  clusterName: z.string(),
  snapshot: z.object({
    cpuUsagePercent: z.number(),
    memoryUsagePercent: z.number(),
    podsRestarting: z.number().int(),
    recentEventsCount: z.number().int(),
    logErrorRatePercent: z.number(),
    lastEventAt: z.date().nullable(),
  }),
  score: z.number().int().min(0).max(100),
  recommendations: z.array(aiRecommendationSchema),
})

const historyOutputSchema = z.object({
  conversationId: z.string().uuid(),
  threadId: z.string().uuid(),
  clusterId: z.string().uuid(),
  title: z.string().nullable(),
  provider: z.enum(['openai', 'anthropic']),
  model: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  messages: z.array(
    z.object({
      id: z.string().uuid(),
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
      createdAt: z.date(),
    }),
  ),
})

export const aiRouter = router({
  analyze: protectedProcedure
    .input(analyzeInputSchema)
    .output(analysisOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const aiService = new AIService({ db: ctx.db })
        const analysis = await aiService.analyzeClusterHealth(input.clusterId, input.snapshot)

        await logAudit(ctx, 'ai.analyze', 'cluster', input.clusterId, {
          recommendationCount: analysis.recommendations.length,
          score: analysis.score,
        })

        return analysis
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to analyze cluster: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),

  history: protectedProcedure
    .input(historyInputSchema)
    .output(historyOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      try {
        const aiService = new AIService({ db: ctx.db })
        const history = await aiService.getLatestThreadHistory({
          clusterId: input.clusterId,
          userId: ctx.user.id,
          messageLimit: input.messageLimit,
        })

        if (!history) {
          return null
        }

        return {
          conversationId: history.threadId,
          threadId: history.threadId,
          clusterId: history.clusterId,
          title: history.title,
          provider: history.provider,
          model: history.model,
          createdAt: history.createdAt,
          updatedAt: history.updatedAt,
          messages: history.messages,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch AI history: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),

  chat: protectedProcedure
    .input(chatInputSchema)
    .output(
      z.object({
        answer: z.string(),
        conversationId: z.string().uuid(),
        threadId: z.string().uuid().optional(),
        provider: z.string().optional(),
        model: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const aiService = new AIService({ db: ctx.db })
        let answer: string
        let threadId: string | undefined = input.threadId
        let provider: string | undefined
        let model: string | undefined

        try {
          const aiResult = await aiService.answerQuestion({
            clusterId: input.clusterId,
            question: input.question,
            snapshot: input.snapshot,
            threadId: input.threadId,
            userId: ctx.user.id,
          })
          answer = aiResult.answer
          threadId = aiResult.threadId
          provider = aiResult.provider
          model = aiResult.model
        } catch (aiError) {
          if (!isTransientAiError(aiError)) {
            throw aiError
          }

          console.error('[ai.chat] AI answer generation failed, returning degraded response', {
            clusterId: input.clusterId,
            userId: ctx.user.id,
            error: aiError instanceof Error ? aiError.message : String(aiError),
          })

          answer = buildDegradedChatAnswer(input.question, input.snapshot)
        }

        if (!threadId) {
          try {
            const persisted = await aiService.persistConversationExchange({
              clusterId: input.clusterId,
              userId: ctx.user.id,
              question: input.question,
              answer,
              threadId: input.threadId,
            })
            threadId = persisted.threadId
            provider = persisted.provider
            model = persisted.model
          } catch (persistError) {
            console.error('[ai.chat] Failed to persist fallback exchange', {
              clusterId: input.clusterId,
              userId: ctx.user.id,
              error: persistError instanceof Error ? persistError.message : String(persistError),
            })
          }
        }

        const conversationId = threadId ?? crypto.randomUUID()

        try {
          await logAudit(ctx, 'ai.chat', 'cluster', input.clusterId, {
            conversationId,
            questionLength: input.question.length,
          })
        } catch (auditError) {
          console.error('[ai.chat] Failed to write audit log', {
            clusterId: input.clusterId,
            userId: ctx.user.id,
            error: auditError instanceof Error ? auditError.message : String(auditError),
          })
        }

        return {
          answer,
          conversationId,
          threadId,
          provider,
          model,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `AI chat failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),



  suggestions: protectedProcedure
    .input(suggestionsInputSchema)
    .output(
      z.object({
        score: z.number().int().min(0).max(100),
        recommendations: z.array(aiRecommendationSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const aiService = new AIService({ db: ctx.db })
        const analysis = await aiService.analyzeClusterHealth(input.clusterId, input.snapshot)

        for (const recommendation of analysis.recommendations) {
          const [existing] = await ctx.db
            .select({ id: aiRecommendations.id })
            .from(aiRecommendations)
            .where(
              and(
                eq(aiRecommendations.clusterId, input.clusterId),
                eq(aiRecommendations.title, recommendation.title),
                eq(aiRecommendations.status, 'open'),
              ),
            )
            .orderBy(desc(aiRecommendations.createdAt))
            .limit(1)

          if (!existing) {
            await ctx.db.insert(aiRecommendations).values({
              clusterId: input.clusterId,
              severity: recommendation.severity,
              title: recommendation.title,
              description: recommendation.description,
              action: recommendation.action,
              status: 'open',
            })
          }
        }

        await logAudit(ctx, 'ai.suggestions', 'cluster', input.clusterId, {
          recommendationCount: analysis.recommendations.length,
          score: analysis.score,
        })

        return {
          score: analysis.score,
          recommendations: analysis.recommendations,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),
})
