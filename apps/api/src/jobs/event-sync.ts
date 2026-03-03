import * as k8s from '@kubernetes/client-node'
import { clusters, db, events } from '@voyager/db'
import { eq, and } from 'drizzle-orm'
import { clusterClientPool } from '../lib/cluster-client-pool.js'

const SYNC_INTERVAL_MS = 2 * 60 * 1000

let intervalHandle: NodeJS.Timeout | null = null
let isRunning = false

async function syncEvents(): Promise<void> {
  const allClusters = await db
    .select({ id: clusters.id })
    .from(clusters)
    .where(eq(clusters.isActive, true))

  for (const cluster of allClusters) {
    try {
      const kc = await clusterClientPool.getClient(cluster.id)
      const coreApi = kc.makeApiClient(k8s.CoreV1Api)
      const eventsRes = await coreApi.listEventForAllNamespaces()

      for (const event of eventsRes.items) {
        const uid = event.metadata?.uid
        if (!uid) continue

        const eventTimestamp = event.lastTimestamp ?? event.eventTime ?? event.metadata?.creationTimestamp
        const ts = eventTimestamp ? new Date(eventTimestamp as unknown as string) : new Date()

        // Check if event already exists by uid (used as id) + timestamp
        const existing = await db
          .select({ id: events.id })
          .from(events)
          .where(and(eq(events.id, uid), eq(events.timestamp, ts)))
          .limit(1)

        if (existing.length > 0) continue

        await db.insert(events).values({
          id: uid,
          clusterId: cluster.id,
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
    } catch (err) {
      console.warn(`[event-sync] failed for cluster ${cluster.id}`, err)
    }
  }
}

export function startEventSync(): void {
  if (intervalHandle) return

  const run = async () => {
    if (isRunning) return
    isRunning = true
    try {
      await syncEvents()
    } catch (error) {
      console.error('[event-sync] job run failed', error)
    } finally {
      isRunning = false
    }
  }

  void run()
  intervalHandle = setInterval(() => { void run() }, SYNC_INTERVAL_MS)
}

export function stopEventSync(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
