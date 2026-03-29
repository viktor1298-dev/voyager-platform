---
phase: 10-lens-style-live-data-k8s-watch-stream-architecture
plan: 04
subsystem: api
tags: [kubernetes, watch-manager, informer, tRPC, router, in-memory-cache]

# Dependency graph
requires:
  - phase: 10-01-PLAN
    provides: WatchManager class with getResources/isWatching API, 15 resource mapper functions
provides:
  - All 15 watched resource tRPC routers read from WatchManager in-memory store
  - Topology router reads 7 resource types from WatchManager (~0ms vs 7 API calls)
  - Clusters live/liveNodes/liveEvents/liveStatus use WatchManager for 5 resource types
  - Consistent fallback to cached() K8s API when WatchManager not active
affects: [10-05-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [watch-first-fallback-api, shared-mapper-dedup]

key-files:
  created: []
  modified:
    - apps/api/src/routers/pods.ts
    - apps/api/src/routers/deployments.ts
    - apps/api/src/routers/services.ts
    - apps/api/src/routers/nodes.ts
    - apps/api/src/routers/events.ts
    - apps/api/src/routers/configmaps.ts
    - apps/api/src/routers/secrets.ts
    - apps/api/src/routers/pvcs.ts
    - apps/api/src/routers/namespaces.ts
    - apps/api/src/routers/ingresses.ts
    - apps/api/src/routers/statefulsets.ts
    - apps/api/src/routers/daemonsets.ts
    - apps/api/src/routers/jobs.ts
    - apps/api/src/routers/cronjobs.ts
    - apps/api/src/routers/hpa.ts
    - apps/api/src/routers/topology.ts
    - apps/api/src/routers/clusters.ts

key-decisions:
  - "Pods and nodes still fetch Metrics API separately via cached() since metrics-server is not watchable"
  - "Topology reads all 7 resource types from WatchManager when watching, replacing 7 API calls with in-memory reads"
  - "Namespaces router reads namespaces from WatchManager but still fetches resource quotas from API (not a watched type)"
  - "Events router adds listLive procedure for WatchManager reads; DB-based list procedure unchanged"
  - "Clusters.live separates version fetch (always API) from 5 resource reads (WatchManager when available)"
  - "Inline computeAge/computeDuration/deriveStatus helpers removed from routers in favor of shared resource-mappers"

patterns-established:
  - "Watch-first pattern: check watchManager.isWatching(clusterId) before any cached() call, fallback to API if not watching"
  - "Shared mapper dedup: all routers use resource-mappers.ts instead of inline transformation, reducing total code by ~320 lines"

requirements-completed: [D-07]

# Metrics
duration: 15min
completed: 2026-03-29
---

# Phase 10 Plan 04: Router Migration to WatchManager Summary

**17 tRPC routers migrated to read from WatchManager in-memory informer cache with K8s API fallback, eliminating Redis cache layer for watched resources**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-29T17:16:45Z
- **Completed:** 2026-03-29T17:31:44Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- Migrated all 15 watched resource routers (pods, deployments, services, nodes, events, configmaps, secrets, pvcs, namespaces, ingresses, statefulsets, daemonsets, jobs, cronjobs, hpa) to read from WatchManager in-memory store
- Topology router now reads 7 resource types from WatchManager (~0ms total vs 7 separate K8s API calls + Redis cache)
- Clusters router (live, liveNodes, liveEvents, liveStatus) reads 5 resource types from WatchManager
- Removed ~320 lines of duplicated inline mapping code across routers by using shared resource-mappers

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate complex routers (pods, deployments, services, nodes, events) to WatchManager** - `73dc96d` (feat)
2. **Task 2: Migrate simple routers (10 types) + topology + clusters to WatchManager** - `2d51d51` (feat)

## Files Created/Modified
- `apps/api/src/routers/pods.ts` - Uses watchManager + mapPod, metrics still from API
- `apps/api/src/routers/deployments.ts` - listByCluster and listDetail use watchManager
- `apps/api/src/routers/services.ts` - list, listByCluster, listDetail use watchManager with namespace filtering
- `apps/api/src/routers/nodes.ts` - listLive uses watchManager + mapNode, metrics still from API
- `apps/api/src/routers/events.ts` - Added listLive procedure reading from watchManager
- `apps/api/src/routers/configmaps.ts` - Uses watchManager + mapConfigMap
- `apps/api/src/routers/secrets.ts` - Uses watchManager + mapSecret
- `apps/api/src/routers/pvcs.ts` - Uses watchManager + mapPVC
- `apps/api/src/routers/namespaces.ts` - Uses watchManager + mapNamespace, quotas still from API
- `apps/api/src/routers/ingresses.ts` - Uses watchManager + mapIngress
- `apps/api/src/routers/statefulsets.ts` - Uses watchManager + mapStatefulSet
- `apps/api/src/routers/daemonsets.ts` - Uses watchManager + mapDaemonSet
- `apps/api/src/routers/jobs.ts` - Uses watchManager + mapJob
- `apps/api/src/routers/cronjobs.ts` - Uses watchManager + mapCronJob
- `apps/api/src/routers/hpa.ts` - Uses watchManager + mapHPA
- `apps/api/src/routers/topology.ts` - Reads all 7 types from watchManager in graph procedure
- `apps/api/src/routers/clusters.ts` - live, liveNodes, liveEvents, liveStatus use watchManager

## Decisions Made
- Pods and nodes metrics still fetched from Metrics API via cached() since metrics-server is not watchable
- Topology reads all 7 types from WatchManager when watching, replacing 7 API calls with in-memory reads
- Namespaces still fetches resource quotas from API (not a watched type) but reads namespaces from WatchManager
- Events router adds a new listLive procedure for WatchManager reads; existing DB-based list remains unchanged
- Clusters.live separates version fetch (always API) from 5 resource reads (WatchManager when available)
- Replaced inline computeAge, computeDuration, deriveStatus, mapContainer, mapPorts helpers with shared resource-mappers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed hpa.ts missing computeAge reference**
- **Found during:** Task 2 (simple routers migration)
- **Issue:** Removed inline computeAge function but fallback path still referenced it
- **Fix:** Replaced inline mapping with mapHPA() from resource-mappers
- **Files modified:** apps/api/src/routers/hpa.ts
- **Verification:** pnpm build passes
- **Committed in:** 2d51d51 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial fix necessary for compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all modules are fully implemented with complete logic.

## Next Phase Readiness
- All 17 routers now read from WatchManager when watches are active
- Ready for Plan 05: SSE streaming endpoint that pushes watch events to the browser
- Non-watched routers (helm, crds, rbac, network-policies, resource-quotas, yaml) remain on cached() API path as designed

## Self-Check: PASSED

All 17 files verified present. Commits 73dc96d and 2d51d51 verified in git log.

---
*Phase: 10-lens-style-live-data-k8s-watch-stream-architecture*
*Completed: 2026-03-29*
