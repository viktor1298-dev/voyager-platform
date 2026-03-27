# Phase 4: Synchronized Crosshair - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped — autonomous mode)

<domain>
## Phase Boundary

Add Grafana-signature synchronized crosshair across all 4 metric panels. Hovering one panel shows a dashed vertical line + timestamp label at the same X position in all panels. Add brush-to-zoom (drag to select time region), threshold reference lines (85%/65% on CPU/Memory), and panel fullscreen expand.

Requirements: VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-05

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion. Key constraints from research:

- Use Recharts `syncId` prop for basic crosshair synchronization across panels
- If syncId causes perf issues (research warning), fall back to custom CrosshairProvider with Zustand + requestAnimationFrame throttling
- Recharts `Brush` component for drag-to-zoom
- `ReferenceLine` component for threshold lines (already partially used)
- Panel expand: click icon → panel takes full width (CSS transition, not modal)
- Crosshair cursor: custom SVG vertical dashed line via Recharts Tooltip `cursor` prop
- Timestamp label: shown in crosshair tooltip area
- All 4 panels share the same `syncId="metrics-sync"` prop

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- `apps/web/src/components/metrics/MetricsAreaChart.tsx` — main chart component, already has ReferenceLine imports
- `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` — panel orchestrator, renders 4 panels in grid

### Existing Patterns
- Charts use CSS variables for colors (`--color-chart-cpu`, etc.)
- Motion v12 for animations (B-style: springs, hover lift)
- `ResponsiveContainer` wraps all charts
- Current tooltip is `CustomTooltip` component

</code_context>

<specifics>
## Specific Ideas

- Crosshair should be a thin dashed vertical line (#666, strokeDasharray="3 3")
- Brush zoom: when user drags to select, update the time range to match the selection
- Panel expand: small expand icon in top-right of each panel card, toggles between 2-col and full-width
- Threshold lines: 85% = red dashed, 65% = yellow dashed (only on percent-type Y-axes)

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
