---
phase: 01-diagnose-fix-pipeline
plan: 02
subsystem: ui
tags: [sse, zustand, tanstack-query, playwright, eventsource, visibility-api]

# Dependency graph
requires:
  - phase: 01-diagnose-fix-pipeline/01
    provides: "Backend SSE heartbeat and watch-db-writer EventEmitter refactor"
provides:
  - "Polling-free cluster detail pages (SSE-only data for 15 watched types)"
  - "RelatedPodsList reads from Zustand store instead of tRPC"
  - "SSE EventSource visibility-change reconnect"
  - "E2E test for live data pipeline (3 test cases)"
affects: [02-reconnection-performance, frontend, live-data]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "wireHandlers() extracted helper for EventSource event setup (DRY reconnect)"
    - "useClusterResources() for all pod data on cluster detail pages (SSE-fed Zustand)"
    - "document.visibilitychange listener for EventSource reconnection"

key-files:
  created:
    - tests/e2e/live-data-pipeline.spec.ts
  modified:
    - apps/web/src/app/clusters/[id]/metrics/page.tsx
    - apps/web/src/components/resource/RelatedPodsList.tsx
    - apps/web/src/hooks/useResourceSSE.ts

key-decisions:
  - "Extracted wireHandlers() function to avoid duplicating EventSource event setup between init and visibility-change reconnect"
  - "E2E tests use login() helper and Playwright baseURL (relative URLs) matching existing test patterns"

patterns-established:
  - "wireHandlers(): Extracted EventSource handler setup for reuse in init and reconnect paths"
  - "Zustand-first for SSE-watched types: components on cluster detail pages use useClusterResources, never tRPC polling"

requirements-completed: [PIPE-01, PIPE-02]

# Metrics
duration: 3min
completed: 2026-03-30
---

# Phase 01 Plan 02: Remove Polling Conflicts and Add E2E Live Data Test Summary

**Eliminated TanStack Query polling for SSE-watched types on cluster detail pages, switched RelatedPodsList to Zustand store, added EventSource visibility-change reconnect, and created E2E test suite for live data pipeline**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-30T00:51:43Z
- **Completed:** 2026-03-30T00:55:05Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Removed `refetchInterval: 60000` from metrics page `clusters.live` query -- SSE provides this data on cluster detail pages
- Replaced tRPC `pods.list` polling in RelatedPodsList with `useClusterResources()` (SSE-fed Zustand store)
- Added `document.visibilitychange` listener to `useResourceSSE` that detects and reconnects dead EventSource after tab returns from background
- Created E2E test suite with 3 tests: SSE connection verification, 4 timed screenshots at 3s intervals, and 15s network monitoring to confirm no repeated tRPC polling

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove refetchInterval and switch RelatedPodsList to Zustand** - `093a222` (fix)
2. **Task 2: Add visibility-change reconnect and E2E test** - `a2e7f45` (feat)

## Files Created/Modified
- `apps/web/src/app/clusters/[id]/metrics/page.tsx` - Removed refetchInterval: 60000 from clusters.live query
- `apps/web/src/components/resource/RelatedPodsList.tsx` - Switched from tRPC pods.list to useClusterResources (Zustand)
- `apps/web/src/hooks/useResourceSSE.ts` - Added visibilitychange reconnect with wireHandlers() extraction
- `tests/e2e/live-data-pipeline.spec.ts` - New E2E test suite for SSE live data pipeline

## Decisions Made
- Extracted `wireHandlers()` function in `useResourceSSE.ts` to avoid code duplication between initial setup and visibility-change reconnect path. The plan showed duplicated handler code; extracting a shared function is cleaner and reduces maintenance burden.
- E2E test uses existing `login()` helper and Playwright's `baseURL` config (relative URLs) rather than manual `BASE_URL` variable, matching the pattern in all other E2E tests in the repo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug Prevention] Extracted wireHandlers() to avoid duplicated EventSource handlers**
- **Found during:** Task 2 (useResourceSSE visibility-change handler)
- **Issue:** Plan specified copying all 4 event handlers (onopen, snapshot, watch, status, onerror) into handleVisibilityChange, creating duplicate code
- **Fix:** Extracted `wireHandlers(es: EventSource)` function used by both initial setup and reconnect
- **Files modified:** apps/web/src/hooks/useResourceSSE.ts
- **Verification:** grep confirms visibilitychange (2 matches), EventSource.CLOSED (2 matches), reconnecting (2 matches)
- **Committed in:** a2e7f45 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug prevention / code quality)
**Impact on plan:** Minor refactor for DRY code. No scope creep. Same behavior as specified.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all data sources are wired.

## Next Phase Readiness
- Phase 01 complete: backend SSE heartbeat (plan 01) + frontend polling removal + visibility reconnect (plan 02)
- Ready for Phase 02 (reconnection & performance) which builds on the now-healthy SSE pipeline
- E2E test ready to run against live environment to validate full pipeline

## Self-Check: PASSED

All 5 files verified present. Both task commits (093a222, a2e7f45) confirmed in git log.

---
*Phase: 01-diagnose-fix-pipeline*
*Completed: 2026-03-30*
