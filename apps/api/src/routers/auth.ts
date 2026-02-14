import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { signToken } from '../lib/auth'
import { publicProcedure, protectedProcedure, router } from '../trpc'

const ADMIN_EMAIL = 'admin@voyager.local'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'
const ADMIN_USER = { id: 'admin-001', email: ADMIN_EMAIL, role: 'admin' as const }

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(({ input }) => {
      if (input.email !== ADMIN_EMAIL || input.password !== ADMIN_PASSWORD) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' })
      }
      const token = signToken(ADMIN_USER)
      return { token, user: ADMIN_USER }
    }),

  me: protectedProcedure.query(({ ctx }) => {
    return ctx.user
  }),
})
