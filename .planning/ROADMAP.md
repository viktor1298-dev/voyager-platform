# Roadmap: Metrics Graph Redesign

## Overview

Transform the broken metrics visualization from empty charts and wrong time ranges into a Grafana-quality monitoring surface. The build follows a strict backend-first ordering: fix the data pipeline (root cause of empty graphs), add SSE streaming, wire frontend controls and data source switching, then layer synchronized crosshair, dark panel design, UX polish, and performance optimization. Each phase delivers a verifiable capability on top of the previous one.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Backend Data Pipeline** - Fix broken bucketing, TimescaleDB aggregation, server metadata in responses
- [ ] **Phase 2: SSE Streaming Endpoint** - Backend SSE route and MetricsStreamJob for live K8s metrics
- [ ] **Phase 3: Time Range Controls & Data Source Wiring** - Frontend time range selector, SSE client hooks, data source switching
- [x] **Phase 4: Synchronized Crosshair** - Cross-panel crosshair, custom cursor, brush zoom, threshold lines, panel expand
- [ ] **Phase 5: Grafana Dark Panel Design** - Dark panel backgrounds, interactive legend, auto-scale axes, adaptive formatting, tooltip
- [ ] **Phase 6: Data Freshness & UX Polish** - Freshness badge, pause-on-hover, skeleton loading, error states, key-prop bugfix
- [ ] **Phase 7: Performance Optimization** - LTTB downsampling, crosshair throttling, resize debounce

## Phase Details

### Phase 1: Backend Data Pipeline
**Goal**: Every Grafana-standard time range returns correct, populated data from the backend
**Depends on**: Nothing (first phase)
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-05
**Success Criteria** (what must be TRUE):
  1. Selecting any of the 10 Grafana-standard time ranges (5m through 7d) returns non-empty, correctly bucketed data when metrics exist in the DB
  2. Backend uses TimescaleDB `time_bucket()` SQL for aggregation instead of in-memory JS bucketing
  3. API response includes `serverTime` and `intervalMs` fields that the client can use for timeline alignment
  4. Old broken time ranges (30s, 1m) are rejected by input validation with a clear error
**Plans:** 2 plans
Plans:
- [x] 01-01-PLAN.md — Rewrite backend metrics pipeline with time_bucket() SQL, new Grafana ranges, response metadata
- [x] 01-02-PLAN.md — Update frontend types, store migration, and consumers for new API response shape

### Phase 2: SSE Streaming Endpoint
**Goal**: Backend streams live K8s metrics via SSE for clusters with active subscribers
**Depends on**: Phase 1
**Requirements**: SSE-01, SSE-02
**Success Criteria** (what must be TRUE):
  1. A dedicated SSE endpoint at `/api/metrics/stream` streams live K8s metrics at 10-15s resolution for a given cluster
  2. MetricsStreamJob polls K8s metrics-server only when at least one SSE subscriber is connected (reference-counted start/stop)
  3. SSE connection sends heartbeats and handles client disconnects without leaking server resources
**Plans:** 1 plan
Plans:
- [x] 02-01-PLAN.md — SSE endpoint, MetricsStreamJob with reference-counted polling, shared types and config

### Phase 3: Time Range Controls & Data Source Wiring
**Goal**: Users select time ranges from a Grafana-standard set and see data from the correct source (SSE or DB) seamlessly
**Depends on**: Phase 2
**Requirements**: TIME-01, TIME-02, TIME-03, TIME-04, SSE-03, SSE-04, SSE-05
**Success Criteria** (what must be TRUE):
  1. Time range selector shows Grafana-standard presets (5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 2d, 7d) plus a custom date/time picker
  2. Selecting a short range (5m or 15m) automatically uses SSE live data; selecting 30m or longer uses DB historical data -- the switch is invisible to the user
  3. SSE connection auto-reconnects on disconnect with exponential backoff and pauses when the browser tab is hidden
  4. Selected time range persists across page navigations via Zustand/localStorage
  5. Client-side circular buffer manages live SSE data with time-based eviction (no unbounded memory growth)
