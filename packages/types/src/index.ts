// Shared TypeScript types for Voyager Platform
export * from './sse'

export interface ClusterInfo {
  name: string
  provider: string
  version: string
  status: 'healthy' | 'degraded' | 'offline'
  endpoint: string
}

export interface KubeNode {
  name: string
  status: string
  role: string
  kubeletVersion: string
  os: string
  cpu: string
  memory: string
  pods: string
}

export interface KubeEvent {
  type: string
  reason: string
  message: string
  namespace: string
  object: string
  count: number
  lastSeen: string
}

export interface Deployment {
  name: string
  namespace: string
  replicas: number
  readyReplicas: number
  availableReplicas: number
}
