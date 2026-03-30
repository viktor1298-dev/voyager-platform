# Technology Stack: Live K8s Data Pipeline

**Project:** Voyager Platform -- Live Data Pipeline
**Researched:** 2026-03-30
**Mode:** Ecosystem Research
**Overall Confidence:** HIGH

---

## Executive Summary

Production K8s web dashboards (Rancher Dashboard, Headlamp, Kubernetes Dashboard v3) all use the same fundamental pattern: **server-side K8s Watch API informers feeding a streaming transport to the browser**. The transport choice varies -- Rancher uses WebSocket, Headlamp uses WebSocket with multiplexing, Kubernetes Dashboard v3 proxies through Kong -- but the backend pattern is identical. SSE is the correct transport for Voyager Platform because the data flow is unidirectional (server-to-client) and SSE over HTTP/2 eliminates the old 6-connection browser limit.

Voyager Platform already has the right architecture. The existing stack (`@kubernetes/client-node` 1.4.0 informers, Fastify 5, SSE via `reply.raw.write()`, Zustand resource store) is production-capable. The issues are implementation bugs, not architectural problems. This research identifies what production dashboards do that Voyager doesn't yet, and what libraries/patterns to adopt.

---

## How Production K8s Dashboards Handle Live Data

### Rancher Dashboard (Steve API)

**Confidence: HIGH** (verified via GitHub issues, official extension docs, Rancher API docs)

| Aspect | Implementation |
|--------|---------------|
| **Transport** | WebSocket via `/v1/subscribe` endpoint |
| **Backend** | Steve API (Go) -- thin K8s API proxy with watch channels |
| **Connection Model** | 3 persistent WebSocket connections: `rancher` (global), `management` (Norman), `cluster` (per-cluster Steve) |
| **Event Format** | JSON messages with `name` field: `resource.create`, `resource.change`, `resource.remove` |
| **Client Buffering** | **1-second buffer**: all `resource.{create,change,remove}` events are batched and flushed once per second to update the store |
| **Server Debouncing** | Steve sends aggregated count metadata every 5 seconds (configurable) |
| **Heartbeat** | Steve pings UI every 5s; Norman pings every 30s; includes server version for upgrade detection |
| **Resource Version Tracking** | Uses **collection revision** (not individual item `resourceVersion`) for re-subscription. Bug #5997: using wrong version caused K8s API flooding |
| **Watch Lifecycle** | Auto-watches on `findAll`/`findMatching`; `equivalentWatch` prevents duplicate subscriptions |
| **Reconnection** | Auto-reconnect with version tracking; fixed flood bug via PR #7671 |

**Key lesson from Rancher:** The 1-second client-side buffer is critical for preventing excessive re-renders during burst events (e.g., scaling a deployment from 1 to 50 replicas). Without buffering, each ADDED pod triggers a separate React render cycle.

**Key lesson on resource versions:** Rancher hit a production bug where re-subscription used individual item `resourceVersion` instead of collection-level `revision`, causing the K8s API server to reject watches as "too old" and creating tight reconnection loops. This is the most common K8s watch pitfall.

### Headlamp (kubernetes-sigs)

**Confidence: HIGH** (verified via official architecture docs at headlamp.dev, GitHub releases, DeepWiki)

| Aspect | Implementation |
|--------|---------------|
| **Transport** | WebSocket with backend multiplexing |
| **Backend** | Go proxy (`headlamp-server`) with WebSocket multiplexer |
| **Connection Model** | Single WS from browser to headlamp-server; server opens N WebSockets to K8s API servers |
| **Multiplexing Rationale** | Browsers limit to ~6 HTTP/1.1 connections per domain |
| **Frontend Hooks** | `useKubeObject` -- switched from multiplexed to standard WS in v0.39.0 |
| **State Management** | React Query for data fetching; refetch intervals (e.g., cluster fetch every 10s) |
| **Caching** | Backend `CacheMiddleWare` caches responses |
| **OIDC** | Automatic token refresh via `OIDCTokenRefreshMiddleware` |

**Key lesson from Headlamp:** The browser connection limit (6 per domain in HTTP/1.1) was their primary motivation for multiplexing. Under HTTP/2, SSE streams are multiplexed automatically at the protocol level, making this a non-issue for SSE on modern infrastructure.

