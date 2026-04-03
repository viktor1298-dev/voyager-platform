/**
 * Watch DB Writer — persists watch events to PostgreSQL, replacing the DB write
 * functionality of health-sync, node-sync, and event-sync jobs (D-09).
 *
 * Uses debounced periodic sync (not per-event writes) to avoid overwhelming the DB
 * during rolling deployments.
 */
import { CoreV1Api, VersionApi } from '@kubernetes/client-node'
import type * as k8s from '@kubernetes/client-node'
import { clusters, db, events, nodes } from '@voyager/db'
import { and, eq, notInArray, sql } from 'drizzle-orm'
import { WATCH_DB_SYNC_INTERVAL_MS } from '@voyager/config/sse'
import { detectProviderFromKubeconfig } from '@voyager/config/providers'
import type { WatchEvent } from '@voyager/types'
import type { WatchStatusEvent } from '@voyager/types'
import { clusterClientPool } from './cluster-client-pool.js'
import { decryptCredential } from './credential-crypto.js'
import { voyagerEmitter } from './event-emitter.js'
import { parseCpuToNano, parseMemToBytes } from './k8s-units.js'
import { createComponentLogger } from './logger.js'
import { watchManager } from './watch-manager.js'
import { K8S_CONFIG } from '../config/k8s.js'

const log = createComponentLogger('watch-db-writer')

// ── Dirty Tracking ────────────────────────────────────────────

const dirtySet = new Set<string>() // "clusterId:resourceType"
let syncInterval: ReturnType<typeof setInterval> | null = null
const listeners = new Map<string, (event: WatchEvent) => void>()

// ── Health Derivation (replicate health-sync.ts logic) ────────

export function deriveHealthStatus(
  nodeCount: number,
  totalPods: number,
  runningPods: number,
): 'healthy' | 'degraded' | 'unreachable' | 'unknown' {
  if (nodeCount <= 0) return 'unreachable'
  if (totalPods === 0) return 'healthy'
  const runRatio = runningPods / totalPods
  if (runRatio >= 0.8) return 'healthy'
  if (runningPods > 0) return 'degraded'
  return 'unreachable'
}

// ── Node Upsert (replicate node-sync.ts logic) ───────────────

async function syncNodes(clusterId: string): Promise<void> {
  const rawNodes = (watchManager.getResources(clusterId, 'nodes') ?? []) as k8s.V1Node[]
  if (rawNodes.length === 0) return

  // Build pod-per-node map from watch data
  const rawPods = (watchManager.getResources(clusterId, 'pods') ?? []) as k8s.V1Pod[]
  const podCountByNode = new Map<string, number>()
  for (const pod of rawPods) {
    const nodeName = pod.spec?.nodeName
    if (nodeName) {
      podCountByNode.set(nodeName, (podCountByNode.get(nodeName) ?? 0) + 1)
    }
  }

  const nodeValues = rawNodes.map((node) => {
    const name = node.metadata?.name ?? 'unknown'
    const conditions = node.status?.conditions ?? []
    const readyCondition = conditions.find((c) => c.type === 'Ready')
    const status = readyCondition?.status === 'True' ? 'Ready' : 'NotReady'
    const labels = node.metadata?.labels ?? {}
    const role =
      labels['node-role.kubernetes.io/control-plane'] !== undefined ? 'control-plane' : 'worker'

    const cpuCap = node.status?.capacity?.cpu
    const cpuAlloc = node.status?.allocatable?.cpu
    const memCap = node.status?.capacity?.memory
    const memAlloc = node.status?.allocatable?.memory

    const cpuCapMilli = cpuCap ? Math.round(parseCpuToNano(cpuCap) / 1_000_000) : null
    const cpuAllocMilli = cpuAlloc ? Math.round(parseCpuToNano(cpuAlloc) / 1_000_000) : null
    const memCapBytes = memCap ? parseMemToBytes(memCap) : null
    const memAllocBytes = memAlloc ? parseMemToBytes(memAlloc) : null

    const k8sVersion = node.status?.nodeInfo?.kubeletVersion ?? null
    const podsCount = podCountByNode.get(name) ?? 0

    return {
      clusterId,
      name,
      status,
      role,
      cpuCapacity: cpuCapMilli,
      cpuAllocatable: cpuAllocMilli,
      memoryCapacity: memCapBytes,
      memoryAllocatable: memAllocBytes,
      podsCount,
      k8sVersion,
    }
  })

  if (nodeValues.length > 0) {
    await db
      .insert(nodes)
      .values(nodeValues)
      .onConflictDoUpdate({
        target: [nodes.clusterId, nodes.name],
        set: {
          status: sql`excluded.status`,
          role: sql`excluded.role`,
          cpuCapacity: sql`excluded.cpu_capacity`,
          cpuAllocatable: sql`excluded.cpu_allocatable`,
          memoryCapacity: sql`excluded.memory_capacity`,
          memoryAllocatable: sql`excluded.memory_allocatable`,
          podsCount: sql`excluded.pods_count`,
          k8sVersion: sql`excluded.k8s_version`,
        },
      })
  }

  // Delete stale nodes no longer reported by WatchManager
  const currentNodeNames = rawNodes.map((n) => n.metadata?.name ?? 'unknown')
  await db
    .delete(nodes)
    .where(and(eq(nodes.clusterId, clusterId), notInArray(nodes.name, currentNodeNames)))
}

