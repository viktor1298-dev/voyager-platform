import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { logAudit } from '../lib/audit.js'
import { AiKeySettingsService } from '../services/ai-key-settings-service.js'
import { AIService, aiRecommendationSchema, clusterSnapshotSchema } from '../services/ai-service.js'
import { protectedProcedure, router } from '../trpc.js'

// M-P3-003: Inline AI context chat schema
const contextChatInputSchema = z.object({
  prompt: z.string().min(1).max(4000),
  context: z.object({
    type: z.enum(['anomaly', 'pod', 'alert', 'cluster', 'dashboard']),
    data: z.record(z.string(), z.unknown()),
  }),
  clusterId: z.string().uuid().optional(),
})

// M-P3-003: Proactive insights schema
const proactiveInsightsInputSchema = z.object({
  clusterId: z.string().uuid().optional(),
  criticalAnomalyCount: z.number().int().min(0).optional(),
  criticalAlertCount: z.number().int().min(0).optional(),
})

const analyzeInputSchema = z.object({
  clusterId: z.string().uuid(),
  snapshot: clusterSnapshotSchema.optional(),
})

const chatInputSchema = z.object({
  clusterId: z.string().uuid(),
  question: z.string().min(1).max(2000),
  snapshot: clusterSnapshotSchema.optional(),
  threadId: z.string().uuid().optional(),
  provider: z.enum(['openai', 'claude']).optional(),
})

const suggestionsInputSchema = z.object({
  clusterId: z.string().uuid(),
  snapshot: clusterSnapshotSchema.optional(),
})

const historyInputSchema = z.object({
  clusterId: z.string().uuid(),
  messageLimit: z.number().int().min(1).max(500).optional(),
})

const aiProviderSchema = z.enum(['openai', 'anthropic'])

const aiKeySettingsInputSchema = z.object({
  provider: aiProviderSchema,
  apiKey: z.string().min(10).max(512),
  model: z.string().min(1).max(120),
})

const aiKeyStatusInputSchema = z.object({
  provider: aiProviderSchema.optional(),
})

