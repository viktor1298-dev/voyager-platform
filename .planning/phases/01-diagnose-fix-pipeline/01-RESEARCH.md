# Phase 1: Diagnose & Fix Pipeline - Research

**Researched:** 2026-03-30
**Domain:** SSE live data pipeline (K8s Watch -> EventEmitter -> SSE -> Zustand)
**Confidence:** HIGH

## Summary

Deep codebase investigation reveals the live data pipeline's architecture is sound but has specific implementation gaps preventing continuous real-time updates. The initial hypothesis from project research -- "TanStack Query polling overwrites SSE data" -- is **partially incorrect** for cluster detail pages. Cluster detail pages correctly read from Zustand (SSE-fed) via `useClusterResources()`, and TQ queries are either fallback-only (gated by `enabled: !effectiveIsLive && data.length === 0`) or fetch different data (DB-backed entities). However, there are 20+ files with `refetchInterval` outside cluster detail pages (Sidebar, TopBar, Dashboard widgets) that poll for data also available via SSE. These don't directly conflict with the Zustand store but generate unnecessary network load.

The more likely root causes for "SSE stops delivering" are: (1) K8s informer silent death due to `@kubernetes/client-node` v1.4.0 bug #2385 -- the `doneHandler()` returns early on non-410 errors without restarting, effectively killing the informer; (2) no heartbeat timeout to detect informers that stop emitting events without triggering an error; and (3) the `watch-db-writer.ts` monkeypatch, while not currently blocking events, is fragile and can double-wrap on restart. The WatchManager DOES have error handler reconnection (`handleInformerError`), but it only fires when the informer explicitly calls its ERROR callbacks -- silent TCP drops bypass this entirely.

**Primary recommendation:** Implement informer heartbeat timeout (detect silent death within 90s), verify the error handler reconnection path works end-to-end, refactor watch-db-writer from monkeypatch to EventEmitter listener, and remove all unnecessary `refetchInterval` for SSE-watched types.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** SSE-only for watched resource types. Remove all `refetchInterval` on tRPC queries for the 15 watched types. Components read exclusively from Zustand store (fed by `useResourceSSE`). No competing tRPC polling.
- **D-02:** Fix known suspects directly -- research identified 3 high-confidence root causes. Fix in order, test after each: (1) remove TQ polling conflict, (2) fix informer reconnect bug, (3) verify/refactor monkeypatch. No upfront diagnostic logging phase.
- **D-03:** Both automated Playwright E2E test AND manual functional QA. E2E: delete a pod via kubectl, take 4 screenshots at 3s intervals (0s, 3s, 6s, 9s), compare pod status across frames. Manual QA via functional-qa skill for phase gate.
- **D-04:** Refactor `watch-db-writer.ts` from monkeypatch to EventEmitter listener pattern. DB sync subscribes to watch events via `emitter.on()`, never intercepts SSE delivery path.

### Claude's Discretion
- Specific order of fixes within the three known suspects
- Whether to upgrade `@kubernetes/client-node` or patch the informer reconnect locally
- Implementation details of the EventEmitter listener refactor

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | SSE stream delivers continuous events without stopping | Informer heartbeat timeout (90s), error handler reconnection verified in codebase, `doneHandler` bug analysis confirms silent death path |
| PIPE-02 | TanStack Query polling disabled for all SSE-fed resource types | Complete audit of 20+ `refetchInterval` usages identified; cluster detail pages already correct; dashboard/sidebar/topbar need cleanup |
| PIPE-03 | K8s informer lifecycle robust -- auto-recreate on silent death, handle non-410 errors | `@kubernetes/client-node` v1.4.0 `doneHandler` bug confirmed in installed code; WatchManager error handler IS present but heartbeat timeout NOT implemented |
| PIPE-04 | watch-db-writer monkeypatch verified safe | Monkeypatch analyzed -- does NOT block SSE events but is fragile (double-wrap on restart, no restore on stop); EventEmitter pattern replacement documented |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Iron Rule #1:** NEVER add `migrate()` or schema init to `server.ts`
- **Biome lint:** 2-space indent, 100-char width, single quotes, semicolons as-needed
- **ESM:** All packages use `.js` extensions in imports
- **Zod v4:** `z.record()` requires TWO arguments
- **Config centralization:** No hardcoded values in routers/jobs -- use `@voyager/config`
- **Deploy:** `helm uninstall` + `helm install`, never `helm upgrade`
- **QA:** Console errors = FAIL, both themes tested, functional-qa skill required
- **Testing:** Vitest (unit), Playwright (E2E), `pnpm typecheck` must pass
- **BASE_URL:** E2E must use `process.env.BASE_URL`, never hardcode localhost

