---
phase: 10-lens-style-live-data-k8s-watch-stream-architecture
plan: 05
subsystem: api, ui
tags: [k8s-watch, sse, refetchInterval, live-data, watchmanager, server-startup]

requires:
  - phase: 10-01
    provides: WatchManager singleton with 15 resource type informers
  - phase: 10-02
    provides: Shared resource mappers for all 15 types
  - phase: 10-03
    provides: watch-db-writer replacing health-sync, node-sync, event-sync
  - phase: 10-04
    provides: Watch-first routers and useResourceSSE hook
provides:
  - WatchManager + watch-db-writer wired into server.ts startup/shutdown
  - Zero refetchInterval for all watched K8s resources across entire frontend
  - 3 legacy sync jobs removed (health-sync, node-sync, event-sync)
  - Old watch managers (ClusterWatchManager, ResourceWatchManager) removed from server.ts
affects: [deployment, e2e-tests, qa-validation]

tech-stack:
  added: []
  patterns:
    - "Watch-driven UI: SSE events trigger TanStack Query refetch instead of polling"
    - "DB-only polling: refetchInterval kept only for DB queries, metrics API, presence"

key-files:
  created: []
  modified:
    - apps/api/src/server.ts
    - apps/api/src/config/jobs.ts
    - apps/api/src/lib/k8s-watchers.ts
    - apps/api/src/lib/cache-keys.ts
    - apps/web/src/app/clusters/[id]/**/*.tsx (19 pages)
    - apps/web/src/components/**/*.tsx (17 components)
    - apps/web/src/app/**/*.tsx (6 global pages)

key-decisions:
  - "Cache keys preserved: all cache key builders kept in cache-keys.ts because routers still use them as fallback paths when WatchManager is not watching a cluster"
  - "health.status refetchInterval removed: watch-db-writer keeps clusters table fresh, SSE-driven refetch handles updates"
  - "24 refetchInterval entries kept (DB queries, Metrics API, alerts, anomalies, presence, log tail)"

patterns-established:
  - "Zero-polling for K8s resources: all 15 watched resource types rely on SSE push + TanStack Query refetch"
  - "DB query polling preserved: clusters.list, users, teams, alerts, anomalies keep refetchInterval since they are not K8s watch targets"

requirements-completed: [D-08, D-09]

duration: 14min
completed: 2026-03-29
---

# Phase 10 Plan 05: Big Bang Switch Summary

**Activated Lens-style live data pipeline: removed all refetchInterval polling for 15 watched K8s resource types across 42 files, deleted 3 legacy sync jobs, wired WatchManager + watch-db-writer into server startup**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-29T17:35:07Z
- **Completed:** 2026-03-29T17:49:51Z
- **Tasks:** 3
- **Files modified:** 42

## Accomplishments

- WatchManager and watch-db-writer integrated into server.ts startup sequence with graceful shutdown
- Removed refetchInterval from 19 cluster-specific pages (pods, deployments, services, nodes, events, namespaces, ingresses, statefulsets, daemonsets, jobs, cronjobs, hpa, configmaps, secrets, pvcs, network-policies, helm, autoscaling, cluster overview)
- Removed refetchInterval from 17 shared components and 6 global pages (dashboard, clusters list, health, events, deployments, namespaces, services)
- Deleted 3 legacy sync job files (health-sync.ts, node-sync.ts, event-sync.ts) and their config constants
- 24 refetchInterval entries remain for non-K8s queries (DB, metrics API, presence, alerts, anomalies, log streaming)

## Task Commits

Each task was committed atomically:

1. **Task 1: Server.ts integration** - `26450a6` (feat)
   - WatchManager + watch-db-writer in startup, 3 jobs deleted, config cleaned
2. **Task 2: Cluster page refetchInterval removal** - `0c62a84` (feat)
   - 19 cluster-specific pages stripped of polling
3. **Task 3: Shared component + global page refetchInterval removal** - `055a499` (feat)
   - 17 components + 6 global pages stripped of polling, unused imports cleaned

## Files Created/Modified

### Backend (API)
- `apps/api/src/server.ts` - WatchManager + watch-db-writer startup, removed 3 job imports and startup calls, removed resourceWatchManager
- `apps/api/src/config/jobs.ts` - Removed HEALTH_SYNC_MS, NODE_SYNC_MS, EVENT_SYNC_MS constants
- `apps/api/src/lib/k8s-watchers.ts` - Removed clusterWatchManager dependency, stopAllWatchers() now no-op
- `apps/api/src/jobs/health-sync.ts` - DELETED
- `apps/api/src/jobs/node-sync.ts` - DELETED
- `apps/api/src/jobs/event-sync.ts` - DELETED

### Frontend (Web) - Cluster Pages (19 files)
- `apps/web/src/app/clusters/[id]/pods/page.tsx` - Removed 2 refetchInterval entries
- `apps/web/src/app/clusters/[id]/deployments/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/services/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/nodes/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/events/page.tsx` - Removed 2 refetchInterval entries + unused REFETCH_INTERVAL constant
- `apps/web/src/app/clusters/[id]/namespaces/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/ingresses/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/statefulsets/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/daemonsets/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/jobs/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/cronjobs/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/hpa/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/configmaps/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/secrets/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/pvcs/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/network-policies/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/helm/page.tsx` - Removed refetchInterval
- `apps/web/src/app/clusters/[id]/autoscaling/page.tsx` - Removed 2 refetchInterval entries
- `apps/web/src/app/clusters/[id]/page.tsx` - Removed refetchInterval from clusters.live

