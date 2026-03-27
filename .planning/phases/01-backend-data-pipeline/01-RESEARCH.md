# Phase 1: Backend Data Pipeline - Research

**Researched:** 2026-03-28
**Domain:** TimescaleDB server-side aggregation, tRPC metrics API, Zod input validation
**Confidence:** HIGH

## Summary

Phase 1 fixes the broken metrics backend by replacing in-memory JavaScript bucketing with TimescaleDB `time_bucket()` SQL aggregation, switching from the broken time range set (30s, 1m, 5m, 1h, 6h, 24h, 7d, 30d) to the Grafana-standard set (5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 2d, 7d), adding `serverTime` and `intervalMs` to API responses, and rejecting old invalid time ranges via input validation.

The root cause of empty graphs is clear: the current `TIME_RANGE_CONFIG` defines sub-minute buckets (5s for 30s range, 10s for 1m range) but the collector writes to DB every 60 seconds (`JOB_INTERVALS.METRICS_COLLECT_MS = 60_000`). These sub-minute buckets are always empty. The `history` procedure also loads ALL rows into the JS heap and aggregates in-memory, which is inefficient for long ranges.

**Critical finding:** TimescaleDB extension is NOT enabled in `init.sql`. Only `uuid-ossp` and `pgcrypto` extensions are created. The Docker image (`timescale/timescaledb:latest-pg17`) ships with TimescaleDB but `CREATE EXTENSION timescaledb;` must be added to `init.sql` before `time_bucket()` is available. This is a prerequisite task.

**Primary recommendation:** Enable TimescaleDB extension, rewrite the `history` tRPC procedure to use `time_bucket()` SQL aggregation with the new Grafana-standard ranges, return `serverTime`/`intervalMs` metadata, and update both backend validation and frontend type/selector to the new range set.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation choices are at Claude's discretion (infrastructure phase).

### Claude's Discretion
All implementation choices are at Claude's discretion -- pure infrastructure phase. Key constraints from research:

- Use TimescaleDB `time_bucket()` for server-side aggregation (STACK.md)
- Keep 60s collector interval unchanged -- only fix how data is queried and bucketed
- Replace `TIME_RANGE_CONFIG` with new Grafana-standard ranges
- Return `serverTime` (ISO string) and `intervalMs` in every `metrics.history` response
- Validate input against new range enum (reject old 30s/1m values)
- No schema changes needed -- metrics_history and node_metrics_history tables stay as-is
- Target 20-60 data points per response (research recommendation for chart readability)

