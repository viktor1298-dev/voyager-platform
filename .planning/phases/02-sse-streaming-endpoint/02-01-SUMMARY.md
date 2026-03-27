---
phase: 02-sse-streaming-endpoint
plan: 01
subsystem: api
tags: [sse, fastify, k8s-metrics, event-emitter, reference-counting, streaming]

# Dependency graph
requires: []
provides:
  - "SSE endpoint at /api/metrics/stream for live K8s metrics streaming"
  - "MetricsStreamJob with reference-counted subscribe/unsubscribe lifecycle"
  - "MetricsStreamEvent shared type in @voyager/types"
  - "emitMetricsStream typed method on VoyagerEventEmitter"
affects: [03-time-range-controls, frontend-metrics-consumer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reference-counted polling: start on first subscriber, stop on last unsubscribe"
    - "Per-cluster SSE channels via voyagerEmitter (metrics-stream:${clusterId})"
    - "Connection limits: per-cluster (10) and global (50) with 429 enforcement"

key-files:
  created:
    - apps/api/src/routes/metrics-stream.ts
    - apps/api/src/jobs/metrics-stream-job.ts
    - apps/api/src/__tests__/metrics-stream-job.test.ts
    - apps/api/src/__tests__/metrics-stream.test.ts
  modified:
    - packages/types/src/sse.ts
    - packages/config/src/sse.ts
    - apps/api/src/config/jobs.ts
    - apps/api/src/lib/event-emitter.ts
    - apps/api/src/server.ts

key-decisions:
  - "Used vi.hoisted() pattern for Vitest mock state to avoid factory closure issues"
  - "Zod v4 z.string().uuid() validates strict UUID v4 format (13th char must be 4)"
  - "Connection limits implemented as module-level Map counters (not Redis) -- single-instance sufficient"

patterns-established:
  - "Reference-counted polling: Map<clusterId, { interval, subscribers: Set<connectionId> }>"
  - "SSE route pattern: validate -> auth -> cluster lookup -> limits -> writeHead -> subscribe -> heartbeat -> cleanup on close"

requirements-completed: [SSE-01, SSE-02]

# Metrics
duration: 17min
completed: 2026-03-28
---

# Phase 02 Plan 01: SSE Streaming Endpoint Summary

**Backend SSE endpoint for live K8s metrics at /api/metrics/stream with reference-counted MetricsStreamJob polling at 15s intervals**

## Performance

- **Duration:** 17 min
- **Started:** 2026-03-27T22:36:18Z
- **Completed:** 2026-03-27T22:54:05Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- SSE endpoint at `/api/metrics/stream` with auth, Zod validation, cluster existence check, and connection limits
- MetricsStreamJob class with reference-counted subscribe/unsubscribe -- starts polling on first subscriber, stops on last disconnect
- Immediate first poll on subscribe (no 15s wait for first data point)
- K8s errors emit METRICS_UNAVAILABLE error events instead of throwing
- Graceful shutdown via metricsStreamJob.stopAll() in server signal handler
- 13 unit tests across 2 test files covering full lifecycle

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared types, config constants, and MetricsStreamJob with tests** - `fccab6a` (feat)
2. **Task 2: SSE route, server registration, and route tests** - `2ab3183` (feat)

## Files Created/Modified
- `apps/api/src/routes/metrics-stream.ts` - Fastify SSE endpoint with auth, validation, streaming, cleanup
- `apps/api/src/jobs/metrics-stream-job.ts` - Reference-counted K8s metrics-server polling job
- `apps/api/src/__tests__/metrics-stream-job.test.ts` - 8 unit tests for MetricsStreamJob lifecycle
- `apps/api/src/__tests__/metrics-stream.test.ts` - 5 unit tests for SSE route (auth, validation, 404, subscribe)
- `packages/types/src/sse.ts` - Added MetricsStreamEvent interface
- `packages/config/src/sse.ts` - Added SSE_METRICS_STREAM_POLL_MS (15s)
- `apps/api/src/config/jobs.ts` - Added METRICS_STREAM_POLL_MS to JOB_INTERVALS
- `apps/api/src/lib/event-emitter.ts` - Added emitMetricsStream typed method
- `apps/api/src/server.ts` - Registered route, added stopAll() to shutdown

## Decisions Made
- Used `voyagerEmitter.emitMetricsStream()` typed method instead of raw `this.emit('metrics-stream:...')` in MetricsStreamJob for better encapsulation
- Connection limits (10/cluster, 50 global) implemented as module-level counters since the app is single-instance
- Zod v4 `z.string().uuid()` enforces strict UUID v4 format -- test UUIDs must have '4' as 13th hex digit
- Network bytes fields included in MetricsStreamEvent type but typically null (K8s metrics-server doesn't expose network I/O)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all data flows are wired to real K8s metrics collection via clusterClientPool.

## Issues Encountered
- Vitest mock factory cannot reference top-level variables (arrow functions not constructable with `new`) -- resolved with `vi.hoisted()` pattern and `function()` syntax for Metrics constructor mock
- Fastify `inject()` blocks indefinitely for SSE connections that never end -- resolved by using real HTTP requests with `http.get()` for SSE-specific tests

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SSE endpoint ready for frontend consumption in Phase 3 (time range controls + client-side SSE hook)
- `voyagerEmitter` channel pattern `metrics-stream:${clusterId}` established for client subscription
- MetricsStreamEvent type exported from @voyager/types for frontend import

## Self-Check: PASSED

All 9 created/modified files verified on disk. Both task commits (fccab6a, 2ab3183) found in git log.

---
*Phase: 02-sse-streaming-endpoint*
*Completed: 2026-03-28*
