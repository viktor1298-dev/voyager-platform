# Project Research Summary

**Project:** Metrics Graph Redesign
**Domain:** Real-time + historical K8s metrics visualization (SSE streaming, Recharts, TimescaleDB)
**Researched:** 2026-03-28
**Confidence:** HIGH

## Executive Summary

This project is a professional-grade metrics dashboard redesign — replacing a broken chart implementation with one that behaves like Grafana (synchronized crosshair, Grafana-standard time ranges, real-time streaming for short windows). The core insight from research is that the existing codebase already has every necessary piece: Recharts v3 with `syncId`, tRPC v11 SSE subscriptions, `voyagerEmitter`, TimescaleDB, and a working 60s metrics collector. Nothing needs to be added or replaced for Phases 1-3. The redesign is about wiring existing components correctly and fixing a set of identified bugs in the current implementation.

The recommended approach is a 4-phase build that strictly respects backend-first ordering. Phase 1 fixes the data foundation: broken sub-minute bucket configs (the root cause of empty charts), missing TimescaleDB `time_bucket()` SQL aggregation, and the new SSE streaming job for live short-range data. Without this, every frontend change is built on broken data. Phase 2 adds client data plumbing (hooks, circular buffer, data source switching) with no visible UI changes yet — this order allows the data layer to be tested independently before touching the visual layer. Phase 3 wires everything into the visible chart redesign (synchronized crosshair, adaptive formatting, Y-axis auto-scale). Phase 4 delivers professional polish (threshold lines, brush zoom, event annotations, custom date picker).

The primary risks are all well-understood and preventable with known fixes. The biggest is Recharts performance: `key` prop including `data.length` (already in production at `MetricsAreaChart.tsx:296`) causes full SVG remounts on every SSE data point, and `syncId` alone creates a 4x render cascade on mouse move (240 re-renders/second at 60fps). Both have concrete fixes detailed in the architecture research. The second risk is SSE data leaks — tab visibility handling and circular buffer bounds enforcement must be built into Phase 1 from day one, not retrofitted. The third is bucket alignment drift, which must be solved before any visualization work begins by returning `serverTime` + `intervalMs` in history responses.

## Key Findings

### Recommended Stack

No new dependencies are needed for Phases 1-3. The installed stack handles everything: Recharts v3.7 `syncId` for crosshair sync, Zustand 5 for shared hover state, tRPC v11 SSE for live data consumption, existing `voyagerEmitter` for server-side event bus, and TimescaleDB `time_bucket()` (already running in the PG17 image) for server-side bucketing. Phase 4 adds only `react-day-picker@^9` for the custom absolute date range picker, and only when that feature is built.

**Core technologies:**
- **Recharts v3.7 `syncId`**: Synchronized tooltip/crosshair across 4 panels — built-in feature, zero custom sync state needed for the chart-to-chart case
- **Zustand crosshair store**: Shares active timestamp with non-chart UI (panel header, node table) — extend existing metrics-preferences store
- **TimescaleDB `time_bucket()`**: Server-side aggregation replacing in-memory JS bucketing — 10x less memory, eliminates heap pressure for 7d ranges
- **Fastify SSE route** (pattern from `ai-stream.ts`): New `GET /api/metrics/stream?clusterId=` endpoint following existing conventions — NOT tRPC subscription (tRPC v11 defaults to WebSocket; SSE is correct for unidirectional metrics push)
- **Custom LTTB downsampling** (~50 LOC inline): Client-side downsampling guard for future high-density ranges — not urgently needed at 20-60 points per range, but must be built into the data layer before high-granularity ranges are added
- **React-day-picker v9**: Calendar for custom absolute range picker — Phase 4 only; shadcn/ui `Calendar` already wraps it

**Stack constraints enforced by PROJECT.md:**
- Must keep Recharts (no ECharts, uPlot, Highcharts)
- Must use existing `voyagerEmitter` pattern (no WebSocket)
- No `httpBatchLink` (existing codebase rule)

### Expected Features