### Deferred Ideas (OUT OF SCOPE)
None -- infrastructure phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | Backend returns correct bucket-aligned data for all Grafana-standard time ranges (5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 2d, 7d) | New `TIME_RANGE_CONFIG` with correct bucket intervals; `time_bucket()` SQL aggregation; null-fill pattern for gaps |
| PIPE-02 | Server-side aggregation uses TimescaleDB `time_bucket()` SQL instead of in-memory JS bucketing | TimescaleDB extension must be enabled first; Drizzle `sql` tagged template already imported in metrics.ts; exact SQL pattern documented below |
| PIPE-03 | Backend returns `serverTime` and `intervalMs` in response so client can align timeline correctly | Add fields to `metrics.history` response object; `serverTime` = ISO string of `now` before rounding; `intervalMs` = bucket interval for the requested range |
| PIPE-05 | Backend validates time range input against new Grafana-standard set (removes old 30s/1m ranges) | Replace `z.enum(['30s', '1m', ...])` with new enum; update frontend `MetricsRange` type and `RANGES` array; handle localStorage migration for persisted range |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TimescaleDB | latest-pg17 (Docker image) | `time_bucket()` SQL aggregation | Already the Postgres image; just needs extension enabled |
| Drizzle ORM `sql` | ^0.45.1 (installed) | Raw SQL template for `time_bucket()` queries | Already imported and used in `metrics.ts` aggregatedMetrics procedure |
| Zod | ^4.3.6 (installed) | Input validation for new time range enum | Already used for all tRPC input schemas |
| tRPC | ^11.10.0 (installed) | API procedure definitions | Existing router pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@voyager/config` | workspace | Shared constants (cache TTLs, validation limits) | For new metrics-specific cache TTL constants |
| `@voyager/db` | workspace | DB connection + schema exports | For `metricsHistory`, `nodeMetricsHistory` table references |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TimescaleDB `time_bucket()` | Keep JS in-memory bucketing | JS approach loads all rows into heap; works at small scale but `time_bucket()` is more efficient and pushes work to DB where the index exists |
| Drizzle raw SQL | Drizzle query builder only | Query builder cannot express `time_bucket()` -- raw SQL via `sql` template is required |

**Installation:**
```bash
# No new dependencies needed -- all packages already installed
# Only change: add CREATE EXTENSION timescaledb to init.sql
```

## Architecture Patterns

### Files to Modify

```
apps/api/src/routers/metrics.ts            # Main target: rewrite bucketing logic
apps/web/src/components/metrics/TimeRangeSelector.tsx  # Update MetricsRange type + RANGES array
apps/web/src/stores/metrics-preferences.ts  # Add localStorage migration for new range values
charts/voyager/sql/init.sql                 # Add CREATE EXTENSION timescaledb
```

### Pattern 1: TimescaleDB `time_bucket()` Aggregation Query

**What:** Replace in-memory JS bucketing with SQL-level aggregation using TimescaleDB's `time_bucket()` function.

**Current broken pattern (lines 397-450 of metrics.ts):**
```typescript
// Loads ALL rows into JS heap, then buckets in-memory
const rows = await db.select().from(metricsHistory)
  .where(and(eq(metricsHistory.clusterId, input.clusterId), gte(metricsHistory.timestamp, timeline.start)))
  .orderBy(metricsHistory.timestamp)

// Then iterates all rows in JS to assign to buckets
for (const row of rows) {
  const bucketIndex = getBucketIndex(new Date(row.timestamp), startMs, intervalMs, bucketCount)
  // ...accumulate
}
```

**New pattern using `time_bucket()` (HIGH confidence -- TimescaleDB official docs):**
```typescript
import { sql } from 'drizzle-orm'

const bucketInterval = `${bucketMs / 1000} seconds`
const startTime = new Date(Date.now() - rangeMs)

const rows = await db.execute(sql`
  SELECT
    time_bucket(${bucketInterval}::interval, timestamp) AS bucket,
    avg(cpu_percent)::real AS cpu,
    avg(mem_percent)::real AS memory,
    avg(pod_count)::int AS pods,
    avg(network_bytes_in)::bigint AS network_bytes_in,
    avg(network_bytes_out)::bigint AS network_bytes_out,
    count(*)::int AS sample_count
  FROM metrics_history
  WHERE cluster_id = ${clusterId}
    AND timestamp >= ${startTime}
  GROUP BY bucket
  ORDER BY bucket
`)
```

**Why this works:** The `(cluster_id, timestamp)` composite index at line 18 of the Drizzle schema (and line 426 of init.sql) supports this query pattern efficiently. TimescaleDB's `time_bucket()` aligns timestamps to interval boundaries and PostgreSQL does the GROUP BY aggregation natively.

### Pattern 2: New Time Range Configuration

**What:** Replace the broken `TIME_RANGE_CONFIG` with Grafana-standard ranges that respect the 60s collector interval.

```typescript
type GrafanaTimeRange = '5m' | '15m' | '30m' | '1h' | '3h' | '6h' | '12h' | '24h' | '2d' | '7d'

