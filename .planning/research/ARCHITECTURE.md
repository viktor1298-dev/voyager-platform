# Architecture Patterns: Dual Data Source Metrics Visualization

**Domain:** Kubernetes operations dashboard -- real-time + historical metrics
**Researched:** 2026-03-28
**Overall confidence:** HIGH (existing codebase analyzed, Recharts API verified, SSE patterns production-proven in this codebase)

---

## Recommended Architecture

### System Overview

```
                          Client (Next.js)
                               |
            +---------+--------+--------+---------+
            |         |                 |         |
    useMetricsData  CrosshairProvider  Zustand   tRPC
     (hook)          (context)         Store     Client
            |                                     |
     +------+------+                              |
     |             |                              |
  SSE Stream   tRPC Query                    Fastify API
  (EventSource)  (history)                        |
     |             |              +---------------+---------------+
     |             |              |               |               |
     |        metrics.history  metrics.stream  K8s Metrics    PostgreSQL
     |        (DB bucketed)    (SSE endpoint)   Server        (metrics_history)
     |                              |               |
     |                   voyagerEmitter --------+   |
     |                              |           |   |
     |                   MetricsStreamJob   ClusterWatchManager
     |                   (15s K8s poll)     (existing 30s poll)
     |                              |
     +--------- EventSource -------+
```

### Data Flow Summary

1. **Short ranges (5m, 15m):** Client opens SSE connection -> MetricsStreamJob polls K8s metrics-server every 15s -> emits via voyagerEmitter -> SSE endpoint forwards to client -> client renders directly from buffer
2. **Historical ranges (30m+):** Client calls tRPC `metrics.history` -> backend queries PostgreSQL with time_bucket aggregation -> returns bucketed series with null-filled gaps -> client renders
3. **Transition (user changes range):** Client hook detects range change -> closes SSE if switching to historical, opens SSE if switching to live -> no data loss during transition because historical query provides immediate backfill

---

## Component Boundaries

### Backend Components

| Component | Location | Responsibility | Communicates With |
|-----------|----------|---------------|-------------------|
| **MetricsStreamJob** | `api/src/jobs/metrics-stream.ts` (new) | Polls K8s metrics-server at 15s interval for SSE-subscribed clusters only | ClusterClientPool, voyagerEmitter |
| **MetricsSSERoute** | `api/src/routes/metrics-stream.ts` (new) | Fastify SSE endpoint, manages per-connection state, heartbeat, backpressure | voyagerEmitter, auth |
| **MetricsRouter** (existing) | `api/src/routers/metrics.ts` | Historical DB queries with bucket aggregation | PostgreSQL via Drizzle |
| **MetricsHistoryCollector** (existing) | `api/src/jobs/metrics-history-collector.ts` | 60s DB persistence of cluster metrics | K8s metrics-server, PostgreSQL |
| **VoyagerEmitter** (existing) | `api/src/lib/event-emitter.ts` | Decouples producers from SSE consumers | All event producers/consumers |

### Frontend Components

| Component | Location | Responsibility | Communicates With |
|-----------|----------|---------------|-------------------|
| **useMetricsData** | `web/src/hooks/useMetricsData.ts` (new) | Orchestrates data source switching, merges SSE + historical data | SSE endpoint, tRPC, MetricsBuffer |
| **MetricsBuffer** | `web/src/lib/metrics-buffer.ts` (new) | Circular buffer for live SSE points, max-point enforcement, dedup | useMetricsData |
| **CrosshairProvider** | `web/src/components/metrics/CrosshairProvider.tsx` (new) | React context for synchronized crosshair state across panels | All MetricsPanel instances |
| **MetricsAreaChart** (modified) | `web/src/components/metrics/MetricsAreaChart.tsx` | Recharts rendering with syncId, custom cursor, custom tooltip | CrosshairProvider |
| **MetricsTimeSeriesPanel** (modified) | `web/src/components/metrics/MetricsTimeSeriesPanel.tsx` | Panel orchestration, range controls, series toggles | useMetricsData, MetricsAreaChart |
| **TimeRangeSelector** (modified) | `web/src/components/metrics/TimeRangeSelector.tsx` | Grafana-standard range picker with custom date option | MetricsTimeSeriesPanel |

---

## Detailed Component Design

### 1. SSE Endpoint Design (`MetricsSSERoute`)

