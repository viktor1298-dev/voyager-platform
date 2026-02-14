import { TRPCError, initTRPC } from '@trpc/server'
import type { OpenApiMeta } from 'trpc-to-openapi'
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import { type Database, db } from '@voyager/db'
import { auth } from './lib/auth.js'
import { captureException } from './lib/sentry.js'

export interface Context {
  db: Database
  session: { userId: string; expiresAt: Date } | null
  user: { id: string; email: string; name: string; role: string | null } | null
  ipAddress: string | undefined
  res: CreateFastifyContextOptions['res']
}

export async function createContext({ req, res }: CreateFastifyContextOptions): Promise<Context> {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.append(key, String(value))
  }

  const result = await auth.api.getSession({ headers }).catch(() => null)

  const user = result?.user
    ? {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role ?? null,
      }
    : null

  return {
    db,
    session: result?.session ?? null,
    user,
    ipAddress: req.ip,
    res,
  }
}

/** tRPC error codes that are client errors — don't report to Sentry */
const CLIENT_ERROR_CODES = new Set(['UNAUTHORIZED', 'NOT_FOUND', 'BAD_REQUEST'])

const t = initTRPC.context<Context>().meta<OpenApiMeta>().create({
  errorFormatter({ shape, error }) {
    // Report non-client errors to Sentry
    if (!CLIENT_ERROR_CODES.has(error.code)) {
      captureException(error)
    }
    return {
      ...shape,
      data: {
        ...shape.data,
        stack: process.env.HIDE_STACK_TRACES === 'true' ? undefined : error.stack,
      },
    }
  },
})

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
  if (!ctx.session || !ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
  }
  return next({ ctx: { ...ctx, session: ctx.session, user: ctx.user } })
})

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' })
  }
  return next({ ctx })
})