Research compared against Grafana 11, Datadog, New Relic, and Lens. The feature gap between the current implementation and the professional monitoring tool baseline is well-defined.

**Must have (table stakes — ops engineers will open Grafana instead if missing):**
- Grafana-standard time range presets: 5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 2d, 7d (current: broken 30s/1m/5m)
- Synchronized crosshair: hover one panel, all 4 show the same timestamp
- Adaptive X-axis labels: HH:MM for hours, HH:MM:SS for minutes, Mon DD for days
- Y-axis auto-scale: stop wasting 95% of chart space when cluster CPU is at 2-5%
- Null/gap visualization: distinguish "no data collected" from "value is zero"
- Hover tooltip showing all series values at the hovered timestamp

**Should have (differentiators that make Voyager better than generic K8s dashboards):**
- SSE real-time streaming for 5m/15m ranges — bypasses the 60s collector gap, delivers sub-5s resolution that no DB query can match
- Brush zoom-to-select for incident investigation
- Data freshness indicator with connection state (streaming/reconnecting/stale)
- Pause-on-hover for live data (freeze chart updates while reading values)
- Threshold lines from existing alert rules (horizontal reference lines at warning/critical levels)
- Custom absolute date/time picker for "what happened Tuesday 3-5pm?"

**Defer (v2+):**
- Event annotations (vertical markers for deploys/alerts) — high complexity, requires event correlation; listed here as Phase 4+ or v2
- Export PNG/CSV — low usage relative to implementation cost
- Comparison overlay / time-shift — powerful but adds significant state complexity
- Log-scale Y-axis — edge case for K8s metrics

**Anti-features (explicitly excluded):**
- Draggable panel grid — 4 fixed panels is the correct abstraction for K8s cluster metrics
- Query editor / PromQL — this is not Grafana
- WebSocket transport — SSE is sufficient for unidirectional metrics push
- Per-pod metrics in the 4-panel layout — belongs in the pods tab

### Architecture Approach

The architecture is a dual data source system: short ranges (5m, 15m) use SSE from a new `MetricsStreamJob` polling K8s metrics-server at 15s intervals; all other ranges use the existing `metrics.history` tRPC procedure backed by TimescaleDB `time_bucket()` queries. The key abstraction is a single `useMetricsData` hook that returns unified `{ data, isLoading, isLive, connectionState, lastUpdated }` regardless of source. The crosshair synchronization uses Recharts built-in `syncId` for chart-to-chart sync and a `CrosshairProvider` React context only for non-chart UI elements (shared timestamp header, node table row highlighting).

**Major components:**

1. **MetricsStreamJob** (`api/src/jobs/metrics-stream.ts`, new) — Polls K8s metrics-server every 15s for SSE-subscribed clusters only. Reference-counted: starts polling on first subscriber, stops on last disconnect. Emits via `voyagerEmitter` on channel `metrics-stream:${clusterId}`.

2. **MetricsSSERoute** (`api/src/routes/metrics-stream.ts`, new) — Fastify SSE endpoint following `ai-stream.ts` pattern. Handles auth (session cookie validation), 30s heartbeat (existing `SSE_HEARTBEAT_INTERVAL_MS`), backpressure (max 50 buffered events per connection), per-cluster reference counting.

3. **useMetricsData** (`web/src/hooks/useMetricsData.ts`, new) — Orchestrates data source switching by range. Internal `useMetricsSSE` manages EventSource lifecycle, circular buffer, page visibility pause/resume, graceful degradation to polling after 3 failed SSE reconnects.

4. **MetricsBuffer** (`web/src/lib/metrics-buffer.ts`, new) — Circular buffer with time-based eviction. Caps at 65 points (15m range) or 25 points (5m range). Clears on tab return from background to avoid burst-rendering stale data.

5. **MetricsAreaChart** (modified) — Remove `data.length` from `key` prop. Add `syncId="metrics-panel"` and dashed cursor line. Add `debounce={100}` on `ResponsiveContainer`. Add `animationDuration={0}`.

