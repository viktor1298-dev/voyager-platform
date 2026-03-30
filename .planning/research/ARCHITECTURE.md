# Architecture Patterns: Live K8s Data Pipeline

**Domain:** Real-time K8s operations dashboard
**Researched:** 2026-03-30

## Recommended Architecture

The existing 3-layer architecture is correct and matches production K8s dashboards:

```
Layer 1: K8s Watch API
  @kubernetes/client-node makeInformer()
  ObjectCache (in-memory) per resource type per cluster
  15 resource types, expandable to 24+
         |
         | informer events (add/update/delete)
         v
Layer 2: SSE Transport
  VoyagerEventEmitter (Node.js EventEmitter)
  -> resource-stream.ts (SSE endpoint)
  -> assigns event IDs (monotonic, per-cluster)
  -> ring buffer (100 events) for replay
  -> heartbeat every 30s
         |
         | EventSource (browser native)
         v
Layer 3: Client State
  useResourceSSE hook (single per cluster layout)
  -> 1-second event buffer
  -> batch flush to Zustand resource-store
  -> components read via selectors
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `WatchManager` | Per-cluster informer lifecycle (start/stop/reconnect) | `ClusterClientPool`, `VoyagerEventEmitter` |
| `VoyagerEventEmitter` | Pub/sub bridge: decouple informers from SSE | `WatchManager` (publisher), `resource-stream.ts` (subscriber) |
| `resource-stream.ts` | SSE endpoint: auth, connection limits, event writing, heartbeat | `VoyagerEventEmitter`, browser `EventSource` |
| `useResourceSSE` | Client-side SSE subscription + event buffering | `EventSource`, `resource-store` (Zustand) |
| `resource-store` | Client-side live K8s resource cache (ADDED/MODIFIED/DELETED) | `useResourceSSE` (writer), components (readers via selectors) |

### Data Flow (Fixed Pipeline)

**On connect:**
1. Browser creates `EventSource` to `/api/resources/stream?clusterId=X`
2. Server authenticates (Better-Auth cookie), validates cluster exists
3. Server checks connection limits (per-cluster + global)
4. Server calls `watchManager.subscribe(clusterId)` (starts informers if first subscriber)
5. Server sends `:connected` comment (flushes headers to proxy)
6. Server iterates all 15 resource types, sends `event: snapshot` with full ObjectCache
7. Server registers `watch-event:{clusterId}` listener for incremental updates
8. Server starts heartbeat interval (30s)

**On K8s change:**
1. Informer fires `add`/`update`/`delete` handler
2. `resource-mappers.ts` transforms raw K8s object to frontend shape
3. `voyagerEmitter.emitWatchEvent(clusterId, event)` publishes
4. SSE route listener writes `event: watch\nid: {monotonic-id}\ndata: {json}\n\n`
5. Browser `EventSource` fires `watch` event listener
6. `useResourceSSE` pushes event to 1-second buffer
7. Buffer flushes every 1s via `setTimeout` or `requestAnimationFrame`
8. Batch of events applied to Zustand store in single `set()` call
9. Components re-render via Zustand selectors (only affected resource types)

**On disconnect:**
1. Browser `EventSource` fires `onerror`
2. Connection state set to `reconnecting` in Zustand
3. `EventSource` auto-reconnects (native behavior) with `Last-Event-ID` header
4. Server receives reconnection, checks `Last-Event-ID`
5. If events in replay buffer: replay missed events, then resume live
6. If buffer overflowed: send fresh snapshot (full sync)

**On cluster navigation away:**
1. React effect cleanup: `es.close()`
2. Server `request.raw.on('close')` fires cleanup
3. `watchManager.unsubscribe(clusterId)` decrements ref count
4. If last subscriber: stop all informers for that cluster

## Patterns to Follow

### Pattern 1: Rancher-Style 1-Second Client Buffer

**What:** Buffer all incoming SSE `watch` events for 1 second, then flush to store in a single batch.
**When:** Always, for all resource types.
**Why:** Prevents 50+ React re-renders during burst events (e.g., scaling a deployment).

```typescript
// In useResourceSSE hook
const bufferRef = useRef<WatchEvent[]>([])
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

const flushBuffer = useCallback(() => {
  const events = bufferRef.current
  bufferRef.current = []
  timerRef.current = null
  if (events.length === 0) return

  const { applyEvents } = useResourceStore.getState()
  applyEvents(clusterId, events) // Single Zustand set() for all events
}, [clusterId])

