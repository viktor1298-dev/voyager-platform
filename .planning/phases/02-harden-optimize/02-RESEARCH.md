# Phase 2: Harden & Optimize - Research

**Researched:** 2026-03-30
**Domain:** SSE reconnection resilience, event-ID replay, client-side event batching, informer heartbeat detection
**Confidence:** HIGH

## Summary

Phase 2 transforms the working live data pipeline (established in Phase 1) into a production-resilient system. Three distinct technical domains need addressing: (1) SSE reconnection with event-ID replay for lossless data recovery, (2) client-side event buffering to handle burst events (rolling updates producing 50+ events in 5 seconds) without UI jank, and (3) client-side heartbeat monitoring to detect dead SSE connections.

The existing codebase is well-positioned for these changes. Server-side SSE constants for backoff are already defined in `packages/config/src/sse.ts` but not consumed by the client. The server already sends `:heartbeat` comments every 30 seconds that the client currently ignores. The Zustand store already has both `setResources()` (bulk) and `applyEvent()` (single) -- it needs a new `applyEvents()` (batch) method. The `useMetricsSSE` hook already implements exponential backoff and visibility-aware reconnection -- this pattern should be adapted for `useResourceSSE`.

**Primary recommendation:** Keep native `EventSource` (not `@microsoft/fetch-event-source`), implement custom reconnect wrapper with exponential backoff, add server-side event IDs with ring buffer replay, and add client-side 1-second event buffer with batch Zustand flush. No new dependencies needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Stale data + status badge during reconnect. Keep showing last-known data. ConnectionStatusBadge (already exists) shows 'reconnecting' state. No layout shift, no empty flash, no loading overlay.
- **D-02:** Silent reconnect. No toast on successful reconnection. Badge transitions back to 'connected' and data refreshes silently.
- **D-06:** Keep 90s informer heartbeat timeout. CONN-02 "recover within 30s" applies to SSE client recovery, not informer detection. Different layers, different timeouts.

### Claude's Discretion
- **D-03:** Data recovery approach (snapshot vs event-ID replay) -- based on research
- **D-04:** Burst batching strategy (1s buffer vs rAF vs bulk merge) -- based on research
- **D-05:** Client-side heartbeat detection scope -- based on failure mode analysis
- Whether to use native EventSource or switch to fetch-based SSE for custom backoff
- Exponential backoff parameters for client reconnect
- Whether to add toast notification for extended outages (>30s)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONN-01 | SSE event IDs for no-data-loss reconnection (Last-Event-ID replay) | Server-side monotonic event IDs + ring buffer (100 events). Native EventSource automatically sends `Last-Event-ID` header on reconnect. Server checks header, replays from buffer or falls back to full snapshot. |
| CONN-02 | Informer heartbeat timeout -- detect and recover from silent disconnects within 30s | Already implemented server-side (90s per D-06). Client-side: monitor SSE heartbeat comments (30s interval). If no data/heartbeat in 45s, close and reconnect EventSource. |
| CONN-03 | SSE auto-reconnect with exponential backoff, no visible flash of empty state during reconnect | Custom reconnect wrapper using backoff constants already defined in `@voyager/config/sse`. Keep stale data in Zustand (D-01). Pattern proven in `useMetricsSSE`. |
| PERF-01 | Client-side 1-second event buffer (Rancher pattern) to batch UI updates during burst events | 1s `setTimeout` buffer in `useResourceSSE`, flush all accumulated events to Zustand in single `set()` call. Rancher uses identical 1s interval. |
| PERF-02 | Zustand bulk state updates -- batch multiple events into single render cycle | New `applyEvents(clusterId, events[])` method that applies all ADDED/MODIFIED/DELETED operations in one Map copy + one `set()` call. |
</phase_requirements>

## Standard Stack

