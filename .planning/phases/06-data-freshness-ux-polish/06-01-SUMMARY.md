---
phase: 06-data-freshness-ux-polish
plan: 01
subsystem: ui
tags: [react, recharts, metrics, skeleton, freshness, ux]

# Dependency graph
requires:
  - phase: 05-grafana-dark-panel-design
    provides: Grafana-style panel layout, CSS variables for panel-bg/tooltip-bg/border
provides:
  - DataFreshnessBadge component with Live/age/Stale indicator
  - Pause-on-hover auto-refresh behavior for chart panels
  - MetricsPanelSkeleton chart-shaped loading shimmer
  - Per-panel empty state with compact MetricsEmptyState and retry
  - UX-05 key-prop bugfix verification comment
affects: [07-sse-live-metrics]

# Tech tracking
tech-stack:
  added: []
  patterns: [pause-on-hover via ref-based auto-refresh toggle, per-panel data availability check]

key-files:
  created:
    - apps/web/src/components/metrics/DataFreshnessBadge.tsx
    - apps/web/src/components/metrics/MetricsPanelSkeleton.tsx
  modified:
    - apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx
    - apps/web/src/components/metrics/MetricsAreaChart.tsx
    - apps/web/src/components/metrics/MetricsEmptyState.tsx

key-decisions:
  - "Freshness thresholds: Live <2min with auto-refresh, Recent <5min, Stale >=5min"
  - "Pause-on-hover uses refs to avoid re-render cycles, 1s resume delay on mouse leave"
  - "Per-panel empty state uses panelHasData check since all 4 panels share one query"

patterns-established:
  - "DataFreshnessBadge: reusable freshness indicator using data-freshness attribute for testability"
  - "Compact mode pattern: MetricsEmptyState compact prop for in-panel usage vs full-page"

requirements-completed: [UX-01, UX-02, UX-03, UX-04, UX-05]

# Metrics
duration: 4min
completed: 2026-03-28
---

# Phase 06 Plan 01: Data Freshness UX Polish Summary

**Data freshness badge (Live/age/Stale), pause-on-hover auto-refresh, chart-shaped skeleton loading per panel, and per-panel empty states with retry**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-28T00:10:58Z
- **Completed:** 2026-03-28T00:15:29Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- DataFreshnessBadge shows Live (green pulse), relative age (amber), or Stale (red) based on historyQuery.dataUpdatedAt
- Auto-refresh pauses while user hovers over chart grid and resumes 1s after mouse leaves
- Each of 4 panels shows a chart-shaped skeleton shimmer while loading (header + chart + legend placeholders)
- Panels with all-null metric data show compact empty state with retry button
- AreaChart key prop verified clean of data.length with UX-05 documenting comment

## Task Commits

Each task was committed atomically:

1. **Task 1: DataFreshnessBadge, pause-on-hover, key-prop verification** - `e1aa2f6` (feat)
2. **Task 2: Per-panel skeleton loading, error/empty states with retry** - `3e9724c` (feat)

## Files Created/Modified
- `apps/web/src/components/metrics/DataFreshnessBadge.tsx` - Freshness badge with Live/recent/Stale states, 5s re-compute interval
- `apps/web/src/components/metrics/MetricsPanelSkeleton.tsx` - Chart-shaped skeleton with header, chart area, and legend placeholders
- `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` - Wired badge, pause-on-hover, skeleton loading, per-panel empty states
- `apps/web/src/components/metrics/MetricsAreaChart.tsx` - Added UX-05 comment documenting key prop requirement
- `apps/web/src/components/metrics/MetricsEmptyState.tsx` - Added compact prop for in-panel display (smaller padding, inline icon)

## Decisions Made
- Freshness thresholds: Live requires autoRefresh=true AND age <2min; Recent <5min; Stale >=5min
- Pause-on-hover uses useRef pattern (not useState) to avoid triggering re-renders and query refetches
- Per-panel empty state leverages shared historyQuery data since all 4 panels share one API call -- checks if specific panel metrics have any non-null values

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All data freshness and UX polish features are in place
- Ready for Phase 07 (SSE live metrics) which will benefit from the freshness badge showing "Live" state
- MetricsPanelSkeleton and compact empty states provide polished loading/error UX for future data sources

## Self-Check: PASSED

All 5 created/modified files verified on disk. Both task commits (e1aa2f6, 3e9724c) found in git log. `pnpm typecheck` and `pnpm build` both pass with 0 errors.

---
*Phase: 06-data-freshness-ux-polish*
*Completed: 2026-03-28*
