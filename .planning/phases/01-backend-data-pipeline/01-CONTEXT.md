# Phase 1: Backend Data Pipeline - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Fix the broken metrics backend so every Grafana-standard time range (5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 2d, 7d) returns correct, populated, bucket-aligned data. Replace in-memory JS bucketing with TimescaleDB `time_bucket()` SQL aggregation. Include `serverTime` and `intervalMs` in API responses for client timeline alignment. Remove old broken time ranges (30s, 1m) from input validation.

Requirements: PIPE-01, PIPE-02, PIPE-03, PIPE-05

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key constraints from research:

- Use TimescaleDB `time_bucket()` for server-side aggregation (STACK.md)
- Keep 60s collector interval unchanged — only fix how data is queried and bucketed
- Replace `TIME_RANGE_CONFIG` with new Grafana-standard ranges
- Return `serverTime` (ISO string) and `intervalMs` in every `metrics.history` response
- Validate input against new range enum (reject old 30s/1m values)
- No schema changes needed — metrics_history and node_metrics_history tables stay as-is
- Target 20-60 data points per response (research recommendation for chart readability)

</decisions>

<code_context>
## Existing Code Insights

### Key Files to Modify
- `apps/api/src/routers/metrics.ts` — Main router with `TIME_RANGE_CONFIG`, `getBucketTimeline()`, `alignFloor()`, `buildSeries()`, `history` procedure
- `apps/web/src/components/metrics/TimeRangeSelector.tsx` — `MetricsRange` type and `RANGES` array
- `apps/web/src/stores/metrics-preferences.ts` — Zustand store with default range

### Existing Patterns
- Bucket logic: `getBucketTimeline()` generates full timeline, `getBucketIndex()` maps data points, `buildSeries()` null-fills gaps
- All DB queries use Drizzle ORM (`@voyager/db`)
- TimescaleDB is already the Postgres image (`timescale/timescaledb:latest-pg17`)
- `time_bucket()` extension should be available but needs verification

### Root Cause Analysis
- Current `TIME_RANGE_CONFIG` has 30s (intervalMs=5s) and 1m (intervalMs=10s) — collector writes every 60s, so sub-minute buckets are always empty
- `history` procedure loads ALL rows into JS heap and aggregates in-memory — inefficient for large ranges (7d = thousands of rows)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
