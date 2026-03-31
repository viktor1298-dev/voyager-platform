# API Server Resilience Audit Report

**Date:** 2026-03-31
**Scope:** `apps/api/src/` -- all routers, routes, jobs, lib, services
**Auditor:** Claude Opus 4.6 (automated deep audit)

---

## Executive Summary

The Fastify API server is **generally well-architected** with proper error handling patterns in place: a global `setErrorHandler`, `unhandledRejection` / `uncaughtException` handlers, standardized K8s error handling via `handleK8sError()`, and non-fatal Redis/audit patterns. The WatchManager has solid generation-based stale callback protection and exponential backoff reconnect.

However, this audit identified **7 CRITICAL**, **9 HIGH**, **6 MEDIUM**, and **5 LOW** severity issues across five categories. The most dangerous are: the Helm `cached()` TTL bug (30,000 seconds instead of 30 seconds), missing shutdown drain for active SSE connections, the `seenGenerations` unbounded Map in deploy-smoke-test, and several error-swallowing patterns that silently lose failures.

---

## 1. Unhandled Errors

### ISSUE-01: `ai-stream.ts` -- `writeEvent` calls `reply.raw.write()` without try/catch during stream body

**File:** `apps/api/src/routes/ai-stream.ts`, lines 91-96
**Severity:** HIGH

The `writeEvent` helper does NOT wrap `reply.raw.write()` in try/catch:

```ts
const writeEvent = (event: string, payload: Record<string, unknown>) => {
  reply.raw.write(`event: ${event}\n`)
  reply.raw.write(`data: ${JSON.stringify(...)}\n\n`)
}
```

If the client disconnects mid-stream, both `write()` calls throw, and the error propagates into the `answerQuestionStream` callback or the main try/catch, potentially leaving the heartbeat interval running or the reply in a broken state. Compare this to `resource-stream.ts` (line 103-106) and `metrics-stream.ts` (line 97-101) which correctly wrap writes in try/catch.

**Fix:** Wrap both `write()` calls in a try/catch block, same pattern as other SSE routes.

---

### ISSUE-02: `ai-stream.ts` -- no `request.raw.on('close')` cleanup handler

**File:** `apps/api/src/routes/ai-stream.ts`, lines 67-141
**Severity:** HIGH

The AI stream route relies solely on `finally { clearInterval(heartbeat); reply.raw.end() }` for cleanup. It does NOT register a `request.raw.on('close')` handler like every other SSE route (`resource-stream.ts:195`, `metrics-stream.ts:116`, `log-stream.ts:189`).

If the client disconnects while `answerQuestionStream` is still running (waiting for the LLM provider), the heartbeat interval keeps running and keeps calling `reply.raw.write(':keepalive\n\n')` on a closed connection until `answerQuestionStream` eventually resolves or rejects. This can also prevent the HTTP connection from being freed.

**Fix:** Add `request.raw.on('close', ...)` that aborts the AI stream and clears the heartbeat.

---

### ISSUE-03: `mcp.ts` -- SSE endpoint `/mcp/sse` missing `reply.raw.end()` on close

**File:** `apps/api/src/routes/mcp.ts`, lines 153-174
**Severity:** MEDIUM

The MCP SSE endpoint clears the keepalive interval on client close but does not call `reply.raw.end()`:

```ts
request.raw.on('close', () => {
  clearInterval(interval)
  // Missing: reply.raw.end()
})
```

This follows the pattern seen in all other SSE routes. While Fastify/Node may clean up the socket eventually, explicitly calling `reply.raw.end()` ensures consistent resource release.

**Fix:** Add `try { reply.raw.end() } catch { /* already ended */ }` in the close handler.

---

### ISSUE-04: `deployments.ts` -- `list` endpoint errors are silently swallowed by `cached()`

**File:** `apps/api/src/routers/deployments.ts`, lines 148-216
**Severity:** MEDIUM

