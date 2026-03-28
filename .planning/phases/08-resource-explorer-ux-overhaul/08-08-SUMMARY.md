---
phase: 08-resource-explorer-ux-overhaul
plan: 08
subsystem: ui
tags: [cross-resource-navigation, related-pods, hyperlinks, log-viewer, optimistic-update, pod-deletion]

# Dependency graph
requires:
  - phase: 08-03
    provides: Deployments, Services, Ingresses, StatefulSets pages with ResourcePageScaffold
  - phase: 08-04
    provides: DaemonSets, Jobs, CronJobs, HPA pages with ResourcePageScaffold
  - phase: 08-05
    provides: ConfigMaps, Secrets, PVCs, Namespaces, Events pages with ResourcePageScaffold
  - phase: 08-06
    provides: LogViewer component library
provides:
  - RelatedPodsList reusable component (client-side label matching)
  - RelatedResourceLink hyperlink component (cross-tab navigation)
  - useResourceNavigation hook (tab + highlight navigation)
  - Cross-resource tabs on all 9 resource pages
  - Pod Logs tab with embedded LogViewer
  - Pod optimistic deletion with cache invalidation
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Client-side label matching for related pods via trpc.pods.list query
    - Cross-resource navigation via URL query param (?highlight=namespace/name)
    - Optimistic cache removal on pod deletion using tRPC utils

key-files:
  created:
    - apps/web/src/components/resource/CrossResourceNav.tsx
    - apps/web/src/components/resource/RelatedResourceLink.tsx
    - apps/web/src/components/resource/RelatedPodsList.tsx
  modified:
    - apps/web/src/components/resource/index.ts
    - apps/web/src/app/clusters/[id]/deployments/page.tsx
    - apps/web/src/app/clusters/[id]/statefulsets/page.tsx
    - apps/web/src/app/clusters/[id]/daemonsets/page.tsx
    - apps/web/src/app/clusters/[id]/services/page.tsx
    - apps/web/src/app/clusters/[id]/ingresses/page.tsx
    - apps/web/src/app/clusters/[id]/jobs/page.tsx
    - apps/web/src/app/clusters/[id]/cronjobs/page.tsx
    - apps/web/src/app/clusters/[id]/hpa/page.tsx
    - apps/web/src/app/clusters/[id]/pods/page.tsx
    - apps/api/src/routers/statefulsets.ts
    - apps/api/src/routers/daemonsets.ts

key-decisions:
  - "Added selector field to StatefulSets and DaemonSets backend routers (was missing, needed for RelatedPodsList label matching)"
  - "Jobs use job-name label for pod matching (K8s standard label for job-owned pods)"
  - "CronJobs link to jobs tab via RelatedResourceLink rather than inline list (cronjob-created jobs have dynamic names)"
  - "HPA Target tab parses Kind/Name reference string client-side to determine target tab"
  - "Pod Logs tab fetches via trpc.logs.get with staleTime 15s to avoid excessive API calls"

patterns-established:
  - "Cross-resource navigation: useResourceNavigation hook + RelatedResourceLink component"
  - "Related pods: RelatedPodsList with clusterId + matchLabels props for client-side filtering"
  - "Optimistic deletion: onMutate cancels query, saves previous data, removes from cache; onError restores"

requirements-completed: [UX-04, UX-11, UX-12, UX-13, UX-14]

# Metrics
duration: 9min
completed: 2026-03-28
---

# Phase 08 Plan 08: Cross-Resource Navigation Summary

**Bidirectional cross-resource navigation across all 9 resource pages: RelatedPodsList for workload-to-pods linking, RelatedResourceLink for hyperlinks, embedded LogViewer in pod details, optimistic pod deletion**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-28T18:27:31Z
- **Completed:** 2026-03-28T18:36:31Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Created 3 reusable cross-resource navigation components: CrossResourceNav (hook), RelatedResourceLink (hyperlink), RelatedPodsList (label-matching pod list)
- Added cross-resource tabs to all 9 resource pages: Deployments/StatefulSets/DaemonSets/Jobs -> Pods, Services -> Endpoints, Ingresses -> Services, CronJobs -> Jobs, HPA -> Target
- Added Logs tab to Pod detail panel with embedded LogViewer component (from Plan 06)
- Added Node tab to Pod detail showing link to the node the pod is scheduled on
- Implemented optimistic pod deletion with immediate cache removal and rollback on error
- Extended StatefulSets and DaemonSets backend routers to return selector labels (needed for RelatedPodsList)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cross-resource navigation components** - `09cecd7` (feat)
2. **Task 2: Wire cross-resource tabs to all resource detail panels** - `0628338` (feat)

