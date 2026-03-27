# Feature Landscape: Metrics Graph Visualization

**Domain:** K8s operations dashboard — metrics panel redesign
**Researched:** 2026-03-28
**Competitors analyzed:** Grafana 11, Datadog, New Relic, Lens, Google Cloud Monitoring
**Overall confidence:** HIGH (features verified against official documentation)

---

## Table Stakes

Features users expect from any professional metrics visualization. Missing any of these and ops engineers will perceive the tool as "toy-grade" and open Grafana instead.

### Time Range Controls

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Relative quick-select presets (5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 2d, 7d) | Every monitoring tool has these; ops engineers have muscle memory for them | Low | Current implementation has 30s/1m/5m which are broken due to 60s collector. Replace with Grafana-standard set |
| "Last N" button bar (pill/tab style) | Fastest interaction pattern; one click to change range | Low | Already exists but with wrong presets. Straightforward to fix |
| Custom absolute date/time range picker | Ops engineers investigate incidents at specific times ("what happened Tuesday 3-5pm?") | Medium | Calendar picker with time input. Use date-fns or existing shadcn DatePicker |
| Auto-refresh with interval selector | Live monitoring is the default posture for ops teams | Low | Already exists (AutoRefreshToggle component). Keep as-is, wire to SSE for short ranges |
| Last-updated timestamp | Data freshness is critical for trust. Stale data without indication = ops mistakes | Low | Already exists. Enhance with staleness warning (amber if >2 min old) |

### Chart Interactions

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Hover tooltip with all series values | Grafana/Datadog/New Relic all show full-series tooltip on hover. Users expect to see exact values | Low | Already exists (CustomTooltip). Needs refinement: show timestamp, all series values even if 0 |
| Crosshair vertical line on hover | Every professional monitoring tool shows a vertical guide line at the cursor position | Low | Recharts supports `Cursor` prop on Tooltip. Currently missing |
| Synchronized crosshair across panels | THE signature feature of Grafana. Hover one panel, all panels show the same timestamp. Without this, comparing CPU vs Memory requires mental gymnastics | Medium | Recharts `syncId` prop coordinates tooltips across charts sharing the same syncId. Well-supported feature |
| Click-and-drag to zoom (brush selection) | Grafana, Datadog, New Relic all support drag-to-zoom. Essential for incident investigation | Medium | Recharts has `<Brush>` component and `<ReferenceArea>` for selection visualization. Zoomed range updates the time range |
| Responsive axis labels (adaptive time format) | X-axis must show HH:MM for hours, HH:MM:SS for minutes, Mon DD for days | Low | Partially implemented. Needs refinement for new range set |

### Data Representation

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Area chart with gradient fill | Standard for metrics dashboards (Grafana default, Datadog default). Gradient gives visual weight without obscuring data | Low | Already implemented with SVG linear gradients |
| Line + area toggle per metric | Some users prefer clean lines without fill for overlay comparison | Low | Toggle `fillOpacity` between 0 and current gradient |
| Null/gap visualization (discontinuous line) | Ops engineers MUST distinguish "no data collected" from "value is zero". Showing zero when data is missing is a lie that leads to wrong conclusions | Low | Already using `connectNulls={false}`. Needs visual indicator (dashed line or gap marker) |
| Y-axis with proper unit formatting | %, bytes (KB/MB/GB), count — axis labels must match the metric unit | Low | Already implemented (percent/count/bytes Y-axes) |
| Y-axis auto-scale to data range | Axis should fit the actual data, not always show 0-100%. A cluster at 2-5% CPU should not have 95% whitespace | Medium | Currently hardcoded `domain={[0, 100]}` for percent. Add auto-scale with soft min/max like Grafana |

### Legend & Series Control

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Interactive metric toggle buttons | Click to show/hide individual series. Every monitoring tool has this | Low | Already implemented (visibleSeries toggle buttons). Works well |
| Color-coded series indicators | Colored dots/lines next to series names for instant identification | Low | Already implemented |
| Current/latest value display per series | Shows the most recent value next to the series name so you don't have to hover to the rightmost edge | Low | Already implemented (CurrentValueBadge). Keep it |