**Endpoint:** `GET /api/metrics/stream?clusterId={uuid}`

**Why a dedicated Fastify route (not tRPC subscription):** tRPC subscriptions in v11 use WebSocket transport by default. The existing codebase uses raw Fastify SSE routes for streaming (see `ai-stream.ts`). Maintaining consistency with the established SSE pattern avoids introducing WebSocket infrastructure.

**Event Format:**

```typescript
// SSE event: "metrics"
interface MetricsStreamEvent {
  clusterId: string
  timestamp: string          // ISO 8601
  cpu: number | null         // percentage (0-100)
  memory: number | null      // percentage (0-100)
  pods: number | null        // count
  networkBytesIn: number     // bytes
  networkBytesOut: number    // bytes
  nodes: NodeMetricPoint[]   // per-node breakdown
}

interface NodeMetricPoint {
  name: string
  cpuPercent: number
  memPercent: number
  cpuMillis: number
  memMi: number
}
```

**SSE Protocol:**

```
event: metrics
data: {"clusterId":"...","timestamp":"2026-03-28T10:00:15.000Z","cpu":42.3,...}

event: metrics
data: {"clusterId":"...","timestamp":"2026-03-28T10:00:30.000Z","cpu":43.1,...}

:keepalive

event: error
data: {"code":"CLUSTER_UNAVAILABLE","message":"..."}
```

**Backpressure Handling:**

The SSE endpoint MUST handle slow clients. Pattern:

```typescript
// In metrics-stream.ts route handler
const WRITE_TIMEOUT_MS = 5_000
const MAX_BUFFERED_EVENTS = 50

let bufferedCount = 0

function writeEvent(reply: FastifyReply, event: string, data: unknown): boolean {
  if (bufferedCount >= MAX_BUFFERED_EVENTS) {
    // Client can't keep up -- drop oldest, send gap marker
    writeEvent(reply, 'gap', { dropped: bufferedCount, timestamp: new Date().toISOString() })
    bufferedCount = 0
    return false
  }

  const ok = reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  if (!ok) {
    // Writable stream is full -- Node.js backpressure
    bufferedCount++
    reply.raw.once('drain', () => { bufferedCount = 0 })
  }
  return ok
}
```

**Per-Cluster Subscription Management:**

The SSE endpoint should NOT create a new K8s poller per connection. Instead:

1. Client connects with `clusterId`
2. Route checks if `MetricsStreamJob` is already polling this cluster
3. If not, starts polling (15s interval via `setInterval`)
4. Route subscribes to `voyagerEmitter.on('metrics-stream:${clusterId}', handler)`
5. On disconnect, unsubscribe from emitter
6. `MetricsStreamJob` stops polling a cluster when zero SSE consumers remain (reference counting)

```typescript
// Reference counting for per-cluster polling
const clusterSubscribers = new Map<string, Set<string>>() // clusterId -> connectionIds

function addSubscriber(clusterId: string, connId: string): void {
  if (!clusterSubscribers.has(clusterId)) {
    clusterSubscribers.set(clusterId, new Set())
    startClusterMetricsPoll(clusterId) // begin 15s polling
  }
  clusterSubscribers.get(clusterId)!.add(connId)
}

function removeSubscriber(clusterId: string, connId: string): void {
  const subs = clusterSubscribers.get(clusterId)
  if (!subs) return
  subs.delete(connId)
  if (subs.size === 0) {
    stopClusterMetricsPoll(clusterId)
    clusterSubscribers.delete(clusterId)
  }
}
```

**Authentication:** Validate session cookie on connection (same pattern as `ai-stream.ts`). No re-auth during stream -- if session expires, client gets disconnect and reconnects with new session.

**Heartbeat:** Use existing `SSE_HEARTBEAT_INTERVAL_MS` (30s) from `@voyager/config/sse`.

---

### 2. Data Source Switching Logic

**The decision is range-driven and deterministic:**

| Time Range | Data Source | Polling Interval | Bucket Size | Expected Points |
|------------|------------|-----------------|-------------|-----------------|
| 5m | SSE live | 15s | raw (15s) | ~20 |
| 15m | SSE live | 15s | raw (15s) | ~60 |
| 30m | DB historical | -- | 60s (1 per collector tick) | 30 |
| 1h | DB historical | -- | 120s | 30 |
| 3h | DB historical | -- | 360s (6m) | 30 |
| 6h | DB historical | -- | 720s (12m) | 30 |
| 12h | DB historical | -- | 1440s (24m) | 30 |
| 24h | DB historical | -- | 3600s (1h) | 24 |
| 2d | DB historical | -- | 7200s (2h) | 24 |
| 7d | DB historical | -- | 21600s (6h) | 28 |
| custom | DB historical | -- | auto-calculated | ~30 target |

