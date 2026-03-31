export interface RelationGroup {
  kind: string
  displayName: string
  order: number
  resources: RelationResource[]
}

export interface RelationResource {
  name: string
  namespace: string
  status: string
  statusCategory: 'healthy' | 'warning' | 'error' | 'unknown'
  isCurrent: boolean
}

/** Hierarchy order for display sorting — lower number = higher in chain */
export const RELATION_KINDS = [
  { kind: 'Ingress', displayName: 'Ingresses', order: 1 },
  { kind: 'Service', displayName: 'Services', order: 2 },
  { kind: 'Deployment', displayName: 'Deployments', order: 3 },
  { kind: 'StatefulSet', displayName: 'StatefulSets', order: 4 },
  { kind: 'DaemonSet', displayName: 'DaemonSets', order: 5 },
  { kind: 'Job', displayName: 'Jobs', order: 6 },
  { kind: 'CronJob', displayName: 'CronJobs', order: 7 },
  { kind: 'Pod', displayName: 'Pods', order: 8 },
  { kind: 'HorizontalPodAutoscaler', displayName: 'HPAs', order: 9 },
  { kind: 'ConfigMap', displayName: 'ConfigMaps', order: 10 },
  { kind: 'Secret', displayName: 'Secrets', order: 11 },
  { kind: 'PersistentVolumeClaim', displayName: 'PVCs', order: 12 },
  { kind: 'Node', displayName: 'Nodes', order: 13 },
] as const

/** Maps API kind → cluster tab URL segment */
export const KIND_TO_TAB: Record<string, string> = {
  Ingress: 'ingresses',
  Service: 'services',
  Deployment: 'deployments',
  StatefulSet: 'statefulsets',
  DaemonSet: 'daemonsets',
  Job: 'jobs',
  CronJob: 'cronjobs',
  Pod: 'pods',
  HorizontalPodAutoscaler: 'hpa',
  ConfigMap: 'configmaps',
  Secret: 'secrets',
  PersistentVolumeClaim: 'pvcs',
  Node: 'nodes',
}