**Key lesson on hook design:** `useKubeObject` moved from multiplexed to standard WebSocket connections (v0.39.0), suggesting multiplexing complexity wasn't worth the engineering cost for their use case.

### Kubernetes Dashboard v3/v7

**Confidence: MEDIUM** (architecture details not publicly documented in detail)

| Aspect | Implementation |
|--------|---------------|
| **Transport** | kubectl proxy / Kong API gateway |
| **Backend** | Go backend + Angular frontend (v3); Kong + microservices (v7) |
| **Architecture** | Single-container DBless Kong as gateway connecting all containers |
| **Watch Support** | Proxies K8s Watch API directly to browser |
| **Real-time** | Relies on K8s API server watch semantics via proxy |

**Key lesson:** K8s Dashboard v7 uses Kong as a pass-through proxy, meaning the browser establishes direct chunked HTTP connections to the K8s API watch endpoints. This is the simplest architecture but requires the browser to handle K8s API authentication directly.

---

## Recommended Stack (What to Keep, What to Add, What to Fix)

### Keep (Already Correct)

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| `@kubernetes/client-node` | ^1.4.0 | K8s informers (Watch API + ObjectCache) | HIGH |
| Fastify 5 | ^5.8.4 | HTTP server with SSE streaming | HIGH |
| SSE (raw `reply.raw.write()`) | Native | Server-to-client streaming transport | HIGH |
| `EventSource` (browser) | Native | SSE client with auto-reconnect | HIGH |
| Zustand `resource-store` | ^5.0.12 | Client-side live resource cache | HIGH |
| Node.js `EventEmitter` | Built-in | Decouples informers from SSE consumers | HIGH |

**Rationale for keeping SSE over WebSocket:**
1. Data flow is unidirectional (K8s -> server -> browser). No client-to-server messages needed for resource streaming.
2. SSE auto-reconnects natively via `EventSource` (browser handles reconnection automatically with `Last-Event-ID`).
3. HTTP/2 multiplexes SSE streams -- no 6-connection limit.
4. SSE connections are just long-lived HTTP requests -- standard load balancer and reverse proxy compatibility.
5. Rancher chose WS because Steve is bidirectional (start/stop commands); Voyager doesn't need bidirectional.
6. Headlamp chose WS because they proxy directly to K8s API which uses WS for watches; Voyager has a backend informer layer.

### Add: `@fastify/sse` Plugin

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| `@fastify/sse` | ^0.4.0 | Production SSE with Last-Event-ID replay, heartbeat, backpressure | HIGH |

**Why:** The current implementation uses raw `reply.raw.write()` with manual SSE formatting. This works but lacks:
- **Last-Event-ID tracking** for seamless reconnection (browser sends last ID, server replays missed events)
- **Built-in heartbeat** with configurable interval
- **Backpressure management** (raw write can overwhelm slow clients)
- **Connection lifecycle hooks** (onClose callbacks)
- **Message replay** on reconnection (critical for no-data-loss guarantee)

**Compatibility:** `@fastify/sse` v0.4.0 has `peerDependencies: { fastify: '^5.x' }` -- confirmed compatible.

**Migration path:** Replace `reply.raw.writeHead()` + `reply.raw.write()` with `reply.sse.send()` pattern. The plugin handles SSE formatting, heartbeat, and connection management.