**Design Principle:** Target ~20-30 data points per chart regardless of range. This keeps Recharts performant and produces Grafana-density charts. The bucket size is `rangeMs / targetPoints`.

**Threshold:** 15 minutes is the cutoff. Rationale:
- Collector writes DB rows every 60s
- For 15m range: 15 points from DB (sparse but workable)
- For 5m range: only 5 points from DB (too sparse, looks broken)
- SSE at 15s gives 20 points in 5m and 60 in 15m (good density)
- 30m range: 30 points from DB at 60s intervals (sufficient)

**Implementation -- `useMetricsData` hook:**

```typescript
type DataSourceMode = 'live' | 'historical'

function getDataSourceMode(range: MetricsRange): DataSourceMode {
  return range === '5m' || range === '15m' ? 'live' : 'historical'
}

function useMetricsData(clusterId: string, range: MetricsRange) {
  const mode = getDataSourceMode(range)

  // Historical: standard tRPC query
  const historyQuery = trpc.metrics.history.useQuery(
    { clusterId, range },
    { enabled: mode === 'historical', staleTime: 30_000 }
  )

  // Live: SSE connection + circular buffer
  const liveData = useMetricsSSE(clusterId, {
    enabled: mode === 'live',
    maxPoints: range === '5m' ? 25 : 65,
    rangeMs: range === '5m' ? 5 * 60_000 : 15 * 60_000,
  })

  // Unified output
  return {
    data: mode === 'live' ? liveData.points : (historyQuery.data ?? []),
    isLoading: mode === 'live' ? !liveData.hasData : historyQuery.isLoading,
    isLive: mode === 'live',
    connectionState: liveData.connectionState,
    lastUpdated: mode === 'live' ? liveData.lastTimestamp : historyQuery.dataUpdatedAt,
  }
}
```

**Range Change Behavior:**

When the user switches from `15m` (live) to `1h` (historical):
1. `useMetricsData` detects `mode` changed to `'historical'`
2. `useMetricsSSE` disabled -- EventSource closes (cleanup in useEffect return)
3. tRPC query enabled -- fetches DB data
4. No flash of empty state because previous data stays rendered until new data arrives (React Query keeps stale data visible)

When switching from `1h` (historical) to `5m` (live):
1. `useMetricsData` detects `mode` changed to `'live'`
2. tRPC query disabled
3. `useMetricsSSE` enabled -- EventSource opens, buffer starts filling
4. Show "Connecting..." indicator while buffer is empty
5. First SSE point arrives (~15s max) -- chart renders single point, then fills

---

### 3. Client-Side Data Merging (MetricsBuffer)

**Why a circular buffer:** SSE streams indefinitely. Without bounds, memory grows linearly. A circular buffer caps memory at `maxPoints * pointSize` regardless of connection duration.

**Implementation:**

```typescript
class MetricsBuffer {
  private buffer: MetricsDataPoint[]
  private head = 0
  private count = 0
  private readonly capacity: number
  private readonly rangeMs: number

  constructor(capacity: number, rangeMs: number) {
    this.capacity = capacity
    this.rangeMs = rangeMs
    this.buffer = new Array(capacity)
  }

  push(point: MetricsDataPoint): void {
    this.buffer[this.head] = point
    this.head = (this.head + 1) % this.capacity
    if (this.count < this.capacity) this.count++
    this.evictOutOfRange()
  }

  /** Remove points older than rangeMs from now */
  private evictOutOfRange(): void {
    const cutoff = Date.now() - this.rangeMs
    // Walk from tail, evict old points
    while (this.count > 0) {
      const tailIndex = (this.head - this.count + this.capacity) % this.capacity
      const point = this.buffer[tailIndex]
      if (point && new Date(point.timestamp).getTime() < cutoff) {
        this.count--
      } else {
        break
      }
    }
  }

  /** Return ordered array (oldest to newest) for Recharts */
  toArray(): MetricsDataPoint[] {
    const result: MetricsDataPoint[] = []
    for (let i = 0; i < this.count; i++) {
      const index = (this.head - this.count + i + this.capacity) % this.capacity
      const point = this.buffer[index]
      if (point) result.push(point)
    }
    return result
  }

  get size(): number { return this.count }
  get hasData(): boolean { return this.count > 0 }
}
```

