import bcrypt from 'bcryptjs'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { signToken } from '../lib/auth'
import { publicProcedure, protectedProcedure, router } from '../trpc'

const ADMIN_EMAIL = 'admin@voyager.local'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('ADMIN_PASSWORD required in production') })()
  : 'voyager-admin-2024')
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10)
const ADMIN_USER = { id: 'admin-001', email: ADMIN_EMAIL, role: 'admin' as const }

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(({ input, ctx }) => {
      if (input.email !== ADMIN_EMAIL || !bcrypt.compareSync(input.password, ADMIN_PASSWORD_HASH)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' })
      }
      const token = signToken(ADMIN_USER)
      const secure = process.env.USE_SECURE_COOKIES === 'true' ? '; Secure' : ''
      ctx.res.header('Set-Cookie', `voyager-token=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${secure}`)
      return { token, user: ADMIN_USER }
    }),

  me: protectedProcedure.query(({ ctx }) => {
    return ctx.user
  }),
})
