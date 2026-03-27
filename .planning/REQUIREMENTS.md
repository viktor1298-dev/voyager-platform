# Requirements: Metrics Graph Redesign

**Defined:** 2026-03-28
**Core Value:** Every time range shows correct, populated data with Grafana-grade visualization quality

## v1 Requirements

### Backend Data Pipeline

- [ ] **PIPE-01**: Backend returns correct bucket-aligned data for all Grafana-standard time ranges (5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 2d, 7d)
- [ ] **PIPE-02**: Server-side aggregation uses TimescaleDB `time_bucket()` SQL instead of in-memory JS bucketing
- [ ] **PIPE-03**: Backend returns `serverTime` and `intervalMs` in response so client can align timeline correctly
- [ ] **PIPE-04**: LTTB downsampling implemented for ranges producing 500+ data points (inlined ~50 LOC, no external dep)
- [ ] **PIPE-05**: Backend validates time range input against new Grafana-standard set (removes old 30s/1m ranges)

### SSE Real-Time Streaming

- [ ] **SSE-01**: Dedicated Fastify SSE endpoint streams live K8s metrics for short ranges (<=15m) at 10-15s resolution
- [ ] **SSE-02**: MetricsStreamJob polls K8s metrics-server only for clusters with active SSE subscribers (reference-counted)
- [ ] **SSE-03**: SSE connection auto-reconnects with exponential backoff on disconnect
- [ ] **SSE-04**: Visibility-aware SSE lifecycle -- pauses streaming when browser tab is hidden, resumes on focus
- [ ] **SSE-05**: Client-side circular buffer (max 65 points) manages live data with time-based eviction

### Time Range Controls

- [ ] **TIME-01**: Time range selector offers Grafana-standard presets: 5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 2d, 7d
- [ ] **TIME-02**: Custom absolute date/time range picker (from/to datetime) for arbitrary windows
- [ ] **TIME-03**: Selected time range persisted in Zustand store (localStorage) across page navigations
- [ ] **TIME-04**: Data source switches automatically -- SSE for <=15m, DB for >=30m -- seamless to user

### Synchronized Visualization

- [ ] **VIZ-01**: 4 panels (CPU, Memory, Network, Pods) display synchronized crosshair -- hover one, all show same timestamp
- [ ] **VIZ-02**: Custom crosshair cursor renders as vertical line across full chart height with timestamp label
- [ ] **VIZ-03**: Brush zoom -- user can drag-to-select a time region to zoom into that range
- [ ] **VIZ-04**: Threshold reference lines on CPU/Memory panels (85% critical red, 65% warning yellow)
- [ ] **VIZ-05**: Panel fullscreen expand -- click to expand any panel to full-width detail view

### Grafana-Style Visual Design

- [ ] **STYLE-01**: Dark panel backgrounds with subtle grid lines, crisp mono-spaced axis labels, compact density
- [ ] **STYLE-02**: Interactive legend -- click series name to isolate/toggle visibility, hover to highlight
- [ ] **STYLE-03**: Y-axis auto-scale based on actual data range (not fixed 0-100% for all panels)
- [ ] **STYLE-04**: Range-adaptive X-axis formatting (HH:MM:SS for minutes, HH:MM for hours, Mon Day for days)
- [ ] **STYLE-05**: Grafana-style tooltip with bucket window, precise values, color-coded series indicators

### Data Freshness & UX

- [ ] **UX-01**: Data freshness badge shows 'Live' / '2m ago' / 'Stale' with color coding
- [ ] **UX-02**: Pause-on-hover -- auto-refresh freezes while user inspects tooltip, resumes on mouse leave
- [ ] **UX-03**: Loading states use skeleton shimmer per panel (not full-page spinner)
- [ ] **UX-04**: Empty/error states show actionable messages with retry button per panel
- [ ] **UX-05**: Fix MetricsAreaChart key-prop remount bug (remove `data.length` from key)

### Performance

- [ ] **PERF-01**: Charts handle 1000+ data points without jank (LTTB downsamples to ~200 visual points)
- [ ] **PERF-02**: Crosshair synchronization throttled to prevent render cascades across 4 panels
- [ ] **PERF-03**: ResponsiveContainer resize debounced to prevent layout thrashing

## v2 Requirements

### Advanced Interactions

- **ADV-01**: Relative text input for time ranges (e.g., 'now-2h' Grafana-style)
- **ADV-02**: URL-synced time range for shareable dashboard links
- **ADV-03**: Event annotations on chart timeline (from event-sync job data)
- **ADV-04**: Per-panel time range override (independent of global range)
- **ADV-05**: Chart data export (CSV/PNG)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Configurable/draggable panel layout | Fixed 2x2 grid sufficient; react-grid-layout complexity not justified |
| Prometheus/Grafana data source integration | Own collector, not external TSDB |
| Query editor (PromQL-like) | Not a general-purpose monitoring tool |
| WebSocket transport | SSE sufficient and consistent with existing infra |
| Per-pod metrics breakdown | Node-level granularity sufficient |
| Multi-datasource support | Single K8s metrics-server source per cluster |
| Stacked area charts | Misleading for independent metrics (CPU vs Memory) |
| Dashboard framework | This is a single metrics tab, not a dashboard builder |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-01 | Phase 1 | Pending |
| PIPE-02 | Phase 1 | Pending |
| PIPE-03 | Phase 1 | Pending |
| PIPE-04 | Phase 7 | Pending |
| PIPE-05 | Phase 1 | Pending |
| SSE-01 | Phase 2 | Pending |
| SSE-02 | Phase 2 | Pending |
| SSE-03 | Phase 3 | Pending |
| SSE-04 | Phase 3 | Pending |
| SSE-05 | Phase 3 | Pending |
| TIME-01 | Phase 3 | Pending |
| TIME-02 | Phase 3 | Pending |
| TIME-03 | Phase 3 | Pending |
| TIME-04 | Phase 3 | Pending |
| VIZ-01 | Phase 4 | Pending |
| VIZ-02 | Phase 4 | Pending |
| VIZ-03 | Phase 4 | Pending |
| VIZ-04 | Phase 4 | Pending |
| VIZ-05 | Phase 4 | Pending |
| STYLE-01 | Phase 5 | Pending |
| STYLE-02 | Phase 5 | Pending |
| STYLE-03 | Phase 5 | Pending |
| STYLE-04 | Phase 5 | Pending |
| STYLE-05 | Phase 5 | Pending |
| UX-01 | Phase 6 | Pending |
| UX-02 | Phase 6 | Pending |
| UX-03 | Phase 6 | Pending |
| UX-04 | Phase 6 | Pending |
| UX-05 | Phase 6 | Pending |
| PERF-01 | Phase 7 | Pending |
| PERF-02 | Phase 7 | Pending |
| PERF-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-03-28*
*Last updated: 2026-03-28 after roadmap creation*
