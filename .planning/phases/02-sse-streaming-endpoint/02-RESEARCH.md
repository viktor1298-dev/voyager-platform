# Phase 2: SSE Streaming Endpoint - Research

**Researched:** 2026-03-28
**Domain:** Server-Sent Events / K8s metrics-server polling / Fastify raw streaming
**Confidence:** HIGH

## Summary

Phase 2 is a backend-only phase that builds two new files: a Fastify SSE route (`metrics-stream.ts`) and a reference-counted polling job (`metrics-stream-job.ts`). The codebase already has a proven SSE pattern in `ai-stream.ts` (raw `reply.raw.write()` with heartbeat and proper headers), a typed EventEmitter (`voyagerEmitter`), and complete K8s metrics collection logic in `metrics-history-collector.ts` (CPU/memory parsing, node metrics, network bytes). All building blocks exist -- this phase assembles them into a new streaming pathway.

The key engineering challenge is the reference-counting lifecycle: the MetricsStreamJob must start polling a cluster's K8s metrics-server only when the first SSE subscriber connects and stop when the last disconnects. This prevents idle K8s API calls while ensuring zero-latency first-event delivery once a client connects.

**Primary recommendation:** Follow the existing `ai-stream.ts` pattern exactly for SSE transport, reuse `metrics-history-collector.ts` collection logic for K8s metrics-server calls, and use `voyagerEmitter` with per-cluster event channels (`metrics-stream:${clusterId}`) for decoupling the polling job from SSE connections.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No locked decisions -- all implementation choices are at Claude's discretion (infrastructure phase).

### Claude's Discretion
All implementation choices are at Claude's discretion. Key constraints from research:

- Follow existing SSE pattern from `apps/api/src/routes/ai-stream.ts` (raw `reply.raw.write()` on Fastify)
- Use `voyagerEmitter` EventEmitter for decoupling (existing pattern)
- Reference-counted polling: start K8s metrics-server poll on first subscriber, stop on last disconnect
- 10-15s poll interval for live metrics (configurable)
- SSE event format: `data: JSON.stringify({ clusterId, timestamp, cpu, memory, pods, networkBytesIn, networkBytesOut })`
- Heartbeat every 30s to keep connection alive
- Per-cluster streams (client subscribes to a specific clusterId)
- Do NOT use tRPC subscriptions (they require WebSocket transport)
- New route file: `apps/api/src/routes/metrics-stream.ts`
- New job file: `apps/api/src/jobs/metrics-stream-job.ts`

### Deferred Ideas (OUT OF SCOPE)
None -- infrastructure phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SSE-01 | Dedicated Fastify SSE endpoint streams live K8s metrics for short ranges (<=15m) at 10-15s resolution | SSE route pattern from `ai-stream.ts`, K8s metrics collection from `metrics-history-collector.ts`, event format from ARCHITECTURE.md |
| SSE-02 | MetricsStreamJob polls K8s metrics-server only for clusters with active SSE subscribers (reference-counted) | Reference-counting Map pattern, `voyagerEmitter` per-cluster events, start/stop lifecycle matching existing job pattern |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **ESM-only:** All packages are `"type": "module"` -- use `.js` extensions in imports even for `.ts` files
- **Zod v4:** `z.record()` requires TWO arguments -- `z.record(z.string(), z.unknown())`
- **Config centralization:** Do NOT add new hardcoded values to routes or jobs. Add constants to the appropriate config file (`packages/config/src/sse.ts` for SSE constants, `apps/api/src/config/jobs.ts` for job intervals)
- **Cache keys:** All Redis cache keys centralized in `apps/api/src/lib/cache-keys.ts` -- never construct inline
- **Error handling:** K8s errors use `handleK8sError(error, operation)` from `error-handler.ts`
- **NEVER add `migrate()` or schema init to `server.ts`**
- **Biome:** 2-space indent, 100-char line width, single quotes, semicolons as-needed
- **Import prefix:** Workspace packages use `@voyager/` prefix
- **Non-tRPC routes:** Registered in `server.ts` via `fastify.register()` -- see `registerAiStreamRoute(app)` pattern