### Core (already installed -- no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native `EventSource` | Browser built-in | SSE client | Auto-sends `Last-Event-ID`, handles reconnect lifecycle, zero bundle cost. Already used. |
| Zustand | 5.0.12 | Client state | Already used for resource-store. `subscribeWithSelector` middleware already applied. |
| `@voyager/config/sse` | workspace | Backoff constants | Already defines `SSE_INITIAL_RECONNECT_DELAY_MS`, `SSE_RECONNECT_BACKOFF_MULTIPLIER`, `SSE_MAX_RECONNECT_DELAY_MS`, `SSE_MAX_RECONNECT_ATTEMPTS`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native EventSource | `@microsoft/fetch-event-source` (2.0.1, 62KB) | Adds POST support, custom headers, visibility management. But: native EventSource already handles `Last-Event-ID` automatically, visibility reconnect already implemented in Phase 1, and adding a dependency for features we don't need increases bundle size. Native EventSource + custom wrapper is simpler and proven in `useMetricsSSE`. |
| Native EventSource | `reconnecting-eventsource` (1.6.5, 102KB) | Drop-in wrapper. But: doesn't expose backoff parameters, doesn't preserve `Last-Event-ID` per docs, larger bundle. Our custom wrapper (~40 lines) gives full control. |
| setTimeout buffer | `requestAnimationFrame` batching | rAF fires at 60fps (~16ms) -- too frequent for our use case. We want 1s batching to coalesce burst events, not frame-aligned updates. rAF would process 60 flushes/second during bursts instead of 1. |
| Manual Map copy | Zustand Immer middleware | Would simplify `applyEvents()` with mutable draft. But: adds `immer` dependency (~16KB), not used elsewhere in codebase, and the batch operation is straightforward enough without it. |

### Why Keep Native EventSource

The decision to stay with native `EventSource` rather than `@microsoft/fetch-event-source` is based on:

1. **Last-Event-ID is automatic**: Per the HTML spec, native EventSource sends `Last-Event-ID` header on every reconnection attempt. No custom code needed.
2. **Visibility reconnect already done**: Phase 1 added `visibilitychange` handler in `useResourceSSE`.
3. **No POST/custom headers needed**: Our SSE endpoint uses GET with cookie auth (`withCredentials: true`).
4. **Proven pattern exists**: `useMetricsSSE` already implements exponential backoff with native EventSource. The pattern is 30 lines.
5. **Zero dependency cost**: Native API, no bundle impact.

The only limitation of native `EventSource` is that its built-in reconnect uses a fixed ~3s delay (or server-specified `retry:` field) with no exponential backoff. The solution: close the EventSource on error and manage reconnection ourselves (exactly what `useMetricsSSE` does).

## Architecture Patterns

### Recommended Changes (by layer)

```
BACKEND (resource-stream.ts)
├── Add monotonic event ID counter (per SSE connection, not per cluster)
├── Add `id:` field to every `event: watch` message
├── Add ring buffer (100 events per connection)
├── On reconnect: check `Last-Event-ID` header
│   ├── Found in buffer → replay missed events
│   └── Not found / overflow → send full snapshot (existing behavior)
└── No changes to WatchManager or EventEmitter

FRONTEND (useResourceSSE.ts)
├── Replace native EventSource auto-reconnect with custom backoff
│   ├── On error: close EventSource, schedule reconnect with backoff
│   ├── On open: reset backoff delay
│   └── Use constants from @voyager/config/sse
├── Add 1-second event buffer
│   ├── Push watch events to buffer array
│   ├── setTimeout(flush, 1000) on first event
│   └── flush() calls applyEvents() on Zustand store
├── Add heartbeat timeout monitor
│   ├── Reset timer on any SSE data (heartbeat, watch, snapshot, status)
│   ├── Timeout at 45s (1.5x server heartbeat of 30s)
│   └── On timeout: close EventSource, trigger reconnect
└── Keep visibility-change handler (Phase 1)

FRONTEND (resource-store.ts)
├── Add applyEvents(clusterId, events[]) method
│   ├── Apply all ADDED/MODIFIED/DELETED in one pass
│   └── Single new Map() + single set() call
└── Existing setResources/applyEvent/clearCluster unchanged
```

### Pattern 1: Custom Reconnect Wrapper (adapted from useMetricsSSE)

**What:** Close native EventSource on error, manage reconnection with exponential backoff.
**When:** Every SSE error event.
**Why:** Native EventSource reconnects at fixed ~3s. We need exponential backoff (1s -> 2s -> 4s -> 8s -> 16s -> 30s cap) to avoid hammering a recovering server.

