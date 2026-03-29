# Phase 11: Lens-Grade Live Data Redesign - Research

**Researched:** 2026-03-29
**Domain:** SSE real-time streaming, reactive state management, Zustand/TanStack Query coexistence
**Confidence:** HIGH

## Summary

Phase 11 strips the polling-era workarounds left from the incremental SSE migration (Phase 10) and rebuilds the live data pipeline to match Lens desktop performance. The current architecture has 5 layers (K8s API -> WatchManager -> EventEmitter -> SSE with 1s batch -> Next.js proxy -> EventSource -> setQueryData), and the target is 3 layers (K8s API -> WatchManager -> immediate SSE -> direct EventSource -> Zustand store -> React).

The research reveals five distinct technical concerns: (1) SSE immediate flush requires disabling `@fastify/compress` on SSE routes since it currently applies globally and buffers `text/event-stream`, plus removing the 1-second batch timer; (2) direct browser-to-API SSE connections are already architecturally supported -- the nginx ingress routes `/api/*` directly to `voyager-api`, CORS is configured with `credentials: true`, and `EventSource` supports `withCredentials` for cross-origin cookie auth; (3) a Zustand resource store replaces the per-resource `setQueryData` dispatching with a normalized Map-based store keyed by `(clusterId, resourceType)`; (4) "full state on connect" replaces the awkward 5s initial load window by having the SSE endpoint send a `snapshot` event with the current informer cache before switching to live `watch` events; (5) TanStack Query remains for all non-live data (DB queries, metrics, settings, users).

**Primary recommendation:** Execute in 4 waves -- (1) immediate SSE flush + compression fix, (2) direct SSE connection + proxy removal, (3) Zustand resource store, (4) full-state-on-connect + cleanup.

## Project Constraints (from CLAUDE.md)

### Build/Quality Gates
- `pnpm build` and `pnpm typecheck` must pass with 0 errors
- All packages are ESM (`"type": "module"`) -- use `.js` extensions in imports
- Biome lint: 2-space indent, 100-char width, single quotes, semicolons as-needed
- Never add `migrate()` to `server.ts`
- Read `docs/DESIGN.md` before any UI/animation change

### Architecture Rules
- `@voyager/` prefix for workspace packages
- Dependency direction: routers/ -> services/ -> lib/
- Redis failures: always catch and fall through
- SSE endpoints must flush immediately after `writeHead()`
- tRPC uses `httpLink` (NOT `httpBatchLink`) -- batched URLs exceeded nginx limits
- K8s informers do NOT auto-reconnect -- always call `informer.start()` in error handler
- Centralized config: no hardcoded values in routers/jobs, use config files

### Deployment
- Deploy = `helm uninstall` + `helm install` (never `helm upgrade`)
- Ingress routes `/api` and `/trpc` directly to `voyager-api`; `/` to `voyager-web`

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | 5.0.12 | Reactive resource store | Already used for 7 stores; `useSyncExternalStore` under the hood for React 19 compatibility |
| @tanstack/react-query | 5.95.2 | Server state for non-live data | Already the caching layer for tRPC; keep for DB/metrics queries |
| @trpc/react-query | 11.15.1 | tRPC React bindings | Already integrated; remains for mutations and non-live queries |
| @fastify/cors | (installed) | CORS with credentials | Already configured with `credentials: true` |
| @fastify/compress | (installed) | Response compression | Must be configured to EXCLUDE SSE routes |

### No New Dependencies Required

This phase is a refactoring of existing infrastructure. No new npm packages are needed. All required capabilities exist in the current stack:
- `EventSource` with `{ withCredentials: true }` -- native browser API
- `zustand` `create()` + `subscribeWithSelector` middleware -- already installed
- `reply.raw.write()` for immediate SSE flush -- native Node.js/Fastify

**Installation:** None required.

## Architecture Patterns