The `deployments.list` endpoint wraps the entire K8s fetch inside `cached()` without an outer try/catch. If `getClusterContextFromPool()` throws (no clusters registered), the error propagates as an uncaught promise rejection from the tRPC handler. The `publicProcedure` middleware at `trpc.ts:67-77` catches generic errors and wraps them, but the error message ("No clusters registered") gets mapped to `INTERNAL_SERVER_ERROR` instead of a more appropriate `NOT_FOUND` or `PRECONDITION_FAILED`.

**Fix:** Wrap in try/catch with `handleK8sError` or return an empty array when no clusters exist.

---

### ISSUE-05: `logs.ts` -- `get` endpoint has no try/catch around K8s API call

**File:** `apps/api/src/routers/logs.ts`, lines 361-390
**Severity:** MEDIUM

The `logs.get` procedure calls `coreApi.readNamespacedPodLog()` without any try/catch. If the K8s API returns an error (pod not found, container not found, cluster unreachable), the raw K8s error propagates to the client as an opaque `INTERNAL_SERVER_ERROR`. Compare with `logs.stream` (line 325-358) which uses `handleK8sError`.

**Fix:** Wrap the K8s call in try/catch and use `handleK8sError(error, 'get pod logs')`.

---

### ISSUE-06: `pod-terminal.ts` -- PassThrough stream errors not handled

**File:** `apps/api/src/routes/pod-terminal.ts`, lines 48-58
**Severity:** MEDIUM

The `stdout` and `stderr` PassThrough streams have `data` event handlers but no `error` event handlers:

```ts
const stdout = new PassThrough()
const stderr = new PassThrough()
stdout.on('data', (data) => { ... })
stderr.on('data', (data) => { ... })
// No .on('error') handlers
```

If the K8s exec connection drops or the stream encounters a write error, the PassThrough emits an `error` event. Without a handler, Node.js throws `ERR_UNHANDLED_STREAM_ERROR` which becomes an uncaught exception.

**Fix:** Add `.on('error', (err) => { app.log.error(...); socket.close(1011, 'Stream error') })` to both `stdout` and `stderr`.

---

### ISSUE-07: `pod-terminal.ts` -- `stdin.write(buf)` can fail silently

**File:** `apps/api/src/routes/pod-terminal.ts`, lines 61-64
**Severity:** LOW

The `stdin.write(buf)` call in the WebSocket message handler does not check the return value or handle backpressure. If the K8s exec stream is overwhelmed or the stdin PassThrough buffer fills up, data is silently dropped.

**Fix:** Add error handling: `if (!stdin.write(buf)) { /* handle backpressure */ }` or at minimum add `stdin.on('error', ...)`.

---

## 2. Resource Leaks

### ISSUE-08: `deploy-smoke-test.ts` -- `seenGenerations` Map grows unbounded

**File:** `apps/api/src/jobs/deploy-smoke-test.ts`, line 21
**Severity:** CRITICAL

```ts
const seenGenerations = new Map<string, number>()
```

This Map accumulates one entry per `{clusterId}/{namespace}/{deployment}` for every deployment that triggers a rollout, and is NEVER pruned (only cleared on full shutdown via `stopDeploySmokeTest()`). In a production environment with many clusters and frequent deployments, this grows indefinitely.

For 30 clusters with ~100 deployments each doing weekly releases over months, this accumulates thousands of entries. While each entry is small (~100 bytes), the pattern is a textbook memory leak.

**Fix:** Implement TTL-based eviction. After recording a generation, schedule deletion after the dedup window (5 minutes). Alternatively, use a bounded LRU Map.

---

### ISSUE-09: `presence.ts` -- `sweepTimer` interval never stopped on shutdown

**File:** `apps/api/src/lib/presence.ts`, line 82-84
**Severity:** HIGH

```ts
const sweepTimer = setInterval(() => {
  sweepExpiredUsers()
}, PRESENCE_SWEEP_INTERVAL_MS)
sweepTimer.unref()
```

The `.unref()` allows Node.js to exit without waiting for this timer, but it still runs during the grace period and could fire during shutdown cleanup. More importantly, it is never exported or tracked for cleanup in `server.ts`'s shutdown handler. While `.unref()` mitigates the blocking concern, it represents a resource that is impossible to stop cleanly.

