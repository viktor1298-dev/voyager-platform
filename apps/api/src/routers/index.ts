import { router } from '../trpc.js'
import { aiRouter } from './ai.js'
import { alertsRouter } from './alerts.js'
import { authorizationRouter, teamsRouter } from './authorization.js'
import { auditRouter } from './audit.js'
import { authRouter } from './auth.js'
import { clustersRouter } from './clusters.js'
import { deploymentsRouter } from './deployments.js'
import { eventsRouter } from './events.js'
import { featuresRouter } from './features.js'
import { healthRouter } from './health.js'
import { logsRouter } from './logs.js'
import { metricsRouter } from './metrics.js'
import { nodesRouter } from './nodes.js'
import { karpenterRouter } from './karpenter.js'
import { subscriptionsRouter } from './subscriptions.js'
import { ssoRouter } from './sso.js'
import { usersRouter } from './users.js'

export const appRouter = router({
  ai: aiRouter,
  alerts: alertsRouter,
  audit: auditRouter,
  auth: authRouter,
  authorization: authorizationRouter,
  clusters: clustersRouter,
  deployments: deploymentsRouter,
  health: healthRouter,
  nodes: nodesRouter,
  events: eventsRouter,
  features: featuresRouter,
  logs: logsRouter,
  metrics: metricsRouter,
  karpenter: karpenterRouter,
  subscriptions: subscriptionsRouter,
  sso: ssoRouter,
  teams: teamsRouter,
  users: usersRouter,
})

export type AppRouter = typeof appRouter
