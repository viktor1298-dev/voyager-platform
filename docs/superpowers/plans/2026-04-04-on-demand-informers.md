# On-Demand Informers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce cluster connection time from ~15s to <2s by starting K8s informers on-demand per page in parallel, instead of all 17 sequentially on SSE connect.

**Architecture:** WatchManager.subscribe() becomes instant (KubeConfig validation only, no informers). New ensureTypes() method starts only the requested resource types in parallel via Promise.allSettled(). Each page declares its resource types via useRequestResourceTypes() hook, and the SSE stream pushes progressive snapshots as each informer becomes ready.

**Tech Stack:** Node.js (@kubernetes/client-node informers), Fastify SSE, tRPC 11, React 19, Zustand 5

**Spec:** `docs/superpowers/specs/2026-04-04-on-demand-informers-design.md`

---

## File Map

### Backend (`apps/api/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/watch-manager.ts` | Modify | On-demand types, parallel start, per-type ref counting, ensureTypes/releaseTypes |
| `src/routes/resource-stream.ts` | Modify | Non-blocking subscribe, progressive snapshots, `types` query param, auto-cleanup |
| `src/routers/resources.ts` | Modify | Add subscribe/unsubscribe mutations |
| `src/lib/watch-db-writer.ts` | Modify | Self-subscribe to core types, wait for ready events before initial sync |

### Frontend (`apps/web/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `src/hooks/useRequestResourceTypes.ts` | Create | Per-page type subscription hook (tRPC subscribe/unsubscribe) |
| `src/stores/resource-store.ts` | Modify | snapshotsReady becomes per-type: `Set<'${clusterId}:${type}'>` |
| `src/hooks/useResources.ts` | Modify | useSnapshotsReady takes (clusterId, type) |
| `src/hooks/useResourceSSE.ts` | Modify | Add `types` query param, handle `ready` status events |
| `src/hooks/useCachedResources.ts` | Modify | Seed per-type snapshotsReady |
| 20 cluster pages | Modify | Add useRequestResourceTypes() + update useSnapshotsReady() calls |

### Shared (`packages/types/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `src/sse.ts` | Modify | Add `ready` to WatchStatusEvent state union |

---

## Task 1: Add `ready` State to WatchStatusEvent Type

**Files:**
- Modify: `packages/types/src/sse.ts:160-163`

- [ ] **Step 1: Update WatchStatusEvent type**

In `packages/types/src/sse.ts`, add `'ready'` to the state union:

```typescript
export interface WatchStatusEvent {
  clusterId: string
  state: 'connected' | 'reconnecting' | 'disconnected' | 'initializing' | 'ready'
  resourceType?: ResourceType
  error?: string
}
```

- [ ] **Step 2: Build types package to verify**

Run: `pnpm --filter @voyager/types build`
Expected: Clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/sse.ts
git commit -m "feat: add 'ready' state to WatchStatusEvent for per-type informer readiness"
```

---

## Task 2: Refactor WatchManager — On-Demand + Parallel Informers

This is the core change. The `subscribe()` method becomes lightweight (no informers), and a new `ensureTypes()` method starts only requested types in parallel.

**Files:**
- Modify: `apps/api/src/lib/watch-manager.ts`

- [ ] **Step 1: Update ClusterWatches interface**

Replace the current `ClusterWatches` interface (line 199-210) with per-type ref counting:

```typescript
interface ClusterWatches {
  informers: Map<
    ResourceType,
    k8s.Informer<k8s.KubernetesObject> & k8s.ObjectCache<k8s.KubernetesObject>
  >
  typeSubscriberCount: Map<ResourceType, number>
  reconnectAttempts: Map<ResourceType, number>
  ready: Set<ResourceType>
  generation: number
  kc: k8s.KubeConfig
}
```

- [ ] **Step 2: Rewrite subscribe() to be lightweight**

Replace the current `subscribe()` method (lines 302-423) with a version that only validates credentials and creates the cluster entry — no informer startup:

```typescript
async subscribe(clusterId: string): Promise<void> {
  // Cancel pending grace-period teardown if a new subscriber arrives
  for (const [key, timer] of this.graceTimers) {
    if (key.startsWith(`${clusterId}:`)) {
      clearTimeout(timer)
      this.graceTimers.delete(key)
    }
  }

  const existing = this.clusters.get(clusterId)
  if (existing) {
    // Already subscribed — no-op (type-level ref counting is in ensureTypes)
    return
  }

  // Check limit
  if (this.clusters.size >= MAX_CONCURRENT_CLUSTER_WATCHES) {
    log.warn({ clusterId, limit: MAX_CONCURRENT_CLUSTER_WATCHES }, 'Max concurrent watches reached, skipping cluster')
    return
  }

  // Create cluster entry with cached KubeConfig
  const kc = await clusterClientPool.getClient(clusterId)
  const generation = ++this.generationCounter
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
  log.info({ clusterId }, 'Cluster subscribed (on-demand informers)')
}
```

- [ ] **Step 3: Add new ensureTypes() method**

Add after subscribe():

```typescript
/**
 * Start informers for the requested types (if not already running).
 * All new informers start in parallel via Promise.allSettled().
 * Increments per-type subscriber count for ref counting.
 */