```typescript
// In useResourceSSE
const reconnectDelayRef = useRef(SSE_INITIAL_RECONNECT_DELAY_MS)
const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

function scheduleReconnect() {
  const delay = reconnectDelayRef.current
  reconnectDelayRef.current = Math.min(
    delay * SSE_RECONNECT_BACKOFF_MULTIPLIER,
    SSE_MAX_RECONNECT_DELAY_MS,
  )
  reconnectTimeoutRef.current = setTimeout(connect, delay)
}

// On error: close EventSource to prevent native auto-reconnect, use our backoff
es.onerror = () => {
  es.close() // Prevent native reconnect
  setConnectionState(clusterId, 'reconnecting')
  scheduleReconnect()
}

// On open: reset backoff
es.onopen = () => {
  reconnectDelayRef.current = SSE_INITIAL_RECONNECT_DELAY_MS
  setConnectionState(clusterId, 'connected')
}
```

**Source:** Adapted from existing `useMetricsSSE.ts` lines 97-109 (already proven in production).

### Pattern 2: Server-Side Event ID + Ring Buffer

**What:** Assign monotonic integer IDs to each SSE event. Maintain ring buffer per connection for replay.
**When:** Every `event: watch` message sent to a client.
**Why:** Enables lossless reconnection via native `Last-Event-ID` header.

```typescript
// In resource-stream.ts handleResourceStream()
let eventCounter = 0
const replayBuffer: Array<{ id: number; raw: string }> = []

// Modified event writer
function writeWatchEvent(payload: WatchEventBatch): void {
  eventCounter++
  const raw = `event: watch\nid: ${eventCounter}\ndata: ${JSON.stringify(payload)}\n\n`

  replayBuffer.push({ id: eventCounter, raw })
  if (replayBuffer.length > SSE_EVENT_BUFFER_SIZE) replayBuffer.shift()

  try { reply.raw.write(raw) } catch { /* closed */ }
}

// On new connection: check Last-Event-ID
const lastEventId = Number(request.headers['last-event-id'])
if (lastEventId && !Number.isNaN(lastEventId)) {
  const startIdx = replayBuffer.findIndex(e => e.id > lastEventId)
  if (startIdx >= 0) {
    // Replay missed events
    for (let i = startIdx; i < replayBuffer.length; i++) {
      try { reply.raw.write(replayBuffer[i].raw) } catch { break }
    }
  } else {
    // Buffer overflowed -- fall back to full snapshot
    sendSnapshot()
  }
} else {
  sendSnapshot()
}
```

**Critical detail:** The event ID is per-connection, not per-cluster. When multiple SSE connections exist for the same cluster, each has its own counter and buffer. This is correct because the `Last-Event-ID` header is connection-specific.

**Correction to ARCHITECTURE.md:** The research doc said "per-cluster" event IDs, but the correct design is per-connection. Each browser tab has its own EventSource, its own event stream, and its own replay buffer on the server side.

### Pattern 3: Client-Side 1-Second Event Buffer (Rancher Pattern)

**What:** Accumulate incoming `watch` events for 1 second, then flush to Zustand in a single batch.
**When:** During active event delivery (burst or steady-state).
**Why:** Rolling update producing 50+ pod MODIFIED events in 5 seconds triggers 50+ `set()` calls, each creating a new Map and a React re-render. With 1s buffer: 5 flushes instead of 50+.

```typescript
// In useResourceSSE
const bufferRef = useRef<WatchEvent[]>([])
const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

function flushBuffer() {
  const events = bufferRef.current
  bufferRef.current = []
  flushTimerRef.current = null
  if (events.length === 0) return

  const { applyEvents } = useResourceStore.getState()
  applyEvents(clusterId!, events)
}

// In watch event listener:
es.addEventListener('watch', (e: MessageEvent) => {
  const batch: WatchEventBatch = JSON.parse(e.data)
  bufferRef.current.push(...batch.events)
  if (!flushTimerRef.current) {
    flushTimerRef.current = setTimeout(flushBuffer, 1000)
  }
})
```

**Source:** Rancher Dashboard's `subscribe.js` uses identical `setTimeout(state.flushQueue, 1000)` pattern.

### Pattern 4: Client-Side Heartbeat Monitor

