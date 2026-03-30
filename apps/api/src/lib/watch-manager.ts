/**
 * Unified WatchManager — manages per-cluster K8s informers with reference counting.
 * Uses informer's built-in ObjectCache as in-memory store (D-07).
 * Replaces both ClusterWatchManager (3 types) and ResourceWatchManager (12 types)
 * with a single manager covering all 15 resource types (D-06).
 */
import * as k8s from '@kubernetes/client-node'
import {
  MAX_CONCURRENT_CLUSTER_WATCHES,
  WATCH_RECONNECT_BASE_MS,
  WATCH_RECONNECT_MAX_MS,
  WATCH_RECONNECT_JITTER_RATIO,
  WATCH_HEARTBEAT_TIMEOUT_MS,
} from '@voyager/config/sse'
import type { ResourceType, WatchEvent, WatchEventType } from '@voyager/types'
import { clusterClientPool } from './cluster-client-pool.js'
import { voyagerEmitter } from './event-emitter.js'
import * as mappers from './resource-mappers.js'

// ── Resource Definitions ──────────────────────────────────────

export interface ResourceDef {
  type: ResourceType
  apiPath: string
  listFn: (kc: k8s.KubeConfig) => () => Promise<{ items: k8s.KubernetesObject[] }>
  mapper: (obj: k8s.KubernetesObject, clusterId: string) => unknown
}

function coreV1ListFn(
  method: string,
): (kc: k8s.KubeConfig) => () => Promise<{ items: k8s.KubernetesObject[] }> {
  return (kc) => {
    const api = kc.makeApiClient(k8s.CoreV1Api)
    return () =>
      (api as unknown as Record<string, () => Promise<{ items: k8s.KubernetesObject[] }>>)[method]()
  }
}

function appsV1ListFn(
  method: string,
): (kc: k8s.KubeConfig) => () => Promise<{ items: k8s.KubernetesObject[] }> {
  return (kc) => {
    const api = kc.makeApiClient(k8s.AppsV1Api)
    return () =>
      (api as unknown as Record<string, () => Promise<{ items: k8s.KubernetesObject[] }>>)[method]()
  }
}

function batchV1ListFn(
  method: string,
): (kc: k8s.KubeConfig) => () => Promise<{ items: k8s.KubernetesObject[] }> {
  return (kc) => {
    const api = kc.makeApiClient(k8s.BatchV1Api)
    return () =>
      (api as unknown as Record<string, () => Promise<{ items: k8s.KubernetesObject[] }>>)[method]()
  }
}

function autoscalingV2ListFn(
  method: string,
): (kc: k8s.KubeConfig) => () => Promise<{ items: k8s.KubernetesObject[] }> {
  return (kc) => {
    const api = kc.makeApiClient(k8s.AutoscalingV2Api)
    return () =>
      (api as unknown as Record<string, () => Promise<{ items: k8s.KubernetesObject[] }>>)[method]()
  }
}

function networkingV1ListFn(
  method: string,
): (kc: k8s.KubeConfig) => () => Promise<{ items: k8s.KubernetesObject[] }> {
  return (kc) => {
    const api = kc.makeApiClient(k8s.NetworkingV1Api)
    return () =>
      (api as unknown as Record<string, () => Promise<{ items: k8s.KubernetesObject[] }>>)[method]()
  }
}

