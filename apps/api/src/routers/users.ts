import { adminProcedure, router } from '../trpc'
import { user as userTable, account as accountTable, session as sessionTable } from '@voyager/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { auth } from '../lib/auth'
import { logAudit } from '../lib/audit'

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
      try {
        // Use auth.api to create user via Better-Auth
        const result = await auth.api.signUpEmail({
          body: {
            name: input.name,
            email: input.email,
            password: input.password,
          },
        })

        // Set role via Better-Auth admin API
        if (result?.user?.id) {
          await auth.api.setRole({
            headers: new Headers(),
            body: { userId: result.user.id, role: input.role === 'viewer' ? 'user' : input.role },
          })
        }

        await logAudit(ctx, 'user.create', 'user', result?.user?.id, { email: input.email, role: input.role })

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
      await logAudit(ctx, 'user.role_change', 'user', input.userId, { newRole: input.role })
      return { success: true }
    }),

  delete: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete yourself' })
      }
      // Delete sessions, accounts (FKs), then user — atomically
      await ctx.db.transaction(async (tx) => {
        await tx.delete(sessionTable).where(eq(sessionTable.userId, input.userId))
        await tx.delete(accountTable).where(eq(accountTable.userId, input.userId))
        await tx.delete(userTable).where(eq(userTable.id, input.userId))
      })
      await logAudit(ctx, 'user.delete', 'user', input.userId)
      return { success: true }
    }),
})
