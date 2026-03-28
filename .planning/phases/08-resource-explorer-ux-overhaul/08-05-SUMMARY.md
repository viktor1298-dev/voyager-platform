---
phase: 08-resource-explorer-ux-overhaul
plan: 05
subsystem: ui
tags: [react, resource-page-scaffold, namespace-grouping, expandable-card, search-filter, flat-list]

# Dependency graph
requires:
  - phase: 08-01
    provides: ResourcePageScaffold, SearchFilterBar, NamespaceGroup, controlled ExpandableCard
provides:
  - ConfigMaps page with namespace-grouped card layout
  - Secrets page with namespace-grouped card layout and masked values
  - PVCs page with namespace-grouped card layout and status/volume/config tabs
  - Namespaces page with flat card layout (flatList=true)
  - Events page with namespace-grouped card layout preserving dual data source
  - Pods page with Expand All / Collapse All toggle via SearchFilterBar
affects: [08-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ResourcePageScaffold flatList usage for Namespaces page (no namespace grouping)
    - Dual data source (live/DB) with ResourcePageScaffold for Events page
    - SearchFilterBar as drop-in replacement for inline search inputs

key-files:
  created: []
  modified:
    - apps/web/src/app/clusters/[id]/configmaps/page.tsx
    - apps/web/src/app/clusters/[id]/secrets/page.tsx
    - apps/web/src/app/clusters/[id]/pvcs/page.tsx
    - apps/web/src/app/clusters/[id]/namespaces/page.tsx
    - apps/web/src/app/clusters/[id]/events/page.tsx
    - apps/web/src/app/clusters/[id]/pods/page.tsx

key-decisions:
  - "Events page preserves live/DB dual data source pattern while wrapping output in ResourcePageScaffold"
  - "ConfigMap values hidden in expanded detail (key names + char count only) for security"
  - "Secret values always masked as *** in expanded detail"

patterns-established:
  - "ResourcePageScaffold with flatList={true} for resources that ARE the namespace (like Namespaces page)"
  - "Wrapping computed data arrays in ResourcePageScaffold queryResult for complex data sourcing"

requirements-completed: [UX-01, UX-02, UX-03]

# Metrics
duration: 5min
completed: 2026-03-28
---

# Phase 08 Plan 05: Remaining Resource Tab Redesigns Summary

**ConfigMaps, Secrets, PVCs, Namespaces, Events redesigned to ResourcePageScaffold card layout; Pods enhanced with Expand All toggle**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-28T18:18:33Z
- **Completed:** 2026-03-28T18:24:10Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Redesigned ConfigMaps, Secrets, PVCs pages from ExpandableTableRow tables to ResourcePageScaffold namespace-grouped card layouts with search/filter and expand-all
- Redesigned Namespaces page to flat card layout (flatList=true) with status, labels, annotations, and resource quota tabs
- Redesigned Events page to namespace-grouped cards while preserving the complex live/DB dual data source pattern
- Enhanced Pods page with SearchFilterBar and Expand All / Collapse All toggle passed to all ExpandableCards

## Task Commits

Each task was committed atomically:

1. **Task 1: Redesign ConfigMaps, Secrets, PVCs pages** - `9aff9ce` (feat)
2. **Task 2: Redesign Namespaces, Events, and add Expand All to Pods** - `ac1e320` (feat)

## Files Created/Modified
- `apps/web/src/app/clusters/[id]/configmaps/page.tsx` - ResourcePageScaffold with data key names (values hidden), labels tab
- `apps/web/src/app/clusters/[id]/secrets/page.tsx` - ResourcePageScaffold with type badge, masked values, labels/annotations tabs
- `apps/web/src/app/clusters/[id]/pvcs/page.tsx` - ResourcePageScaffold with phase badge, volume/status/config tabs
- `apps/web/src/app/clusters/[id]/namespaces/page.tsx` - ResourcePageScaffold with flatList, status/labels/annotations/quota tabs
- `apps/web/src/app/clusters/[id]/events/page.tsx` - ResourcePageScaffold grouped by namespace, dual data source preserved
- `apps/web/src/app/clusters/[id]/pods/page.tsx` - SearchFilterBar with expandAll state, passed to ExpandableCards

## Decisions Made
- Events page preserves the live/DB dual data source pattern (live K8s data when available, DB fallback otherwise) rather than simplifying to a single tRPC query, ensuring real-time event streaming continues to work
- ConfigMap expanded detail shows key names and character counts only (no values displayed) for security
- Secret expanded detail always shows "***" for values, never reveals actual secret data

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all components are fully functional.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 5 remaining resource tab pages redesigned plus Pods enhanced
- Every resource page now uses ResourcePageScaffold for consistent UX (search, filter, expand-all, namespace grouping)
- Ready for Wave 2 completion plans (if any) or final polish/QA

## Self-Check: PASSED

All 6 modified files verified present. Both task commits (9aff9ce, ac1e320) verified in git log.

---
*Phase: 08-resource-explorer-ux-overhaul*
*Completed: 2026-03-28*
