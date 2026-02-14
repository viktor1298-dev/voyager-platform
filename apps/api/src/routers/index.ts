import { router } from '../trpc'
import { alertsRouter } from './alerts'
import { authRouter } from './auth'
import { clustersRouter } from './clusters'
import { deploymentsRouter } from './deployments'
import { eventsRouter } from './events'
import { logsRouter } from './logs'
import { nodesRouter } from './nodes'

export const appRouter = router({
  alerts: alertsRouter,
  auth: authRouter,
  clusters: clustersRouter,
  deployments: deploymentsRouter,
  nodes: nodesRouter,
  events: eventsRouter,
  logs: logsRouter,
})

export type AppRouter = typeof appRouter