**Memory budget:** Each `MetricsDataPoint` is ~200 bytes JSON. At 65 points max (15m range), that is ~13KB per panel. With 4 panels sharing the same data, total is ~13KB. Negligible.

**No historical backfill merge needed for live mode.** The SSE stream provides all data for the visible 5m/15m window. If the user opens the page on a 5m range, the chart starts empty and fills over 5 minutes. This matches Grafana behavior (Grafana also shows an empty region for time not yet observed in "Live" mode). There is no benefit to backfilling from DB because DB data at 60s granularity looks visibly different from SSE data at 15s granularity -- mixing them creates jarring density changes.

**When the user switches from `5m` live to `15m` live:** The buffer capacity increases, and old 5m data stays in the buffer (still within the 15m window). No data loss.

---

### 4. Recharts Synchronized Crosshair Pattern

**Approach: Use Recharts built-in `syncId` prop.** Confidence: HIGH. Recharts 3.7+ (installed version) fully supports `syncId` with Redux-based internal state management.

**How it works:**
1. All 4 `<AreaChart>` instances share `syncId="metrics-panel"`
2. When user hovers over any chart, Recharts internally propagates the tooltip index to all other charts with the same `syncId`
3. All charts show their tooltip at the same X position simultaneously
4. The built-in `cursor` prop on `<Tooltip>` renders a vertical line at the hover position

**Implementation in MetricsAreaChart:**

```tsx
<AreaChart
  syncId="metrics-panel"            // Same ID across all 4 panels
  data={chartData}
  margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
>
  <Tooltip
    content={<CustomTooltip />}
    cursor={{
      stroke: 'var(--color-crosshair)',
      strokeWidth: 1,
      strokeDasharray: '4 2',
    }}
  />
  {/* ... areas, axes, etc. */}
</AreaChart>
```

**Why `syncId` works here (no custom `syncMethod` needed):**
- All 4 panels render the same `data` array (same timestamps, same length)
- Default `syncMethod="index"` works perfectly because data indices are aligned
- No coordinate translation needed between panels

**Custom Crosshair Cursor (optional enhancement):**

If the built-in cursor styling is insufficient, pass a custom SVG component:

```tsx
function CrosshairCursor({ x, y, height }: { x: number; y: number; height: number }) {
  return (
    <line
      x1={x} y1={0}
      x2={x} y2={height}
      stroke="var(--color-crosshair)"
      strokeWidth={1}
      strokeDasharray="4 2"
      opacity={0.7}
    />
  )
}

// Usage
<Tooltip cursor={<CrosshairCursor />} />
```

**CrosshairProvider (React Context) -- for non-Recharts UI sync:**

The Recharts `syncId` handles tooltip/cursor sync between charts. But the `CrosshairProvider` context is needed for:
- Showing the hovered timestamp in a shared header bar above all panels
- Highlighting the corresponding row in the NodeMetricsTable below the charts
- Enabling keyboard navigation (left/right arrow to move crosshair)

```typescript
interface CrosshairState {
  activeIndex: number | null    // data point index being hovered
  activeTimestamp: string | null // ISO timestamp for display
  isHovering: boolean
}

const CrosshairContext = createContext<{
  state: CrosshairState
  setActiveIndex: (index: number | null) => void
}>()
```

This context wraps the entire metrics panel area. Recharts' `onMouseMove` callback on `<AreaChart>` updates the context, and non-chart components read from it.

---

### 5. Bucket Alignment Between Collector and Display

**The root cause of the current broken behavior:** The existing time range config defines sub-minute buckets (5s for 30s range, 10s for 1m range) but the collector writes every 60s. These buckets are always empty.

**Fix -- two-tier architecture:**

| Tier | Source | Resolution | Bucket Strategy |
|------|--------|-----------|----------------|
| Live (5m, 15m) | SSE from K8s metrics-server | 15s raw | No bucketing -- raw points plotted directly |
| Historical (30m+) | PostgreSQL metrics_history | 60s collector interval | Server-side aggregation with `time_bucket` |