// ── Event Insert (replicate event-sync.ts logic) ─────────────

async function syncEvents(clusterId: string): Promise<void> {
  const rawEvents = (watchManager.getResources(clusterId, 'events') ?? []) as k8s.CoreV1Event[]
  if (rawEvents.length === 0) return

  const eventValues = rawEvents
    .filter((event) => event.metadata?.uid)
    .map((event) => {
      const uid = event.metadata!.uid!
      const eventTimestamp =
        event.lastTimestamp ?? event.eventTime ?? event.metadata?.creationTimestamp
      const ts = eventTimestamp ? new Date(eventTimestamp as unknown as string) : new Date()

      return {
        id: uid,
        clusterId,
        namespace: event.metadata?.namespace ?? null,
        kind: event.type ?? 'Normal',
        reason: event.reason ?? null,
        message: event.message ?? null,
        source: event.source?.component ?? null,
        involvedObject: event.involvedObject
          ? {
              kind: event.involvedObject.kind,
              name: event.involvedObject.name,
              namespace: event.involvedObject.namespace,
            }
          : null,
        timestamp: ts,
      }
    })

  if (eventValues.length > 0) {
    await db.insert(events).values(eventValues).onConflictDoNothing()
  }
}

// ── Health Sync (replicate health-sync.ts logic) ─────────────

async function syncClusterHealth(clusterId: string): Promise<void> {
  const rawNodes = (watchManager.getResources(clusterId, 'nodes') ?? []) as k8s.V1Node[]
  const rawPods = (watchManager.getResources(clusterId, 'pods') ?? []) as k8s.V1Pod[]
  const now = new Date()

  const totalNodes = rawNodes.length
  const totalPods = rawPods.length
  const runningPods = rawPods.filter((pod) => pod.status?.phase === 'Running').length
  const healthStatus = deriveHealthStatus(totalNodes, totalPods, runningPods)

  // Narrow SELECT: only fetch status + provider (skip large connectionConfig JSONB)
  const [currentCluster] = await db
    .select({
      status: clusters.status,
      provider: clusters.provider,
    })
    .from(clusters)
    .where(eq(clusters.id, clusterId))

  const shouldActivate =
    !currentCluster ||
    currentCluster.status === 'unreachable' ||
    currentCluster.status === 'unknown'

  // Fetch K8s server version (best-effort, never blocks health sync)
  let version: string | undefined
  try {
    const kc = await clusterClientPool.getClient(clusterId)
    const versionInfo = await kc.makeApiClient(VersionApi).getCode()
    version = `v${versionInfo.major}.${versionInfo.minor}`
  } catch {
    // Version fetch is non-critical — skip silently
  }

  const updatePayload: Record<string, unknown> = {
    healthStatus,
    nodesCount: totalNodes,
    lastHealthCheck: now,
    lastConnectedAt: now,
  }
  if (shouldActivate) {
    updatePayload.status = 'active'
  }
  if (version) {
    updatePayload.version = version
  }

  // Auto-fix: detect real provider for clusters stored as 'kubeconfig'
  // Only fetch connectionConfig when actually needed (provider === 'kubeconfig')
  if (currentCluster?.provider === 'kubeconfig') {
    const [fullCluster] = await db
      .select({ connectionConfig: clusters.connectionConfig })
      .from(clusters)
      .where(eq(clusters.id, clusterId))

    if (fullCluster?.connectionConfig) {
      try {
        let config = fullCluster.connectionConfig as Record<string, unknown>
        if (
          typeof config.__encrypted === 'string' &&
          /^[0-9a-fA-F]{64}$/.test(K8S_CONFIG.ENCRYPTION_KEY)
        ) {
          config = JSON.parse(decryptCredential(config.__encrypted, K8S_CONFIG.ENCRYPTION_KEY))
        }
        if (typeof config.kubeconfig === 'string') {
          const detection = detectProviderFromKubeconfig(config.kubeconfig)
          if (detection.confidence !== 'none') {
            updatePayload.provider = detection.provider
            log.info({ clusterId, provider: detection.provider, signal: detection.signal, confidence: detection.confidence }, 'Auto-detected provider for cluster')
          }
        }
      } catch {
        // Detection is best-effort — never block health sync
      }
    }
  }

  await db.update(clusters).set(updatePayload).where(eq(clusters.id, clusterId))
}

