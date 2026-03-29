---
phase: 10-lens-style-live-data-k8s-watch-stream-architecture
plan: 02
subsystem: api
tags: [sse, watch, streaming, batching, resource-stream]

# Dependency graph
requires:
  - phase: 10-01
    provides: Unified WatchManager with subscribe/unsubscribe, voyagerEmitter with emitWatchEvent/emitWatchStatus, WatchEvent/WatchEventBatch/WatchStatusEvent types, SSE config constants
provides:
  - Data-carrying SSE endpoint at /api/resources/stream (full WatchEventBatch objects, not signals)
  - 1-second server-side event batching preventing UI thrashing during rolling deployments
  - Initial load suppression (5s window) preventing duplicate ADDED events from informer list replay
  - Status event streaming for connection health (reconnecting, disconnected, etc.)
  - Exported handleResourceStream function for direct handler unit testing
affects: [10-03-PLAN, 10-04-PLAN, 10-05-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [data-carrying-sse, server-side-batching, initial-load-suppression, direct-handler-testing]

key-files:
  created:
    - apps/api/src/__tests__/resource-stream.test.ts
  modified:
    - apps/api/src/routes/resource-stream.ts

key-decisions:
  - "Exported handleResourceStream separately from registerResourceStreamRoute for direct handler testing — avoids Fastify inject deadlocks with SSE endpoints"
  - "Used direct mock request/reply objects for SSE behavior tests instead of Fastify inject — inject blocks until stream ends, incompatible with fake timers for precise timing assertions"
  - "Initial load window of 5 seconds suppresses only ADDED events, not MODIFIED or DELETED — informer list replay only produces ADDED events"

patterns-established:
  - "SSE handler export pattern: export named handler function + separate route registration function for testability"
  - "SSE unit test pattern: mock request.raw EventEmitter + mock reply.raw.write for capturing SSE output, use vi.useFakeTimers for timing control"

requirements-completed: [D-01, D-02]

# Metrics
duration: 11min
completed: 2026-03-29
---

# Phase 10 Plan 02: Data-Carrying SSE Resource Stream with Server-Side Batching Summary

**SSE resource-stream rewrite: full WatchEventBatch objects over `event: watch`, 1-second batching, status events, initial ADDED suppression, 14 unit tests**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-29T17:17:50Z
- **Completed:** 2026-03-29T17:29:13Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Rewrote resource-stream.ts from signal-only events (`event: resource-change` with name/type only) to data-carrying events (`event: watch` with full transformed resource objects in WatchEventBatch format)
- Implemented 1-second server-side batching (D-02) — multiple watch events within 1s are collected and flushed as a single SSE message, preventing UI thrashing during rolling deployments
- Added initial load window suppression (5s) — ADDED events from informer list replay are dropped since tRPC query already provides initial data (D-04)
- Added status event streaming (`event: status`) for WatchStatusEvent — connection health changes sent immediately without batching
- Replaced old resourceWatchManager with new unified watchManager.subscribe/unsubscribe
- Created 14 comprehensive unit tests covering SSE format, batching, suppression, status events, heartbeat, and connection cleanup

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD RED):** Failing tests for data-carrying SSE — `376fdaa` (test)
2. **Task 1 (TDD GREEN):** Rewrite resource-stream.ts + pass tests — `a45f2aa` (feat)

## Files Created/Modified
- `apps/api/src/routes/resource-stream.ts` — Complete rewrite: data-carrying SSE with WatchEventBatch, batching, status events, initial load suppression, watchManager integration
- `apps/api/src/__tests__/resource-stream.test.ts` — 14 tests: auth/validation (3), subscribe (1), SSE format (1), batching (1), status events (1), heartbeat (1), initial ADDED suppression (1), post-window ADDED pass-through (1), connected flush (1), cleanup on close (1), and more

## Decisions Made
- Exported `handleResourceStream` separately from `registerResourceStreamRoute` for direct handler testing — avoids Fastify inject deadlocks with SSE endpoints (inject blocks until stream ends)
- Used mock request/reply objects with real EventEmitter for SSE behavior tests — captures `reply.raw.write()` calls precisely with fake timer control
- Initial load window (5s) only suppresses ADDED events — MODIFIED and DELETED events during the window pass through since they represent real changes, not informer list replay

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test approach changed from Fastify inject to direct handler testing**
- **Found during:** Task 1 (RED phase)
- **Issue:** Fastify `inject()` for SSE endpoints blocks until stream ends. Combined with fake timers, this causes deadlocks — `app.close()` can't resolve the inject promise when timers are faked
- **Fix:** Exported `handleResourceStream` and tested it directly with mock request/reply objects. Auth/validation tests still use inject (non-SSE responses complete immediately). SSE behavior tests use mock `request.raw` EventEmitter + mock `reply.raw.write()` captures
- **Files modified:** `apps/api/src/routes/resource-stream.ts` (export handler), `apps/api/src/__tests__/resource-stream.test.ts` (mock-based SSE tests)
- **Verification:** All 14 tests pass with sub-second execution
- **Committed in:** `a45f2aa`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Testing pattern improvement. No scope change — same behavior verified, better test reliability.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - SSE endpoint is fully implemented with complete logic.

## Next Phase Readiness
- Data-carrying SSE endpoint ready for client-side consumption (Plan 03: useResourceSSE rewrite + ConnectionStatusBadge)
- Plan 04 (server.ts wiring) can integrate WatchManager startup with this stream endpoint
- Plan 05 (refetchInterval removal) depends on the client-side hook from Plan 03 consuming this endpoint

## Self-Check: PASSED

All files verified present:
- `apps/api/src/routes/resource-stream.ts` - FOUND
- `apps/api/src/__tests__/resource-stream.test.ts` - FOUND
- Commit `376fdaa` (RED) - FOUND
- Commit `a45f2aa` (GREEN) - FOUND

---
*Phase: 10-lens-style-live-data-k8s-watch-stream-architecture*
*Completed: 2026-03-29*
