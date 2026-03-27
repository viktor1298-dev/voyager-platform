---
phase: 01-backend-data-pipeline
plan: 01
subsystem: api
tags: [timescaledb, time_bucket, tRPC, drizzle, zod, metrics, grafana]

# Dependency graph
requires: []
provides:
  - TimescaleDB extension enabled in init.sql
  - metrics.history procedure with time_bucket() SQL aggregation
  - Grafana-standard time range Zod schema (5m-7d)
  - Response metadata (serverTime, intervalMs) for client timeline alignment
  - Exported GRAFANA_RANGES, TIME_RANGE_CONFIG, timeRangeSchema constants
affects: [01-02, phase-2-sse, phase-3-frontend]

# Tech tracking
tech-stack:
  added: [TimescaleDB extension (time_bucket function)]
  patterns: [time_bucket SQL aggregation via Drizzle sql template, null-fill pattern for time-series gaps, clamped bucket intervals for DB vs SSE]

key-files:
  created:
    - apps/api/src/__tests__/metrics-pipeline.test.ts
    - apps/api/src/__tests__/metrics-validation.test.ts
  modified:
    - apps/api/src/routers/metrics.ts
    - charts/voyager/sql/init.sql

key-decisions:
  - "Clamp bucket intervals to 60s minimum for DB queries (5m/15m sub-minute buckets reserved for future SSE)"
  - "Use alignFloor for null-fill timeline generation to match time_bucket epoch alignment"
  - "Keep getBucketIndex for clusterHealth/resourceUsage procedures (unchanged JS bucketing for non-history queries)"

patterns-established:
  - "time_bucket SQL via Drizzle: db.execute(sql`SELECT time_bucket(interval, timestamp) ...`) with explicit ::interval cast"
  - "Null-fill pattern: generate expectedBuckets array, map SQL rows by aligned key, fill gaps with null values"
  - "Response envelope: { data: BucketPoint[], serverTime: string, intervalMs: number } for timeline-aware endpoints"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03, PIPE-05]

# Metrics
duration: 6min
completed: 2026-03-28
---

# Phase 1 Plan 1: Backend Metrics Pipeline Summary

**TimescaleDB time_bucket() SQL aggregation replacing broken in-memory JS bucketing, with Grafana-standard ranges (5m-7d) and serverTime/intervalMs response metadata**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-27T21:59:03Z
- **Completed:** 2026-03-28T00:05:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced broken metrics backend: sub-minute buckets (30s/1m) that could never contain data are eliminated
- history procedure now uses TimescaleDB time_bucket() SQL aggregation instead of loading all rows into JS heap
- API response includes serverTime and intervalMs for client-side timeline alignment
- 15 new unit tests: 6 for Zod validation (PIPE-05) + 9 for pipeline behavior (PIPE-01/02/03)
- All existing tests continue to pass (154/157 pass; 3 pre-existing integration test failures unrelated)

## Task Commits

Each task was committed atomically:

1. **Task 1: Enable TimescaleDB extension and rewrite metrics pipeline** - `6a7cf2e` (feat) -- TDD: tests + implementation in single commit
2. **Task 2: Verify build and typecheck pass** - No code changes needed; API build and typecheck both pass cleanly

## Files Created/Modified
- `charts/voyager/sql/init.sql` - Added `CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`
- `apps/api/src/routers/metrics.ts` - Rewritten with Grafana ranges, time_bucket SQL, response metadata, exported constants
- `apps/api/src/__tests__/metrics-pipeline.test.ts` - 9 tests covering PIPE-01/02/03 (time_bucket usage, response shape, null-fill)
- `apps/api/src/__tests__/metrics-validation.test.ts` - 6 tests covering PIPE-05 (accepts new ranges, rejects old, default 24h)

## Decisions Made
- Clamped bucket intervals to 60s minimum for DB queries since collector writes every 60s; 5m/15m sub-minute buckets reserved for future SSE (Phase 2)
- Used `alignFloor` for null-fill timeline generation to match time_bucket's epoch-aligned boundaries
- Kept `getBucketIndex()` in metrics.ts since clusterHealth, resourceUsage, and other procedures still use JS bucketing (converting them to time_bucket is out of scope for this plan)
- Response shape change (flat array to `{ data, serverTime, intervalMs }`) is an intentional breaking change for the frontend, to be addressed in Plan 01-02

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added mocks for @voyager/db in validation test**
- **Found during:** Task 1 RED phase
- **Issue:** metrics-validation.test.ts imported from metrics.ts which triggered the full module chain including @voyager/db and auth/sso, causing DB connection errors
- **Fix:** Added vi.mock for @voyager/db, auth, cluster-client-pool, and k8s-units in the validation test file
- **Files modified:** apps/api/src/__tests__/metrics-validation.test.ts
- **Verification:** All 6 validation tests pass
- **Committed in:** 6a7cf2e (Task 1 commit)

**2. [Rule 1 - Bug] Fixed UUID format in pipeline tests**
- **Found during:** Task 1 GREEN phase
- **Issue:** Test UUID `00000000-0000-0000-0000-000000000001` rejected by Zod v4's strict UUID validation (version byte must be 1-8, not 0)
- **Fix:** Changed to valid UUID v4 `a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11`
- **Files modified:** apps/api/src/__tests__/metrics-pipeline.test.ts
- **Verification:** All 9 pipeline tests pass
- **Committed in:** 6a7cf2e (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for test correctness. No scope creep.

## Issues Encountered
- Worktree was behind main and missing the phases directory; resolved by merging main into worktree branch
- Pre-existing health-check.integration.test.ts failures (3 tests) due to fake DATABASE_URL -- unrelated to changes, documented as out-of-scope

## User Setup Required
None - no external service configuration required. For existing local dev databases, run `CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;` manually or recreate the container (`docker compose down -v && docker compose up -d`).

## Known Stubs
None - all code paths are fully functional. The frontend will see type errors due to the response shape change (flat array to wrapped object) which is expected and addressed in Plan 01-02.

## Next Phase Readiness
- Backend metrics pipeline is complete and tested
- Plan 01-02 needs to update frontend consumers for the new response shape: `historyQuery.data` becomes `historyQuery.data?.data`
- Zustand store migration needed for persisted time range values (old ranges like '30s' in localStorage)
- Frontend TimeRangeSelector component needs updated MetricsRange type

---
*Phase: 01-backend-data-pipeline*
*Completed: 2026-03-28*
