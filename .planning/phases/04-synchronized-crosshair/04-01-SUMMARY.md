---
phase: 04-synchronized-crosshair
plan: 01
subsystem: ui
tags: [recharts, crosshair, syncId, brush-zoom, threshold-lines, panel-expand, metrics]

# Dependency graph
requires:
  - phase: 03-time-range-controls
    provides: TimeRangeSelector, useMetricsPreferences store, MetricsAreaChart base component
provides:
  - Synchronized crosshair across 4 metric panels via Recharts syncId
  - Custom dashed cursor with timestamp label
  - Threshold reference lines (65% warn, 85% critical) on percent-axis panels
  - Brush zoom for drag-to-select time range
  - Panel fullscreen expand/collapse toggle
  - setCustomRange in metrics-preferences store
affects: [05-grafana-dark-panel, 06-data-freshness, 07-performance-optimization]

# Tech tracking
tech-stack:
  added: []
  patterns: [syncId cross-panel synchronization, memoized SVG cursor component, brush-to-custom-range callback]

key-files:
  created: []
  modified:
    - apps/web/src/components/metrics/MetricsAreaChart.tsx
    - apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx
    - apps/web/src/stores/metrics-preferences.ts

key-decisions:
  - "Used Recharts built-in syncId for crosshair sync (simpler than custom Zustand/ref approach; Phase 7 can optimize if perf issues arise)"
  - "Added setCustomRange to metrics-preferences store to support brush zoom (Rule 3 deviation: plan referenced non-existent function)"
  - "Simplified section key to panel.id only (prevents unnecessary remount on range change)"

patterns-established:
  - "syncId='metrics-sync' on all MetricsAreaChart instances for cross-panel tooltip sync"
  - "Memoized CustomCursor with React.memo to prevent render cascade (Pitfall 2 mitigation)"
  - "Brush component gated by data.length > 5 to avoid useless brush on small datasets"

requirements-completed: [VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-05]

# Metrics
duration: 4min
completed: 2026-03-28
---

# Phase 4 Plan 1: Synchronized Crosshair Summary

**Recharts syncId crosshair across 4 panels with dashed cursor, 65%/85% threshold lines, brush-to-zoom, and expand-to-fullscreen toggle**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-27T23:39:50Z
- **Completed:** 2026-03-27T23:44:20Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Synchronized crosshair across all 4 metric panels (CPU, Memory, Network, Pods) via Recharts syncId
- Custom dashed vertical cursor with monospace timestamp label at hover position
- Threshold reference lines at 65% (warning yellow) and 85% (critical red) on CPU and Memory panels
- Brush drag-to-select zoom that sets a custom time range in the Zustand store
- Panel expand/collapse toggle with Maximize2/Minimize2 icons (full-width at 400px height when expanded)
- Fixed key prop remount bug (removed data.length), added animationDuration={0}, debounced ResponsiveContainer

## Task Commits

Each task was committed atomically:

1. **Task 1: syncId crosshair + custom cursor + threshold reference lines in MetricsAreaChart** - `937288a` (feat)
2. **Task 2: Wire syncId + brush zoom + panel fullscreen expand in MetricsTimeSeriesPanel** - `606898b` (feat)

## Files Created/Modified
- `apps/web/src/components/metrics/MetricsAreaChart.tsx` - Added syncId, showThresholds, onBrushChange props; CustomCursor component; threshold ReferenceLines; Brush component; animation/resize fixes
- `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` - Wired syncId="metrics-sync", showThresholds, onBrushChange to all panels; added expandedPanel state with Maximize2/Minimize2 toggle
- `apps/web/src/stores/metrics-preferences.ts` - Added customRangeFrom, customRangeTo state fields and setCustomRange action

## Decisions Made
- Used Recharts built-in syncId for crosshair sync (simpler than custom Zustand/ref approach; Phase 7 can optimize if perf issues arise)
- Simplified section key to panel.id only (prevents unnecessary remount on range change)
- Brush tickFormatter set to empty string to avoid cluttered labels in the small brush area

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added setCustomRange to metrics-preferences store**
- **Found during:** Task 2 (Wire brush zoom to time range)
- **Issue:** Plan referenced `setCustomRange` from `useMetricsPreferences()` but this function did not exist in the store
- **Fix:** Added `customRangeFrom`, `customRangeTo` state fields and `setCustomRange(from, to)` action that sets range='custom' and stores the timestamps
- **Files modified:** `apps/web/src/stores/metrics-preferences.ts`
- **Verification:** TypeScript compiles clean, build passes
- **Committed in:** `606898b` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for brush zoom functionality. No scope creep -- the plan assumed this function existed.

## Issues Encountered
None

## Known Stubs
None -- all features are fully wired to real data and state.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 4 complete: all VIZ requirements (VIZ-01 through VIZ-05) implemented
- Ready for Phase 5 (Grafana Dark Panel Design) which builds on the panel structure established here
- Note: Phase 7 (Performance Optimization) may need to replace syncId with a custom crosshair state if render cascade becomes an issue at scale (Pitfall 2)

## Self-Check: PASSED

- All 3 modified files exist on disk
- Both task commits (937288a, 606898b) found in git log
- TypeScript compiles clean (pnpm typecheck exits 0)
- Production build passes (pnpm build exits 0)
- All acceptance criteria grep checks pass

---
*Phase: 04-synchronized-crosshair*
*Completed: 2026-03-28*