**What:** Track last SSE data receipt time. If nothing arrives in 45 seconds, close and reconnect.
**When:** Runs while SSE is connected.
**Why:** Catches three failure modes: (1) server process died without TCP FIN, (2) proxy/load balancer silently dropped the connection, (3) all informers stopped emitting but server process is alive.

```typescript
// In useResourceSSE
const lastDataRef = useRef(Date.now())
const heartbeatCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)

const SSE_CLIENT_HEARTBEAT_TIMEOUT_MS = 45_000 // 1.5x server interval

// Reset on ANY data receipt (heartbeat, watch, snapshot, status)
// Note: EventSource does NOT fire events for SSE comments like `:heartbeat`
// So we need to use the raw event handler or check readyState

// Better approach: the server heartbeat is a comment (`:heartbeat\n\n`).
// Native EventSource does NOT expose comments to JavaScript.
// Solution: send heartbeat as a named event instead of a comment.
```

**Important finding:** Native `EventSource` does NOT surface SSE comments (`:heartbeat\n\n`) to JavaScript event listeners. The server currently sends heartbeats as SSE comments, which keep the TCP connection alive but are invisible to client-side JavaScript. To monitor heartbeat on the client, the server must send heartbeats as a named event (`event: heartbeat\ndata: \n\n`) instead of a comment.

### Pattern 5: Zustand Batch Apply

**What:** New `applyEvents()` method that processes multiple events in a single state update.
**When:** Called by the 1-second buffer flush.
**Why:** Single `new Map()` copy + single `set()` call regardless of event count.

```typescript
// In resource-store.ts
applyEvents: (clusterId, events) =>
  set((state) => {
    const next = new Map(state.resources)

    for (const event of events) {
      const key = `${clusterId}:${event.resourceType}`
      const current = next.get(key)
      if (!current) continue

      const obj = event.object as { name: string; namespace?: string | null }

      switch (event.type) {
        case 'ADDED': {
          const idx = current.findIndex((item) => {
            const i = item as { name: string; namespace?: string | null }
            return i.name === obj.name && i.namespace === obj.namespace
          })
          if (idx >= 0) {
            const updated = [...current]
            updated[idx] = event.object
            next.set(key, updated)
          } else {
            next.set(key, [...current, event.object])
          }
          break
        }
        case 'MODIFIED': {
          next.set(key, current.map((item) => {
            const i = item as { name: string; namespace?: string | null }
            return i.name === obj.name && i.namespace === obj.namespace ? event.object : item
          }))
          break
        }
        case 'DELETED': {
          next.set(key, current.filter((item) => {
            const i = item as { name: string; namespace?: string | null }
            return !(i.name === obj.name && i.namespace === obj.namespace)
          }))
          break
        }
      }
    }

    return { resources: next }
  }),
```

### Anti-Patterns to Avoid

- **Clearing Zustand store on reconnect (D-01 violation):** Never call `clearCluster()` during reconnect. Keep stale data visible. The `Last-Event-ID` replay or fresh snapshot will update the data without visible flash.
- **Toast on every reconnect (D-02 violation):** No toast for successful reconnection. Badge transitions silently. Only consider toast for extended outage (>60s).
- **rAF for event batching:** `requestAnimationFrame` fires at 60fps. During a burst of 50 events in 5 seconds, rAF would flush 300 times. We want 5 flushes (1 per second). Use `setTimeout(fn, 1000)`.
- **Reducing informer heartbeat timeout to 30s (D-06 violation):** Keep 90s. Many resource types (namespaces, nodes, configmaps) are naturally quiet for minutes. 30s would cause false-positive restarts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential backoff | Custom delay calculation | Copy from `useMetricsSSE` (lines 97-109) | Already proven, uses shared config constants |
| SSE event parsing | Custom text/event-stream parser | Native `EventSource` | Built-in, handles all edge cases, auto-sends `Last-Event-ID` |
| Connection state management | Custom state machine | Existing `ConnectionStatusBadge` + `connectionState` in Zustand | Already renders connected/reconnecting/disconnected/initializing |
| Ring buffer data structure | Linked list or custom buffer | Array with `push()` + length check + `shift()` | Simple, O(1) for 100-element buffer |