const TIME_RANGE_CONFIG: Record<GrafanaTimeRange, { rangeMs: number; bucketMs: number }> = {
  '5m':  { rangeMs: 5 * 60_000,           bucketMs: 15_000 },     // ~20 points (SSE future)
  '15m': { rangeMs: 15 * 60_000,          bucketMs: 30_000 },     // ~30 points (SSE future)
  '30m': { rangeMs: 30 * 60_000,          bucketMs: 60_000 },     // 30 points
  '1h':  { rangeMs: 60 * 60_000,          bucketMs: 120_000 },    // 30 points
  '3h':  { rangeMs: 3 * 60 * 60_000,      bucketMs: 360_000 },    // 30 points
  '6h':  { rangeMs: 6 * 60 * 60_000,      bucketMs: 720_000 },    // 30 points
  '12h': { rangeMs: 12 * 60 * 60_000,     bucketMs: 1_440_000 },  // 30 points
  '24h': { rangeMs: 24 * 60 * 60_000,     bucketMs: 3_600_000 },  // 24 points
  '2d':  { rangeMs: 2 * 24 * 60 * 60_000, bucketMs: 7_200_000 },  // 24 points
  '7d':  { rangeMs: 7 * 24 * 60 * 60_000, bucketMs: 21_600_000 }, // 28 points
}
```

**Key rule:** Every `bucketMs` >= 60_000 (collector interval), so buckets always contain at least one data point when data exists. The 5m and 15m ranges have sub-minute buckets because they will be served by SSE in Phase 2 -- for now, they query the DB at the minimum 60s resolution.

**Phase 1 interim approach for 5m/15m:** Since SSE is Phase 2, these ranges must still work via DB query. Use 60s bucket for 5m (yields 5 points -- sparse but correct) and 60s for 15m (yields 15 points). When SSE arrives in Phase 2, these switch to live data. The config should store the intended bucket size but the query logic should clamp to `Math.max(bucketMs, 60_000)` for DB queries.

### Pattern 3: Response Metadata (serverTime + intervalMs)

**What:** Add `serverTime` and `intervalMs` to the `metrics.history` response for client-side timeline alignment.

```typescript
return {
  data: bucketedData,         // array of bucketed points with null-fill
  serverTime: now.toISOString(),  // ISO string of server time at query execution
  intervalMs: config.bucketMs,    // bucket width in milliseconds
}
```

**Why needed:** The client needs `serverTime` to understand what "now" means relative to the data. Without it, the client uses its own clock which may drift. The `intervalMs` tells the client the bucket width for proper X-axis alignment and tooltip display.

**Breaking change:** The current `history` procedure returns a flat array `BucketPoint[]`. The new response wraps it in an object `{ data, serverTime, intervalMs }`. This requires updating all frontend consumers:
- `MetricsTimeSeriesPanel.tsx` line 74: `historyQuery.data` -> `historyQuery.data?.data`
- `ResourceSparkline.tsx` line 51: same pattern
- `NodeMetricsTable.tsx` line 47: uses `nodeTimeSeries`, not `history` -- no change needed

### Pattern 4: Null-Fill for Gaps (Existing Pattern, Keep)

**What:** Generate the full expected timeline and fill empty buckets with `null` values.

The existing `buildSeries()` pattern is correct -- Recharts renders `null` as a gap when `connectNulls={false}` (already configured in `MetricsAreaChart.tsx` line 387). The difference is that `time_bucket()` only returns rows for buckets WITH data, so the null-fill must happen after the SQL query returns.

```typescript
// Generate expected bucket timestamps
const expectedBuckets = generateTimeline(startMs, endMs, bucketMs)

// Map SQL results by bucket key
const dataMap = new Map(rows.map(r => [r.bucket.toISOString(), r]))