export const RESOURCE_DEFS: ResourceDef[] = [
  // CoreV1Api resources
  {
    type: 'pods',
    apiPath: '/api/v1/pods',
    listFn: coreV1ListFn('listPodForAllNamespaces'),
    mapper: (obj) => mappers.mapPod(obj as k8s.V1Pod),
  },
  {
    type: 'services',
    apiPath: '/api/v1/services',
    listFn: coreV1ListFn('listServiceForAllNamespaces'),
    mapper: (obj) => mappers.mapService(obj as k8s.V1Service),
  },
  {
    type: 'configmaps',
    apiPath: '/api/v1/configmaps',
    listFn: coreV1ListFn('listConfigMapForAllNamespaces'),
    mapper: (obj) => mappers.mapConfigMap(obj as k8s.V1ConfigMap),
  },
  {
    type: 'secrets',
    apiPath: '/api/v1/secrets',
    listFn: coreV1ListFn('listSecretForAllNamespaces'),
    mapper: (obj) => mappers.mapSecret(obj as k8s.V1Secret),
  },
  {
    type: 'pvcs',
    apiPath: '/api/v1/persistentvolumeclaims',
    listFn: coreV1ListFn('listPersistentVolumeClaimForAllNamespaces'),
    mapper: (obj) => mappers.mapPVC(obj as k8s.V1PersistentVolumeClaim),
  },
  {
    type: 'namespaces',
    apiPath: '/api/v1/namespaces',
    listFn: coreV1ListFn('listNamespace'),
    mapper: (obj) => mappers.mapNamespace(obj as k8s.V1Namespace),
  },
  {
    type: 'events',
    apiPath: '/api/v1/events',
    listFn: coreV1ListFn('listEventForAllNamespaces'),
    mapper: (obj) => mappers.mapEvent(obj as k8s.CoreV1Event),
  },
  {
    type: 'nodes',
    apiPath: '/api/v1/nodes',
    listFn: coreV1ListFn('listNode'),
    mapper: (obj) => mappers.mapNode(obj as k8s.V1Node),
  },

  // AppsV1Api resources
  {
    type: 'deployments',
    apiPath: '/apis/apps/v1/deployments',
    listFn: appsV1ListFn('listDeploymentForAllNamespaces'),
    mapper: (obj, clusterId) =>
      mappers.mapDeployment(obj as k8s.V1Deployment, clusterId, clusterId),
  },
  {
    type: 'statefulsets',
    apiPath: '/apis/apps/v1/statefulsets',
    listFn: appsV1ListFn('listStatefulSetForAllNamespaces'),
    mapper: (obj) => mappers.mapStatefulSet(obj as k8s.V1StatefulSet),
  },
  {
    type: 'daemonsets',
    apiPath: '/apis/apps/v1/daemonsets',
    listFn: appsV1ListFn('listDaemonSetForAllNamespaces'),
    mapper: (obj) => mappers.mapDaemonSet(obj as k8s.V1DaemonSet),
  },

  // BatchV1Api resources
  {
    type: 'jobs',
    apiPath: '/apis/batch/v1/jobs',
    listFn: batchV1ListFn('listJobForAllNamespaces'),
    mapper: (obj) => mappers.mapJob(obj as k8s.V1Job),
  },
  {
    type: 'cronjobs',
    apiPath: '/apis/batch/v1/cronjobs',
    listFn: batchV1ListFn('listCronJobForAllNamespaces'),
    mapper: (obj) => mappers.mapCronJob(obj as k8s.V1CronJob),
  },

  // AutoscalingV2Api resources
  {
    type: 'hpa',
    apiPath: '/apis/autoscaling/v2/horizontalpodautoscalers',
    listFn: autoscalingV2ListFn('listHorizontalPodAutoscalerForAllNamespaces'),
    mapper: (obj) => mappers.mapHPA(obj as k8s.V2HorizontalPodAutoscaler),
  },

  // NetworkingV1Api resources
  {
    type: 'ingresses',
    apiPath: '/apis/networking.k8s.io/v1/ingresses',
    listFn: networkingV1ListFn('listIngressForAllNamespaces'),
    mapper: (obj) => mappers.mapIngress(obj as k8s.V1Ingress),
  },
]

// ── Cluster Watches ───────────────────────────────────────────

interface ClusterWatches {
  informers: Map<
    ResourceType,
    k8s.Informer<k8s.KubernetesObject> & k8s.ObjectCache<k8s.KubernetesObject>
  >
  subscriberCount: number
  reconnectAttempts: Map<ResourceType, number>
  /** Set of resource types whose initial list has completed (informer cache is populated) */
  ready: Set<ResourceType>
}

// ── WatchManager Class ────────────────────────────────────────

function mapK8sEventToWatchType(k8sEvent: 'add' | 'update' | 'delete'): WatchEventType {
  const map: Record<string, WatchEventType> = {
    add: 'ADDED',
    update: 'MODIFIED',
    delete: 'DELETED',
  }
  return map[k8sEvent] ?? 'MODIFIED'
}

