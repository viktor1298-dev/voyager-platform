# Domain Pitfalls: Live K8s Data Pipeline

**Domain:** Real-time K8s web dashboard (SSE + K8s Watch + React/Zustand)
**Researched:** 2026-03-30

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or make the live pipeline non-functional.

### Pitfall 1: TanStack Query Polling Overwrites SSE Data

**What goes wrong:** Components use both `useQuery()` with `refetchInterval` AND Zustand resource store (fed by SSE) for the same K8s resources. The poll response overwrites fresh SSE data with stale server data, creating flickering and defeating live updates.

**Why it happens:** During development, polling was added as a "safety net" before SSE was fully working. Both data sources feed the same UI, creating a race condition.

**Consequences:** Users see data "updating" on a 10-30s polling interval instead of live. SSE events arrive but get immediately overwritten by the next poll cycle. This is the most likely root cause of the PROJECT.md symptom: "data only updates when the page is refreshed or on a ~10s interval that looks like polling."

**Prevention:** Strict separation of data sources:
- **Zustand resource store** (SSE-fed): ALL live K8s resource data (pods, deployments, services, etc.)
- **TanStack Query** (tRPC): ONLY for DB-backed data (users, teams, alerts, audit logs) and initial fetch before SSE connects
- Components must never have `refetchInterval` on queries that are also streamed via SSE

**Detection:** Search for `refetchInterval` in components that display K8s resources. Any match is a bug.

### Pitfall 2: @kubernetes/client-node Informer Silent Stop

**What goes wrong:** Informer stops receiving events but doesn't fire an error. The SSE stream sends heartbeats (so browser stays connected) but no resource updates arrive. Dashboard appears "frozen."

