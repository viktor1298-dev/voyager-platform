/** SSE event types for real-time subscriptions */

// ── Pod Events ──────────────────────────────────────────────
export type PodEventType = 'added' | 'modified' | 'deleted'
export type PodPhase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown'

export interface PodEvent {
  clusterId: string
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
  clusterId?: string
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
  clusterId: string
  cpuPercent: number | null
  memoryPercent: number | null
  memoryBytes: number
  cpuCores: number
  podCount: number
  timestamp: string
}

// ── Metrics Stream (live SSE) ──────────────────────────────
export interface MetricsStreamEvent {
  clusterId: string
  timestamp: string // ISO 8601
  cpu: number | null // percentage (0-100)
  memory: number | null // percentage (0-100)
  pods: number | null // count
  networkBytesIn: number | null
  networkBytesOut: number | null
  error?: {
    code: string
    message: string
  }
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

// ── Cluster Connection State ────────────────────────────────
export type ClusterConnectionState =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error'
  | 'auth_expired'
export type SSEConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export interface ClusterStateChangeEvent {
  clusterId: string
  state: ClusterConnectionState
  error?: string
  timestamp: string
}

// ── Resource Change Stream ─────────────────────────────────
export type ResourceType =
  | 'pods'
  | 'deployments'
  | 'statefulsets'
  | 'daemonsets'
  | 'services'
  | 'ingresses'
  | 'jobs'
  | 'cronjobs'
  | 'hpa'
  | 'configmaps'
  | 'secrets'
  | 'pvcs'
  | 'namespaces'
  | 'events'
  | 'nodes'

export type ResourceChangeType = 'added' | 'modified' | 'deleted'

export interface ResourceChangeEvent {
  clusterId: string
  resourceType: ResourceType
  changeType: ResourceChangeType
  name: string
  namespace: string | null
  timestamp: string
}

// ── Watch Event Types (Phase 10) ──────────────────────────────
export type WatchEventType = 'ADDED' | 'MODIFIED' | 'DELETED'

export interface WatchEvent {
  type: WatchEventType
  resourceType: ResourceType
  object: unknown // Transformed resource (same shape as tRPC response item)
}

export interface WatchEventBatch {
  clusterId: string
  events: WatchEvent[]
  timestamp: string
}

export interface WatchStatusEvent {
  clusterId: string
  state: 'connected' | 'reconnecting' | 'disconnected' | 'initializing'
  resourceType?: ResourceType
  error?: string
}