export class WatchManager {
  private clusters = new Map<string, ClusterWatches>()
  private heartbeatTimers = new Map<string, NodeJS.Timeout>()

  private resetHeartbeat(clusterId: string, type: ResourceType): void {
    const key = `${clusterId}:${type}`
    const existing = this.heartbeatTimers.get(key)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      console.warn(
        `[WatchManager] Heartbeat timeout for ${type} on ${clusterId}, restarting informer`,
      )
      const cluster = this.clusters.get(clusterId)
      const informer = cluster?.informers.get(type)
      if (informer) {
        informer.stop()
        informer.start().catch((err) => this.handleInformerError(clusterId, type, err))
      }
    }, WATCH_HEARTBEAT_TIMEOUT_MS)

    this.heartbeatTimers.set(key, timer)
  }

  private clearHeartbeat(clusterId: string, type: ResourceType): void {
    const key = `${clusterId}:${type}`
    const existing = this.heartbeatTimers.get(key)
    if (existing) {
      clearTimeout(existing)
      this.heartbeatTimers.delete(key)
    }
  }

  async subscribe(clusterId: string): Promise<void> {
    let cluster = this.clusters.get(clusterId)
    if (cluster) {
      cluster.subscriberCount++
      return
    }

    // Check limit
    if (this.clusters.size >= MAX_CONCURRENT_CLUSTER_WATCHES) {
      console.warn(
        `[WatchManager] Max concurrent watches reached (${MAX_CONCURRENT_CLUSTER_WATCHES}), skipping ${clusterId}`,
      )
      return
    }

    // First subscriber — create informers
    cluster = {
      informers: new Map(),
      subscriberCount: 1,
      reconnectAttempts: new Map(),
      ready: new Set(),
    }
    this.clusters.set(clusterId, cluster)

    voyagerEmitter.emitWatchStatus({
      clusterId,
      state: 'initializing',
    })

    try {
      const kc = await clusterClientPool.getClient(clusterId)

      for (const def of RESOURCE_DEFS) {
        try {
          const listFn = def.listFn(kc)
          const informer = k8s.makeInformer(
            kc,
            def.apiPath,
            listFn,
          ) as k8s.Informer<k8s.KubernetesObject> & k8s.ObjectCache<k8s.KubernetesObject>

          // Register event handlers
          for (const k8sEvent of ['add', 'update', 'delete'] as const) {
            informer.on(k8sEvent, (obj: k8s.KubernetesObject) => {
              const mapped = def.mapper(obj, clusterId)
              const watchEvent: WatchEvent = {
                type: mapK8sEventToWatchType(k8sEvent),
                resourceType: def.type,
                object: mapped,
              }
              voyagerEmitter.emitWatchEvent(clusterId, watchEvent)
              this.resetHeartbeat(clusterId, def.type)
            })
          }

          // Error handler with exponential backoff reconnect
          informer.on('error', (err: unknown) => {
            this.handleInformerError(clusterId, def.type, err)
          })

          // Connect handler — mark ready + reset reconnect attempts
          informer.on('connect', () => {
            const c = this.clusters.get(clusterId)
            if (c) {
              c.ready.add(def.type)
              c.reconnectAttempts.set(def.type, 0)
              this.resetHeartbeat(clusterId, def.type)
            }
          })

          await informer.start()
          cluster.informers.set(def.type, informer)
        } catch (err) {
          // Individual informer failure doesn't stop others
          console.warn(
            `[WatchManager] Failed to start ${def.type} informer for ${clusterId}:`,
            err instanceof Error ? err.message : err,
          )
        }
      }

      if (cluster.informers.size > 0) {
        voyagerEmitter.emitWatchStatus({ clusterId, state: 'connected' })
        console.log(
          `[WatchManager] Started ${cluster.informers.size}/${RESOURCE_DEFS.length} informers for cluster ${clusterId}`,
        )
      } else {
        // No informers started — clean up
        this.clusters.delete(clusterId)
        voyagerEmitter.emitWatchStatus({
          clusterId,
          state: 'disconnected',
          error: 'No informers started',
        })
        console.error(`[WatchManager] No informers started for cluster ${clusterId}`)
      }
    } catch (err) {
      this.clusters.delete(clusterId)
      voyagerEmitter.emitWatchStatus({
        clusterId,
        state: 'disconnected',
        error: err instanceof Error ? err.message : 'Unknown error',
      })
      throw err
    }
  }

  unsubscribe(clusterId: string): void {
    const cluster = this.clusters.get(clusterId)
    if (!cluster) return

    cluster.subscriberCount--
    if (cluster.subscriberCount <= 0) {
      // Last subscriber gone — stop all informers
      for (const [, informer] of cluster.informers) {
        try {
          informer.stop()
        } catch {
          // Ignore stop errors
        }
      }
      for (const [type] of cluster.informers) {
        this.clearHeartbeat(clusterId, type)
      }
      this.clusters.delete(clusterId)
      voyagerEmitter.emitWatchStatus({ clusterId, state: 'disconnected' })
      console.log(`[WatchManager] Stopped all informers for cluster ${clusterId}`)
    }
  }

  /**
   * Returns cached resources, or null if informer exists but initial list hasn't completed.
   * Routers use null to trigger K8s API fallback during informer startup.
   */
  getResources(clusterId: string, type: ResourceType): ReadonlyArray<k8s.KubernetesObject> | null {
    const cluster = this.clusters.get(clusterId)
    if (!cluster) return null
    const informer = cluster.informers.get(type)
    if (!informer) return null
    if (!cluster.ready.has(type)) return null
    return informer.list()
  }

  getResource(
    clusterId: string,
    type: ResourceType,
    name: string,
    namespace?: string,
  ): k8s.KubernetesObject | undefined {
    const cluster = this.clusters.get(clusterId)
    if (!cluster) return undefined
    const informer = cluster.informers.get(type)
    if (!informer) return undefined
    return informer.get(name, namespace)
  }

  isWatching(clusterId: string): boolean {
    const cluster = this.clusters.get(clusterId)
    return !!cluster && cluster.subscriberCount > 0
  }

  getActiveClusterIds(): string[] {
    return [...this.clusters.keys()].filter((id) => {
      const c = this.clusters.get(id)
      return c && c.subscriberCount > 0
    })
  }

  stopAll(): void {
    for (const [clusterId, cluster] of this.clusters) {
      for (const [, informer] of cluster.informers) {
        try {
          informer.stop()
        } catch {
          // Ignore stop errors
        }
      }
      voyagerEmitter.emitWatchStatus({ clusterId, state: 'disconnected' })
    }
    this.clusters.clear()
    for (const timer of this.heartbeatTimers.values()) {
      clearTimeout(timer)
    }
    this.heartbeatTimers.clear()
    console.log('[WatchManager] Stopped all informers for all clusters')
  }

  private handleInformerError(clusterId: string, type: ResourceType, err: unknown): void {
    const cluster = this.clusters.get(clusterId)
    if (!cluster) return

    const attempt = (cluster.reconnectAttempts.get(type) ?? 0) + 1
    cluster.reconnectAttempts.set(type, attempt)
    const delay = Math.min(WATCH_RECONNECT_BASE_MS * 2 ** (attempt - 1), WATCH_RECONNECT_MAX_MS)
    const jitter = delay * WATCH_RECONNECT_JITTER_RATIO * Math.random()

    console.warn(
      `[WatchManager] Informer error for ${type} on cluster ${clusterId}, reconnecting in ${Math.round(delay + jitter)}ms (attempt ${attempt})`,
    )

    voyagerEmitter.emitWatchStatus({
      clusterId,
      state: 'reconnecting',
      resourceType: type,
      error: err instanceof Error ? err.message : String(err),
    })

    setTimeout(() => {
      if (this.isWatching(clusterId)) {
        const informer = cluster.informers.get(type)
        informer?.start().catch((startErr) => this.handleInformerError(clusterId, type, startErr))
      }
    }, delay + jitter)
  }
}

export const watchManager = new WatchManager()