6. **TimeRangeSelector** (modified) — Replace broken presets with Grafana-standard set. Add two-panel popover (quick ranges left, custom calendar right). Update Zustand metrics-preferences store with migration for new range values.

**Data flow:**
- Live: K8s metrics-server → MetricsStreamJob (15s) → voyagerEmitter → MetricsSSERoute → EventSource → MetricsBuffer → useMetricsData → MetricsAreaChart
- Historical: PostgreSQL metrics_history → `time_bucket()` SQL → tRPC `metrics.history` → useMetricsData → MetricsAreaChart

### Critical Pitfalls

1. **Recharts key prop includes `data.length`** (already in `MetricsAreaChart.tsx:296`) — causes full SVG remount and chart flicker on every SSE data point. Fix in Phase 1: remove `data.length`, use only `${range}-${activeMetrics.join('-')}` as the key.

2. **`syncId` creates 4x render cascade on mouse move** — every mouse event on any chart fires re-renders in all 4 synchronized charts. At 60fps that is 240 re-renders/second. Mitigation in Phase 2: single `onMouseMove` on the container div (not per-chart), throttled to `requestAnimationFrame`, custom tooltip memoized with `React.memo` and primitive props.

3. **SSE connection leak and stale data accumulation** — navigating away without closing EventSource leaves server streaming to dead connections; background tabs accumulate stale SSE data and burst-render on tab return. Fix in Phase 1: `document.visibilitychange` listener (close on hide, clear buffer + reconnect on show), correct `useEffect` cleanup, heartbeat-based auto-reconnect with circuit breaker.

4. **Bucket alignment drift** — `now` varies per request; two requests straddling an interval boundary return shifted timelines, causing X-axis label jumps on refetch. Fix in Phase 1: return `serverTime` + `intervalMs` in all `metrics.history` responses.

5. **Existing broken time range config** — current config has 30s/1m/5m ranges with bucket intervals below the 60s collector frequency; these buckets are always empty. This is the root cause of empty charts. Fix in Phase 1 before any other work.

## Implications for Roadmap

All 4 research files converge on the same phase structure. The ordering is driven by a hard dependency chain: you cannot visualize data you do not have, and you cannot build client data hooks without a working backend endpoint.

### Phase 1: Backend Foundation + Data Pipeline Fix

**Rationale:** The current metrics router has broken time range configs and does in-memory JS bucketing instead of `time_bucket()` SQL. SSE streaming needs a new job and route. None of the frontend work is meaningful until data from the backend is correct. This phase also fixes the two existing code bugs that will cause SSE to break on day one (key prop remount, missing `animationDuration`).

**Delivers:** Working backend for all 10 time ranges with correct bucket configs, TimescaleDB `time_bucket()` aggregation for historical ranges, new `MetricsStreamJob` + `MetricsSSERoute` for live 5m/15m ranges, `serverTime`/`intervalMs` in history responses, LTTB downsampling utility, 24h axis time formatting, fixed `key` prop and `animationDuration`.

**Addresses (FEATURES.md):** Grafana-standard time range presets, correct data density per range, live data infrastructure for short ranges.

**Avoids (PITFALLS.md):** Pitfall 4 (bucket drift), Pitfall 5 (broken range config), Pitfall 1 (key prop remount), Pitfall 12 (locale-dependent labels).

### Phase 2: Client Data Layer (No Visual Changes)

**Rationale:** The `useMetricsData` hook and `MetricsBuffer` must exist before wiring them to charts. Building and testing the data plumbing independently (verify via console.log) before touching the visual layer catches data bugs before they manifest as chart rendering bugs — the same approach used throughout this codebase.

**Delivers:** `MetricsBuffer` class (circular, time-based eviction), `useMetricsSSE` hook (EventSource lifecycle, ring buffer, page visibility, reconnect logic, polling fallback after 3 failures, circuit breaker for `SSE_MAX_RECONNECT_ATTEMPTS`), `useMetricsData` hook (unified output, range-driven source switching), updated `TimeRangeSelector` with Grafana presets and localStorage migration, `debounce={100}` on `ResponsiveContainer`.

