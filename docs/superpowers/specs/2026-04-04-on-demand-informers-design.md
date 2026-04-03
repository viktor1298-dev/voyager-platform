# On-Demand Informers — Cluster Connection Speed Optimization

**Date:** 2026-04-04
**Problem:** Cluster connection takes ~15 seconds — both when adding a new cluster and when entering a cluster page.
**Root Cause:** 17 K8s informers start sequentially (`for...await`) in `watchManager.subscribe()`, each making a LIST call (~500-800ms). SSE blocks on the full subscribe before sending any data.
**Inspiration:** Lens starts zero informers on cluster connect (loads per-page on demand, in parallel). Rancher starts informers as parallel goroutines, serves from proxy/cache while populating.

---

## Design Overview

Transform from "start all 17 informers on SSE connect" to "start only the informers each page needs, in parallel, on demand."

**Target latency:** <2 seconds from SSE connect to first data visible (down from ~12-15s).

---

## Architecture Changes

### 1. WatchManager: On-Demand + Parallel Informers

**Current flow:**
```
subscribe(clusterId) → for each of 17 RESOURCE_DEFS → await informer.start() → done
```

**New flow:**
```
subscribe(clusterId)        → connects to cluster, starts NO informers, emits 'connected'
ensureTypes(clusterId, [...]) → starts ONLY requested types, in parallel (Promise.allSettled)
```

**File:** `apps/api/src/lib/watch-manager.ts`

Changes:
- `subscribe(clusterId)` becomes lightweight: validate credentials, create KubeConfig, store cluster entry, emit `connected`. No informers started.
- New method `ensureTypes(clusterId, types: ResourceType[])`: starts informers for requested types that aren't already running. Uses `Promise.allSettled()` — all start in parallel.
- `getResources(clusterId, type)` returns `null` for types with no informer yet (existing behavior, no change).
- Reference counting moves from cluster-level to **type-level**: each `(clusterId, type)` pair tracks subscriber count. Informer stops when count drops to 0 (after 60s grace period per type).
- Grace period remains 60s per type (not per cluster).

**Core informer types** that always start (needed by watch-db-writer for cluster health):
- `nodes`, `pods`, `events` — these are requested by `ensureTypes()` from the watch-db-writer when a cluster first subscribes.

### 2. SSE Resource Stream: Non-Blocking Connect + Demand-Driven Snapshots

**Current flow:**
```
SSE connect → await watchManager.subscribe() (blocks 12s) → send all 17 snapshots → listen for events
```

**New flow:**
```
SSE connect → watchManager.subscribe() (instant, <100ms) → emit 'connected' status
   ↓
SSE query param `types` triggers watchManager.ensureTypes() for initial page types
   ↓
watchManager.ensureTypes(clusterId, types) → parallel start → snapshot per type as each becomes ready
   ↓
Page navigation: tRPC resources.subscribe() requests additional types → snapshot pushed via SSE
```

**Two transport mechanisms (clarified):**
- **SSE `types` query param** — used on initial connect to request the first page's types (e.g., Overview: `nodes,pods,events,namespaces`). This avoids a separate round-trip.
- **tRPC `resources.subscribe` mutation** — used for subsequent page navigations within the same SSE session (e.g., user clicks Pods tab → tRPC call requests `pods` type).

**File:** `apps/api/src/routes/resource-stream.ts`

Changes:
- `await watchManager.subscribe(clusterId)` no longer blocks — it's instant (just KubeConfig validation + cluster entry creation).
- After connect, immediately send snapshots for any types that are **already warm** (from grace period or another tab).
- Listen for `watch-ready:${clusterId}` events from WatchManager — when each informer finishes its initial LIST, immediately push that type's snapshot to SSE. Reuses existing `status` event with `state: 'ready'` + `resourceType` field (no new event type needed — consistent with existing `WatchStatusEvent` protocol).
- New SSE query param `types` (comma-separated) — frontend specifies which resource types to subscribe to on connect.
- Snapshot sending is progressive: each type pushed individually as its informer becomes ready.
- **SSE connection-scoped type tracking:** the SSE handler tracks which types were requested through this connection. On connection close (`request.raw.on('close')`), all tracked types are automatically unsubscribed (ref count decremented). This prevents memory leaks if tRPC `unsubscribe` calls fail due to network issues.

### 3. Frontend: Page-Level Resource Type Declarations

**Current flow:**
```
cluster layout: useResourceSSE(clusterId) — opens SSE, gets ALL 17 types
each page: useClusterResources(clusterId, 'pods') — reads from Zustand store
```