**Fix:** Export a `stopPresenceSweep()` function and call it during graceful shutdown.

---

### ISSUE-10: `event-emitter.ts` -- `maxListeners` set to 100 but dynamic channels can exceed it

**File:** `apps/api/src/lib/event-emitter.ts`, line 64
**Severity:** HIGH

The global emitter has `setMaxListeners(100)`. Each SSE client adds listeners for `watch-event:{clusterId}` and `watch-status:{clusterId}`. With `MAX_RESOURCE_CONNECTIONS_GLOBAL = 50` resource streams plus `MAX_CONNECTIONS_GLOBAL = 50` metrics streams, plus watch-db-writer listeners, plus deploy-smoke-test, plus tRPC subscriptions (presence), the total listener count can easily exceed 100.

While exceeding `maxListeners` only produces a warning (not an error), the warning itself generates console spam and can mask real issues.

**Fix:** Calculate the actual maximum: `(50 resource * 2 listeners) + (50 metrics * 1) + (20 clusters * 1 db-writer) + presence + deploy = ~170`. Set `maxListeners` to at least 200 (presence.ts already sets its own emitter to 200).

---

### ISSUE-11: `watch-db-writer.ts` -- `newListener` handler accumulates listeners for removed clusters

**File:** `apps/api/src/lib/watch-db-writer.ts`, lines 238-250
**Severity:** MEDIUM

The `newListener` handler registers a per-cluster listener on every new `watch-event:{clusterId}` channel. When a cluster's watches are torn down (grace period expires), the WatchManager removes its informers, but the watch-db-writer's listener for that cluster's `watch-event:{clusterId}` channel remains registered in the `listeners` Map and on the emitter.

The listener does harmless work (just adding to `dirtySet`), but the reference is never cleaned up until `stopWatchDbWriter()` is called. Over time with many cluster connects/disconnects, orphaned listeners accumulate.

**Fix:** Listen to `removeListener` or `watch-status` disconnected events to clean up per-cluster listeners when watches are torn down.

---

### ISSUE-12: `log-stream.ts` -- `abortController` not cleaned up when logStream is destroyed by MAX_LOG_LINES

**File:** `apps/api/src/routes/log-stream.ts`, lines 134-140
**Severity:** LOW

When `lineCount >= MAX_LOG_LINES`, the code calls `logStream.destroy()` but does NOT abort the `abortController`. The K8s log follow HTTP connection stays open in the background until it times out or the K8s API server closes it. The `cleanup()` function at line 170-186 does abort it, but it's only called from the `logStream.on('error')` handler and `request.raw.on('close')` -- not from the MAX_LOG_LINES path.

Actually, `logStream.destroy()` will trigger the `error` event with a destroy error, which calls `cleanup()`. However, this relies on the PassThrough stream emitting an error on destroy, which is not guaranteed in all Node.js versions. The `end` event handler at line 152 also does not call `cleanup()`.

**Fix:** Call `cleanup()` directly after `logStream.destroy()` in the MAX_LOG_LINES branch.

---

## 3. Crash Vectors

### ISSUE-13: `helm.ts` -- `cached()` TTL is 30,000 SECONDS (not 30 seconds)

**File:** `apps/api/src/routers/helm.ts`, lines 113, 167-168, 233, 291
**Severity:** CRITICAL

The Helm router passes `30_000` as the TTL to `cached()`:

```ts
const secretsResponse = await cached(
  CACHE_KEYS.k8sHelmReleases(input.clusterId),
  30_000,  // <--- This is 30,000 SECONDS = 8.3 HOURS
  async () => { ... }
)
```

As documented in the CLAUDE.md gotchas: "Redis `cached()` TTL Is in SECONDS, Not Milliseconds. `cached(key, ttl, fn)` passes `ttl` to `redis.setEx()` which expects seconds."

This means Helm release data is cached for **8.3 hours** instead of the intended 30 seconds. Users will see stale Helm data for hours after a Helm upgrade. This same bug appears in 4 places in `helm.ts`.

