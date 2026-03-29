# Phase 10: Lens-Style Live Data -- K8s Watch Stream Architecture - Research

**Researched:** 2026-03-29
**Domain:** K8s Watch API, SSE data streaming, in-memory store, TanStack Query cache mutation
**Confidence:** HIGH

## Summary

This phase replaces the current "signal-only SSE + frontend polling" architecture with a Lens-style data streaming pipeline where K8s Watch events carry full resource objects to the browser via SSE, and the client applies them directly to TanStack Query cache via `setQueryData()` without refetch round-trips. The codebase has 64 `refetchInterval` entries across 48 frontend files doing all the actual data freshness work, while the two existing watch managers (ClusterWatchManager -- never started; ResourceWatchManager -- signal-only) are underutilized. Three background sync jobs (health-sync, node-sync, event-sync) redundantly poll the K8s API on timers.

The critical discovery from source code analysis is that `@kubernetes/client-node@1.4.0`'s `makeInformer()` returns a `ListWatch` that already implements `ObjectCache<T>` with `.list()` and `.get()` methods, plus built-in 410 Gone handling with automatic re-list. This means the "in-memory store" from D-07 can leverage the informer's built-in cache rather than building a separate `Map<clusterId, Map<resourceType, KubeResource[]>>` -- the informer IS the store. However, the informer does NOT auto-reconnect on errors (non-410); the error callback fires and the informer stops, requiring explicit `.start()` to reconnect.

The key architectural challenge is that tRPC routers transform raw K8s objects into frontend-friendly shapes (adding computed fields like CPU percentages, deriving status from conditions, enriching with metrics). The SSE stream must carry these transformed objects (not raw K8s objects) for `setQueryData()` to work seamlessly with existing React components. This means the transformation logic currently embedded in routers needs to be extracted into shared mappers that both the tRPC routers and the watch event pipeline can use.

**Primary recommendation:** Build a unified WatchManager that wraps `makeInformer()` per resource type per cluster, leverages the informer's built-in `ObjectCache` for initial tRPC queries, extracts router transformation logic into shared mappers, and emits transformed objects over SSE for client-side `setQueryData()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: SSE Data Payload -- Full K8s Resource Objects (complete objects, not signals/deltas, 1-5KB each)
- D-02: SSE Buffering -- 1-Second Server-Side Batch (buffer then send, prevents UI thrashing)
- D-03: Client-Side Store -- TanStack Query setQueryData (no new state library, apply directly)
- D-04: Initial Load -- tRPC Query + Watch (List/Watch pattern, components show data instantly)
- D-05: Watch Lifecycle -- Per-Cluster Persistent (start all types on any cluster page, stop on no viewers)
- D-06: Unified Watch Manager -- Single Manager for ALL resource types (merge two managers)
- D-07: Server-Side Cache -- In-Memory Store replacing Redis for watched resources
- D-08: Migration -- Big Bang Switch (remove ALL refetchInterval at once, no dual paths)
- D-09: Background Sync Jobs -- Replace 3 of 4 with watches (keep metrics-collector + metrics-stream-job)

### Claude's Discretion
- Watch reconnection strategy (exponential backoff parameters, re-list on 410 Gone)
- In-memory store data structure and cleanup (max items per resource type)
- SSE connection management (max connections per cluster, global limit)
- How to propagate watch errors to the UI (toast notification vs status badge)
- Whether to keep `cached()` wrapper for non-watched tRPC queries or remove it entirely

### Deferred Ideas (OUT OF SCOPE)
- Multi-instance API support (in-memory store is single-process)
- WebSocket replacement for SSE
- Custom resource (CRD) watch -- dynamic informer registration
- Selective field watches (fieldSelector/labelSelector optimization)
</user_constraints>

## Project Constraints (from CLAUDE.md)

- **ESM only** -- all packages are `"type": "module"`, use `.js` extensions in imports for `.ts` files
- **Zod v4** -- `z.record()` requires TWO arguments
- **Biome** -- 2-space indent, 100-char line width, single quotes, semicolons as-needed
- **Never add `migrate()` to server.ts** -- schema via Helm init.sql only
- **Deploy = `helm uninstall` + `helm install`** -- never `helm upgrade`
- **Build must precede typecheck** -- workspace packages export from dist/
- **K8S_ENABLED=false** disables watchers only, sync jobs always run
- **Redis failures are non-fatal** -- always catch and fall through
- **K8s informers do NOT auto-reconnect** -- must call `.start()` in error handler with delay
- **SSE endpoints must flush immediately** -- write data after writeHead() to avoid CONNECTING hang
- **Config constants in config files** -- never hardcode values in routers or jobs
- **tRPC uses httpLink not httpBatchLink** -- never revert (nginx URL length limit)
- **@voyager/ prefix** for workspace packages
- **handleK8sError** for standardized K8s error handling across routers

## Standard Stack

### Core (already installed -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @kubernetes/client-node | 1.4.0 | K8s API + informers + Watch | Already in use; `makeInformer()` creates `ListWatch` with built-in ObjectCache |
| @tanstack/react-query | 5.90.21 | Client-side cache + setQueryData | Already in use; `queryClient.setQueryData()` for push-based updates |
| Fastify 5 | installed | SSE streaming via raw response | Already in use; `reply.raw.write()` for SSE |
| tRPC 11 | installed | Initial data load via queries | Already in use; routers serve initial list then SSE takes over |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| redis (ioredis/node-redis) | installed | Cache for NON-watched resources only | Metrics, search indexes, non-K8s data |
| drizzle-orm | installed | PostgreSQL writes for historical data | Watch events also write to DB for dashboard |

### No New Dependencies
This phase requires zero new npm packages. Everything is built on existing stack: K8s informers, Fastify SSE, TanStack Query. The architectural change is in how these pieces connect, not what tools are used.

