import { anomalies, anomalyRules, type Database } from '@voyager/db'
import { and, desc, eq, isNull } from 'drizzle-orm'

export type AnomalySeverity = 'critical' | 'warning' | 'info'
export type AnomalyType =
  | 'cpu_spike'
  | 'memory_pressure'
  | 'pod_restart_storm'
  | 'event_flood'
  | 'deployment_stuck'

export interface ClusterSignals {
  cpuPercent5m: number
  memoryPercent: number
  podRestarts10m: number
  events5m: number
  deploymentStuckMinutes: number
}

interface RuleThresholds {
  cpuSpikePercent: number
  cpuSpikeMinutes: number
  memoryPressurePercent: number
  podRestartStormCount: number
  podRestartStormMinutes: number
  eventFloodCount: number
  eventFloodMinutes: number
  deploymentStuckMinutes: number
}

const DEFAULT_THRESHOLDS: RuleThresholds = {
  cpuSpikePercent: 90,
  cpuSpikeMinutes: 5,
  memoryPressurePercent: 85,
  podRestartStormCount: 5,
  podRestartStormMinutes: 10,
  eventFloodCount: 100,
  eventFloodMinutes: 5,
  deploymentStuckMinutes: 10,
}

const DEFAULT_RULE_SEVERITY: Record<AnomalyType, AnomalySeverity> = {
  cpu_spike: 'critical',
  memory_pressure: 'warning',
  pod_restart_storm: 'critical',
  event_flood: 'warning',
  deployment_stuck: 'critical',
}

const METRIC_TO_THRESHOLD_KEY: Record<string, keyof RuleThresholds> = {
  cpu_spike_percent: 'cpuSpikePercent',
  cpu_spike_minutes: 'cpuSpikeMinutes',
  memory_pressure_percent: 'memoryPressurePercent',
  pod_restart_storm_count: 'podRestartStormCount',
  pod_restart_storm_minutes: 'podRestartStormMinutes',
  event_flood_count: 'eventFloodCount',
  event_flood_minutes: 'eventFloodMinutes',
  deployment_stuck_minutes: 'deploymentStuckMinutes',
}

type NewAnomaly = typeof anomalies.$inferInsert

export class AnomalyService {
  constructor(private readonly db: Database) {}

  async list(clusterId: string, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize
    const rows = await this.db
      .select()
      .from(anomalies)
      .where(eq(anomalies.clusterId, clusterId))
      .orderBy(desc(anomalies.detectedAt))
      .limit(pageSize)
      .offset(offset)

    return {
      items: rows,
      page,
      pageSize,
      hasMore: rows.length === pageSize,
    }
  }

  async acknowledge(anomalyId: string) {
    const [updated] = await this.db
      .update(anomalies)
      .set({ acknowledgedAt: new Date() })
      .where(and(eq(anomalies.id, anomalyId), isNull(anomalies.acknowledgedAt)))
      .returning()

    return updated ?? null
  }

  async configure(
    clusterId: string,
    rules: Array<{ metric: string; operator: 'gt' | 'gte' | 'lt' | 'lte'; threshold: number; severity: AnomalySeverity; enabled: boolean }>,
  ) {
    await this.db.delete(anomalyRules).where(eq(anomalyRules.clusterId, clusterId))

    if (rules.length === 0) {
      return []
    }

    return this.db
      .insert(anomalyRules)
      .values(
        rules.map((rule) => ({
          clusterId,
          metric: rule.metric,
          operator: rule.operator,
          threshold: String(rule.threshold),
          severity: rule.severity,
          enabled: rule.enabled,
        })),
      )
      .returning()
  }

  async detectAndPersist(clusterId: string, signals: ClusterSignals) {
    const thresholds = await this.getEffectiveThresholds(clusterId)
    const findings = detectAnomalies(clusterId, signals, thresholds)

    if (findings.length === 0) {
      return []
    }

    return this.db.insert(anomalies).values(findings).returning()
  }

  private async getEffectiveThresholds(clusterId: string): Promise<RuleThresholds> {
    const configuredRules = await this.db
      .select()
      .from(anomalyRules)
      .where(and(eq(anomalyRules.clusterId, clusterId), eq(anomalyRules.enabled, true)))

    if (configuredRules.length === 0) {
      return DEFAULT_THRESHOLDS
    }

    const merged: RuleThresholds = { ...DEFAULT_THRESHOLDS }
    for (const rule of configuredRules) {
      const thresholdKey = METRIC_TO_THRESHOLD_KEY[rule.metric]
      if (!thresholdKey) continue

      const parsed = Number(rule.threshold)
      if (!Number.isFinite(parsed)) continue
      merged[thresholdKey] = parsed
    }

    return merged
  }
}

export function detectAnomalies(
  clusterId: string,
  signals: ClusterSignals,
  thresholds: RuleThresholds = DEFAULT_THRESHOLDS,
): NewAnomaly[] {
  const now = new Date()
  const findings: NewAnomaly[] = []

  if (signals.cpuPercent5m > thresholds.cpuSpikePercent) {
    findings.push(buildAnomaly(clusterId, 'cpu_spike', now, `CPU usage is above ${thresholds.cpuSpikePercent}% for at least ${thresholds.cpuSpikeMinutes} minutes.`))
  }

  if (signals.memoryPercent > thresholds.memoryPressurePercent) {
    findings.push(buildAnomaly(clusterId, 'memory_pressure', now, `Memory usage is above ${thresholds.memoryPressurePercent}%.`))
  }

  if (signals.podRestarts10m > thresholds.podRestartStormCount) {
    findings.push(buildAnomaly(clusterId, 'pod_restart_storm', now, `Pod restarts exceeded ${thresholds.podRestartStormCount} in ${thresholds.podRestartStormMinutes} minutes.`))
  }

  if (signals.events5m > thresholds.eventFloodCount) {
    findings.push(buildAnomaly(clusterId, 'event_flood', now, `Event volume exceeded ${thresholds.eventFloodCount} in ${thresholds.eventFloodMinutes} minutes.`))
  }

  if (signals.deploymentStuckMinutes > thresholds.deploymentStuckMinutes) {
    findings.push(buildAnomaly(clusterId, 'deployment_stuck', now, `Deployment rollout is not progressing for more than ${thresholds.deploymentStuckMinutes} minutes.`))
  }

  return findings
}

function buildAnomaly(clusterId: string, type: AnomalyType, detectedAt: Date, description: string): NewAnomaly {
  return {
    clusterId,
    type,
    severity: DEFAULT_RULE_SEVERITY[type],
    title: buildTitle(type),
    description,
    metadata: {},
    detectedAt,
  }
}

function buildTitle(type: AnomalyType): string {
  switch (type) {
    case 'cpu_spike':
      return 'CPU Spike Detected'
    case 'memory_pressure':
      return 'Memory Pressure Detected'
    case 'pod_restart_storm':
      return 'Pod Restart Storm Detected'
    case 'event_flood':
      return 'Event Flood Detected'
    case 'deployment_stuck':
      return 'Deployment Rollout Stuck'
    default:
      return 'Anomaly Detected'
  }
}