async ensureTypes(clusterId: string, types: ResourceType[]): Promise<ResourceType[]> {
  const cluster = this.clusters.get(clusterId)
  if (!cluster) return []

  const alreadyReady: ResourceType[] = []
  const toStart: ResourceDef[] = []

  for (const type of types) {
    // Increment ref count
    const current = cluster.typeSubscriberCount.get(type) ?? 0
    cluster.typeSubscriberCount.set(type, current + 1)

    // Cancel per-type grace timer if pending
    const graceKey = `${clusterId}:${type}`
    const graceTimer = this.graceTimers.get(graceKey)
    if (graceTimer) {
      clearTimeout(graceTimer)
      this.graceTimers.delete(graceKey)
    }

    if (cluster.informers.has(type)) {
      // Informer already running
      if (cluster.ready.has(type)) alreadyReady.push(type)
      continue
    }

    const def = RESOURCE_DEFS.find((d) => d.type === type)
    if (def) toStart.push(def)
  }

  if (toStart.length === 0) return alreadyReady

  // Start all new informers in parallel
  const generation = cluster.generation
  const results = await Promise.allSettled(
    toStart.map((def) => this.startInformer(clusterId, cluster, def, generation)),
  )

  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      log.warn({ clusterId, resourceType: toStart[i].type, err: (results[i] as PromiseRejectedResult).reason }, 'Failed to start informer')
    }
  }

  return alreadyReady
}
```

- [ ] **Step 4: Add startInformer() private method**

Extract the per-informer setup from the old subscribe() into a reusable method:

```typescript
private async startInformer(
  clusterId: string,
  cluster: ClusterWatches,
  def: ResourceDef,
  generation: number,
): Promise<void> {
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

  // Connect handler — mark ready, emit per-type 'ready' status, defer backoff reset
  informer.on('connect', () => {
    const c = this.clusters.get(clusterId)
    if (!c || c.generation !== generation) return

    const wasReady = c.ready.has(def.type)
    c.ready.add(def.type)
    this.resetHeartbeat(clusterId, def.type)

    // Emit per-type ready event (only on first ready, not reconnects)
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
  })

  await informer.start()
  cluster.informers.set(def.type, informer)
}
```

- [ ] **Step 5: Add releaseTypes() method**

Add after ensureTypes():

```typescript
/**
 * Decrement ref count for requested types. Types reaching 0 enter grace period.
 */