## Standard Stack

### Core (Already Installed -- No New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | 5.7.4 | HTTP server, raw SSE response writing | Already in use, proven SSE pattern in `ai-stream.ts` |
| @kubernetes/client-node | 1.4.0 | K8s metrics-server API calls | Already in use, `Metrics` class for node/pod metrics |
| zod | 4.3.6 | Input validation (clusterId query param) | Already in use for all tRPC and route validation |

### Supporting (Already Available)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @voyager/config | workspace | SSE constants (heartbeat interval, etc.) | Import `SSE_HEARTBEAT_INTERVAL_MS` and new `SSE_METRICS_STREAM_POLL_MS` |
| @voyager/types | workspace | Shared TypeScript types for SSE events | Add new `MetricsStreamEvent` type |
| @voyager/db | workspace | Database access for cluster validation | Verify clusterId exists before streaming |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `reply.raw.write()` | `fastify-sse-v2` plugin | Plugin adds abstraction but existing codebase uses raw writes; consistency wins |
| `voyagerEmitter` (EventEmitter) | Redis Pub/Sub | Redis Pub/Sub needed for multi-instance; single-instance EventEmitter is simpler and proven |
| `setInterval` for polling | BullMQ repeatable job | Over-engineering; BullMQ is installed but polling loop is simpler for in-process work |
| Per-connection K8s poll | Shared reference-counted poll | Per-connection creates N x K8s API calls for N viewers of same cluster |

**Installation:** No new packages needed. Zero dependency changes.

## Architecture Patterns

### New Files

```
apps/api/src/
├── routes/
│   └── metrics-stream.ts        # NEW: Fastify SSE endpoint (GET /api/metrics/stream)
├── jobs/
│   └── metrics-stream-job.ts    # NEW: Reference-counted K8s metrics poller
```

### Modified Files

```
apps/api/src/
├── server.ts                    # ADD: registerMetricsStreamRoute(app), start/stopMetricsStreamJob lifecycle
packages/config/src/
├── sse.ts                       # ADD: SSE_METRICS_STREAM_POLL_MS constant (15_000)
packages/types/src/
├── sse.ts                       # ADD: MetricsStreamEvent interface
apps/api/src/config/
├── jobs.ts                      # ADD: METRICS_STREAM_POLL_MS to JOB_INTERVALS
apps/api/src/lib/
├── event-emitter.ts             # ADD: emitMetricsStream() typed method
```

### Pattern 1: SSE Route (from ai-stream.ts)

**What:** Raw Fastify SSE response with manual headers, heartbeat, and cleanup.
**When to use:** All non-tRPC streaming endpoints.
**Example (verified from existing `ai-stream.ts` lines 85-100):**

```typescript
// Source: apps/api/src/routes/ai-stream.ts (existing proven pattern)
reply.raw.writeHead(200, {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
})

const writeEvent = (event: string, payload: Record<string, unknown>) => {
  reply.raw.write(`event: ${event}\n`)
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`)
}

const heartbeat = setInterval(() => {
  reply.raw.write(':keepalive\n\n')
}, SSE_HEARTBEAT_INTERVAL_MS) // 30_000 from @voyager/config

// Cleanup on disconnect
request.raw.on('close', () => {
  clearInterval(heartbeat)
  // unsubscribe from voyagerEmitter
})
```

### Pattern 2: Reference-Counted Polling Job

**What:** Start/stop K8s API polling based on active subscriber count per cluster.
**When to use:** When server-side resources (K8s API calls) should only run when clients need them.

```typescript
// Source: Architecture research + metrics-history-collector.ts patterns
const activePollers = new Map<string, { interval: NodeJS.Timeout; subscribers: Set<string> }>()

