/** SSE event types for real-time subscriptions */

// ── Pod Events ──────────────────────────────────────────────
export type PodEventType = 'added' | 'modified' | 'deleted'
export type PodPhase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown'

export interface PodEvent {
  type: PodEventType
  name: string
  namespace: string
  phase: PodPhase
  reason?: string
  message?: string
  restartCount: number
  containerStatuses: ContainerStatusSummary[]
  timestamp: string
}

export interface ContainerStatusSummary {
  name: string
  ready: boolean
  restartCount: number
  state: 'running' | 'waiting' | 'terminated'
  reason?: string
}

// ── Deployment Progress ─────────────────────────────────────
export interface DeploymentProgressEvent {
  name: string
  namespace: string
  replicas: number
  readyReplicas: number
  updatedReplicas: number
  availableReplicas: number
  progressPercent: number
  status: 'progressing' | 'available' | 'degraded' | 'stalled'
  conditions: DeploymentConditionSummary[]
  timestamp: string
}

export interface DeploymentConditionSummary {
  type: string
  status: string
  reason?: string
  message?: string
}

// ── Metrics Stream ──────────────────────────────────────────
export interface MetricsEvent {
  cpuPercent: number | null
  memoryPercent: number | null
  memoryBytes: number
  cpuCores: number
  podCount: number
  timestamp: string
}

// ── Alert Stream ────────────────────────────────────────────
export interface AlertEvent {
  id: string
  name: string
  metric: string
  operator: string
  threshold: number
  currentValue: number
  severity: 'critical' | 'warning' | 'info'
  clusterId?: string
  triggeredAt: string
}

// ── Log Stream ──────────────────────────────────────────────
export interface LogLineEvent {
  line: string
  timestamp: string
  isNewSinceConnect: boolean
}

// ── Connection State (client-side) ──────────────────────────
export type SSEConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