## Architecture Patterns

### Critical Discovery: Informer IS the In-Memory Store

`@kubernetes/client-node@1.4.0` `makeInformer()` returns `Informer<T> & ObjectCache<T>`:

```typescript
// Source: node_modules/.pnpm/@kubernetes+client-node@1.4.0/.../dist/cache.d.ts
export interface ObjectCache<T> {
    get(name: string, namespace?: string): T | undefined;
    list(namespace?: string): ReadonlyArray<T>;
}
```

The `ListWatch` class maintains its own `Map<namespace, Map<name, T>>` internally. When you call `informer.list()`, you get the current state of all objects. When events fire (add/update/delete), the internal map is already updated before your callback runs.

**This means D-07's "in-memory store" should NOT be a separate data structure. The informer's built-in cache IS the store.** The unified WatchManager simply holds references to informers and delegates `.list()` and `.get()` to them.

### Recommended Architecture

```
apps/api/src/
├── lib/
│   ├── watch-manager.ts           # NEW: Unified WatchManager (replaces cluster-watch-manager + resource-watch-manager)
│   ├── resource-mappers.ts        # NEW: Extracted transformation logic from routers
│   ├── cluster-client-pool.ts     # UNCHANGED
│   ├── event-emitter.ts           # SIMPLIFIED: fewer event types needed
│   ├── cluster-connection-state.ts # KEEP: watch state FSM
│   ├── cache.ts                   # KEEP: Redis for non-watched resources
│   ├── cache-keys.ts              # SLIM: remove watched-resource keys
│   └── k8s-watchers.ts            # SIMPLIFY: remove stopAllWatchers delegation
├── routes/
│   ├── resource-stream.ts         # REWRITE: data-carrying SSE (full objects, not signals)
│   ├── metrics-stream.ts          # UNCHANGED
│   └── log-stream.ts              # UNCHANGED
├── routers/                       # MODIFY: read from WatchManager instead of cached()
├── jobs/
│   ├── metrics-history-collector.ts # KEEP
│   ├── metrics-stream-job.ts      # KEEP
│   ├── alert-evaluator.ts         # KEEP (reads from DB, not K8s API)
│   ├── deploy-smoke-test.ts       # KEEP
│   ├── health-sync.ts             # REMOVE
│   ├── node-sync.ts               # REMOVE
│   └── event-sync.ts              # REMOVE
└── server.ts                      # MODIFY: remove 3 jobs, init WatchManager

apps/web/src/
├── hooks/
│   ├── useResourceSSE.ts          # REWRITE: parse full objects, apply via setQueryData
│   ├── useMetricsSSE.ts           # UNCHANGED
│   └── useMetricsData.ts          # UNCHANGED
├── app/clusters/[id]/layout.tsx   # KEEP: useResourceSSE still lives here
└── app/clusters/[id]/**           # MODIFY: remove all refetchInterval from 48 files
```

### Pattern 1: Unified WatchManager with Informer-as-Store

**What:** Single class manages all K8s informers per cluster, delegates data reads to informer's built-in ObjectCache.
**When to use:** ALL K8s resource reads for watched resources.

```typescript
// Source: Architecture based on @kubernetes/client-node@1.4.0 ObjectCache API
import * as k8s from '@kubernetes/client-node'

interface ClusterWatches {
  informers: Map<ResourceType, k8s.Informer<k8s.KubernetesObject> & k8s.ObjectCache<k8s.KubernetesObject>>
  subscriberCount: number
}

class WatchManager {
  private clusters = new Map<string, ClusterWatches>()

  // Read from informer's built-in cache -- 0ms, no API call, no Redis
  getResources(clusterId: string, type: ResourceType): ReadonlyArray<k8s.KubernetesObject> {
    const informer = this.clusters.get(clusterId)?.informers.get(type)
    if (!informer) return []
    return informer.list()  // Built-in ObjectCache.list()
  }

  getResource(clusterId: string, type: ResourceType, name: string, namespace?: string): k8s.KubernetesObject | undefined {
    const informer = this.clusters.get(clusterId)?.informers.get(type)
    if (!informer) return undefined
    return informer.get(name, namespace)  // Built-in ObjectCache.get()
  }

  // Reference-counted cluster lifecycle
  subscribe(clusterId: string, connectionId: string): void { /* ... */ }
  unsubscribe(clusterId: string, connectionId: string): void { /* ... */ }
}
```

### Pattern 2: Extracted Resource Mappers

**What:** Transform raw K8s objects to frontend shapes in shared functions (not inline in routers).
**When to use:** Both tRPC router responses AND SSE event payloads need the same shape.

```typescript
// apps/api/src/lib/resource-mappers.ts
import * as k8s from '@kubernetes/client-node'

export function mapPod(pod: k8s.V1Pod, metricsMap?: Map<string, PodMetrics>): PodData {
  // Extract from pods router's current transformation logic
  return {
    name: pod.metadata?.name ?? '',
    namespace: pod.metadata?.namespace ?? '',
    phase: pod.status?.phase ?? 'Unknown',
    // ... all current pod mapping logic
  }
}

export function mapDeployment(dep: k8s.V1Deployment): DeploymentData { /* ... */ }
export function mapService(svc: k8s.V1Service): ServiceData { /* ... */ }
// ... one mapper per resource type
```

### Pattern 3: Data-Carrying SSE Events

**What:** SSE events carry the full transformed resource object, not just a "something changed" signal.
**When to use:** All watch events sent to browsers.

