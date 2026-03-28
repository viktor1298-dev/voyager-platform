# Phase 7: Performance Optimization - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Implement LTTB downsampling for datasets with 500+ points (inlined ~50 LOC), throttle crosshair synchronization to prevent render cascades, and debounce ResponsiveContainer resize events.

Requirements: PERF-01, PERF-02, PERF-03, PIPE-04

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
Key constraints from research:
- LTTB: Inline implementation (~50 LOC TypeScript), no external dependency. Downsample to ~200 visual points.
- Place LTTB in `apps/web/src/lib/lttb.ts` as a pure function
- Apply downsampling in `useMetricsData` hook before returning data to chart
- Crosshair throttling: if Recharts syncId causes perf issues, add requestAnimationFrame throttle. Phase 5 already used syncId — verify if throttling is needed.
- ResponsiveContainer debounce: Phase 4 already added `debounce={100}` — verify still in place.
- PIPE-04: Backend LTTB for server-side downsampling (optional, can be client-only for now)

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- `apps/web/src/hooks/useMetricsData.ts` — unified data hook, LTTB goes here
- `apps/web/src/components/metrics/MetricsAreaChart.tsx` — chart with syncId and ResponsiveContainer debounce
- `apps/web/src/lib/metrics-buffer.ts` — MetricsBuffer circular buffer

### Performance State
- Phase 4 added `debounce={100}` to ResponsiveContainer (PERF-03 may already be done)
- Phase 4 added `animationDuration={0}` to AreaChart (removes chart animation overhead)
- syncId is in use — needs perf validation

</code_context>

<specifics>
## Specific Ideas

- LTTB function signature: `lttb(data: MetricsDataPoint[], targetPoints: number): MetricsDataPoint[]`
- Apply downsampling only when `data.length > targetPoints` (default 200)
- Include unit test for LTTB that verifies it preserves min/max extremes

</specifics>

<deferred>
## Deferred Ideas

None — final phase.

</deferred>