**New flow:**
```
cluster layout: useResourceSSE(clusterId) — opens SSE (instant connect)
each page: useClusterResources(clusterId, 'pods') — reads from store
           + useRequestResourceTypes(clusterId, ['pods']) — tells SSE which types this page needs
```

**Files:**
- New hook: `apps/web/src/hooks/useRequestResourceTypes.ts`
- Modified: `apps/web/src/hooks/useResourceSSE.ts`
- Modified: Each cluster page adds `useRequestResourceTypes()` call

**useRequestResourceTypes hook:**
```typescript
function useRequestResourceTypes(clusterId: string, types: ResourceType[]): void
```
- On mount: calls tRPC mutation `resources.subscribe({ clusterId, types })` to request types.
- On unmount: calls tRPC mutation `resources.unsubscribe({ clusterId, types })` to release ref count.
- Deduplicates: if pods informer already running, no-op.
- Multiple pages requesting same type = single informer (reference counted).
- **React strict mode safe:** Uses a ref to track mounted state. Double-invoke in dev mode causes mount→unmount→mount. The ref prevents the unmount cleanup from firing during strict mode's simulated unmount. The backend's ref counting also absorbs double-subscribe gracefully (subscribe twice, unsubscribe once = net +1).

**useResourceSSE changes:**
- SSE URL includes `types` query param for the initial set (Overview page types: `nodes,pods,events,namespaces`).
- `status` event with `state: 'ready'` + `resourceType` field — reuses existing `WatchStatusEvent` protocol (no new event type needed).
- On `ready` status: the hook knows that type's data is now available.

**Cluster layout changes (`apps/web/src/app/clusters/[id]/layout.tsx`):**
- `useCachedResources(clusterId)` remains in layout — still seeds store from warm cache.
- `useResourceSSE(clusterId)` remains in layout — manages the single SSE connection.
- NEW: layout does NOT call `useRequestResourceTypes` — that's per-page only.
- Each child page (Overview, Pods, etc.) calls `useRequestResourceTypes` with its own types.

### 4. Resources Router: Subscribe/Unsubscribe Mutations

**File:** `apps/api/src/routers/resources.ts`

New procedures:
```typescript
resources.subscribe   — input: { clusterId, types: ResourceType[] }
                       → calls watchManager.ensureTypes(clusterId, types)
                       → returns { ready: ResourceType[] } (types already cached)

resources.unsubscribe — input: { clusterId, types: ResourceType[] }
                       → decrements ref count per type
                       → types with 0 refs enter 60s grace before informer stops
```

The existing `resources.snapshot` endpoint remains unchanged — it returns whatever's cached.

### 5. Watch DB Writer: Self-Subscribing Core Types

**File:** `apps/api/src/lib/watch-db-writer.ts`

Currently the watch-db-writer detects clusters via `newListener` events on the emitter and `watch-status:*` connected events. It then reads from watchManager cache for nodes/pods/events.

Change: When the db-writer's `watch-status:*` listener receives a `connected` event for a cluster, it calls `watchManager.ensureTypes(clusterId, ['nodes', 'pods', 'events'])` to guarantee its required types are running regardless of what the frontend requests.

**Timing fix:** The current 3-second initial sync delay (`setTimeout(runSync, 3000)` after connected) is insufficient — `ensureTypes` is async and informers need ~500ms to complete their initial LIST. The db-writer must listen for `watch-ready` events (status with `state: 'ready'`) for its core types (nodes, pods, events) and only trigger initial sync after all three are ready. Subsequent periodic syncs (every 15s) continue as-is.

### 6. snapshotsReady Behavior with Partial Snapshots

**Problem:** `useCachedResources` marks `snapshotsReady` after ANY tRPC snapshot data arrives. With on-demand informers, the snapshot may only contain warm types (e.g., from grace period). Pages for non-warm types would see "empty state" instead of "loading skeleton."

**Solution:** `snapshotsReady` semantics change from "cluster has received data" to **per-type readiness**:
- Rename `snapshotsReady: Set<string>` to track `${clusterId}:${type}` keys instead of just `clusterId`.
- `useClusterResources` and `useSnapshotsReady` check per-type readiness: `snapshotsReady.has('${clusterId}:${type}')`.
- Each SSE `snapshot` event marks its specific type as ready.
- Each page's `isLoading` check: `resources.length === 0 && !snapshotsReady` continues to work — but now checks the specific type, not the whole cluster.
- `useCachedResources` marks each type individually as it seeds the store.

### 7. ClusterWatches Data Structure Changes