## Standard Stack

### Core (already installed -- no changes)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@kubernetes/client-node` | 1.4.0 | K8s Watch/Informer API | Latest on npm. Has `doneHandler` bug (#2385 closed but fix NOT in 1.4.0) |
| `fastify` | 5.x | HTTP server, SSE via `reply.raw.write()` | Working correctly |
| `zustand` | 5.x | Client-side resource store | Working correctly |
| `@tanstack/react-query` | 5.x | Server state (DB data only after fix) | Working -- needs `refetchInterval` cleanup |
| `@voyager/types` | workspace | Shared types (`WatchEvent`, `WatchEventBatch`, etc.) | Working correctly |
| `@voyager/config` | workspace | Shared constants (SSE intervals, limits) | Has `WATCH_HEARTBEAT_TIMEOUT_MS = 90_000` defined but unused |

### No New Libraries Needed

This phase is entirely about fixing implementation bugs in existing code. No new dependencies required.

## Architecture Patterns

### Current Pipeline (already implemented)

```
K8s Watch API
  |  @kubernetes/client-node makeInformer() (15 types)
  |  ObjectCache per type per cluster
  v
VoyagerEventEmitter
  |  emitWatchEvent(clusterId, event)
  |  watch-event:{clusterId} channel
  v
resource-stream.ts (SSE)
  |  reply.raw.write('event: watch\ndata: ...')
  |  No event IDs, no replay buffer (Phase 2 scope)
  v
EventSource (browser)
  |  useResourceSSE hook
  v
Zustand resource-store
  |  applyEvent() per event (no batching -- Phase 2 scope)
  v
useClusterResources selector -> components
```

### Key Files to Modify

```
apps/api/src/
  lib/watch-manager.ts       # Add heartbeat timeout per informer
  lib/watch-db-writer.ts     # Replace monkeypatch with emitter.on() pattern
  lib/event-emitter.ts       # Possibly no change (already correct)
  routes/resource-stream.ts  # Verify event delivery, possibly no change

apps/web/src/
  hooks/useResourceSSE.ts    # Verify reconnection, possibly no change
  app/clusters/[id]/metrics/page.tsx  # Remove refetchInterval on clusters.live
  components/Sidebar.tsx     # Audit refetchInterval (keep -- DB data)
  components/TopBar.tsx      # Audit refetchInterval (keep -- DB data)
  components/resource/RelatedPodsList.tsx  # Switch to useClusterResources
  app/page.tsx               # Audit clusters.live refetchInterval
  + 15 other files with refetchInterval (see audit below)
```

### Pattern 1: Informer Heartbeat Timeout

**What:** Per-informer timer that resets on each event. If no event within 90s, force-restart the informer.
**When:** After each `add`/`update`/`delete` and `connect` event.
**Why:** Catches silent TCP disconnects where the stream is "open" but no data arrives. The error handler only fires when the informer explicitly calls ERROR callbacks -- silent drops bypass it.

```typescript
// In WatchManager, alongside existing informer setup
private heartbeatTimers = new Map<string, NodeJS.Timeout>()

private resetHeartbeat(clusterId: string, type: ResourceType): void {
  const key = `${clusterId}:${type}`
  const existing = this.heartbeatTimers.get(key)
  if (existing) clearTimeout(existing)

  this.heartbeatTimers.set(key, setTimeout(() => {
    console.warn(
      `[WatchManager] Heartbeat timeout for ${type} on ${clusterId}, restarting informer`
    )
    const cluster = this.clusters.get(clusterId)
    const informer = cluster?.informers.get(type)
    if (informer) {
      informer.stop()
      informer.start().catch((err) => this.handleInformerError(clusterId, type, err))
    }
  }, WATCH_HEARTBEAT_TIMEOUT_MS))
}
```

### Pattern 2: EventEmitter Listener (replacing monkeypatch)

**What:** `watch-db-writer` subscribes to all watch events via EventEmitter instead of replacing `emitWatchEvent`.
**Challenge:** EventEmitter doesn't support wildcard listeners. `watch-event:*` doesn't work.
**Solution:** Use EventEmitter `newListener` to auto-subscribe to each `watch-event:{clusterId}` channel as they're created. Or simpler: have WatchManager call a hook after emitting.

