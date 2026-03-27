---
phase: 01-backend-data-pipeline
plan: 02
subsystem: ui
tags: [react, zustand, recharts, trpc, metrics, grafana, time-range, migration]

# Dependency graph
requires:
  - phase: 01-backend-data-pipeline plan 01
    provides: New metrics.history response shape { data, serverTime, intervalMs } and Grafana-standard Zod enum
provides:
  - Frontend MetricsRange type with 10 Grafana-standard values (5m-7d)
  - Zustand store v2 migration for persisted range values
  - Updated tRPC consumers for wrapped response shape (data?.data)
  - chart-theme TimeRange aligned with backend Grafana set
affects: [phase-2-sse, phase-3-frontend, phase-5-style]

# Tech tracking
tech-stack:
  added: []
  patterns: [Zustand version-based persist migration for breaking type changes, double-cast pattern for Zustand migrate return type]

key-files:
  created: []
  modified:
    - apps/web/src/components/metrics/TimeRangeSelector.tsx
    - apps/web/src/stores/metrics-preferences.ts
    - apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx
    - apps/web/src/components/metrics/ResourceSparkline.tsx
    - apps/web/src/components/charts/chart-theme.ts
    - apps/web/src/components/charts/DashboardCharts.tsx
    - apps/web/src/components/metrics/MetricsAreaChart.tsx

key-decisions:
  - "Use Zustand persist version 2 migration with validRanges allowlist to safely convert old localStorage values"
  - "Replace DashboardCharts '30d' option with '2d' (closest valid Grafana-standard range for multi-day view)"
  - "Double-cast (as unknown as MetricsPreferencesState) in migrate function to satisfy strict TypeScript"

patterns-established:
  - "Zustand persist migration: bump version, check validRanges array, fall back to safe default"
  - "tRPC wrapped response access: historyQuery.data?.data pattern for response envelope"

requirements-completed: [PIPE-01, PIPE-05]

# Metrics
duration: 6min
completed: 2026-03-28
---

# Phase 1 Plan 2: Frontend Metrics Alignment Summary

**Frontend MetricsRange type, Zustand v2 migration, and tRPC response shape access updated to match new Grafana-standard backend API**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-27T22:09:52Z
- **Completed:** 2026-03-27T22:15:58Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- MetricsRange type and RANGES array updated from 7 old values to 10 Grafana-standard values (5m through 7d)
- Zustand store v2 migration converts persisted invalid ranges (30s, 1m, 30d) to safe default '24h'
- MetricsTimeSeriesPanel and ResourceSparkline correctly access wrapped response (`data?.data` instead of flat array)
- chart-theme TimeRange and DashboardCharts aligned with backend -- removed `30d`, added new intermediate ranges
- Full monorepo typecheck and build pass with 0 errors; 154/157 tests pass (3 pre-existing integration failures)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update TimeRangeSelector type and RANGES array** - `3d64903` (feat) -- MetricsRange type and 10-entry RANGES array
2. **Task 2: Update store migration, frontend consumers, and verify build** - `6068518` (feat) -- Zustand migration, response shape access, chart-theme alignment

## Files Created/Modified
- `apps/web/src/components/metrics/TimeRangeSelector.tsx` - MetricsRange type and RANGES array with 10 Grafana-standard entries
- `apps/web/src/stores/metrics-preferences.ts` - Zustand persist v2 migration for invalid old ranges
- `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` - historyQuery.data?.data access for wrapped response
- `apps/web/src/components/metrics/ResourceSparkline.tsx` - data?.data access for wrapped response
- `apps/web/src/components/charts/chart-theme.ts` - TimeRange type expanded to 10 Grafana-standard values, formatTimestamp updated
- `apps/web/src/components/charts/DashboardCharts.tsx` - Replaced 30d with 2d in dashboard time range options
- `apps/web/src/components/metrics/MetricsAreaChart.tsx` - getTickInterval switch cases updated for new ranges

## Decisions Made
- Used Zustand persist version 2 migration with a validRanges allowlist to safely convert old localStorage values to '24h' default
- Replaced DashboardCharts '30d' option with '2d' since '30d' is no longer a valid backend range and '2d' is the closest multi-day option in the Grafana-standard set
- Used double-cast (`as unknown as MetricsPreferencesState`) in migrate function because TypeScript's strict mode rejects direct cast from `Record<string, unknown>` to the state interface

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated chart-theme.ts TimeRange type**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** `chart-theme.ts` exported `TimeRange = '1h' | '6h' | '24h' | '7d' | '30d'` which included '30d' no longer accepted by backend
- **Fix:** Updated to full Grafana-standard set, updated `formatTimestamp` switch cases
- **Files modified:** `apps/web/src/components/charts/chart-theme.ts`
- **Verification:** `pnpm typecheck` passes
- **Committed in:** `6068518` (Task 2 commit)

**2. [Rule 3 - Blocking] Updated DashboardCharts.tsx time range options**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** DashboardCharts had `{ value: '30d', label: 'Last 30 days' }` which failed tRPC type inference against new backend schema
- **Fix:** Replaced with `{ value: '2d', label: 'Last 2 days' }`
- **Files modified:** `apps/web/src/components/charts/DashboardCharts.tsx`
- **Verification:** `pnpm typecheck` passes
- **Committed in:** `6068518` (Task 2 commit)

**3. [Rule 3 - Blocking] Updated MetricsAreaChart.tsx tick interval switch cases**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** `getTickInterval()` had cases for '30s' and '1m' which are no longer valid MetricsRange values
- **Fix:** Replaced with '15m', '30m' and added '3h', '12h', '2d' cases
- **Files modified:** `apps/web/src/components/metrics/MetricsAreaChart.tsx`
- **Verification:** `pnpm typecheck` passes
- **Committed in:** `6068518` (Task 2 commit)

**4. [Rule 1 - Bug] Fixed Zustand migrate return type cast**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** `return state as MetricsPreferencesState` failed TypeScript strict check because Record<string, unknown> doesn't overlap with MetricsPreferencesState
- **Fix:** Changed to `return state as unknown as MetricsPreferencesState` (double-cast through unknown)
- **Files modified:** `apps/web/src/stores/metrics-preferences.ts`
- **Verification:** `pnpm typecheck` passes
- **Committed in:** `6068518` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 bug)
**Impact on plan:** All auto-fixes necessary for typecheck to pass. The plan correctly identified the 4 primary files but additional consumers of the old range types needed alignment. No scope creep.

## Issues Encountered
- Worktree was missing Plan 01-01 backend changes; resolved by merging main into worktree branch (fast-forward)
- `pnpm install` required in worktree since node_modules were not shared with main checkout
- 3 pre-existing integration test failures in `health-check.integration.test.ts` due to fake DATABASE_URL -- unrelated, documented in Plan 01-01

## User Setup Required
None - no external service configuration required. Existing localStorage values with old ranges (30s, 1m, 30d) will be automatically migrated to '24h' on first page load via the Zustand v2 migration.

## Known Stubs
None - all code paths are fully functional. The frontend is now fully aligned with the backend API changes from Plan 01-01.

## Next Phase Readiness
- Frontend and backend are aligned on Grafana-standard time ranges
- Phase 2 (SSE Real-Time Streaming) can proceed -- frontend will need a new data source for short ranges (<=15m)
- Phase 3 (Time Range Controls) will build on the TimeRangeSelector component updated here

## Self-Check: PASSED

All 7 modified files exist. Both task commits (3d64903, 6068518) verified in git log. SUMMARY.md created.

---
*Phase: 01-backend-data-pipeline*
*Completed: 2026-03-28*
