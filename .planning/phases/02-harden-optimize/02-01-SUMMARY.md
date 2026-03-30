---
phase: 02-harden-optimize
plan: 01
subsystem: api
tags: [sse, event-id, ring-buffer, reconnection, heartbeat, last-event-id]

# Dependency graph
requires:
  - phase: 01-diagnose-fix-pipeline
    provides: Working SSE pipeline with immediate flush and snapshot-on-connect
provides:
  - Monotonic event IDs on all SSE watch/snapshot/status events
  - 100-event ring buffer per connection for Last-Event-ID replay
  - Named heartbeat event visible to client JavaScript
  - SSE_CLIENT_HEARTBEAT_TIMEOUT_MS constant for client-side monitoring
affects: [02-harden-optimize/02-02, frontend-reconnect, client-heartbeat-monitor]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-connection-ring-buffer, last-event-id-replay, named-heartbeat-event]

key-files:
  created: []
  modified:
    - packages/config/src/sse.ts
    - apps/api/src/routes/resource-stream.ts

key-decisions:
  - "Per-connection ring buffer (not per-cluster) to avoid cross-connection data leaks"
  - "Heartbeat events excluded from ring buffer -- keepalive-only, not worth replaying"
  - "Named event: heartbeat with empty data field for client addEventListener compatibility"

patterns-established:
  - "writeEventWithId: central helper for all SSE event writes with automatic ID assignment and buffering"
  - "Last-Event-ID check before snapshot: replay from buffer if possible, full snapshot as fallback"

requirements-completed: [CONN-01, CONN-02]

# Metrics
duration: 2min
completed: 2026-03-30
---

# Phase 02 Plan 01: SSE Event IDs + Ring Buffer Replay Summary

**Monotonic event IDs with 100-event ring buffer replay on reconnect and named heartbeat event for client-side monitoring**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-30T02:47:48Z
- **Completed:** 2026-03-30T02:50:41Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Every SSE watch, snapshot, and status event now carries a monotonic `id:` field that native EventSource tracks automatically
- On reconnect with Last-Event-ID header, the server replays missed events from a 100-event ring buffer without sending a full snapshot
- When the ring buffer overflows (Last-Event-ID too old), the server falls back to a full snapshot (existing behavior preserved)
- Heartbeat converted from invisible SSE comment (`:heartbeat`) to named `event: heartbeat` visible to client JavaScript
- New `SSE_CLIENT_HEARTBEAT_TIMEOUT_MS = 45_000` constant exported from `@voyager/config/sse` for Plan 02-02

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SSE_CLIENT_HEARTBEAT_TIMEOUT_MS constant** - `bbc107d` (feat)
2. **Task 2: Event IDs, ring buffer replay, named heartbeat** - `f8841a2` (feat)

## Files Created/Modified
- `packages/config/src/sse.ts` - Added SSE_CLIENT_HEARTBEAT_TIMEOUT_MS = 45_000 constant
- `apps/api/src/routes/resource-stream.ts` - Event ID counter, ring buffer, Last-Event-ID replay, writeEventWithId helper, named heartbeat

## Decisions Made
- Per-connection ring buffer (not per-cluster) to avoid cross-connection data leaks -- each SSE connection has its own eventCounter and replayBuffer scoped to the handleResourceStream closure
- Heartbeat events excluded from ring buffer and ID counter -- they are keepalive-only and should not be replayed on reconnect
- Named `event: heartbeat` with empty `data: ` field (not `data: {}`) for minimal overhead while remaining valid SSE

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Event IDs and ring buffer are in place; Plan 02-02 can now implement client-side reconnect with Last-Event-ID, heartbeat monitoring using SSE_CLIENT_HEARTBEAT_TIMEOUT_MS, and event batching for burst performance
- No blockers

---
*Phase: 02-harden-optimize*
*Completed: 2026-03-30*