## Files Created/Modified
- `apps/web/src/components/resource/CrossResourceNav.tsx` - useResourceNavigation hook with navigateToResource and navigateToTab
- `apps/web/src/components/resource/RelatedResourceLink.tsx` - Clickable hyperlink button for cross-tab navigation
- `apps/web/src/components/resource/RelatedPodsList.tsx` - Reusable pod list with client-side label matching and status dots
- `apps/web/src/components/resource/index.ts` - Barrel export updated with 3 new exports
- `apps/web/src/app/clusters/[id]/deployments/page.tsx` - Added Pods tab with RelatedPodsList
- `apps/web/src/app/clusters/[id]/statefulsets/page.tsx` - Added Pods tab, selector field in interface
- `apps/web/src/app/clusters/[id]/daemonsets/page.tsx` - Added Pods tab, selector field in interface
- `apps/web/src/app/clusters/[id]/services/page.tsx` - Added Endpoints tab with RelatedPodsList
- `apps/web/src/app/clusters/[id]/ingresses/page.tsx` - Added Services tab with RelatedResourceLink for backend services
- `apps/web/src/app/clusters/[id]/jobs/page.tsx` - Added Pods tab (job-name label matching)
- `apps/web/src/app/clusters/[id]/cronjobs/page.tsx` - Restructured Jobs tab with RelatedResourceLink
- `apps/web/src/app/clusters/[id]/hpa/page.tsx` - Added Target tab with RelatedResourceLink to scale target
- `apps/web/src/app/clusters/[id]/pods/page.tsx` - Added Logs tab (LogViewer), Node tab, optimistic deletion
- `apps/api/src/routers/statefulsets.ts` - Added selector field to response
- `apps/api/src/routers/daemonsets.ts` - Added selector field to response

## Decisions Made
- Added selector field to StatefulSets and DaemonSets backend routers since it was missing but needed for RelatedPodsList label matching
- Jobs use the `job-name` K8s label for pod matching (standard label K8s assigns to job-created pods)
- CronJobs link to jobs tab via RelatedResourceLink rather than inline list (CronJob-created jobs have dynamic timestamped names)
- HPA Target tab parses the `Kind/Name` reference string client-side using a kindToTab mapping
- Pod Logs tab fetches via trpc.logs.get with 15s staleTime to prevent excessive API calls

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added selector field to StatefulSets and DaemonSets backend routers**
- **Found during:** Task 2
- **Issue:** The plan calls for RelatedPodsList with matchLabels={ss.selector} but the StatefulSets and DaemonSets backend routers did not return a selector field. Without it, the RelatedPodsList component cannot match pods to their owning workload.
- **Fix:** Added `const selector = (ss.spec?.selector?.matchLabels as Record<string, string>) ?? {}` to both routers and included selector in the response object. Updated frontend interfaces accordingly.
- **Files modified:** apps/api/src/routers/statefulsets.ts, apps/api/src/routers/daemonsets.ts, apps/web/src/app/clusters/[id]/statefulsets/page.tsx, apps/web/src/app/clusters/[id]/daemonsets/page.tsx
- **Verification:** pnpm build passes

## Known Stubs

None - all components are fully wired with real tRPC data sources.

## Issues Encountered

- Pre-existing typecheck errors throughout the project (missing @voyager/db, @voyager/types module declarations) unrelated to this plan's changes. All modified files compile clean.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 08 (K8s Resource Explorer UX Overhaul) is now complete with all 8 plans executed
- All resource pages have consistent UX: namespace-grouped cards, search/filter, expand-all, cross-resource navigation
- 19 resource types with expandable detail panels, 10 new tRPC routers, 3 cross-resource navigation components

## Self-Check: PASSED

All 3 created files verified. All 11 modified files verified. Both task commits (09cecd7, 0628338) confirmed in git log. SUMMARY.md created.

---
*Phase: 08-resource-explorer-ux-overhaul*
*Completed: 2026-03-28*