**Current `ClusterWatches` interface:**
```typescript
interface ClusterWatches {
  informers: Map<ResourceType, k8s.Informer>
  subscriberCount: number          // cluster-level ref count
  reconnectAttempts: Map<ResourceType, number>
  ready: Set<ResourceType>
  generation: number
}
```

**New `ClusterWatches` interface:**
```typescript
interface ClusterWatches {
  informers: Map<ResourceType, k8s.Informer>
  typeSubscriberCount: Map<ResourceType, number>  // per-type ref count
  reconnectAttempts: Map<ResourceType, number>     // unchanged
  ready: Set<ResourceType>                         // unchanged
  generation: number                               // unchanged
  kc: k8s.KubeConfig                              // cached from subscribe()
}
```

- `subscriberCount` (number) → `typeSubscriberCount` (Map<ResourceType, number>): per-type tracking.
- `graceTimers` map changes from `Map<clusterId, Timer>` to `Map<'${clusterId}:${type}', Timer>`: per-type grace periods.
- `heartbeatTimers` already keyed by `${clusterId}:${type}` — no change.
- `stableTimers` already keyed by `${clusterId}:${type}` — no change.
- `kc` (KubeConfig) stored on cluster entry during `subscribe()` so `ensureTypes()` doesn't need to re-fetch it.
- Cluster entry deleted only when ALL types have 0 refs AND all grace timers expired.
- `MAX_CONCURRENT_CLUSTER_WATCHES` limit stays on cluster entries (not informer count) — checked in `subscribe()`.

---

## Page-to-ResourceType Mapping

Each page declares which resource types it needs:

| Page | Resource Types |
|------|---------------|
| Overview | `nodes`, `pods`, `events`, `namespaces` |
| Nodes | `nodes` |
| Pods | `pods` |
| Deployments | `deployments` |
| Services | `services` |
| Namespaces | `namespaces` |
| Events | `events` |
| StatefulSets | `statefulsets` |
| DaemonSets | `daemonsets` |
| Jobs | `jobs` |
| CronJobs | `cronjobs` |
| HPA / Autoscaling | `hpa` |
| ConfigMaps | `configmaps` |
| Secrets | `secrets` |
| PVCs | `pvcs` |
| Ingresses | `ingresses` |
| Network Policies | `network-policies` |
| Resource Quotas | `resource-quotas` |
| Helm | (uses own tRPC + SSE, not WatchManager) |
| CRDs | (uses own tRPC, not WatchManager) |
| RBAC | (uses own tRPC, not WatchManager) |
| Topology | `pods`, `services`, `deployments`, `ingresses`, `nodes` |
| Logs | (uses log-stream SSE, not WatchManager) |
| Metrics | (uses metrics-stream SSE, not WatchManager) |

---

## Latency Budget

| Phase | Before | After |
|-------|--------|-------|
| SSE connect + auth | 100ms | 100ms |
| WatchManager subscribe | 8-12s (17 sequential) | <100ms (no informers) |
| Request types (e.g., pods page) | N/A | <50ms (tRPC call) |
| Informer startup (1 type, parallel) | N/A | ~500ms |
| Informer startup (4 types for Overview, parallel) | N/A | ~500ms |
| Snapshot transmission (1 type) | N/A | <100ms |
| **Total: first data visible** | **~12-15s** | **~800ms** |

---

## Event Flow (New)

### First Visit to Cluster (Cold)

```
Browser opens SSE → /api/resources/stream?clusterId=X&types=nodes,pods,events,namespaces
  ↓
Backend:
  1. Auth + cluster check (<100ms)
  2. watchManager.subscribe(clusterId) — creates cluster entry, KubeConfig, emits 'connected' (<100ms)
  3. watchManager.ensureTypes(clusterId, ['nodes','pods','events','namespaces']) — 4 informers in parallel
  4. Each informer: LIST → 'connect' event → emit watch-ready
  5. SSE pushes snapshot per type as each becomes ready (~500ms for all 4)
  ↓
Browser receives:
  - status: connected (instant)
  - snapshot: nodes (at ~500ms)
  - snapshot: pods (at ~500ms)
  - snapshot: events (at ~500ms)
  - snapshot: namespaces (at ~500ms)
```

### Navigate to Pods Tab (Additional Type)

```
Pods page mounts → useRequestResourceTypes(clusterId, ['pods'])
  ↓
If pods informer already running (from Overview): instant, no-op
If not: tRPC resources.subscribe({ clusterId, types: ['pods'] })
  ↓ Backend starts pods informer (~500ms)
  ↓ SSE pushes snapshot: pods
```

### Navigate Away from Pods Tab