## Common Pitfalls

### Pitfall 1: EventSource Comments Are Invisible to JavaScript

**What goes wrong:** Server sends `:heartbeat\n\n` (SSE comment). Developer writes client code expecting to receive this in an event listener. Nothing fires. Client-side heartbeat monitor never resets.
**Why it happens:** Per the SSE spec, lines starting with `:` are comments -- they keep the connection alive but are NOT dispatched as events.
**How to avoid:** Change server heartbeat from comment (`:heartbeat\n\n`) to named event (`event: heartbeat\ndata: \n\n`). Client registers `es.addEventListener('heartbeat', resetTimer)`.
**Warning signs:** Heartbeat timeout fires while connection is actually alive and data is flowing.

### Pitfall 2: Event ID Must Be Monotonic Per Connection, Not Per Cluster

**What goes wrong:** Event IDs are shared across SSE connections for the same cluster. Two browser tabs see interleaved IDs. On reconnect, `Last-Event-ID` references events from the other tab's stream.
**Why it happens:** Counter/buffer stored at cluster level instead of per-connection.
**How to avoid:** Declare counter and buffer inside the `handleResourceStream()` function (per-connection scope).
**Warning signs:** Replay delivers wrong events or misses events after reconnect with multiple tabs open.

### Pitfall 3: Native EventSource Auto-Reconnect Conflicts with Custom Backoff

**What goes wrong:** Developer adds custom reconnect logic but doesn't `close()` the EventSource on error. Both native auto-reconnect (~3s) and custom backoff fire simultaneously, creating duplicate connections.
**Why it happens:** Native `EventSource` auto-reconnects when `readyState` transitions to `CONNECTING` after error. Custom code also schedules a `setTimeout(connect, delay)`.
**How to avoid:** In the `onerror` handler, immediately call `es.close()` to prevent native auto-reconnect. Then schedule custom reconnect. This is what `useMetricsSSE` already does.
**Warning signs:** Multiple SSE connections to the same cluster from one tab. Server logs show doubled subscription counts.

### Pitfall 4: Buffer Flush After Component Unmount

**What goes wrong:** Component unmounts (user navigates away from cluster). The 1-second buffer timer fires after unmount, calling `applyEvents()` for a cluster that was already cleared.
**Why it happens:** `setTimeout` doesn't auto-cancel on React effect cleanup.
**How to avoid:** In the effect cleanup function, clear the flush timer: `if (flushTimerRef.current) clearTimeout(flushTimerRef.current)`. Flush any remaining buffered events before clearing to avoid data loss.
**Warning signs:** Console warnings about state updates on unmounted components (React 18+). Stale data appearing for a previously-viewed cluster.

### Pitfall 5: Snapshot After Replay Causes Duplicate Data

**What goes wrong:** Server sends replayed events, then also sends a full snapshot. The snapshot overwrites the replayed data, but the two may be from different points in time (snapshot is newer), causing a brief inconsistency.
**Why it happens:** Server always sends snapshot on connect, regardless of whether replay succeeded.
**How to avoid:** If replay succeeds (events found in buffer), skip the snapshot phase. Only send snapshot when replay cannot cover the gap (buffer overflow or no `Last-Event-ID`).
**Warning signs:** Brief data flicker on reconnect even when the gap was small (replay should have been sufficient).

### Pitfall 6: Reconnect During Server Restart Gets Stale Snapshot

**What goes wrong:** Server restarts (deploy). Client reconnects. Server's informers haven't finished their initial LIST yet, so `getResources()` returns `null` for most types. Snapshot is empty or partial.
**Why it happens:** WatchManager marks a resource type as `ready` only after the informer's `connect` event (initial LIST complete). Before that, `getResources()` returns `null`.
**How to avoid:** On the client side, if the new snapshot has fewer items than the currently-displayed data, keep the old data and wait for the next snapshot or watch event to update. On the server side, the `ready` set already prevents sending empty snapshots -- null means "don't send snapshot for this type."
**Warning signs:** After API restart, some resource tabs show empty for 5-10 seconds until informers catch up.

## Code Examples

### Complete useResourceSSE Reconnect + Buffer Pattern

Verified combination of patterns from `useMetricsSSE` (reconnect) and Rancher (buffer):