### Current Architecture (5 layers, ~1000ms+ latency)
```
K8s Watch API
    |
    v
WatchManager (informer events)
    |
    v
EventEmitter (voyagerEmitter.emitWatchEvent)
    |
    v
resource-stream.ts (1s batch buffer + 5s initial load window)
    |
    v
Next.js Route Handler proxy (/app/api/resources/stream/route.ts)
    |
    v
EventSource (/api/resources/stream)
    |
    v
useResourceSSE hook (parse batch -> 15x setQueryData per event type)
    |
    v
TanStack Query cache -> React re-render
```

### Target Architecture (3 layers, <100ms latency)
```
K8s Watch API
    |
    v
WatchManager (informer events, unchanged)
    |
    v
EventEmitter (voyagerEmitter, unchanged)
    |
    v
resource-stream.ts (immediate write, no batch, no initial load window)
    |
    v
Direct EventSource (browser -> API, CORS + withCredentials)
    |
    v
Zustand resource store (normalized Map, selector-based subscriptions)
    |
    v
React re-render (only affected resource type)
```

### Recommended Project Structure Changes
```
apps/api/src/
├── routes/
│   └── resource-stream.ts     # MODIFY: remove batch buffer, add snapshot event, disable compress
apps/web/src/
├── stores/
│   └── resource-store.ts      # NEW: Zustand store for live K8s resources
├── hooks/
│   ├── useResourceSSE.ts      # REWRITE: connect directly to API, write to Zustand store
│   ├── useResources.ts        # NEW: thin wrapper — reads from Zustand store for components
│   └── useMetricsSSE.ts       # MODIFY: update URL to direct API connection
├── app/
│   └── api/
│       └── resources/
│           └── stream/
│               └── route.ts   # DELETE: proxy no longer needed
```

### Pattern 1: Zustand Resource Store (Normalized Map)
**What:** A single Zustand store holds all live K8s resource data, keyed by `(clusterId, resourceType)`.
**When to use:** For all 15 watched resource types that come via SSE.
**Why not TanStack Query:** TanStack Query is designed for request/response. SSE is a push channel. Pushing into TanStack Query via `setQueryData` on 15 different query keys per batch event is verbose, fragile (stale closure risk), and requires the hook to know every tRPC router method name.

```typescript
// apps/web/src/stores/resource-store.ts
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { ResourceType, WatchEvent, WatchEventType } from '@voyager/types'

type ResourceItem = { name: string; namespace?: string | null; [key: string]: unknown }

interface ResourceStoreState {
  // Data: Map<"clusterId:resourceType", ResourceItem[]>
  resources: Map<string, ResourceItem[]>
  connectionState: Record<string, 'initializing' | 'connected' | 'reconnecting' | 'disconnected'>

  // Actions
  setResources: (clusterId: string, type: ResourceType, items: ResourceItem[]) => void
  applyEvent: (clusterId: string, event: WatchEvent) => void
  setConnectionState: (clusterId: string, state: ConnectionState) => void
  clearCluster: (clusterId: string) => void
}

function storeKey(clusterId: string, type: ResourceType): string {
  return `${clusterId}:${type}`
}

export const useResourceStore = create<ResourceStoreState>()(
  subscribeWithSelector((set, get) => ({
    resources: new Map(),
    connectionState: {},

    setResources: (clusterId, type, items) => {
      set((state) => {
        const next = new Map(state.resources)
        next.set(storeKey(clusterId, type), items)
        return { resources: next }
      })
    },

    applyEvent: (clusterId, event) => {
      const key = storeKey(clusterId, event.resourceType)
      set((state) => {
        const current = state.resources.get(key) ?? []
        const obj = event.object as ResourceItem
        const next = new Map(state.resources)

        switch (event.type) {
          case 'ADDED': {
            const idx = current.findIndex(
              (i) => i.name === obj.name && i.namespace === obj.namespace,
            )
            if (idx >= 0) {
              const copy = [...current]
              copy[idx] = obj
              next.set(key, copy)
            } else {
              next.set(key, [...current, obj])
            }
            break
          }
          case 'MODIFIED':
            next.set(
              key,
              current.map((i) =>
                i.name === obj.name && i.namespace === obj.namespace ? obj : i,
              ),
            )
            break
          case 'DELETED':
            next.set(
              key,
              current.filter(
                (i) => !(i.name === obj.name && i.namespace === obj.namespace),
              ),
            )
            break
        }
        return { resources: next }
      })
    },

    setConnectionState: (clusterId, state) => {
      set((prev) => ({
        connectionState: { ...prev.connectionState, [clusterId]: state },
      }))
    },

    clearCluster: (clusterId) => {
      set((state) => {
        const next = new Map(state.resources)
        for (const key of next.keys()) {
          if (key.startsWith(`${clusterId}:`)) next.delete(key)
        }
        return {
          resources: next,
          connectionState: { ...state.connectionState, [clusterId]: 'disconnected' },
        }
      })
    },
  })),
)
```

