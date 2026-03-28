---
phase: 08-resource-explorer-ux-overhaul
plan: 04
subsystem: ui
tags: [react, resource-page-scaffold, namespace-grouping, daemonsets, jobs, cronjobs, hpa]

# Dependency graph
requires:
  - phase: 08-01
    provides: ResourcePageScaffold, SearchFilterBar, NamespaceGroup, controlled ExpandableCard
provides:
  - DaemonSets page with namespace-grouped card layout
  - Jobs page with namespace-grouped card layout
  - CronJobs page with namespace-grouped card layout
  - HPA page with namespace-grouped card layout
affects: [08-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ResourcePageScaffold consumption pattern for workload resources
    - Summary component with inline status badges and metric pills

key-files:
  created: []
  modified:
    - apps/web/src/app/clusters/[id]/daemonsets/page.tsx
    - apps/web/src/app/clusters/[id]/jobs/page.tsx
    - apps/web/src/app/clusters/[id]/cronjobs/page.tsx
    - apps/web/src/app/clusters/[id]/hpa/page.tsx

key-decisions:
  - "Kept all existing interface types and detail panel content from original pages"
  - "Summary components show key info inline (status badges, counts, ages) without expanding"

patterns-established:
  - "Summary row pattern: name (bold mono) + status badges + metrics + age (right-aligned)"
  - "filterFn searches name, namespace, and resource-specific field (status, schedule, reference)"

requirements-completed: [UX-01, UX-02, UX-03]

# Metrics
duration: 3min
completed: 2026-03-28
---

# Phase 08 Plan 04: Workload & Autoscaling Tab Redesign Summary

**DaemonSets, Jobs, CronJobs, and HPA pages converted from table layout to Pods-style namespace-grouped cards with search/filter/expand-all via ResourcePageScaffold**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T18:18:31Z
- **Completed:** 2026-03-28T18:22:17Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced ExpandableTableRow table layout with namespace-grouped ExpandableCard layout on all 4 pages
- Added resource-specific Summary components showing inline status badges, metric counts, and ages
- All 4 pages now have search, filter, and expand-all functionality via ResourcePageScaffold
- pnpm typecheck and pnpm build both pass clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Redesign DaemonSets and Jobs pages** - `81c11e2` (feat)
2. **Task 2: Redesign CronJobs and HPA pages** - `b4ab8cd` (feat)

## Files Created/Modified
- `apps/web/src/app/clusters/[id]/daemonsets/page.tsx` - Replaced table with ResourcePageScaffold; DaemonSetSummary shows ready/desired badges and Ready/Updating status pill
- `apps/web/src/app/clusters/[id]/jobs/page.tsx` - Replaced table with ResourcePageScaffold; JobSummary shows completions badge, status pill (Complete/Running/Failed), duration
- `apps/web/src/app/clusters/[id]/cronjobs/page.tsx` - Replaced table with ResourcePageScaffold; CronJobSummary shows cron schedule, suspend badge, active count
- `apps/web/src/app/clusters/[id]/hpa/page.tsx` - Replaced table with ResourcePageScaffold; HPASummary shows target reference, min/max replicas, metric current/target values

## Decisions Made
- Preserved all existing interface types and DetailTabs expanded detail content from original pages (no loss of information)
- Summary components show most important info inline to minimize need to expand cards
- Search filters search by name + namespace + resource-specific field (status for jobs, schedule for cronjobs, reference for HPA)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all components are fully functional with real tRPC data sources.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 4 workload/autoscaling tab pages are converted to the new card layout
- Ready for Plan 08-08 (final verification) or further wave redesigns
- Pattern is consistent across all converted pages

---
*Phase: 08-resource-explorer-ux-overhaul*
*Completed: 2026-03-28*