**Fix:** Change all `30_000` to `30` in `helm.ts`.

---

### ISSUE-14: `topology.ts` -- `cached()` TTL is 15,000 SECONDS (4.1 hours)

**File:** `apps/api/src/routers/topology.ts`, line 93
**Severity:** CRITICAL

Same bug as ISSUE-13:

```ts
const [...] = await cached(
  CACHE_KEYS.k8sTopology(input.clusterId),
  15_000,  // 15,000 seconds = 4.1 hours, intended was 15 seconds
  () => Promise.all([...])
)
```

**Fix:** Change `15_000` to `15`.

---

### ISSUE-15: `crds.ts` -- `cached()` TTL is 30,000 SECONDS for list, 15,000 SECONDS for instances

**File:** `apps/api/src/routers/crds.ts`, lines 59, 96
**Severity:** CRITICAL

Same pattern:
- `cached(CACHE_KEYS.k8sCrds(...), 30_000, ...)` -- 8.3 hours instead of 30s
- `cached(CACHE_KEYS.k8sCrdInstances(...), 15_000, ...)` -- 4.1 hours instead of 15s

**Fix:** Change to `30` and `15` respectively.

---

### ISSUE-16: `rbac.ts` -- `cached()` TTL is 60,000 SECONDS (16.6 hours)

**File:** `apps/api/src/routers/rbac.ts`, lines 103, 191
**Severity:** CRITICAL

```ts
await cached(CACHE_KEYS.k8sRbac(input.clusterId), 60_000, ...)
```

RBAC data cached for 16.6 hours. Changes to ClusterRoles/RoleBindings won't be visible for almost a full day.

**Fix:** Change `60_000` to `60`.

---

### ISSUE-17: `yaml.ts` -- `cached()` TTL is 15,000 SECONDS

**File:** `apps/api/src/routers/yaml.ts`, line 100
**Severity:** CRITICAL

The YAML resource viewer caches raw K8s objects for 4.1 hours. Users viewing "current" YAML will see data from hours ago.

**Fix:** Change `15_000` to `15`.

---

### ISSUE-18: `decodeHelmRelease` can crash with OOM on malformed data

**File:** `apps/api/src/routers/helm.ts`, lines 47-58
**Severity:** HIGH

The `decodeHelmRelease` function calls `gunzipSync(compressed)` on data decoded from K8s secrets. If the compressed data is malformed or a zip bomb (unlikely from K8s but possible with corrupted data), `gunzipSync` will try to decompress it all into memory synchronously, potentially causing OOM.

Additionally, `JSON.parse(jsonBuffer.toString('utf-8'))` on the decompressed data has no size check. A very large Helm release (with many large templates) could produce a multi-hundred-MB JSON string.

**Fix:** Use `gunzipSync` with a `maxOutputLength` option: `gunzipSync(compressed, { maxOutputLength: 50 * 1024 * 1024 })` (50MB limit).

---

### ISSUE-19: `telemetry.ts` -- `sdk.start()` is called at module import time

**File:** `apps/api/src/lib/telemetry.ts`, line 39
**Severity:** LOW

The OpenTelemetry SDK starts immediately when the module is imported. If initialization fails (e.g., invalid OTLP endpoint), it throws at import time which could prevent the server from starting. The Sentry initialization is wisely wrapped in a function called from `server.ts`, but telemetry is not.

**Fix:** Wrap `sdk.start()` in a try/catch or move to a `startTelemetry()` function called from `server.ts`.

---

## 4. Graceful Shutdown Gaps

### ISSUE-20: Active SSE connections are NOT drained on shutdown

**File:** `apps/api/src/server.ts`, lines 299-320
**Severity:** CRITICAL

The shutdown handler calls:
```ts
watchManager.stopAll()
stopWatchDbWriter()
stopAlertEvaluator()
stopMetricsHistoryCollector()
metricsStreamJob.stopAll()
await app.close()
```

