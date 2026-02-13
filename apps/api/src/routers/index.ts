import { router } from '../trpc'
import { clustersRouter } from './clusters'
import { eventsRouter } from './events'
import { nodesRouter } from './nodes'

export const appRouter = router({
  clusters: clustersRouter,
  nodes: nodesRouter,
  events: eventsRouter,
})

export type AppRouter = typeof appRouter