```typescript
// New SSE event format
interface WatchEvent<T = unknown> {
  type: 'ADDED' | 'MODIFIED' | 'DELETED'
  resourceType: ResourceType
  object: T  // Full transformed resource object (same shape as tRPC response item)
}

// Server-side: batch events for 1 second then flush
const batch: WatchEvent[] = []
let batchTimer: NodeJS.Timeout | null = null

function queueEvent(event: WatchEvent) {
  batch.push(event)
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      reply.raw.write(`event: watch\ndata: ${JSON.stringify(batch)}\n\n`)
      batch.length = 0
      batchTimer = null
    }, 1000)  // D-02: 1-second batch window
  }
}
```

### Pattern 4: Client-Side setQueryData for List Mutations

**What:** Apply SSE watch events directly to TanStack Query cache without refetch.
**When to use:** useResourceSSE hook processing incoming SSE events.

```typescript
// Source: TanStack Query v5 setQueryData pattern
// https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates

function applyWatchEvent(queryClient: QueryClient, event: WatchEvent) {
  const queryKey = getQueryKey(event.resourceType, event.clusterId)

  queryClient.setQueryData(queryKey, (oldData: ResourceItem[] | undefined) => {
    if (!oldData) return oldData

    switch (event.type) {
      case 'ADDED':
        // Check if already exists (idempotency)
        if (oldData.some(item => item.name === event.object.name && item.namespace === event.object.namespace)) {
          return oldData.map(item =>
            item.name === event.object.name && item.namespace === event.object.namespace
              ? event.object : item
          )
        }
        return [...oldData, event.object]

      case 'MODIFIED':
        return oldData.map(item =>
          item.name === event.object.name && item.namespace === event.object.namespace
            ? event.object : item
        )

      case 'DELETED':
        return oldData.filter(item =>
          !(item.name === event.object.name && item.namespace === event.object.namespace)
        )

      default:
        return oldData
    }
  })
}
```

### Pattern 5: Watch Reconnection with Exponential Backoff

**What:** Informers stop on error (non-410). Must manually restart with backoff.
**When to use:** All informer error handlers.

```typescript
// Recommended: exponential backoff with jitter
const BACKOFF_BASE_MS = 1000
const BACKOFF_MAX_MS = 30000

function handleInformerError(
  informer: k8s.Informer<k8s.KubernetesObject>,
  clusterId: string,
  resourceType: string,
  attempt: number
): void {
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS)
  const jitter = delay * 0.1 * Math.random()

  setTimeout(() => {
    if (isClusterActive(clusterId)) {
      informer.start().catch(() => {
        // Increment attempt, recurse
        handleInformerError(informer, clusterId, resourceType, attempt + 1)
      })
    }
  }, delay + jitter)
}

// Note: 410 Gone is handled INTERNALLY by ListWatch.doneHandler()
// It resets resourceVersion to '' and re-lists. No manual intervention needed.
```

### Anti-Patterns to Avoid

- **Anti-pattern: Building a separate in-memory Map alongside informers.** The informer's `ObjectCache` already IS the map. Duplicating it wastes memory and risks inconsistency.
- **Anti-pattern: Sending raw K8s objects over SSE.** Routers transform objects (compute CPU %, derive status, etc.). SSE must send the same transformed shape for `setQueryData()` to be seamless.
- **Anti-pattern: Gradual migration with dual code paths.** D-08 says big bang. Having both polling and watches active doubles K8s API load and creates confusing "which is authoritative" bugs.
- **Anti-pattern: Calling K8s API in tRPC routers when WatchManager is running.** After migration, routers should read from `watchManager.getResources()` which returns from informer cache (0ms). No `cached()` wrapper, no API call.
- **Anti-pattern: Not handling `CONNECT` event.** The informer fires `CONNECT` on initial connection AND reconnection. Use this to confirm watch health.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| K8s Watch reconnection on 410 Gone | Custom resourceVersion tracker + re-list logic | `ListWatch` built-in `doneHandler` | Already handles 410 by resetting resourceVersion and re-listing. Source: cache.js lines 91-94 |
| In-memory resource cache | `Map<clusterId, Map<resourceType, T[]>>` | `informer.list()` / `informer.get()` | `ListWatch` maintains `CacheMap<T>` internally, kept consistent with watch stream |
| Object deduplication in cache | Custom name/namespace dedup logic | `ListWatch.addOrUpdateObject()` | Uses `Map<namespace, Map<name, T>>` internally; automatic dedup by resource identity |
| SSE event buffering | Custom circular buffer / debounce | `setTimeout` with batch array | Simple 1-second buffer is all that's needed; no backpressure concerns at expected event rates |

**Key insight:** The `@kubernetes/client-node` `ListWatch` class does far more than event forwarding -- it maintains a consistent cache, handles 410 re-list, deduplicates by resourceVersion, and provides `ObjectCache` read APIs. Treating it as "just an event source" wastes its most valuable feature.

## Common Pitfalls

### Pitfall 1: Informer Error Handler Stops the Watch
**What goes wrong:** The informer fires `error` callback and stops watching. Without explicit restart, all live data for that resource type goes stale permanently.
**Why it happens:** `ListWatch.doneHandler()` calls error callbacks and returns without restarting when `err` is truthy and not 410.
**How to avoid:** Every informer MUST have an error handler that calls `informer.start()` with exponential backoff. This is already documented in `apps/api/CLAUDE.md` as a gotcha.
**Warning signs:** Console shows `[WatchManager] Informer error for X` but no subsequent `Started` log for that resource.

### Pitfall 2: setQueryData Key Mismatch
**What goes wrong:** `setQueryData` silently does nothing because the query key doesn't match. No error, no update, components show stale data.
**Why it happens:** tRPC generates complex query keys like `[['pods', 'list'], {input: {clusterId: '...'}, type: 'query'}]`. Guessing the key format will fail.
**How to avoid:** Use tRPC's `utils.pods.list.setData()` helper instead of raw `queryClient.setQueryData()`. It knows the exact key format. Or use `trpc.useUtils()` which returns type-safe setters.
**Warning signs:** SSE events arrive (visible in DevTools Network tab) but UI doesn't update.