**Why it happens:** Three known bugs in `@kubernetes/client-node`:
1. **ListWatch reconnection bug (#2385):** `doneHandler()` returns early for non-410 errors, preventing reconnection
2. **TCP silent disconnect (#559):** Network severs without FIN/RST; stream believes it's open but receives nothing
3. **Double callback (#2387):** `doneCallOnce` fires twice, causing two reconnection attempts

**Consequences:** All live data for one or more resource types silently stops. Users see stale data without any error indicator. Only a page refresh (which re-subscribes and gets a fresh snapshot) fixes it.

**Prevention:**
- **Heartbeat timeout** (`WATCH_HEARTBEAT_TIMEOUT_MS = 90_000`): Timer per informer, reset on each event. If timer expires with no events, force-restart. Already configured but NOT implemented.
- **Error handler restart** (`handleInformerError`): Already implemented. Call `informer.start()` after backoff delay.
- Monitor `watch-status` events for `reconnecting` state that doesn't resolve to `connected` within 2 minutes.

**Detection:** If a resource type stops updating while the SSE connection is still alive (heartbeats coming through), an informer has silently stopped. Log `[WatchManager] Informer error` messages indicate reconnection attempts.

### Pitfall 3: Resource Version Mismatch on Re-subscription

**What goes wrong:** After a watch timeout or reconnection, the system re-subscribes using the wrong `resourceVersion`, causing the K8s API server to reject the watch as "too old" (HTTP 410 Gone). This triggers rapid reconnection loops that flood the API server.

**Why it happens:** Confusion between collection-level `revision` (the `resourceVersion` returned in the list response metadata) and individual item `resourceVersion` (in each object's metadata). Rancher hit this exact bug (Dashboard #5997).

**Consequences:** K8s API server gets flooded with rapid reconnection attempts. Can cause API server rate limiting affecting ALL cluster operations, not just the dashboard.

**Prevention:** `@kubernetes/client-node`'s `makeInformer` handles `resourceVersion` tracking internally during LIST+WATCH cycles. DO NOT manually track or pass `resourceVersion` to informer functions. Let the library manage it. If implementing custom watch logic, always use the collection-level `metadata.resourceVersion` from the LIST response.

**Detection:** Watch for rapid `[WatchManager] Informer error` logs (multiple per second). Check K8s API server audit logs for 429 (Too Many Requests) responses.

### Pitfall 4: Event Emitter Listener Leak

**What goes wrong:** SSE connections register event listeners on `VoyagerEventEmitter` but fail to unregister on disconnect. Over time, each K8s watch event triggers hundreds of dead listener invocations, causing CPU spikes and memory leaks.

**Why it happens:** The `request.raw.on('close')` cleanup handler doesn't fire in some edge cases (nginx timeout, client crash without TCP FIN). The `voyagerEmitter.off()` call never executes.

**Consequences:** Gradual CPU increase. Server eventually becomes unresponsive. Memory grows until OOM.

**Prevention:**
- Set `emitter.setMaxListeners()` appropriately and log warnings when approaching the limit
- Implement a periodic cleanup sweep that checks for listeners associated with closed connections
- Use `AbortController` / `AbortSignal` pattern to tie listener lifecycle to request lifecycle
- Add metrics for active listener count per event channel

**Detection:** `MaxListenersExceededWarning` in Node.js logs. Steadily increasing memory usage over hours.

## Moderate Pitfalls

### Pitfall 5: Snapshot Serialization OOM on Large Clusters

**What goes wrong:** A cluster with 10,000+ pods, 5,000+ configmaps, and 2,000+ secrets causes the snapshot serialization to consume 500MB+ of memory. `JSON.stringify()` on the full ObjectCache is a blocking operation.

**Prevention:** Chunk snapshots into batches (100-200 items per `event: snapshot` message). Send each chunk as a separate SSE event. This also helps with backpressure -- `reply.raw.write()` can return `false` if the buffer is full.

### Pitfall 6: Zustand Map Copy on Every Event

**What goes wrong:** Each `applyEvent()` call in the Zustand store creates `new Map(state.resources)` (shallow copy of the entire resource map). With 15 resource types per cluster, the map has 15 entries. Copying it 50 times per second during burst events is wasteful.

**Prevention:** Client-side 1-second event buffer. Batch all events into a single `set()` call. Also consider using Immer middleware for Zustand to avoid manual Map copying (though this adds a dependency).

### Pitfall 7: SSE Proxy Buffering (Corporate Networks)

**What goes wrong:** Intermediate proxies (corporate firewalls, CDNs, nginx without proper config) buffer SSE responses and only forward them after the stream closes. Events arrive in bursts every 20+ minutes instead of real-time.

**Prevention:**
- `X-Accel-Buffering: no` header (already set in resource-stream.ts)
- `Cache-Control: no-cache, no-transform` (already set)
- Write initial data immediately after `writeHead()` (already done: `:connected\n\n`)
- Regular heartbeats (`:heartbeat\n\n` every 30s -- already implemented)
- If all else fails, close and reopen SSE connection every 5-10 minutes to force proxy flush

**Detection:** Events arrive in large batches with timestamps spread over minutes.

### Pitfall 8: Browser Tab Suspend Breaks EventSource

**What goes wrong:** When a browser tab is backgrounded (e.g., user switches tabs), the browser may throttle or suspend the EventSource connection. Upon returning to the tab, the connection may be dead without an error event firing.

**Prevention:**
- Use `document.visibilitychange` event to detect tab focus/blur
- On visibility change to `visible`: check `es.readyState`, if `CLOSED` then recreate the EventSource
- Clear stale data and request fresh snapshot on reconnection
- This is already partially handled by the `useMetricsSSE` hook's visibility-aware pattern

**Detection:** Data stops updating when the user returns to a backgrounded tab.

## Minor Pitfalls

### Pitfall 9: Informer API Flooding After Token Rotation

**What goes wrong:** When cluster credentials rotate (EKS 15-minute token), the informer's internal HTTP client may use expired tokens for reconnection, causing 401 errors that trigger rapid reconnect cycles.

**Prevention:** `ClusterClientPool` already handles proactive token refresh at 80% of TTL. Ensure informer errors caused by 401/403 trigger a fresh `getClient()` call before reconnecting.

### Pitfall 10: SSE Event Order Not Guaranteed Across Resource Types

**What goes wrong:** Developer assumes events arrive in K8s API order. In reality, 15 informers emit independently, and the EventEmitter delivers them in emission order, not K8s temporal order. A Pod DELETED event could arrive before the parent Deployment MODIFIED event.

**Prevention:** Design UI to be eventually consistent. Don't depend on cross-resource-type event ordering. Each resource type's array is independently consistent.

### Pitfall 11: Snapshot After Reconnect Flashes UI

**What goes wrong:** On reconnection, a full snapshot replaces the current resource arrays. If the data is identical (no changes during disconnect), the UI still re-renders because array references changed.

**Prevention:** In the snapshot handler, compare incoming data with existing data (e.g., by JSON hash or item count + latest resourceVersion). Only call `setResources()` if the data actually differs.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Fix SSE delivery | Pitfall 1 (TQ polling conflict) + Pitfall 2 (informer silent stop) | Audit all components for dual data sources; implement heartbeat timeout |
| Client event batching | Pitfall 6 (Zustand Map copy) | Buffer + single batch flush |
| SSE event IDs + replay | Pitfall 7 (proxy buffering) | Test with nginx reverse proxy |
| Expand to 24 types | Pitfall 5 (snapshot OOM) | Chunk snapshots before adding more types |
| Per-cluster watching | Pitfall 4 (listener leak) | Implement cleanup sweep |
| Dead code removal | Low risk | Standard code deletion |

## Sources

- [Rancher Dashboard #5997](https://github.com/rancher/dashboard/issues/5997) -- resourceVersion flooding
- [@kubernetes/client-node #2385](https://github.com/kubernetes-client/javascript/issues/2385) -- ListWatch reconnection
- [@kubernetes/client-node #1933](https://github.com/kubernetes-client/javascript/issues/1933) -- Informer API flooding
- [@kubernetes/client-node #559](https://github.com/kubernetes-client/javascript/issues/559) -- Silent watch disconnect
- [@kubernetes/client-node #2387](https://github.com/kubernetes-client/javascript/issues/2387) -- Double callback
- [SSE Production Pitfalls](https://dev.to/miketalbot/server-sent-events-are-still-not-production-ready-after-a-decade-a-lesson-for-me-a-warning-for-you-2gie) -- Proxy buffering
- [Rancher Steve Throttling #36682](https://github.com/rancher/rancher/issues/36682) -- Count debouncing

---

*Pitfalls research: 2026-03-30*