### Empty/Loading/Error States

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Skeleton loading (panel shape placeholders) | Standard pattern. Spinner is dated; skeleton shows the user what structure is coming | Low | Already implemented with `<Skeleton>` components |
| Error state with retry button | Network failures happen. User needs to know what failed and be able to retry | Low | Already implemented (MetricsEmptyState with onRetry) |
| Empty state (no data yet) | New cluster or range with no data needs a clear message, not a blank chart | Low | Already implemented. Message could be more specific about why (e.g., "Collector has not run yet for this time window") |
| Loading timeout with degraded message | If metrics take >30s, something is wrong. Tell the user | Low | Already implemented (LOADING_TIMEOUT_MS = 30s) |

---

## Differentiators

Features that set Voyager Platform apart from "just another K8s dashboard." Not expected by default, but ops engineers will notice and value them.

### High-Value Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Real-time SSE streaming for short ranges (<=15m) | Bypasses the 60s DB collector gap by streaming directly from K8s metrics-server. Sub-5-second resolution that no static DB query can match. This is the core technical differentiator of the redesign | High | Requires new SSE endpoint, K8s metrics-server polling at 5-15s intervals, client-side ring buffer. Already scoped in PROJECT.md |
| Pause-on-hover for live data | When hovering a tooltip on a live-updating chart, freeze updates so the user can read values. Resume on mouse-out. Grafana does this; most K8s dashboards don't | Medium | Buffer incoming SSE events during hover, apply on resume. State machine: `streaming` -> `paused` -> `streaming` |
| Data freshness indicator with auto-reconnect | Show green/amber/red connection status. If SSE disconnects, show "Reconnecting..." with exponential backoff. User should never see stale data without knowing it | Medium | Integrate with existing SSE infrastructure. Show "Data as of HH:MM:SS" when stale. Auto-retry with visual feedback |
| Threshold lines (horizontal reference) | Show warning/critical levels as horizontal dashed lines (e.g., 80% CPU = warning, 90% = critical). Grafana has this built-in; ops teams rely on it for at-a-glance assessment | Medium | Recharts `<ReferenceLine>` already imported but only used for grid. Add configurable threshold values. Could pull from alert rules |
| Event annotations (vertical markers) | Show deploy events, alert triggers, or K8s events as vertical markers on the timeline. Answers "what changed when the metric spiked?" without leaving the page | High | Requires fetching events/deploys for the time range, rendering as `<ReferenceLine>` or custom SVG markers. Grafana's killer correlation feature |

### Medium-Value Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Zoom-out / reset button | After brushing to zoom in, one-click to return to original range. Double-click to progressively zoom out (Grafana pattern) | Low | Track zoom stack, pop on reset. Simple state management |
| Mini-sparkline in panel header | Tiny sparkline next to the current value showing trend direction at a glance, even before you look at the full chart | Low | Recharts `<Sparkline>` or simple SVG path. Already have `ResourceSparkline.tsx` component |
| Smooth transition animations on range change | Animate chart transitions when switching time ranges (fade/morph). Shows professional polish | Low | Motion v12 `AnimatePresence` wrapper around chart. Must respect reduced-motion. Already have animation infrastructure |
| Per-panel expand to full-width | Click a panel to expand it to full dashboard width for detailed inspection. Grafana's "View" mode | Medium | Toggle single panel to span full grid. CSS transition + state management |
| Keyboard shortcuts for time range | `t+z` for zoom out, `t+l` for last hour, `t+d` for last day. Power users expect keyboard control | Low | Add keyboard event listeners. Grafana shortcuts are the reference |

### Nice-to-Have Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Export chart as PNG/CSV | Download chart image or underlying data. Useful for incident reports and Slack messages | Medium | PNG via html2canvas or dom-to-image. CSV via data serialization. Grafana has both |
| Panel inspect mode (raw data table) | Toggle to see the actual data points behind the chart in a table. Grafana's "Inspect > Data" tab. Useful for debugging metric collection | Medium | Render `normalizedData` in a DataTable component alongside the chart |
| Comparison overlay (time-shift) | Compare current period vs. same period yesterday/last week. "Is this CPU spike normal for this time of day?" | High | Requires fetching two time ranges and overlaying with different opacity. Complex but powerful |
| Click-to-isolate in legend | Click a series name to show ONLY that series, hiding all others. Click again to restore. New Relic does this well | Low | Toggle logic: if clicking an already-solo series, restore all. Otherwise, solo it |
| Log-scale Y-axis option | For metrics with huge dynamic range (e.g., network bytes from 1KB to 10GB). Linear scale crushes small values | Medium | Recharts supports `scale="log"` on YAxis. Need UI toggle and handling of zero values |

