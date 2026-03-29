import * as k8s from '@kubernetes/client-node'
import type { ResourceChangeEvent, ResourceChangeType, ResourceType } from '@voyager/types'
import { invalidateKey } from './cache.js'
import { CACHE_KEYS } from './cache-keys.js'
import { clusterClientPool } from './cluster-client-pool.js'
import { voyagerEmitter } from './event-emitter.js'

/** Map SSE resource types to Redis cache key builders */
const CACHE_KEY_MAP: Partial<Record<ResourceType, (clusterId: string) => string>> = {
  pods: CACHE_KEYS.k8sPods,
  deployments: CACHE_KEYS.k8sDeployments,
  nodes: CACHE_KEYS.k8sNodes,
  services: (id) => `k8s:${id}:services:all`,
  configmaps: (id) => `k8s:${id}:configmaps`,
  secrets: (id) => `k8s:${id}:secrets`,
  pvcs: (id) => `k8s:${id}:pvcs`,
  namespaces: CACHE_KEYS.k8sNamespaces,
  events: CACHE_KEYS.k8sEvents,
  statefulsets: (id) => `k8s:${id}:statefulsets`,
  daemonsets: (id) => `k8s:${id}:daemonsets`,
  jobs: (id) => `k8s:${id}:jobs`,
  cronjobs: (id) => `k8s:${id}:cronjobs`,
  hpa: (id) => `k8s:${id}:hpa`,
  ingresses: (id) => `k8s:${id}:ingresses`,
}

/**
 * Resource type definitions with K8s API paths and list functions.
 * Pods, deployments, and nodes are already watched by ClusterWatchManager
 * but are re-emitted here as ResourceChangeEvent for the unified stream.
 * This manager watches the remaining 12 resource types.
 */
interface ResourceDef {
  type: ResourceType
  apiPath: string
  listFn: (kc: k8s.KubeConfig) => () => Promise<{ items: k8s.KubernetesObject[] }>
}

function coreV1ListFn(
  method: keyof k8s.CoreV1Api,
): (kc: k8s.KubeConfig) => () => Promise<{ items: k8s.KubernetesObject[] }> {
  return (kc) => {
    const api = kc.makeApiClient(k8s.CoreV1Api)
    return () => (api[method] as () => Promise<{ items: k8s.KubernetesObject[] }>)()
  }
}

function appsV1ListFn(
  method: keyof k8s.AppsV1Api,
): (kc: k8s.KubeConfig) => () => Promise<{ items: k8s.KubernetesObject[] }> {
  return (kc) => {
    const api = kc.makeApiClient(k8s.AppsV1Api)
    return () => (api[method] as () => Promise<{ items: k8s.KubernetesObject[] }>)()
  }
}

function batchV1ListFn(
  method: keyof k8s.BatchV1Api,
): (kc: k8s.KubeConfig) => () => Promise<{ items: k8s.KubernetesObject[] }> {
  return (kc) => {
    const api = kc.makeApiClient(k8s.BatchV1Api)
    return () => (api[method] as () => Promise<{ items: k8s.KubernetesObject[] }>)()
  }
}

function autoscalingV2ListFn(
  method: keyof k8s.AutoscalingV2Api,
): (kc: k8s.KubeConfig) => () => Promise<{ items: k8s.KubernetesObject[] }> {
  return (kc) => {
    const api = kc.makeApiClient(k8s.AutoscalingV2Api)
    return () => (api[method] as () => Promise<{ items: k8s.KubernetesObject[] }>)()
  }
}

function networkingV1ListFn(
  method: keyof k8s.NetworkingV1Api,
): (kc: k8s.KubeConfig) => () => Promise<{ items: k8s.KubernetesObject[] }> {
  return (kc) => {
    const api = kc.makeApiClient(k8s.NetworkingV1Api)
    return () => (api[method] as () => Promise<{ items: k8s.KubernetesObject[] }>)()
  }
}

const RESOURCE_DEFS: ResourceDef[] = [
  // CoreV1Api resources
  {
    type: 'services',
    apiPath: '/api/v1/services',
    listFn: coreV1ListFn('listServiceForAllNamespaces'),
  },
  {
    type: 'configmaps',
    apiPath: '/api/v1/configmaps',
    listFn: coreV1ListFn('listConfigMapForAllNamespaces'),
  },
  {
    type: 'secrets',
    apiPath: '/api/v1/secrets',
    listFn: coreV1ListFn('listSecretForAllNamespaces'),
  },
  {
    type: 'pvcs',
    apiPath: '/api/v1/persistentvolumeclaims',
    listFn: coreV1ListFn('listPersistentVolumeClaimForAllNamespaces'),
  },
  {
    type: 'namespaces',
    apiPath: '/api/v1/namespaces',
    listFn: coreV1ListFn('listNamespace'),
  },
  {
    type: 'events',
    apiPath: '/api/v1/events',
    listFn: coreV1ListFn('listEventForAllNamespaces'),
  },

  // AppsV1Api resources
  {
    type: 'statefulsets',
    apiPath: '/apis/apps/v1/statefulsets',
    listFn: appsV1ListFn('listStatefulSetForAllNamespaces'),
  },
  {
    type: 'daemonsets',
    apiPath: '/apis/apps/v1/daemonsets',
    listFn: appsV1ListFn('listDaemonSetForAllNamespaces'),
  },

  // BatchV1Api resources
  {
    type: 'jobs',
    apiPath: '/apis/batch/v1/jobs',
    listFn: batchV1ListFn('listJobForAllNamespaces'),
  },
  {
    type: 'cronjobs',
    apiPath: '/apis/batch/v1/cronjobs',
    listFn: batchV1ListFn('listCronJobForAllNamespaces'),
  },

  // AutoscalingV2Api resources
  {
    type: 'hpa',
    apiPath: '/apis/autoscaling/v2/horizontalpodautoscalers',
    listFn: autoscalingV2ListFn('listHorizontalPodAutoscalerForAllNamespaces'),
  },

  // NetworkingV1Api resources
  {
    type: 'ingresses',
    apiPath: '/apis/networking.k8s.io/v1/ingresses',
    listFn: networkingV1ListFn('listIngressForAllNamespaces'),
  },
]