**HOWEVER -- evaluate before adopting:** The current raw approach works and is well-understood. The plugin adds value primarily for Last-Event-ID replay. If the team prefers keeping raw SSE (which is what Rancher's Steve essentially does on the Go side), the key improvement is adding **event ID tracking** manually.

### Add: Client-Side Event Batching (Rancher Pattern)

| Pattern | Implementation | Purpose | Confidence |
|---------|---------------|---------|------------|
| 1-second buffer flush | `requestAnimationFrame` or `setTimeout(flush, 1000)` | Batch SSE events before applying to Zustand store | HIGH |

**Why:** Rancher's 1-second buffer is the industry-proven pattern. Without it:
- Scaling a deployment 1->50 replicas sends 50 ADDED events in rapid succession
- Each `applyEvent()` call creates a new `Map` in Zustand, triggering a React render
- 50 renders in <2 seconds causes visible jank

**Implementation:** Collect incoming `watch` events in a buffer array. Flush to Zustand every 1 second (or on `requestAnimationFrame`). Apply all buffered events in a single Zustand `set()` call.

### Add: Event ID Tracking (SSE Spec Compliance)

| Pattern | Implementation | Purpose | Confidence |
|---------|---------------|---------|------------|
| Monotonic event IDs | Server assigns incrementing `id:` field per SSE event | Enable Last-Event-ID reconnection | HIGH |

**Why:** The SSE spec supports automatic reconnection with event replay. When the connection drops:
1. Browser's `EventSource` automatically reconnects
2. Sends `Last-Event-ID` header with the last received event ID
3. Server replays events after that ID

Currently Voyager doesn't send `id:` fields in SSE events, so reconnection loses all events that occurred during the disconnect. This is the #1 gap vs production dashboards.

**Implementation:** Add an in-memory ring buffer (bounded by `SSE_EVENT_BUFFER_SIZE = 100`) per cluster. Assign monotonic IDs. On reconnection, check `Last-Event-ID` header and replay from buffer.

---

## What NOT to Do (Anti-Patterns)

### 1. DO NOT switch to WebSocket for resource streaming

**Why it's tempting:** Rancher and Headlamp use WebSocket.
**Why it's wrong for Voyager:**
- Rancher's Steve is a bidirectional protocol (client sends start/stop commands). Voyager's resource stream is unidirectional.
- WebSocket requires manual reconnection logic. SSE's `EventSource` handles it automatically.
- WebSocket doesn't support `Last-Event-ID` replay natively.
- WebSocket requires `@fastify/websocket` registration which is already used for pod exec -- adding a second WS endpoint increases complexity.
- HTTP/2 eliminates the connection limit that motivated Headlamp's WS choice.

**Confidence: HIGH**

### 2. DO NOT poll TanStack Query alongside SSE

**Why it's tempting:** Belt-and-suspenders approach feels safer.
**Why it's wrong:**
- TanStack Query's `refetchInterval` will overwrite SSE-applied data with stale server responses
- Creates a race condition: SSE updates Zustand, then poll overwrites with older data
- This is likely the current bug: "data only updates when the page is refreshed or on a ~10s interval that looks like polling"

**Action:** Components consuming live data MUST read from Zustand `resource-store` (fed by SSE), NOT from TanStack Query with `refetchInterval`. TanStack Query should only be used for:
- Initial data fetch (before SSE connects)
- Historical/non-live data (e.g., DB queries)
- Fallback when SSE is disconnected

**Confidence: HIGH** (matches PROJECT.md diagnosis: "TanStack Query overriding SSE with stale poll data")

### 3. DO NOT watch all clusters simultaneously

**Why it's tempting:** Simpler architecture.
**Why it's wrong:**
- 30 clusters x 15 resource types = 450 concurrent K8s watch connections
- K8s API servers have connection limits; this causes 429s and watch disconnects
- Rancher, Headlamp, and Lens all watch only the active cluster

**Current behavior:** `MAX_CONCURRENT_CLUSTER_WATCHES = 20` is already configured, but per-cluster on-demand watching needs enforcement: start on view, stop on leave.

**Confidence: HIGH**

### 4. DO NOT use individual item `resourceVersion` for watch re-subscription

**Pitfall from Rancher (issue #5997):** Using an individual resource's `metadata.resourceVersion` instead of the collection-level version when re-subscribing to watches causes the K8s API to reject the request as "too old," triggering rapid reconnection loops that flood the API server.

**`@kubernetes/client-node` informer handles this internally** -- the `makeInformer` tracks resourceVersion correctly during LIST+WATCH cycles. Do not override this.

**Confidence: HIGH**

### 5. DO NOT send unbounded events without backpressure

**Why:** A cluster with 10,000 pods generates massive snapshot events. Writing all of them to a slow SSE client in one go can exhaust server memory.

**Pattern:** Use chunked snapshots (e.g., 100 items per SSE event) or implement backpressure detection via `reply.raw.write()` return value (returns `false` when buffer is full).

**Confidence: MEDIUM** (standard Node.js streams advice, not K8s-specific)

---

## Known Issues with `@kubernetes/client-node` Informers

**Confidence: HIGH** (verified via GitHub issues)

### Issue 1: ListWatch Stops Reconnecting on Non-410 Errors

**GitHub:** [#2385](https://github.com/kubernetes-client/javascript/issues/2385)
**Impact:** HIGH -- informer silently stops receiving events after network hiccup
**Versions affected:** 1.1.2 through 1.4.0 (not confirmed fixed)
**Root cause:** `doneHandler()` in `cache.ts` returns early for non-410 errors, preventing reconnection.
**Mitigation:** The existing `WatchManager.handleInformerError()` with `informer.start()` in error handler is the correct workaround. This is already implemented in the codebase.

### Issue 2: Informer Floods API After Restart

**GitHub:** [#1933](https://github.com/kubernetes-client/javascript/issues/1933)
**Impact:** MEDIUM -- can cause K8s API rate limiting
**Root cause:** After connection loss, informer can send tens of watch requests per second instead of backing off.
**Mitigation:** The existing exponential backoff in `handleInformerError()` addresses this. Ensure the delay is respected before calling `informer.start()`.

### Issue 3: Watch Stream Stays "Open" After Severing

**GitHub:** [#559](https://github.com/kubernetes-client/javascript/issues/559)
**Impact:** MEDIUM -- informer believes it's connected but receives no events
**Root cause:** If network severs without TCP FIN/RST, the stream doesn't know it's dead.
**Mitigation:** Implement a **watch heartbeat timeout** (`WATCH_HEARTBEAT_TIMEOUT_MS = 90_000` is already configured). If no data arrives within the timeout, force-restart the informer.

### Issue 4: `doneCallOnce` Double Callback

**GitHub:** [#2387](https://github.com/kubernetes-client/javascript/issues/2387)
**Impact:** LOW -- causes two reconnection attempts instead of one
**Root cause:** `controller.abort()` is called before setting `doneCalled = true`, triggering recursive invocation.
**Mitigation:** The double-start is mostly harmless because the first one wins. Monitor logs for duplicate reconnection messages.

---

## Reconnection Strategy (3 Layers)

Production K8s dashboards implement reconnection at every layer of the pipeline. Here's the complete strategy:

### Layer 1: K8s Informer -> API Server (Backend)

| Setting | Value | Source |
|---------|-------|--------|
| Reconnect base delay | 1,000ms | `WATCH_RECONNECT_BASE_MS` (already configured) |
| Reconnect max delay | 30,000ms | `WATCH_RECONNECT_MAX_MS` (already configured) |
| Jitter ratio | 0.1 | `WATCH_RECONNECT_JITTER_RATIO` (already configured) |
| Heartbeat timeout | 90,000ms | `WATCH_HEARTBEAT_TIMEOUT_MS` (configured but not implemented) |
| Strategy | Exponential backoff + jitter, restart informer in error handler | Already implemented |

**Gap:** The heartbeat timeout (`WATCH_HEARTBEAT_TIMEOUT_MS`) is defined but not enforced. Need a timer per informer that resets on each event and force-restarts the informer if it expires.

### Layer 2: API Server -> Browser (SSE Transport)

| Setting | Value | Source |
|---------|-------|--------|
| Heartbeat interval | 30,000ms | `SSE_HEARTBEAT_INTERVAL_MS` (already configured) |
| Server heartbeat format | `:heartbeat\n\n` | Already implemented (SSE comment) |
| Browser reconnection | Automatic via `EventSource` | Native browser behavior |
| Last-Event-ID | Not implemented | Gap -- need to add event IDs |
| Event replay buffer | 100 events | `SSE_EVENT_BUFFER_SIZE` (configured, not used) |

**Gap:** No `id:` field on SSE events. No replay on reconnection. Browser reconnects but gets a fresh snapshot (which works but is inefficient and causes a UI flash).

### Layer 3: Browser -> React Components (Client State)

| Setting | Value | Source |
|---------|-------|--------|
| Event buffering | None (immediate apply) | Gap -- need 1s Rancher-style buffer |
| Connection state tracking | Yes (Zustand `connectionState`) | Already implemented |
| Snapshot handling | `setResources()` replaces entire array | Already implemented |
| Event application | `applyEvent()` with ADDED/MODIFIED/DELETED | Already implemented |

**Gap:** No client-side event batching. Each event triggers a Zustand `set()` and React re-render.

---

## Comparison: Transport Protocols for K8s Web Dashboards

| Criterion | SSE | WebSocket | HTTP Long-Polling |
|-----------|-----|-----------|-------------------|
| **Direction** | Server -> Client only | Bidirectional | Client-initiated |
| **Auto-reconnect** | Yes (native EventSource) | No (manual) | N/A |
| **Last-Event-ID replay** | Yes (native) | No (manual) | N/A |
| **HTTP/2 multiplexing** | Yes (shares connection) | No (separate TCP) | Yes |
| **Proxy compatibility** | High (standard HTTP) | Medium (upgrade required) | High |
| **Browser connection limit** | 6 (HTTP/1.1), unlimited (HTTP/2) | Unlimited | 6 (HTTP/1.1) |
| **Used by Rancher** | No | Yes (bidirectional) | No |
| **Used by Headlamp** | No | Yes (multiplexed) | No |
| **Used by K8s Dashboard** | No | No | Yes (via proxy) |
| **Best for Voyager** | **Yes** | Pod exec only | No |

**Verdict:** SSE is the correct choice for Voyager. Rancher and Headlamp use WebSocket for specific reasons (bidirectional protocol, K8s API proxy) that don't apply to Voyager's architecture where the backend has its own informer layer.

---

## Implementation Priority

Based on research, this is the priority order for fixing the live data pipeline:

1. **Diagnose and fix SSE stream stopping** (LIVE-01) -- highest impact, likely a bug in event emission or informer lifecycle
2. **Remove TanStack Query polling for live resources** (LIVE-05) -- likely root cause of "polling" behavior
3. **Add client-side 1s event buffer** (performance) -- prevents jank during burst events
4. **Add SSE event IDs + replay buffer** (LIVE-06) -- enables seamless reconnection
5. **Implement watch heartbeat timeout** (reliability) -- catches silent informer disconnects
6. **Dead code cleanup** (CLEAN-01) -- remove legacy watchers

---

## Sources

### Primary (HIGH confidence)
- [Headlamp Architecture](https://headlamp.dev/docs/latest/development/architecture/) -- Official architecture docs
- [Headlamp 2025 Highlights](https://kubernetes.io/blog/2026/01/22/headlamp-in-2025-project-highlights/) -- Kubernetes blog
- [Rancher API Resources & Schemas](https://extensions.rancher.io/internal/code-base-works/api-resources-and-schemas) -- Official Rancher extension docs
- [Rancher Steve API](https://github.com/rancher/steve) -- GitHub, K8s API translator
- [Rancher Dashboard #5997](https://github.com/rancher/dashboard/issues/5997) -- Resource version flooding bug
- [@kubernetes/client-node #2385](https://github.com/kubernetes-client/javascript/issues/2385) -- ListWatch reconnection bug
- [@kubernetes/client-node #1933](https://github.com/kubernetes-client/javascript/issues/1933) -- Informer API flooding
- [@kubernetes/client-node releases](https://github.com/kubernetes-client/javascript/releases) -- Version 1.4.0 (Oct 2024)
- [@fastify/sse](https://github.com/fastify/sse) -- Fastify SSE plugin (v0.4.0, peerDeps: fastify ^5.x)
- [Coding a Real-Time Dashboard for Kubernetes](https://learnkube.com/real-time-dashboard) -- Technical deep-dive

### Secondary (MEDIUM confidence)
- [Headlamp DeepWiki](https://deepwiki.com/kubernetes-sigs/headlamp/4.1-kubernetes-api-integration) -- API integration details
- [Headlamp WS Multiplexing #1802](https://github.com/kubernetes-sigs/headlamp/issues/1802) -- Browser WS limits discussion
- [SSE Production Pitfalls](https://dev.to/miketalbot/server-sent-events-are-still-not-production-ready-after-a-decade-a-lesson-for-me-a-warning-for-you-2gie) -- Proxy buffering issues
- [SSE vs WebSocket 2025](https://dev.to/polliog/server-sent-events-beat-websockets-for-95-of-real-time-apps-heres-why-a4l) -- Protocol comparison
- [SSE Practical Guide](https://tigerabrodi.blog/server-sent-events-a-practical-guide-for-the-real-world) -- Implementation patterns
- [Rancher Steve Throttling #36682](https://github.com/rancher/rancher/issues/36682) -- Count metadata debouncing

---

*Stack research: 2026-03-30*
