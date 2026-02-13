import { initTRPC } from '@trpc/server'
import { type Database, db } from '@voyager/db'

export interface Context {
  db: Database
}

export function createContext(): Context {
  return { db }
}

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure
