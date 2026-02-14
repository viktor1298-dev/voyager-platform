import { router } from '../trpc'
import { alertsRouter } from './alerts'
import { authRouter } from './auth'
import { clustersRouter } from './clusters'
import { deploymentsRouter } from './deployments'
import { eventsRouter } from './events'
import { healthRouter } from './health'
import { logsRouter } from './logs'
import { nodesRouter } from './nodes'
import { usersRouter } from './users'

export const appRouter = router({
  alerts: alertsRouter,
  auth: authRouter,
  clusters: clustersRouter,
  deployments: deploymentsRouter,
  health: healthRouter,
  nodes: nodesRouter,
  events: eventsRouter,
  logs: logsRouter,
  users: usersRouter,
})

export type AppRouter = typeof appRouter