```typescript
// Source: useMetricsSSE.ts (reconnect), Rancher subscribe.js (buffer)
const reconnectDelayRef = useRef(SSE_INITIAL_RECONNECT_DELAY_MS)
const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const bufferRef = useRef<WatchEvent[]>([])
const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const lastDataRef = useRef(Date.now())
const heartbeatCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)

const CLIENT_HEARTBEAT_TIMEOUT_MS = 45_000

function flushBuffer() {
  const events = bufferRef.current
  bufferRef.current = []
  flushTimerRef.current = null
  if (events.length > 0) {
    useResourceStore.getState().applyEvents(clusterId!, events)
  }
}

function connect() {
  // Close existing
  closeConnection()

  setConnectionState(clusterId!, 'reconnecting')
  const es = new EventSource(url, { withCredentials: true })
  eventSourceRef.current = es

  es.onopen = () => {
    reconnectDelayRef.current = SSE_INITIAL_RECONNECT_DELAY_MS
    setConnectionState(clusterId!, 'connected')
    lastDataRef.current = Date.now()
    startHeartbeatMonitor()
  }

  wireHandlers(es) // snapshot, watch (with buffer), status, heartbeat

  es.onerror = () => {
    es.close() // Prevent native auto-reconnect
    stopHeartbeatMonitor()
    setConnectionState(clusterId!, 'reconnecting')
    // Do NOT clear data (D-01: keep stale data visible)
    scheduleReconnect()
  }
}

function scheduleReconnect() {
  const delay = reconnectDelayRef.current
  reconnectDelayRef.current = Math.min(
    delay * SSE_RECONNECT_BACKOFF_MULTIPLIER,
    SSE_MAX_RECONNECT_DELAY_MS,
  )
  reconnectTimeoutRef.current = setTimeout(connect, delay)
}

function startHeartbeatMonitor() {
  stopHeartbeatMonitor()
  heartbeatCheckRef.current = setInterval(() => {
    if (Date.now() - lastDataRef.current > CLIENT_HEARTBEAT_TIMEOUT_MS) {
      // Connection appears dead -- force reconnect
      const current = eventSourceRef.current
      if (current) current.close()
      stopHeartbeatMonitor()
      setConnectionState(clusterId!, 'reconnecting')
      scheduleReconnect()
    }
  }, 10_000) // Check every 10s
}
```

### Server-Side Heartbeat Event (Replace Comment with Named Event)

```typescript
// Before (invisible to client JavaScript):
reply.raw.write(':heartbeat\n\n')

// After (client can listen for 'heartbeat' event):
reply.raw.write('event: heartbeat\ndata: \n\n')
```

### Server-Side Last-Event-ID Check on Connect

```typescript
// Source: HTML SSE spec + Voyager resource-stream.ts
const lastEventIdHeader = request.headers['last-event-id']
const lastEventId = lastEventIdHeader ? Number(lastEventIdHeader) : NaN

if (!Number.isNaN(lastEventId) && lastEventId > 0) {
  // Try replay from buffer
  const startIdx = replayBuffer.findIndex(e => e.id > lastEventId)
  if (startIdx >= 0) {
    // Replay missed events -- no snapshot needed
    for (let i = startIdx; i < replayBuffer.length; i++) {
      try { reply.raw.write(replayBuffer[i].raw) } catch { return }
    }
    // Resume live event delivery (skip snapshot)
    return
  }
}

// No Last-Event-ID, or buffer overflowed -- send full snapshot
for (const def of RESOURCE_DEFS) {
  const resources = watchManager.getResources(clusterId, def.type)
  if (resources && resources.length > 0) {
    const mapped = resources.map(obj => def.mapper(obj, clusterId))
    eventCounter++
    const raw = `event: snapshot\nid: ${eventCounter}\ndata: ${JSON.stringify({ resourceType: def.type, items: mapped })}\n\n`
    replayBuffer.push({ id: eventCounter, raw })
    if (replayBuffer.length > SSE_EVENT_BUFFER_SIZE) replayBuffer.shift()
    try { reply.raw.write(raw) } catch { return }
  }
}
```

## Discretion Recommendations