### Pitfall 3: SSE Through Next.js Rewrites Breaks Streaming
**What goes wrong:** Next.js `rewrites()` buffers the entire SSE response, so the client never receives events.
**Why it happens:** Next.js HTTP proxy buffers responses; SSE requires streaming.
**How to avoid:** The existing pattern uses dedicated Route Handlers in `app/api/resources/stream/route.ts` with raw `node:http` proxy. Keep this pattern. Already documented in `apps/web/CLAUDE.md`.
**Warning signs:** EventSource stays in `CONNECTING` state, never fires `open` or `message` events.

### Pitfall 4: Memory Leak from Uncleaned Informers
**What goes wrong:** Informers for clusters that no one is viewing keep running, consuming memory and K8s API quota.
**Why it happens:** Reference counting is off-by-one, or SSE disconnect handler doesn't fire (e.g., browser process killed without clean close).
**How to avoid:** Implement heartbeat timeout -- if no heartbeat response for 2+ intervals, assume disconnected and decrement. Also implement a periodic sweep that checks subscriber count and stops orphaned watches.
**Warning signs:** `getWatchedClusterIds()` returns clusters with 0 active SSE connections.

### Pitfall 5: Large Resource Lists Cause SSE Frame Overflow
**What goes wrong:** A cluster with 2000 pods generates a 2MB+ SSE message on initial "list all" event, which may exceed browser EventSource buffer or proxy limits.
**Why it happens:** Initial informer `CONNECT` fires `add` callbacks for every existing resource. With 1-second batching, all 2000 add events batch into one giant message.
**How to avoid:** Initial data load comes from tRPC query (D-04), NOT from SSE. The SSE stream should only carry incremental changes AFTER initial load. On CONNECT, do NOT replay the full list over SSE -- the tRPC query already has it.
**Warning signs:** Browser DevTools shows SSE messages > 500KB; initial page load is slow.

### Pitfall 6: Race Between tRPC Initial Load and SSE Events
**What goes wrong:** SSE event arrives before tRPC query completes. `setQueryData` has no existing data to update. Event is silently lost.
**Why it happens:** SSE connection established before tRPC query returns.
**How to avoid:** In the `setQueryData` updater function, if `oldData` is undefined, return undefined (skip the update). The tRPC query will complete and set the full list. Any events that arrived during the race will be reflected in the tRPC response because the informer cache was already updated.
**Warning signs:** Sporadic "missed update" where a resource change isn't visible until next navigation.

### Pitfall 7: Transformation Logic Drift Between Router and Mapper
**What goes wrong:** Router mappers and SSE mappers produce slightly different shapes. Components break on `undefined` fields that only exist in one path.
**Why it happens:** Transformation logic is copy-pasted instead of shared.
**How to avoid:** Extract to `resource-mappers.ts`, import in BOTH the tRPC router and the watch event handler. Single source of truth for data shape.
**Warning signs:** TypeScript catches most of this; runtime errors on specific fields when data comes via SSE vs tRPC.

### Pitfall 8: DB Writes from Watch Events Overwhelm PostgreSQL
**What goes wrong:** D-09 says watch events also write to PostgreSQL for historical data. A rolling deployment generating 50 pod updates/second writes 50 rows/second to the DB.
**Why it happens:** Watch events fire at K8s API server rate, not at human-consumable rate.
**How to avoid:** Debounce DB writes per cluster per resource type (e.g., max 1 write per resource per 30 seconds). Or batch multiple changes into a single upsert. The DB is for historical data, not real-time accuracy.
**Warning signs:** PostgreSQL CPU spikes during deployments; DB write latency increases.

## Code Examples

### Current SSE Event Format (signal-only -- to be replaced)
```typescript
// Source: apps/api/src/routes/resource-stream.ts line 102
reply.raw.write(`event: resource-change\ndata: ${JSON.stringify(batch)}\n\n`)
// batch: ResourceChangeEvent[] -- only contains {resourceType, changeType, name, namespace, timestamp}
// NO actual resource data -- forces client to refetch
```

### Current Client-Side Handling (refetch-based -- to be replaced)
```typescript
// Source: apps/web/src/hooks/useResourceSSE.ts lines 51-68
es.addEventListener('resource-change', (e: MessageEvent) => {
  const events: ResourceChangeEvent[] = JSON.parse(e.data)
  for (const evt of events) {
    const routerKey = RESOURCE_INVALIDATION_MAP[evt.resourceType]
    if (routerKey) pendingRef.current.add(routerKey)
  }
  // Triggers REFETCH -- round-trip to server, then K8s API (via cached())
  requestAnimationFrame(() => {
    for (const key of pendingRef.current) {
      (utils as Record<string, any>)[key]?.list?.refetch?.({ clusterId })
    }
  })
})
```

### Informer ObjectCache API (existing -- to be leveraged)
```typescript
// Source: node_modules/@kubernetes/client-node dist/cache.d.ts + cache.js
// makeInformer returns Informer<T> & ObjectCache<T>
const informer = k8s.makeInformer(kc, '/api/v1/pods', () => coreV1.listPodForAllNamespaces())

// After informer.start() + initial list completes:
informer.list()               // Returns ReadonlyArray<k8s.V1Pod> -- ALL pods from cache
informer.list('kube-system')  // Returns pods in kube-system namespace only
informer.get('my-pod', 'default')  // Returns single pod or undefined

// Events fire AFTER internal cache is updated:
informer.on('add', (pod) => { /* pod already in informer.list() */ })
informer.on('update', (pod) => { /* cache already reflects new version */ })
informer.on('delete', (pod) => { /* pod already removed from informer.list() */ })

// 410 Gone handling (built-in, no user code needed):
// ListWatch.doneHandler: if err.statusCode === 410, reset resourceVersion to ''
// Then re-calls listFn() to get full fresh list, fires delete callbacks for
// objects that disappeared and add/update callbacks for remaining ones
```

