/**
 * Watch DB Writer — persists watch events to PostgreSQL, replacing the DB write
 * functionality of health-sync, node-sync, and event-sync jobs (D-09).
 *
 * Uses debounced periodic sync (not per-event writes) to avoid overwhelming the DB
 * during rolling deployments.
 */
import * as k8s from '@kubernetes/client-node'
import { clusters, db, events, nodes } from '@voyager/db'
import { and, eq, notInArray } from 'drizzle-orm'
import { WATCH_DB_SYNC_INTERVAL_MS } from '@voyager/config/sse'
import type { WatchEvent } from '@voyager/types'
import { voyagerEmitter } from './event-emitter.js'
import { watchManager } from './watch-manager.js'
import { parseCpuToNano, parseMemToBytes } from './k8s-units.js'

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
  const rawNodes = watchManager.getResources(clusterId, 'nodes') as k8s.V1Node[]
  if (rawNodes.length === 0) return

  // Build pod-per-node map from watch data
  const rawPods = watchManager.getResources(clusterId, 'pods') as k8s.V1Pod[]
  const podCountByNode = new Map<string, number>()
  for (const pod of rawPods) {
    const nodeName = pod.spec?.nodeName
    if (nodeName) {
      podCountByNode.set(nodeName, (podCountByNode.get(nodeName) ?? 0) + 1)
    }
  }

  for (const node of rawNodes) {
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

    // Upsert: find existing by clusterId + name
    const existing = await db
      .select({ id: nodes.id })
      .from(nodes)
      .where(and(eq(nodes.clusterId, clusterId), eq(nodes.name, name)))
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(nodes)
        .set({
          status,
          role,
          cpuCapacity: cpuCapMilli,
          cpuAllocatable: cpuAllocMilli,
          memoryCapacity: memCapBytes,
          memoryAllocatable: memAllocBytes,
          podsCount,
          k8sVersion,
        })
        .where(eq(nodes.id, existing[0].id))
    } else {
      await db.insert(nodes).values({
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
      })
    }
  }

  // Delete stale nodes no longer reported by WatchManager
  const currentNodeNames = rawNodes.map((n) => n.metadata?.name ?? 'unknown')
  await db
    .delete(nodes)
    .where(and(eq(nodes.clusterId, clusterId), notInArray(nodes.name, currentNodeNames)))
}

// ── Event Insert (replicate event-sync.ts logic) ─────────────

async function syncEvents(clusterId: string): Promise<void> {
  const rawEvents = watchManager.getResources(clusterId, 'events') as k8s.CoreV1Event[]
  if (rawEvents.length === 0) return

  for (const event of rawEvents) {
    const uid = event.metadata?.uid
    if (!uid) continue

    const eventTimestamp =
      event.lastTimestamp ?? event.eventTime ?? event.metadata?.creationTimestamp
    const ts = eventTimestamp ? new Date(eventTimestamp as unknown as string) : new Date()

    // Check if event already exists by uid + timestamp
    const existing = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, uid), eq(events.timestamp, ts)))
      .limit(1)

    if (existing.length > 0) continue

    await db.insert(events).values({
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
    })
  }
}

// ── Health Sync (replicate health-sync.ts logic) ─────────────

async function syncClusterHealth(clusterId: string): Promise<void> {
  const rawNodes = watchManager.getResources(clusterId, 'nodes') as k8s.V1Node[]
  const rawPods = watchManager.getResources(clusterId, 'pods') as k8s.V1Pod[]
  const now = new Date()

  const totalNodes = rawNodes.length
  const totalPods = rawPods.length
  const runningPods = rawPods.filter((pod) => pod.status?.phase === 'Running').length
  const healthStatus = deriveHealthStatus(totalNodes, totalPods, runningPods)

  // Only update status to 'active' if currently 'unreachable' or 'unknown'
  const [currentCluster] = await db
    .select({ status: clusters.status })
    .from(clusters)
    .where(eq(clusters.id, clusterId))

  const shouldActivate =
    !currentCluster ||
    currentCluster.status === 'unreachable' ||
    currentCluster.status === 'unknown'

  const updatePayload: Record<string, unknown> = {
    healthStatus,
    nodesCount: totalNodes,
    lastHealthCheck: now,
    lastConnectedAt: now,
  }
  if (shouldActivate) {
    updatePayload.status = 'active'
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
      console.warn(
        `[watch-db-writer] Sync failed for ${entry}:`,
        err instanceof Error ? err.message : err,
      )
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
  }

  // Start periodic sync
  syncInterval = setInterval(() => {
    runSync().catch((err) => console.error('[watch-db-writer] Periodic sync failed:', err))
  }, WATCH_DB_SYNC_INTERVAL_MS)

  // Store the newListener handler reference for cleanup
  listeners.set('__newListener', onNewListener as unknown as (event: WatchEvent) => void)

  console.log(`[watch-db-writer] Started (sync every ${WATCH_DB_SYNC_INTERVAL_MS / 1000}s)`)
}

export function stopWatchDbWriter(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }

  // Remove newListener handler
  const newListenerHandler = listeners.get('__newListener')
  if (newListenerHandler) {
    voyagerEmitter.off('newListener', newListenerHandler as (...args: unknown[]) => void)
    listeners.delete('__newListener')
  }

  // Remove all per-cluster listeners
  for (const [clusterId, listener] of listeners) {
    voyagerEmitter.off(`watch-event:${clusterId}`, listener)
  }
  listeners.clear()

  console.log('[watch-db-writer] Stopped')
}
