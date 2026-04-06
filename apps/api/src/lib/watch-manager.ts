/**
 * Unified WatchManager — manages per-cluster K8s informers with on-demand reference counting.
 * Uses informer's built-in ObjectCache as in-memory store (D-07).
 * Replaces both ClusterWatchManager (3 types) and ResourceWatchManager (12 types)
 * with a single manager covering all 17 resource types (D-06).
 *
 * On-demand pattern: subscribe() creates a lightweight cluster entry (no informers).
 * Callers then use ensureTypes(clusterId, types) to start only the informers they need.
 * Per-type reference counting + 60s grace period ensures informers stay warm across
 * browser refreshes while unused types are cleaned up individually.
 */
import * as k8s from '@kubernetes/client-node'
import {
  MAX_CONCURRENT_CLUSTER_WATCHES,
  WATCH_HEARTBEAT_TIMEOUT_MS,
  WATCH_RECONNECT_BASE_MS,
  WATCH_RECONNECT_JITTER_RATIO,
  WATCH_RECONNECT_MAX_MS,
} from '@voyager/config/sse'
import type { ResourceType, WatchEvent, WatchEventType } from '@voyager/types'
import { clusterClientPool } from './cluster-client-pool.js'
import { voyagerEmitter } from './event-emitter.js'
import { createComponentLogger } from './logger.js'
import * as mappers from './resource-mappers.js'

const log = createComponentLogger('watch-manager')

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
  {
    type: 'network-policies',
    apiPath: '/apis/networking.k8s.io/v1/networkpolicies',
    listFn: networkingV1ListFn('listNetworkPolicyForAllNamespaces'),
    mapper: (obj) => mappers.mapNetworkPolicy(obj as k8s.V1NetworkPolicy),
  },
  {
    type: 'resource-quotas',
    apiPath: '/api/v1/resourcequotas',
    listFn: coreV1ListFn('listResourceQuotaForAllNamespaces'),
    mapper: (obj) => mappers.mapResourceQuota(obj as k8s.V1ResourceQuota),
  },
]

// ── Cluster Watches ───────────────────────────────────────────

interface ClusterWatches {
  informers: Map<
    ResourceType,
    k8s.Informer<k8s.KubernetesObject> & k8s.ObjectCache<k8s.KubernetesObject>
  >
  /** Per-type subscriber count — each ensureTypes() call increments, releaseTypes() decrements */
  typeSubscriberCount: Map<ResourceType, number>
  reconnectAttempts: Map<ResourceType, number>
  /** Set of resource types whose initial list has completed (informer cache is populated) */
  ready: Set<ResourceType>
  /** Generation counter — prevents stale error handlers from affecting new subscriptions */
  generation: number
  /** Cached KubeConfig for this cluster — created once during subscribe() */
  kc: k8s.KubeConfig
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

/** Grace period before tearing down informers after last subscriber leaves (ms).
 *  Prevents cold cache on browser refresh — informers stay warm for 60s. */
const UNSUBSCRIBE_GRACE_MS = 60_000

/** How long a connection must be stable before resetting backoff to 0 (ms).
 *  Prevents backoff from resetting on brief connect-then-error cycles. */
const STABLE_CONNECTION_MS = 10_000

/** Max consecutive failures before giving up on an informer for a resource type.
 *  After this many failures, the informer stops retrying and emits 'disconnected'.
 *  Lens-style: don't retry indefinitely against unreachable clusters. */
const MAX_INFORMER_RETRIES = 5

/** Network error codes that indicate the host is permanently unreachable.
 *  These are not transient — retrying won't help until the network changes. */
const TERMINAL_NETWORK_ERRORS = new Set([
  'EHOSTUNREACH',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ENETUNREACH',
  'CERT_HAS_EXPIRED',
])

export class WatchManager {
  private clusters = new Map<string, ClusterWatches>()
  private heartbeatTimers = new Map<string, NodeJS.Timeout>()
  private graceTimers = new Map<string, NodeJS.Timeout>()
  private generationCounter = 0
  private stableTimers = new Map<string, NodeJS.Timeout>()

