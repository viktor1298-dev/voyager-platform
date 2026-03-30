---
phase: 03-expand-coverage
plan: 02
subsystem: ui
tags: [zustand, sse, react, helm, network-policies, resource-quotas, topology]

# Dependency graph
requires:
  - phase: 03-expand-coverage plan 01
    provides: Backend informers for network-policies and resource-quotas, mappers, ResourceType union with 17 members
provides:
  - Network-policies and resource-quotas pages reading from Zustand store (SSE-fed)
  - useHelmReleases hook deriving Helm releases from watched secrets
  - Helm list view using live data instead of tRPC polling
  - Overview and Events pages using Zustand-only data for watched types (no DB fallback)
  - Topology graph auto-refreshing every 5 seconds
affects: [04-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: [zustand-derived-hook for Helm releases from watched secrets, synthetic queryResult for ResourcePageScaffold]

key-files:
  created:
    - apps/web/src/hooks/useHelmReleases.ts
  modified:
    - apps/web/src/app/clusters/[id]/network-policies/page.tsx
    - apps/web/src/app/clusters/[id]/resource-quotas/page.tsx
    - apps/web/src/app/clusters/[id]/helm/page.tsx
    - apps/web/src/app/clusters/[id]/page.tsx
    - apps/web/src/app/clusters/[id]/events/page.tsx
    - apps/web/src/components/topology/TopologyMap.tsx

key-decisions:
  - "Kept ResourcePageScaffold for Helm page with synthetic queryResult object instead of rewriting to direct rendering -- less code churn, same UI behavior"
  - "Helm list view shows name/status/revision from secret labels; chartName/chartVersion empty (requires server-side decode); full chart info in detail view via tRPC"
  - "Overview page non-live branch still uses liveNodes/livePods/liveNamespaces counts (no DB fallback at all)"

patterns-established:
  - "Zustand-derived hooks: useHelmReleases filters watched secrets by type to derive domain data without dedicated informers"
  - "Synthetic queryResult: Pass { data, isLoading, error } objects to ResourcePageScaffold when switching from tRPC to Zustand"

requirements-completed: [COVER-01, COVER-03]

# Metrics
duration: 5min
completed: 2026-03-30
---

# Phase 03 Plan 02: Frontend Live Data Wiring Summary

**Switched network-policies, resource-quotas, and Helm tabs from tRPC polling to Zustand store, removed DB fallback paths from Overview and Events pages, and added topology auto-refresh**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-30T18:29:48Z
- **Completed:** 2026-03-30T18:35:00Z
- **Tasks:** 2
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments
- Network-policies and resource-quotas pages now read live data from Zustand store via useClusterResources instead of tRPC polling
- Created useHelmReleases hook that derives Helm release list from watched secrets (helm.sh/release.v1), grouping by release name and keeping latest revision
- Removed tRPC DB fallback queries for nodes and events from Overview page, and events from Events page -- all watched types now Zustand-only
- Topology graph auto-refreshes every 5 seconds via refetchInterval on the tRPC query (reads from live WatchManager data server-side)

## Task Commits

Each task was committed atomically:

1. **Task 1: Switch network-policies/resource-quotas to Zustand, remove DB fallbacks, add topology auto-refresh** - `1a7af5f` (feat)
2. **Task 2: Add useHelmReleases hook and switch Helm tab to live data** - `423b42f` (feat)

## Files Created/Modified
- `apps/web/src/hooks/useHelmReleases.ts` - New hook deriving Helm releases from watched secrets
- `apps/web/src/app/clusters/[id]/network-policies/page.tsx` - Switched from trpc.networkPolicies to useClusterResources
- `apps/web/src/app/clusters/[id]/resource-quotas/page.tsx` - Switched from trpc.resourceQuotas to useClusterResources
- `apps/web/src/app/clusters/[id]/helm/page.tsx` - Switched from trpc.helm.list to useHelmReleases
- `apps/web/src/app/clusters/[id]/page.tsx` - Removed dbNodes and dbEvents tRPC fallback queries
- `apps/web/src/app/clusters/[id]/events/page.tsx` - Removed dbEvents tRPC fallback query
- `apps/web/src/components/topology/TopologyMap.tsx` - Added refetchInterval: 5000 for auto-refresh

## Decisions Made
- Kept ResourcePageScaffold for Helm page by passing synthetic queryResult object ({ data: releases, isLoading, error }) instead of rewriting to direct rendering -- reduces code churn
- Helm list shows name/status/revision from secret labels; chart details empty in list (require server-side base64+gzip decode); full info in detail view via tRPC helm.get
- Overview page non-live branch uses live counts from Zustand instead of DB queries -- SSE pipeline is reliable after Phase 2 hardening

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused asText function from Events page**
- **Found during:** Task 1
- **Issue:** After removing the dbEvents fallback branch, the asText helper was no longer referenced
- **Fix:** Removed the dead function to keep the file clean
- **Files modified:** apps/web/src/app/clusters/[id]/events/page.tsx
- **Committed in:** 1a7af5f

---

**Total deviations:** 1 auto-fixed (1 bug/cleanup)
**Impact on plan:** Trivial cleanup. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all data sources are wired to live Zustand store. Helm list view intentionally shows empty chartName/chartVersion (labels don't contain chart info); full chart details load in the detail expansion via tRPC helm.get.

## Next Phase Readiness
- Phase 03 complete: both plans (backend informers + frontend wiring) delivered
- COVER-01 satisfied: all watched types use Zustand-only data in browser, no polling
- COVER-03 satisfied: topology auto-refreshes from live WatchManager data
- Ready for Phase 04 (Cleanup) which is independent

---
*Phase: 03-expand-coverage*
*Completed: 2026-03-30*