```typescript
// Option A: Hook into newListener (cleanest, no WatchManager changes)
export function startWatchDbWriter(): void {
  if (syncInterval) return

  // Track listeners for cleanup
  const channelListeners = new Map<string, (event: WatchEvent) => void>()

  const onNewListener = (eventName: string) => {
    if (typeof eventName !== 'string') return
    if (!eventName.startsWith('watch-event:')) return
    const clusterId = eventName.slice('watch-event:'.length)
    if (channelListeners.has(clusterId)) return

    const listener = (event: WatchEvent) => {
      dirtySet.add(`${clusterId}:${event.resourceType}`)
    }
    channelListeners.set(clusterId, listener)
    voyagerEmitter.on(eventName, listener)
  }

  voyagerEmitter.on('newListener', onNewListener)
  // ... start syncInterval
}
```

```typescript
// Option B: Direct registration per active cluster (simplest)
// WatchManager already tracks active clusters. After subscribe(), register listener.
// This requires WatchManager to expose an event or callback.
```

### Anti-Patterns to Avoid

- **Patching methods at runtime:** The monkeypatch pattern (`originalFn = obj.method; obj.method = wrapper`) is not type-safe and breaks if the method is captured by reference elsewhere. Always use EventEmitter listeners.
- **Using `refetchInterval` for data that SSE delivers:** Even on pages without SSE connection, unnecessary polling of K8s-backed data generates load on both the API server and K8s API.
- **Assuming EventSource auto-reconnects correctly:** Browser `EventSource` reconnects automatically, but the server may not re-send a snapshot if `Last-Event-ID` is not implemented. After reconnect, data could be stale until the next event.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Informer reconnection | Custom watch+reconnect loop | `@kubernetes/client-node` `makeInformer` + error handler calling `start()` | Library handles resourceVersion tracking, LIST+WATCH cycle, ObjectCache |
| SSE auto-reconnect | Custom WebSocket with reconnect | Browser native `EventSource` | Built-in reconnection, `Last-Event-ID` support, backpressure |
| Wildcard event listeners | Custom event router | Node.js `EventEmitter` with `newListener` event | Standard pattern, no custom routing needed |
| Exponential backoff | Custom timer logic | Existing `handleInformerError` in WatchManager | Already implemented correctly with jitter |

## Common Pitfalls

### Pitfall 1: Informer Silent Death (CRITICAL for this phase)

**What goes wrong:** Informer stops receiving events but doesn't fire an error. The SSE stream sends heartbeats but no resource updates. Dashboard appears "frozen."
**Root cause in installed code:** `@kubernetes/client-node` v1.4.0 `cache.js` line 90-98:
```javascript
async doneHandler(err) {
    this._stop();
    if (err && (err.statusCode === 410 || err.code === 410)) {
        this.resourceVersion = '';
    }
    else if (err) {
        this.callbackCache[ERROR].forEach((elt) => elt(err));
        return;  // Returns without restarting!
    }
    // ... restart logic below (never reached for non-410 errors)
}
```
For non-410 errors (network timeout, 5xx, connection reset), the informer fires ERROR and stops. The WatchManager's `handleInformerError` then calls `informer.start()` after backoff, which IS the correct fix. But for **silent TCP drops** (no error fired at all -- issue #559), neither path fires. Only the heartbeat timeout catches this.
**How to avoid:** Implement heartbeat timeout (`WATCH_HEARTBEAT_TIMEOUT_MS = 90_000` -- already defined in config but NOT implemented). Timer per informer, reset on every event. If expired, stop + start the informer.
**Warning signs:** Resource data stops updating while SSE connection shows heartbeats in Network tab. No `[WatchManager] Informer error` in server logs.

### Pitfall 2: TQ Polling on Non-Cluster-Detail Pages

**What goes wrong:** The hypothesis "TQ polling overwrites SSE data" was investigated in depth. Result: cluster detail pages are clean -- they read from Zustand exclusively. However, dashboard pages (`app/page.tsx`), TopBar, Sidebar, and dashboard widgets use `refetchInterval` for `clusters.live`, `clusters.list`, and `alerts.active`. The `clusters.live` endpoint fetches pods/nodes/events from WatchManager -- same data as SSE. While this doesn't overwrite the Zustand store (different data path), it generates unnecessary API + K8s load.
**How to avoid:** Per D-01, remove `refetchInterval` on all tRPC queries that fetch SSE-watched resource data. Keep `refetchInterval` on truly DB-only queries (clusters.list, alerts, users, audit).

### Pitfall 3: watch-db-writer Double-Wrap