function subscribe(clusterId: string, connectionId: string): void {
  let poller = activePollers.get(clusterId)
  if (!poller) {
    const interval = setInterval(() => pollMetrics(clusterId), POLL_INTERVAL_MS)
    poller = { interval, subscribers: new Set() }
    activePollers.set(clusterId, poller)
    // Immediate first poll -- don't make client wait for first interval
    void pollMetrics(clusterId)
  }
  poller.subscribers.add(connectionId)
}

function unsubscribe(clusterId: string, connectionId: string): void {
  const poller = activePollers.get(clusterId)
  if (!poller) return
  poller.subscribers.delete(connectionId)
  if (poller.subscribers.size === 0) {
    clearInterval(poller.interval)
    activePollers.delete(clusterId)
  }
}
```

### Pattern 3: EventEmitter Channel Per Cluster

**What:** `voyagerEmitter` emits events on `metrics-stream:${clusterId}` channels.
**When to use:** Decoupling the polling job from SSE connections (one poller, many consumers).

```typescript
// Source: apps/api/src/lib/event-emitter.ts (extend existing pattern)
// Add to VoyagerEventEmitter class:
emitMetricsStream(clusterId: string, event: MetricsStreamEvent): void {
  this.emit(`metrics-stream:${clusterId}`, event)
}

// SSE route subscribes:
const handler = (event: MetricsStreamEvent) => writeEvent('metrics', event)
voyagerEmitter.on(`metrics-stream:${clusterId}`, handler)