  private resetHeartbeat(clusterId: string, type: ResourceType): void {
    const key = `${clusterId}:${type}`
    const existing = this.heartbeatTimers.get(key)
    if (existing) clearTimeout(existing)

    // Capture generation so heartbeat timer doesn't restart informers from a stale subscription
    const currentCluster = this.clusters.get(clusterId)
    const generation = currentCluster?.generation ?? 0

    const timer = setTimeout(() => {
      log.warn({ clusterId, resourceType: type }, 'Heartbeat timeout, restarting informer')
      const cluster = this.clusters.get(clusterId)
      if (!cluster || cluster.generation !== generation) return
      const informer = cluster.informers.get(type)
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

  /**
   * Lightweight cluster registration — creates cluster entry and KubeConfig but starts NO informers.
   * Callers must follow up with ensureTypes(clusterId, types) to start specific informers.
   */
  async subscribe(clusterId: string): Promise<void> {
    // Cancel pending per-type grace timers for this cluster
    for (const [key, timer] of this.graceTimers) {
      if (key.startsWith(`${clusterId}:`)) {
        clearTimeout(timer)
        this.graceTimers.delete(key)
      }
    }

    // Already registered — nothing to do (subscriber counts are managed by ensureTypes/releaseTypes)
    if (this.clusters.has(clusterId)) {
      return
    }

    // Check limit
    if (this.clusters.size >= MAX_CONCURRENT_CLUSTER_WATCHES) {
      log.warn(
        { clusterId, limit: MAX_CONCURRENT_CLUSTER_WATCHES },
        'Max concurrent watches reached, skipping cluster',
      )
      return
    }

    // Create cluster entry with KubeConfig but no informers.
    // Lens-style connection pre-check: probe /version before accepting the cluster.
    // This prevents starting informers against unreachable endpoints.
    const generation = ++this.generationCounter

    try {
      const kc = await clusterClientPool.getClient(clusterId)

      // Quick reachability probe — if this fails, the cluster is unreachable
      try {
        await kc.makeApiClient(k8s.VersionApi).getCode()
      } catch (probeErr) {
        const code = (probeErr as { code?: string }).code
        if (code && TERMINAL_NETWORK_ERRORS.has(code)) {
          log.warn({ clusterId, code }, 'Cluster unreachable (connection pre-check failed)')
          voyagerEmitter.emitWatchStatus({
            clusterId,
            state: 'disconnected',
            error: `Cluster unreachable: ${code}`,
          })
          return
        }
        // Non-terminal errors (e.g., 401/403) — cluster is reachable but may need auth refresh.
        // Proceed with registration — informers handle auth errors with retry.
        log.info({ clusterId, err: probeErr }, 'Connection pre-check warning (proceeding anyway)')
      }

      const cluster: ClusterWatches = {
        informers: new Map(),
        typeSubscriberCount: new Map(),
        reconnectAttempts: new Map(),
        ready: new Set(),
        generation,
        kc,
      }
      this.clusters.set(clusterId, cluster)

      voyagerEmitter.emitWatchStatus({ clusterId, state: 'connected' })
      log.info({ clusterId }, 'Cluster registered (no informers yet — use ensureTypes)')
    } catch (err) {
      voyagerEmitter.emitWatchStatus({
        clusterId,
        state: 'disconnected',
        error: err instanceof Error ? err.message : 'Unknown error',
      })
      throw err
    }
  }

  /**
   * Start informers for the requested types (if not already running) and increment per-type subscriber counts.
   * Returns array of types that were already ready (caller can send snapshots immediately for these).
   * New informers are started in parallel via Promise.allSettled().
   */
  async ensureTypes(clusterId: string, types: ResourceType[]): Promise<ResourceType[]> {
    const cluster = this.clusters.get(clusterId)
    if (!cluster) return []

    const alreadyReady: ResourceType[] = []
    const toStart: ResourceDef[] = []

    for (const type of types) {
      // Increment per-type subscriber count
      const prev = cluster.typeSubscriberCount.get(type) ?? 0
      cluster.typeSubscriberCount.set(type, prev + 1)

      // Cancel per-type grace timer if pending
      const graceKey = `${clusterId}:${type}`
      const graceTimer = this.graceTimers.get(graceKey)
      if (graceTimer) {
        clearTimeout(graceTimer)
        this.graceTimers.delete(graceKey)
      }

      // If informer already exists, skip starting — just check if ready
      if (cluster.informers.has(type)) {
        if (cluster.ready.has(type)) {
          alreadyReady.push(type)
        }
        continue
      }

      // Find resource definition for this type
      const def = RESOURCE_DEFS.find((d) => d.type === type)
      if (def) toStart.push(def)
    }

    // Start new informers in parallel
    if (toStart.length > 0) {
      const results = await Promise.allSettled(
        toStart.map((def) => this.startInformer(clusterId, def)),
      )

      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          log.warn(
            {
              clusterId,
              resourceType: toStart[i].type,
              err: (results[i] as PromiseRejectedResult).reason,
            },
            'Failed to start informer',
          )
        }
      }

      log.info(
        {
          clusterId,
          requested: toStart.length,
          started: results.filter((r) => r.status === 'fulfilled').length,
        },
        'On-demand informers started',
      )

      // Emit snapshot-ready for newly started types AFTER start() resolves.
      // At this point the informer ObjectCache is populated (unlike the `connect`
      // event which fires during start() before the cache is filled).
      for (const def of toStart) {
        if (cluster.ready.has(def.type)) {
          voyagerEmitter.emitWatchStatus({
            clusterId,
            state: 'snapshot-ready' as WatchStatusEvent['state'],
            resourceType: def.type,
          })
        }
      }
    }

    return alreadyReady
  }

  /**
   * Start a single informer for a resource type. Extracted from the old subscribe() loop.
   */
  private async startInformer(clusterId: string, def: ResourceDef): Promise<void> {
    const cluster = this.clusters.get(clusterId)
    if (!cluster) return

    const listFn = def.listFn(cluster.kc)
    const informer = k8s.makeInformer(
      cluster.kc,
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

    // Connect handler — mark ready, emit per-type ready status, defer backoff reset until stable.
    // Only emits 'ready' on FIRST connect (not reconnects) to avoid spamming the browser.
    informer.on('connect', () => {
      const c = this.clusters.get(clusterId)
      if (c) {
        const wasReady = c.ready.has(def.type)
        c.ready.add(def.type)
        this.resetHeartbeat(clusterId, def.type)

        // Emit per-type ready status only on first connect (not reconnects)
        if (!wasReady) {
          voyagerEmitter.emitWatchStatus({
            clusterId,
            state: 'ready',
            resourceType: def.type,
          })
        }

        const stableKey = `${clusterId}:${def.type}`
        const existingStable = this.stableTimers.get(stableKey)
        if (existingStable) clearTimeout(existingStable)
        this.stableTimers.set(
          stableKey,
          setTimeout(() => {
            this.stableTimers.delete(stableKey)
            const current = this.clusters.get(clusterId)
            if (current) current.reconnectAttempts.set(def.type, 0)
          }, STABLE_CONNECTION_MS),
        )
      }
    })

    // Register informer BEFORE start() so that when the `connect` event fires
    // (during start()), onWatchReady can find it via getResources() and send a
    // full snapshot instead of an empty one. Without this, the browser briefly
    // shows "No X found" empty state instead of a loading skeleton.
    cluster.informers.set(def.type, informer)
    try {
      await informer.start()
    } catch (err) {
      cluster.informers.delete(def.type)
      throw err
    }
  }

  /**
   * Decrement per-type subscriber counts and start grace period for types reaching 0.
   * Types with no remaining subscribers are torn down after UNSUBSCRIBE_GRACE_MS.
   */
  releaseTypes(clusterId: string, types: ResourceType[]): void {
    const cluster = this.clusters.get(clusterId)
    if (!cluster) return

    for (const type of types) {
      const count = cluster.typeSubscriberCount.get(type) ?? 0
      if (count <= 0) continue

      const newCount = count - 1
      cluster.typeSubscriberCount.set(type, newCount)

      if (newCount <= 0) {
        // Per-type grace period — keep informer warm for 60s
        const graceKey = `${clusterId}:${type}`
        log.info(
          { clusterId, resourceType: type, graceMs: UNSUBSCRIBE_GRACE_MS },
          'Last subscriber for type left, starting grace period',
        )
        const timer = setTimeout(() => {
          this.graceTimers.delete(graceKey)
          this.teardownType(clusterId, type)
        }, UNSUBSCRIBE_GRACE_MS)
        this.graceTimers.set(graceKey, timer)
      }
    }
  }

  /**
   * Stop a single informer and clean up its timers.
   * If no informers remain for the cluster, deletes the cluster entry entirely.
   */
  private teardownType(clusterId: string, type: ResourceType): void {
    const cluster = this.clusters.get(clusterId)
    if (!cluster) return

    // Don't tear down if someone re-subscribed during grace period
    if ((cluster.typeSubscriberCount.get(type) ?? 0) > 0) return

    const informer = cluster.informers.get(type)
    if (informer) {
      try {
        informer.stop()
      } catch {
        // Ignore stop errors
      }
      cluster.informers.delete(type)
    }

    // Clear heartbeat and stable-connection timers
    this.clearHeartbeat(clusterId, type)
    const stableKey = `${clusterId}:${type}`
    const stableTimer = this.stableTimers.get(stableKey)
    if (stableTimer) {
      clearTimeout(stableTimer)
      this.stableTimers.delete(stableKey)
    }

    cluster.ready.delete(type)
    cluster.reconnectAttempts.delete(type)
    cluster.typeSubscriberCount.delete(type)

    log.info({ clusterId, resourceType: type }, 'Stopped informer for type (grace expired)')

    // If no informers remain, remove the cluster entry entirely
    if (cluster.informers.size === 0) {
      this.clusters.delete(clusterId)
      clusterClientPool.invalidate(clusterId)
      voyagerEmitter.emitWatchStatus({ clusterId, state: 'disconnected' })
      log.info({ clusterId }, 'All informers stopped, cluster entry removed')
    }
  }

  /**
   * Release ALL active types for the cluster.
   * Collects types with subscriber count > 0 and calls releaseTypes() for them.
   */
  unsubscribe(clusterId: string): void {
    const cluster = this.clusters.get(clusterId)
    if (!cluster) return

    // Collect all types that have active subscribers
    const activeTypes: ResourceType[] = []
    for (const [type, count] of cluster.typeSubscriberCount) {
      if (count > 0) activeTypes.push(type)
    }

    if (activeTypes.length > 0) {
      this.releaseTypes(clusterId, activeTypes)
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
    if (!cluster) return false
    for (const count of cluster.typeSubscriberCount.values()) {
      if (count > 0) return true
    }
    return false
  }

  /** True when the cluster has active informers (watches running and healthy) */
  isConnected(clusterId: string): boolean {
    const cluster = this.clusters.get(clusterId)
    return !!cluster && cluster.informers.size > 0
  }

  getActiveClusterIds(): string[] {
    return [...this.clusters.keys()].filter((id) => {
      const c = this.clusters.get(id)
      if (!c) return false
      for (const count of c.typeSubscriberCount.values()) {
        if (count > 0) return true
      }
      return false
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
    for (const timer of this.graceTimers.values()) {
      clearTimeout(timer)
    }
    this.graceTimers.clear()
    for (const timer of this.stableTimers.values()) {
      clearTimeout(timer)
    }
    this.stableTimers.clear()
    log.info('Stopped all informers for all clusters')
  }

  private handleInformerError(clusterId: string, type: ResourceType, err: unknown): void {
    const cluster = this.clusters.get(clusterId)
    if (!cluster) return

    // Capture generation to detect stale error handlers from previous subscriptions.
    // When unsubscribe() stops informers, their async error callbacks may fire after
    // a new subscribe() creates a fresh cluster entry. Without this check, the stale
    // handler would call start() on the new informers, causing double-start chaos.
    const generation = cluster.generation

    const attempt = (cluster.reconnectAttempts.get(type) ?? 0) + 1
    cluster.reconnectAttempts.set(type, attempt)

    // Check for terminal network errors — don't retry, fail immediately
    const errorCode = (err as { code?: string }).code
    const isTerminal = errorCode != null && TERMINAL_NETWORK_ERRORS.has(errorCode)

    // Lens-style: stop retrying after MAX_INFORMER_RETRIES or on terminal network errors
    if (isTerminal || attempt >= MAX_INFORMER_RETRIES) {
      log.error(
        { clusterId, resourceType: type, attempt, errorCode, isTerminal },
        'Informer giving up — terminal error or max retries reached',
      )

      // Stop and remove this informer
      const informer = cluster.informers.get(type)
      if (informer) {
        try {
          informer.stop()
        } catch {
          /* ignore */
        }
      }
      cluster.informers.delete(type)
      cluster.ready.delete(type)
      this.clearHeartbeat(clusterId, type)

      // If ALL informers for this cluster have failed, emit disconnected
      if (cluster.informers.size === 0) {
        voyagerEmitter.emitWatchStatus({
          clusterId,
          state: 'disconnected',
          error: isTerminal
            ? `Cluster unreachable: ${errorCode}`
            : `All informers failed after ${MAX_INFORMER_RETRIES} retries`,
        })
        log.warn({ clusterId }, 'All informers failed — cluster marked disconnected')
      }
      return
    }

    const delay = Math.min(WATCH_RECONNECT_BASE_MS * 2 ** (attempt - 1), WATCH_RECONNECT_MAX_MS)
    const jitter = delay * WATCH_RECONNECT_JITTER_RATIO * Math.random()

    if (attempt <= 3) {
      log.warn(
        { clusterId, resourceType: type, attempt, delayMs: Math.round(delay + jitter), err },
        'Informer error, reconnecting',
      )
    }

    setTimeout(() => {
      const current = this.clusters.get(clusterId)
      if (
        current &&
        current.generation === generation &&
        (current.typeSubscriberCount.get(type) ?? 0) > 0
      ) {
        const informer = current.informers.get(type)
        informer?.start().catch((startErr) => this.handleInformerError(clusterId, type, startErr))
      }
    }, delay + jitter)
  }
}

export const watchManager = new WatchManager()