**What goes wrong:** `stopWatchDbWriter()` clears the sync interval and listeners map but does NOT restore the original `emitWatchEvent` method. If `startWatchDbWriter()` is called again, it wraps the already-wrapped method, creating a double layer.
**Current impact:** Low -- start is called once at boot. But the code is a maintenance hazard.
**How to avoid:** Refactor to EventEmitter listener pattern (D-04) which has clean add/remove semantics.

### Pitfall 4: EventSource Cleanup on Tab Background

**What goes wrong:** When user switches browser tabs, the EventSource connection may be throttled or suspended. On tab return, `readyState` could be `CLOSED` without an error event.
**Current handling:** `useResourceSSE` has `es.onerror` which checks `readyState`. If `CLOSED`, sets state to `disconnected`. But it does NOT recreate the EventSource -- the effect only runs when `clusterId` changes.
**Risk for this phase:** Medium. If the informer fix works but tab suspend kills the SSE client, data still appears stale.
**Possible addition:** Add `document.visibilitychange` handler to check and recreate EventSource on tab focus.

## Code Examples

### Verified: Current Informer Error Recovery Path (working)

```typescript
// watch-manager.ts line 263 -- registers error handler
informer.on('error', (err: unknown) => {
  this.handleInformerError(clusterId, def.type, err)
})

// watch-manager.ts line 386 -- reconnects after backoff
private handleInformerError(clusterId: string, type: ResourceType, err: unknown): void {
  const cluster = this.clusters.get(clusterId)
  if (!cluster) return

  const attempt = (cluster.reconnectAttempts.get(type) ?? 0) + 1
  cluster.reconnectAttempts.set(type, attempt)
  const delay = Math.min(WATCH_RECONNECT_BASE_MS * 2 ** (attempt - 1), WATCH_RECONNECT_MAX_MS)
  const jitter = delay * WATCH_RECONNECT_JITTER_RATIO * Math.random()

  setTimeout(() => {
    if (this.isWatching(clusterId)) {
      const informer = cluster.informers.get(type)
      informer?.start().catch((startErr) => this.handleInformerError(clusterId, type, startErr))
    }
  }, delay + jitter)
}
```

This path works for **explicit errors**. It does NOT work for **silent TCP drops** (no error emitted).

### Verified: Zustand Store applyEvent (correct)

```typescript
// resource-store.ts -- handles ADDED/MODIFIED/DELETED correctly
applyEvent: (clusterId, event) =>
  set((state) => {
    const key = `${clusterId}:${event.resourceType}`
    const current = state.resources.get(key)
    if (!current) return state  // Note: ADDED events for types not yet in store are silently dropped

    const obj = event.object as { name: string; namespace?: string | null }
    // ... switch on event.type: ADDED, MODIFIED, DELETED
    const next = new Map(state.resources)
    next.set(key, updated)
    return { resources: next }
  }),
```

**Minor issue:** If an `ADDED` event arrives for a resource type that has no entry in the store (`current` is undefined), the event is silently dropped (`return state`). This could happen if the SSE snapshot for that type hasn't arrived yet but a watch event comes through. Low risk since snapshot is sent before watch listeners are registered, but worth noting.

### Complete refetchInterval Audit

**Files that MUST be changed (SSE-watched data via clusters.live or direct K8s queries):**

| File | Query | Interval | Action |
|------|-------|----------|--------|
| `app/clusters/[id]/metrics/page.tsx` | `clusters.live` | 60s | Remove refetchInterval (live data comes from SSE when on cluster page) |
| `components/resource/RelatedPodsList.tsx` | `trpc.pods.list` | staleTime 30s | Switch to `useClusterResources('pods')` |

**Files that SHOULD be changed (dashboard pages polling for data available via SSE):**

| File | Query | Interval | Action |
|------|-------|----------|--------|
| `app/page.tsx` | `clusters.live` | DB_CLUSTER_REFETCH_MS | Remove or increase -- dashboard doesn't have SSE connection |
| `components/TopBar.tsx` | `clusters.live` | via TopBar logic | Audit -- TopBar polls for badge counts |

**Files to KEEP (DB-backed data, NOT SSE-watched):**