// Fill
const result = expectedBuckets.map(bucket => {
  const row = dataMap.get(bucket.toISOString())
  return {
    timestamp: bucket.toISOString(),
    bucketStart: new Date(bucket.getTime()).toISOString(),
    bucketEnd: new Date(bucket.getTime() + bucketMs).toISOString(),
    cpu: row?.cpu ?? null,
    memory: row?.memory ?? null,
    pods: row?.pods ?? null,
    networkBytesIn: row?.network_bytes_in ?? null,
    networkBytesOut: row?.network_bytes_out ?? null,
  }
})
```

### Pattern 5: Input Validation Update

**What:** Replace the backend Zod schema and frontend type to the new range set.

Backend (`metrics.ts`):
```typescript
// Old (broken):
const timeRangeSchema = z.enum(['30s', '1m', '5m', '1h', '6h', '24h', '7d', '30d']).default('24h')

// New:
const timeRangeSchema = z.enum(['5m', '15m', '30m', '1h', '3h', '6h', '12h', '24h', '2d', '7d']).default('24h')
```

Frontend (`TimeRangeSelector.tsx`):
```typescript
// Old:
export type MetricsRange = '30s' | '1m' | '5m' | '1h' | '6h' | '24h' | '7d'

// New:
export type MetricsRange = '5m' | '15m' | '30m' | '1h' | '3h' | '6h' | '12h' | '24h' | '2d' | '7d'
```

### Anti-Patterns to Avoid

- **Do NOT keep in-memory bucketing alongside `time_bucket()`:** The whole point is to push aggregation to SQL. Delete `getBucketIndex()` and the per-row loop from the `history` procedure.
- **Do NOT change the collector interval:** The 60s interval in `JOB_INTERVALS.METRICS_COLLECT_MS` is correct and sufficient. The problem is how data is queried, not how it is collected.
- **Do NOT convert metrics_history to a TimescaleDB hypertable:** The table is a regular pgTable. Converting requires a migration and is out of scope. Regular `time_bucket()` works fine on non-hypertable data at this volume.
- **Do NOT return raw un-bucketed rows for any range:** Every range must return aggregated, bucketed data to keep response sizes predictable (20-60 points).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time-based bucketing/aggregation | Custom JS bucket accumulator | TimescaleDB `time_bucket()` | DB does it faster with index support; JS approach loads unnecessary data into heap |
| Interval string formatting | Manual string concatenation | PostgreSQL interval literal | `'120 seconds'::interval` is parsed natively by PG |
| Timestamp alignment | Custom `alignFloor()` | `time_bucket()` alignment | `time_bucket()` aligns to epoch boundaries by default, matching the existing `alignFloor` behavior |

**Key insight:** The current code hand-rolls what TimescaleDB does natively. The `getBucketTimeline()`, `getBucketIndex()`, and `buildSeries()` functions can be simplified significantly. `getBucketTimeline()` should only generate the expected timestamp array for null-fill; the actual aggregation moves to SQL.

## Common Pitfalls

### Pitfall 1: TimescaleDB Extension Not Enabled
**What goes wrong:** `time_bucket()` call fails with `ERROR: function time_bucket(interval, timestamp with time zone) does not exist`
**Why it happens:** The Docker image ships with TimescaleDB but the extension is not created in `init.sql`. Only `uuid-ossp` and `pgcrypto` are explicitly created.
**How to avoid:** Add `CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;` to `init.sql` BEFORE any table creation. For existing local dev databases, run the CREATE EXTENSION manually or recreate the container (`docker compose down -v && docker compose up -d`).
**Warning signs:** Any `time_bucket()` query throws a "function does not exist" error.

### Pitfall 2: Bucket Interval as String vs Interval Type
**What goes wrong:** Drizzle's `sql` template sends the bucket interval as a string parameter, but `time_bucket()` expects an `interval` type. PostgreSQL may fail to parse or silently truncate.
**Why it happens:** Parameterized queries send values as text. `time_bucket('120 seconds', ts)` works because PG auto-casts the string literal, but `time_bucket($1, ts)` with `$1 = '120 seconds'` requires explicit cast.
**How to avoid:** Cast explicitly: `time_bucket(${bucketInterval}::interval, timestamp)` or use Drizzle's `sql.raw()` for the interval string (since it's from a controlled enum, not user input, SQL injection is not a risk).
**Warning signs:** Query returns unexpected bucket sizes or throws a type mismatch error.

### Pitfall 3: Response Shape Change Breaks Frontend
**What goes wrong:** Changing `metrics.history` from returning `BucketPoint[]` to `{ data, serverTime, intervalMs }` breaks every frontend consumer that accesses `historyQuery.data` directly.
**Why it happens:** tRPC infers return types. Changing the return shape is a breaking change.
**How to avoid:** Update ALL frontend consumers in the same commit/PR. There are exactly 3 call sites: `MetricsTimeSeriesPanel.tsx:74`, `ResourceSparkline.tsx:51`, and `DashboardCharts.tsx:28` (which uses `resourceUsage`, not `history` -- verify this is not affected).
**Warning signs:** `TypeError: Cannot read properties of undefined` in the frontend after backend deploy.

### Pitfall 4: localStorage Migration for Persisted Range
**What goes wrong:** The Zustand store persists `range` to localStorage under key `voyager-metrics-preferences`. If a user had `range: '30s'` or `range: '1m'` saved, the new Zod validation rejects it and the default `'24h'` is not applied -- instead tRPC throws a validation error.
**Why it happens:** The persisted value is sent directly to the backend without client-side validation. Zustand's `persist` middleware restores the old value on page load.
**How to avoid:** Add a Zustand `migrate` function or a `partialize`/`merge` strategy that maps invalid old ranges to '24h'. Alternatively, add a version number to the store and clear on version change.
**Warning signs:** Users who had the metrics page open before the update see validation errors on first load after deploy.

### Pitfall 5: `time_bucket()` Returns UTC-Aligned Buckets
**What goes wrong:** `time_bucket('1 hour', timestamp)` aligns to UTC hour boundaries, not local time. For users in non-UTC timezones, the bucket boundaries may not align with their expectation (e.g., "3:00 PM" bucket might span 2:30-3:30 in local time depending on offset).
**Why it happens:** PostgreSQL `time_bucket()` uses epoch (1970-01-01 UTC) as the origin by default.
**How to avoid:** This is actually correct behavior for a monitoring tool. All bucket alignment should be UTC-based. The frontend handles display-time formatting. No action needed -- just be aware that bucket boundaries are epoch-aligned, which matches the existing `alignFloor()` behavior.
**Warning signs:** Not applicable -- this is the desired behavior.

### Pitfall 6: Drizzle `db.execute()` Returns Raw Rows
**What goes wrong:** `db.execute(sql`...`)` returns `{ rows: Record<string, unknown>[] }` -- the column names are the SQL aliases (snake_case), not Drizzle schema names (camelCase). Types are also raw PG types (strings for numbers, etc.).
**Why it happens:** Raw SQL bypasses Drizzle's type mapping layer.
**How to avoid:** Explicitly parse and type-cast the result rows. Define a TypeScript interface for the expected row shape. Use `Number()` or `parseInt()` for numeric columns. Consider using `sql<number>` type annotations where possible.
**Warning signs:** Runtime `NaN` values or string-where-number-expected bugs in the response.

## Code Examples

### TimescaleDB Extension Setup (init.sql)

```sql
-- Add BEFORE existing CREATE TABLE statements:
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
```

**Source:** TimescaleDB official docs -- `CREATE EXTENSION` is idempotent with `IF NOT EXISTS`.

### Complete `time_bucket()` Query via Drizzle

```typescript
import { sql } from 'drizzle-orm'