### Pattern 2: Selector-Based Component Consumption
**What:** Components select only their resource type from the store, preventing unnecessary re-renders.
**When to use:** Every resource page that currently uses `trpc.pods.list.useQuery()` etc.

```typescript
// apps/web/src/hooks/useResources.ts
export function useClusterResources<T>(clusterId: string, type: ResourceType): T[] {
  return useResourceStore(
    useCallback(
      (state) => (state.resources.get(`${clusterId}:${type}`) ?? []) as T[],
      [clusterId, type],
    ),
  )
}
```

### Pattern 3: Direct SSE with Credentials
**What:** Browser connects directly to Fastify API SSE endpoint, bypassing Next.js proxy.
**When to use:** Resource stream, metrics stream, log stream.

```typescript
// Direct connection — CORS + credentials
const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
const url = `${apiUrl}/api/resources/stream?clusterId=${encodeURIComponent(clusterId)}`
const es = new EventSource(url, { withCredentials: true })
```

### Pattern 4: Immediate SSE Flush (No Batching)
**What:** Write SSE events immediately via `reply.raw.write()` instead of 1s batch buffer.
**When to use:** Resource stream after this phase.

```typescript
// Before (Phase 10): 1s batch buffer
let batch: WatchEvent[] = []
const onWatchEvent = (event: WatchEvent) => {
  batch.push(event)
  if (!batchTimer) batchTimer = setTimeout(flushBatch, 1000)
}

// After (Phase 11): immediate write
const onWatchEvent = (event: WatchEvent) => {
  const payload: WatchEventBatch = {
    clusterId,
    events: [event],
    timestamp: new Date().toISOString(),
  }
  try {
    reply.raw.write(`event: watch\ndata: ${JSON.stringify(payload)}\n\n`)
  } catch { /* connection closed */ }
}
```

### Pattern 5: Full State on Connect (Snapshot Event)
**What:** When a client connects, send the current informer cache as a `snapshot` event before live updates.
**When to use:** Replaces both the 5s initial load window AND the tRPC initial data fetch for watched resources.

```typescript
// Server: send snapshot after connection
await watchManager.subscribe(clusterId)

// Send current state for all resource types
for (const def of RESOURCE_DEFS) {
  const resources = watchManager.getResources(clusterId, def.type)
  if (resources && resources.length > 0) {
    const mapped = resources.map((obj) => def.mapper(obj, clusterId))
    const payload = {
      clusterId,
      resourceType: def.type,
      items: mapped,
    }
    reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`)
  }
}

