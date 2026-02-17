import { TRPCError } from '@trpc/server'
import { aiConversations, aiRecommendations } from '@voyager/db'
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
})

const suggestionsInputSchema = z.object({
  clusterId: z.string().uuid(),
  snapshot: clusterSnapshotSchema.optional(),
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

function buildDegradedChatAnswer(question: string, snapshot?: z.infer<typeof clusterSnapshotSchema>): string {
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

  chat: protectedProcedure
    .input(chatInputSchema)
    .output(z.object({ answer: z.string(), conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const aiService = new AIService({ db: ctx.db })
        let answer: string

        try {
          answer = await aiService.answerQuestion({
            clusterId: input.clusterId,
            question: input.question,
            snapshot: input.snapshot,
          })
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

        const timestamp = new Date().toISOString()
        const messages = [
          { role: 'user' as const, content: input.question, timestamp },
          { role: 'assistant' as const, content: answer, timestamp },
        ]

        const fallbackConversationId = crypto.randomUUID()
        let conversationId = fallbackConversationId

        try {
          const [conversation] = await ctx.db
            .insert(aiConversations)
            .values({
              clusterId: input.clusterId,
              userId: ctx.user.id,
              messages,
            })
            .returning({ id: aiConversations.id })

          if (conversation?.id) {
            conversationId = conversation.id
          }
        } catch (persistError) {
          console.error('[ai.chat] Failed to persist AI conversation, continuing with response', {
            clusterId: input.clusterId,
            userId: ctx.user.id,
            error: persistError instanceof Error ? persistError.message : String(persistError),
          })
        }

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
