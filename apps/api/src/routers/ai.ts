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
        const answer = await aiService.answerQuestion({
          clusterId: input.clusterId,
          question: input.question,
          snapshot: input.snapshot,
        })

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
