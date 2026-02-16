import { TRPCError } from '@trpc/server'
import { events, clusters } from '@voyager/db'
import type { Database } from '@voyager/db'
import { and, desc, eq, gte } from 'drizzle-orm'
import { z } from 'zod'

const AI_SCORE = {
  MAX: 100,
  CPU_WARNING_THRESHOLD: 80,
  RESTART_WARNING_THRESHOLD: 3,
  MEMORY_WARNING_THRESHOLD: 85,
  LOG_ERROR_RATE_THRESHOLD: 5,
  CPU_PENALTY: 20,
  RESTART_PENALTY: 25,
  IDLE_BONUS: 5,
  MEMORY_PENALTY: 15,
  LOG_ERROR_PENALTY: 10,
} as const

export const aiSeveritySchema = z.enum(['critical', 'warning', 'info'])

export const aiRecommendationSchema = z.object({
  severity: aiSeveritySchema,
  title: z.string(),
  description: z.string(),
  action: z.string(),
})

export const clusterSnapshotSchema = z.object({
  cpuUsagePercent: z.number().min(0).max(100).optional(),
  memoryUsagePercent: z.number().min(0).max(100).optional(),
  podsRestarting: z.number().int().min(0).optional(),
  recentEventsCount: z.number().int().min(0).optional(),
  logErrorRatePercent: z.number().min(0).max(100).optional(),
  lastEventAt: z.union([z.date(), z.string().datetime()]).optional(),
})

export type AIRecommendation = z.infer<typeof aiRecommendationSchema>
export type ClusterSnapshotInput = z.input<typeof clusterSnapshotSchema>

export interface ClusterAnalysis {
  clusterId: string
  clusterName: string
  snapshot: {
    cpuUsagePercent: number
    memoryUsagePercent: number
    podsRestarting: number
    recentEventsCount: number
    logErrorRatePercent: number
    lastEventAt: Date | null
  }
  score: number
  recommendations: AIRecommendation[]
}

interface ServiceContext {
  db: Database
}

function parseDateOrNull(value: Date | string | undefined): Date | null {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function coerceNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback
}

function isRestartLikeEvent(reason: string | null, message: string | null): boolean {
  const source = `${reason ?? ''} ${message ?? ''}`.toLowerCase()
  return (
    source.includes('restart') ||
    source.includes('backoff') ||
    source.includes('crashloop') ||
    source.includes('oomkilled')
  )
}

export class AIService {
  private readonly db: Database

  public constructor(ctx: ServiceContext) {
    this.db = ctx.db
  }

  public async analyzeClusterHealth(
    clusterId: string,
    snapshot?: ClusterSnapshotInput,
  ): Promise<ClusterAnalysis> {
    const parsedSnapshot = snapshot ? clusterSnapshotSchema.parse(snapshot) : undefined

    const [cluster] = await this.db
      .select()
      .from(clusters)
      .where(eq(clusters.id, clusterId))
      .limit(1)

    if (!cluster) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cluster not found' })
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentEvents = await this.db
      .select({
        reason: events.reason,
        message: events.message,
        timestamp: events.timestamp,
      })
      .from(events)
      .where(and(eq(events.clusterId, clusterId), gte(events.timestamp, oneHourAgo)))
      .orderBy(desc(events.timestamp))

    const latestEvent = await this.db
      .select({ timestamp: events.timestamp })
      .from(events)
      .where(eq(events.clusterId, clusterId))
      .orderBy(desc(events.timestamp))
      .limit(1)

    const inferredRestartCount = recentEvents.filter((event) =>
      isRestartLikeEvent(event.reason, event.message),
    ).length

    const mergedSnapshot = {
      cpuUsagePercent: coerceNumber(parsedSnapshot?.cpuUsagePercent, 50),
      memoryUsagePercent: coerceNumber(parsedSnapshot?.memoryUsagePercent, 60),
      podsRestarting: coerceNumber(parsedSnapshot?.podsRestarting, inferredRestartCount),
      recentEventsCount: coerceNumber(parsedSnapshot?.recentEventsCount, recentEvents.length),
      logErrorRatePercent: coerceNumber(parsedSnapshot?.logErrorRatePercent, 1),
      lastEventAt:
        parseDateOrNull(parsedSnapshot?.lastEventAt) ?? latestEvent[0]?.timestamp ?? null,
    }

    const recommendations = this.generateRecommendations(mergedSnapshot)
    const score = this.calculateHealthScore(mergedSnapshot)

    return {
      clusterId,
      clusterName: cluster.name,
      snapshot: mergedSnapshot,
      score,
      recommendations,
    }
  }