**Plans:** 1/2 plans executed
Plans:
- [x] 03-01-PLAN.md — Data hooks layer: MetricsBuffer, useMetricsSSE (reconnect + visibility), useMetricsData (SSE/DB switching)
- [x] 03-02-PLAN.md — UI components: Custom date picker in TimeRangeSelector, wire MetricsTimeSeriesPanel to useMetricsData hook
**UI hint**: yes

### Phase 4: Synchronized Crosshair
**Goal**: Users can hover any panel and see a synchronized crosshair with timestamp across all 4 metric panels
**Depends on**: Phase 3
**Requirements**: VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-05
**Success Criteria** (what must be TRUE):
  1. Hovering any of the 4 panels (CPU, Memory, Network, Pods) shows a vertical crosshair line at the same timestamp on all panels simultaneously
  2. Custom crosshair cursor renders as a dashed vertical line across the full chart height with a timestamp label
  3. User can drag-to-select a time region on any panel to zoom into that range (brush zoom)
  4. CPU and Memory panels show horizontal threshold reference lines at 65% (warning) and 85% (critical)
  5. User can click to expand any panel to a full-width detail view
**Plans:** 1 plan
Plans:
- [x] 04-01-PLAN.md — syncId crosshair, custom cursor, threshold lines, brush zoom, panel expand
**UI hint**: yes

### Phase 5: Grafana Dark Panel Design
**Goal**: Metrics panels look and feel like Grafana -- dark backgrounds, crisp typography, professional information density
**Depends on**: Phase 4
**Requirements**: STYLE-01, STYLE-02, STYLE-03, STYLE-04, STYLE-05
**Success Criteria** (what must be TRUE):
  1. Each panel has a dark card background with subtle grid lines and mono-spaced axis labels at compact density
  2. Clicking a series name in the legend isolates that series; hovering a series name highlights it on the chart
  3. Y-axis auto-scales based on actual data range (not fixed 0-100% when cluster CPU is at 2-5%)
  4. X-axis labels adapt to the selected range: HH:MM:SS for minutes, HH:MM for hours, Mon Day for multi-day
  5. Tooltip shows bucket time window, precise values for each series, and color-coded series indicators
**Plans**: TBD
**UI hint**: yes

### Phase 6: Data Freshness & UX Polish
**Goal**: Users always know how fresh their data is, and the UI handles loading/error/empty states gracefully
**Depends on**: Phase 5
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05
**Success Criteria** (what must be TRUE):
  1. A data freshness badge shows "Live" (green), "2m ago" (amber), or "Stale" (red) based on last data timestamp
  2. Auto-refresh freezes while the user hovers over a chart tooltip; resumes on mouse leave
  3. Each panel shows a skeleton shimmer during loading (not a full-page spinner)
  4. Empty and error states show an actionable message with a retry button per panel
  5. Charts do not remount/flicker when new data arrives (key-prop bug fixed)
**Plans**: TBD
**UI hint**: yes

### Phase 7: Performance Optimization
**Goal**: Charts remain smooth and responsive even with large datasets and synchronized interactions
**Depends on**: Phase 6
**Requirements**: PERF-01, PERF-02, PERF-03, PIPE-04
**Success Criteria** (what must be TRUE):
  1. Ranges producing 500+ data points are downsampled via LTTB to ~200 visual points with no visible loss of shape
  2. Crosshair synchronization across 4 panels does not cause jank or dropped frames at 60fps
  3. Browser window resize does not cause layout thrashing (ResponsiveContainer resize is debounced)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend Data Pipeline | 2/2 | Complete | - |
| 2. SSE Streaming Endpoint | 1/1 | Complete | 2026-03-28 |
| 3. Time Range Controls & Data Source Wiring | 2/2 | Complete |  |
| 4. Synchronized Crosshair | 1/1 | Complete | 2026-03-28 |
| 5. Grafana Dark Panel Design | 0/TBD | Not started | - |
| 6. Data Freshness & UX Polish | 0/TBD | Not started | - |
| 7. Performance Optimization | 0/TBD | Not started | - |