interface BucketRow {
  bucket: string
  cpu: number | null
  memory: number | null
  pods: number | null
  network_bytes_in: number | null
  network_bytes_out: number | null
  sample_count: number
}

const bucketSec = Math.max(config.bucketMs / 1000, 60) // clamp to collector minimum
const intervalStr = `${bucketSec} seconds`
const startTime = new Date(now.getTime() - config.rangeMs)

const result = await db.execute<BucketRow>(sql`
  SELECT
    time_bucket(${intervalStr}::interval, "timestamp") AS bucket,
    round(avg(cpu_percent)::numeric, 1)::real AS cpu,
    round(avg(mem_percent)::numeric, 1)::real AS memory,
    round(avg(pod_count))::int AS pods,
    avg(network_bytes_in)::bigint AS network_bytes_in,
    avg(network_bytes_out)::bigint AS network_bytes_out,
    count(*)::int AS sample_count
  FROM metrics_history
  WHERE cluster_id = ${clusterId}
    AND "timestamp" >= ${startTime}
  GROUP BY bucket
  ORDER BY bucket
`)
```

### Frontend Consumer Update

```typescript
// Before (returns flat array):
const historyQuery = trpc.metrics.history.useQuery({ clusterId, range })
const data = historyQuery.data ?? []

// After (returns wrapped object):
const historyQuery = trpc.metrics.history.useQuery({ clusterId, range })
const data = historyQuery.data?.data ?? []
const serverTime = historyQuery.data?.serverTime
const intervalMs = historyQuery.data?.intervalMs
```

### Zustand Store Migration

```typescript
export const useMetricsPreferences = create<MetricsPreferencesState>()(
  persist(
    (set) => ({
      range: '24h',
      // ...
    }),
    {
      name: 'voyager-metrics-preferences',
      version: 2, // bump from implicit v0
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>
        if (version < 2) {
          const validRanges = ['5m','15m','30m','1h','3h','6h','12h','24h','2d','7d']
          if (!validRanges.includes(state.range as string)) {
            state.range = '24h'
          }
        }
        return state as MetricsPreferencesState
      },
    },
  ),
)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JS in-memory bucketing | TimescaleDB `time_bucket()` SQL | This phase | Eliminates heap pressure for long ranges, leverages DB index |
| Sub-minute time ranges (30s, 1m) | Grafana-standard ranges (5m-7d) | This phase | All ranges produce non-empty data aligned to collector frequency |
| Flat array response | Wrapped `{ data, serverTime, intervalMs }` | This phase | Enables client-side timeline alignment |

