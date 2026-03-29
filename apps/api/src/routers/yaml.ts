import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { protectedProcedure, router } from '../trpc.js'

const RESOURCE_TYPES = [
  'pods',
  'deployments',
  'services',
  'configmaps',
  'secrets',
  'statefulsets',
  'daemonsets',
  'jobs',
  'cronjobs',
  'ingresses',
  'hpa',
  'pvcs',
  'namespaces',
  'nodes',
  'networkpolicies',
  'resourcequotas',
] as const

type ResourceType = (typeof RESOURCE_TYPES)[number]

/**
 * Fetch a single K8s resource by type, name, and optional namespace.
 * Returns the raw K8s API JSON object — frontend converts to YAML for display.
 */
async function fetchResource(
  kc: k8s.KubeConfig,
  resourceType: ResourceType,
  name: string,
  namespace?: string,
): Promise<object> {
  const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
  const appsV1 = kc.makeApiClient(k8s.AppsV1Api)
  const batchV1 = kc.makeApiClient(k8s.BatchV1Api)
  const networkingV1 = kc.makeApiClient(k8s.NetworkingV1Api)
  const autoscalingV2 = kc.makeApiClient(k8s.AutoscalingV2Api)

  switch (resourceType) {
    case 'pods':
      return coreV1.readNamespacedPod({ name, namespace: namespace! })
    case 'deployments':
      return appsV1.readNamespacedDeployment({ name, namespace: namespace! })
    case 'services':
      return coreV1.readNamespacedService({ name, namespace: namespace! })
    case 'configmaps':
      return coreV1.readNamespacedConfigMap({ name, namespace: namespace! })
    case 'secrets':
      return coreV1.readNamespacedSecret({ name, namespace: namespace! })
    case 'statefulsets':
      return appsV1.readNamespacedStatefulSet({ name, namespace: namespace! })
    case 'daemonsets':
      return appsV1.readNamespacedDaemonSet({ name, namespace: namespace! })
    case 'jobs':
      return batchV1.readNamespacedJob({ name, namespace: namespace! })
    case 'cronjobs':
      return batchV1.readNamespacedCronJob({ name, namespace: namespace! })
    case 'ingresses':
      return networkingV1.readNamespacedIngress({ name, namespace: namespace! })
    case 'hpa':
      return autoscalingV2.readNamespacedHorizontalPodAutoscaler({ name, namespace: namespace! })
    case 'pvcs':
      return coreV1.readNamespacedPersistentVolumeClaim({ name, namespace: namespace! })
    case 'namespaces':
      return coreV1.readNamespace({ name })
    case 'nodes':
      return coreV1.readNode({ name })
    case 'networkpolicies':
      return networkingV1.readNamespacedNetworkPolicy({ name, namespace: namespace! })
    case 'resourcequotas':
      return coreV1.readNamespacedResourceQuota({ name, namespace: namespace! })
    default: {
      const _exhaustive: never = resourceType
      throw new Error(`Unsupported resource type: ${_exhaustive}`)
    }
  }
}

export const yamlRouter = router({
  get: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        resourceType: z.enum(RESOURCE_TYPES),
        name: z.string(),
        namespace: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const resource = await cached(
          CACHE_KEYS.k8sYaml(input.clusterId, input.resourceType, input.name, input.namespace),
          15_000,
          () => fetchResource(kc, input.resourceType, input.name, input.namespace),
        )
        // Strip managedFields — noise in YAML view, not useful for operators
        const cleaned = resource as Record<string, unknown>
        if (cleaned.metadata && typeof cleaned.metadata === 'object') {
          const meta = cleaned.metadata as Record<string, unknown>
          delete meta.managedFields
        }
        return cleaned
      } catch (err) {
        handleK8sError(err, 'get resource yaml')
      }
    }),
})