```
Pods page unmounts → useRequestResourceTypes cleanup
  ↓
tRPC resources.unsubscribe({ clusterId, types: ['pods'] })
  ↓
Ref count decremented. If 0 refs: 60s grace timer starts.
After 60s with no re-subscribe: informer stops.
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Watch-db-writer loses health data | Self-subscribes to nodes/pods/events on cluster connect; waits for `ready` events before first sync |
| Type not requested = no data in store | `useClusterResources` already returns empty array, pages show loading skeleton. `snapshotsReady` is now per-type so "loading" vs "empty" is accurate. |
| Race condition: page mounts before SSE connected | `useRequestResourceTypes` queues request, retries after SSE connects |
| Informer stops during grace period, user returns | Informer restarts on next `ensureTypes()` call, ~500ms delay |
| Parallel informer starts overwhelming K8s API | 17 concurrent LIST calls is standard (kubectl does this). Optionally add p-limit(5) if needed |
| Memory leak if tRPC unsubscribe fails | SSE connection tracks all subscribed types; on connection close, all types auto-unsubscribed. tRPC unsubscribe is best-effort, not the only cleanup path. |
| React strict mode double-invoke | `useRequestResourceTypes` uses ref guard. Backend ref counting absorbs double-subscribe gracefully (subscribe twice, unsubscribe once = net +1). |
| Multiple browser tabs on same cluster | Ref counting handles this — both tabs increment counts independently. Informers are shared. Second tab gets instant snapshots from warm cache. |
| `ensureTypes` partial failure (e.g., CRD API unavailable) | `Promise.allSettled()` — individual type failures logged but don't block other types. Failed types return null from `getResources()`, frontend shows loading skeleton. |

---

## Files Changed

### Backend (`apps/api/`)
1. `src/lib/watch-manager.ts` — Major refactor: on-demand types, parallel start, per-type ref counting, `ensureTypes()` method, `ClusterWatches` restructure
2. `src/routes/resource-stream.ts` — Non-blocking subscribe, progressive snapshots, `types` query param, connection-scoped type tracking with auto-cleanup on close
3. `src/routers/resources.ts` — New subscribe/unsubscribe mutations
4. `src/lib/watch-db-writer.ts` — Self-subscribe to core types, wait for `ready` events before initial sync
5. `src/lib/event-emitter.ts` — New `watch-ready:${clusterId}` event (reuses status event with `state: 'ready'` + `resourceType`)

### Frontend (`apps/web/`)
6. New: `src/hooks/useRequestResourceTypes.ts` — Per-page type subscription hook (React strict mode safe)
7. `src/hooks/useResourceSSE.ts` — Add `types` param to SSE URL, handle `ready` status events
8. `src/hooks/useCachedResources.ts` — Seed per-type `snapshotsReady` instead of per-cluster
9. `src/stores/resource-store.ts` — `snapshotsReady` changes from `Set<clusterId>` to `Set<'${clusterId}:${type}'>`
10. `src/hooks/useResources.ts` — `useSnapshotsReady` takes `(clusterId, type)` instead of just `clusterId`
11. Each cluster page (~17 pages) — Add `useRequestResourceTypes()` call with correct types, update `useSnapshotsReady` call

### Shared
12. `packages/types/` — Add `resourceType` to `WatchStatusEvent` (optional field, already partially present)

---

## What Does NOT Change

- Zustand resource store Map-of-Maps structure — same
- `useClusterResources` hook — same selector logic
- SSE event format (snapshot, watch) — same payload shapes
- Replay buffer / Last-Event-ID — same
- Connection limiter — same (applies to SSE connections, not type subscriptions)
- Heartbeat mechanism — same
- Watch-db-writer sync interval (15s) — same
- Grace period concept — same (just per-type instead of per-cluster)
- `resources.snapshot` tRPC endpoint — same (returns whatever's cached)
- `MAX_CONCURRENT_CLUSTER_WATCHES` — stays on cluster entries, checked in `subscribe()`

---

## QA Validation Plan

After implementation, full QA loop:

1. **Every cluster tab** tested with 3 screenshots each (spaced 5-10s apart to verify live data updates)
2. **Console error check** after each page navigation
3. **Connection status badge** must show "Live" within 2 seconds
4. **Tab switching** — verify data loads on each tab without full page reload
5. **Browser refresh** — verify 60s grace period serves instant data
6. **New cluster add** — verify cluster appears and data loads within 2 seconds
7. Fix any issues found, re-run full QA
8. Run plan validation — verify all spec items implemented
9. Loop until 100% validation after QA passes