But it does NOT:
1. Close active SSE connections (resource-stream, metrics-stream, log-stream, ai-stream, mcp/sse)
2. Close active WebSocket connections (pod-terminal)
3. Notify connected clients of shutdown

When `watchManager.stopAll()` is called, active resource-stream SSE handlers still hold references to the emitter listeners. When `app.close()` shuts down the HTTP server, these connections are abruptly terminated without cleanup. The `request.raw.on('close')` handlers fire, but by then the WatchManager is already stopped, so `watchManager.unsubscribe()` operates on a cleared Map.

The connection counters (`connectionCounts`, `globalConnections`) in each SSE route will have stale non-zero values after restart if the process is reused (not typical in K8s but possible in dev).

**Fix:** Track active SSE connections in a Set, iterate on shutdown to `reply.raw.end()` each one. Send a `shutdown` SSE event first so clients know to reconnect to a different pod.

---

### ISSUE-21: No shutdown timeout -- process hangs if cleanup deadlocks

**File:** `apps/api/src/server.ts`, lines 299-320
**Severity:** HIGH

The shutdown handler awaits `flushSentry()`, `shutdownTelemetry()`, and `app.close()` sequentially with no timeout. If any of these hang (e.g., Sentry flush to unreachable endpoint, OTLP exporter timeout, stuck HTTP keep-alive connections), the process hangs indefinitely. In Kubernetes, the kubelet will send SIGKILL after `terminationGracePeriodSeconds` (default 30s), but the lack of a self-imposed timeout means:

1. Sentry events may be lost if flushing is interrupted by SIGKILL
2. In-progress DB writes from watch-db-writer may not complete
3. The process exit code is 137 (SIGKILL) instead of clean 0

**Fix:** Add a force-exit timer:
```ts
const forceExitTimer = setTimeout(() => {
  console.error('[shutdown] Force exit after timeout')
  process.exit(1)
}, 25_000) // Less than K8s terminationGracePeriodSeconds
forceExitTimer.unref()
```

---

### ISSUE-22: Database pool is not explicitly closed on shutdown

**File:** `apps/api/src/server.ts`, lines 299-320
**Severity:** MEDIUM

The shutdown handler does not call any database pool close/drain function. The Drizzle ORM + PostgreSQL connection pool (`@voyager/db`) may have active connections that are left open. While `process.exit(0)` will forcefully close them, it means in-progress transactions (from watch-db-writer, alert-evaluator) could be left in an ambiguous state.

**Fix:** Import and call a `closeDatabase()` function during shutdown, after stopping all jobs but before `app.close()`.

---

### ISSUE-23: Redis client is not closed on shutdown

**File:** `apps/api/src/lib/cache.ts`, lines 1-18; `apps/api/src/server.ts`
**Severity:** MEDIUM

The Redis client created in `cache.ts` is a module-level singleton with no `disconnect()` or `quit()` method exposed. The shutdown handler does not close Redis connections. While Redis connections are lightweight and the Redis server handles disconnects gracefully, it is a resource leak during rolling deployments where pods overlap.

**Fix:** Export a `closeRedis()` function from `cache.ts` and call it during shutdown.

---

## 5. Process Health / Memory Leak Risks

### ISSUE-24: `cluster-client-pool.ts` -- LRU eviction evicts oldest by TTL, not by LRU access

**File:** `apps/api/src/lib/cluster-client-pool.ts`, lines 64-75
**Severity:** LOW

When the pool reaches `CLIENT_POOL_MAX` (50), the eviction logic finds the entry with the lowest `expiresAt` (oldest TTL expiry). This is not true LRU -- a frequently-accessed cluster that was cached early could be evicted while a never-used cluster with a later cache time is retained.

In practice, with 29 clusters and a max of 50, this is unlikely to matter. But if the pool max is lowered or clusters are added, the wrong eviction policy could cause unnecessary cache misses and extra credential decryption + token generation.

**Fix:** Track `lastAccessedAt` and evict by that field instead of `expiresAt`.

---

### ISSUE-25: `presence.ts` -- `presenceStore` Map has no hard cap

