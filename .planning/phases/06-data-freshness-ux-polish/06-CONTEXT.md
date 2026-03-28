# Phase 6: Data Freshness & UX Polish - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Add data freshness indicators, pause-on-hover, skeleton loading states per panel, actionable error/empty states with retry, and fix the MetricsAreaChart key-prop remount bug.

Requirements: UX-01, UX-02, UX-03, UX-04, UX-05

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
Key constraints:
- UX-01: Freshness badge shows 'Live' (green, SSE active), '2m ago' (yellow, data >2min old), 'Stale' (red, data >5min old). Position: top-right next to time range selector.
- UX-02: Pause-on-hover — when any chart tooltip is active, freeze auto-refresh. Resume 1s after mouse leaves chart area. Use a ref to track hover state.
- UX-03: Skeleton shimmer per panel — already partially exists but needs refinement. Use shadcn Skeleton with chart-shaped placeholder.
- UX-04: Per-panel error states — if metrics.history fails, show retry button per panel (not full-page error)
- UX-05: Fix key-prop bug — remove `data.length` from MetricsAreaChart key prop (already done in Phase 4, verify still fixed)

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` — panel orchestrator
- `apps/web/src/components/metrics/MetricsAreaChart.tsx` — chart with key prop
- `apps/web/src/components/metrics/MetricsEmptyState.tsx` — existing empty/error/unavailable states

### Existing Patterns
- Skeleton loading already exists in panel loader section
- MetricsEmptyState has status variants: 'empty', 'error', 'unavailable'
- Auto-refresh controlled by Zustand store `autoRefresh` + `refreshInterval`
- `historyQuery.dataUpdatedAt` available for freshness calculation

</code_context>

<specifics>
## Specific Ideas

None — standard UX polish.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
