import { TRPCError, initTRPC } from '@trpc/server'
import { type Database, db } from '@voyager/db'

export interface Context {
  db: Database
}

export function createContext(): Context {
  return { db }
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
