---
phase: 03-expand-coverage
plan: 01
subsystem: api
tags: [kubernetes, watch-manager, sse, informers, network-policies, resource-quotas, health-endpoint]

# Dependency graph
requires:
  - phase: 02-harden-optimize
    provides: robust SSE reconnect, heartbeat monitoring, event buffering
provides:
  - network-policies and resource-quotas as live-watched resource types (15 -> 17)
  - mapNetworkPolicy() and mapResourceQuota() shared mapper functions
  - GET /api/watches/health endpoint for monitoring active cluster watches
  - Verified subscribe/unsubscribe/stopAll lifecycle chain for cluster-switch scenarios
affects: [03-02, frontend-integration, cluster-tabs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resource type expansion pattern: add to ResourceType union, create mapper, add RESOURCE_DEFS entry"
    - "Watch health endpoint pattern: auth-bypassed GET route exposing WatchManager state"

key-files:
  created:
    - apps/api/src/routes/watch-health.ts
  modified:
    - packages/types/src/sse.ts
    - apps/api/src/lib/resource-mappers.ts
    - apps/api/src/lib/watch-manager.ts
    - apps/api/src/server.ts
    - packages/config/src/routes.ts

key-decisions:
  - "Network policy mapper uses rule._from (not rule.from) matching K8s TS SDK keyword collision pattern from existing router"
  - "Watch health endpoint added to AUTH_BYPASS_PATHS for unauthenticated access (monitoring/health pattern)"
  - "Lifecycle chain verified correct as-is: subscribe creates informers on first subscriber, unsubscribe stops on refcount=0, clearCluster prevents stale data"

patterns-established:
  - "Resource type expansion: union type + mapper + RESOURCE_DEFS entry + typecheck"
  - "Health endpoint pattern: auth-bypassed, returns WatchManager internal state"

requirements-completed: [COVER-01, COVER-02, COVER-03]

# Metrics
duration: 5min
completed: 2026-03-30
---

# Phase 3 Plan 1: Expand Coverage - Backend Pipeline Summary

**Extended live watch pipeline from 15 to 17 K8s resource types (network-policies, resource-quotas), added watch health endpoint for lifecycle monitoring, and verified subscribe/unsubscribe chain**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-30T18:22:22Z
- **Completed:** 2026-03-30T18:27:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Extended ResourceType union from 15 to 17 members with network-policies and resource-quotas
- Created mapNetworkPolicy() and mapResourceQuota() mapper functions matching existing tRPC router shapes exactly
- Added RESOURCE_DEFS entries for both types with correct apiPath and listFn (networking.k8s.io/v1 and core/v1)
- Created GET /api/watches/health endpoint returning active cluster watch data and total resource type count
- Verified complete subscribe/unsubscribe/stopAll lifecycle chain for cluster-switch scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1: Add network-policies and resource-quotas to types, mappers, and RESOURCE_DEFS** - `bb66e87` (feat)
2. **Task 2: Add watch health API endpoint with auth bypass, verify lifecycle** - `d79aee1` (feat)

## Files Created/Modified
- `packages/types/src/sse.ts` - Added 'network-policies' and 'resource-quotas' to ResourceType union
- `apps/api/src/lib/resource-mappers.ts` - Added mapNetworkPolicy() and mapResourceQuota() mapper functions
- `apps/api/src/lib/watch-manager.ts` - Added 2 RESOURCE_DEFS entries (17 total)
- `apps/api/src/routes/watch-health.ts` - NEW: GET /api/watches/health endpoint
- `apps/api/src/server.ts` - Registered watch health route
- `packages/config/src/routes.ts` - Added /api/watches/health to AUTH_BYPASS_PATHS

## Decisions Made
- Used `rule._from` (not `rule.from`) for NetworkPolicy ingress rules -- K8s TS SDK reserves `from` as a keyword, uses `_from` instead. Copied exact pattern from existing `network-policies.ts` router.
- Watch health endpoint added to AUTH_BYPASS_PATHS -- this is a monitoring/health endpoint that must be accessible without authentication, consistent with existing `/health` endpoint pattern.
- Lifecycle chain verified correct as-is -- no fixes needed. WatchManager reference counting, SSE disconnect cleanup, and Zustand clearCluster all work correctly for cluster-switch scenarios.

## Lifecycle Verification (COVER-02)

The subscribe/unsubscribe/stopAll chain was traced and verified:

1. **subscribe(clusterId)**: First subscriber creates all 17 informers (subscriberCount=1). Subsequent subscribers increment count only.
2. **unsubscribe(clusterId)**: Decrements subscriberCount. When it reaches 0: stops all informers, clears heartbeat timers, deletes cluster from map, emits 'disconnected' status.
3. **SSE disconnect**: `resource-stream.ts` registers `request.raw.on('close')` handler that calls `watchManager.unsubscribe(clusterId)` -- triggers informer cleanup when client disconnects.
4. **Frontend cleanup**: `useResourceSSE.ts` effect cleanup calls `clearCluster(clusterId)` to wipe Zustand store data, preventing stale data flash when switching clusters.
5. **stopAll()**: Emergency stop -- iterates all clusters, stops all informers, clears all timers, emits disconnected for each.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

- Worktree had no node_modules -- required `pnpm install --frozen-lockfile` before typecheck could run. After install, workspace package builds (`@voyager/types`, `@voyager/db`, `@voyager/config`) were needed for type resolution. All resolved without code changes.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness
- Backend pipeline now watches 17 resource types (up from 15)
- Watch health endpoint available at GET /api/watches/health for monitoring
- Ready for Plan 03-02: frontend integration to wire network-policies and resource-quotas tabs to Zustand store
- All lifecycle mechanisms verified correct for cluster-switch scenarios (COVER-02)

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 03-expand-coverage*
*Completed: 2026-03-30*
