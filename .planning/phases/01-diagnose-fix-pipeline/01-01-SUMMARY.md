---
phase: 01-diagnose-fix-pipeline
plan: 01
subsystem: api
tags: [kubernetes, informers, watch-api, event-emitter, sse, heartbeat]

# Dependency graph
requires: []
provides:
  - Per-informer heartbeat timeout detection and auto-restart in WatchManager
  - EventEmitter-based watch event subscription in watch-db-writer (no monkeypatch)
affects: [01-diagnose-fix-pipeline, live-data-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-informer heartbeat timeout with auto-restart on silent death"
    - "EventEmitter newListener pattern for dynamic channel subscription"

key-files:
  created: []
  modified:
    - apps/api/src/lib/watch-manager.ts
    - apps/api/src/lib/watch-db-writer.ts

key-decisions:
  - "Used setTimeout per-informer heartbeat (90s) rather than a single polling interval for precision"
  - "Used EventEmitter newListener event for auto-discovery of new watch-event channels"
  - "Stored newListener handler as __newListener key in listeners map for clean removal"

patterns-established:
  - "Heartbeat timeout pattern: reset timer on every event, restart informer on timeout"
  - "EventEmitter listener pattern: subscribe via on(), clean up via off() -- never monkeypatch emit methods"

requirements-completed: [PIPE-01, PIPE-03, PIPE-04]

# Metrics
duration: 3min
completed: 2026-03-30
---

# Phase 01 Plan 01: Backend Pipeline Fix Summary

**Per-informer heartbeat timeout (90s) for silent death detection and EventEmitter listener pattern replacing fragile monkeypatch in watch-db-writer**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-30T00:47:31Z
- **Completed:** 2026-03-30T00:50:11Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- WatchManager now detects and restarts silently-dead informers within 90 seconds via per-informer heartbeat timers
- watch-db-writer is a pure EventEmitter listener that cannot block, delay, or double-wrap SSE event delivery
- Clean lifecycle management: timers and listeners properly cleaned up on unsubscribe/stop

## Task Commits

Each task was committed atomically:

1. **Task 1: Add per-informer heartbeat timeout to WatchManager** - `9f8d757` (feat)
2. **Task 2: Refactor watch-db-writer from monkeypatch to EventEmitter listener** - `e6f340c` (refactor)

## Files Created/Modified
- `apps/api/src/lib/watch-manager.ts` - Added heartbeatTimers map, resetHeartbeat/clearHeartbeat methods, timer reset on add/update/delete/connect events, cleanup on unsubscribe/stopAll
- `apps/api/src/lib/watch-db-writer.ts` - Replaced emitWatchEvent monkeypatch with voyagerEmitter.on('newListener') pattern, proper cleanup via voyagerEmitter.off()

## Decisions Made
- Used per-informer setTimeout (one timer per clusterId:resourceType) rather than a single setInterval poller -- provides precise 90s timeout per informer without unnecessary overhead
- Used EventEmitter 'newListener' event for auto-discovery of new watch-event channels -- avoids needing to know cluster IDs upfront and handles dynamic cluster additions
- Stored newListener handler reference as '__newListener' key in listeners map for clean removal on stop

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - both files are fully wired with no placeholder data.

## Next Phase Readiness
- Backend pipeline fixes are complete -- informers self-heal from silent death and DB sync is decoupled from SSE delivery
- Ready for Plan 02 (frontend SSE fixes) which addresses the other half of the live data pipeline

---
*Phase: 01-diagnose-fix-pipeline*
*Completed: 2026-03-30*