### New SSE Event Format (data-carrying)
```typescript
// New event format for resource-stream.ts
interface WatchEventBatch {
  events: Array<{
    type: 'ADDED' | 'MODIFIED' | 'DELETED'
    resourceType: ResourceType
    object: unknown  // Transformed resource (same shape as tRPC response item)
  }>
  timestamp: string
}

// Server emits:
reply.raw.write(`event: watch\ndata: ${JSON.stringify(batch)}\n\n`)
```

### New Client-Side setQueryData Pattern
```typescript
// New useResourceSSE.ts pattern using tRPC utils
const utils = trpc.useUtils()

es.addEventListener('watch', (e: MessageEvent) => {
  const batch: WatchEventBatch = JSON.parse(e.data)
  for (const event of batch.events) {
    applyToCache(utils, clusterId, event)
  }
})

function applyToCache(utils: ReturnType<typeof trpc.useUtils>, clusterId: string, event: WatchEvent) {
  // Use tRPC's type-safe utils instead of raw queryClient.setQueryData
  // This ensures query key format is always correct (Pitfall 2)
  switch (event.resourceType) {
    case 'pods':
      utils.pods.list.setData({ clusterId }, (old) => {
        if (!old) return old  // Pitfall 6: race condition guard
        return applyEventToList(old, event)
      })
      break
    case 'deployments':
      utils.deployments.listDetail.setData({ clusterId }, (old) => {
        if (!old) return old
        return applyEventToList(old, event)
      })
      break
    // ... per resource type
  }
}

function applyEventToList<T extends { name: string; namespace: string }>(
  list: T[], event: WatchEvent
): T[] {
  const obj = event.object as T
  switch (event.type) {
    case 'ADDED': {
      const exists = list.findIndex(i => i.name === obj.name && i.namespace === obj.namespace)
      if (exists >= 0) {
        const copy = [...list]
        copy[exists] = obj
        return copy
      }
      return [...list, obj]
    }
    case 'MODIFIED':
      return list.map(i => (i.name === obj.name && i.namespace === obj.namespace) ? obj : i)
    case 'DELETED':
      return list.filter(i => !(i.name === obj.name && i.namespace === obj.namespace))
  }
}
```

### Resource Definitions (all 15 types)
```typescript
// Source: apps/api/src/lib/resource-watch-manager.ts RESOURCE_DEFS + cluster-watch-manager.ts
// Unified list of ALL 15 resource types to watch:
const RESOURCE_TYPES = [
  // CoreV1Api
  { type: 'pods',        apiPath: '/api/v1/pods',                               listFn: 'listPodForAllNamespaces' },
  { type: 'services',    apiPath: '/api/v1/services',                            listFn: 'listServiceForAllNamespaces' },
  { type: 'configmaps',  apiPath: '/api/v1/configmaps',                          listFn: 'listConfigMapForAllNamespaces' },
  { type: 'secrets',     apiPath: '/api/v1/secrets',                             listFn: 'listSecretForAllNamespaces' },
  { type: 'pvcs',        apiPath: '/api/v1/persistentvolumeclaims',              listFn: 'listPersistentVolumeClaimForAllNamespaces' },
  { type: 'namespaces',  apiPath: '/api/v1/namespaces',                          listFn: 'listNamespace' },
  { type: 'events',      apiPath: '/api/v1/events',                              listFn: 'listEventForAllNamespaces' },
  { type: 'nodes',       apiPath: '/api/v1/nodes',                               listFn: 'listNode' },
  // AppsV1Api
  { type: 'deployments',  apiPath: '/apis/apps/v1/deployments',                  listFn: 'listDeploymentForAllNamespaces' },
  { type: 'statefulsets', apiPath: '/apis/apps/v1/statefulsets',                  listFn: 'listStatefulSetForAllNamespaces' },
  { type: 'daemonsets',   apiPath: '/apis/apps/v1/daemonsets',                   listFn: 'listDaemonSetForAllNamespaces' },
  // BatchV1Api
  { type: 'jobs',       apiPath: '/apis/batch/v1/jobs',                          listFn: 'listJobForAllNamespaces' },
  { type: 'cronjobs',   apiPath: '/apis/batch/v1/cronjobs',                      listFn: 'listCronJobForAllNamespaces' },
  // AutoscalingV2Api
  { type: 'hpa',        apiPath: '/apis/autoscaling/v2/horizontalpodautoscalers', listFn: 'listHorizontalPodAutoscalerForAllNamespaces' },
  // NetworkingV1Api
  { type: 'ingresses',  apiPath: '/apis/networking.k8s.io/v1/ingresses',         listFn: 'listIngressForAllNamespaces' },
] as const
```

## State of the Art

| Old Approach (Current) | New Approach (This Phase) | Impact |
|------------------------|---------------------------|--------|
| Signal-only SSE (`ResourceChangeEvent` with name/type) | Data-carrying SSE (full transformed objects) | Eliminates all refetch round-trips |
| 64 `refetchInterval` entries across 48 files | Zero `refetchInterval` for watched resources | Reduces K8s API calls by ~95% |
| Two overlapping watch managers | Single unified WatchManager | Eliminates duplicate pod/deployment/node informers |
| `cached(key, ttl, k8sApiCall)` for every read | `watchManager.getResources()` from informer cache | ~0ms reads vs ~5ms Redis + ~200ms K8s API |
| Three background sync jobs (health/node/event) | Watch-based real-time updates | 5-minute staleness -> sub-second freshness |
| Redis as primary K8s resource cache | In-memory informer cache | Eliminates serialization overhead |