// Client: handle snapshot event
es.addEventListener('snapshot', (e: MessageEvent) => {
  const { resourceType, items } = JSON.parse(e.data)
  resourceStore.setResources(clusterId, resourceType, items)
})
```

### Anti-Patterns to Avoid
- **setQueryData for push data:** Using TanStack Query's `setQueryData` for SSE push data creates stale closures, requires knowing every tRPC method name, and causes cascading re-renders across unrelated query observers. Use a dedicated reactive store (Zustand) instead.
- **Batching SSE events on server:** The 1s batch was added to protect against event storms during rolling deployments. Instead, handle this on the client via `requestAnimationFrame` throttling if needed (browser already batches DOM updates).
- **Next.js Route Handler as SSE proxy:** Adds ~50-100ms latency per event, creates memory pressure from double-buffering, and the TransformStream proxy can silently drop events on backpressure. The ingress already routes `/api` directly to the API service.
- **Initial load window suppression:** The 5s `INITIAL_LOAD_WINDOW_MS` that suppresses ADDED events is a hack. Replace with explicit snapshot event that sends current state, then all subsequent events are live.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reactive store | Custom EventTarget/pub-sub | Zustand `create()` with `subscribeWithSelector` | Built-in React 19 compatibility via `useSyncExternalStore`, selector-based subscriptions prevent unnecessary re-renders |
| Cross-origin SSE auth | Custom token-in-URL scheme | `EventSource({ withCredentials: true })` + CORS `credentials: true` | Native browser API, cookies forwarded automatically, no token exposure in URLs |
| SSE reconnection | Custom reconnection logic | `EventSource` built-in auto-reconnect | EventSource reconnects automatically with exponential backoff; just handle the `error` event for UI state |
| Compression exclusion | Per-route header hacks | `@fastify/compress` `encodings` option or route-level `compress: false` | Official Fastify plugin API |

**Key insight:** The hardest part of this phase is NOT the new code -- it's safely removing the old code (Next.js proxy routes, setQueryData dispatching, batch buffer, initial load window) without breaking the 15+ resource pages that consume the data.

## Common Pitfalls

### Pitfall 1: @fastify/compress Buffering SSE
**What goes wrong:** `@fastify/compress` with `global: true` applies gzip/brotli to `text/event-stream`. The compression buffer waits for enough data before flushing, adding 100ms-5s of latency and sometimes preventing EventSource from receiving any events.
**Why it happens:** Phase 10 used `reply.raw.writeHead()` which bypasses Fastify's response pipeline, so compression didn't bite. But it could still interfere with some clients/proxies.
**How to avoid:** Either (a) exclude `text/event-stream` from compression globally, or (b) disable compression on SSE route registrations with `config: { compress: false }`.
**Warning signs:** Events arrive in bursts (every few seconds) instead of individually; EventSource stays in CONNECTING state.

### Pitfall 2: CORS Wildcard with Credentials
**What goes wrong:** `Access-Control-Allow-Origin: *` with `Access-Control-Allow-Credentials: true` is rejected by all browsers. EventSource fails silently with no useful error message.
**Why it happens:** The current CORS config uses specific origins, but local dev might default to `*`. When switching to direct browser->API SSE, CORS must be correct.
**How to avoid:** Ensure `ALLOWED_ORIGINS` env var includes the exact frontend origin. For local dev: `http://localhost:3000`. For production: `http://voyager-platform.voyagerlabs.co`. Never use `*`.
**Warning signs:** EventSource fires `onerror` immediately, no events received, browser console shows CORS error.

### Pitfall 3: Cookie Not Sent Cross-Origin
**What goes wrong:** `EventSource` doesn't send cookies cross-origin by default. Without `{ withCredentials: true }`, the auth guard returns 401.
**Why it happens:** `withCredentials` defaults to `false`. The current code uses `/api/resources/stream` (same origin via proxy), so cookies are sent automatically. Direct connection changes the origin.
**How to avoid:** Always create EventSource with `new EventSource(url, { withCredentials: true })`. Ensure the API's CORS response includes `Access-Control-Allow-Credentials: true` (already set).
**Warning signs:** SSE connection returns 401; works via proxy but fails direct.

### Pitfall 4: Zustand Store Size with Large Clusters
**What goes wrong:** A cluster with 5000+ pods creates a large in-memory array. Naive re-renders on every MODIFIED event cause jank.
**Why it happens:** `MODIFIED` events fire frequently (pod status changes, HPA scaling). Each event replaces the full array, triggering all selectors.
**How to avoid:** Use `subscribeWithSelector` middleware so components only re-render when their specific resource type changes. Consider `immer` middleware if array mutation patterns get complex. For the snapshot event, batch the initial `setResources` into a single state update.
**Warning signs:** React DevTools shows excessive re-renders on the Pods page during rolling deployments.

