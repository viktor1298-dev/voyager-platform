---
phase: 03-time-range-controls-data-source-wiring
plan: 01
subsystem: web
tags: [sse-client, circular-buffer, data-hooks, metrics, time-range, react-hooks]

# Dependency graph
requires:
  - "SSE endpoint at /api/metrics/stream (Phase 02)"
  - "MetricsStreamEvent type from @voyager/types (Phase 02)"
  - "MetricsDataPoint interface from MetricsAreaChart (Phase 01)"
  - "Grafana-standard MetricsRange type (Phase 01)"
provides:
  - "MetricsBuffer circular buffer class for bounded SSE point storage"
  - "convertSSEEvent function mapping SSE events to chart data points"
  - "useMetricsSSE hook with EventSource, reconnect backoff, visibility lifecycle"
  - "useMetricsData unified data hook abstracting SSE vs tRPC sources"
affects: [03-02-PLAN, metrics-time-series-panel, chart-components]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Circular buffer with dual eviction: capacity-based overwrite + time-based stale removal"
    - "SSE EventSource with exponential backoff reconnect (1s -> 2s -> 4s -> ... -> 30s max)"
    - "Visibility-aware SSE lifecycle: close on hidden tab, reconnect with buffer clear on focus"
    - "Data source switching: range-driven (5m/15m = SSE live, 30m+ = tRPC historical)"

key-files:
  created:
    - apps/web/src/lib/metrics-buffer.ts
    - apps/web/src/lib/metrics-buffer.test.ts
    - apps/web/src/hooks/useMetricsSSE.ts
    - apps/web/src/hooks/useMetricsData.ts
  modified: []

key-decisions:
  - "MetricsBuffer uses pre-allocated array with head/count tracking (not Array.push/shift) for O(1) push"
  - "Buffer clear on tab visibility restore prevents rendering stale data from before the tab was hidden"
  - "Error type in useMetricsData widened to { message: string } | null to accommodate TRPCClientErrorLike (not assignable to Error)"
  - "SSE error events from server (event.error field) are silently skipped rather than pushed to buffer"

patterns-established:
  - "useRef for MetricsBuffer instance (avoid re-renders on internal buffer mutations)"
  - "Unified data hook pattern: single return shape regardless of underlying data source"

requirements-completed: [SSE-03, SSE-04, SSE-05, TIME-04]

# Metrics
duration: 6min
completed: 2026-03-28
---

# Phase 03 Plan 01: Client-Side Data Layer Summary

**Circular buffer, SSE connection hook with reconnect/backoff/visibility, and unified data hook abstracting SSE vs DB for 5m/15m live and 30m+ historical ranges**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-27T23:11:48Z
- **Completed:** 2026-03-27T23:18:00Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments
- MetricsBuffer circular buffer with fixed capacity (65 points max) and dual eviction (capacity wrapping + time-based stale removal)
- convertSSEEvent utility mapping MetricsStreamEvent to MetricsDataPoint (null bucketStart/bucketEnd for live data)
- useMetricsSSE hook managing EventSource connection to /api/metrics/stream with exponential backoff reconnect (SSE-03)
- Visibility-aware SSE lifecycle: closes connection when tab hidden, clears buffer and reconnects fresh on tab focus (SSE-04)
- useMetricsData unified hook that returns SSE data for 5m/15m ranges and tRPC data for 30m+ ranges via a single interface (TIME-04)
- 8 unit tests covering buffer push, capacity overflow, time eviction, clear, duplicate timestamps, and SSE event conversion

## Task Commits

Each task was committed atomically:

1. **Task 1: MetricsBuffer circular buffer with unit tests (TDD)** - `6135ca9` (feat)
2. **Task 2: useMetricsSSE and useMetricsData hooks** - `747ae05` (feat)

## Files Created
- `apps/web/src/lib/metrics-buffer.ts` - MetricsBuffer class and convertSSEEvent function
- `apps/web/src/lib/metrics-buffer.test.ts` - 8 unit tests for buffer behavior and SSE conversion
- `apps/web/src/hooks/useMetricsSSE.ts` - SSE EventSource hook with reconnect backoff and visibility awareness
- `apps/web/src/hooks/useMetricsData.ts` - Unified data hook abstracting SSE (live) vs tRPC (historical)

## Decisions Made
- MetricsBuffer uses pre-allocated array with circular head/count tracking for O(1) operations
- Buffer is cleared on tab visibility restore to prevent rendering stale data
- useMetricsData error type widened to `{ message: string } | null` to accommodate TRPCClientErrorLike
- SSE server error events (error field present) are silently skipped

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all data flows are wired to real SSE endpoint and tRPC queries.

## Issues Encountered
- `TRPCClientErrorLike` is not assignable to `Error | null` (missing `name` property) -- resolved by widening the error type in the return interface to `{ message: string } | null`
- Worktree has no `node_modules` -- tests and typecheck run by copying files to main repo temporarily

## Next Phase Readiness
- MetricsBuffer and hooks ready for consumption by Plan 03-02 (UI components)
- useMetricsData hook is the drop-in replacement for the current direct tRPC query in MetricsTimeSeriesPanel
- No stubs or incomplete wiring -- Plan 03-02 can import and use all exports directly

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (6135ca9, 747ae05) found in git log.

---
*Phase: 03-time-range-controls-data-source-wiring*
*Completed: 2026-03-28*