Based on research evidence, here are recommendations for areas marked as Claude's discretion:

### D-03: Data Recovery Approach -- Recommend Event-ID Replay with Snapshot Fallback

**Recommendation:** Implement event-ID replay (CONN-01), with automatic fallback to full snapshot when the ring buffer has been exceeded.

**Rationale:**
- Short disconnects (network blip < 30s): Ring buffer of 100 events covers typical gaps. At normal steady-state (~1 event/second per cluster), 100 events covers ~100 seconds.
- Long disconnects or server restart: Buffer is empty, falls back to existing snapshot behavior.
- Zero visible flash: During short disconnects, replay delivers only the delta. No full array replacement = no re-render of unchanged items.
- Snapshot-only would cause Pitfall 11 (flash on reconnect) every time, even for 2-second blips.
- Native EventSource sends `Last-Event-ID` automatically -- zero client-side work for the header.

### D-04: Burst Batching Strategy -- Recommend 1-Second setTimeout Buffer

**Recommendation:** 1-second `setTimeout` buffer, same as Rancher Dashboard.

**Rationale:**
- Rancher uses exactly this pattern (verified in `subscribe.js`) for the same use case (K8s watch events in a dashboard).
- 1 second is the sweet spot: users perceive updates within 1s as "instant" but the UI avoids 50+ re-renders during rolling updates.
- `requestAnimationFrame` is wrong for this: fires at 60fps, which would create 60 flushes/second during bursts instead of 1.
- Zustand bulk merge alone (without buffering) doesn't help -- each `applyEvent()` is still a separate `set()` call.
- The buffer + batch flush combination (PERF-01 + PERF-02) is the correct pairing.

### D-05: Client-Side Heartbeat Detection -- Recommend Yes, With Named Event

**Recommendation:** Add client-side heartbeat monitoring. Change server heartbeat from SSE comment to named event.

**Rationale:**
- Server-side informer heartbeat (90s, D-06) detects informer death. But it does NOT detect: (1) SSE connection silently dropped by proxy, (2) server process crash without TCP FIN, (3) OS-level network interface change.
- Client-side heartbeat timeout at 45s (1.5x server heartbeat interval of 30s) covers these failure modes.
- Critical implementation detail: native EventSource does NOT expose SSE comments to JavaScript. The current `:heartbeat\n\n` comment is invisible to client code. Must change to `event: heartbeat\ndata: \n\n` for client monitoring.
- Alternative: track `lastDataRef` time in ALL event handlers (snapshot, watch, status) and only use heartbeat as a fallback signal. This avoids the comment-vs-event issue for data-heavy connections but still needs the named heartbeat for quiet periods.

### Native EventSource vs Fetch-Based -- Recommend Keep Native

**Recommendation:** Keep native `EventSource`. Do not add `@microsoft/fetch-event-source`.

**Rationale:** See "Why Keep Native EventSource" section above. The `useMetricsSSE` hook already proves the pattern works: close on error, manage backoff ourselves, reset on open. Adding a dependency for features we already have (visibility reconnect, backoff) is unnecessary.

### Exponential Backoff Parameters -- Recommend Use Existing Config

**Recommendation:** Use constants already defined in `packages/config/src/sse.ts`:
- Initial delay: 1,000ms (`SSE_INITIAL_RECONNECT_DELAY_MS`)
- Multiplier: 2 (`SSE_RECONNECT_BACKOFF_MULTIPLIER`)
- Max delay: 30,000ms (`SSE_MAX_RECONNECT_DELAY_MS`)
- Max attempts: 0/infinite (`SSE_MAX_RECONNECT_ATTEMPTS`)

These are already defined and used by the server-side WatchManager. Using them on the client ensures consistency.

### Extended Outage Toast -- Recommend No Toast

**Recommendation:** Do not add toast for extended outages. The `ConnectionStatusBadge` already communicates the state.

