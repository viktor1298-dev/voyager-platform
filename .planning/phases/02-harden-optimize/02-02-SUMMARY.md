---
phase: 02-harden-optimize
plan: 02
subsystem: sse, frontend
tags: [zustand, sse, reconnect, backoff, heartbeat, event-buffer, batch-flush]

requires:
  - phase: 02-harden-optimize/01
    provides: SSE_CLIENT_HEARTBEAT_TIMEOUT_MS constant, named heartbeat events, event IDs
provides:
  - Custom exponential backoff SSE reconnect (1s -> 30s cap) replacing native EventSource retry
  - Client-side heartbeat dead-connection detection within 45 seconds
  - 1-second event buffer with Zustand batch flush (applyEvents) reducing renders during burst events
affects: [sse-streaming, resource-store, live-data-pipeline]

tech-stack:
  added: []
  patterns: [exponential-backoff-reconnect, heartbeat-dead-connection-detection, event-buffer-batch-flush]

key-files:
  created: []
  modified:
    - apps/web/src/hooks/useResourceSSE.ts
    - apps/web/src/stores/resource-store.ts

key-decisions:
  - "10-second heartbeat check interval for 45-second timeout (4+ checks per window)"
  - "1-second buffer window for event batching (balances latency vs render reduction)"
  - "Flush remaining buffered events on unmount before clearing cluster data"

patterns-established:
  - "Custom SSE reconnect with exponential backoff: close native EventSource, schedule own reconnect via setTimeout"
  - "Zustand batch method (applyEvents): single Map copy + single set() for N events"
  - "Stale data preservation on reconnect: never clear Zustand store on connection error"

requirements-completed: [CONN-02, CONN-03, PERF-01, PERF-02]

duration: 3min
completed: 2026-03-30
---

# Phase 02 Plan 02: Client SSE Resilience Summary

**Exponential backoff reconnect, client heartbeat dead-connection detection, and 1-second event buffer with Zustand batch flush for burst event handling**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-30T02:55:45Z
- **Completed:** 2026-03-30T02:59:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- SSE connections auto-reconnect with exponential backoff (1s -> 2s -> 4s -> 8s -> 16s -> 30s cap) on any error
- Client detects dead SSE connections within 45 seconds via heartbeat timeout and forces reconnect
- Burst events (50+ in 5 seconds) produce ~5 renders via 1-second buffer window instead of 50+ individual renders
- Stale data remains visible during reconnect (no flash to empty state)
- Silent reconnect with no toast notifications

## Task Commits

Each task was committed atomically:

1. **Task 1: Add applyEvents batch method to Zustand resource store** - `6120589` (feat)
2. **Task 2: Rewrite useResourceSSE with custom reconnect, heartbeat monitor, and event buffer** - `1e9f570` (feat)

## Files Created/Modified
- `apps/web/src/stores/resource-store.ts` - Added `applyEvents` batch method (interface + implementation) that processes multiple WatchEvents in a single `set()` call
- `apps/web/src/hooks/useResourceSSE.ts` - Rewritten with custom exponential backoff reconnect, client heartbeat monitor, and 1-second event buffer with batch flush

## Decisions Made
- 10-second heartbeat check interval chosen for 45-second timeout window (gives 4+ checks before declaring dead)
- 1-second buffer window chosen as balance between perceived latency (sub-second is fine for K8s ops) and render reduction
- Remaining buffered events flushed on unmount before clearing cluster data to avoid data loss
- Native EventSource auto-reconnect explicitly disabled by calling `es.close()` in onerror handler

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SSE client is now resilient to network drops and dead connections
- Ready for production deployment with confidence in connection stability
- The applyEvents batch method can be reused by any future consumer needing bulk Zustand updates

---
*Phase: 02-harden-optimize*
*Completed: 2026-03-30*
