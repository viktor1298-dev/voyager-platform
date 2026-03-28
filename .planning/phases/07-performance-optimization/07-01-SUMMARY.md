---
phase: 07-performance-optimization
plan: "01"
subsystem: ui
tags: [recharts, lttb, downsampling, crosshair, performance, requestAnimationFrame, ResizeObserver]

# Dependency graph
requires:
  - phase: none
    provides: existing MetricsAreaChart and MetricsTimeSeriesPanel components
provides:
  - LTTB downsampling module for chart data reduction
  - CrosshairProvider context for synchronized multi-panel hover
  - DebouncedResponsiveContainer for throttled chart resizes
  - Memoized CustomTooltip for reduced re-renders
affects: [metrics-visualization, chart-components, sse-streaming]

# Tech tracking
tech-stack:
  added: []
  patterns: [LTTB downsampling, RAF-throttled shared state, render-prop responsive container, optional React context pattern]

key-files:
  created:
    - apps/web/src/lib/lttb.ts
    - apps/web/src/components/metrics/CrosshairProvider.tsx
    - apps/web/src/components/metrics/CrosshairCursor.tsx
    - apps/web/src/components/metrics/DebouncedResponsiveContainer.tsx
  modified:
    - apps/web/src/components/metrics/MetricsAreaChart.tsx
    - apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx

key-decisions:
  - "Inline LTTB (~90 LOC) instead of external dependency -- avoids npm package for simple algorithm"
  - "useCrosshairOptional pattern for graceful degradation outside CrosshairProvider"
  - "RAF-throttled crosshair updates instead of Recharts syncId to prevent render cascades"
  - "Render-prop DebouncedResponsiveContainer instead of wrapping Recharts ResponsiveContainer"

patterns-established:
  - "LTTB downsampling: import downsampleMetrics from @/lib/lttb for any chart data over 200 points"
  - "CrosshairProvider wraps multi-panel chart groups; individual charts use useCrosshairOptional"
  - "DebouncedResponsiveContainer replaces ResponsiveContainer in all metrics charts"

requirements-completed: [PERF-01, PERF-02, PERF-03]

# Metrics
duration: 7min
completed: 2026-03-28
---

# Phase 7 Plan 1: Chart Performance Optimization Summary

**LTTB downsampling caps chart data at 200 points, RAF-throttled crosshair sync across 4 panels, and debounced resize observer replaces Recharts ResponsiveContainer**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-28T00:25:27Z
- **Completed:** 2026-03-28T00:33:14Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- LTTB downsampling algorithm reduces any dataset to ~200 visual points without losing shape fidelity (PERF-01)
- Crosshair synchronization across all 4 metric panels uses requestAnimationFrame throttling instead of Recharts syncId, preventing render cascades (PERF-02)
- DebouncedResponsiveContainer with ResizeObserver + 150ms debounce replaces Recharts ResponsiveContainer to prevent layout thrashing (PERF-03)
- Fixed key-prop remount bug (removed data.length from AreaChart key) and added animationDuration={0} to eliminate 1500ms dot render delay

## Task Commits

Each task was committed atomically:

1. **Task 1: LTTB Downsampling + Key Prop Fix** - `d548a59` (perf)
2. **Task 2: Crosshair Synchronization** - `e79f0dc` (perf)
3. **Task 3: ResponsiveContainer Debounce + Build Verification** - `45c2170` (perf)

## Files Created/Modified
- `apps/web/src/lib/lttb.ts` - LTTB downsampling algorithm with generic and metrics-specific exports
- `apps/web/src/components/metrics/CrosshairProvider.tsx` - React context for RAF-throttled crosshair state sharing
- `apps/web/src/components/metrics/CrosshairCursor.tsx` - Custom Recharts cursor rendering synchronized vertical line
- `apps/web/src/components/metrics/DebouncedResponsiveContainer.tsx` - ResizeObserver-based responsive container with 150ms debounce
- `apps/web/src/components/metrics/MetricsAreaChart.tsx` - Integrated crosshair, debounced container, fixed key prop, memoized tooltip
- `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` - Added LTTB downsampling and CrosshairProvider wrapper

## Decisions Made
- Inline LTTB (~90 LOC) instead of external `lttb` npm package -- avoids dependency for a simple, well-defined algorithm
- Used `useCrosshairOptional` pattern (returns null outside provider) instead of requiring CrosshairProvider everywhere -- allows MetricsAreaChart to work standalone
- RAF-throttled shared state instead of Recharts `syncId` -- syncId triggers setState in every chart on every mouse event (4 re-renders per mouse move)
- Render-prop DebouncedResponsiveContainer passes explicit width/height to AreaChart -- avoids Recharts ResponsiveContainer's internal resize listener that fires on every pixel

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Recharts onMouseMove type mismatch**
- **Found during:** Task 3 (build verification)
- **Issue:** `handleMouseMove` parameter type didn't match Recharts `CategoricalChartFunc` signature -- `activeLabel` can be `string | number | undefined` not just `string`
- **Fix:** Used `Record<string, any>` parameter type with runtime `String()` conversion for crosshair
- **Files modified:** `apps/web/src/components/metrics/MetricsAreaChart.tsx`
- **Verification:** `pnpm typecheck` passes (our files), `pnpm build` succeeds
- **Committed in:** `45c2170` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type fix necessary for compilation. No scope creep.

## Issues Encountered
- Pre-existing typecheck errors in web package (API module resolution from web's tsconfig) are unrelated to this plan's changes -- all errors are in `../api/src/` files and pre-date this work

## Known Stubs
None -- all functionality is fully wired and operational.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Chart performance optimizations complete, ready for visual design phase (STYLE-* requirements)
- CrosshairProvider pattern established for future multi-panel synchronization features
- LTTB module available for any future chart component needing downsampling

## Self-Check: PASSED

All 6 created/modified files verified present. All 3 task commits (d548a59, e79f0dc, 45c2170) verified in git log.

---
*Phase: 07-performance-optimization*
*Completed: 2026-03-28*