**Historical Bucket Alignment Rules:**

The bucket interval MUST be >= collector interval (60s). The system already has TimescaleDB (the DB image is `timescale/timescaledb:latest-pg17`), so use `time_bucket()` for server-side aggregation:

```sql
-- Example: 1h range, 120s buckets -> 30 points
SELECT
  time_bucket('120 seconds', timestamp) AS bucket,
  avg(cpu_percent) AS cpu,
  avg(mem_percent) AS memory,
  avg(pod_count)::int AS pods,
  avg(network_bytes_in)::bigint AS network_bytes_in,
  avg(network_bytes_out)::bigint AS network_bytes_out
FROM metrics_history
WHERE cluster_id = $1
  AND timestamp >= $2
  AND timestamp < $3
GROUP BY bucket
ORDER BY bucket
```

**Revised time range config (replaces the broken one in metrics.ts):**

```typescript
const TIME_RANGE_CONFIG = {
  '5m':  { rangeMs: 5 * 60_000,      source: 'sse',  bucketMs: null },       // raw SSE points
  '15m': { rangeMs: 15 * 60_000,     source: 'sse',  bucketMs: null },       // raw SSE points
  '30m': { rangeMs: 30 * 60_000,     source: 'db',   bucketMs: 60_000 },     // 30 points
  '1h':  { rangeMs: 60 * 60_000,     source: 'db',   bucketMs: 120_000 },    // 30 points
  '3h':  { rangeMs: 3 * 60 * 60_000, source: 'db',   bucketMs: 360_000 },    // 30 points
  '6h':  { rangeMs: 6 * 60 * 60_000, source: 'db',   bucketMs: 720_000 },    // 30 points
  '12h': { rangeMs: 12 * 60 * 60_000,source: 'db',   bucketMs: 1_440_000 },  // 30 points
  '24h': { rangeMs: 24 * 60 * 60_000,source: 'db',   bucketMs: 3_600_000 },  // 24 points
  '2d':  { rangeMs: 2 * 24 * 60 * 60_000,source: 'db', bucketMs: 7_200_000 },// 24 points
  '7d':  { rangeMs: 7 * 24 * 60 * 60_000,source: 'db', bucketMs: 21_600_000},// 28 points
} as const
```

**Null-fill for gaps:** The existing `getBucketTimeline` + `buildSeries` pattern is correct -- generate all expected bucket timestamps, fill with null where no data exists. Recharts renders `null` as a gap when `connectNulls={false}` (already configured).

**Why not use TimescaleDB continuous aggregates:** The metrics_history table is a regular PostgreSQL table, not a TimescaleDB hypertable. Converting it would require a schema migration (out of scope per constraints). The current approach -- in-application bucketing via `getBucketTimeline` -- works well at this data volume (a single cluster produces 1440 rows/day at 60s intervals = 10K rows/week). PostgreSQL handles this without aggregation infrastructure.

---

### 6. Memory Management for Streaming Data

**Server-side constraints:**

| Concern | Limit | Enforcement |
|---------|-------|-------------|
| Max SSE connections per cluster | 10 | Connection counter in MetricsSSERoute |
| Max total SSE connections | 50 | Global counter (prevents Node.js event loop starvation) |
| Max buffered events per connection | 50 | Backpressure handler drops oldest |
| Metrics poll lifecycle | Reference-counted | Stops when zero subscribers |

**Client-side constraints:**

| Concern | Limit | Enforcement |
|---------|-------|-------------|
| Max points in buffer | 65 (15m at 15s) or 25 (5m at 15s) | CircularBuffer capacity |
| Time-based eviction | Points older than rangeMs removed | `evictOutOfRange()` on every push |
| EventSource cleanup | On unmount + range change | useEffect cleanup function |
| Stale data after tab hide | Pause SSE when `document.hidden` | Page Visibility API |

**Page Visibility API integration:**

When the user switches to another browser tab, the SSE connection should pause to avoid accumulating stale data and wasting server resources:

```typescript
useEffect(() => {
  if (!enabled) return

  const handleVisibility = () => {
    if (document.hidden) {
      eventSource?.close()
    } else {
      // Reconnect -- buffer was cleared, fresh start
      buffer.clear()
      connect()
    }
  }

  document.addEventListener('visibilitychange', handleVisibility)
  return () => document.removeEventListener('visibilitychange', handleVisibility)
}, [enabled])
```