**Addresses (FEATURES.md):** SSE streaming client plumbing, data freshness state, connection state tracking, custom range support scaffolding.

**Avoids (PITFALLS.md):** Pitfall 3 (SSE connection leak + stale data), Pitfall 7 (ResponsiveContainer resize thrashing), Pitfall 8 (SSE-to-DB transition gap — handled by `lastCollectedAt` in responses).

### Phase 3: Synchronized Visualization Redesign

**Rationale:** With correct data from Phase 1 and clean hooks from Phase 2, this phase delivers the full visual redesign. All the "Grafana-like" features become possible only now.

**Delivers:** All 4 `MetricsAreaChart` panels with `syncId="metrics-panel"`, dashed vertical crosshair cursor, `CrosshairProvider` context for non-chart UI (shared timestamp header, node table row highlight), redesigned multi-series tooltip (timestamp, color-coded values, bucket window), adaptive X-axis time formatting per range, Y-axis soft min/max auto-scale, null gap visual distinction, container-level mouse handler with `requestAnimationFrame` throttle, `React.memo` tooltip.

**Addresses (FEATURES.md):** Synchronized crosshair (the defining feature), adaptive axis labels, Y-axis auto-scale, null gap visualization, all remaining table-stakes chart interactions.

**Avoids (PITFALLS.md):** Pitfall 2 (syncId render cascade), Pitfall 10 (dark mode gradient opacity via CSS custom properties).

**Implements (ARCHITECTURE.md):** CrosshairProvider, MetricsAreaChart modifications, full data hook wiring.

### Phase 4: Polish + Advanced Interactions

**Rationale:** Brush zoom, threshold lines, data freshness badge, and custom date picker are differentiators — not table stakes. Ship Phase 3 first, validate that the core redesign works, then add polish that compounds on a stable foundation.

**Delivers:** Brush zoom-to-select with zoom reset button, data freshness indicator (green/amber/red connection state badge, "Reconnecting..." state), pause-on-hover for live data (SSE buffer freeze during hover), threshold reference lines pulled from existing alert rules, custom absolute date/time picker (adds `react-day-picker@^9`), UTC/local time toggle in Zustand metrics-preferences store, accessibility improvements (sr-only data table per panel, `aria-describedby` summaries).

**Addresses (FEATURES.md):** Brush zoom (incident investigation), freshness indicator (data trust signal), pause-on-hover (live data UX), threshold lines (at-a-glance severity), custom date range.

**Avoids (PITFALLS.md):** Pitfall 5 (timezone display inconsistency), Pitfall 11 (chart accessibility).

### Phase Ordering Rationale

- **Data before UI** is non-negotiable: broken backend data means frontend rework after the fact. All 4 research files independently arrive at this ordering — ARCHITECTURE.md explicitly documents it as the "Suggested Build Order."
- **Backend before client hooks** (Phase 1 before Phase 2): `useMetricsSSE` requires the SSE endpoint to exist and `useMetricsData` requires correct time range configs to switch on.
- **Hooks before charts** (Phase 2 before Phase 3): Chart refactor is only meaningful when data flows correctly — otherwise you cannot distinguish a chart bug from a data bug.
- **Core before polish** (Phase 3 before Phase 4): Brush zoom and threshold lines require stable chart rendering as the substrate.

### Research Flags

**Phases with standard well-documented patterns (no additional research needed):**
- **Phase 1:** TimescaleDB `time_bucket()` is thoroughly documented with exact SQL patterns provided in ARCHITECTURE.md. Fastify SSE route has a direct in-codebase template (`ai-stream.ts`). All patterns are clear.
- **Phase 2:** EventSource API and circular buffer patterns are standard. ARCHITECTURE.md provides full implementation code for `MetricsBuffer` and the data source switching hook.
- **Phase 3:** Recharts `syncId` + custom cursor pattern verified against official v3 API docs. Anti-patterns are enumerated with concrete fixes.