// In watch event listener:
bufferRef.current.push(event)
if (!timerRef.current) {
  timerRef.current = setTimeout(flushBuffer, 1000)
}
```

### Pattern 2: SSE Event ID Tracking

**What:** Assign monotonic IDs to each SSE event. Maintain a per-cluster ring buffer of recent events.
**When:** All `watch` and `snapshot` events.
**Why:** Enables Last-Event-ID replay on reconnection.

```typescript
// Server-side (resource-stream.ts)
const eventCounters = new Map<string, number>()
const eventBuffers = new Map<string, Array<{ id: number; data: string }>>()

function writeEvent(clusterId: string, eventType: string, data: string): void {
  const counter = (eventCounters.get(clusterId) ?? 0) + 1
  eventCounters.set(clusterId, counter)

  // Ring buffer
  const buffer = eventBuffers.get(clusterId) ?? []
  buffer.push({ id: counter, data: `event: ${eventType}\nid: ${counter}\ndata: ${data}\n\n` })
  if (buffer.length > SSE_EVENT_BUFFER_SIZE) buffer.shift()
  eventBuffers.set(clusterId, buffer)

  reply.raw.write(`event: ${eventType}\nid: ${counter}\ndata: ${data}\n\n`)
}
```

### Pattern 3: Informer Heartbeat Timeout

**What:** Timer per informer that resets on each event. If timer expires, force-restart the informer.
**When:** After informer `connect` event.
**Why:** Catches silent disconnects where the TCP connection stays "open" but no data arrives.

```typescript
// In WatchManager, per informer
const heartbeatTimers = new Map<string, NodeJS.Timeout>()

function resetHeartbeat(key: string, informer: k8s.Informer): void {
  const existing = heartbeatTimers.get(key)
  if (existing) clearTimeout(existing)
  heartbeatTimers.set(key, setTimeout(() => {
    console.warn(`[WatchManager] Heartbeat timeout for ${key}, restarting informer`)
    informer.stop()
    informer.start()
  }, WATCH_HEARTBEAT_TIMEOUT_MS))
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Dual Data Sources for Live Resources

**What:** Using both Zustand (SSE-fed) and TanStack Query (poll-fed) for the same resource type.
**Why bad:** TanStack Query's `refetchInterval` overwrites SSE data with stale poll responses. Creates flickering UI and defeats the purpose of live streaming.
**Instead:** Components consuming live K8s data MUST read exclusively from `useClusterResources()` (Zustand selector). TanStack Query is for initial fetch only (before SSE connects) and for data that's never streamed (DB-backed entities like users, teams, alerts).

### Anti-Pattern 2: Snapshot on Every Reconnect Without Last-Event-ID

**What:** Sending the full ObjectCache snapshot every time the browser reconnects.
**Why bad:** Causes a visible "flash" as the entire resource list is replaced. On large clusters (5000+ pods), snapshot serialization takes 100ms+ and causes UI jank.
**Instead:** Use event IDs + replay buffer. Only fall back to full snapshot when the replay buffer has been overflowed.

### Anti-Pattern 3: Unbatched Event Application to Zustand

**What:** Calling `applyEvent()` in Zustand for each individual SSE event as it arrives.
**Why bad:** Each `set()` creates a new `Map` reference, triggering React re-renders. 50 events = 50 renders.
**Instead:** Buffer events for 1 second, then apply all in a single `set()` call. This is the Rancher pattern.

### Anti-Pattern 4: Blocking Informer Error Handler

**What:** Doing synchronous work (logging, DB writes) in the informer error handler.
**Why bad:** Delays reconnection. The error handler should schedule reconnection and return immediately.
**Instead:** Log asynchronously, schedule reconnection via `setTimeout`, return.

## Scalability Considerations

| Concern | At 5 clusters | At 30 clusters | At 100+ clusters |
|---------|---------------|----------------|-------------------|
| Informer connections | 75 (15 per cluster) | Limit to 20 active clusters, 300 max | Per-cluster on-demand only; LRU eviction |
| Memory (ObjectCache) | ~10MB per cluster | ~300MB with 20 active | Need resource filtering or paging |
| SSE connections | 1 per browser tab per cluster | 50 global limit (configured) | Add per-user limits |
| Event throughput | Low (~1/s per cluster) | Moderate (~30/s total) | Need server-side batching at >100/s |
| Snapshot size | <100KB | <100KB per cluster | Chunked snapshots for 10K+ resources |

---

*Architecture research: 2026-03-30*
