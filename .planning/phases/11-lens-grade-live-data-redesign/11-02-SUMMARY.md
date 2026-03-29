---
phase: 11-lens-grade-live-data-redesign
plan: 02
subsystem: ui
tags: [zustand, react, state-management, kubernetes, live-data, sse]

# Dependency graph
requires:
  - phase: 10-lens-style-live-data-k8s-watch-stream-architecture
    provides: SSE watch events (WatchEvent, ResourceType types in @voyager/types)
provides:
  - Zustand resource store (useResourceStore) for normalized K8s resource data
  - useClusterResources hook for typed selector-based resource reads
  - useConnectionState hook for per-cluster connection state
affects: [11-03, 11-04, resource-pages, cluster-layout]

# Tech tracking
tech-stack:
  added: []
  patterns: [zustand-subscribeWithSelector, map-keyed-store, selector-hooks]

key-files:
  created:
    - apps/web/src/stores/resource-store.ts
    - apps/web/src/stores/__tests__/resource-store.test.ts
    - apps/web/src/hooks/useResources.ts

key-decisions:
  - "Map<string, unknown[]> keyed by clusterId:resourceType for O(1) lookups and independent selector updates"
  - "subscribeWithSelector middleware for granular re-render control"
  - "ConnectionState type re-exported from store to hooks for single import path"

patterns-established:
  - "Map-keyed Zustand store: use composite keys (entity:subtype) for multi-dimensional lookups"
  - "Selector hooks: useCallback-memoized selectors to prevent re-renders on unrelated state changes"

requirements-completed: [L11-ZUSTAND-STORE, L11-SELECTOR-READS]

# Metrics
duration: 3min
completed: 2026-03-29
---

# Phase 11 Plan 02: Zustand Resource Store Summary

**Normalized Map-based Zustand store for live K8s resource data with selector-based useClusterResources/useConnectionState hooks replacing TanStack Query's setQueryData approach**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T20:52:45Z
- **Completed:** 2026-03-29T20:56:10Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- Zustand resource store with Map-based normalized state supporting all 15 K8s resource types
- Full CRUD operations via applyEvent (ADDED upsert, MODIFIED replace, DELETED filter) matching existing useResourceSSE logic
- 9 unit tests covering all store operations and selector isolation
- useClusterResources and useConnectionState hooks with useCallback-memoized selectors for optimal re-render performance

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Zustand resource store with unit tests** - `ca1d359` (feat) — TDD: tests + implementation in single commit
2. **Task 2: Create useResources consumer hooks** - `9248674` (feat)

## Files Created/Modified
- `apps/web/src/stores/resource-store.ts` - Zustand store with setResources, applyEvent, setConnectionState, clearCluster
- `apps/web/src/stores/__tests__/resource-store.test.ts` - 9 unit tests for all store operations
- `apps/web/src/hooks/useResources.ts` - useClusterResources<T> and useConnectionState hooks

## Decisions Made
- Used `Map<string, unknown[]>` keyed by `${clusterId}:${resourceType}` instead of nested objects for O(1) lookups and cleaner selector patterns
- `subscribeWithSelector` middleware enables future granular subscriptions without re-renders on unrelated changes
- Re-exported `ConnectionState` type from hooks module so consumers import from a single path

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Zustand store ready for Plan 03 (SSE integration) to wire useResourceSSE to push events into the store instead of TanStack Query setQueryData
- useClusterResources hook ready for Plan 04 (component migration) to replace tRPC query reads with store selectors

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 11-lens-grade-live-data-redesign*
*Completed: 2026-03-29*