**Why clear buffer on tab return:** If the user hides the tab for 10 minutes and returns to a 5m live view, the buffer contains 10 minutes of stale data. Clearing and reconnecting gives fresh data immediately.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Mixing SSE and DB Data in the Same View
**What:** Backfilling a 5m live view with DB data from the last 5 minutes, then appending SSE points.
**Why bad:** DB data has 60s resolution, SSE has 15s. The chart shows a jarring density change at the transition point. Users see sparse-then-dense data and think something is broken.
**Instead:** Live views show only SSE data. Accept that the chart fills progressively (Grafana does this too).

### Anti-Pattern 2: WebSocket for Metrics Streaming
**What:** Adding a WebSocket server alongside the existing SSE infrastructure.
**Why bad:** Introduces a second real-time transport, doubles connection management complexity. The app already has a proven SSE pattern (EventEmitter -> Fastify raw response -> EventSource).
**Instead:** Use SSE. It is sufficient for unidirectional metrics push. WebSocket is only needed for bidirectional communication.

### Anti-Pattern 3: Polling tRPC for "Live" Data
**What:** Using `refetchInterval: 5000` on the `metrics.history` tRPC query to simulate live updates.
**Why bad:** Each refetch queries PostgreSQL, re-aggregates, and transfers the entire dataset. At 4 panels x 5s intervals = ~0.8 queries/sec per client viewing metrics. This creates unnecessary DB load and network traffic.
**Instead:** SSE pushes only new points (incremental). DB query runs only on initial load or range change.

### Anti-Pattern 4: Shared Global Event Bus for Crosshair
**What:** Using a Zustand store or global event bus to sync crosshair state between independent chart instances.
**Why bad:** Recharts already solves this with `syncId`. Adding a parallel sync mechanism creates race conditions and double-renders.
**Instead:** Use `syncId` for chart-to-chart sync. Use React context only for non-chart UI elements that need the hovered timestamp.

### Anti-Pattern 5: Unbounded SSE Buffer
**What:** Pushing every SSE event into a growing array without eviction.
**Why bad:** A user leaving the metrics tab open for 8 hours at 15s intervals accumulates 1920 points. With per-node data, each point could be 500+ bytes. That is ~1MB of data the chart tries to render, causing React re-render lag.
**Instead:** Circular buffer with time-based eviction. Maximum points = `rangeMs / pollIntervalMs + margin`.

---

## Patterns to Follow

### Pattern 1: Discriminated Data Source (Range-Driven)
**What:** A single hook (`useMetricsData`) that returns unified data regardless of source. The caller does not know or care whether data comes from SSE or DB.
**When:** Always. All metrics panel components consume the hook's output.
**Why:** Isolates data source complexity. Adding a third source (e.g., Prometheus) later requires changing only the hook, not every consumer.

### Pattern 2: Reference-Counted Server Resources
**What:** The metrics SSE polling job starts when the first subscriber connects and stops when the last disconnects.
**When:** For any server-side resource tied to client demand (K8s API polling is expensive).
**Why:** Prevents idle polling. If no one is viewing cluster X's metrics, no K8s API calls are made for cluster X's SSE stream. The existing 60s collector still runs independently for DB persistence.

### Pattern 3: Progressive Chart Fill
**What:** Live charts start empty and fill from left to right as new SSE points arrive.
**When:** 5m and 15m ranges.
**Why:** Honest representation of available data. Grafana does this in "Live" mode. Users understand that real-time means "from now forward."

### Pattern 4: Graceful Degradation
**What:** If SSE connection fails, fall back to DB-based refetching for live ranges.
**When:** SSE connection error, K8s metrics-server unavailable, network issues.
**Implementation:** After 3 failed SSE reconnects, `useMetricsSSE` sets `fallbackToPolling: true`. The `useMetricsData` hook detects this and switches to `trpc.metrics.history` with `refetchInterval: 15_000`.

---

## Suggested Build Order (Dependencies)

### Phase 1: Backend Foundation (no frontend changes)
**Build:**
1. `MetricsStreamJob` -- 15s K8s polling with reference counting
2. `MetricsSSERoute` -- Fastify SSE endpoint with auth, heartbeat, backpressure
3. Fix `TIME_RANGE_CONFIG` -- replace broken sub-minute buckets with correct config
4. Add new time ranges to `metrics.history` tRPC procedure (30m, 3h, 12h, 2d)

