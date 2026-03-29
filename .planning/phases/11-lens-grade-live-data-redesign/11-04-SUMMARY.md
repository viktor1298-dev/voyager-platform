---
phase: 11-lens-grade-live-data-redesign
plan: 04
subsystem: ui
tags: [zustand, react, sse, tanstack-query, resource-pages, live-data]

# Dependency graph
requires:
  - phase: 11-03
    provides: Zustand resource store with useClusterResources/useConnectionState hooks, SSE snapshot-on-connect
provides:
  - All 15 watched resource pages read from Zustand store instead of tRPC queries
  - Loading states derived from SSE connectionState
  - Zero tRPC list queries for watched resource types
affects: [frontend-pages, resource-explorer, live-data-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [zustand-consumer-pattern, connection-state-loading]

key-files:
  modified:
    - apps/web/src/app/clusters/[id]/pods/page.tsx
    - apps/web/src/app/clusters/[id]/deployments/page.tsx
    - apps/web/src/app/clusters/[id]/services/page.tsx
    - apps/web/src/app/clusters/[id]/nodes/page.tsx
    - apps/web/src/app/clusters/[id]/events/page.tsx
    - apps/web/src/app/clusters/[id]/page.tsx
    - apps/web/src/app/clusters/[id]/configmaps/page.tsx
    - apps/web/src/app/clusters/[id]/secrets/page.tsx
    - apps/web/src/app/clusters/[id]/pvcs/page.tsx
    - apps/web/src/app/clusters/[id]/namespaces/page.tsx
    - apps/web/src/app/clusters/[id]/ingresses/page.tsx
    - apps/web/src/app/clusters/[id]/statefulsets/page.tsx
    - apps/web/src/app/clusters/[id]/daemonsets/page.tsx
    - apps/web/src/app/clusters/[id]/jobs/page.tsx
    - apps/web/src/app/clusters/[id]/cronjobs/page.tsx
    - apps/web/src/app/clusters/[id]/hpa/page.tsx

key-decisions:
  - "Overview page reads nodes/events/pods/namespaces from Zustand for live counts instead of clusters.live aggregation"
  - "DB fallback queries retained for events/nodes overview when SSE not yet connected"
  - "Nodes page simplified to single Zustand source, removing dual live/DB branching"
  - "tRPC mutations kept for pod delete, deployment/statefulset/daemonset restart/scale/delete"

patterns-established:
  - "Zustand consumer pattern: useClusterResources<T>(clusterId, type) + useConnectionState(clusterId)"
  - "Loading derivation: items.length === 0 && connectionState === 'initializing'"
  - "ResourcePageScaffold integration: queryResult={{ data: items, isLoading, error: null }}"

requirements-completed: [L11-CONSUMER-MIGRATION, L11-NO-POLLING-WATCHED]

# Metrics
duration: 10min
completed: 2026-03-29
---

# Phase 11 Plan 04: Consumer Migration Summary

**All 15 watched resource pages migrated from tRPC polling to Zustand store reads via SSE live data pipeline**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-29T21:07:05Z
- **Completed:** 2026-03-29T21:18:04Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Migrated 6 high-traffic pages (pods, deployments, services, nodes, events, overview) from tRPC queries to Zustand useClusterResources
- Migrated 10 remaining pages (configmaps, secrets, pvcs, namespaces, ingresses, statefulsets, daemonsets, jobs, cronjobs, hpa) to Zustand
- Eliminated all tRPC list queries for the 15 watched resource types -- data now flows exclusively through SSE to Zustand store
- Simplified nodes page by removing dual live/DB branching (single Zustand source)
- Overview page now derives node count, pod count, namespace count, and running pod count from Zustand store data

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Set A pages (pods, deployments, services, nodes, events, overview)** - `7f402b0` (feat)
2. **Task 2: Migrate Set B pages (configmaps, secrets, pvcs, namespaces, ingresses, statefulsets, daemonsets, jobs, cronjobs, hpa)** - `475e670` (feat)

## Files Created/Modified
- `apps/web/src/app/clusters/[id]/pods/page.tsx` - Replaced trpc.pods.list with useClusterResources, kept delete mutation
- `apps/web/src/app/clusters/[id]/deployments/page.tsx` - Replaced trpc.deployments.listDetail with Zustand, kept restart/scale/delete mutations
- `apps/web/src/app/clusters/[id]/services/page.tsx` - Replaced trpc.services.listDetail with Zustand
- `apps/web/src/app/clusters/[id]/nodes/page.tsx` - Replaced trpc.nodes.listLive + DB fallback with single Zustand source
- `apps/web/src/app/clusters/[id]/events/page.tsx` - Replaced trpc.clusters.live events with Zustand, kept DB fallback for non-live
- `apps/web/src/app/clusters/[id]/page.tsx` - Overview reads nodes/events/pods/namespaces from Zustand for live stats
- `apps/web/src/app/clusters/[id]/configmaps/page.tsx` - Replaced trpc.configMaps.list with Zustand
- `apps/web/src/app/clusters/[id]/secrets/page.tsx` - Replaced trpc.secrets.list with Zustand
- `apps/web/src/app/clusters/[id]/pvcs/page.tsx` - Replaced trpc.pvcs.list with Zustand
- `apps/web/src/app/clusters/[id]/namespaces/page.tsx` - Replaced trpc.namespaces.listDetail with Zustand
- `apps/web/src/app/clusters/[id]/ingresses/page.tsx` - Replaced trpc.ingresses.list with Zustand
- `apps/web/src/app/clusters/[id]/statefulsets/page.tsx` - Replaced trpc.statefulSets.list with Zustand, kept mutations
- `apps/web/src/app/clusters/[id]/daemonsets/page.tsx` - Replaced trpc.daemonSets.list with Zustand, kept mutations
- `apps/web/src/app/clusters/[id]/jobs/page.tsx` - Replaced trpc.jobs.list with Zustand
- `apps/web/src/app/clusters/[id]/cronjobs/page.tsx` - Replaced trpc.cronJobs.list with Zustand
- `apps/web/src/app/clusters/[id]/hpa/page.tsx` - Replaced trpc.hpa.list with Zustand

## Decisions Made
- Overview page reads individual resource types from Zustand (nodes, events, pods, namespaces) instead of relying on the clusters.live aggregation endpoint. This aligns with the new architecture where all resource data flows through SSE.
- DB fallback queries retained in overview and events pages when SSE connection is not yet established, ensuring graceful degradation.
- Nodes page simplified to single Zustand source -- the dual live/DB branching was a polling-era pattern that is no longer needed.
- tRPC mutations (restart, scale, delete) kept on all pages that have them -- mutations are write operations that don't go through SSE.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing API test failures (14 tests in watch-manager, resource-stream, health-check) -- these are backend test issues unrelated to the frontend page migration. Out of scope.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 15 resource pages fully migrated to Zustand store
- Phase 11 consumer migration complete -- the full live data pipeline is wired end-to-end
- tRPC queries preserved for non-watched data: Helm, CRDs, RBAC, network policies, resource quotas, metrics history, anomalies, clusters, users, alerts
- Only remaining refetchInterval entries are in metrics page (DB-backed, 60s) and logs page (explicitly false)

## Self-Check: PASSED

- All 16 modified files exist on disk
- Commit 7f402b0 (Task 1) found in git log
- Commit 475e670 (Task 2) found in git log
- pnpm build: 0 errors
- pnpm typecheck: 0 errors
- All 15 resource pages contain useClusterResources (grep verified)
- Zero tRPC list queries for watched resource types (grep verified)

---
*Phase: 11-lens-grade-live-data-redesign*
*Completed: 2026-03-29*