---

## Anti-Features

Features to explicitly NOT build. These add complexity without proportional value for a K8s ops dashboard.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Configurable/draggable panel grid (react-grid-layout) | Massive complexity. 4 fixed panels (CPU, Memory, Network, Pods) are the right abstraction for K8s cluster metrics. Users don't need to rearrange them | Keep fixed 2x2 grid. Already decided in PROJECT.md |
| Query editor / PromQL / custom expressions | This is not Grafana. Users should not write queries. The dashboard knows what metrics matter for K8s | Pre-defined metric panels with toggle controls. Zero query syntax |
| Multi-datasource support (Prometheus, InfluxDB, etc.) | Scope explosion. We have one collector writing to PostgreSQL. Supporting external TSDBs is a different product | Keep PostgreSQL + SSE as the only data sources |
| Stacked area charts | Stacking CPU + Memory makes no sense (different units). Stacking multiple nodes would obscure individual contributions | Keep separate panels per metric family. Node breakdown is in the table below |
| Dashboarding framework (create/save/share dashboards) | This is a feature of Grafana, not a K8s ops dashboard. One metrics view per cluster is the right model | Single metrics tab per cluster. Global dashboards route exists for other purposes |
| Alert rule creation from charts | Alert rules are managed in the alerts section, not inline on charts. Mixing concerns creates UX confusion | Show threshold lines from existing alert rules, but editing stays in /alerts |
| WebSocket transport | SSE is simpler, HTTP/2 multiplexed, works through all proxies/load balancers. WebSocket adds complexity for no benefit in a unidirectional metrics stream | Use SSE via existing `voyagerEmitter` pattern |
| Per-pod metrics in charts | Node-level granularity is sufficient for cluster metrics view. Per-pod would create charts with hundreds of series | Keep per-node breakdown in the table. Per-pod belongs in the pods tab |
| Pan (horizontal drag to shift time range) | Rarely used in practice vs. zoom. Adds touch gesture complexity and conflicts with brush selection | Use zoom + preset buttons. Pan is a Grafana power-user feature with low adoption |

---

## Feature Dependencies

```
Time range presets (fixed set) ─────────────────────────────┐
                                                             │
Custom date picker ──────────────────────────────────────────┤
                                                             ▼
                                                   Backend bucketing fix
                                                   (correct interval per range)
                                                             │
                                    ┌────────────────────────┼────────────────┐
                                    ▼                        ▼                ▼
                           Adaptive X-axis           Y-axis auto-scale    Null gap viz
                           formatting               (soft min/max)       (dashed/markers)
                                    │
                                    ▼
                           Synchronized crosshair (syncId) ──────────────┐
                                    │                                     │
                                    ▼                                     ▼
                           Brush zoom-to-select              Pause-on-hover (live mode)
                                    │
                                    ▼
                           Zoom reset button

SSE streaming endpoint ──────────────────────────────────────┐
                                                             │
                                    ┌────────────────────────┤
                                    ▼                        ▼
                           Data freshness          Pause-on-hover
                           indicator               (buffer during hover)
                                    │
                                    ▼
                           Auto-reconnect
                           with backoff

Threshold lines ◄──── Alert rules data (existing alert-evaluator)

Event annotations ◄──── Events/deploys data (existing event-sync job)
```

---

## MVP Recommendation

### Phase 1: Fix the Foundation (must ship first)

Prioritize these — they fix what's broken and establish the professional baseline:

1. **Grafana-standard time range presets** — Replace broken 30s/1m/5m with 5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 2d, 7d
2. **Backend bucketing fix** — Correct bucket intervals aligned to collector frequency per range
3. **Synchronized crosshair** — The single feature that makes 4-panel layout feel integrated, not separate
4. **Adaptive X-axis formatting** — Timestamps that make sense for each range
5. **Y-axis auto-scale** — Stop wasting 95% of chart space when values are low