// Cleanup:
voyagerEmitter.off(`metrics-stream:${clusterId}`, handler)
```

### Pattern 4: Auth in Non-tRPC Routes

**What:** Session validation via `auth.api.getSession()` with headers from request.
**When to use:** All non-tRPC routes that require authentication.
**Example (from ai-stream.ts lines 33-40):**

```typescript
const headers = new Headers()
for (const [key, value] of Object.entries(request.headers)) {
  if (value) headers.append(key, String(value))
}
const sessionResult = await auth.api.getSession({ headers }).catch(() => null)
if (!sessionResult?.session || !sessionResult.user) {
  reply.code(401).send({ error: 'Unauthorized' })
  return
}
```

### Anti-Patterns to Avoid

- **Creating a new K8s client per SSE connection:** Use the shared `clusterClientPool.getClient(clusterId)` which caches KubeConfig per cluster. Creating a new client per connection wastes memory and re-decrypts credentials unnecessarily.
- **Using `tRPC subscriptions` for this:** tRPC v11 subscriptions require WebSocket transport (httpSubscriptionLink). The codebase uses raw Fastify SSE for streaming. Don't introduce a second transport.
- **Polling K8s without reference counting:** Without ref counting, opening the metrics tab for 3 clusters = 3 setInterval loops. Closing the tab leaves them running forever. Always tie polling lifecycle to subscriber count.
- **Using `httpBatchLink` or batching SSE with other requests:** CLAUDE.md Gotcha #1 explicitly forbids `httpBatchLink`. SSE is a separate long-lived connection, not a batched request.
- **Forgetting to call `reply.raw.end()` on disconnect:** The SSE connection must be explicitly ended when the client disconnects (detected via `request.raw.on('close')`). Not ending it leaks file descriptors.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| K8s metrics parsing | Custom CPU/memory parsers | `parseCpuToNano()`, `parseMemToBytes()` from `lib/k8s-units.ts` | Already handles all K8s unit formats (n, u, m, Ki, Mi, Gi) |
| K8s client creation | Direct KubeConfig instantiation | `clusterClientPool.getClient(clusterId)` | Handles credential decryption, token refresh, multi-cloud (EKS/AKS/GKE) |
| SSE heartbeat constants | Hardcoded `30000` | `SSE_HEARTBEAT_INTERVAL_MS` from `@voyager/config` | Centralized config, already used by `ai-stream.ts` |
| Cluster existence validation | Manual SQL query | `db.select().from(clusters).where(eq(clusters.id, clusterId))` | Drizzle ORM pattern used throughout codebase |
| Unique connection IDs | Custom UUID generator | `crypto.randomUUID()` | Node.js built-in, no dependency needed |

**Key insight:** Every piece of infrastructure this phase needs already exists in the codebase. The work is assembly and lifecycle management, not building new capabilities.

## Common Pitfalls

### Pitfall 1: Forgetting Immediate First Poll
**What goes wrong:** Client connects, waits up to 15 seconds for the first data point.
**Why it happens:** `setInterval` fires after the first interval, not immediately.
**How to avoid:** Call `pollMetrics(clusterId)` synchronously (fire-and-forget) when the first subscriber connects, then start the interval.
**Warning signs:** User sees empty chart for 15 seconds on connection.

### Pitfall 2: Race Condition on Rapid Connect/Disconnect
**What goes wrong:** Client connects, immediately disconnects, interval keeps running for a cluster with zero subscribers.
**Why it happens:** `subscribe()` and `unsubscribe()` execute asynchronously; the first poll may still be in-flight when unsubscribe is called.
**How to avoid:** Check subscriber count after clearing interval. If in-flight poll completes and finds zero subscribers, don't emit. Guard the `emit` call: `if (activePollers.has(clusterId) && activePollers.get(clusterId)!.subscribers.size > 0)`.
**Warning signs:** Log messages showing "collecting metrics for cluster X" when no clients are connected.

### Pitfall 3: K8s Metrics-Server Unavailable
**What goes wrong:** Metrics-server is not installed on the cluster (common in dev/test). The poll throws an error every 15 seconds, flooding logs.
**Why it happens:** Not all clusters have metrics-server deployed.
**How to avoid:** Catch the error, emit an SSE `error` event with `code: 'METRICS_UNAVAILABLE'`, and increase the poll interval (backoff) to avoid log spam. The existing `metrics-history-collector.ts` already handles this gracefully (lines 113-126: catch and warn).
**Warning signs:** Repeated `[metrics-stream] failed for cluster X` log lines every 15 seconds.

### Pitfall 4: Memory Leak from Unregistered Event Listeners
**What goes wrong:** Each SSE connection adds a listener to `voyagerEmitter` via `.on()`. If the `close` handler fails to call `.off()`, listeners accumulate indefinitely.
**Why it happens:** The `close` event handler has a bug or the `off()` call uses a different function reference than the one passed to `on()`.
**How to avoid:** Store the handler function in a `const` before calling `on()`, then pass the same reference to `off()`. The existing `voyagerEmitter.setMaxListeners(100)` provides a safety net, but proper cleanup is essential.
**Warning signs:** Node.js "MaxListenersExceededWarning" in console.

### Pitfall 5: Not Validating ClusterId Before Subscribing
**What goes wrong:** Client sends a non-existent or inactive clusterId. The job tries to create a K8s client and fails.
**Why it happens:** Missing input validation at the route level.
**How to avoid:** Validate `clusterId` is a UUID (Zod schema), then verify the cluster exists in the database before subscribing. Return 404 if not found, 400 if invalid UUID.
**Warning signs:** Stack traces from `clusterClientPool.getClient()` with "Cluster X not found".

### Pitfall 6: SSE Behind Reverse Proxy Buffering
**What goes wrong:** Nginx or other reverse proxy buffers SSE responses, client receives events in batches instead of real-time.
**Why it happens:** Default proxy buffering is enabled. The `X-Accel-Buffering: no` header is needed.
**How to avoid:** Add `'x-accel-buffering': 'no'` to the SSE response headers alongside `cache-control: no-cache`.
**Warning signs:** Client receives multiple events at once after long pauses instead of one-at-a-time.

## Code Examples

### Complete SSE Route Structure (metrics-stream.ts)

```typescript
// Source: Synthesized from ai-stream.ts pattern + architecture research
import { SSE_HEARTBEAT_INTERVAL_MS } from '@voyager/config'
import type { MetricsStreamEvent } from '@voyager/types'
import { clusters, db } from '@voyager/db'
import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { auth } from '../lib/auth.js'
import { voyagerEmitter } from '../lib/event-emitter.js'
import { metricsStreamJob } from '../jobs/metrics-stream-job.js'

