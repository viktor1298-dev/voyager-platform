# Metrics Graph Redesign

## What This Is

A full-stack redesign of the voyager-platform metrics visualization system — replacing broken time range logic and basic Recharts panels with Grafana-quality, real-time metrics graphs. The metrics tab (`/clusters/[id]/metrics`) is the primary monitoring surface for K8s ops teams managing multi-cloud clusters.

## Core Value

Every time range the user selects must show correct, populated data with Grafana-grade visualization quality — short ranges show real-time K8s metrics via SSE, historical ranges show properly bucketed DB data.

## Requirements

### Validated

- ✓ Metrics collector gathers CPU, Memory, Network I/O, Pods from K8s metrics-server every 60s — existing
- ✓ Per-cluster and per-node metrics stored in PostgreSQL (metrics_history, node_metrics_history) — existing
- ✓ 4-panel layout (CPU, Memory, Network, Pods) with area charts — existing
- ✓ Auto-refresh toggle with configurable intervals — existing
- ✓ Metric series toggle buttons (show/hide individual metrics) — existing
- ✓ Per-node metrics table and live breakdown — existing
- ✓ Zustand store persists metrics preferences to localStorage — existing

### Active

- [ ] Live K8s polling via SSE for short time ranges (≤15m) — bypass DB, real 5-15s resolution
- [ ] Grafana-standard time range selector: 5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 2d, 7d + custom picker
- [ ] Fixed backend bucketing — correct interval/range alignment for all time ranges
- [ ] Grafana-inspired dark panel design — crisp grid, compact density, professional typography
- [ ] Synchronized crosshair across all 4 panels — hover one, all show same timestamp
- [ ] Proper X-axis timeline formatting per range (seconds → hours → days)
- [ ] Custom tooltip with bucket window, precise values, and color-coded series
- [ ] Data gap visualization — clearly show missing data vs zero values
- [ ] Custom date/time range picker for arbitrary windows

### Out of Scope

- Configurable/draggable panel layout (react-grid-layout) — keep fixed 2x2 grid, not needed for v1
- Prometheus/Grafana data source integration — we use our own collector, not external TSDB
- Alerting thresholds on charts — handled by separate alert-evaluator job
- Multi-cluster aggregated metrics view — separate concern (aggregatedMetrics route exists)
- Per-pod metrics breakdown — node-level is sufficient granularity

## Context

### Current State (Broken)

The metrics collector writes DB rows every 60 seconds. The current time range selector offers 30s, 1m, 5m, 1h, 6h, 24h, 7d — but short ranges (30s/1m/5m) create sub-minute buckets that can never have data because the collector fires at 60s intervals. This is the root cause of empty graphs. Historical ranges (24h/7d) also fail when insufficient data has accumulated.

### Existing Infrastructure

- **SSE:** `voyagerEmitter` EventEmitter already decouples K8s watchers from SSE consumers. Adding a metrics SSE stream is straightforward.
- **Charts:** Recharts with CSS variable-based theming (`--color-chart-cpu`, `--color-chart-mem`, etc.)
- **Backend:** tRPC `metrics.history` procedure with Grafana-style bucket logic (getBucketTimeline, alignFloor, buildSeries)
- **State:** Zustand `metrics-preferences` store persists range/refresh/interval to localStorage
- **Design system:** B-style "Confident & Expressive" animations defined in `docs/DESIGN.md`

### Design Direction

Grafana-inspired dark panels: dark card backgrounds, subtle grid lines, crisp mono-spaced axis labels, crosshair cursor with synchronized tooltip, compact information density. Reference: Grafana 11 panel design, Datadog metric explorer.

## Constraints

- **Tech stack**: Must use existing Recharts (already installed) — no switching to D3/Visx/ECharts
- **Design system**: Must follow `docs/DESIGN.md` B-style animation standards
- **SSE infra**: Must integrate with existing `voyagerEmitter` pattern, not add WebSocket
- **DB schema**: metrics_history and node_metrics_history tables stay as-is — no schema migration
- **Collector interval**: 60s collection frequency stays — SSE bridges the gap for short ranges

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SSE for short ranges, DB for historical | Collector at 60s can't serve sub-minute data; SSE from K8s metrics-server gives real-time | — Pending |
| Grafana-standard time ranges | Industry standard set that matches data availability at each tier | — Pending |
| Keep 4 fixed panels | Simpler than configurable grid, covers all metric families | — Pending |
| Synchronized crosshair | #1 UX feature that differentiates professional monitoring tools | — Pending |
| Keep Recharts | Already installed, team familiar, adequate for this scope | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-28 after initialization*
