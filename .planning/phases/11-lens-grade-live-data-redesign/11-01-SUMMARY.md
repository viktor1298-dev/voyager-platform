---
phase: 11-lens-grade-live-data-redesign
plan: 01
subsystem: api
tags: [sse, fastify, compression, k8s-informer, real-time]

# Dependency graph
requires:
  - phase: 10-lens-style-live-data-k8s-watch-stream-architecture
    provides: WatchManager with informer ObjectCache and SSE resource stream
provides:
  - Immediate SSE event flush (no batch buffer)
  - Snapshot event on connect with full informer cache
  - Compression disabled on all 3 SSE routes
  - Exported RESOURCE_DEFS array from watch-manager
affects: [11-02, 11-03, 11-04, web-sse-consumers]

# Tech tracking
tech-stack:
  added: []
  patterns: [immediate-sse-flush, snapshot-on-connect, compress-false-sse-routes]

key-files:
  created: []
  modified:
    - apps/api/src/routes/resource-stream.ts
    - apps/api/src/routes/metrics-stream.ts
    - apps/api/src/routes/log-stream.ts
    - apps/api/src/lib/watch-manager.ts
    - packages/config/src/sse.ts

key-decisions:
  - "Immediate flush per event instead of batch buffer — <50ms latency vs ~1000ms"
  - "Snapshot event sends full informer cache per resource type on connect — eliminates initial load window"
  - "Compression disabled via Fastify route config { compress: false } on all 3 SSE routes"

patterns-established:
  - "SSE routes use { config: { compress: false } } to prevent @fastify/compress buffering"
  - "Snapshot event pattern: iterate RESOURCE_DEFS, getResources(), map, write per type"

requirements-completed: [L11-IMMEDIATE-SSE, L11-COMPRESS-FIX, L11-SNAPSHOT]

# Metrics
duration: 3min
completed: 2026-03-29
---

# Phase 11 Plan 01: Immediate SSE Flush + Snapshot Summary

**Rewrote SSE resource stream for immediate event delivery with snapshot-on-connect and disabled compression on all 3 SSE routes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T20:52:37Z
- **Completed:** 2026-03-29T20:56:17Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Removed 1s batch buffer and 5s initial load window from resource stream — events now arrive within <50ms of K8s watch event
- Added snapshot event on connect that sends full informer cache per resource type, eliminating the need for separate tRPC queries for initial data
- Disabled compression on all 3 SSE routes (resource, metrics, log) to prevent @fastify/compress from buffering text/event-stream responses

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite resource-stream.ts -- immediate flush, snapshot event, compression disable** - `a28ac6d` (feat)
2. **Task 2: Disable compression on metrics and log SSE routes** - `f794973` (feat)

## Files Created/Modified
- `apps/api/src/routes/resource-stream.ts` - Rewritten: immediate write, snapshot event, compress disabled, no batch/initial-load-window
- `apps/api/src/routes/metrics-stream.ts` - Added { config: { compress: false } } to route registration
- `apps/api/src/routes/log-stream.ts` - Added { config: { compress: false } } to route registration
- `apps/api/src/lib/watch-manager.ts` - Exported RESOURCE_DEFS array and ResourceDef interface
- `packages/config/src/sse.ts` - Set RESOURCE_STREAM_BUFFER_MS to 0 with updated comment

## Decisions Made
- Immediate flush per event instead of batch buffer for <50ms latency (eliminates the 1s batch window)
- Snapshot event sends full informer cache per resource type on connect (eliminates 5s initial load window)
- Compression disabled via Fastify route config on all 3 SSE routes (not just resource stream)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functionality is wired and operational.

## Next Phase Readiness
- Resource stream now sends snapshots + immediate events, ready for frontend consumers to switch from tRPC polling to SSE-first data flow
- RESOURCE_DEFS export enables future plans to build snapshot-aware SSE consumers

---
*Phase: 11-lens-grade-live-data-redesign*
*Completed: 2026-03-29*