**File:** `apps/api/src/lib/presence.ts`, line 37
**Severity:** LOW

The `presenceStore` Map grows with one entry per unique user. The sweep timer cleans up expired entries, but if many unique users connect rapidly (e.g., bot scripts), the Map could grow large before sweep runs (15s interval). Each entry is ~200 bytes, so 10,000 concurrent users would only consume ~2MB -- acceptable but worth noting.

**Fix:** Add a hard cap (e.g., 1000 users) and reject heartbeats when exceeded.

---

### ISSUE-26: `resource-stream.ts` -- `replayBuffer` is per-connection but never shared

**File:** `apps/api/src/routes/resource-stream.ts`, lines 95-96, 138-153
**Severity:** LOW

The replay buffer for `Last-Event-ID` reconnection is per-connection:
```ts
let eventCounter = 0
const replayBuffer: Array<{ id: number; raw: string }> = []
```

When a client reconnects (new connection), the `replayBuffer` is empty because it's a new closure. The `Last-Event-ID` check at line 141 will never find a match (buffer is empty), so it always falls through to full snapshot. This means the replay feature is **non-functional** -- it can never replay missed events because the buffer is discarded when the connection closes.

**Fix:** Move the replay buffer to a per-cluster shared Map (keyed by clusterId) so reconnecting clients can benefit from events buffered during their absence. Bound the shared buffer by size and evict old entries.

---

### ISSUE-27: `watch-manager.ts` -- `heartbeatTimers` and `reconnectAttempts` use string keys without cleanup

**File:** `apps/api/src/lib/watch-manager.ts`, lines 230, 255-261
**Severity:** LOW

The `heartbeatTimers` Map uses keys like `${clusterId}:${type}`. The `teardownCluster` method correctly cleans up heartbeat timers for a cluster, and `stopAll` clears the entire Map. However, if `handleInformerError` schedules a reconnect via `setTimeout` (line 529-535) and the cluster is torn down before the timeout fires, the stale callback checks `current.generation === generation` which correctly prevents action. This is well-designed.

No fix needed -- this is a positive finding.

---

## Summary Table

| ID | Severity | Category | File | Description |
|----|----------|----------|------|-------------|
| 01 | HIGH | Unhandled Error | ai-stream.ts | `writeEvent` has no try/catch around `reply.raw.write()` |
| 02 | HIGH | Unhandled Error | ai-stream.ts | No `request.raw.on('close')` cleanup handler |
| 03 | MEDIUM | Unhandled Error | mcp.ts | SSE endpoint missing `reply.raw.end()` on close |
| 04 | MEDIUM | Unhandled Error | deployments.ts | `list` endpoint errors swallowed by `cached()` |
| 05 | MEDIUM | Unhandled Error | logs.ts | `get` endpoint has no try/catch around K8s API |
| 06 | MEDIUM | Unhandled Error | pod-terminal.ts | PassThrough stream `error` events not handled |
| 07 | LOW | Unhandled Error | pod-terminal.ts | `stdin.write()` ignores backpressure |
| 08 | CRITICAL | Resource Leak | deploy-smoke-test.ts | `seenGenerations` Map grows unbounded |
| 09 | HIGH | Resource Leak | presence.ts | `sweepTimer` interval never stopped on shutdown |
| 10 | HIGH | Resource Leak | event-emitter.ts | `maxListeners(100)` too low for actual load |
| 11 | MEDIUM | Resource Leak | watch-db-writer.ts | Orphaned listeners for disconnected clusters |
| 12 | LOW | Resource Leak | log-stream.ts | `abortController` not cleaned up on MAX_LOG_LINES |
| 13 | CRITICAL | Crash Vector | helm.ts | `cached()` TTL 30,000 seconds (should be 30) |
| 14 | CRITICAL | Crash Vector | topology.ts | `cached()` TTL 15,000 seconds (should be 15) |
| 15 | CRITICAL | Crash Vector | crds.ts | `cached()` TTL 30,000/15,000 seconds |
| 16 | CRITICAL | Crash Vector | rbac.ts | `cached()` TTL 60,000 seconds (should be 60) |
| 17 | CRITICAL | Crash Vector | yaml.ts | `cached()` TTL 15,000 seconds (should be 15) |
| 18 | HIGH | Crash Vector | helm.ts | `gunzipSync` no max output length |
| 19 | LOW | Crash Vector | telemetry.ts | SDK starts at import time, can crash on load |
| 20 | CRITICAL | Shutdown | server.ts | Active SSE/WS connections not drained |
| 21 | HIGH | Shutdown | server.ts | No forced shutdown timeout |
| 22 | MEDIUM | Shutdown | server.ts | Database pool not closed |
| 23 | MEDIUM | Shutdown | cache.ts/server.ts | Redis client not closed |
| 24 | LOW | Memory | cluster-client-pool.ts | Eviction by TTL not by access time |
| 25 | LOW | Memory | presence.ts | `presenceStore` has no hard cap |
| 26 | LOW | Process Health | resource-stream.ts | Per-connection replay buffer is non-functional |
| 27 | -- | Positive Finding | watch-manager.ts | Generation-based stale callback protection is sound |

