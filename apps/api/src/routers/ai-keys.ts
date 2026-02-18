import { TRPCError } from '@trpc/server'
import { userAiKeys } from '@voyager/db'
import {
  aiKeyProviderSchema,
  aiKeysGetInputSchema,
  aiKeysGetOutputSchema,
  aiKeysSaveInputSchema,
  aiKeysSaveOutputSchema,
  aiKeysTestConnectionInputSchema,
  aiKeysTestConnectionOutputSchema,
} from '@voyager/types'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { decryptApiKey, encryptApiKey, maskApiKey } from '../services/ai-key-crypto.js'
import { AiProviderClient } from '../services/ai-provider.js'
import { protectedProcedure, router } from '../trpc.js'

const deleteAiKeyOutputSchema = z.object({ success: z.literal(true) })

function toClientProvider(provider: 'openai' | 'claude'): 'openai' | 'anthropic' {
  return provider === 'claude' ? 'anthropic' : provider
}

export const aiKeysRouter = router({
  save: protectedProcedure
    .input(aiKeysSaveInputSchema)
    .output(aiKeysSaveOutputSchema)
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

      const updatedAt = new Date()
      const maskedKey = maskApiKey(input.apiKey)

      return {
        key: {
          provider: input.provider,
          model: input.model,
          maskedKey,
          updatedAt,
        },
        provider: input.provider,
        model: input.model,
        maskedKey,
        updatedAt,
      }
    }),

  get: protectedProcedure
    .input(aiKeysGetInputSchema)
    .output(aiKeysGetOutputSchema)
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
        .orderBy(desc(userAiKeys.updatedAt), userAiKeys.provider)

      const keys = rows.map((row) => ({
        provider: row.provider,
        model: row.model,
        maskedKey: maskApiKey(decryptApiKey(row.encryptedKey)),
        updatedAt: row.updatedAt,
      }))

      return { keys, items: keys }
    }),

  delete: protectedProcedure
    .input(
      z.object({
        provider: aiKeyProviderSchema,
      }),
    )
    .output(deleteAiKeyOutputSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(userAiKeys)
        .where(and(eq(userAiKeys.userId, ctx.user.id), eq(userAiKeys.provider, input.provider)))

      return { success: true }
    }),

  testConnection: protectedProcedure
    .input(aiKeysTestConnectionInputSchema)
    .output(aiKeysTestConnectionOutputSchema)
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
