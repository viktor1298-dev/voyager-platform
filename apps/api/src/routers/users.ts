import { adminProcedure, router } from '../trpc'
import { user as userTable, account as accountTable } from '@voyager/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { auth } from '../lib/auth'

export const usersRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      createdAt: userTable.createdAt,
      banned: userTable.banned,
    }).from(userTable).orderBy(userTable.createdAt)
    return users
  }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(['admin', 'viewer']).default('viewer'),
    }))
    .mutation(async ({ ctx, input }) => {
      // Use Better-Auth admin API to create user
      const headers = new Headers()
      headers.set('x-admin-secret', 'internal')
      
      try {
        // Use auth.api to create user via Better-Auth
        const result = await auth.api.signUpEmail({
          body: {
            name: input.name,
            email: input.email,
            password: input.password,
          },
        })

        // Update role if admin
        if (input.role === 'admin' && result?.user?.id) {
          await ctx.db.update(userTable)
            .set({ role: 'admin' })
            .where(eq(userTable.id, result.user.id))
        }

        return { success: true, userId: result?.user?.id }
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to create user',
        })
      }
    }),

  updateRole: adminProcedure
    .input(z.object({
      userId: z.string(),
      role: z.enum(['admin', 'viewer']),
    }))
    .mutation(async ({ ctx, input }) => {
      // Prevent self-demotion
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot change your own role' })
      }
      await ctx.db.update(userTable)
        .set({ role: input.role })
        .where(eq(userTable.id, input.userId))
      return { success: true }
    }),

  delete: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete yourself' })
      }
      // Delete accounts first (FK), then user
      await ctx.db.delete(accountTable).where(eq(accountTable.userId, input.userId))
      await ctx.db.delete(userTable).where(eq(userTable.id, input.userId))
      return { success: true }
    }),
})
