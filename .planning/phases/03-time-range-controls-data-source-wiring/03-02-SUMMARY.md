---
phase: 03-time-range-controls-data-source-wiring
plan: 02
subsystem: ui
tags: [zustand, time-range, custom-picker, sse, metrics, recharts]

# Dependency graph
requires:
  - phase: 03-time-range-controls-data-source-wiring
    plan: 01
    provides: useMetricsData hook, useMetricsSSE hook, MetricsBuffer
provides:
  - Custom date picker in TimeRangeSelector (11 options: 10 presets + Custom)
  - Zustand store v3 with customFrom/customTo and persist migration
  - MetricsTimeSeriesPanel wired to useMetricsData hook (SSE for live, tRPC for historical)
  - Live indicator (green dot) when SSE is active
  - AutoRefreshToggle hidden during live mode
  - ApiMetricsRange type for backend-safe range passing
affects: [04-grafana-panel-design, 05-synchronized-crosshair, 07-performance]

# Tech tracking
tech-stack:
  added: []
  patterns: [ApiMetricsRange type guard for backend-incompatible ranges, Zustand persist v3 migration chain]

key-files:
  created: []
  modified:
    - apps/web/src/components/metrics/TimeRangeSelector.tsx
    - apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx
    - apps/web/src/stores/metrics-preferences.ts
    - apps/web/src/hooks/useMetricsData.ts
    - apps/web/src/hooks/useMetricsSSE.ts
    - apps/web/src/components/metrics/NodeMetricsTable.tsx
    - apps/web/src/lib/metrics-buffer.ts
    - apps/web/src/lib/metrics-buffer.test.ts

key-decisions:
  - "ApiMetricsRange type excludes 'custom' for backend-safe tRPC queries"
  - "Custom range returns empty data pending backend support (no crash, graceful fallback)"
  - "Plan 01 import paths fixed from .js relative to @/ aliases for Next.js build compatibility"

patterns-established:
  - "ApiMetricsRange: use Exclude<MetricsRange, 'custom'> when passing range to tRPC queries"
  - "Zustand persist migration chain: v0->v2->v3, each step validates and adds new fields"

requirements-completed: [TIME-01, TIME-02, TIME-03]

# Metrics
duration: 8min
completed: 2026-03-28
---

# Phase 03 Plan 02: UI Layer Wiring Summary

**Custom date picker with 10 Grafana presets, Zustand v3 store, and MetricsTimeSeriesPanel rewired to useMetricsData hook with SSE live indicator**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-27T23:20:36Z
- **Completed:** 2026-03-27T23:28:32Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- TimeRangeSelector now shows 10 Grafana-standard presets plus a Custom button with inline datetime-local picker
- MetricsTimeSeriesPanel rewired from direct tRPC query to unified useMetricsData hook (SSE for 5m/15m, tRPC for 30m+)
- Live indicator (green pulsing dot + "Live") appears when SSE is streaming data
- AutoRefreshToggle automatically hides during live mode since SSE pushes data
- Zustand store v3 persists customFrom/customTo with safe migration from v0/v1/v2
- Custom range selection forces autoRefresh off (static snapshot behavior)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend TimeRangeSelector with Custom date picker and update Zustand store** - `c4dc77d` (feat)
2. **Task 2: Wire MetricsTimeSeriesPanel to useMetricsData hook** - `ef3f66f` (feat)

## Files Created/Modified
- `apps/web/src/components/metrics/TimeRangeSelector.tsx` - Added 'custom' to MetricsRange, ApiMetricsRange type, Custom button + datetime-local dropdown with Apply/Cancel
- `apps/web/src/stores/metrics-preferences.ts` - customFrom/customTo fields, setCustomRange action, v3 persist migration
- `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` - Replaced trpc.metrics.history.useQuery with useMetricsData hook, added live indicator, hid auto-refresh in live mode, wired custom range props
- `apps/web/src/hooks/useMetricsData.ts` - Added 'custom' mode handling, ApiMetricsRange for backend queries, fixed import paths
- `apps/web/src/hooks/useMetricsSSE.ts` - Fixed import paths from .js relative to @/ aliases
- `apps/web/src/lib/metrics-buffer.ts` - Fixed import path
- `apps/web/src/lib/metrics-buffer.test.ts` - Fixed import paths
- `apps/web/src/components/metrics/NodeMetricsTable.tsx` - Added ApiMetricsRange import, disabled query for custom range

## Decisions Made
- **ApiMetricsRange type guard:** Created `Exclude<MetricsRange, 'custom'>` type to prevent 'custom' from being sent to backend tRPC queries (backend z.enum doesn't include it). This is cleaner than runtime filtering.
- **Custom range returns empty data:** When 'custom' is selected, useMetricsData returns empty array (not an error). Backend custom range query support will be added in a future plan.
- **Import path fix (Rule 3):** Plan 01 files used `.js` relative imports which fail Next.js build. Fixed to `@/` path aliases used by the rest of the codebase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Plan 01 import paths for Next.js build**
- **Found during:** Task 2 (build verification)
- **Issue:** useMetricsData.ts, useMetricsSSE.ts, metrics-buffer.ts used relative imports with `.js` extensions (`../lib/trpc.js`) which Next.js cannot resolve during build
- **Fix:** Changed all Plan 01 files to use `@/` path aliases (`@/lib/trpc`, `@/hooks/useMetricsSSE`, etc.) matching codebase convention
- **Files modified:** useMetricsData.ts, useMetricsSSE.ts, metrics-buffer.ts, metrics-buffer.test.ts
- **Verification:** `pnpm build` passes clean (all 6 turbo tasks succeed)
- **Committed in:** ef3f66f (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added ApiMetricsRange and custom range handling**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** Adding 'custom' to MetricsRange broke all tRPC queries because backend z.enum doesn't include 'custom'. Without handling, selecting Custom would crash.
- **Fix:** Created ApiMetricsRange type, added range guards in useMetricsData, NodeMetricsTable, and MetricsTimeSeriesPanel
- **Files modified:** TimeRangeSelector.tsx, useMetricsData.ts, NodeMetricsTable.tsx, MetricsTimeSeriesPanel.tsx
- **Verification:** `pnpm typecheck` shows zero errors in modified files
- **Committed in:** c4dc77d (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both auto-fixes essential for build correctness. No scope creep.

## Known Stubs

- **Custom range data:** When 'custom' is selected in useMetricsData, it returns empty data (`data: []`). This is intentional — backend custom range query support requires extending the tRPC metrics.history procedure to accept absolute timestamps, which is planned for a future phase.

## Issues Encountered
None beyond the auto-fixed deviations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All time range controls and data source wiring complete
- Phase 03 fully done: data hooks (Plan 01) + UI wiring (Plan 02)
- Ready for Phase 04 (Grafana panel design) and Phase 05 (synchronized crosshair)
- Custom range backend support deferred to Phase 07 (performance optimization) or separate plan

## Self-Check: PASSED

All 8 modified files verified present. Both task commits (c4dc77d, ef3f66f) verified in git log.

---
*Phase: 03-time-range-controls-data-source-wiring*
*Completed: 2026-03-28*