**Deprecated after this phase:**
- `ClusterWatchManager` (`apps/api/src/lib/cluster-watch-manager.ts`) -- replaced by unified WatchManager
- `ResourceWatchManager` (`apps/api/src/lib/resource-watch-manager.ts`) -- replaced by unified WatchManager
- `health-sync.ts`, `node-sync.ts`, `event-sync.ts` jobs -- replaced by watch events
- `CACHE_KEY_MAP` in resource-watch-manager.ts -- no Redis invalidation needed
- Most entries in `CACHE_KEYS` (k8sPods, k8sNodes, k8sDeployments, etc.) -- resources read from memory
- `ResourceChangeEvent` type in `@voyager/types` -- replaced by data-carrying `WatchEvent`

## refetchInterval Inventory (Complete)

**64 occurrences across 48 files.** Categorized by scope:

### Cluster Detail Pages (26 occurrences -- ALL should be removed)
| File | Query | Interval |
|------|-------|----------|
| clusters/[id]/pods/page.tsx | clusters.live | 30s |
| clusters/[id]/pods/page.tsx | pods.list | 15s |
| clusters/[id]/deployments/page.tsx | deployments.listDetail | 30s |
| clusters/[id]/services/page.tsx | services.list | 30s |
| clusters/[id]/ingresses/page.tsx | ingresses.list | 30s |
| clusters/[id]/statefulsets/page.tsx | statefulSets.list | 30s |
| clusters/[id]/daemonsets/page.tsx | daemonSets.list | 30s |
| clusters/[id]/jobs/page.tsx | jobs.list | 30s |
| clusters/[id]/cronjobs/page.tsx | cronJobs.list | 30s |
| clusters/[id]/hpa/page.tsx | hpa.list | 30s |
| clusters/[id]/configmaps/page.tsx | configMaps.list | 30s |
| clusters/[id]/secrets/page.tsx | secrets.list | 30s |
| clusters/[id]/pvcs/page.tsx | pvcs.list | 30s |
| clusters/[id]/namespaces/page.tsx | namespaces.list | 30s |
| clusters/[id]/nodes/page.tsx | nodes.listLive | 30s |
| clusters/[id]/events/page.tsx | events.list (live) | 30s |
| clusters/[id]/events/page.tsx | events.list (DB) | 30s |
| clusters/[id]/page.tsx | clusters.live | 30s |
| clusters/[id]/helm/page.tsx | helm.list | 30s |
| clusters/[id]/network-policies/page.tsx | networkPolicies.list | 30s |
| clusters/[id]/autoscaling/page.tsx | nodes.listLive | 30s |
| clusters/[id]/autoscaling/page.tsx | karpenter.nodePool | 30s |
| clusters/[id]/metrics/page.tsx | nodes.listLive | 60s |
| clusters/[id]/logs/page.tsx | pods.list | false (already disabled) |
| components/topology/TopologyMap.tsx | topology.get | 30s |
| components/network/NetworkPolicyGraph.tsx | networkPolicies.list | 30s |

### Cluster Components (5 occurrences -- remove)
| File | Query | Interval |
|------|-------|----------|
| components/crds/CrdBrowser.tsx | crds.list | 30s |
| components/metrics/NodeMetricsTable.tsx | nodes.listLive (2x) | 30s |
| components/metrics/MetricsTimeSeriesPanel.tsx | metrics.history (3x) | variable |
| components/metrics/ResourceSparkline.tsx | metrics.history | 30s |

### Dashboard & Global Pages (20 occurrences -- classify)
| File | Query | Interval | Action |
|------|-------|----------|--------|
| app/page.tsx (dashboard) | clusters.live | 15s | Remove (SSE covers) |
| app/page.tsx (dashboard) | clusters.listWithHealth | 60s | Keep (DB query, not K8s) |
| app/clusters/page.tsx | health.status | 30s | Remove |
| app/health/page.tsx | health.status | 30s | Remove |
| app/health/page.tsx | events.list | 60s | Remove |
| app/events/page.tsx | events.list | 30s | Remove |
| app/deployments/page.tsx | deployments.listAll | 30s | Remove |
| app/namespaces/page.tsx | namespaces.list | 30s | Remove |
| app/services/page.tsx | services.list | 30s | Remove |
| app/logs/page.tsx | pods.list | variable | Remove |
| app/settings/page.tsx | users.list | 30s | Keep (DB query) |
| app/settings/page.tsx | teams.list | 60s | Keep (DB query) |
| components/Sidebar.tsx | clusters.list | 60s | Keep (DB query) |
| components/Sidebar.tsx | health.status | 30s | Remove |
| components/TopBar.tsx | events.list | 30s | Remove |
| components/TopBar.tsx | clusters.list | 60s | Keep (DB query) |
| components/TopBar.tsx | health.status | 30s | Remove |
| components/ClusterHealthIndicator.tsx | health.status | 30s | Remove |
| components/NotificationsPanel.tsx | events.list | 30s | Remove |
| hooks/usePresence.ts | presence.list | 45s | Keep (not K8s data) |

### Dashboard Widgets (13 occurrences -- classify)
| File | Query | Interval | Action |
|------|-------|----------|--------|
| widgets/ClusterHealthWidget.tsx | clusters.listWithHealth | variable | Keep (DB query) |
| widgets/ClusterHealthWidget.tsx | clusters.live | variable | Remove |
| widgets/ClusterHealthWidget.tsx | health.status | variable | Remove |
| widgets/StatCardsWidget.tsx | clusters.listWithHealth | variable | Keep (DB query) |
| widgets/StatCardsWidget.tsx | clusters.live | variable | Remove |
| widgets/StatCardsWidget.tsx | health.status | variable | Remove |
| widgets/PodStatusWidget.tsx | clusters.live | variable | Remove |
| widgets/DeploymentListWidget.tsx | deployments.listAll | variable | Remove |
| widgets/ResourceChartsWidget.tsx | metrics.history | variable | Keep (metrics) |
| widgets/AlertFeedWidget.tsx | alerts.list | variable | Keep (DB query) |
| AnomalyTimeline.tsx | anomalies.listAll | 60s | Keep (DB query) |