**Deprecated/outdated:**
- `30s` and `1m` time ranges: removed because collector writes every 60s
- `30d` time range: removed (not a Grafana standard; 7d is the longest standard preset)
- `getBucketIndex()` for in-memory bucketing: replaced by `time_bucket()` SQL

## Open Questions

1. **Should `resourceUsage` and `clusterHealth` also use `time_bucket()`?**
   - What we know: These procedures also use the same in-memory bucketing pattern. They are dashboard-level (not cluster-specific) queries.
   - What's unclear: Whether they are in scope for PIPE-01/02 requirements.
   - Recommendation: Update them in the same phase since the pattern is identical and they share `TIME_RANGE_CONFIG`. Leaving them on old ranges while `history` uses new ranges would create inconsistency.

2. **Should `nodeTimeSeries` also be rewritten?**
   - What we know: It uses a different pattern -- groups by nodeName and returns raw arrays, not bucketed data. It has a `LIMIT 10000` safety valve.
   - What's unclear: Whether it's in scope for this phase.
   - Recommendation: Defer to a later phase. It works differently and has its own frontend consumer (`NodeMetricsTable`). Changing it now adds scope without addressing the core pipeline requirements.

3. **How to handle `time_bucket()` on non-hypertable?**
   - What we know: `metrics_history` is a regular pgTable, not a hypertable. TimescaleDB docs say `time_bucket()` works on any timestamp column regardless of hypertable status.
   - Recommendation: Verify with a test query after enabling the extension. If it works (expected), proceed. If not, fall back to `date_trunc()` + arithmetic which achieves similar results with standard PostgreSQL.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (installed) |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `pnpm --filter api test -- src/__tests__/metrics.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | All 10 Grafana ranges return correct bucketed data | unit | `pnpm --filter api test -- src/__tests__/metrics-pipeline.test.ts -x` | Wave 0 |
| PIPE-02 | `time_bucket()` SQL is used (not JS bucketing) | unit | `pnpm --filter api test -- src/__tests__/metrics-pipeline.test.ts -x` | Wave 0 |
| PIPE-03 | Response includes `serverTime` + `intervalMs` fields | unit | `pnpm --filter api test -- src/__tests__/metrics-pipeline.test.ts -x` | Wave 0 |
| PIPE-05 | Old ranges (30s, 1m) rejected by validation | unit | `pnpm --filter api test -- src/__tests__/metrics-validation.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter api test -- src/__tests__/metrics-pipeline.test.ts -x`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/__tests__/metrics-pipeline.test.ts` -- covers PIPE-01, PIPE-02, PIPE-03 (time_bucket query construction, response shape, bucket alignment)
- [ ] `apps/api/src/__tests__/metrics-validation.test.ts` -- covers PIPE-05 (Zod schema rejects old ranges, accepts new ranges)