  public generateRecommendations(snapshot: ClusterAnalysis['snapshot']): AIRecommendation[] {
    const recommendations: AIRecommendation[] = []

    if (snapshot.cpuUsagePercent > AI_SCORE.CPU_WARNING_THRESHOLD) {
      recommendations.push({
        severity: 'warning',
        title: 'High CPU utilization detected',
        description: `CPU usage is ${snapshot.cpuUsagePercent.toFixed(1)}%, above the ${AI_SCORE.CPU_WARNING_THRESHOLD}% threshold.`,
        action: 'Consider scaling up nodes or tuning resource requests/limits for hot workloads.',
      })
    }

    if (snapshot.memoryUsagePercent > AI_SCORE.MEMORY_WARNING_THRESHOLD) {
      recommendations.push({
        severity: 'warning',
        title: 'Memory pressure is rising',
        description: `Memory utilization reached ${snapshot.memoryUsagePercent.toFixed(1)}%.`,
        action:
          'Review memory-heavy workloads and tune limits or add capacity before OOM kills occur.',
      })
    }

    if (snapshot.podsRestarting > AI_SCORE.RESTART_WARNING_THRESHOLD) {
      recommendations.push({
        severity: 'critical',
        title: 'Frequent pod restarts',
        description: `${snapshot.podsRestarting} restart-related events were detected in the last hour.`,
        action:
          'Investigate crash loops, inspect container logs, and verify readiness/liveness probes.',
      })
    }

    if (snapshot.logErrorRatePercent > AI_SCORE.LOG_ERROR_RATE_THRESHOLD) {
      recommendations.push({
        severity: 'warning',
        title: 'Elevated log error rate',
        description: `Error-rate estimate is ${snapshot.logErrorRatePercent.toFixed(1)}% in recent logs.`,
        action: 'Investigate recent deployments and correlate errors with failing services.',
      })
    }

    const oneHourAgo = Date.now() - 60 * 60 * 1000
    if (
      !snapshot.lastEventAt ||
      snapshot.lastEventAt.getTime() < oneHourAgo ||
      snapshot.recentEventsCount === 0
    ) {
      recommendations.push({
        severity: 'info',
        title: 'Cluster appears idle',
        description: 'No meaningful events were recorded in the last hour.',
        action: 'If this is unexpected, validate event pipeline and workload activity.',
      })
    }

    if (recommendations.length === 0) {
      recommendations.push({
        severity: 'info',
        title: 'Cluster health looks stable',
        description: 'No rule-based anomalies were detected in current metrics/events/log signals.',
        action: 'Continue monitoring and keep autoscaling and alerts tuned.',
      })
    }

    return recommendations
  }

  public async answerQuestion(params: {
    clusterId: string
    question: string
    snapshot?: ClusterSnapshotInput
  }): Promise<string> {
    const analysis = await this.analyzeClusterHealth(params.clusterId, params.snapshot)
    const q = params.question.trim().toLowerCase()

    if (q.includes('cpu')) {
      return `CPU usage is ${analysis.snapshot.cpuUsagePercent.toFixed(1)}%. ${analysis.snapshot.cpuUsagePercent > AI_SCORE.CPU_WARNING_THRESHOLD ? 'Recommendation: consider scaling up or optimizing resource requests.' : 'CPU is currently within a safe operating range.'}`
    }

    if (q.includes('restart') || q.includes('crash')) {
      return `Detected ${analysis.snapshot.podsRestarting} restart-related events. ${analysis.snapshot.podsRestarting > AI_SCORE.RESTART_WARNING_THRESHOLD ? 'Recommendation: investigate crash loops and probe configuration.' : 'No major restart risk is currently detected.'}`
    }

    if (q.includes('event') || q.includes('idle')) {
      const lastEventText = analysis.snapshot.lastEventAt
        ? analysis.snapshot.lastEventAt.toISOString()
        : 'No events recorded'
      return `Recent events count: ${analysis.snapshot.recentEventsCount}. Last event: ${lastEventText}.`
    }

    const topRecommendations = analysis.recommendations
      .slice(0, 2)
      .map((rec) => `• ${rec.title}`)
      .join('\n')
    return [
      `Cluster score: ${analysis.score}/100.`,
      'Top recommendations:',
      topRecommendations,
    ].join('\n')
  }

  private calculateHealthScore(snapshot: ClusterAnalysis['snapshot']): number {
    let score: number = AI_SCORE.MAX

    if (snapshot.cpuUsagePercent > AI_SCORE.CPU_WARNING_THRESHOLD) {
      score -= AI_SCORE.CPU_PENALTY
    }

    if (snapshot.memoryUsagePercent > AI_SCORE.MEMORY_WARNING_THRESHOLD) {
      score -= AI_SCORE.MEMORY_PENALTY
    }

    if (snapshot.podsRestarting > AI_SCORE.RESTART_WARNING_THRESHOLD) {
      score -= AI_SCORE.RESTART_PENALTY
    }

    if (snapshot.logErrorRatePercent > AI_SCORE.LOG_ERROR_RATE_THRESHOLD) {
      score -= AI_SCORE.LOG_ERROR_PENALTY
    }

    if (snapshot.recentEventsCount === 0) {
      score = Math.min(AI_SCORE.MAX, score + AI_SCORE.IDLE_BONUS)
    }

    return Math.max(0, Math.min(AI_SCORE.MAX, score))
  }
}