**Rationale:** D-02 says silent reconnect. A toast would draw attention to infrastructure issues the user can't fix. The badge shows "Reconnecting..." with a pulsing amber dot -- that's sufficient. If the user wants more detail, they'll see it in the badge.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@microsoft/fetch-event-source` (complex) | Native EventSource + custom wrapper | 2024-2025 ecosystem shift | Most K8s dashboards (Lens, Headlamp) use native EventSource with custom reconnect logic rather than fetch-based SSE libraries |
| Per-event Zustand updates | Batched event buffer + bulk flush | Rancher since 2022 | Required for dashboards with high event throughput; prevents UI jank |
| SSE comments for heartbeat | Named heartbeat events | N/A (implementation choice) | Comments keep connection alive but are invisible to JS; named events enable client-side monitoring |
| Full snapshot on every reconnect | Event-ID replay with snapshot fallback | Standard SSE pattern | Eliminates flash-of-empty-state on short disconnects |

## Project Constraints (from CLAUDE.md)

Directives that affect Phase 2 implementation:

- **ESM imports:** All packages are ESM -- use `.js` extensions in imports even for `.ts` files
- **`@voyager/config` for constants:** No hardcoded values in routers/hooks. Add any new SSE constants to `packages/config/src/sse.ts`.
- **Biome code style:** 2-space indent, 100-char line width, single quotes, semicolons as-needed
- **E2E gate: 0 failures** -- all existing E2E tests must pass after changes
- **QA gate: 8.5+/10** -- functional QA required for phase gate
- **NEVER add `migrate()` to server.ts** -- schema changes go through `charts/voyager/sql/init.sql`
- **E2E: always use BASE_URL** -- never hardcode localhost
- **No `refetchInterval` on SSE-fed types** -- enforced in Phase 1, must not regress

## Open Questions

1. **Ring buffer scope for multi-tab scenarios**
   - What we know: Event IDs and ring buffer are per-connection (inside `handleResourceStream`). Each tab gets its own stream.
   - What's unclear: If a user has 3 tabs open to the same cluster and one tab reconnects, its `Last-Event-ID` correctly references its own stream. No cross-talk.
   - Recommendation: Per-connection scope is correct. No issue here -- just documenting for planner awareness.

2. **Buffer size tuning**
   - What we know: `SSE_EVENT_BUFFER_SIZE = 100` is already defined. At 1 event/second, covers ~100s of disconnect.
   - What's unclear: During burst events (rolling update), 50 events in 5 seconds means the buffer fills faster. A 30-second disconnect during a rolling update could exceed 100 events.
   - Recommendation: Keep 100 for now. If buffer overflow happens, the fallback (full snapshot) is correct behavior. Can tune later based on production metrics.

3. **Snapshot de-duplication on reconnect**
   - What we know: If replay covers the gap, we skip the snapshot. If it doesn't, we send a full snapshot.
   - What's unclear: Should the client compare incoming snapshot data with existing Zustand data to avoid unnecessary re-renders?
   - Recommendation: Not in Phase 2. The snapshot replaces the array reference regardless (existing behavior). Optimization would add complexity for a case that rarely triggers (only on replay buffer overflow). Defer to Phase 3 if needed.

## Sources

### Primary (HIGH confidence)
- [HTML SSE Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html) - Event ID field, Last-Event-ID header, reconnection algorithm
- [MDN EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) - Browser API behavior, readyState values
- Existing codebase files (read directly): `resource-stream.ts`, `watch-manager.ts`, `useResourceSSE.ts`, `useMetricsSSE.ts`, `resource-store.ts`, `sse.ts` config

### Secondary (MEDIUM confidence)
- [Rancher Dashboard subscribe.js](https://github.com/rancher/dashboard/blob/master/shell/plugins/steve/subscribe.js) - 1-second event buffer pattern, verified via WebFetch
- [@microsoft/fetch-event-source](https://github.com/Azure/fetch-event-source) - Evaluated and rejected (see "Alternatives Considered")
- [reconnecting-eventsource](https://github.com/fanout/reconnecting-eventsource) - Evaluated and rejected

### Tertiary (LOW confidence)
- None -- all findings verified against specs or codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, all patterns proven in existing codebase
- Architecture: HIGH - Direct adaptation of proven `useMetricsSSE` pattern + Rancher buffering pattern
- Pitfalls: HIGH - SSE comment invisibility verified against HTML spec; per-connection scope verified against EventSource behavior
- Discretion recommendations: HIGH - All based on spec behavior and existing codebase patterns

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable domain, SSE spec doesn't change frequently)