| File | Query | Interval | Reason to Keep |
|------|-------|----------|----------------|
| `components/Sidebar.tsx` | `clusters.list` | 60s | DB cluster list, not K8s resources |
| `components/Sidebar.tsx` | `alerts.active` | 30s | DB alerts, not SSE-watched |
| `components/TopBar.tsx` | `clusters.list` | 60s | DB cluster list |
| `components/TopBar.tsx` | `alerts.active` | 30s | DB alerts |
| `app/logs/page.tsx` | logs query | conditional | Log data, user-driven refresh |
| `components/metrics/NodeMetricsTable.tsx` | metrics | 30s | Metrics data via tRPC (metrics-server), not SSE-watched |
| `components/metrics/MetricsTimeSeriesPanel.tsx` | metrics.history | variable | TimescaleDB data, not SSE-watched |
| `components/metrics/ResourceSparkline.tsx` | metrics | 30s | Metrics data |
| `hooks/usePresence.ts` | presence | 45s | User presence, not K8s data |
| `components/dashboard/widgets/AlertFeedWidget.tsx` | alerts | 30s | DB alerts |
| `components/dashboard/widgets/ResourceChartsWidget.tsx` | metrics | 30s | DB metrics |
| `app/settings/page.tsx` | settings data | 30-60s | DB data |
| `components/dashboard/AnomalyTimeline.tsx` | anomalies | 60s | DB data (mock) |
| `components/dashboard/widgets/StatCardsWidget.tsx` | `clusters.list` + `metrics.currentStats` | variable | DB data |
| `components/dashboard/widgets/ClusterHealthWidget.tsx` | `clusters.list` + `metrics.currentStats` | variable | DB data |

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| TQ polling for all K8s data | SSE for 15 watched types, TQ for DB data only | Eliminates stale overwrites, reduces API load |
| Monkeypatch on emitter method | EventEmitter listener subscription | Clean lifecycle, no double-wrap risk |
| No informer health monitoring | Heartbeat timeout per informer (90s) | Detects silent death within 90s |

## Open Questions

1. **Does `informer.start()` after `stop()` properly re-LIST and re-WATCH?**
   - What we know: `start()` calls `doneHandler(null)` which does `this.stopped = false` then re-lists and re-watches. The `stop()` method sets `this.stopped = true` and calls `this._stop()` (aborts request). `start()` unsets `stopped` first, so re-start should work.
   - Confidence: MEDIUM -- verified from installed source code, but edge cases (e.g., stop during a LIST call) are possible.
   - Recommendation: Test empirically during implementation.

2. **Is the dashboard (`app/page.tsx`) supposed to show live data without SSE?**
   - What we know: The dashboard page uses `clusters.live` with `refetchInterval` to show cluster summaries. It does NOT have `useResourceSSE` (that's only in cluster layout). So dashboard data is always poll-based.
   - Recommendation: For Phase 1, keep dashboard polling since it's outside the SSE scope. Phase 3 could add SSE to dashboard.

3. **What happens when `applyEvent` receives ADDED for a type with no snapshot yet?**
   - What we know: `const current = state.resources.get(key); if (!current) return state` -- the event is dropped silently.
   - Risk: Low -- snapshot is sent before listeners are registered on the server side.
   - Recommendation: No action for Phase 1; monitor during testing.

## Sources

### Primary (HIGH confidence)
- **Installed `@kubernetes/client-node` v1.4.0 source** -- `apps/api/node_modules/@kubernetes/client-node/dist/cache.js` lines 90-98: `doneHandler` early return confirmed
- **Codebase investigation** -- `watch-manager.ts`, `resource-stream.ts`, `watch-db-writer.ts`, `event-emitter.ts`, `useResourceSSE.ts`, `resource-store.ts`: all read and analyzed
- **`@voyager/config/sse`** -- `WATCH_HEARTBEAT_TIMEOUT_MS = 90_000` defined but not implemented

### Secondary (MEDIUM confidence)
- [kubernetes-client/javascript#2385](https://github.com/kubernetes-client/javascript/issues/2385) -- ListWatch stops reconnecting (closed, fix not in 1.4.0)
- [kubernetes-client/javascript#2387](https://github.com/kubernetes-client/javascript/issues/2387) -- Double callback on connection loss
- [kubernetes-client/javascript#559](https://github.com/kubernetes-client/javascript/issues/559) -- Silent watch disconnect
- `.planning/research/PITFALLS.md` -- 15 pitfalls documented from project research
- `.planning/research/ARCHITECTURE.md` -- 3-layer pipeline architecture

### Tertiary (LOW confidence)
- npm registry: `@kubernetes/client-node` latest is 1.4.0 (no newer version with fix available)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing code analyzed
- Architecture: HIGH -- pipeline architecture is correct, issues are implementation bugs
- Root causes: HIGH -- `doneHandler` bug confirmed from installed source; monkeypatch analyzed line-by-line; refetchInterval audit complete with 20+ files examined
- Pitfalls: HIGH -- verified against installed code and GitHub issues

**Research date:** 2026-03-30
**Valid until:** Indefinite (fixes are codebase-specific, not library-version-dependent)
