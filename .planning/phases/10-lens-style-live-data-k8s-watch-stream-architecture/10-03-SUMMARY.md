---
phase: 10-lens-style-live-data-k8s-watch-stream-architecture
plan: 03
subsystem: ui
tags: [sse, tanstack-query, setQueryData, real-time, react, connection-status]

# Dependency graph
requires:
  - phase: 10-01
    provides: WatchManager with in-memory ObjectCache and resource mappers
provides:
  - Rewritten useResourceSSE hook with direct TanStack Query cache updates via setQueryData
  - ConnectionStatusBadge component for SSE connection health visualization
  - ConnectionState type export for consumer components
affects: [10-04, 10-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [tRPC utils setData for SSE-driven cache updates, race condition guard for pending queries]

key-files:
  created:
    - apps/web/src/components/ConnectionStatusBadge.tsx
  modified:
    - apps/web/src/hooks/useResourceSSE.ts
    - apps/web/src/app/clusters/[id]/layout.tsx

key-decisions:
  - "Defined WatchEvent/WatchEventBatch/WatchStatusEvent types locally in useResourceSSE.ts since Plan 02 (parallel) adds them to @voyager/types"
  - "Used tRPC utils.{router}.{method}.setData() instead of raw queryClient.setQueryData() for type-safe query key matching"

patterns-established:
  - "SSE setQueryData pattern: applyToList helper handles ADDED/MODIFIED/DELETED with name+namespace identity"
  - "Race condition guard: if old data undefined in setData updater, return undefined (query not yet loaded)"
  - "ConnectionStatusBadge: CSS custom property colors with animate-pulse, matches DataFreshnessBadge visual pattern"

requirements-completed: [D-03, D-04]

# Metrics
duration: 4min
completed: 2026-03-29
---

# Phase 10 Plan 03: Client-Side SSE Hook Rewrite + ConnectionStatusBadge Summary

**Rewritten useResourceSSE with direct TanStack Query cache updates via setQueryData for all 15 resource types, plus ConnectionStatusBadge showing Live/Reconnecting/Disconnected/Connecting states**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-29T17:16:27Z
- **Completed:** 2026-03-29T17:21:13Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Replaced refetch-based SSE handling with direct TanStack Query cache updates via setData across 16 tRPC endpoints (15 resource types, services has both list + listDetail)
- Added race condition guard preventing lost events when tRPC queries haven't loaded yet
- Created ConnectionStatusBadge with proper accessibility (aria-live, role=status) and theme-aware colors using CSS custom properties
- Integrated ConnectionStatusBadge in cluster header metadata row alongside provider and status indicators

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite useResourceSSE with setQueryData + connection state** - `bbfe58a` (feat)
2. **Task 2: ConnectionStatusBadge component + cluster layout integration** - `7480062` (feat)

## Files Created/Modified
- `apps/web/src/hooks/useResourceSSE.ts` - Complete rewrite: SSE watch events applied to TanStack Query cache via setData, connection state exposed
- `apps/web/src/components/ConnectionStatusBadge.tsx` - New component: SSE connection health indicator with 4 states, CSS custom property colors, accessibility attributes
- `apps/web/src/app/clusters/[id]/layout.tsx` - Integrated ConnectionStatusBadge in cluster header, consume connectionState from useResourceSSE

## Decisions Made
- Defined WatchEvent/WatchEventBatch/WatchStatusEvent types locally in useResourceSSE.ts as a temporary measure since Plan 02 (running in parallel) adds these to @voyager/types. Once Plan 02 merges, these can be replaced with imports from @voyager/types.
- Used tRPC utils.{router}.{method}.setData() rather than raw queryClient.setQueryData() to ensure query keys are type-safe and always match (Pitfall 2 from RESEARCH.md).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Defined SSE wire format types locally**
- **Found during:** Task 1 (useResourceSSE rewrite)
- **Issue:** Plan imports WatchEvent/WatchEventBatch/WatchStatusEvent from @voyager/types, but these types don't exist yet (added by Plan 02 running in parallel)
- **Fix:** Defined the three interfaces locally in useResourceSSE.ts with identical shape to the plan specification
- **Files modified:** apps/web/src/hooks/useResourceSSE.ts
- **Verification:** pnpm build && pnpm typecheck pass
- **Committed in:** bbfe58a (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to unblock parallel execution. Types will be consolidated when Plan 02 merges.

## Issues Encountered
None

## Known Stubs
None - all data sources are wired and functional.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- useResourceSSE now exposes connectionState and applies data via setQueryData -- ready for Plan 04 (remove polling) and Plan 05 (real-time animations)
- ConnectionStatusBadge is visible in cluster header -- Wave 2 QA can verify it shows correct states
- When Plan 02 merges, the SSE server will send `event: watch` and `event: status` events that this hook listens for

## Self-Check: PASSED

- [x] apps/web/src/hooks/useResourceSSE.ts -- FOUND
- [x] apps/web/src/components/ConnectionStatusBadge.tsx -- FOUND
- [x] 10-03-SUMMARY.md -- FOUND
- [x] Commit bbfe58a -- FOUND
- [x] Commit 7480062 -- FOUND

---
*Phase: 10-lens-style-live-data-k8s-watch-stream-architecture*
*Completed: 2026-03-29*