**Note on test approach:** Since the metrics router requires a real TimescaleDB database for `time_bucket()` queries, unit tests should mock the DB layer (mock `db.execute()`) and verify the SQL template construction and response shape. Integration tests against a real DB are valuable but may not be practical in CI without docker-compose. The existing test infrastructure uses `DATABASE_URL: 'postgresql://fake:fake@localhost:5432/fake'` in vitest.config.ts, confirming that tests mock the DB layer.

## Project Constraints (from CLAUDE.md)

- **Never add `migrate()` to `server.ts`** -- schema changes go in `init.sql` only
- **Zod v4 `z.record()` requires TWO arguments** -- relevant for any new Zod schemas
- **All packages are ESM** -- use `.js` extensions in imports even for `.ts` files
- **Code style:** 2-space indent, 100-char line width, single quotes, semicolons as-needed (Biome)
- **Cache keys centralized** -- if adding Redis cache for bucketed queries, use `CACHE_KEYS` pattern from `cache-keys.ts`
- **Config constants centralized** -- new interval constants go in `apps/api/src/config/jobs.ts` or a new config file, not inline in routers
- **Error handling pattern:** K8s router errors use `handleK8sError()`; tRPC errors use standard codes

## Sources

### Primary (HIGH confidence)
- `apps/api/src/routers/metrics.ts` -- full current implementation read, 607 lines
- `packages/db/src/schema/metrics-history.ts` -- table schema with `(cluster_id, timestamp)` index
- `charts/voyager/sql/init.sql` -- verified TimescaleDB extension NOT enabled (only uuid-ossp, pgcrypto)
- `docker-compose.yml` -- confirmed `timescale/timescaledb:latest-pg17` image
- `apps/api/src/jobs/metrics-history-collector.ts` -- confirmed 60s collection interval
- `apps/api/src/config/jobs.ts` -- `METRICS_COLLECT_MS: 60_000`
- `apps/web/src/components/metrics/TimeRangeSelector.tsx` -- current MetricsRange type
- `apps/web/src/stores/metrics-preferences.ts` -- Zustand persist with localStorage
- `.planning/research/STACK.md` -- bucket interval strategy table
- `.planning/research/ARCHITECTURE.md` -- full architecture patterns

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` -- pitfalls #1 (key prop), #4 (bucket drift), #12 (locale formatting)
- TimescaleDB `time_bucket()` documentation -- function signature and behavior on non-hypertables

### Tertiary (LOW confidence)
- None -- all findings verified against codebase and official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all packages already installed and verified in codebase
- Architecture: HIGH -- exact files, line numbers, and patterns identified from codebase analysis
- Pitfalls: HIGH -- critical finding (TimescaleDB extension not enabled) verified against init.sql; all other pitfalls derived from code analysis
- Validation: MEDIUM -- test structure is clear but metrics-specific tests don't exist yet (Wave 0 gap)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable domain -- no fast-moving dependencies)
