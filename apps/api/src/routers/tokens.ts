import crypto from 'node:crypto'
import { userTokens } from '@voyager/db'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc.js'

const createTokenInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
})

const revokeTokenInputSchema = z.object({
  id: z.string().uuid(),
})

function generatePersonalToken(): string {
  return `vl_${crypto.randomBytes(32).toString('hex')}`
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export const tokensRouter = router({
  createToken: protectedProcedure.input(createTokenInputSchema).mutation(async ({ ctx, input }) => {
    const token = generatePersonalToken()
    const tokenHash = hashToken(token)

    const [created] = await ctx.db
      .insert(userTokens)
      .values({
        userId: ctx.user.id,
        name: input.name,
        tokenHash,
      })
      .returning({
        id: userTokens.id,
        name: userTokens.name,
      })

    return {
      id: created.id,
      name: created.name,
      token,
    }
  }),

  listTokens: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: userTokens.id,
        name: userTokens.name,
        createdAt: userTokens.createdAt,
        lastUsedAt: userTokens.lastUsedAt,
      })
      .from(userTokens)
      .where(eq(userTokens.userId, ctx.user.id))
      .orderBy(desc(userTokens.createdAt))
  }),

  revokeToken: protectedProcedure.input(revokeTokenInputSchema).mutation(async ({ ctx, input }) => {
    const [deleted] = await ctx.db
      .delete(userTokens)
      .where(and(eq(userTokens.id, input.id), eq(userTokens.userId, ctx.user.id)))
      .returning({ id: userTokens.id })

    return { success: Boolean(deleted) }
  }),
})