releaseTypes(clusterId: string, types: ResourceType[]): void {
  const cluster = this.clusters.get(clusterId)
  if (!cluster) return

  for (const type of types) {
    const count = cluster.typeSubscriberCount.get(type) ?? 0
    if (count <= 1) {
      cluster.typeSubscriberCount.set(type, 0)
      // Start per-type grace period
      const graceKey = `${clusterId}:${type}`
      if (!this.graceTimers.has(graceKey)) {
        log.info({ clusterId, resourceType: type, graceMs: UNSUBSCRIBE_GRACE_MS }, 'Type released, starting grace period')
        const timer = setTimeout(() => {
          this.graceTimers.delete(graceKey)
          this.teardownType(clusterId, type)
        }, UNSUBSCRIBE_GRACE_MS)
        this.graceTimers.set(graceKey, timer)
      }
    } else {
      cluster.typeSubscriberCount.set(type, count - 1)
    }
  }
}
```

- [ ] **Step 6: Add teardownType() private method**

```typescript
/** Stop a single informer for a cluster and clean up its timers. */
private teardownType(clusterId: string, type: ResourceType): void {
  const cluster = this.clusters.get(clusterId)
  if (!cluster) return
  // Don't tear down if someone re-subscribed during grace
  if ((cluster.typeSubscriberCount.get(type) ?? 0) > 0) return

  const informer = cluster.informers.get(type)
  if (informer) {
    try { informer.stop() } catch { /* ignore */ }
    cluster.informers.delete(type)
  }
  cluster.ready.delete(type)
  this.clearHeartbeat(clusterId, type)

  const stableKey = `${clusterId}:${type}`
  const stableTimer = this.stableTimers.get(stableKey)
  if (stableTimer) {
    clearTimeout(stableTimer)
    this.stableTimers.delete(stableKey)
  }

  log.info({ clusterId, resourceType: type }, 'Stopped informer (grace expired)')

  // If no informers left, tear down the whole cluster entry
  if (cluster.informers.size === 0) {
    this.clusters.delete(clusterId)
    clusterClientPool.invalidate(clusterId)
    voyagerEmitter.emitWatchStatus({ clusterId, state: 'disconnected' })
    log.info({ clusterId }, 'All informers stopped, cluster entry removed')
  }
}
```

- [ ] **Step 7: Update unsubscribe() for cluster-level cleanup**

Replace the current `unsubscribe()` method:

```typescript
unsubscribe(clusterId: string): void {
  const cluster = this.clusters.get(clusterId)
  if (!cluster) return

  // Release all types with active subscriptions
  const activeTypes = [...cluster.typeSubscriberCount.entries()]
    .filter(([, count]) => count > 0)
    .map(([type]) => type)
  this.releaseTypes(clusterId, activeTypes)
}
```

- [ ] **Step 8: Update handleInformerError() — fix subscriberCount reference**

In `handleInformerError()` (line 580), change `current.subscriberCount > 0` to check per-type. Note the parentheses — without them, `?? 0 > 0` evaluates as `?? (0 > 0)` which is always `false`:

```typescript
if (current && current.generation === generation && ((current.typeSubscriberCount.get(type) ?? 0) > 0)) {
```

- [ ] **Step 9: Update isWatching() and getActiveClusterIds() utility methods**

Both methods referenced the old `subscriberCount` — update to use `typeSubscriberCount`:

```typescript
isWatching(clusterId: string): boolean {
  const cluster = this.clusters.get(clusterId)
  if (!cluster) return false
  for (const count of cluster.typeSubscriberCount.values()) {
    if (count > 0) return true
  }
  return false
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
```

- [ ] **Step 10: Remove old teardownCluster() method**

Delete the `teardownCluster()` method since `teardownType()` replaces it.

- [ ] **Step 11: Update the file header comment**

Change "15 resource types" to "17 resource types" and add note about on-demand pattern.

- [ ] **Step 12: Verify typecheck**

Run: `pnpm --filter api typecheck`
Expected: 0 errors.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/lib/watch-manager.ts
git commit -m "feat: refactor WatchManager to on-demand parallel informers

subscribe() is now instant (KubeConfig only, no informers).
ensureTypes() starts only requested types in parallel via Promise.allSettled.
Per-type ref counting with 60s grace period per type."
```

---

## Task 3: Update SSE Resource Stream — Non-Blocking + Progressive Snapshots

**Files:**
- Modify: `apps/api/src/routes/resource-stream.ts`

- [ ] **Step 1: Add `types` to query schema**

Update the zod schema at the top:

```typescript
const querySchema = z.object({
  clusterId: z.string().uuid(),
  lastEventId: z.coerce.number().int().positive().optional(),
  types: z.string().optional(), // comma-separated ResourceType list
})
```

- [ ] **Step 2: Rewrite the subscribe + snapshot section**

Replace lines 149-197 (the blocking subscribe + sequential snapshot) with non-blocking subscribe + progressive snapshots:

```typescript
// 7. Subscribe to WatchManager (lightweight — no informers started)
try {
  await watchManager.subscribe(clusterId)
} catch (err) {
  const errorMsg = err instanceof Error ? err.message : 'Unknown error'
  writeEventWithId(
    'status',
    JSON.stringify({ clusterId, state: 'disconnected', error: errorMsg }),
  )
  log.error({ clusterId, err }, 'WatchManager subscribe failed')
  return // Can't proceed without valid cluster entry
}

// Track types subscribed through this connection for auto-cleanup on close
const connectionTypes = new Set<ResourceType>()

// 8. Listen for per-type ready events — push snapshot immediately when each type's informer completes
const onWatchReady = (event: WatchStatusEvent): void => {
  if (event.state !== 'ready' || !event.resourceType) return
  if (!connectionTypes.has(event.resourceType)) return

  // Push snapshot for this newly ready type
  const def = RESOURCE_DEFS.find((d) => d.type === event.resourceType)
  if (!def) return
  const resources = watchManager.getResources(clusterId, def.type)
  if (resources && resources.length > 0) {
    const mapped = resources.map((obj) => def.mapper(obj, clusterId))
    writeEventWithId('snapshot', JSON.stringify({ resourceType: def.type, items: mapped }))
  }
}
voyagerEmitter.on(`watch-status:${clusterId}`, onWatchReady)

// 9. Parse initial types from query param and start them
const requestedTypes = parsed.data.types
  ? (parsed.data.types.split(',').filter(Boolean) as ResourceType[])
  : []

if (requestedTypes.length > 0) {
  for (const t of requestedTypes) connectionTypes.add(t)

  // ensureTypes returns types that are already cached (warm from grace period)
  const alreadyReady = await watchManager.ensureTypes(clusterId, requestedTypes)

  // Send snapshots for already-warm types immediately
  if (!replayed) {
    for (const type of alreadyReady) {
      const def = RESOURCE_DEFS.find((d) => d.type === type)
      if (!def) continue
      const resources = watchManager.getResources(clusterId, def.type)
      if (resources && resources.length > 0) {
        const mapped = resources.map((obj) => def.mapper(obj, clusterId))
        writeEventWithId('snapshot', JSON.stringify({ resourceType: def.type, items: mapped }))
      }
    }
  }
}
```

Note: Move the `replayed` variable computation (Last-Event-ID check, lines 164-197) BEFORE this block, so it's available for the conditional.

- [ ] **Step 3: Update cleanup handler to auto-release types**

In the `request.raw.on('close')` cleanup (line 251), add:

```typescript
// Auto-release all types subscribed through this SSE connection
if (connectionTypes.size > 0) {
  watchManager.releaseTypes(clusterId, [...connectionTypes])
}
voyagerEmitter.off(`watch-status:${clusterId}`, onWatchReady)
```

And remove the old `watchManager.unsubscribe(clusterId)` call.

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter api typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/resource-stream.ts
git commit -m "feat: non-blocking SSE connect with progressive per-type snapshots

SSE connects instantly. types query param specifies initial resource types.
Snapshots stream progressively as each informer becomes ready.
Connection-scoped type tracking with auto-cleanup on close."
```

---

## Task 4: Add Subscribe/Unsubscribe Mutations to Resources Router

**Files:**
- Modify: `apps/api/src/routers/resources.ts`

- [ ] **Step 1: Add subscribe and unsubscribe mutations**

```typescript
import { z } from 'zod'
import type { ResourceType } from '@voyager/types'
import { protectedProcedure, router } from '../trpc.js'
import { RESOURCE_DEFS, watchManager } from '../lib/watch-manager.js'

const resourceTypeEnum = z.enum([
  'pods', 'services', 'configmaps', 'secrets', 'pvcs', 'namespaces',
  'events', 'nodes', 'deployments', 'statefulsets', 'daemonsets',
  'jobs', 'cronjobs', 'hpa', 'ingresses', 'network-policies', 'resource-quotas',
] as const)

export const resourcesRouter = router({
  snapshot: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(({ input }) => {
      const result: Record<string, unknown[]> = {}
      for (const def of RESOURCE_DEFS) {
        const resources = watchManager.getResources(input.clusterId, def.type)
        if (resources && resources.length > 0) {
          result[def.type] = resources.map((obj) => def.mapper(obj, input.clusterId))
        }
      }
      return result
    }),

  subscribe: protectedProcedure
    .input(z.object({
      clusterId: z.string().uuid(),
      types: z.array(resourceTypeEnum).min(1).max(17),
    }))
    .mutation(async ({ input }) => {
      const ready = await watchManager.ensureTypes(
        input.clusterId,
        input.types as ResourceType[],
      )
      return { ready }
    }),

  unsubscribe: protectedProcedure
    .input(z.object({
      clusterId: z.string().uuid(),
      types: z.array(resourceTypeEnum).min(1).max(17),
    }))
    .mutation(({ input }) => {
      watchManager.releaseTypes(input.clusterId, input.types as ResourceType[])
      return { ok: true }
    }),
})
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter api typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routers/resources.ts
git commit -m "feat: add resources.subscribe/unsubscribe tRPC mutations for on-demand types"
```

---

## Task 5: Update Watch DB Writer — Self-Subscribe to Core Types

**Files:**
- Modify: `apps/api/src/lib/watch-db-writer.ts`

- [ ] **Step 1: Replace the 3-second delay with ready-event-based sync**

In the `onWatchStatus` handler (around line 329), replace the 3-second `setTimeout` block:

```typescript
if (event.state === 'connected') {
  const cid = event.clusterId
  // Self-subscribe to core types needed for health/node/event sync
  watchManager.ensureTypes(cid, ['nodes', 'pods', 'events'] as ResourceType[]).catch((err) =>
    log.warn({ clusterId: cid, err }, 'Failed to ensure core types for db-writer'),
  )
  // Track which core types are ready for this cluster
  const coreReady = new Set<string>()
  const coreTypes = ['nodes', 'pods', 'events']
  const checkAndSync = (readyType: string) => {
    coreReady.add(readyType)
    if (coreTypes.every((t) => coreReady.has(t))) {
      // All core types ready — run initial sync
      syncClusterHealth(cid).catch((err) =>
        log.warn({ clusterId: cid, err }, 'Immediate health sync failed'),
      )
      syncNodes(cid).catch((err) =>
        log.warn({ clusterId: cid, err }, 'Immediate node sync failed'),
      )
      syncEvents(cid).catch((err) =>
        log.warn({ clusterId: cid, err }, 'Immediate event sync failed'),
      )
    }
  }
  // Check if any core types are already ready (warm from grace period)
  for (const t of coreTypes) {
    if (watchManager.getResources(cid, t as ResourceType) !== null) {
      checkAndSync(t)
    }
  }
  // Listen for remaining ready events
  const readyHandler = (readyEvent: WatchStatusEvent) => {
    if (readyEvent.state === 'ready' && readyEvent.resourceType && coreTypes.includes(readyEvent.resourceType)) {
      checkAndSync(readyEvent.resourceType)
    }
  }
  voyagerEmitter.on(`watch-status:${cid}`, readyHandler)
  // Clean up after 30s (all core types should be ready by then)
  setTimeout(() => {
    voyagerEmitter.off(`watch-status:${cid}`, readyHandler)
  }, 30_000)
  return
}
```

- [ ] **Step 2: Add import for ResourceType**

Add to the imports at the top:

```typescript
import type { ResourceType, WatchEvent, WatchStatusEvent } from '@voyager/types'
```

(Replace the existing separate imports of `WatchEvent` and `WatchStatusEvent`.)

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter api typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/watch-db-writer.ts
git commit -m "feat: watch-db-writer self-subscribes to core types, waits for ready events"
```

---

## Task 6: Update Zustand Store — Per-Type snapshotsReady

**Files:**
- Modify: `apps/web/src/stores/resource-store.ts`

- [ ] **Step 1: Update setResources to mark per-type readiness**

Change the `snapshotsReady` tracking from cluster-level to `${clusterId}:${type}` keys:

```typescript
setResources: (clusterId, type, items) =>
  set((state) => {
    const key = `${clusterId}:${type}`
    const innerMap = new Map<string, unknown>()
    for (const item of items) {
      const obj = item as { name: string; namespace?: string | null }
      innerMap.set(resourceKey(obj), item)
    }
    const next = new Map(state.resources)
    next.set(key, innerMap)
    // Mark this specific type as having received snapshots
    const readyKey = `${clusterId}:${type}`
    if (!state.snapshotsReady.has(readyKey)) {
      const ready = new Set(state.snapshotsReady)
      ready.add(readyKey)
      return { resources: next, snapshotsReady: ready }
    }
    return { resources: next }
  }),
```

- [ ] **Step 2: Update clearCluster to clear per-type keys**

```typescript
clearCluster: (clusterId) =>
  set((state) => {
    const next = new Map(state.resources)
    const ready = new Set(state.snapshotsReady)
    const prefix = `${clusterId}:`
    for (const key of state.resources.keys()) {
      if (key.startsWith(prefix)) next.delete(key)
    }
    for (const key of state.snapshotsReady) {
      if (key.startsWith(prefix)) ready.delete(key)
    }
    return {
      resources: next,
      snapshotsReady: ready,
      connectionState: { ...state.connectionState, [clusterId]: 'disconnected' as const },
    }
  }),
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter web typecheck`
Expected: 0 errors (useSnapshotsReady signature hasn't changed yet — that's next).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/stores/resource-store.ts
git commit -m "feat: per-type snapshotsReady tracking in resource store"
```

---

## Task 7: Update useResources Hook — Per-Type useSnapshotsReady

**Files:**
- Modify: `apps/web/src/hooks/useResources.ts`

- [ ] **Step 1: Update useSnapshotsReady to accept type parameter**

```typescript
/**
 * Check if a specific resource type for a cluster has received at least one SSE snapshot.
 * Use to distinguish "connected but waiting for data" from "connected and data is empty".
 * Pages should show loading skeleton when connected && !snapshotsReady.
 */
export function useSnapshotsReady(clusterId: string, type?: ResourceType): boolean {
  return useResourceStore(
    useCallback(
      (s) => {
        if (type) return s.snapshotsReady.has(`${clusterId}:${type}`)
        // Backward compat: if no type, check if ANY type for this cluster is ready
        for (const key of s.snapshotsReady) {
          if (key.startsWith(`${clusterId}:`)) return true
        }
        return false
      },
      [clusterId, type],
    ),
  )
}
```

- [ ] **Step 2: Add ResourceType import**

```typescript
import type { ResourceType } from '@voyager/types'
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter web typecheck`
Expected: 0 errors (existing callers don't pass `type` yet — backward compat via optional param).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useResources.ts
git commit -m "feat: useSnapshotsReady accepts optional resource type for per-type checks"
```

---

## Task 8: Create useRequestResourceTypes Hook

**Files:**
- Create: `apps/web/src/hooks/useRequestResourceTypes.ts`

- [ ] **Step 1: Create the hook**

```typescript
'use client'

import { useEffect, useRef } from 'react'
import type { ResourceType } from '@voyager/types'
import { trpc } from '@/lib/trpc'

/**
 * Declare which K8s resource types this page needs.
 * On mount: calls resources.subscribe to start informers for these types.
 * On unmount: calls resources.unsubscribe to release ref counts.
 *
 * React strict mode safe: uses ref guard to prevent cleanup during
 * simulated unmount. Backend ref counting absorbs double-subscribe gracefully.
 */
export function useRequestResourceTypes(
  clusterId: string | null,
  types: readonly ResourceType[],
): void {
  const subscribeMutation = trpc.resources.subscribe.useMutation()
  const unsubscribeMutation = trpc.resources.unsubscribe.useMutation()
  // Stable ref for mutation to avoid useEffect dependency churn
  const subRef = useRef(subscribeMutation)
  subRef.current = subscribeMutation
  const unsubRef = useRef(unsubscribeMutation)
  unsubRef.current = unsubscribeMutation
  // React strict mode guard — prevent cleanup on simulated unmount
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!clusterId || types.length === 0) return

    mountedRef.current = true
    const typesArr = [...types] as ResourceType[]

    subRef.current.mutate({ clusterId, types: typesArr })

    return () => {
      // React strict mode: don't unsubscribe on simulated unmount
      if (!mountedRef.current) return
      mountedRef.current = false

      unsubRef.current.mutate({ clusterId, types: typesArr })
    }
  }, [clusterId, types.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter web typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useRequestResourceTypes.ts
git commit -m "feat: add useRequestResourceTypes hook for per-page on-demand informers"
```

---

## Task 9: Update useResourceSSE — Add Types Param + Ready Event

**Files:**
- Modify: `apps/web/src/hooks/useResourceSSE.ts`

- [ ] **Step 1: Accept optional initialTypes parameter**

Update the function signature:

```typescript
export function useResourceSSE(
  clusterId: string | null,
  initialTypes?: readonly ResourceType[],
): { connectionState: ConnectionState } {
```

- [ ] **Step 2: Guard `ready` state in status handler**

In the `wireHandlers()` function's `status` event listener, add a guard to prevent `'ready'` from being set as connection state (it's a per-type event, not a connection state):

```typescript
es.addEventListener('status', (e: MessageEvent) => {
  lastDataRef.current = Date.now()
  if (e.lastEventId) lastEventIdRef.current = e.lastEventId
  try {
    const status: WatchStatusEvent = JSON.parse(e.data)
    // 'ready' is a per-type informer event, not a connection state
    if (status.state === 'ready') return
    setConnectionState(clusterId!, status.state as ConnectionState)
  } catch {
    /* ignore */
  }
})
```

- [ ] **Step 3: Include types in SSE URL**

In the `connect()` function, update the URL to include types:

```typescript
function connect() {
  closeConnection()
  setConnectionState(clusterId!, 'initializing')
  let connectUrl = url
  if (lastEventIdRef.current) {
    connectUrl += `&lastEventId=${lastEventIdRef.current}`
  }
  if (initialTypes && initialTypes.length > 0) {
    connectUrl += `&types=${initialTypes.join(',')}`
  }
  const es = new EventSource(connectUrl, { withCredentials: true })
  eventSourceRef.current = es
  wireHandlers(es)
}
```

- [ ] **Step 4: Add import for ResourceType**

```typescript
import type { ResourceType, WatchStatusEvent } from '@voyager/types'
```

- [ ] **Step 5: Verify typecheck**

Run: `pnpm --filter web typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useResourceSSE.ts
git commit -m "feat: useResourceSSE accepts initialTypes param, guards ready status events"
```

---

## Task 10: Update useCachedResources — Per-Type Seeding

**Files:**
- Modify: `apps/web/src/hooks/useCachedResources.ts`

- [ ] **Step 1: Update to seed per-type snapshotsReady**

The existing code already iterates per-type and calls `store.setResources()`, which now marks per-type readiness. The only change needed is removing the cluster-level `snapshotsReady` check:

```typescript
export function useCachedResources(clusterId: string | null) {
  const { data } = trpc.resources.snapshot.useQuery(
    { clusterId: clusterId! },
    {
      enabled: !!clusterId,
      staleTime: SYNC_INTERVAL_MS,
      refetchOnWindowFocus: false,
    },
  )

  useEffect(() => {
    if (!data || !clusterId) return
    const store = useResourceStore.getState()

    for (const [type, items] of Object.entries(data)) {
      if (Array.isArray(items) && items.length > 0) {
        // Skip types already delivered by SSE (SSE data is fresher)
        const readyKey = `${clusterId}:${type}`
        if (store.snapshotsReady.has(readyKey)) continue
        store.setResources(clusterId, type as ResourceType, items)
      }
    }
  }, [data, clusterId])
}
```

Note: The old `if (store.snapshotsReady.has(clusterId)) return` cluster-level guard is replaced with a per-type guard — only seed types that SSE hasn't already delivered fresher data for.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter web typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useCachedResources.ts
git commit -m "feat: useCachedResources seeds per-type snapshotsReady"
```

---

## Task 11: Update Cluster Layout — Pass Initial Types to SSE

**Files:**
- Modify: `apps/web/src/app/clusters/[id]/layout.tsx`

- [ ] **Step 1: Pass initial types to useResourceSSE**

The overview page (default tab) needs `nodes`, `pods`, `events`, `namespaces`. These should be the initial types requested on SSE connect:

```typescript
import type { ResourceType } from '@voyager/types'

// Types needed by the Overview page (default tab) — pre-requested on SSE connect
const INITIAL_RESOURCE_TYPES: readonly ResourceType[] = ['nodes', 'pods', 'events', 'namespaces']

export default function ClusterLayout({ children }: { children: React.ReactNode }) {
  // ...existing code...
  
  // Real-time resource updates — SSE connection covers ALL tabs
  const { connectionState } = useResourceSSE(clusterId, INITIAL_RESOURCE_TYPES)
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter web typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/clusters/[id]/layout.tsx
git commit -m "feat: pass initial resource types (Overview page) to SSE on connect"
```

---

## Task 12: Add useRequestResourceTypes to All Cluster Pages

This task updates all ~20 cluster pages to declare their resource types. Each page adds a `useRequestResourceTypes()` call and updates `useSnapshotsReady()` to pass the specific type.

**Files:**
- Modify: All files in `apps/web/src/app/clusters/[id]/*/page.tsx`

- [ ] **Step 1: Overview page (`page.tsx`)**

Add to the overview page component:

```typescript
import { useRequestResourceTypes } from '@/hooks/useRequestResourceTypes'
import type { ResourceType } from '@voyager/types'

const OVERVIEW_TYPES: readonly ResourceType[] = ['nodes', 'pods', 'events', 'namespaces']

// Inside component, after resolvedId:
useRequestResourceTypes(resolvedId, OVERVIEW_TYPES)
const snapshotsReady = useSnapshotsReady(resolvedId, 'nodes')
```

- [ ] **Step 2: Pods page**

```typescript
import { useRequestResourceTypes } from '@/hooks/useRequestResourceTypes'
const PODS_TYPES = ['pods'] as const

// Inside component:
useRequestResourceTypes(resolvedId, PODS_TYPES)
const snapshotsReady = useSnapshotsReady(resolvedId, 'pods')
```

- [ ] **Step 3: Nodes page**

```typescript
useRequestResourceTypes(resolvedId, ['nodes'] as const)
const snapshotsReady = useSnapshotsReady(resolvedId, 'nodes')
```

- [ ] **Step 4: Deployments page**

```typescript
useRequestResourceTypes(resolvedId, ['deployments'] as const)
const snapshotsReady = useSnapshotsReady(resolvedId, 'deployments')
```

- [ ] **Step 5: Services page**

```typescript
useRequestResourceTypes(resolvedId, ['services'] as const)
const snapshotsReady = useSnapshotsReady(resolvedId, 'services')
```

- [ ] **Step 6: Namespaces page**

```typescript
useRequestResourceTypes(resolvedId, ['namespaces'] as const)
const snapshotsReady = useSnapshotsReady(resolvedId, 'namespaces')
```

- [ ] **Step 7: Events page**

```typescript
useRequestResourceTypes(resolvedId, ['events'] as const)
const snapshotsReady = useSnapshotsReady(resolvedId, 'events')
```

- [ ] **Step 8: StatefulSets page**

```typescript
useRequestResourceTypes(resolvedId, ['statefulsets'] as const)
const snapshotsReady = useSnapshotsReady(resolvedId, 'statefulsets')
```

- [ ] **Step 9: DaemonSets page**

```typescript
useRequestResourceTypes(resolvedId, ['daemonsets'] as const)
const snapshotsReady = useSnapshotsReady(resolvedId, 'daemonsets')
```

- [ ] **Step 10: Jobs page**

```typescript
useRequestResourceTypes(resolvedId, ['jobs'] as const)
const snapshotsReady = useSnapshotsReady(resolvedId, 'jobs')
```

- [ ] **Step 11: CronJobs page**

```typescript
useRequestResourceTypes(resolvedId, ['cronjobs'] as const)
const snapshotsReady = useSnapshotsReady(resolvedId, 'cronjobs')
```

- [ ] **Step 12: HPA page**

```typescript
useRequestResourceTypes(resolvedId, ['hpa'] as const)
const snapshotsReady = useSnapshotsReady(resolvedId, 'hpa')
```

- [ ] **Step 13: ConfigMaps page**

```typescript
useRequestResourceTypes(resolvedId, ['configmaps'] as const)
const snapshotsReady = useSnapshotsReady(resolvedId, 'configmaps')
```

- [ ] **Step 14: Secrets page**

```typescript
useRequestResourceTypes(resolvedId, ['secrets'] as const)
const snapshotsReady = useSnapshotsReady(resolvedId, 'secrets')
```

- [ ] **Step 15: PVCs page**

```typescript
useRequestResourceTypes(resolvedId, ['pvcs'] as const)
const snapshotsReady = useSnapshotsReady(resolvedId, 'pvcs')
```

- [ ] **Step 16: Ingresses page**

```typescript
useRequestResourceTypes(resolvedId, ['ingresses'] as const)
const snapshotsReady = useSnapshotsReady(resolvedId, 'ingresses')
```

- [ ] **Step 17: Network Policies page**

```typescript
useRequestResourceTypes(clusterId, ['network-policies'] as const)
const snapshotsReady = useSnapshotsReady(clusterId, 'network-policies')
```

- [ ] **Step 18: Resource Quotas page**

```typescript
useRequestResourceTypes(clusterId, ['resource-quotas'] as const)
const snapshotsReady = useSnapshotsReady(clusterId, 'resource-quotas')
```

- [ ] **Step 19: Helm page** (uses own SSE, but snapshotsReady should still pass type)

The Helm page uses `useHelmReleases` (its own SSE), not WatchManager. Keep `useSnapshotsReady(clusterId)` without type for backward compat — Helm doesn't need useRequestResourceTypes.

- [ ] **Step 20: Verify full typecheck**

Run: `pnpm typecheck`
Expected: 0 errors across all packages.

- [ ] **Step 21: Commit**

```bash
git add apps/web/src/app/clusters/
git commit -m "feat: add useRequestResourceTypes to all cluster pages for on-demand informers"
```

---

## Task 13: Full Build Verification

- [ ] **Step 1: Run full build**

```bash
pnpm build
```

Expected: Clean build, 0 errors.

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: 0 lint errors.

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: 0 type errors.

- [ ] **Step 4: Fix any issues found**

If build/lint/typecheck fails, fix the issues and re-run.

- [ ] **Step 5: Commit fixes (if any)**

---

## Task 14: Start Dev Servers and Smoke Test

- [ ] **Step 1: Start dev servers**

```bash
pnpm dev
```

Wait for both API and Web to be healthy:
- API: `curl -sf http://localhost:4001/health`
- Web: `curl -sf -o /dev/null http://localhost:3000`

- [ ] **Step 2: Verify API logs show on-demand pattern**

Check API logs for:
- `Cluster subscribed (on-demand informers)` on SSE connect
- Individual informer starts with resource types
- `ready` status events per type

- [ ] **Step 3: Quick browser check**

Navigate to a cluster → Overview tab. Verify:
- Connection badge shows "Live" within 2 seconds (not 15s)
- Node, pod, event, namespace data loads quickly
- Click Pods tab — data loads without full reconnect

---

## Task 15: Full QA — All Tabs, 3 Screenshots Each

Use the `/functional-qa` skill. For EACH of the following tabs, navigate to the tab, take 3 screenshots spaced 5-10 seconds apart to verify live data updates:

- [ ] **Step 1: Overview tab** — 3 screenshots, check live data counters update
- [ ] **Step 2: Nodes tab** — 3 screenshots, verify node list populates
- [ ] **Step 3: Pods tab** — 3 screenshots, verify pod list + status badges
- [ ] **Step 4: Deployments tab** — 3 screenshots, verify deployment list
- [ ] **Step 5: Services tab** — 3 screenshots, verify service list
- [ ] **Step 6: Namespaces tab** — 3 screenshots, verify namespace list
- [ ] **Step 7: Events tab** — 3 screenshots, verify events timeline
- [ ] **Step 8: StatefulSets tab** — 3 screenshots
- [ ] **Step 9: DaemonSets tab** — 3 screenshots
- [ ] **Step 10: Jobs tab** — 3 screenshots
- [ ] **Step 11: CronJobs tab** — 3 screenshots
- [ ] **Step 12: HPA tab** — 3 screenshots
- [ ] **Step 13: ConfigMaps tab** — 3 screenshots
- [ ] **Step 14: Secrets tab** — 3 screenshots
- [ ] **Step 15: PVCs tab** — 3 screenshots
- [ ] **Step 16: Ingresses tab** — 3 screenshots
- [ ] **Step 17: Network Policies tab** — 3 screenshots
- [ ] **Step 18: Resource Quotas tab** — 3 screenshots
- [ ] **Step 19: Helm tab** — 3 screenshots
- [ ] **Step 20: Logs tab** — 3 screenshots
- [ ] **Step 21: Metrics tab** — 3 screenshots
- [ ] **Step 22: Console error check** — After all tabs, check browser console for any [ERROR] entries
- [ ] **Step 23: Connection status badge** — Verify shows "Live" within 2 seconds after initial connect

**If any issues found:** Fix them, then re-run the FULL QA from step 1.

---

## Task 16: Plan Validation

After QA passes, verify all spec items are implemented:

- [ ] **Step 1: WatchManager refactored** — subscribe() is lightweight, ensureTypes() starts parallel informers
- [ ] **Step 2: Per-type ref counting** — typeSubscriberCount Map, per-type grace timers
- [ ] **Step 3: SSE non-blocking** — subscribe() doesn't block, types query param works
- [ ] **Step 4: Progressive snapshots** — each type's snapshot sent as informer becomes ready
- [ ] **Step 5: SSE auto-cleanup** — connection close releases all tracked types
- [ ] **Step 6: resources.subscribe/unsubscribe mutations** — working, correct ref counting
- [ ] **Step 7: watch-db-writer self-subscribes** — core types (nodes/pods/events) ensured
- [ ] **Step 8: snapshotsReady per-type** — Zustand store tracks per `${clusterId}:${type}`
- [ ] **Step 9: useSnapshotsReady per-type** — accepts optional type parameter
- [ ] **Step 10: useRequestResourceTypes hook** — React strict mode safe
- [ ] **Step 11: All 20 cluster pages updated** — each declares its resource types
- [ ] **Step 12: Connection time <2s** — measured from SSE connect to first data visible
- [ ] **Step 13: WatchStatusEvent type updated** — includes 'ready' state

**If any items missing:** Fix them, then re-run full QA (Task 15).
**Loop until 100% validation after QA passes.**