// ── Reference-counted subscriber tracking ──────────────────

const subscriberCounts = new Map<string, Set<string>>()

interface ResourceInformerSet {
  informers: k8s.Informer<k8s.KubernetesObject>[]
}

// ── ResourceWatchManager ───────────────────────────────────

function mapChangeType(k8sEvent: 'add' | 'update' | 'delete'): ResourceChangeType {
  const map: Record<string, ResourceChangeType> = {
    add: 'added',
    update: 'modified',
    delete: 'deleted',
  }
  return map[k8sEvent] ?? 'modified'
}

function emitResourceEvent(
  clusterId: string,
  resourceType: ResourceType,
  changeType: ResourceChangeType,
  obj: k8s.KubernetesObject,
): void {
  const event: ResourceChangeEvent = {
    clusterId,
    resourceType,
    changeType,
    name: obj.metadata?.name ?? 'unknown',
    namespace: obj.metadata?.namespace ?? null,
    timestamp: new Date().toISOString(),
  }
  voyagerEmitter.emitResourceChange(clusterId, event)

  // Invalidate Redis cache so the next tRPC refetch gets fresh K8s data
  const keyFn = CACHE_KEY_MAP[resourceType]
  if (keyFn) invalidateKey(keyFn(clusterId)).catch(() => {})
}

class ResourceWatchManager {
  private clusters = new Map<string, ResourceInformerSet>()

  subscribe(clusterId: string, connectionId: string): void {
    let subs = subscriberCounts.get(clusterId)
    if (!subs) {
      subs = new Set()
      subscriberCounts.set(clusterId, subs)
    }
    subs.add(connectionId)
    if (subs.size === 1) {
      this.startWatches(clusterId).catch((err) =>
        console.error(`[ResourceWatchManager] Failed to start watches for ${clusterId}:`, err),
      )
    }
  }

  unsubscribe(clusterId: string, connectionId: string): void {
    const subs = subscriberCounts.get(clusterId)
    if (!subs) return
    subs.delete(connectionId)
    if (subs.size === 0) {
      subscriberCounts.delete(clusterId)
      this.stopWatches(clusterId)
    }
  }

  private async startWatches(clusterId: string): Promise<void> {
    if (this.clusters.has(clusterId)) return

    try {
      const kc = await clusterClientPool.getClient(clusterId)
      const informers: k8s.Informer<k8s.KubernetesObject>[] = []

      for (const def of RESOURCE_DEFS) {
        try {
          const listFn = def.listFn(kc)
          const informer = k8s.makeInformer(kc, def.apiPath, listFn)

          for (const k8sEvent of ['add', 'update', 'delete'] as const) {
            informer.on(k8sEvent, (obj: k8s.KubernetesObject) => {
              emitResourceEvent(clusterId, def.type, mapChangeType(k8sEvent), obj)
            })
          }

          informer.on('error', (err: unknown) => {
            console.warn(
              `[ResourceWatchManager] Informer error for ${def.type} on ${clusterId}:`,
              err instanceof Error ? err.message : err,
            )
            // Auto-reconnect after 5s — informers do NOT reconnect on their own
            setTimeout(() => {
              if (subscriberCounts.has(clusterId)) {
                informer.start().catch(() => {})
              }
            }, 5000)
          })

          await informer.start()
          informers.push(informer)
        } catch (err) {
          // Individual informer failure doesn't stop others
          console.warn(
            `[ResourceWatchManager] Failed to start ${def.type} informer for ${clusterId}:`,
            err instanceof Error ? err.message : err,
          )
        }
      }

      if (informers.length > 0) {
        this.clusters.set(clusterId, { informers })
        console.log(
          `[ResourceWatchManager] Started ${informers.length}/${RESOURCE_DEFS.length} watches for cluster ${clusterId}`,
        )
      } else {
        console.error(`[ResourceWatchManager] No informers started for cluster ${clusterId}`)
      }
    } catch (err) {
      console.error(
        `[ResourceWatchManager] Failed to get client for ${clusterId}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  private stopWatches(clusterId: string): void {
    const set = this.clusters.get(clusterId)
    if (!set) return

    for (const informer of set.informers) {
      try {
        informer.stop()
      } catch {
        // Ignore stop errors
      }
    }

    this.clusters.delete(clusterId)
    console.log(`[ResourceWatchManager] Stopped watches for cluster ${clusterId}`)
  }

  stopAll(): void {
    for (const clusterId of this.clusters.keys()) {
      this.stopWatches(clusterId)
    }
    subscriberCounts.clear()
  }

  getSubscriberCount(clusterId: string): number {
    return subscriberCounts.get(clusterId)?.size ?? 0
  }
}

export const resourceWatchManager = new ResourceWatchManager()