### Frontend (Web) - Global Pages (6 files)
- `apps/web/src/app/page.tsx` - Removed clusters.live refetchInterval, cleaned LIVE_CLUSTER_REFETCH_MS import
- `apps/web/src/app/clusters/page.tsx` - Removed health.status refetchInterval
- `apps/web/src/app/health/page.tsx` - Removed health.status + events.list refetchInterval
- `apps/web/src/app/events/page.tsx` - Removed liveEvents refetchInterval
- `apps/web/src/app/deployments/page.tsx` - Removed deployments.list refetchInterval
- `apps/web/src/app/namespaces/page.tsx` - Removed namespaces.list refetchInterval
- `apps/web/src/app/services/page.tsx` - Removed services.list refetchInterval

### Frontend (Web) - Shared Components (11 files)
- `apps/web/src/components/TopBar.tsx` - Removed clusters.live refetchInterval
- `apps/web/src/components/ClusterHealthIndicator.tsx` - Removed health.status refetchInterval + unused import
- `apps/web/src/components/NotificationsPanel.tsx` - Removed events.list refetchInterval
- `apps/web/src/components/topology/TopologyMap.tsx` - Removed topology.graph refetchInterval
- `apps/web/src/components/crds/CrdBrowser.tsx` - Removed crds.list refetchInterval
- `apps/web/src/components/network/NetworkPolicyGraph.tsx` - Removed networkPolicies.list refetchInterval
- `apps/web/src/components/dashboard/widgets/ClusterHealthWidget.tsx` - Removed clusters.live refetchInterval
- `apps/web/src/components/dashboard/widgets/StatCardsWidget.tsx` - Removed clusters.live refetchInterval
- `apps/web/src/components/dashboard/widgets/PodStatusWidget.tsx` - Removed clusters.live refetchInterval + unused imports
- `apps/web/src/components/dashboard/widgets/DeploymentListWidget.tsx` - Removed deployments.list refetchInterval + unused imports

## Decisions Made

1. **Cache keys preserved (deviation from plan):** The plan specified removing 9 cache key builders from cache-keys.ts. However, all 9 are still actively referenced by routers as fallback paths (when WatchManager is not watching a cluster). Removing them would cause build failures. Kept all cache keys.

2. **24 remaining refetchInterval entries (vs plan's ~19):** The count is higher because dashboard widgets use both `clusters.list` (DB) and `metrics.currentStats` (Metrics API) refetchInterval entries that were not in the plan's removal list. All 24 are correctly categorized as non-K8s queries.

3. **stopAllWatchers() made into no-op:** Rather than removing the function (which would break the subscriptions.ts import), made it a no-op with deprecation comment. WatchManager.stopAll() handles cleanup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Kept all cache keys in cache-keys.ts**
- **Found during:** Task 1 (cache key cleanup)
- **Issue:** Plan instructed removing 9 cache key builders, but grep showed all are still referenced by router fallback paths (pods.ts, nodes.ts, deployments.ts, services.ts, namespaces.ts, clusters.ts, topology.ts)
- **Fix:** Kept all cache keys to maintain build stability. Cache keys serve as fallback when WatchManager is not watching.
- **Files modified:** None (kept as-is)
- **Verification:** `pnpm build && pnpm typecheck` passes
- **Committed in:** 26450a6

**2. [Rule 1 - Bug] Cleaned up unused imports after refetchInterval removal**
- **Found during:** Tasks 2-3
- **Issue:** Removing refetchInterval left unused constant imports (LIVE_CLUSTER_REFETCH_MS, HEALTH_STATUS_REFETCH_MS, useDashboardRefreshInterval, intervalMs)
- **Fix:** Removed unused imports and variables to prevent lint/typecheck warnings
- **Files modified:** page.tsx, ClusterHealthIndicator.tsx, ClusterHealthWidget.tsx, StatCardsWidget.tsx, PodStatusWidget.tsx, DeploymentListWidget.tsx
- **Verification:** `pnpm build && pnpm typecheck` passes with zero warnings
- **Committed in:** 055a499

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Cache key deviation preserves backward compatibility for non-watched clusters. Import cleanup prevents dead code. No scope creep.

## Issues Encountered

- **Pre-existing test failure:** `health-check.integration.test.ts` (3 tests) fails due to missing database connection (requires running PostgreSQL with sso_providers table). Verified this failure exists before and after Plan 10-05 changes -- not caused by this plan.

## Known Stubs

None -- all changes are removals/deletions, no new code with stubs.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 10 (Lens-Style Live Data) is now complete:
- Plans 01-04 built the infrastructure (WatchManager, resource mappers, watch-db-writer, watch-first routers, SSE hook)
- Plan 05 (this plan) activated it by removing all polling and wiring into server startup
- The app now runs on Lens-style live data: K8s Watch API informers detect changes, SSE pushes events to browser, useResourceSSE triggers TanStack Query refetch, fresh data rendered immediately

**Full QA sweep required** before declaring phase complete (Wave 3 QA gate).

---
*Phase: 10-lens-style-live-data-k8s-watch-stream-architecture*
*Completed: 2026-03-29*

## Self-Check: PASSED

All files exist, all commits verified, all deleted files confirmed absent, SUMMARY.md created.