// ── Periodic Sync ─────────────────────────────────────────────

async function runSync(): Promise<void> {
  const snapshot = new Set(dirtySet)
  dirtySet.clear()

  for (const entry of snapshot) {
    const [clusterId, resourceType] = entry.split(':')
    if (!clusterId || !resourceType) continue

    try {
      if (resourceType === 'nodes') {
        await syncNodes(clusterId)
      }

      if (resourceType === 'events') {
        await syncEvents(clusterId)
      }

      // Derive cluster health whenever pods or nodes change
      if (resourceType === 'pods' || resourceType === 'nodes') {
        await syncClusterHealth(clusterId)
      }
    } catch (err) {
      // DB write failures must never crash the watch pipeline
      log.warn({ entry, err }, 'Sync failed')
    }
  }
}

// ── Public API ────────────────────────────────────────────────

export function startWatchDbWriter(): void {
  if (syncInterval) return // Already running

  // Auto-subscribe to each watch-event:{clusterId} channel as they're created
  const onNewListener = (eventName: string | symbol) => {
    if (typeof eventName !== 'string') return
    if (!eventName.startsWith('watch-event:')) return
    const clusterId = eventName.slice('watch-event:'.length)
    if (listeners.has(clusterId)) return

    const listener = (event: WatchEvent) => {
      dirtySet.add(`${clusterId}:${event.resourceType}`)
    }
    listeners.set(clusterId, listener)
    voyagerEmitter.on(eventName, listener)

    // Seed dirtySet so the first runSync() picks up existing WatchManager cache.
    // The db-writer registers AFTER watchManager.subscribe() completes, so all
    // initial 'add' events have already fired — without seeding, the cluster's
    // health/nodes/version never get written to PostgreSQL until the next K8s
    // change event (which on a stable cluster may never come).
    dirtySet.add(`${clusterId}:nodes`)
    dirtySet.add(`${clusterId}:pods`)
    dirtySet.add(`${clusterId}:events`)
  }

  voyagerEmitter.on('newListener', onNewListener)

  // Also subscribe to any already-active channels (in case watches started before db-writer)
  const existingChannels = voyagerEmitter
    .eventNames()
    .filter((name): name is string => typeof name === 'string' && name.startsWith('watch-event:'))
  for (const channel of existingChannels) {
    const clusterId = channel.slice('watch-event:'.length)
    if (listeners.has(clusterId)) continue
    const listener = (event: WatchEvent) => {
      dirtySet.add(`${clusterId}:${event.resourceType}`)
    }
    listeners.set(clusterId, listener)
    voyagerEmitter.on(channel, listener)
    // Seed initial sync (same rationale as onNewListener above)
    dirtySet.add(`${clusterId}:nodes`)
    dirtySet.add(`${clusterId}:pods`)
    dirtySet.add(`${clusterId}:events`)
  }

  // Start periodic sync
  syncInterval = setInterval(() => {
    runSync().catch((err) => log.error({ err }, 'Periodic sync failed'))
  }, WATCH_DB_SYNC_INTERVAL_MS)

  // Clean up orphaned listeners when a cluster's watch disconnects
  const onWatchStatus = (event: WatchStatusEvent) => {
    // Immediate one-shot sync when watches connect — ensures new clusters
    // transition from 'unreachable' to 'active' within seconds, not minutes.
    if (event.state === 'connected') {
      const cid = event.clusterId
      setTimeout(() => {
        syncClusterHealth(cid).catch((err) =>
          log.warn({ clusterId: cid, err }, 'Immediate health sync failed'),
        )
        syncNodes(cid).catch((err) =>
          log.warn({ clusterId: cid, err }, 'Immediate node sync failed'),
        )
        syncEvents(cid).catch((err) =>
          log.warn({ clusterId: cid, err }, 'Immediate event sync failed'),
        )
      }, 3_000)
      return
    }

    if (event.state !== 'disconnected') return
    const clusterId = event.clusterId
    const listener = listeners.get(clusterId)
    if (listener) {
      voyagerEmitter.off(`watch-event:${clusterId}`, listener)
      listeners.delete(clusterId)
      // Remove any pending dirty entries for this cluster
      for (const entry of dirtySet) {
        if (entry.startsWith(`${clusterId}:`)) dirtySet.delete(entry)
      }
      log.info({ clusterId }, 'Removed orphaned listener for cluster')
    }
  }

  // Listen for watch-status events on all clusters (wildcard via newListener pattern)
  const existingStatusChannels = voyagerEmitter
    .eventNames()
    .filter((name): name is string => typeof name === 'string' && name.startsWith('watch-status:'))
  for (const channel of existingStatusChannels) {
    voyagerEmitter.on(channel, onWatchStatus)
  }

  // Also subscribe to future watch-status channels.
  // Guard flag prevents infinite recursion: 'newListener' fires before the listener
  // is actually added, so .on() inside the handler triggers 'newListener' again.
  let addingStatusListener = false
  const onNewStatusListener = (eventName: string | symbol) => {
    if (addingStatusListener) return
    if (typeof eventName !== 'string') return
    if (!eventName.startsWith('watch-status:')) return
    addingStatusListener = true
    voyagerEmitter.on(eventName, onWatchStatus)
    addingStatusListener = false
  }
  voyagerEmitter.on('newListener', onNewStatusListener)

  // Store handler references for cleanup
  listeners.set('__newListener', onNewListener as unknown as (event: WatchEvent) => void)
  listeners.set(
    '__newStatusListener',
    onNewStatusListener as unknown as (event: WatchEvent) => void,
  )
  listeners.set('__onWatchStatus', onWatchStatus as unknown as (event: WatchEvent) => void)

  log.info({ syncIntervalMs: WATCH_DB_SYNC_INTERVAL_MS }, 'Started')
}