### Pitfall 5: Stale useCallback/useEffect Closures
**What goes wrong:** The SSE event handler captures a stale `clusterId` or `applyEvent` reference if dependencies change.
**Why it happens:** `useResourceSSE` creates an `EventSource` in a `useEffect`. If the effect doesn't re-run when dependencies change, handlers reference old values.
**How to avoid:** Use Zustand store actions directly (they're stable references, not React state). Access `clusterId` from a ref updated in a separate `useEffect` if it can change.
**Warning signs:** Events from cluster A are applied to cluster B's data after navigation.

### Pitfall 6: EventSource Auto-Reconnect Floods
**What goes wrong:** If the API returns 401 or 500, EventSource auto-reconnects in a tight loop (no backoff), hammering the server.
**Why it happens:** EventSource's built-in reconnect uses the server's `retry:` field (default varies by browser, often 1-3s). But for auth failures, reconnecting is pointless.
**How to avoid:** Check `es.readyState` in the error handler. If the connection was never established (readyState goes from CONNECTING to CLOSED), don't reconnect. For 401, redirect to login. Implement a manual reconnect with exponential backoff instead of relying on auto-reconnect for error cases.
**Warning signs:** Network tab shows rapid repeated SSE connection attempts; API logs flooded with 401s.

### Pitfall 7: Snapshot Event Size
**What goes wrong:** Sending 15 resource types' full state as a single SSE event exceeds browser event buffer limits or causes a visible load delay.
**Why it happens:** A production cluster might have 500 pods + 200 configmaps + 100 secrets = large JSON payloads.
**How to avoid:** Send one `snapshot` event per resource type (15 separate events), not one giant event. This also lets the client render resource types as they arrive rather than waiting for all 15.
**Warning signs:** EventSource `onmessage` never fires for snapshot; browser memory spikes on connect.

## Code Examples

### SSE Route: Immediate Flush + Snapshot + No Batch
```typescript
// apps/api/src/routes/resource-stream.ts (Phase 11 target)
// Key changes from Phase 10:
// 1. No INITIAL_LOAD_WINDOW_MS (replaced by snapshot event)
// 2. No batch buffer (immediate write)
// 3. Snapshot event on connect

// Register with compression disabled
export async function registerResourceStreamRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/resources/stream', {
    config: { compress: false },  // Critical: disable compression for SSE
    handler: handleResourceStream,
  })
}

// In handler, after subscribe:
await watchManager.subscribe(clusterId)

// Send snapshot (current informer state)
for (const def of RESOURCE_DEFS) {
  const resources = watchManager.getResources(clusterId, def.type)
  if (resources && resources.length > 0) {
    const mapped = resources.map((obj) => def.mapper(obj, clusterId))
    reply.raw.write(
      `event: snapshot\ndata: ${JSON.stringify({ resourceType: def.type, items: mapped })}\n\n`
    )
  }
}

// Live events: immediate write (no batch)
const onWatchEvent = (event: WatchEvent): void => {
  try {
    reply.raw.write(`event: watch\ndata: ${JSON.stringify({
      clusterId,
      events: [event],
      timestamp: new Date().toISOString(),
    })}\n\n`)
  } catch { /* connection closed */ }
}
```

### Client: Direct SSE + Zustand Store
```typescript
// apps/web/src/hooks/useResourceSSE.ts (Phase 11 target)
export function useResourceSSE(clusterId: string | null) {
  const { applyEvent, setResources, setConnectionState, clearCluster } = useResourceStore.getState()

  useEffect(() => {
    if (!clusterId) return

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
    const url = `${apiUrl}/api/resources/stream?clusterId=${encodeURIComponent(clusterId)}`
    const es = new EventSource(url, { withCredentials: true })

    setConnectionState(clusterId, 'initializing')

    es.onopen = () => setConnectionState(clusterId, 'connected')

    es.addEventListener('snapshot', (e: MessageEvent) => {
      const { resourceType, items } = JSON.parse(e.data)
      setResources(clusterId, resourceType, items)
    })

    es.addEventListener('watch', (e: MessageEvent) => {
      const batch = JSON.parse(e.data)
      for (const event of batch.events) {
        applyEvent(clusterId, event)
      }
    })

    es.addEventListener('status', (e: MessageEvent) => {
      const status = JSON.parse(e.data)
      setConnectionState(clusterId, status.state)
    })

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setConnectionState(clusterId, 'disconnected')
      } else {
        setConnectionState(clusterId, 'reconnecting')
      }
    }

    return () => {
      es.close()
      clearCluster(clusterId)
    }
  }, [clusterId]) // Store actions are stable — no stale closure risk
}
```

### Component: Reading from Zustand Store
```typescript
// Example: Pods page reading from Zustand instead of tRPC
// Before (Phase 10):
const podsQuery = trpc.pods.list.useQuery({ clusterId }, { staleTime: 15000 })
const pods = podsQuery.data ?? []

// After (Phase 11):
const pods = useClusterResources<PodData>(clusterId, 'pods')
const isLoading = pods.length === 0 && connectionState === 'initializing'
```

### CORS: Production Ingress Architecture
```
Browser (voyager-platform.voyagerlabs.co)
    |
    v
nginx ingress
    |--- /           --> voyager-web:3000  (Next.js pages)
    |--- /trpc       --> voyager-api:4000  (tRPC queries/mutations)
    |--- /api        --> voyager-api:4000  (REST + SSE streams)
    |--- /health     --> voyager-api:4000
    |--- /docs       --> voyager-api:4000  (Swagger)
```

The ingress already routes `/api/*` directly to `voyager-api`. The Next.js proxy exists only because during development, the browser connects to `localhost:3000` (Next.js), and SSE can't go through Next.js rewrites. For production, the proxy is unnecessary -- the browser hits the same origin via ingress. For local dev, `NEXT_PUBLIC_API_URL=http://localhost:4001` + CORS handles cross-origin.

## State of the Art

| Old Approach (Phase 10) | New Approach (Phase 11) | Impact |
|--------------------------|-------------------------|--------|
| 1s server-side batch buffer | Immediate `reply.raw.write()` | Latency: ~1000ms -> <50ms |
| Next.js Route Handler SSE proxy | Direct browser->API via CORS | Removes entire proxy layer, eliminates double-buffering |
| 5s initial load window + tRPC initial fetch | Snapshot event on SSE connect | Single source, no race condition, no wasted initial tRPC call |
| `setQueryData()` on 15 tRPC query keys | Zustand resource store + selectors | Simpler code, no stale closures, type-safe selectors |
| TanStack Query for all data | TanStack Query for DB data only, Zustand for live K8s | Each tool used for what it does best |

**Deprecated by this phase:**
- `apps/web/src/app/api/resources/stream/route.ts` (Next.js SSE proxy) -- DELETE
- `INITIAL_LOAD_WINDOW_MS` constant -- REMOVE
- `RESOURCE_STREAM_BUFFER_MS` constant -- REMOVE (or keep at 0 as documentation)
- Per-resource `setQueryData` dispatching in `useResourceSSE.ts` -- REPLACE with Zustand

## Open Questions

1. **Should metrics and log stream proxies also be converted to direct connections?**
   - What we know: There are 3 SSE proxy routes (resources, metrics, logs). This phase focuses on resources.
   - What's unclear: Whether converting metrics/logs to direct connection is in scope or a follow-up.
   - Recommendation: Convert all 3 in this phase since the pattern is identical and the proxy code is nearly copy-paste. Low marginal effort.

2. **Should resource pages still fall back to tRPC queries when SSE is disconnected?**
   - What we know: Phase 10 tRPC routers read from WatchManager in-memory store. The tRPC `.list` endpoints still work.
   - What's unclear: Whether components should show "disconnected" state or silently fall back to tRPC.
   - Recommendation: Keep tRPC query as a fallback that fires once on page mount if Zustand store is empty. SSE populates the store and subsequent updates come from there. This prevents blank screens if SSE takes a moment to connect.

3. **How to handle multi-tab scenarios?**
   - What we know: Each tab creates its own EventSource connection. The WatchManager is reference-counted on the server side.
   - What's unclear: Whether a SharedWorker or BroadcastChannel should share one SSE connection across tabs.
   - Recommendation: Keep per-tab connections for now. SharedWorker adds complexity and the server already handles multiple subscribers efficiently. Revisit only if server connection limits become an issue.

4. **Should the EventEmitter layer be removed?**
   - What we know: `voyagerEmitter` decouples WatchManager from SSE consumers. The SSE route listens on `watch-event:${clusterId}`.
   - What's unclear: Whether the indirection is still needed when there's only one consumer (the SSE route).
   - Recommendation: Keep the EventEmitter. It's lightweight, enables multiple SSE consumers per cluster, and the watch-db-writer also listens to watch events. Removing it saves nothing.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- this phase is code/config changes only using existing stack).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test && pnpm build && pnpm typecheck` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| L11-01 | SSE events arrive <100ms after K8s watch event | integration | Manual: compare timestamps in SSE payload | N/A (manual) |
| L11-02 | Direct browser->API SSE works with cookies | integration | Manual: verify EventSource connects without proxy | N/A (manual) |
| L11-03 | Zustand store correctly applies ADDED/MODIFIED/DELETED | unit | `pnpm test -- src/stores/resource-store.test.ts` | Wave 0 |
| L11-04 | Snapshot event sends full state on connect | integration | Manual: first SSE event is snapshot with items | N/A (manual) |
| L11-05 | No regression: all 15 resource pages render data | smoke | Manual: navigate each tab, verify data appears | N/A (manual) |
| L11-06 | TanStack Query still works for DB data (users, alerts) | smoke | `pnpm test && pnpm build` | Existing |

### Sampling Rate
- **Per task commit:** `pnpm build && pnpm typecheck`
- **Per wave merge:** `pnpm test && pnpm build && pnpm typecheck`
- **Phase gate:** Full suite green + manual SSE latency verification

### Wave 0 Gaps
- [ ] `apps/web/src/stores/__tests__/resource-store.test.ts` -- covers L11-03 (Zustand store CRUD operations)
- [ ] SSE latency measurement script or manual test procedure

## Sources

### Primary (HIGH confidence)
- Project codebase analysis: `apps/api/src/routes/resource-stream.ts`, `apps/api/src/lib/watch-manager.ts`, `apps/web/src/hooks/useResourceSSE.ts`
- Production ingress config: `charts/voyager/templates/ingress.yaml` -- confirms `/api` routes directly to API
- CORS config: `apps/api/src/server.ts` line 68-71 -- `credentials: true` already set
- Compression config: `apps/api/src/server.ts` line 54 -- `global: true` needs SSE exclusion

### Secondary (MEDIUM confidence)
- [MDN EventSource.withCredentials](https://developer.mozilla.org/en-US/docs/Web/API/EventSource/withCredentials) -- browser API documentation
- [MDN Access-Control-Allow-Credentials](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Credentials) -- CORS credential rules
- [fastify/fastify-compress#18](https://github.com/fastify/fastify-compress/issues/18) -- SSE compression conflict
- [Zustand GitHub](https://github.com/pmndrs/zustand) -- `subscribeWithSelector`, `useSyncExternalStore` internals

### Tertiary (LOW confidence)
- Lens desktop architecture -- could not find detailed internal architecture docs; recommendations based on general K8s watch patterns and the user's description of Lens behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new packages, all patterns use existing installed libraries
- Architecture: HIGH -- based on thorough analysis of current codebase, ingress config, and CORS setup
- Pitfalls: HIGH -- identified from direct code reading (compression global flag, initial load window, batch buffer) and known browser API limitations (CORS+credentials)
- Zustand store design: MEDIUM -- pattern is well-established but the exact store shape may need iteration based on performance with large clusters

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable -- no fast-moving dependencies)