**Phases that may benefit from a targeted spike before planning:**
- **Phase 4 (brush zoom):** Recharts `<Brush>` + `<ReferenceArea>` for click-and-drag zoom has known quirks in v3. Recommend a 1-2 hour implementation spike before writing the phase plan.
- **Phase 4 (react-day-picker v9):** v9 has breaking changes from v8 and Tailwind 4 compatibility needs verification. Check whether the existing shadcn/ui `Calendar` component is already on v9 before adding the dependency.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies for Phases 1-3. All recommendations verified against official Recharts v3 API docs, TimescaleDB docs, and the existing codebase. |
| Features | HIGH | Verified against Grafana 11, Datadog, and New Relic official documentation. Table stakes list is definitive for ops engineering audiences. |
| Architecture | HIGH | Primary source is the existing codebase itself (`ai-stream.ts`, `event-emitter.ts`, `metrics-history-collector.ts`). SSE and syncId patterns confirmed against official sources. Full implementation code provided in ARCHITECTURE.md. |
| Pitfalls | HIGH | 5 of 12 pitfalls are existing bugs in the current codebase confirmed with file/line numbers. Recharts issues sourced from official GitHub issues with high engagement. |

**Overall confidence:** HIGH

### Gaps to Address

- **Custom tooltip cursor prop edge cases:** MEDIUM confidence that `cursor={<CustomComponent />}` reliably receives `x`, `y`, `height` props in Recharts v3. The standard object form `cursor={{ stroke: '...' }}` is HIGH confidence and should be the fallback. Validate during Phase 3.

- **react-day-picker v9 + Tailwind 4 compatibility:** Only needed for Phase 4. MEDIUM confidence due to v9 breaking changes. The existing shadcn/ui `Calendar` component may already be on v9 — check before adding the dependency.

- **MetricsStreamJob at scale:** Architecture is designed for 5-10 clusters. At 50+ clusters viewing metrics simultaneously, per-cluster 15s K8s API polling becomes significant. Not a current concern but should be noted as a future optimization point in Phase 1 implementation comments.

- **`SSE_MAX_RECONNECT_ATTEMPTS = 0` (infinite) in existing config:** Must be changed to a circuit breaker (e.g., 20 attempts with exponential backoff then fallback to polling). Address in Phase 2.

- **Metrics-preferences Zustand store migration:** Current store persists `range` to localStorage. Adding new range values (15m, 30m, 3h, etc.) requires migration logic for users who have an old persisted value. Address in Phase 2 when updating `TimeRangeSelector`.

## Sources

### Primary (HIGH confidence)
- Recharts v3.7 official API docs — LineChart syncId, Tooltip cursor, ResponsiveContainer debounce, AreaChart isAnimationActive
- TimescaleDB `time_bucket()` official documentation
- Existing codebase: `ai-stream.ts`, `event-emitter.ts`, `MetricsAreaChart.tsx`, `metrics.ts` router, `useSSEConnection.ts`, `sse.ts` config, `metrics-history-collector.ts`
- Grafana 11 official docs — time series panel, threshold config, annotations, time range controls, keyboard shortcuts
- Datadog timeseries widget official docs
- New Relic chart features official docs
- Recharts GitHub issues: #107 (syncId), #1820 (tooltip throttle), #1356 (LTTB), #945 (animation delay)

### Secondary (MEDIUM confidence)
- Recharts tooltip system internals (DeepWiki)
- Fastify SSE patterns (fastify-sse-v2, Fastify issue #1877)
- Smashing Magazine: UX strategies for real-time dashboards (2025)
- Raw Studio: UX rules for real-time performance dashboards
- SSE vs WebSocket performance comparison (2025/2026 sources)
- Grafana real-time vs historical architecture (Golioth blog)
- TimescaleDB downsampling guide (OneUptime blog, 2026)

### Tertiary (LOW confidence — needs validation during implementation)
- react-day-picker v9 + Tailwind 4 compatibility
- Recharts custom cursor component prop passing reliability in v3

---
*Research completed: 2026-03-28*
*Ready for roadmap: yes*