const querySchema = z.object({
  clusterId: z.string().uuid(),
})

export async function registerMetricsStreamRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/metrics/stream', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Validate input
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      reply.code(400).send({ error: 'Invalid clusterId' })
      return
    }

    // 2. Authenticate
    const headers = new Headers()
    for (const [key, value] of Object.entries(request.headers)) {
      if (value) headers.append(key, String(value))
    }
    const sessionResult = await auth.api.getSession({ headers }).catch(() => null)
    if (!sessionResult?.session || !sessionResult.user) {
      reply.code(401).send({ error: 'Unauthorized' })
      return
    }

    // 3. Verify cluster exists
    const { clusterId } = parsed.data
    const [cluster] = await db.select({ id: clusters.id }).from(clusters).where(eq(clusters.id, clusterId))
    if (!cluster) {
      reply.code(404).send({ error: 'Cluster not found' })
      return
    }

    // 4. Start SSE stream
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    })

    const connectionId = crypto.randomUUID()

    // 5. Subscribe to metrics events for this cluster
    const handler = (event: MetricsStreamEvent) => {
      reply.raw.write(`event: metrics\ndata: ${JSON.stringify(event)}\n\n`)
    }
    voyagerEmitter.on(`metrics-stream:${clusterId}`, handler)
    metricsStreamJob.subscribe(clusterId, connectionId)

    // 6. Heartbeat
    const heartbeat = setInterval(() => {
      reply.raw.write(':keepalive\n\n')
    }, SSE_HEARTBEAT_INTERVAL_MS)

    // 7. Cleanup on disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeat)
      voyagerEmitter.off(`metrics-stream:${clusterId}`, handler)
      metricsStreamJob.unsubscribe(clusterId, connectionId)
    })
  })
}
```

### Complete MetricsStreamJob Structure (metrics-stream-job.ts)

```typescript
// Source: Synthesized from metrics-history-collector.ts pattern + architecture research
import * as k8s from '@kubernetes/client-node'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { voyagerEmitter } from '../lib/event-emitter.js'
import { parseCpuToNano, parseMemToBytes } from '../lib/k8s-units.js'

const POLL_INTERVAL_MS = 15_000  // Should come from config
const POLL_TIMEOUT_MS = 10_000

interface Poller {
  interval: NodeJS.Timeout
  subscribers: Set<string>
}

class MetricsStreamJob {
  private pollers = new Map<string, Poller>()

  subscribe(clusterId: string, connectionId: string): void {
    let poller = this.pollers.get(clusterId)
    if (!poller) {
      const interval = setInterval(() => void this.poll(clusterId), POLL_INTERVAL_MS)
      poller = { interval, subscribers: new Set() }
      this.pollers.set(clusterId, poller)
      void this.poll(clusterId) // Immediate first poll
    }
    poller.subscribers.add(connectionId)
  }

  unsubscribe(clusterId: string, connectionId: string): void {
    const poller = this.pollers.get(clusterId)
    if (!poller) return
    poller.subscribers.delete(connectionId)
    if (poller.subscribers.size === 0) {
      clearInterval(poller.interval)
      this.pollers.delete(clusterId)
    }
  }

  /** Stop all pollers (used during graceful shutdown) */
  stopAll(): void {
    for (const [, poller] of this.pollers) {
      clearInterval(poller.interval)
    }
    this.pollers.clear()
  }

