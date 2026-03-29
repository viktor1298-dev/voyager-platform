# Phase 10: Lens-Style Live Data — K8s Watch Stream Architecture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 10-lens-style-live-data-k8s-watch-stream-architecture
**Areas discussed:** SSE data payload, Client-side store, Watch lifecycle, Migration strategy

---

## SSE Data Payload

| Option | Description | Selected |
|--------|-------------|----------|
| Full objects | Push complete K8s resource objects over SSE — exactly like Lens. Simpler, zero refetch needed. Higher bandwidth but K8s objects are typically 1-5KB each. | ✓ |
| Minimal objects | Push trimmed resource objects (only fields the UI renders). Saves ~60-70% bandwidth but requires maintaining field maps per resource type. | |
| You decide | Claude picks based on what's most practical. | |

**User's choice:** Full objects (Recommended)
**Notes:** Direct match with Lens architecture. Simplicity over bandwidth optimization.

### SSE Buffering

| Option | Description | Selected |
|--------|-------------|----------|
| 1s batch | Buffer events for 1 second then send as batch — matches Lens's MobX reaction delay: 1000 pattern. | ✓ |
| Immediate send | Zero buffering — every watch event pushed instantly. Can cause render storms. | |
| rAF-aligned (16ms) | Buffer per animation frame. Near-instant but still batches. | |

**User's choice:** 1s batch (Recommended)
**Notes:** Matches Lens debounce pattern. Prevents UI thrashing during rolling deployments.

---

## Client-Side Store

| Option | Description | Selected |
|--------|-------------|----------|
| TanStack setQueryData | Apply SSE data directly to TanStack Query cache. Components re-render automatically. No new state library. | ✓ |
| New Zustand live store | Dedicated Zustand store for live K8s data, separate from TanStack Query. | |
| You decide | Claude picks based on codebase patterns. | |

**User's choice:** TanStack setQueryData (Recommended)
**Notes:** User asked "will option 1 work the same as Lens?" — confirmed it maps 1:1 with Lens's MobX pattern: push-based data → store update → component re-render. Functionally identical end-user experience.

### Initial Load

| Option | Description | Selected |
|--------|-------------|----------|
| tRPC query + watch | First load uses tRPC query, then SSE takes over. Matches Lens's loadAll() then subscribe(). | ✓ |
| Watch only | Skip tRPC initial query — wait for first SSE batch. Simpler but brief empty state. | |
| You decide | Claude picks. | |

**User's choice:** tRPC query + watch (Recommended)
**Notes:** Lens's List/Watch pattern. Immediate data on mount, then live updates.

---

## Watch Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Per-cluster persistent | Start all watches when user navigates to any cluster page. Keep alive while any user views cluster. | ✓ |
| Per-tab reference-counted | Start watches only for current tab's resource types. Lower server load but stale on tab switch. | |
| Always-on for all clusters | Start watches for ALL clusters at API startup. Maximum freshness but highest resource usage. | |

**User's choice:** Per-cluster persistent (Recommended)
**Notes:** Matches Lens behavior — data always current when switching tabs within a cluster.

### Watch Manager Unification

| Option | Description | Selected |
|--------|-------------|----------|
| Unify into one | Merge ClusterWatchManager + ResourceWatchManager into single WatchManager for all resource types. | ✓ |
| Keep separate | Keep two managers with overlapping coverage. | |
| You decide | Claude picks based on codebase complexity. | |

**User's choice:** Unify into one (Recommended)
**Notes:** Simplifies architecture. Currently having two managers with overlapping coverage is confusing.

### Server-Side Cache

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory store | WatchManager keeps Map of all watched resources in memory. tRPC routers read from this. Replaces Redis for watched resources. | ✓ |
| Keep Redis | Continue Redis caching layer. Informer events invalidate Redis keys. Works across multiple API instances. | |
| You decide | Claude picks based on deployment model. | |

**User's choice:** In-memory store (Recommended)
**Notes:** Matches Lens's KubeObjectStore pattern. ~0ms reads. Trade-off accepted: single-process API.

---

## Migration Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Big bang | Build new pipeline, then remove ALL refetchInterval from ALL pages in one sweep. Clean cut. | ✓ |
| Gradual per-resource | Migrate one resource type at a time. Lower risk but mixed state longer. | |
| Polling as fallback | Keep refetchInterval as safety net (5min). Primary path is watches. | |

**User's choice:** Big bang (Recommended)
**Notes:** Clean cut — no dual code paths. If watch works for one resource, it works for all (same pattern).

### Background Sync Jobs

| Option | Description | Selected |
|--------|-------------|----------|
| Replace with watches | Remove health-sync, node-sync, event-sync. Keep metrics-collector (Metrics API not watchable). | ✓ |
| Keep sync jobs for DB | Keep all jobs for PostgreSQL writes. Watches serve live UI only. | |
| You decide | Claude determines which to keep. | |

**User's choice:** Replace with watches (Recommended)
**Notes:** 3 of 4 jobs removed. Metrics-collector stays (Metrics API limitation). Watch events also write to PostgreSQL for historical data.

---

## Claude's Discretion

- Watch reconnection strategy (exponential backoff, re-list on 410 Gone)
- In-memory store data structure and cleanup
- SSE connection management limits
- How to propagate watch errors to the UI
- Whether to keep `cached()` wrapper for non-watched queries

## Deferred Ideas

- Multi-instance API support (Redis pub/sub for shared store)
- WebSocket replacement for SSE
- Custom resource (CRD) dynamic watches
- Selective field/label watch filters
