---
phase: 08-resource-explorer-ux-overhaul
plan: 01
subsystem: ui
tags: [react, expandable-card, scaffold, namespace-grouping, search-filter, controlled-component]

# Dependency graph
requires: []
provides:
  - Controlled/uncontrolled ExpandableCard component
  - ResourcePageScaffold generic wrapper for all resource tab pages
  - SearchFilterBar with search input, result count, expand-all toggle
  - NamespaceGroup collapsible section with count badge
affects: [08-02, 08-03, 08-04, 08-05, 08-06, 08-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Controlled/uncontrolled component pattern for ExpandableCard
    - ResourcePageScaffold generic scaffold for namespace-grouped resource pages
    - SearchFilterBar + ExpandAll as composable filter controls

key-files:
  created:
    - apps/web/src/components/resource/ResourcePageScaffold.tsx
    - apps/web/src/components/resource/SearchFilterBar.tsx
    - apps/web/src/components/resource/NamespaceGroup.tsx
    - apps/web/src/components/resource/index.ts
  modified:
    - apps/web/src/components/expandable/ExpandableCard.tsx

key-decisions:
  - "ExpandableCard uses isControlled flag pattern (expanded !== undefined) for controlled/uncontrolled branching"
  - "ResourcePageScaffold receives queryResult as prop, not tRPC hook — keeps scaffold data-source agnostic"
  - "flatList prop on scaffold skips namespace grouping for resources like Namespaces page"

patterns-established:
  - "Controlled/uncontrolled ExpandableCard: expanded? + onExpandedChange? props, internal state fallback"
  - "ResourcePageScaffold<T>: generic scaffold accepting getNamespace, filterFn, renderSummary, renderDetail"
  - "Resource component barrel export from components/resource/index.ts"

requirements-completed: [UX-03, UX-17]

# Metrics
duration: 4min
completed: 2026-03-28
---

# Phase 08 Plan 01: Foundation Components Summary

**Controlled-mode ExpandableCard + ResourcePageScaffold with namespace grouping, search/filter, and expand-all for all resource tab pages**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-28T18:09:02Z
- **Completed:** 2026-03-28T18:13:10Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- ExpandableCard now supports both controlled (parent-driven expanded state) and uncontrolled (internal state) modes with full backward compatibility
- Created ResourcePageScaffold generic component that handles namespace grouping, search/filter, expand-all, loading skeletons, and empty states for any resource type
- Created SearchFilterBar with search input, result count badge, and Expand All / Collapse All toggle
- Created NamespaceGroup with Collapsible-based sections, animated chevron, count badge, and accent border

## Task Commits

Each task was committed atomically:

1. **Task 1: Add controlled mode to ExpandableCard** - `14bde64` (feat)
2. **Task 2: Create ResourcePageScaffold, SearchFilterBar, NamespaceGroup** - `3416695` (feat)

## Files Created/Modified
- `apps/web/src/components/expandable/ExpandableCard.tsx` - Added expanded?, onExpandedChange? props with controlled/uncontrolled branching
- `apps/web/src/components/resource/ResourcePageScaffold.tsx` - Generic scaffold with namespace grouping, search, expand-all, loading/empty states
- `apps/web/src/components/resource/SearchFilterBar.tsx` - Search input + result count + expand-all toggle button
- `apps/web/src/components/resource/NamespaceGroup.tsx` - Collapsible namespace section with animated chevron and count badge
- `apps/web/src/components/resource/index.ts` - Barrel export for all resource components

## Decisions Made
- ExpandableCard uses `expanded !== undefined` check for controlled mode detection (standard React pattern)
- ResourcePageScaffold receives queryResult as a prop rather than calling tRPC hooks internally, keeping it data-source agnostic
- flatList prop allows skipping namespace grouping for pages like Namespaces that don't need it

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all components are fully functional and ready for consumption.

## Issues Encountered

- Pre-existing typecheck errors in `@voyager/api` package (missing `ResourceChangeEvent` export from `@voyager/types`) from a parallel agent's in-progress work. Not caused by this plan's changes. Web package typecheck and build both pass cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 4 foundation components are ready for consumption by Wave 2 tab redesign plans (Plans 02-06)
- ResourcePageScaffold can be used immediately by any resource page via `<ResourcePageScaffold<T> ...>`
- Existing pods page and karpenter page continue working unchanged (backward compatible)

---
*Phase: 08-resource-explorer-ux-overhaul*
*Completed: 2026-03-28*
