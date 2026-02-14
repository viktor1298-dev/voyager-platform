import { router } from '../trpc'
import { authRouter } from './auth'
import { clustersRouter } from './clusters'
import { eventsRouter } from './events'
import { nodesRouter } from './nodes'

export const appRouter = router({
  auth: authRouter,
  clusters: clustersRouter,
  nodes: nodesRouter,
  events: eventsRouter,
})

export type AppRouter = typeof appRouter