  private async poll(clusterId: string): Promise<void> {
    // Guard: don't emit if no subscribers (race condition protection)
    if (!this.pollers.has(clusterId)) return

    try {
      const kc = await clusterClientPool.getClient(clusterId)
      const metricsClient = new k8s.Metrics(kc)
      const coreApi = kc.makeApiClient(k8s.CoreV1Api)

      // Reuse collection logic from metrics-history-collector.ts
      const [nodesRes, nodeMetrics] = await Promise.all([
        coreApi.listNode(),
        metricsClient.getNodeMetrics(),
      ])

      // ... compute cpuPercent, memPercent, pods, network ...

      voyagerEmitter.emit(`metrics-stream:${clusterId}`, {
        clusterId,
        timestamp: new Date().toISOString(),
        cpu: cpuPercent,
        memory: memPercent,
        pods: podCount,
        networkBytesIn,
        networkBytesOut,
      })
    } catch (err) {
      // Emit error event so client knows metrics are unavailable
      voyagerEmitter.emit(`metrics-stream:${clusterId}`, {
        clusterId,
        timestamp: new Date().toISOString(),
        error: { code: 'METRICS_UNAVAILABLE', message: err instanceof Error ? err.message : 'Unknown error' },
      })
    }
  }

  getStatus(): { activePollers: number; clusterIds: string[] } {
    return {
      activePollers: this.pollers.size,
      clusterIds: Array.from(this.pollers.keys()),
    }
  }
}

export const metricsStreamJob = new MetricsStreamJob()
```

### server.ts Registration Pattern

```typescript
// Source: apps/api/src/server.ts (existing pattern on line 238)
// Add alongside existing route registrations:
import { registerMetricsStreamRoute } from './routes/metrics-stream.js'

await registerMetricsStreamRoute(app)

// In shutdown handler (alongside existing stop calls):
import { metricsStreamJob } from './jobs/metrics-stream-job.js'

// In the SIGTERM/SIGINT handler:
metricsStreamJob.stopAll()
```

### New Type in @voyager/types/sse.ts

```typescript
// Source: Extend existing MetricsEvent type pattern
export interface MetricsStreamEvent {
  clusterId: string
  timestamp: string           // ISO 8601
  cpu: number | null          // percentage (0-100)
  memory: number | null       // percentage (0-100)
  pods: number | null         // count
  networkBytesIn: number      // bytes
  networkBytesOut: number     // bytes
  error?: {
    code: string
    message: string
  }
}
```

### New Config Constant in packages/config/src/sse.ts

```typescript
// Add to existing SSE config file:
/** How often MetricsStreamJob polls K8s metrics-server for SSE subscribers (ms) */
export const SSE_METRICS_STREAM_POLL_MS = 15_000
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `SSE_METRICS_INTERVAL_MS = 5_000` (existing constant) | `SSE_METRICS_STREAM_POLL_MS = 15_000` (new constant) | Phase 2 | The existing 5s constant was for ClusterWatchManager internal metrics push. The new 15s constant is for K8s metrics-server API polling (different concern, different rate) |
| No SSE for metrics | Dedicated SSE endpoint for live metrics | Phase 2 | 5m/15m ranges get 15s resolution instead of 60s DB intervals |
| `MetricsEvent` (existing type) | `MetricsStreamEvent` (new type) | Phase 2 | Different shape -- MetricsStreamEvent includes network bytes and optional error field |

**Existing `MetricsEvent` vs new `MetricsStreamEvent`:** The existing `MetricsEvent` in `@voyager/types/sse.ts` has `cpuPercent`, `memoryPercent`, `memoryBytes`, `cpuCores`, `podCount`. The new `MetricsStreamEvent` has `cpu`, `memory`, `pods`, `networkBytesIn`, `networkBytesOut` (matching the `history` response shape from Phase 1). These are intentionally different types for different purposes.

## Open Questions

1. **Network bytes from K8s metrics-server**
   - What we know: `metrics-history-collector.ts` attempts to read `network.rx_bytes`/`network.tx_bytes` from pod container usage, but this is not standard metrics-server output. It returns `null` in most clusters.
   - What's unclear: Whether the SSE stream should include network bytes at all if they are consistently null.
   - Recommendation: Include the fields in the type and emit them. If they are null, the frontend (Phase 3) can hide the network panel. No harm in sending null values.

