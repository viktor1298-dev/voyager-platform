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

export const MOCK_ANOMALIES: Anomaly[] = [
  {
    id: 'an-001',
    severity: 'critical',
    type: 'Node Pressure',
    cluster: 'prod-eu-west',
    clusterId: 'prod-eu-west',
    title: 'Node memory pressure exceeded 95%',
    description:
      'Node ip-10-42-17 reported sustained memory pressure for over 6 minutes. Scheduler eviction risk is elevated for latency-sensitive pods.',
    detectedAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    status: 'open',
    metadata: {
      node: 'ip-10-42-17',
      namespace: 'payments',
      threshold: '95%',
      current: '97%',
    },
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
    detectedAt: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
    status: 'open',
    metadata: {
      deployment: 'checkout-api-v2',
      namespace: 'checkout',
      restarts: '22',
      replicas: '3',
    },
  },
  {
    id: 'an-003',
    severity: 'info',
    type: 'Scaling',
    cluster: 'staging-eu',
    clusterId: 'staging-eu',
    title: 'Autoscaler adjusted node pool size',
    description:
      'Cluster autoscaler added one worker node after a short utilization spike. No action required, tracked for trend analysis.',
    detectedAt: new Date(Date.now() - 1000 * 60 * 52).toISOString(),
    status: 'acknowledged',
    metadata: {
      nodePool: 'general-workers',
      action: 'scale-up',
      from: '3',
      to: '4',
    },
  },
  {
    id: 'an-004',
    severity: 'critical',
    type: 'Network',
    cluster: 'prod-eu-west',
    clusterId: 'prod-eu-west',
    title: 'Packet loss detected between nodes',
    description:
      'Cross-zone packet loss surpassed 6% for 4 minutes affecting service mesh traffic on canary workloads.',
    detectedAt: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
    status: 'open',
    metadata: {
      zonePair: 'eu-west-1a ↔ eu-west-1c',
      packetLoss: '6.4%',
      impactedServices: '5',
      mesh: 'istio',
    },
  },
  {
    id: 'an-005',
    severity: 'warning',
    type: 'Certificate',
    cluster: 'dev-sandbox',
    clusterId: 'dev-sandbox',
    title: 'Ingress TLS certificate expires soon',
    description: 'Wildcard certificate will expire in 5 days. Renewal job has not run in last 24h.',
    detectedAt: new Date(Date.now() - 1000 * 60 * 92).toISOString(),
    status: 'resolved',
    metadata: {
      cert: '*.sandbox.internal',
      expiresIn: '5d',
      namespace: 'ingress-nginx',
      renewalJob: 'cert-renewer',
    },
  },
  {
    id: 'an-006',
    severity: 'info',
    type: 'Cost',
    cluster: 'prod-us-east',
    clusterId: 'prod-us-east',
    title: 'Spot interruption signal observed',
    description:
      'Spot interruption notice received and workloads moved to on-demand nodes successfully.',
    detectedAt: new Date(Date.now() - 1000 * 60 * 140).toISOString(),
    status: 'open',
    metadata: {
      node: 'ip-10-48-71',
      migration: 'completed',
      fallbackPool: 'on-demand-workers',
      duration: '42s',
    },
  },
]

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
