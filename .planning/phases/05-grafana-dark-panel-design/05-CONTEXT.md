# Phase 5: Grafana Dark Panel Design - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Transform the metrics panels to look and feel like Grafana — dark card backgrounds, subtle grid lines, crisp mono-spaced axis labels, compact information density. Add interactive legend (click to isolate/toggle, hover to highlight), Y-axis auto-scale based on actual data range, range-adaptive X-axis formatting, and Grafana-style tooltip with bucket window + color-coded series.

Requirements: STYLE-01, STYLE-02, STYLE-03, STYLE-04, STYLE-05

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
Key constraints:
- Follow docs/DESIGN.md B-style (Confident & Expressive) for animations
- Use CSS variables for all colors (--color-chart-*, --color-bg-card, etc.)
- Dark panels: bg-[#1a1a2e] or similar dark blue-gray, not pure black
- Grid lines: subtle (#333 or var(--color-grid-line)), horizontal only, dashed
- Axis labels: mono-spaced (font-mono), 10-11px, dim color
- Legend: inline below chart, each item clickable, use the existing metric toggle pattern as basis
- Y-axis auto-scale: use `domain={['auto', 'auto']}` for non-percent axes, keep `[0, 100]` for percent
- X-axis adaptive: already partially implemented in MetricsAreaChart formatXAxis(), extend for new ranges (3h, 12h, 2d)
- Tooltip: keep CustomTooltip pattern but upgrade to Grafana style (dark bg, left-aligned values, series dot indicators)

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- `apps/web/src/components/metrics/MetricsAreaChart.tsx` — chart component with CustomTooltip, formatXAxis, getTickInterval
- `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` — panel grid with metric toggle buttons
- `apps/web/src/components/charts/chart-theme.ts` — shared chart constants, colors, threshold helpers
- `apps/web/src/app/globals.css` — CSS custom properties for chart colors
- `docs/DESIGN.md` — animation/interaction design standards

### Existing Patterns
- Chart colors: `--color-chart-cpu`, `--color-chart-mem`, `--color-chart-pods`, `--color-chart-warning`, `--color-chart-critical`
- Card styling: `rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]`
- Metric toggle buttons already exist (colored badges with on/off state)

</code_context>

<specifics>
## Specific Ideas

- Panel header: metric name left, current value right (like Grafana panel header)
- Legend items should have the colored dot + series name + current value inline
- When clicking a legend item to isolate it, dim the others to 20% opacity
- Tooltip should show a subtle dark box with rounded corners, no arrow

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