export function stopWatchDbWriter(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }

  // Remove newListener handlers
  const newListenerHandler = listeners.get('__newListener')
  if (newListenerHandler) {
    voyagerEmitter.off('newListener', newListenerHandler as (...args: unknown[]) => void)
    listeners.delete('__newListener')
  }
  const newStatusListenerHandler = listeners.get('__newStatusListener')
  if (newStatusListenerHandler) {
    voyagerEmitter.off('newListener', newStatusListenerHandler as (...args: unknown[]) => void)
    listeners.delete('__newStatusListener')
  }

  // Remove watch-status listeners
  const onWatchStatusHandler = listeners.get('__onWatchStatus')
  if (onWatchStatusHandler) {
    const statusChannels = voyagerEmitter
      .eventNames()
      .filter(
        (name): name is string => typeof name === 'string' && name.startsWith('watch-status:'),
      )
    for (const channel of statusChannels) {
      voyagerEmitter.off(channel, onWatchStatusHandler as (...args: unknown[]) => void)
    }
    listeners.delete('__onWatchStatus')
  }

  // Remove all per-cluster listeners
  for (const [clusterId, listener] of listeners) {
    voyagerEmitter.off(`watch-event:${clusterId}`, listener)
  }
  listeners.clear()

  log.info('Stopped')
}

// ── Startup Sync ─────────────────────────────────────────────
// Proactively health-check ALL clusters on API boot so the clusters list
// page shows correct data immediately — not only after someone visits each
// cluster's detail page.

