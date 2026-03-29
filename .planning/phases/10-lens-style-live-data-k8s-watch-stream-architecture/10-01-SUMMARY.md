---
phase: 10-lens-style-live-data-k8s-watch-stream-architecture
plan: 01
subsystem: api
tags: [kubernetes, informer, watch, sse, resource-mapper, drizzle]

# Dependency graph
requires:
  - phase: 08-resource-explorer
    provides: tRPC resource routers for 15 K8s types, ResourceWatchManager, ClusterWatchManager
provides:
  - Unified WatchManager class with per-cluster informer lifecycle (D-05, D-06)
  - Informer ObjectCache as in-memory store via getResources/getResource (D-07)
  - 15 extracted resource mapper functions (mapPod, mapDeployment, ..., mapHPA)
  - Watch-db-writer module replacing health-sync, node-sync, event-sync DB writes (D-09)
  - WatchEvent, WatchEventBatch, WatchStatusEvent types in @voyager/types
  - Watch reconnect/sync config constants in @voyager/config/sse
affects: [10-02-PLAN, 10-03-PLAN, 10-04-PLAN, 10-05-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [unified-watch-manager, resource-mapper-extraction, debounced-db-writer]

key-files:
  created:
    - apps/api/src/lib/watch-manager.ts
    - apps/api/src/lib/watch-db-writer.ts
    - apps/api/src/lib/resource-mappers.ts
    - apps/api/src/__tests__/watch-manager.test.ts
    - apps/api/src/__tests__/resource-mappers.test.ts
  modified:
    - packages/types/src/sse.ts
    - packages/config/src/sse.ts
    - apps/api/src/lib/event-emitter.ts

key-decisions:
  - "Debounced periodic sync for watch-db-writer (60s interval) instead of per-event DB writes to avoid overwhelming PostgreSQL during rolling deployments"
  - "WatchManager uses makeInformer's built-in ObjectCache for getResources/getResource instead of maintaining a separate in-memory store"
  - "Resource mappers accept optional metricsMap parameter for pods/nodes so routers can still enrich with metrics data"

patterns-established:
  - "Resource mapper extraction: standalone functions in resource-mappers.ts shared by both tRPC routers and WatchManager SSE events"
  - "Dirty-set tracking: watch-db-writer marks cluster:resourceType pairs dirty on events, syncs periodically"
  - "Reference-counted informer lifecycle: subscribe increments count, unsubscribe decrements, stop at zero"

requirements-completed: [D-06, D-07, D-05, D-09]

# Metrics
duration: 9min
completed: 2026-03-29
---

# Phase 10 Plan 01: Unified WatchManager + Resource Mappers + Watch DB Writer Summary

**Unified WatchManager with informer ObjectCache store, 15 extracted resource mappers, and debounced PostgreSQL sync replacing 3 legacy jobs**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-29T17:04:17Z
- **Completed:** 2026-03-29T17:13:47Z
- **Tasks:** 1
- **Files modified:** 8

## Accomplishments
- Created unified WatchManager class managing per-cluster K8s informers for all 15 resource types with reference counting, exponential backoff reconnection, and ObjectCache-based data access
- Extracted 15 resource mapper functions from tRPC routers into shared resource-mappers.ts (mapPod, mapDeployment, mapService, mapNode, mapConfigMap, mapSecret, mapPVC, mapNamespace, mapEvent, mapIngress, mapStatefulSet, mapDaemonSet, mapJob, mapCronJob, mapHPA)
- Created watch-db-writer module with debounced periodic sync that replaces the DB write paths from health-sync, node-sync, and event-sync jobs
- Added WatchEvent/WatchEventBatch/WatchStatusEvent types and watch config constants

## Task Commits

Each task was committed atomically:

1. **Task 1: WatchEvent types + WatchManager + resource mappers + watch-db-writer + unit tests** - `63719b3` (feat)

## Files Created/Modified
- `apps/api/src/lib/watch-manager.ts` - Unified WatchManager class with per-cluster informer lifecycle, reference counting, ObjectCache access
- `apps/api/src/lib/watch-db-writer.ts` - Debounced DB persistence replacing health-sync, node-sync, event-sync job writes
- `apps/api/src/lib/resource-mappers.ts` - 15 resource mapper functions extracted from tRPC routers + shared helpers
- `apps/api/src/__tests__/watch-manager.test.ts` - WatchManager unit tests (subscribe/unsubscribe lifecycle, reference counting, getResources)
- `apps/api/src/__tests__/resource-mappers.test.ts` - Resource mapper unit tests for all 15 types + helpers
- `packages/types/src/sse.ts` - Added WatchEvent, WatchEventBatch, WatchStatusEvent, WatchEventType
- `packages/config/src/sse.ts` - Added WATCH_RECONNECT_BASE_MS, WATCH_RECONNECT_MAX_MS, WATCH_DB_SYNC_INTERVAL_MS, etc.
- `apps/api/src/lib/event-emitter.ts` - Added emitWatchEvent and emitWatchStatus methods

## Decisions Made
- Debounced periodic sync (60s) for watch-db-writer instead of per-event DB writes to avoid overwhelming PostgreSQL during rolling deployments
- WatchManager uses makeInformer's built-in ObjectCache for getResources/getResource (zero-copy, no API call)
- Resource mappers accept optional metricsMap parameter for pods/nodes so tRPC routers can still enrich with metrics data while watch events default to null metrics
- Watch-db-writer intercepts emitWatchEvent calls to track dirty cluster:resourceType pairs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all modules are fully implemented with complete logic.

## Next Phase Readiness
- WatchManager ready for integration into server.ts startup (Plan 02)
- Resource mappers ready to be used by tRPC routers to deduplicate transformation logic (Plan 03)
- watch-db-writer ready to replace sync jobs once WatchManager is wired into server lifecycle (Plan 02)
- WatchEvent types ready for SSE streaming endpoint (Plan 03)

## Self-Check: PASSED

All 8 files verified present. Commit 63719b3 verified in git log.

---
*Phase: 10-lens-style-live-data-k8s-watch-stream-architecture*
*Completed: 2026-03-29*
