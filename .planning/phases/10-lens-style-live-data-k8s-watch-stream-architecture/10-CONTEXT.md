# Phase 10: Lens-Style Live Data — K8s Watch Stream Architecture - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the entire SSE-triggered-refetch + polling architecture with a Lens-style data streaming pipeline. K8s Watch API events carry full resource objects directly to the browser via SSE, and the client applies them to TanStack Query cache without refetch round-trips. Kill all frontend polling (40+ `refetchInterval` instances). Unify the two watch managers into a single in-memory store. Replace 3 of 4 background sync jobs with watch-based updates.

**In scope:** Unified WatchManager with in-memory store, SSE data streaming (full objects), client-side cache mutation (setQueryData), removal of all frontend refetchInterval, removal of health-sync/node-sync/event-sync jobs, watch reconnection and error handling, per-cluster persistent watch lifecycle.

**Out of scope:** Metrics API live streaming (K8s Metrics API doesn't support Watch — metrics-collector stays as polling job). Multi-instance API server support (in-memory store is single-process). New UI features or pages (this is infrastructure only).

</domain>

<decisions>
## Implementation Decisions

### D-01: SSE Data Payload — Full K8s Resource Objects
- Push complete K8s resource objects over SSE, matching Lens's approach exactly
- Event format: `{type: "ADDED"|"MODIFIED"|"DELETED", resourceType: string, object: <full K8s resource>}`
- No field trimming or delta compression — full objects are typically 1-5KB, bandwidth is acceptable
- **Rationale:** Simplest implementation, zero refetch needed, matches Lens behavior

### D-02: SSE Buffering — 1-Second Server-Side Batch
- Buffer watch events for 1 second on the server, then send as a batch
- Matches Lens's MobX reaction `delay: 1000` pattern
- Prevents UI thrashing during rolling deployments (20 pod updates → 1 batched SSE message)
- Adds 0-1s latency (acceptable for the render stability benefit)

### D-03: Client-Side Store — TanStack Query setQueryData
- When SSE delivers a batch of watch events, apply them directly to TanStack Query cache via `queryClient.setQueryData()`
- Components already subscribe to these queries — they re-render automatically
- No new state library needed; TanStack Query's reactivity maps well to Lens's MobX pattern
- Functionally identical to Lens: push-based data arrival → store update → component re-render

### D-04: Initial Load — tRPC Query + Watch (List/Watch Pattern)
- First page load uses existing tRPC query (immediate data from in-memory store)
- Then SSE takes over for live updates via setQueryData
- Matches Lens's `loadAll()` then `subscribe()` pattern
- Components show data instantly on mount, then stay live

### D-05: Watch Lifecycle — Per-Cluster Persistent
- Start ALL resource watches when a user navigates to any page of a cluster
- Keep watches alive while ANY user is viewing that cluster (across all tabs/pages)
- Stop when no users are viewing the cluster (reference-counted by active SSE connections)
- Matches Lens behavior: data is always current when switching between tabs within a cluster

### D-06: Unified Watch Manager — Single Manager for All Resource Types
- Merge ClusterWatchManager and ResourceWatchManager into a single unified WatchManager
- Handles ALL resource types: pods, deployments, nodes, services, configmaps, secrets, pvcs, namespaces, events, statefulsets, daemonsets, jobs, cronjobs, hpa, ingresses (+ any new types)
- One place to manage watch lifecycle, reconnection, error handling
- Eliminates the confusing overlap between two managers

### D-07: Server-Side Cache — In-Memory Store (Replace Redis for Watched Resources)
- WatchManager maintains a `Map<clusterId, Map<resourceType, KubeResource[]>>` in memory
- Updated directly by informer events (add/update/delete)
- tRPC routers read from this store instead of calling K8s API or Redis
- Eliminates Redis for all watchable resources (~0ms reads vs ~5ms Redis)
- Redis remains for non-watchable data (metrics history, search indexes, etc.)
- **Trade-off accepted:** Single-process architecture (no multi-instance API scaling). Acceptable for current deployment model.

### D-08: Migration — Big Bang Switch
- Build the complete new watch pipeline end-to-end
- Once verified working, remove ALL `refetchInterval` from ALL frontend pages in one sweep
- Clean cut — no dual code paths, no gradual migration
- Verification: either everything is live or nothing is

### D-09: Background Sync Jobs — Replace 3 of 4 with Watches
- **REMOVE health-sync (5min):** Health status comes from watch data (node ready conditions, pod counts)
- **REMOVE node-sync (5min):** Node data comes from watch events directly into in-memory store
- **REMOVE event-sync (2min):** K8s events come from watch events directly
- **KEEP metrics-collector (60s):** K8s Metrics API (`/apis/metrics.k8s.io`) does NOT support Watch — polling is the only option. Keep for TimescaleDB historical metrics.
- **KEEP metrics-stream-job (15s):** Live metrics SSE for the metrics page — reference-counted, only runs when someone views metrics.
- **DB writes:** When watch events fire, also write to PostgreSQL for historical data (dashboard needs DB when no one has a cluster open)

### Claude's Discretion
- Watch reconnection strategy (exponential backoff parameters, re-list on 410 Gone)
- In-memory store data structure and cleanup (max items per resource type)
- SSE connection management (max connections per cluster, global limit)
- How to propagate watch errors to the UI (toast notification vs status badge)
- Whether to keep `cached()` wrapper for non-watched tRPC queries or remove it entirely

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current Watch Infrastructure (to be replaced/refactored)
- `apps/api/src/lib/cluster-watch-manager.ts` — Current ClusterWatchManager (pods/deployments/nodes + metrics poll). To be unified.
- `apps/api/src/lib/resource-watch-manager.ts` — Current ResourceWatchManager (12 types, reference-counted). To be unified.
- `apps/api/src/lib/event-emitter.ts` — VoyagerEventEmitter central bus (keep but simplify)
- `apps/api/src/routes/resource-stream.ts` — Current SSE endpoint (needs full rewrite — must carry data, not just signals)
- `apps/api/src/routes/metrics-stream.ts` — Metrics SSE (keep as-is — metrics can't be watched)

### Current Client-Side Consumption (to be redesigned)
- `apps/web/src/hooks/useResourceSSE.ts` — Current SSE hook (signal-only → needs to apply data via setQueryData)
- `apps/web/src/hooks/useMetricsSSE.ts` — Metrics SSE hook (keep as-is)
- `apps/web/src/hooks/useMetricsData.ts` — Metrics data source switcher (keep as-is)

### Current Caching Layer (to be partially replaced)
- `apps/api/src/lib/cache.ts` — Redis `cached()` + `invalidateKey()` — replace for watched resources, keep for others
- `apps/api/src/lib/cache-keys.ts` — Redis key builders (most will be removed)
- `packages/config/src/cache.ts` — Cache TTL constants (review and simplify)

### Background Jobs (3 to remove, 2 to keep)
- `apps/api/src/jobs/health-sync.ts` — REMOVE (watch-based)
- `apps/api/src/jobs/node-sync.ts` — REMOVE (watch-based)
- `apps/api/src/jobs/event-sync.ts` — REMOVE (watch-based)
- `apps/api/src/jobs/metrics-history-collector.ts` — KEEP (Metrics API not watchable)
- `apps/api/src/jobs/metrics-stream-job.ts` — KEEP (live metrics SSE)

### SSE/Watch Configuration
- `packages/config/src/sse.ts` — SSE heartbeat/reconnect constants, MAX_CONCURRENT_CLUSTER_WATCHES
- `apps/api/src/config/jobs.ts` — Job interval constants (some will be removed)
- `apps/api/src/config/k8s.ts` — K8S_CONFIG (CLIENT_POOL_MAX, etc.)

### Server Startup
- `apps/api/src/server.ts` — Job startup sequence (needs update: remove 3 jobs, add WatchManager init)

### Frontend Pages (ALL need refetchInterval removal)
- Every page in `apps/web/src/app/` and component in `apps/web/src/components/` that uses `refetchInterval` — comprehensive sweep required

### Phase 9 Context (carry forward)
- `.planning/phases/09-lens-inspired-power-features/09-CONTEXT.md` — D-16 intended live data for all tabs; this phase delivers that intent properly

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **K8s informer pattern**: `k8s.makeInformer()` is already used in both watch managers — the low-level mechanism is correct, just needs consolidation
- **voyagerEmitter**: Central event bus already decouples watchers from consumers — keep for SSE emission
- **ClusterClientPool**: Per-cluster KubeConfig management — untouched by this phase
- **TanStack Query infrastructure**: `queryClient`, `useQuery`, cache keys — the client-side framework is already in place
- **Next.js SSE proxy** (`apps/web/src/app/api/resources/stream/route.ts`): Raw `node:http` proxy that avoids Next.js buffering — keep and adapt

### Established Patterns
- **tRPC router pattern**: All routers use `cached(key, ttl, fn)` — after this phase, watched resources read from in-memory store instead
- **K8s error handling**: `handleK8sError` standardized across routers — keep for watch error handling
- **SSE endpoint pattern**: Fastify route with auth check, connection limits, heartbeat — adapt for data-carrying events

### Integration Points
- **server.ts**: Remove 3 job startups, add unified WatchManager initialization
- **Every frontend page**: Remove `refetchInterval` from 40+ useQuery calls
- **useResourceSSE**: Complete rewrite — from signal-only to data-applying
- **resource-stream.ts**: Complete rewrite — from signal relay to data streaming
- **tRPC routers**: Change data source from `cached(key, ttl, k8sApiCall)` to `watchManager.getResources(clusterId, type)`

</code_context>

<specifics>
## Specific Ideas

- User explicitly wants this to work **exactly like Lens** — Lens is the reference implementation
- The investigation found that ClusterWatchManager is **never started** (no call to `startCluster()` in server.ts) — this is the root cause of why the current live data feels broken
- The investigation found **40+ refetchInterval** entries across the frontend — these are doing all the actual work, not the watches
- K8s Metrics API is the ONE exception — it cannot be watched, so metrics-collector and metrics-stream-job must remain as polling
- The in-memory store replaces Redis for watched resources — this means the API is single-instance only (acceptable for current deployment)
- Watch events should also write to PostgreSQL for historical data (dashboard needs DB when no SSE subscribers are connected)

</specifics>

<deferred>
## Deferred Ideas

- **Multi-instance API support**: In-memory store doesn't scale horizontally. If multiple API instances are needed, would need Redis pub/sub or a shared store. Not needed for current single-instance deployment.
- **WebSocket replacement for SSE**: Could switch from SSE to WebSocket for bidirectional communication. Not needed — SSE is sufficient for server-push data streaming.
- **Custom resource watch**: Watch CRDs dynamically (not just built-in K8s types). Would need dynamic informer registration. Future enhancement after base watch pipeline is stable.
- **Selective field watches**: K8s API supports `fieldSelector` and `labelSelector` on watches — could reduce watch data volume. Optimization for later if bandwidth becomes an issue.

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-lens-style-live-data-k8s-watch-stream-architecture*
*Context gathered: 2026-03-29*
