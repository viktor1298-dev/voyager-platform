import { TRPCError, initTRPC } from '@trpc/server'
import { type Database, db } from '@voyager/db'
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import { type UserPayload, extractBearerToken, verifyToken } from './lib/auth'

export interface Context {
  db: Database
  user: UserPayload | null
  res: CreateFastifyContextOptions['res']
}

export function createContext({ req, res }: CreateFastifyContextOptions): Context {
  const cookieToken = req.headers.cookie
    ?.split(';')
    .map(c => c.trim().split('='))
    .find(([k]) => k === 'voyager-token')?.[1]
  const token = extractBearerToken(req.headers.authorization) ?? cookieToken
  const user = token ? verifyToken(token) : null
  return { db, user, res }
}

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure.use(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    if (error instanceof TRPCError) throw error
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})