2. **Max connections limit**
   - What we know: The architecture research suggests 10 per cluster, 50 global.
   - What's unclear: Whether this needs enforcement in Phase 2 or can wait.
   - Recommendation: Implement a simple global counter and per-cluster counter. Return 429 (Too Many Requests) if exceeded. This is 5-10 lines of code and prevents resource exhaustion.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). Phase 2 is purely code/config changes within the existing monorepo. All required libraries are already installed. K8s metrics-server availability is a runtime concern (handled gracefully in code), not a build-time dependency.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `pnpm --filter api test -- src/__tests__/metrics-stream.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SSE-01 | SSE endpoint returns 200 with correct headers, emits events on `voyagerEmitter` emission, sends heartbeat | unit | `pnpm --filter api test -- src/__tests__/metrics-stream.test.ts -x` | Wave 0 |
| SSE-01 | Auth required -- returns 401 without session cookie | unit | `pnpm --filter api test -- src/__tests__/metrics-stream.test.ts -x` | Wave 0 |
| SSE-01 | Returns 404 for non-existent clusterId | unit | `pnpm --filter api test -- src/__tests__/metrics-stream.test.ts -x` | Wave 0 |
| SSE-02 | Subscribe starts polling, unsubscribe stops polling when last subscriber leaves | unit | `pnpm --filter api test -- src/__tests__/metrics-stream-job.test.ts -x` | Wave 0 |
| SSE-02 | Multiple subscribers share one poller, poller stops only when all unsubscribe | unit | `pnpm --filter api test -- src/__tests__/metrics-stream-job.test.ts -x` | Wave 0 |
| SSE-02 | Immediate first poll on first subscriber (no 15s wait) | unit | `pnpm --filter api test -- src/__tests__/metrics-stream-job.test.ts -x` | Wave 0 |
| SSE-02 | `stopAll()` clears all pollers (graceful shutdown) | unit | `pnpm --filter api test -- src/__tests__/metrics-stream-job.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter api test -- src/__tests__/metrics-stream.test.ts src/__tests__/metrics-stream-job.test.ts -x`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/__tests__/metrics-stream.test.ts` -- covers SSE-01 (route tests)
- [ ] `apps/api/src/__tests__/metrics-stream-job.test.ts` -- covers SSE-02 (reference counting, polling lifecycle)

## Sources

### Primary (HIGH confidence)
- `apps/api/src/routes/ai-stream.ts` -- Existing SSE pattern with Fastify raw response, auth, heartbeat
- `apps/api/src/lib/event-emitter.ts` -- VoyagerEventEmitter with typed emit methods
- `apps/api/src/jobs/metrics-history-collector.ts` -- K8s metrics collection, CPU/memory parsing, timeout handling
- `apps/api/src/lib/cluster-client-pool.ts` -- K8s client caching with multi-cloud credential handling
- `apps/api/src/lib/k8s-units.ts` -- CPU/memory unit parsers
- `apps/api/src/server.ts` -- Route registration and job lifecycle patterns
- `packages/config/src/sse.ts` -- SSE constants (heartbeat, buffer size, etc.)
- `packages/types/src/sse.ts` -- Existing SSE event type definitions
- `.planning/research/ARCHITECTURE.md` -- Full architecture design for dual data source metrics

### Secondary (MEDIUM confidence)
- Node.js EventEmitter API -- `.on()` / `.off()` semantics verified from Node.js docs
- Fastify 5 `reply.raw` -- raw HTTP response writing verified from existing codebase usage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all libraries already in use and verified
- Architecture: HIGH -- all patterns derived from existing codebase code (`ai-stream.ts`, `metrics-history-collector.ts`, `event-emitter.ts`)
- Pitfalls: HIGH -- derived from real patterns in the codebase (e.g., metrics-server unavailability is already handled in collector)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (30 days -- stable domain, no external dependency changes expected)