export async function runStartupClusterSync(): Promise<void> {
  const allClusters = await db.select({ id: clusters.id, name: clusters.name }).from(clusters)
  if (allClusters.length === 0) return

  log.info({ count: allClusters.length }, 'Starting proactive cluster sync')

  const results = await Promise.allSettled(
    allClusters.map(async (cluster) => {
      try {
        const kc = await clusterClientPool.getClient(cluster.id)
        const coreApi = kc.makeApiClient(CoreV1Api)

        // Fetch version, nodes, pods in parallel
        const [versionInfo, nodesRes, podsRes] = await Promise.all([
          kc.makeApiClient(VersionApi).getCode().catch(() => null),
          coreApi.listNode().catch(() => null),
          coreApi.listPodForAllNamespaces().catch(() => null),
        ])

        const totalNodes = nodesRes?.items.length ?? 0
        const totalPods = podsRes?.items.length ?? 0
        const runningPods = podsRes?.items.filter((p) => p.status?.phase === 'Running').length ?? 0
        const healthStatus = deriveHealthStatus(totalNodes, totalPods, runningPods)
        const version = versionInfo ? `v${versionInfo.major}.${versionInfo.minor}` : undefined
        const now = new Date()

        const updatePayload: Record<string, unknown> = {
          healthStatus,
          nodesCount: totalNodes,
          lastHealthCheck: now,
          lastConnectedAt: now,
          status: 'active',
        }
        if (version) updatePayload.version = version

        await db.update(clusters).set(updatePayload).where(eq(clusters.id, cluster.id))

        // Also sync nodes to the nodes table so clusters.list subquery shows correct count
        if (nodesRes && nodesRes.items.length > 0) {
          const rawPods = podsRes?.items ?? []
          const podCountByNode = new Map<string, number>()
          for (const pod of rawPods) {
            const nodeName = pod.spec?.nodeName
            if (nodeName) podCountByNode.set(nodeName, (podCountByNode.get(nodeName) ?? 0) + 1)
          }

          const nodeValues = nodesRes.items.map((node) => {
            const name = node.metadata?.name ?? 'unknown'
            const conditions = node.status?.conditions ?? []
            const readyCondition = conditions.find((c) => c.type === 'Ready')
            const status = readyCondition?.status === 'True' ? 'Ready' : 'NotReady'
            const labels = node.metadata?.labels ?? {}
            const role =
              labels['node-role.kubernetes.io/control-plane'] !== undefined
                ? 'control-plane'
                : 'worker'

            return {
              clusterId: cluster.id,
              name,
              status,
              role,
              cpuCapacity: node.status?.capacity?.cpu
                ? Math.round(parseCpuToNano(node.status.capacity.cpu) / 1_000_000)
                : null,
              cpuAllocatable: node.status?.allocatable?.cpu
                ? Math.round(parseCpuToNano(node.status.allocatable.cpu) / 1_000_000)
                : null,
              memoryCapacity: node.status?.capacity?.memory
                ? parseMemToBytes(node.status.capacity.memory)
                : null,
              memoryAllocatable: node.status?.allocatable?.memory
                ? parseMemToBytes(node.status.allocatable.memory)
                : null,
              podsCount: podCountByNode.get(name) ?? 0,
              k8sVersion: node.status?.nodeInfo?.kubeletVersion ?? null,
            }
          })

          await db
            .insert(nodes)
            .values(nodeValues)
            .onConflictDoUpdate({
              target: [nodes.clusterId, nodes.name],
              set: {
                status: sql`excluded.status`,
                role: sql`excluded.role`,
                cpuCapacity: sql`excluded.cpu_capacity`,
                cpuAllocatable: sql`excluded.cpu_allocatable`,
                memoryCapacity: sql`excluded.memory_capacity`,
                memoryAllocatable: sql`excluded.memory_allocatable`,
                podsCount: sql`excluded.pods_count`,
                k8sVersion: sql`excluded.k8s_version`,
              },
            })

          // Delete stale nodes no longer reported
          const currentNodeNames = nodesRes.items.map((n) => n.metadata?.name ?? 'unknown')
          await db
            .delete(nodes)
            .where(and(eq(nodes.clusterId, cluster.id), notInArray(nodes.name, currentNodeNames)))
        }

        log.info(
          { clusterId: cluster.id, name: cluster.name, healthStatus, version, totalNodes },
          'Startup sync complete',
        )
      } catch (err) {
        // Mark cluster as unreachable if we can't connect at all
        await db
          .update(clusters)
          .set({ healthStatus: 'unreachable', lastHealthCheck: new Date() })
          .where(eq(clusters.id, cluster.id))
        log.warn(
          { clusterId: cluster.id, name: cluster.name, err: err instanceof Error ? err.message : err },
          'Startup sync failed — cluster unreachable',
        )
      }
    }),
  )

  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length
  log.info({ succeeded, failed, total: allClusters.length }, 'Startup cluster sync finished')
}