const aiKeyProviderInputSchema = z.object({
  provider: aiProviderSchema,
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

        try {
          await logAudit(ctx, 'ai.analyze', 'cluster', input.clusterId, {
            recommendationCount: analysis.recommendations.length,
            score: analysis.score,
          })
        } catch (auditError) {
          ctx.log.error(
            { clusterId: input.clusterId, userId: ctx.user.id, err: auditError },
            'Failed to write audit log',
          )
        }

        return analysis
      } catch (error) {
        if (error instanceof TRPCError) throw error

        if (isTransientAiError(error)) {
          ctx.log.error(
            { clusterId: input.clusterId, userId: ctx.user.id, err: error },
            'Analyze request failed due to transient backend error',
          )
          throw new TRPCError({
            code: 'SERVICE_UNAVAILABLE',
            message: 'Analyze Health is temporarily unavailable. Please retry shortly.',
          })
        }

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
        provider: z.enum(['openai', 'anthropic']).optional(),
        model: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const aiService = new AIService({ db: ctx.db })
        let answer: string
        let threadId: string | undefined = input.threadId
        let provider: 'openai' | 'anthropic' | undefined
        let model: string | undefined

        try {
          const aiResult = await aiService.answerQuestion({
            clusterId: input.clusterId,
            question: input.question,
            snapshot: input.snapshot,
            threadId: input.threadId,
            userId: ctx.user.id,
            provider: input.provider,
          })
          answer = aiResult.answer
          threadId = aiResult.threadId
          provider = aiResult.provider
          model = aiResult.model
        } catch (aiError) {
          if (
            aiError instanceof TRPCError &&
            aiError.code === 'BAD_REQUEST' &&
            aiError.message === 'NO_API_KEY'
          ) {
            throw aiError
          }

          if (!isTransientAiError(aiError)) {
            throw aiError
          }

          throw new TRPCError({
            code: 'SERVICE_UNAVAILABLE',
            message: `AI chat failed: ${aiError instanceof Error ? aiError.message : 'upstream timeout'}`,
          })
        }

        if (!threadId) {
          try {
            const persisted = await aiService.persistConversationExchange({
              clusterId: input.clusterId,
              userId: ctx.user.id,
              question: input.question,
              answer,
              threadId: input.threadId,
              provider: input.provider,
            })
            threadId = persisted.threadId
            provider = persisted.provider
            model = persisted.model
          } catch (persistError) {
            ctx.log.error(
              { clusterId: input.clusterId, userId: ctx.user.id, err: persistError },
              'Failed to persist AI exchange',
            )
          }
        }

        const conversationId = threadId ?? crypto.randomUUID()

        try {
          await logAudit(ctx, 'ai.chat', 'cluster', input.clusterId, {
            conversationId,
            questionLength: input.question.length,
          })
        } catch (auditError) {
          ctx.log.error(
            { clusterId: input.clusterId, userId: ctx.user.id, err: auditError },
            'Failed to write audit log',
          )
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

  keySettingsCreate: protectedProcedure
    .input(aiKeySettingsInputSchema)
    .output(
      z.object({
        provider: aiProviderSchema,
        model: z.string(),
        maskedKey: z.string(),
        hasKey: z.literal(true),
        updatedAt: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = new AiKeySettingsService(ctx.db)
      const provider = input.provider
      const tested = await service.testConnection({
        provider,
        model: input.model,
        apiKey: input.apiKey,
      })

      if (!tested.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: tested.error ?? 'Failed to validate provider key',
        })
      }

      const key = await service.upsertUserKey({
        userId: ctx.user.id,
        provider,
        model: input.model,
        apiKey: input.apiKey,
      })

      return {
        ...key,
        provider: key.provider,
      }
    }),

  keySettingsUpdate: protectedProcedure
    .input(aiKeySettingsInputSchema)
    .output(
      z.object({
        provider: aiProviderSchema,
        model: z.string(),
        maskedKey: z.string(),
        hasKey: z.literal(true),
        updatedAt: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = new AiKeySettingsService(ctx.db)
      const provider = input.provider
      const tested = await service.testConnection({
        provider,
        model: input.model,
        apiKey: input.apiKey,
      })

      if (!tested.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: tested.error ?? 'Failed to validate provider key',
        })
      }

      const key = await service.upsertUserKey({
        userId: ctx.user.id,
        provider,
        model: input.model,
        apiKey: input.apiKey,
      })

      return {
        ...key,
        provider: key.provider,
      }
    }),

  keySettingsTestConnection: protectedProcedure
    .input(aiKeySettingsInputSchema)
    .output(
      z.object({
        ok: z.boolean(),
        provider: aiProviderSchema,
        model: z.string(),
        error: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = new AiKeySettingsService(ctx.db)
      const result = await service.testConnection({
        provider: input.provider,
        model: input.model,
        apiKey: input.apiKey,
      })

      return {
        ...result,
        provider: result.provider,
      }
    }),

  keySettingsStatus: protectedProcedure
    .input(aiKeyStatusInputSchema)
    .output(
      z.array(
        z.object({
          provider: aiProviderSchema,
          model: z.string(),
          maskedKey: z.string(),
          hasKey: z.literal(true),
          updatedAt: z.date(),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const service = new AiKeySettingsService(ctx.db)
      const keys = await service.getUserKeyStatus({
        userId: ctx.user.id,
        provider: input.provider,
      })

      return keys.map((key) => ({
        ...key,
        provider: key.provider,
      }))
    }),

  keys: router({
    get: protectedProcedure
      .output(
        z.object({
          keys: z.array(
            z.object({
              provider: aiProviderSchema,
              model: z.string(),
              maskedKey: z.string(),
              hasKey: z.literal(true),
              updatedAt: z.date(),
            }),
          ),
        }),
      )
      .query(async ({ ctx }) => {
        const service = new AiKeySettingsService(ctx.db)
        const keys = await service.getUserKeyStatus({ userId: ctx.user.id })
        return {
          keys: keys.map((key) => ({
            ...key,
            provider: key.provider,
          })),
        }
      }),

    save: protectedProcedure
      .input(aiKeySettingsInputSchema)
      .output(
        z.object({
          key: z.object({
            provider: aiProviderSchema,
            model: z.string(),
            maskedKey: z.string(),
            hasKey: z.literal(true),
            updatedAt: z.date(),
          }),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const service = new AiKeySettingsService(ctx.db)
        const provider = input.provider
        const tested = await service.testConnection({
          provider,
          model: input.model,
          apiKey: input.apiKey,
        })

        if (!tested.ok) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: tested.error ?? 'Failed to validate provider key',
          })
        }

        const key = await service.upsertUserKey({
          userId: ctx.user.id,
          provider,
          model: input.model,
          apiKey: input.apiKey,
        })

        return {
          key: {
            ...key,
            provider: key.provider,
          },
        }
      }),

    upsert: protectedProcedure
      .input(aiKeySettingsInputSchema)
      .output(
        z.object({
          key: z.object({
            provider: aiProviderSchema,
            model: z.string(),
            maskedKey: z.string(),
            hasKey: z.literal(true),
            updatedAt: z.date(),
          }),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const service = new AiKeySettingsService(ctx.db)
        const provider = input.provider
        const tested = await service.testConnection({
          provider,
          model: input.model,
          apiKey: input.apiKey,
        })

        if (!tested.ok) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: tested.error ?? 'Failed to validate provider key',
          })
        }

        const key = await service.upsertUserKey({
          userId: ctx.user.id,
          provider,
          model: input.model,
          apiKey: input.apiKey,
        })

        return {
          key: {
            ...key,
            provider: key.provider,
          },
        }
      }),

    testConnection: protectedProcedure
      .input(aiKeySettingsInputSchema)
      .output(
        z.object({
          success: z.boolean(),
          provider: aiProviderSchema,
          model: z.string(),
          error: z.string().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const service = new AiKeySettingsService(ctx.db)
        const provider = input.provider
        const result = await service.testConnection({
          provider,
          model: input.model,
          apiKey: input.apiKey,
        })

        return {
          success: result.ok,
          provider: result.provider,
          model: result.model,
          error: result.error,
        }
      }),

    delete: protectedProcedure
      .input(aiKeyProviderInputSchema)
      .output(
        z.object({
          deleted: z.boolean(),
          provider: aiProviderSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const service = new AiKeySettingsService(ctx.db)
        const result = await service.deleteUserKey({
          userId: ctx.user.id,
          provider: input.provider,
        })

        return {
          deleted: result.deleted,
          provider: input.provider,
        }
      }),

    testStoredConnection: protectedProcedure
      .input(aiKeyProviderInputSchema)
      .output(
        z.object({
          success: z.boolean(),
          provider: aiProviderSchema,
          model: z.string().optional(),
          error: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const service = new AiKeySettingsService(ctx.db)
        const result = await service.testStoredConnection({
          userId: ctx.user.id,
          provider: input.provider,
        })

        return {
          success: result.ok,
          provider: result.provider,
          model: result.model,
          error: result.error,
        }
      }),
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

        // Read-only AI rule: compute and return recommendations only.
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

  // M-P3-003: Contextual inline AI chat
  contextChat: protectedProcedure
    .input(contextChatInputSchema)
    .output(
      z.object({
        answer: z.string(),
        contextType: z.string(),
        provider: z.string().optional(),
        model: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const aiService = new AIService({ db: ctx.db })

        // Build context-aware prompt
        const contextSummary = JSON.stringify(input.context.data, null, 2)
        const systemPrompt = `You are an expert Kubernetes and cloud infrastructure assistant integrated into the Voyager platform.
The user is asking about a ${input.context.type} in their cluster.
Context data:
${contextSummary}

Provide a concise, actionable response focused on the specific context. Use markdown for formatting.`

        // Use existing answerQuestion with a synthetic clusterId or provided one
        const clusterId = input.clusterId ?? '00000000-0000-0000-0000-000000000000'

        let answer: string
        let provider: 'openai' | 'anthropic' | undefined
        let model: string | undefined

        try {
          const result = await aiService.answerQuestion({
            clusterId,
            question: `${systemPrompt}\n\nUser question: ${input.prompt}`,
            userId: ctx.user.id,
          })
          answer = result.answer
          provider = result.provider
          model = result.model
        } catch (aiError) {
          if (
            aiError instanceof TRPCError &&
            aiError.code === 'BAD_REQUEST' &&
            aiError.message === 'NO_API_KEY'
          ) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'NO_API_KEY',
            })
          }
          throw aiError
        }

        return {
          answer,
          contextType: input.context.type,
          provider,
          model,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Context chat failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),

  // M-P3-003: Proactive dashboard insights
  proactiveInsights: protectedProcedure
    .input(proactiveInsightsInputSchema)
    .output(
      z.object({
        hasInsights: z.boolean(),
        summary: z.string(),
        severity: z.enum(['info', 'warning', 'critical']),
        insights: z.array(
          z.object({
            type: z.string(),
            message: z.string(),
            action: z.string().optional(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const keyService = new AiKeySettingsService(ctx.db)
        const keys = await keyService.getUserKeyStatus({ userId: ctx.user.id })

        if (keys.length === 0) {
          return {
            hasInsights: false,
            summary: 'Configure an AI key in Settings to enable proactive insights.',
            severity: 'info' as const,
            insights: [],
          }
        }

        const criticalAnomalies = input.criticalAnomalyCount ?? 0
        const criticalAlerts = input.criticalAlertCount ?? 0
        const totalCritical = criticalAnomalies + criticalAlerts

        if (totalCritical === 0) {
          return {
            hasInsights: false,
            summary: 'All systems operating normally.',
            severity: 'info' as const,
            insights: [],
          }
        }

        const severity = totalCritical >= 5 ? 'critical' : totalCritical >= 2 ? 'warning' : 'info'

        const insights = []
        if (criticalAnomalies > 0) {
          insights.push({
            type: 'anomaly',
            message: `${criticalAnomalies} critical anomal${criticalAnomalies === 1 ? 'y' : 'ies'} detected`,
            action: 'Review and acknowledge anomalies to prevent escalation',
          })
        }
        if (criticalAlerts > 0) {
          insights.push({
            type: 'alert',
            message: `${criticalAlerts} alert${criticalAlerts === 1 ? '' : 's'} firing`,
            action: 'Check alert thresholds and remediate affected services',
          })
        }

        return {
          hasInsights: true,
          summary: `${totalCritical} critical issue${totalCritical === 1 ? '' : 's'} require${totalCritical === 1 ? 's' : ''} attention`,
          severity: severity as 'info' | 'warning' | 'critical',
          insights,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to get proactive insights: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }),
})
