import { anomalies, anomalyRules, type Database } from '@voyager/db'
import { and, desc, eq, isNull } from 'drizzle-orm'

export type AnomalySeverity = 'critical' | 'warning' | 'info'
export type AnomalyType =
  | 'cpu_spike'
  | 'memory_pressure'
  | 'pod_restart_storm'
  | 'event_flood'
  | 'deployment_stuck'

type RuleOperator = 'gt' | 'gte' | 'lt' | 'lte'

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

interface AnomalyRuleConfig {
  severity: AnomalySeverity
  operator: RuleOperator
}

type EffectiveRuleConfigs = Record<AnomalyType, AnomalyRuleConfig>

interface EffectiveThresholds {
  thresholds: RuleThresholds
  ruleConfigs: EffectiveRuleConfigs
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

const DEFAULT_RULE_CONFIGS: EffectiveRuleConfigs = {
  cpu_spike: { severity: DEFAULT_RULE_SEVERITY.cpu_spike, operator: 'gt' },
  memory_pressure: { severity: DEFAULT_RULE_SEVERITY.memory_pressure, operator: 'gt' },
  pod_restart_storm: { severity: DEFAULT_RULE_SEVERITY.pod_restart_storm, operator: 'gt' },
  event_flood: { severity: DEFAULT_RULE_SEVERITY.event_flood, operator: 'gt' },
  deployment_stuck: { severity: DEFAULT_RULE_SEVERITY.deployment_stuck, operator: 'gt' },
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

const METRIC_TO_ANOMALY_TYPE: Partial<Record<string, AnomalyType>> = {
  cpu_spike_percent: 'cpu_spike',
  memory_pressure_percent: 'memory_pressure',
  pod_restart_storm_count: 'pod_restart_storm',
  event_flood_count: 'event_flood',
  deployment_stuck_minutes: 'deployment_stuck',
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
    rules: Array<{ metric: string; operator: RuleOperator; threshold: number; severity: AnomalySeverity; enabled: boolean }>,
  ) {
    return this.db.transaction(async (tx) => {
      await tx.delete(anomalyRules).where(eq(anomalyRules.clusterId, clusterId))

      if (rules.length === 0) {
        return []
      }

      return tx
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
    })
  }

  async detectAndPersist(clusterId: string, signals: ClusterSignals) {
    const effective = await this.getEffectiveThresholds(clusterId)
    const findings = detectAnomalies(clusterId, signals, effective.thresholds, effective.ruleConfigs)

    if (findings.length === 0) {
      return []
    }

    return this.db.insert(anomalies).values(findings).returning()
  }

  private async getEffectiveThresholds(clusterId: string): Promise<EffectiveThresholds> {
    const configuredRules = await this.db
      .select()
      .from(anomalyRules)
      .where(and(eq(anomalyRules.clusterId, clusterId), eq(anomalyRules.enabled, true)))

    const mergedThresholds: RuleThresholds = { ...DEFAULT_THRESHOLDS }
    const mergedRuleConfigs: EffectiveRuleConfigs = {
      cpu_spike: { ...DEFAULT_RULE_CONFIGS.cpu_spike },
      memory_pressure: { ...DEFAULT_RULE_CONFIGS.memory_pressure },
      pod_restart_storm: { ...DEFAULT_RULE_CONFIGS.pod_restart_storm },
      event_flood: { ...DEFAULT_RULE_CONFIGS.event_flood },
      deployment_stuck: { ...DEFAULT_RULE_CONFIGS.deployment_stuck },
    }

    for (const rule of configuredRules) {
      const thresholdKey = METRIC_TO_THRESHOLD_KEY[rule.metric]
      if (thresholdKey) {
        const parsed = Number(rule.threshold)
        if (Number.isFinite(parsed)) {
          mergedThresholds[thresholdKey] = parsed
        }
      }

      const anomalyType = METRIC_TO_ANOMALY_TYPE[rule.metric]
      if (anomalyType) {
        mergedRuleConfigs[anomalyType] = {
          operator: normalizeOperator(rule.operator),
          severity: rule.severity,
        }
      }
    }

    return {
      thresholds: mergedThresholds,
      ruleConfigs: mergedRuleConfigs,
    }
  }
}

export function detectAnomalies(
  clusterId: string,
  signals: ClusterSignals,
  thresholds: RuleThresholds = DEFAULT_THRESHOLDS,
  ruleConfigs: EffectiveRuleConfigs = DEFAULT_RULE_CONFIGS,
): NewAnomaly[] {
  const now = new Date()
  const findings: NewAnomaly[] = []

  if (compareWithOperator(signals.cpuPercent5m, thresholds.cpuSpikePercent, ruleConfigs.cpu_spike.operator)) {
    findings.push(
      buildAnomaly(
        clusterId,
        'cpu_spike',
        ruleConfigs.cpu_spike.severity,
        now,
        `CPU usage is ${formatThresholdCondition(ruleConfigs.cpu_spike.operator, thresholds.cpuSpikePercent, '%')} for at least ${thresholds.cpuSpikeMinutes} minutes.`,
      ),
    )
  }

  if (compareWithOperator(signals.memoryPercent, thresholds.memoryPressurePercent, ruleConfigs.memory_pressure.operator)) {
    findings.push(
      buildAnomaly(
        clusterId,
        'memory_pressure',
        ruleConfigs.memory_pressure.severity,
        now,
        `Memory usage is ${formatThresholdCondition(ruleConfigs.memory_pressure.operator, thresholds.memoryPressurePercent, '%')}.`,
      ),
    )
  }

  if (compareWithOperator(signals.podRestarts10m, thresholds.podRestartStormCount, ruleConfigs.pod_restart_storm.operator)) {
    findings.push(
      buildAnomaly(
        clusterId,
        'pod_restart_storm',
        ruleConfigs.pod_restart_storm.severity,
        now,
        `Pod restarts are ${formatThresholdCondition(ruleConfigs.pod_restart_storm.operator, thresholds.podRestartStormCount)} in ${thresholds.podRestartStormMinutes} minutes.`,
      ),
    )
  }

  if (compareWithOperator(signals.events5m, thresholds.eventFloodCount, ruleConfigs.event_flood.operator)) {
    findings.push(
      buildAnomaly(
        clusterId,
        'event_flood',
        ruleConfigs.event_flood.severity,
        now,
        `Event volume is ${formatThresholdCondition(ruleConfigs.event_flood.operator, thresholds.eventFloodCount)} in ${thresholds.eventFloodMinutes} minutes.`,
      ),
    )
  }

  if (compareWithOperator(signals.deploymentStuckMinutes, thresholds.deploymentStuckMinutes, ruleConfigs.deployment_stuck.operator)) {
    findings.push(
      buildAnomaly(
        clusterId,
        'deployment_stuck',
        ruleConfigs.deployment_stuck.severity,
        now,
        `Deployment stuck duration is ${formatThresholdCondition(ruleConfigs.deployment_stuck.operator, thresholds.deploymentStuckMinutes)} minutes.`,
      ),
    )
  }

  return findings
}

function compareWithOperator(value: number, threshold: number, operator: RuleOperator): boolean {
  switch (operator) {
    case 'gt':
      return value > threshold
    case 'gte':
      return value >= threshold
    case 'lt':
      return value < threshold
    case 'lte':
      return value <= threshold
    default:
      return value > threshold
  }
}

function formatThresholdCondition(operator: RuleOperator, threshold: number, suffix = ''): string {
  switch (operator) {
    case 'gt':
      return `> ${threshold}${suffix}`
    case 'gte':
      return `≥ ${threshold}${suffix}`
    case 'lt':
      return `< ${threshold}${suffix}`
    case 'lte':
      return `≤ ${threshold}${suffix}`
    default:
      return `> ${threshold}${suffix}`
  }
}

function normalizeOperator(operator: string): RuleOperator {
  switch (operator) {
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return operator
    default:
      return 'gt'
  }
}

function buildAnomaly(clusterId: string, type: AnomalyType, severity: AnomalySeverity, detectedAt: Date, description: string): NewAnomaly {
  return {
    clusterId,
    type,
    severity,
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
