import { router } from '../trpc.js'
import { aiRouter } from './ai.js'
import { aiKeysRouter } from './ai-keys.js'
import { alertsRouter } from './alerts.js'
import { anomaliesRouter } from './anomalies.js'
import { authorizationRouter, teamsRouter } from './authorization.js'
import { auditRouter } from './audit.js'
import { authRouter } from './auth.js'
import { clustersRouter } from './clusters.js'
import { deploymentsRouter } from './deployments.js'
import { dashboardRouter } from './dashboard.js'
import { eventsRouter } from './events.js'
import { featuresRouter } from './features.js'
import { healthRouter } from './health.js'
import { logsRouter } from './logs.js'
import { metricsRouter } from './metrics.js'
import { nodesRouter } from './nodes.js'
import { karpenterRouter } from './karpenter.js'
import { presenceRouter } from './presence.js'
import { subscriptionsRouter } from './subscriptions.js'
import { ssoRouter } from './sso.js'
import { usersRouter } from './users.js'
import { tokensRouter } from './tokens.js'

export const appRouter = router({
  ai: aiRouter,
  aiKeys: aiKeysRouter,
  alerts: alertsRouter,
  anomalies: anomaliesRouter,
  audit: auditRouter,
  auth: authRouter,
  authorization: authorizationRouter,
  clusters: clustersRouter,
  deployments: deploymentsRouter,
  dashboard: dashboardRouter,
  health: healthRouter,
  nodes: nodesRouter,
  events: eventsRouter,
  features: featuresRouter,
  logs: logsRouter,
  metrics: metricsRouter,
  karpenter: karpenterRouter,
  presence: presenceRouter,
  subscriptions: subscriptionsRouter,
  sso: ssoRouter,
  teams: teamsRouter,
  users: usersRouter,
  tokens: tokensRouter,
})

export type AppRouter = typeof appRouter
