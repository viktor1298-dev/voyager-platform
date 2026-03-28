/** Centralized cache key builders — formats MUST match existing keys exactly.
 *  Changing a format causes a mass cache miss on deploy. */

export const CACHE_KEYS = {
  k8sServices: (clusterId: string, namespace?: string) =>
    `k8s:${clusterId}:services:${namespace ?? 'all'}`,

  k8sVersion: (clusterId: string) => `k8s:${clusterId}:version`,

  k8sNodes: (clusterId: string) => `k8s:${clusterId}:nodes`,

  k8sPods: (clusterId: string) => `k8s:${clusterId}:pods`,

  k8sNamespaces: (clusterId: string) => `k8s:${clusterId}:namespaces`,

  k8sEvents: (clusterId: string) => `k8s:${clusterId}:events`,

  k8sDeployments: (clusterId: string) => `k8s:${clusterId}:deployments`,

  k8sDeploymentsList: (clusterId: string) => `k8s:${clusterId}:deployments:list`,

  k8sResourceQuotas: (clusterId: string) => `k8s:${clusterId}:resource-quotas`,

  k8sPodsStored: (clusterId: string) => `k8s:${clusterId}:pods:stored`,

  k8sPodMetrics: (clusterId: string) => `k8s:${clusterId}:pod-metrics`,

  k8sNodeMetrics: (clusterId: string) => `k8s:${clusterId}:node-metrics`,

  /** Global deployments list cache (not cluster-scoped) */
  k8sDeploymentsListGlobal: () => 'k8s:deployments:list:v2',

  /** Prefix for all cache keys scoped to a cluster */
  k8sPrefix: (clusterId: string) => `k8s:${clusterId}`,

  /** Global prefix for all k8s cache keys (used by SCAN invalidation) */
  K8S_GLOBAL_PREFIX: 'k8s:',
} as const
