export type AnomalySeverity = 'critical' | 'warning' | 'info'
export type AnomalyStatus = 'open' | 'acknowledged' | 'resolved'

export interface Anomaly {
  id: string
  severity: AnomalySeverity
  type: string
  cluster: string
  clusterId: string
  title: string
  description: string
  detectedAt: string
  status: AnomalyStatus
  metadata: Record<string, string>
}

/** Generate realistic mock anomalies spread across the last 24h */
function generateMockAnomalies(): Anomaly[] {
  const now = Date.now()
  const H = 60 * 60 * 1000
  const M = 60 * 1000

  return [
    {
      id: 'an-001',
      severity: 'critical',
      type: 'Node Pressure',
      cluster: 'prod-eu-west',
      clusterId: 'prod-eu-west',
      title: 'Node memory pressure exceeded 95%',
      description:
        'Node ip-10-42-17 reported sustained memory pressure for over 6 minutes. Scheduler eviction risk is elevated for latency-sensitive pods.',
      detectedAt: new Date(now - 14 * M).toISOString(),
      status: 'open',
      metadata: { node: 'ip-10-42-17', namespace: 'payments', threshold: '95%', current: '97%' },
    },
    {
      id: 'an-002',
      severity: 'warning',
      type: 'CrashLoopBackOff',
      cluster: 'prod-us-east',
      clusterId: 'prod-us-east',
      title: 'checkout-api pods restarting repeatedly',
      description:
        'checkout-api entered CrashLoopBackOff in deployment checkout-api-v2. Last 10 minutes show 22 restarts across 3 replicas.',
      detectedAt: new Date(now - 32 * M).toISOString(),
      status: 'open',
      metadata: { deployment: 'checkout-api-v2', namespace: 'checkout', restarts: '22', replicas: '3' },
    },
    {
      id: 'an-003',
      severity: 'info',
      type: 'Scaling',
      cluster: 'staging-eu',
      clusterId: 'staging-eu',
      title: 'Autoscaler adjusted node pool size',
      description:
        'Cluster autoscaler added one worker node after a short utilization spike.',
      detectedAt: new Date(now - 52 * M).toISOString(),
      status: 'open',
      metadata: { nodePool: 'general-workers', action: 'scale-up', from: '3', to: '4' },
    },
    {
      id: 'an-004',
      severity: 'critical',
      type: 'Network',
      cluster: 'prod-eu-west',
      clusterId: 'prod-eu-west',
      title: 'Packet loss detected between nodes',
      description:
        'Cross-zone packet loss surpassed 6% for 4 minutes affecting service mesh traffic.',
      detectedAt: new Date(now - 1.2 * H).toISOString(),
      status: 'open',
      metadata: { zonePair: 'eu-west-1a ↔ eu-west-1c', packetLoss: '6.4%', impactedServices: '5', mesh: 'istio' },
    },
    {
      id: 'an-005',
      severity: 'warning',
      type: 'Certificate',
      cluster: 'dev-sandbox',
      clusterId: 'dev-sandbox',
      title: 'Ingress TLS certificate expires in 5 days',
      description: 'Wildcard certificate will expire in 5 days. Renewal job has not run in last 24h.',
      detectedAt: new Date(now - 1.5 * H).toISOString(),
      status: 'open',
      metadata: { cert: '*.sandbox.internal', expiresIn: '5d', namespace: 'ingress-nginx' },
    },
    {
      id: 'an-006',
      severity: 'info',
      type: 'Cost',
      cluster: 'prod-us-east',
      clusterId: 'prod-us-east',
      title: 'Spot interruption signal — workloads migrated',
      description:
        'Spot interruption notice received and workloads moved to on-demand nodes successfully.',
      detectedAt: new Date(now - 2.3 * H).toISOString(),
      status: 'open',
      metadata: { node: 'ip-10-48-71', migration: 'completed', fallbackPool: 'on-demand-workers', duration: '42s' },
    },
    {
      id: 'an-007',
      severity: 'warning',
      type: 'Resource Quota',
      cluster: 'prod-eu-west',
      clusterId: 'prod-eu-west',
      title: 'Namespace resource quota 90% utilized',
      description: 'Namespace "analytics" is consuming 90% of CPU quota. New pod scheduling may fail.',
      detectedAt: new Date(now - 3.8 * H).toISOString(),
      status: 'open',
      metadata: { namespace: 'analytics', quotaUsage: '90%', resource: 'cpu' },
    },
    {
      id: 'an-008',
      severity: 'critical',
      type: 'Disk Pressure',
      cluster: 'prod-us-east',
      clusterId: 'prod-us-east',
      title: 'Persistent volume nearly full (96%)',
      description: 'PV data-postgres-0 at 96% capacity. Database writes may fail within 2 hours at current growth rate.',
      detectedAt: new Date(now - 5.1 * H).toISOString(),
      status: 'open',
      metadata: { pv: 'data-postgres-0', namespace: 'database', usage: '96%', growthRate: '1.2GB/h' },
    },
    {
      id: 'an-009',
      severity: 'info',
      type: 'Deployment',
      cluster: 'staging-eu',
      clusterId: 'staging-eu',
      title: 'Rolling update completed for api-gateway',
      description: 'Deployment api-gateway rolled out v2.14.0 with zero downtime across 4 replicas.',
      detectedAt: new Date(now - 7.5 * H).toISOString(),
      status: 'open',
      metadata: { deployment: 'api-gateway', version: 'v2.14.0', replicas: '4' },
    },
    {
      id: 'an-010',
      severity: 'warning',
      type: 'Latency',
      cluster: 'prod-eu-west',
      clusterId: 'prod-eu-west',
      title: 'P99 latency spike on payment-service',
      description: 'P99 latency jumped to 1.8s from baseline 200ms for payment-service. Correlates with DB connection pool saturation.',
      detectedAt: new Date(now - 10.2 * H).toISOString(),
      status: 'open',
      metadata: { service: 'payment-service', p99: '1.8s', baseline: '200ms', namespace: 'payments' },
    },
    {
      id: 'an-011',
      severity: 'info',
      type: 'Security',
      cluster: 'prod-us-east',
      clusterId: 'prod-us-east',
      title: 'Failed RBAC authorization attempts detected',
      description: 'Service account "ci-runner" made 12 unauthorized API calls in the last hour. May indicate misconfigured pipeline.',
      detectedAt: new Date(now - 14.7 * H).toISOString(),
      status: 'open',
      metadata: { serviceAccount: 'ci-runner', attempts: '12', namespace: 'ci' },
    },
    {
      id: 'an-012',
      severity: 'critical',
      type: 'OOMKilled',
      cluster: 'prod-eu-west',
      clusterId: 'prod-eu-west',
      title: 'OOMKilled events on data-processor pods',
      description: 'data-processor pods hit OOMKilled 5 times in 3 hours. Memory limit of 2Gi appears insufficient for current workload.',
      detectedAt: new Date(now - 18.4 * H).toISOString(),
      status: 'open',
      metadata: { deployment: 'data-processor', kills: '5', memLimit: '2Gi', namespace: 'etl' },
    },
  ]
}

export const MOCK_ANOMALIES: Anomaly[] = generateMockAnomalies()

export function getRelativeTime(input: string) {
  const date = new Date(input)
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function severityScore(severity: AnomalySeverity) {
  if (severity === 'critical') return 3
  if (severity === 'warning') return 2
  return 1
}

export function filterOpenAnomalies(anomalies: Anomaly[]) {
  return anomalies.filter((anomaly) => anomaly.status === 'open')
}

export function getAnomalySeverityCounts(anomalies: Anomaly[]) {
  return anomalies.reduce(
    (acc, anomaly) => {
      acc.total += 1
      if (anomaly.severity === 'critical') acc.critical += 1
      else if (anomaly.severity === 'warning') acc.warning += 1
      else acc.info += 1
      return acc
    },
    { total: 0, critical: 0, warning: 0, info: 0 },
  )
}