**Dependencies:** None. Can be built and tested independently with curl/httpie.

**Test:** `curl -H "Cookie: ..." "http://localhost:4001/api/metrics/stream?clusterId=xxx"` should produce SSE events every 15s.

### Phase 2: Client Data Layer (no visual changes yet)
**Build:**
1. `MetricsBuffer` class (circular buffer with eviction)
2. `useMetricsSSE` hook (EventSource management, buffer integration, reconnect)
3. `useMetricsData` hook (data source switching, unified output)
4. Update `TimeRangeSelector` to Grafana-standard ranges

**Dependencies:** Phase 1 (SSE endpoint must exist).

**Test:** Console.log from `useMetricsData` in the existing metrics page, verify data flows correctly for all ranges.

### Phase 3: Synchronized Visualization
**Build:**
1. Add `syncId="metrics-panel"` to all `<AreaChart>` instances
2. Implement crosshair cursor styling (vertical line, dashed)
3. Create `CrosshairProvider` context for non-chart UI elements
4. Redesign tooltip (bucket window, multi-series values, color-coded)
5. Wire up `useMetricsData` to replace `trpc.metrics.history.useQuery`

**Dependencies:** Phase 2 (data hooks must exist). Phase 1 (SSE for live ranges).

### Phase 4: Polish and Edge Cases
**Build:**
1. Page Visibility API (pause/resume SSE)
2. Graceful degradation (SSE failure -> polling fallback)
3. Connection state indicator (live dot, "Streaming" badge)
4. Data gap visualization (distinguish null/missing from zero)
5. X-axis formatting per range (seconds for live, hours for historical)
6. Custom date range picker

**Dependencies:** Phase 3 (visualization must be working).

---

## Scalability Considerations

| Concern | At 5 clusters | At 50 clusters | At 200 clusters |
|---------|--------------|----------------|-----------------|
| SSE connections | 5 streams, trivial | 50 streams, ~50 concurrent K8s API calls every 15s | Need connection pooling or batch K8s API calls |
| MetricsStreamJob polls | 5 x 15s = negligible | 50 x 15s = ~3.3 K8s API calls/sec | Consider aggregating: poll all clusters in one job cycle, not per-cluster intervals |
| DB query load (historical) | Trivial | Index on (cluster_id, timestamp) handles it | May need TimescaleDB hypertable + continuous aggregates for 7d+ ranges |
| Client memory | ~13KB per tab | Same (only one cluster viewed at a time) | Same |
| Node.js event loop | Unnoticeable | Monitor with OpenTelemetry | Consider worker threads for K8s API calls |

At the current scale (5-10 clusters), none of these are concerns. The architecture is designed to work efficiently at small scale without over-engineering for scale that may never come.

---

## Sources

- Recharts `syncId` API: [LineChart API docs](https://recharts.github.io/en-US/api/LineChart/) -- HIGH confidence
- Recharts Tooltip cursor prop: [Tooltip API docs](https://recharts.github.io/en-US/api/Tooltip/) -- HIGH confidence
- Recharts synchronized example: [SynchronizedLineChart example](https://recharts.github.io/en-US/examples/SynchronizedLineChart/) -- HIGH confidence
- Recharts tooltip system internals: [DeepWiki recharts tooltip](https://deepwiki.com/recharts/recharts/5.2-tooltip-system) -- MEDIUM confidence
- SSE Fastify patterns: [fastify-sse-v2](https://github.com/mpetrunic/fastify-sse-v2), [Fastify SSE issue #1877](https://github.com/fastify/fastify/issues/1877) -- MEDIUM confidence (existing codebase pattern is more authoritative)
- Grafana real-time vs historical architecture: [Golioth blog](https://blog.golioth.io/real-time-vs-historic-data-views-in-grafana/) -- MEDIUM confidence
- TimescaleDB time_bucket for dashboards: [Timescale blog](https://medium.com/timescale/quickly-building-sql-dashboards-for-time-series-with-continuous-aggregates-2e6f6956716c) -- HIGH confidence
- Existing codebase: `event-emitter.ts`, `cluster-watch-manager.ts`, `ai-stream.ts`, `metrics-history-collector.ts`, `MetricsAreaChart.tsx` -- HIGH confidence (primary source)
