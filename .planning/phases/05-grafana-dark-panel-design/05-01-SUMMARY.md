---
phase: 05-grafana-dark-panel-design
plan: 01
subsystem: ui
tags: [recharts, css-variables, grafana, metrics, dark-theme, tooltip, legend]

requires:
  - phase: 04-synchronized-crosshair
    provides: syncId crosshair, brush zoom, threshold lines, panel expand
provides:
  - Grafana-quality dark panel backgrounds with dedicated CSS variables
  - Auto-scaling Y-axis for percent metrics (not fixed 0-100)
  - Range-adaptive X-axis formatting (HH:MM:SS / HH:MM / Mon Day)
  - Grafana-style dark tooltip with colored dot indicators and mono values
  - Interactive click-to-isolate legend with per-panel inline placement
  - Panel header redesign with uppercase title and current metric values
  - Exported METRIC_CONFIG and formatMetricValue for cross-component reuse
affects: [06-data-gap-visualization, 07-custom-range-picker]

tech-stack:
  added: []
  patterns:
    - "CSS variables for panel/tooltip theming (--color-panel-bg, --color-tooltip-bg)"
    - "computePercentDomain auto-scale with 10% padding and min-range guard"
    - "Click-to-isolate legend pattern (isolatedSeries state -> activeMetrics filter)"
    - "getLatestValue reverse-scan for latest non-null data point"

key-files:
  created: []
  modified:
    - apps/web/src/app/globals.css
    - apps/web/src/components/metrics/MetricsAreaChart.tsx
    - apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx
    - apps/web/src/components/charts/chart-theme.ts

key-decisions:
  - "Removed CurrentValueBadge from MetricsAreaChart — replaced by panel header current values and legend inline values"
  - "Removed top-level metric toggle bar — replaced by per-panel click-to-isolate legend (simpler, more Grafana-like)"
  - "Removed panel description text for Grafana-density compactness"

patterns-established:
  - "Panel background: var(--color-panel-bg) distinct from page bg var(--color-bg-primary) and card bg var(--color-bg-card)"
  - "Tooltip background: var(--color-tooltip-bg) with var(--color-tooltip-border) for both dark and light themes"
  - "Axis labels: ui-monospace, monospace fontFamily at 11px for all chart axes"
  - "Legend interaction: isolatedSeries state with 0.3 opacity dimming for non-isolated items"

requirements-completed: [STYLE-01, STYLE-02, STYLE-03, STYLE-04, STYLE-05]

duration: 5min
completed: 2026-03-28
---

# Phase 05 Plan 01: Grafana Dark Panel Design Summary

**Grafana-quality dark panel styling with auto-scale Y-axis, range-adaptive X-axis, interactive click-to-isolate legend, and dark tooltip with colored dot indicators**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-27T23:56:59Z
- **Completed:** 2026-03-28T00:01:38Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Metrics panels now render with dedicated dark backgrounds (--color-panel-bg) visually distinct from the page background, with monospace axis labels and subtle dashed grid lines
- Y-axis auto-scales based on actual data range for percent panels (e.g., 2-8% CPU shows 0-10% not 0-100%)
- X-axis labels adapt to time range: HH:MM:SS for 5m/15m, HH:MM for 30m-24h, Mon Day for 2d/7d
- Tooltip redesigned as Grafana-style dark panel with colored dot indicators, left-aligned names, and right-aligned mono-spaced values
- Interactive click-to-isolate legend below each chart: click a series to show only it, click again to restore all; dimmed items at 30% opacity
- Panel headers redesigned to Grafana style: uppercase compact title left, current metric values in color right

## Task Commits

Each task was committed atomically:

1. **Task 1: MetricsAreaChart visual overhaul** - `a087925` (feat)
2. **Task 2: MetricsTimeSeriesPanel interactive legend** - `0470549` (feat)

## Files Created/Modified
- `apps/web/src/app/globals.css` - Added 4 new CSS variables (panel-bg, panel-bg-inner, tooltip-bg, tooltip-border) for both dark and light themes
- `apps/web/src/components/metrics/MetricsAreaChart.tsx` - Dark panel wrapper, auto-scale Y-axis, adaptive X-axis formatting, Grafana tooltip, exported METRIC_CONFIG/formatMetricValue, removed CurrentValueBadge
- `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` - Interactive legend with click-to-isolate, panel header redesign with current values, removed top-level toggle bar
- `apps/web/src/components/charts/chart-theme.ts` - Updated TOOLTIP_STYLE to use new CSS variables

## Decisions Made
- Removed CurrentValueBadge component entirely -- panel header and legend now both show current values, making the badge redundant
- Removed top-level metric toggle bar (DEFAULT_VISIBLE_SERIES buttons) -- replaced by per-panel inline legend with click-to-isolate, which is more Grafana-like and less confusing
- Removed panel description text for compactness -- Grafana panels don't show descriptions inline
- Removed visibleSeries, toggleMetric, hasAnyVisibleSeries, noVisiblePanels state and checks -- all panels always show, isolation happens within each panel

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All STYLE requirements (01-05) implemented and verified
- Phase 4 features preserved: syncId crosshair, threshold lines, brush zoom, panel expand
- Ready for Phase 06 (data gap visualization) and Phase 07 (custom range picker)

---
*Phase: 05-grafana-dark-panel-design*
*Completed: 2026-03-28*
