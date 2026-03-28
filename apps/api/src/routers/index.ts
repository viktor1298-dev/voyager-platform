import { router } from '../trpc.js'
import { aiRouter } from './ai.js'
import { aiKeysRouter } from './ai-keys.js'
import { alertsRouter } from './alerts.js'
import { anomaliesRouter } from './anomalies.js'
import { auditRouter } from './audit.js'
import { authRouter } from './auth.js'
import { authorizationRouter, teamsRouter } from './authorization.js'
import { clustersRouter } from './clusters.js'
import { configMapsRouter } from './configmaps.js'
import { cronJobsRouter } from './cronjobs.js'
import { daemonSetsRouter } from './daemonsets.js'
import { dashboardRouter } from './dashboard.js'
import { dashboardLayoutRouter } from './dashboard-layout.js'
import { deploymentsRouter } from './deployments.js'
import { eventsRouter } from './events.js'
import { ingressesRouter } from './ingresses.js'
import { featuresRouter } from './features.js'
import { healthRouter } from './health.js'
import { hpaRouter } from './hpa.js'
import { jobsRouter } from './jobs.js'
import { karpenterRouter } from './karpenter.js'
import { logsRouter } from './logs.js'
import { metricsRouter } from './metrics.js'
import { namespacesRouter } from './namespaces.js'
import { crdsRouter } from './crds.js'
import { helmRouter } from './helm.js'
import { networkPoliciesRouter } from './network-policies.js'
import { nodesRouter } from './nodes.js'
import { podsRouter } from './pods.js'
import { presenceRouter } from './presence.js'
import { pvcsRouter } from './pvcs.js'
import { rbacRouter } from './rbac.js'
import { resourceQuotasRouter } from './resource-quotas.js'
import { secretsRouter } from './secrets.js'
import { servicesRouter } from './services.js'
import { ssoRouter } from './sso.js'
import { statefulSetsRouter } from './statefulsets.js'
import { subscriptionsRouter } from './subscriptions.js'
import { tokensRouter } from './tokens.js'
import { topologyRouter } from './topology.js'
import { usersRouter } from './users.js'
import { webhooksRouter } from './webhooks.js'
import { yamlRouter } from './yaml.js'

export const appRouter = router({
  ai: aiRouter,
  aiKeys: aiKeysRouter,
  alerts: alertsRouter,
  anomalies: anomaliesRouter,
  audit: auditRouter,
  auth: authRouter,
  authorization: authorizationRouter,
  clusters: clustersRouter,
  configMaps: configMapsRouter,
  cronJobs: cronJobsRouter,
  daemonSets: daemonSetsRouter,
  deployments: deploymentsRouter,
  dashboard: dashboardRouter,
  health: healthRouter,
  hpa: hpaRouter,
  jobs: jobsRouter,
  nodes: nodesRouter,
  pods: podsRouter,
  events: eventsRouter,
  features: featuresRouter,
  ingresses: ingressesRouter,
  logs: logsRouter,
  metrics: metricsRouter,
  karpenter: karpenterRouter,
  presence: presenceRouter,
  pvcs: pvcsRouter,
  secrets: secretsRouter,
  subscriptions: subscriptionsRouter,
  sso: ssoRouter,
  teams: teamsRouter,
  users: usersRouter,
  tokens: tokensRouter,
  topology: topologyRouter,
  webhooks: webhooksRouter,
  services: servicesRouter,
  statefulSets: statefulSetsRouter,
  namespaces: namespacesRouter,
  networkPolicies: networkPoliciesRouter,
  dashboardLayout: dashboardLayoutRouter,
  yaml: yamlRouter,
  helm: helmRouter,
  crds: crdsRouter,
  rbac: rbacRouter,
  resourceQuotas: resourceQuotasRouter,
})

export type AppRouter = typeof appRouter
