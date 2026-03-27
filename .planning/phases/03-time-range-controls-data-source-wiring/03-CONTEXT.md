# Phase 3: Time Range Controls & Data Source Wiring - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped — autonomous mode)

<domain>
## Phase Boundary

Wire the new Grafana-standard time ranges to the frontend and build the dual data source layer: SSE for short ranges (<=15m), DB/tRPC for historical ranges (>=30m). Users select a time range and see data from the correct source seamlessly. Includes the custom absolute date/time picker, SSE reconnection with backoff, visibility-aware lifecycle (pause on hidden tab), and client-side circular buffer for live data.

Requirements: TIME-01, TIME-02, TIME-03, TIME-04, SSE-03, SSE-04, SSE-05

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion. Key constraints from research and prior phases:

- TimeRangeSelector already has 10 Grafana-standard ranges from Phase 1 (01-02)
- Zustand store already migrated with v2 schema from Phase 1 (01-02)
- SSE endpoint at /api/metrics/stream available from Phase 2
- Data source switching: if range <= '15m' use SSE, if range >= '30m' use tRPC metrics.history
- Custom date picker: use shadcn Calendar component (already available in @voyager/ui)
- SSE reconnection: exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Visibility API: pause SSE EventSource on `document.visibilitychange` hidden, resume on visible
- Circular buffer: max 65 points (15m / 15s interval), evict oldest on overflow
- Create new hooks: `useMetricsData(clusterId, range)` that abstracts SSE vs tRPC
- Create new hook: `useMetricsSSE(clusterId)` for SSE connection management

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/src/components/metrics/TimeRangeSelector.tsx` — already has 10 Grafana ranges
- `apps/web/src/stores/metrics-preferences.ts` — Zustand store with range persistence
- `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` — main panel orchestrator
- `packages/ui/` — shadcn components including Calendar/DatePicker

### Integration Points
- `MetricsTimeSeriesPanel` currently calls `trpc.metrics.history.useQuery()` — needs to switch to `useMetricsData()` hook
- SSE URL: `/api/metrics/stream?clusterId=${id}` (from Phase 2)
- Response shape (both sources): `{ data: MetricsDataPoint[], serverTime, intervalMs }`

</code_context>

<specifics>
## Specific Ideas

- Custom date picker should appear as a dropdown from the time range selector when "Custom" is selected
- The data source switch should be invisible to the user — no "SSE mode" / "DB mode" indicator needed
- When switching from SSE to DB range, flush the circular buffer

</specifics>

<deferred>
## Deferred Ideas

None — autonomous mode.

</deferred>