**Summary:**
- **Remove:** ~45 refetchInterval entries (K8s resource polling)
- **Keep:** ~19 entries (DB queries: users, teams, clusters.list, alerts, anomalies, metrics.history, presence)
- **Metrics queries are KEPT** (K8s Metrics API doesn't support Watch -- per D-09)

## tRPC Routers Requiring Modification

Routers that currently use `cached(key, ttl, k8sApiCall)` and need to switch to `watchManager.getResources()`:

| Router | File | cached() calls | Change |
|--------|------|---------------|--------|
| pods | routers/pods.ts | 3 (pods, podMetrics, podsStored) | Read pods from WatchManager; podMetrics stays cached (metrics API) |
| deployments | routers/deployments.ts | 3 (global list, detail, by name) | Read from WatchManager |
| services | routers/services.ts | 3 (list, detail, by ns) | Read from WatchManager |
| nodes | routers/nodes.ts | 3 (nodes, nodeMetrics, by name) | Nodes from WatchManager; nodeMetrics stays cached |
| configmaps | routers/configmaps.ts | 1 | Read from WatchManager |
| secrets | routers/secrets.ts | 1 | Read from WatchManager |
| pvcs | routers/pvcs.ts | 1 | Read from WatchManager |
| namespaces | routers/namespaces.ts | 3 (namespaces, resourceQuotas) | Read from WatchManager |
| events | routers/events.ts | via DB | Events watch goes to DB; live query reads from WatchManager |
| ingresses | routers/ingresses.ts | 1 | Read from WatchManager |
| statefulsets | routers/statefulsets.ts | 1 | Read from WatchManager |
| daemonsets | routers/daemonsets.ts | 1 | Read from WatchManager |
| jobs | routers/jobs.ts | 1 | Read from WatchManager |
| cronjobs | routers/cronjobs.ts | 1 | Read from WatchManager |
| hpa | routers/hpa.ts | 1 | Read from WatchManager |
| topology | routers/topology.ts | 1 (7 resources) | Read all from WatchManager |
| clusters | routers/clusters.ts | 8 (version, nodes, pods, ns, events, deps) | Read from WatchManager; version stays cached |
| helm | routers/helm.ts | 3 (releases, detail, revisions) | Keep cached (Helm is from K8s secrets, not a watched type) |
| crds | routers/crds.ts | 2 (CRDs, instances) | Keep cached (CRDs not in watch list) |
| rbac | routers/rbac.ts | 2 (roles, bindings) | Keep cached (RBAC not in watch list) |
| network-policies | routers/network-policies.ts | 1 | Keep cached (not in watch list) |
| resource-quotas | routers/resource-quotas.ts | 1 | Keep cached (not in watch list) |
| yaml | routers/yaml.ts | 1 | Keep cached (single-resource fetch by name) |

## Recommendations (Claude's Discretion Areas)

### Watch Reconnection Strategy
**Recommendation:** Exponential backoff starting at 1s, doubling to max 30s, with 10% jitter. On CONNECT event, reset backoff counter to 0. On 410 Gone, the informer handles this internally (resets resourceVersion, re-lists). On auth errors (401/403), stop retrying and mark cluster as `auth_expired` via `connectionState` FSM.

### In-Memory Store Cleanup
**Recommendation:** No explicit cleanup needed -- the informer's `ObjectCache` is kept consistent by the watch stream. When `informer.stop()` is called (no more subscribers), the `ListWatch` sets `stopped=true` and aborts the request. The internal map is garbage collected when the informer reference is released. No max items limit needed -- the informer reflects exactly what exists in the cluster.

### SSE Connection Management
**Recommendation:** Keep existing limits from `packages/config/src/sse.ts`:
- `MAX_RESOURCE_CONNECTIONS_PER_CLUSTER = 10` (same user, multiple tabs)
- `MAX_RESOURCE_CONNECTIONS_GLOBAL = 50` (all users, all clusters)
- Add: `MAX_CONCURRENT_CLUSTER_WATCHES = 20` (already exists, keep as-is)

### Watch Error Propagation to UI
**Recommendation:** Use `CONNECT` event to send a `status` SSE message indicating watch health. If a watch errors and is reconnecting, send `event: status\ndata: {"clusterId":"...","state":"reconnecting","resourceType":"pods"}`. The UI can show a subtle banner "Reconnecting live data..." without blocking usage. Reuse existing `ClusterConnectionStateMachine`.

### cached() for Non-Watched Queries
**Recommendation:** Keep `cached()` wrapper for:
- Helm releases (decoded from K8s secrets, expensive gzip decode)
- CRDs and CRD instances (not in watch list)
- RBAC roles/bindings (not in watch list)
- Network policies (not in watch list -- unless added to watch list)
- Resource quotas (not in watch list -- unless added to watch list)
- K8s version info
- Pod/node metrics (Metrics API, not watchable)
- YAML single-resource fetches

Remove `cached()` from: pods.list, deployments.list, services.list, nodes.listLive, and all 15 watched resource types that now read from informer cache.

## Open Questions

1. **DB Write Strategy for Historical Data**
   - What we know: D-09 says watch events should write to PostgreSQL for historical data (dashboard needs DB when no one has a cluster open)
   - What's unclear: Which tables exactly need updating? Currently `health-sync` updates `clusters` table (healthStatus, version, nodesCount, lastHealthCheck), `node-sync` updates `nodes` table, `event-sync` inserts into `events` table. All three go away.
   - Recommendation: The WatchManager should periodically (every 60s) sync aggregated state to DB: cluster healthStatus, node list to `nodes` table, recent events to `events` table. This replaces the removed jobs but runs on watch data instead of API polls. Debounce to avoid overwhelming DB during rolling deployments.

2. **health.status tRPC Query Data Source**
   - What we know: Multiple frontend pages use `trpc.health.status.useQuery()` with `refetchInterval: 30_000`. This currently comes from the `health-sync` job writing to the `clusters` table.
   - What's unclear: After health-sync is removed, does `health.status` read from the in-memory watch data or from DB?
   - Recommendation: `health.status` should derive from WatchManager in-memory data when watches are active (real-time), and fall back to DB when watches are not active (no SSE subscribers for that cluster). The periodic DB sync ensures the DB stays reasonably current.

3. **Metrics Fields in Pods/Nodes (Hybrid Data)**
   - What we know: Pod and node routers currently enrich K8s resource data with metrics (CPU%, Memory%) from the Metrics API. The Metrics API is NOT watchable.
   - What's unclear: How to include metrics in SSE events for pods/nodes.
   - Recommendation: SSE events carry pod/node data WITHOUT metrics (they're watch events, not metrics). Frontend computes or fetches metrics separately. Alternatively, WatchManager periodically polls metrics API and merges into the pod/node mappers before emitting SSE events, but this adds complexity. Simplest: metrics fields are `null` in SSE events, frontend fetches metrics via existing tRPC query (keep metrics-related `cached()` calls).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (installed) |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test && pnpm typecheck && pnpm build` |

### Phase Requirements -> Test Map

Since no formal requirement IDs are defined for Phase 10, tests map to the decisions (D-01 through D-09):

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-06 | WatchManager starts/stops informers per cluster | unit | `pnpm --filter api test -- src/__tests__/watch-manager.test.ts` | No -- Wave 0 |
| D-06 | WatchManager reference counting (subscribe/unsubscribe) | unit | `pnpm --filter api test -- src/__tests__/watch-manager.test.ts` | No -- Wave 0 |
| D-07 | WatchManager.getResources() returns informer cache data | unit | `pnpm --filter api test -- src/__tests__/watch-manager.test.ts` | No -- Wave 0 |
| D-01 | SSE events carry full transformed objects | unit | `pnpm --filter api test -- src/__tests__/resource-stream.test.ts` | No -- Wave 0 |
| D-02 | SSE events are batched at 1-second intervals | unit | `pnpm --filter api test -- src/__tests__/resource-stream.test.ts` | No -- Wave 0 |
| D-03 | setQueryData correctly applies ADDED/MODIFIED/DELETED | unit | (frontend unit test if added) | No -- manual verify |
| D-08 | Zero refetchInterval for watched resources after migration | manual | grep count verification | N/A |
| D-09 | health-sync, node-sync, event-sync removed from server.ts | manual | grep verification | N/A |
| All | pnpm build && pnpm typecheck pass | build | `pnpm build && pnpm typecheck` | Existing |

### Sampling Rate
- **Per task commit:** `pnpm build && pnpm typecheck`
- **Per wave merge:** `pnpm test && pnpm build && pnpm typecheck`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/__tests__/watch-manager.test.ts` -- covers D-06, D-07 (WatchManager lifecycle + data reads)
- [ ] `apps/api/src/__tests__/resource-mappers.test.ts` -- covers mapper extraction (same output from router and mapper)
- [ ] `apps/api/src/__tests__/resource-stream.test.ts` -- covers D-01, D-02 (SSE data format + batching)

## Sources

### Primary (HIGH confidence)
- `@kubernetes/client-node@1.4.0` source code in `node_modules/.pnpm/@kubernetes+client-node@1.4.0/` -- `informer.js`, `cache.js`, `watch.js`, `informer.d.ts`, `cache.d.ts`
  - `makeInformer()` returns `ListWatch` with `ObjectCache<T>` (`.list()`, `.get()`)
  - 410 Gone handled internally by `doneHandler()` (resets resourceVersion, re-lists)
  - Non-410 errors fire callback and STOP (no auto-reconnect)
  - `CONNECT` event fires on initial connection and every reconnection
- Project source code: `cluster-watch-manager.ts`, `resource-watch-manager.ts`, `event-emitter.ts`, `resource-stream.ts`, `useResourceSSE.ts`, `cache.ts`, `cache-keys.ts`, `server.ts`, all tRPC routers
- `packages/config/src/sse.ts` -- SSE constants (buffer MS, connection limits, heartbeat interval)
- `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md` -- project patterns, gotchas, key abstractions

### Secondary (MEDIUM confidence)
- [TanStack Query v5 setQueryData patterns](https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates) -- `setQueryData` with updater function for list mutations
- npm registry: `@kubernetes/client-node` latest = 1.4.0 (installed matches latest)
- npm registry: `@tanstack/react-query` latest = 5.95.2 (installed 5.90.21 -- close enough, setQueryData API stable)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing libraries verified from source code
- Architecture: HIGH -- informer ObjectCache API verified from library source; patterns follow existing codebase conventions
- Pitfalls: HIGH -- derived from actual source code analysis (informer reconnection behavior, SSE proxy gotchas) and existing CLAUDE.md gotchas
- refetchInterval inventory: HIGH -- exact grep count (64 across 48 files), each classified by action
- Transformation challenge: HIGH -- verified by reading 6 tRPC routers; all transform raw K8s objects

**Research date:** 2026-03-29
**Valid until:** 2026-04-29 (stable -- no dependency updates expected)