---

## Positive Findings

These patterns are well-implemented and should be preserved:

1. **WatchManager generation tracking** (`watch-manager.ts:206, 510-511`) -- prevents stale error handlers from double-starting informers after teardown/recreate cycles. This is a subtle but critical correctness mechanism.

2. **WatchManager grace period** (`watch-manager.ts:391-401`) -- 60s grace keeps informers warm on browser refresh. Cancellation on re-subscribe is correct.

3. **`publicProcedure` catch-all middleware** (`trpc.ts:67-77`) -- wraps all tRPC handlers with a safety net that converts unknown errors to `INTERNAL_SERVER_ERROR` TRPCErrors.

4. **Non-fatal Redis pattern** (`cache.ts`) -- all Redis operations are wrapped in try/catch with silent fallthrough. Redis failures never crash requests.

5. **Non-fatal audit logging** (`audit.ts:17-30`) -- `logAudit` wraps the DB insert in try/catch so audit failures never block the main operation.

6. **Background job re-entrancy guard** (all jobs) -- `isRunning` flag prevents overlapping executions when a job takes longer than its interval.

7. **Per-cluster error isolation in jobs** (`alert-evaluator.ts:109-119`, `metrics-history-collector.ts:69-199`) -- individual cluster failures don't stop processing of other clusters.

8. **Global process error handlers** (`server.ts:328-338`) -- `unhandledRejection` and `uncaughtException` both capture to Sentry.

9. **SSE connection limits** (resource-stream, metrics-stream, log-stream) -- per-cluster and global caps prevent resource exhaustion from runaway clients.

10. **Informer error reconnect with exponential backoff and jitter** (`watch-manager.ts:503-536`) -- correct implementation with generation check to prevent stale handlers.

---

## Priority Fix Order

1. **ISSUES 13-17 (CRITICAL):** Fix all `cached()` TTL values. These are data-correctness bugs affecting every user. Simple one-line fixes each.
2. **ISSUE 20 (CRITICAL):** Add SSE connection draining on shutdown. Prevents connection leaks during rolling deployments.
3. **ISSUE 08 (CRITICAL):** Add TTL eviction to `seenGenerations` Map. Prevents slow memory leak.
4. **ISSUE 21 (HIGH):** Add forced shutdown timeout. Prevents process hangs.
5. **ISSUES 01-02 (HIGH):** Fix AI stream error handling and cleanup. Prevents heartbeat leak on disconnect.
6. **ISSUE 10 (HIGH):** Increase `maxListeners` to 200+. Eliminates console warning spam.
7. **ISSUE 18 (HIGH):** Add `maxOutputLength` to `gunzipSync`. Prevents OOM on corrupted data.
8. **ISSUE 09 (HIGH):** Export and call `stopPresenceSweep()` on shutdown.
9. **Remaining MEDIUM/LOW:** Address in subsequent maintenance cycles.
