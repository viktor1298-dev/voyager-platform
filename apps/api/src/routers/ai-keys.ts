import { TRPCError } from '@trpc/server'
import { userAiKeys } from '@voyager/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { decryptApiKey, encryptApiKey, maskApiKey } from '../services/ai-key-crypto.js'
import { AiProviderClient } from '../services/ai-provider.js'
import { protectedProcedure, router } from '../trpc.js'

const userAiProviderSchema = z.enum(['openai', 'claude'])

function toClientProvider(provider: 'openai' | 'claude'): 'openai' | 'anthropic' {
  return provider === 'claude' ? 'anthropic' : provider
}

export const aiKeysRouter = router({
  save: protectedProcedure
    .input(
      z.object({
        provider: userAiProviderSchema,
        apiKey: z.string().min(1),
        model: z.string().min(1).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const encryptedKey = encryptApiKey(input.apiKey)

      await ctx.db
        .insert(userAiKeys)
        .values({
          userId: ctx.user.id,
          provider: input.provider,
          encryptedKey,
          model: input.model,
        })
        .onConflictDoUpdate({
          target: [userAiKeys.userId, userAiKeys.provider],
          set: {
            encryptedKey,
            model: input.model,
            updatedAt: new Date(),
          },
        })

      return {
        provider: input.provider,
        model: input.model,
        maskedKey: maskApiKey(input.apiKey),
      }
    }),

  get: protectedProcedure
    .input(
      z
        .object({
          provider: userAiProviderSchema.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          provider: userAiKeys.provider,
          model: userAiKeys.model,
          encryptedKey: userAiKeys.encryptedKey,
          updatedAt: userAiKeys.updatedAt,
        })
        .from(userAiKeys)
        .where(
          input?.provider
            ? and(eq(userAiKeys.userId, ctx.user.id), eq(userAiKeys.provider, input.provider))
            : eq(userAiKeys.userId, ctx.user.id),
        )

      return rows.map((row) => ({
        provider: row.provider,
        model: row.model,
        maskedKey: maskApiKey(decryptApiKey(row.encryptedKey)),
        updatedAt: row.updatedAt,
      }))
    }),

  delete: protectedProcedure
    .input(
      z.object({
        provider: userAiProviderSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(userAiKeys)
        .where(and(eq(userAiKeys.userId, ctx.user.id), eq(userAiKeys.provider, input.provider)))

      return { success: true }
    }),

  testConnection: protectedProcedure
    .input(
      z.object({
        provider: userAiProviderSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [record] = await ctx.db
        .select({
          encryptedKey: userAiKeys.encryptedKey,
          model: userAiKeys.model,
        })
        .from(userAiKeys)
        .where(and(eq(userAiKeys.userId, ctx.user.id), eq(userAiKeys.provider, input.provider)))
        .limit(1)

      if (!record) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'NO_API_KEY' })
      }

      const apiKey = decryptApiKey(record.encryptedKey)

      const client = new AiProviderClient({
        provider: toClientProvider(input.provider),
        model: record.model,
        apiKey,
        timeoutMs: 15_000,
        maxOutputTokens: 16,
      })

      await client.complete({
        messages: [
          { role: 'system', content: 'Connection test. Reply with OK.' },
          { role: 'user', content: 'ping' },
        ],
        temperature: 0,
      })

      return { success: true, provider: input.provider, model: record.model }
    }),
})