### Phase 2: Real-Time and Interaction

6. **SSE streaming for short ranges** — The core technical differentiator
7. **Brush zoom-to-select** — Essential for incident investigation
8. **Data freshness indicator** — Trust signal for live data
9. **Custom date/time range picker** — Incident investigation requires arbitrary windows
10. **Null gap visualization** — Distinguish missing data from zero

### Phase 3: Professional Polish

11. **Threshold lines** — At-a-glance severity assessment
12. **Pause-on-hover** — Live data UX refinement
13. **Panel expand to full-width** — Detailed inspection mode
14. **Event annotations** — Correlation is the ultimate ops workflow
15. **Smooth range-change animations** — Professional polish

### Defer Indefinitely

- **Export PNG/CSV** — Low usage, high complexity for image export
- **Comparison overlay (time-shift)** — Powerful but complex; revisit after v1
- **Log-scale Y-axis** — Edge case for most K8s metrics
- **Panel inspect (raw data table)** — Developer feature, not ops priority

---

## Sources

### Official Documentation (HIGH confidence)
- [Grafana Time Series Panel](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/visualizations/time-series/) — Tooltip, legend, axis, threshold, draw style options
- [Grafana Dashboard Controls](https://grafana.com/docs/grafana/latest/dashboards/use-dashboards/) — Time range, zoom, pan, refresh, keyboard shortcuts
- [Grafana Panel Inspector](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/panel-inspector/) — Data/stats/query/JSON inspection tabs
- [Grafana Threshold Configuration](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/configure-thresholds/) — Absolute, percentage, line/region display modes
- [Grafana Annotations](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/annotate-visualizations/) — Event markers, deploy annotations
- [Grafana Configurable Quick Ranges](https://grafana.com/whats-new/2025-06-17-server-configurable-quick-time-ranges-for-dashboards/) — Custom time picker presets
- [Grafana Time Range Controls (AWS)](https://docs.aws.amazon.com/grafana/latest/userguide/dashboard-time-range-controls.html) — Relative, absolute, semi-relative ranges
- [Datadog Timeseries Widget](https://docs.datadoghq.com/dashboards/widgets/timeseries/) — Display types, overlays, markers
- [Datadog Metrics Explorer](https://docs.datadoghq.com/metrics/explorer/) — NLQ, rollup, aggregation
- [New Relic Chart Features](https://docs.newrelic.com/docs/query-your-data/explore-query-data/use-charts/use-your-charts/) — Tooltip, legend, export, fullscreen
- [New Relic Dashboard Management](https://docs.newrelic.com/docs/query-your-data/explore-query-data/dashboards/manage-your-dashboard/) — Time picker, correlated crosshair

### Recharts (HIGH confidence — constraint: must use)
- [Recharts Sync/Crosshair Issue #107](https://github.com/recharts/recharts/issues/107) — syncId for coordinated tooltips across charts
- [Recharts Tooltip System (DeepWiki)](https://deepwiki.com/recharts/recharts/5.2-tooltip-system) — Tooltip architecture, synchronization state

### UX Patterns (MEDIUM confidence)
- [Smashing Magazine: UX Strategies for Real-Time Dashboards](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/) — Live data updates, freshness indicators, pause/resume, skeleton loading, animation guidelines
- [Raw Studio: UX Rules for Real-Time Performance Dashboards](https://raw.studio/blog/ux-rules-for-real-time-performance-dashboards/) — Cognitive load management, visual hierarchy

### Kubernetes Monitoring Landscape (MEDIUM confidence)
- [Red Hat: Modern K8s Monitoring](https://developers.redhat.com/articles/2025/12/17/modern-kubernetes-monitoring-metrics-tools-and-aiops) — Metrics, tools, AIOps trends
- [Dash0: Ultimate Guide to K8s Monitoring Tools 2025](https://www.dash0.com/faq/the-ultimate-guide-to-kubernetes-monitoring-tools-in-2025) — Tool comparison, feature expectations
- [Lens Kubernetes IDE](https://k8slens.dev/) — K8s-specific dashboard with built-in metrics
