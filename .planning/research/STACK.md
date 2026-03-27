# Technology Stack

**Project:** Metrics Graph Redesign
**Researched:** 2026-03-28

## Recommended Stack

### Core Chart Library (Keep Existing)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Recharts | ^3.7.0 (installed) | All chart rendering | Already installed, v3 has rewritten state management enabling syncId/crosshair, team familiar with it, adequate for 4-panel metrics layout. No reason to switch. |

**Recharts v3 capabilities that matter for this project:**
- `syncId` prop synchronizes Tooltip + Brush across charts sharing the same ID (HIGH confidence -- documented in official API)
- `syncMethod="index"` works when all charts share identical data arrays (our case -- all 4 panels use the same bucketed timeline)
- Tooltip `cursor` prop accepts a custom React SVG element for vertical crosshair line rendering
- `onMouseMove` / `onMouseLeave` chart events expose coordinate data for crosshair state
- Animations disabled per-area (`isAnimationActive={false}`) already in use -- correct for real-time data

### Crosshair Synchronization (Custom -- No Library Needed)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Recharts `syncId` | Built-in (v3) | Tooltip sync across 4 panels | Native feature. All charts with `syncId="metrics"` auto-sync tooltip position |
| Zustand crosshair store | Existing (5.0.11) | Shared hover state for crosshair line | Lightweight, already used for metrics preferences. Store holds `{ activeTimestamp, activeIndex, chartCoords }` |
| Custom `<CrosshairCursor>` SVG | N/A | Vertical line at hover point | Recharts Tooltip `cursor` prop accepts `ReactNode`. Render a `<line>` SVG element from chart top to bottom at the active X position |

**Implementation pattern (HIGH confidence):**
```tsx
// All 4 panels share the same syncId
<AreaChart syncId="metrics-panels" data={chartData}>
  <Tooltip
    content={<MetricsTooltip />}
    cursor={<CrosshairLine />}  // Custom SVG vertical line
  />
</AreaChart>
```

The `syncId` handles 90% of the work. Recharts propagates the active tooltip index across all charts with the same `syncId`. The custom cursor component receives `{ x, y, width, height, payload }` props and draws a vertical `<line>` at the `x` coordinate.

**What NOT to use:** Do NOT add external charting libraries (ECharts, Highcharts, D3 directly) for crosshair functionality. Recharts' syncId + custom cursor is sufficient and avoids bundle bloat and dual-rendering.

### Time Range Picker

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Custom component (Radix Popover + buttons) | N/A | Grafana-style relative time selector | The relative picker is just styled buttons (5m, 15m, 30m, 1h, etc.) -- no library needed. Already have a simpler version in `TimeRangeSelector.tsx` |
| `react-day-picker` | ^9.x | Calendar for absolute/custom date range | Required only for the "Custom" option in the time picker. shadcn/ui Calendar is built on react-day-picker. Install when implementing custom range (Phase 2+) |
| `@radix-ui/react-popover` | ^1.x | Dropdown panel for time picker | Already using Radix primitives. Popover hosts both the quick-select buttons and the calendar |

**Architecture decision:** Build the time range picker as a **two-panel popover**:
- **Left panel:** Quick relative ranges (5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 2d, 7d) as button grid
- **Right panel:** "Custom" mode with react-day-picker calendar + time inputs for absolute from/to
- **Top bar:** Shows current selection in human-readable format ("Last 1 hour", or "Mar 25 14:00 -- Mar 26 14:00")

**What NOT to use:**
- Do NOT use `date-fns` or `dayjs` as standalone deps. The relative time calculations (subtracting hours/days from `now`) are trivial with native `Date`. If react-day-picker v9 pulls in date-fns as a peer dep, that's fine, but don't add it independently.
- Do NOT use `@grafana/ui` time picker. It's tightly coupled to Grafana's plugin system and not designed for standalone use.

### Real-Time Data Streaming

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SSE via `voyagerEmitter` | Existing | Stream live K8s metrics for short ranges | Already built. `emitMetrics(MetricsEvent)` exists. Just need a new SSE endpoint that polls K8s metrics-server at 5-15s intervals for a specific cluster |
| tRPC subscription | ^11.10.0 (installed) | Client-side SSE consumption | tRPC v11 supports SSE subscriptions natively. Use `trpc.metrics.live.useSubscription()` on the client |

**SSE is the correct choice (HIGH confidence):**
- Metrics streaming is server-to-client only (no bidirectional needed)
- SSE auto-reconnects natively (WebSocket requires manual reconnection logic)
- Works through HTTP/2 multiplexing and all proxies/firewalls without config
- 3ms latency difference vs WebSocket is irrelevant for 5-15s polling intervals
- Existing `voyagerEmitter` pattern makes it trivial to add a new channel

**What NOT to use:**
- Do NOT add WebSocket (`ws`, `socket.io`). PROJECT.md explicitly states: "Must integrate with existing `voyagerEmitter` pattern, not add WebSocket"
- Do NOT use polling (`refetchInterval`) for sub-minute ranges. The current pattern of polling tRPC queries every N seconds adds latency and unnecessary DB hits. SSE pushes data the moment it's collected.

### Data Downsampling (Client-Side)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Custom LTTB implementation | N/A (inline ~50 lines) | Client-side downsampling for 7d+ ranges | LTTB is O(n), preserves visual shape, deterministic. Inline implementation avoids dependency on unmaintained packages |

**Why inline, not an npm package:**
- `downsample-lttb` (npm): Last published 11 years ago, 0.0.1, unmaintained
- `downsample` (npm): Better maintained but overkill -- we only need LTTB for one use case
- LTTB algorithm is ~50 lines of TypeScript. Inline it in a `utils/downsample.ts` file.
- Algorithm reference: Sveinn Steinarsson's 2013 thesis, well-documented

**When to downsample:**

| Time Range | Max Points from Backend | Client Downsample Target | Downsample? |
|------------|------------------------|--------------------------|-------------|
| 5m--1h | 12--60 | N/A | No |
| 3h--6h | 36--72 | N/A | No |
| 12h--24h | 144--288 | 200 | Maybe |
| 2d--7d | 576--1008 | 300 | Yes |

### Data Bucketing (Server-Side -- Enhance Existing)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TimescaleDB `time_bucket()` | Existing (PG17 + TimescaleDB) | Server-side aggregation | Already have TimescaleDB. Currently doing manual JS bucketing in `metrics.history` router. Should push aggregation to SQL for performance |
| Drizzle `sql` template | ^0.45.1 (installed) | Raw SQL for `time_bucket()` queries | Drizzle's `sql` tagged template already used in the metrics router for aggregates |

**Current state (needs fixing):** The `metrics.history` procedure fetches ALL rows from DB and buckets in JavaScript. For 7d range, this could be thousands of rows loaded into memory. Should use TimescaleDB's `time_bucket()` at the SQL level:

```sql
SELECT
  time_bucket('5 minutes', timestamp) AS bucket,
  avg(cpu_percent) AS cpu,
  avg(mem_percent) AS memory,
  avg(pod_count) AS pods,
  avg(network_bytes_in) AS network_in,
  avg(network_bytes_out) AS network_out
FROM metrics_history
WHERE cluster_id = $1 AND timestamp >= $2
GROUP BY bucket
ORDER BY bucket
```

**Bucket interval strategy:**

| Time Range | Bucket Interval | Expected Points | Rationale |
|------------|----------------|-----------------|-----------|
| 5m | 15s (SSE live) | ~20 | Real-time from K8s metrics-server, not DB |
| 15m | 15s (SSE live) | ~60 | Real-time from K8s metrics-server, not DB |
| 30m | 1 min | ~30 | DB, matches collector frequency |
| 1h | 2 min | ~30 | DB |
| 3h | 5 min | ~36 | DB |
| 6h | 10 min | ~36 | DB |
| 12h | 30 min | ~24 | DB |
| 24h | 1 hour | ~24 | DB |
| 2d | 2 hours | ~24 | DB |
| 7d | 6 hours | ~28 | DB |

Target: **20-60 data points per range** -- enough for visual fidelity, fast enough for SVG rendering.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-day-picker` | ^9.x | Calendar UI for custom absolute time range | Phase 2+, only when implementing "Custom" time range option |
| `@radix-ui/react-popover` | ^1.x | Time range picker dropdown | Needed for the redesigned time range picker. May already be an indirect dep via shadcn |

### Existing Stack (Confirmed, No Changes)

| Technology | Version | Status | Notes |
|------------|---------|--------|-------|
| Recharts | ^3.7.0 | Keep | Core charting, already configured with CSS variable theming |
| Zustand | ^5.0.11 | Keep | Metrics preferences store, extend for crosshair state |
| tRPC | ^11.10.0 | Keep | Query + subscription support for SSE |
| Fastify | ^5.2.0 | Keep | SSE route support |
| PostgreSQL + TimescaleDB | PG17 | Keep | `time_bucket()` for server-side aggregation |
| Redis | ^5.10.0 | Keep | Cache bucketed query results (TTL per range) |
| Tailwind 4 | ^4 | Keep | All styling |
| Motion | ^12.34.0 | Keep | Panel transitions, not chart animations |
| shadcn/ui components | Latest | Keep | Base component library |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Charting | Recharts (keep) | ECharts, Highcharts, uPlot | PROJECT.md constraint: "Must use existing Recharts." ECharts/Highcharts are heavier. uPlot is Canvas-based (better perf) but would require rewriting all chart components |
| Crosshair sync | Recharts `syncId` | External state manager (Redux) | syncId is built-in, works out of the box. Adding Redux for one feature is overkill when Zustand is already present |
| Real-time | SSE (voyagerEmitter) | WebSocket, polling | PROJECT.md constraint: "Must integrate with existing `voyagerEmitter` pattern, not add WebSocket" |
| Time picker | Custom (Radix + react-day-picker) | `@grafana/ui`, `react-datepicker` | Grafana UI is plugin-coupled. react-datepicker lacks relative-time concept. Custom gives exact UX needed |
| Date utils | Native Date API | date-fns, dayjs | All operations are simple arithmetic (subtract hours/days). No timezone edge cases in this feature. Avoids unnecessary deps |
| Downsampling | Inline LTTB | `downsample-lttb`, `downsample` npm | Unmaintained packages. Algorithm is trivial to implement inline (~50 LOC) |
| Server bucketing | TimescaleDB `time_bucket()` | JS in-memory bucketing (current) | Current approach loads all rows into JS heap. `time_bucket()` pushes aggregation to Postgres -- 10x less memory, 5x faster for large ranges |

## Installation

```bash
# Phase 1 (no new dependencies)
# - Recharts syncId, custom crosshair, SSE stream, time_bucket() queries
# - All using existing installed packages

# Phase 2+ (custom absolute time range)
pnpm --filter web add react-day-picker@^9 @radix-ui/react-popover@^1
```

## Performance Budget

| Metric | Target | Rationale |
|--------|--------|-----------|
| Chart render (4 panels) | < 100ms | 20-60 data points per panel, SVG with no animations |
| Crosshair hover response | < 16ms (60fps) | Recharts syncId handles this natively via React state |
| SSE message → chart update | < 200ms | EventEmitter → SSE → tRPC subscription → React state → Recharts |
| Page load (metrics tab) | < 1s first meaningful paint | Initial tRPC query for default range (24h, ~24 data points) |

## Confidence Assessment

| Recommendation | Confidence | Source |
|---------------|------------|--------|
| Recharts syncId for crosshair sync | HIGH | Official Recharts API docs, tested in v3 |
| Custom Tooltip cursor for vertical line | MEDIUM | Documented as accepting ReactNode, but community reports edge cases with prop passing. Needs implementation validation |
| SSE over WebSocket for metrics | HIGH | Multiple 2025/2026 sources confirm SSE is preferred for server→client streaming. Already in use in this codebase |
| TimescaleDB time_bucket() | HIGH | Official TimescaleDB docs, well-documented since v1.x |
| LTTB inline implementation | HIGH | Algorithm is standardized, O(n), well-documented. Multiple reference implementations exist |
| react-day-picker for absolute range | MEDIUM | shadcn/ui uses it, but v9 has breaking changes from v8. Need to verify compatibility with existing Tailwind 4 setup |
| No date utility library needed | HIGH | All relative time operations are simple Date arithmetic |

## Sources

- [Recharts API Docs - LineChart (syncId, syncMethod, cursor)](https://recharts.github.io/en-US/api/LineChart/)
- [Recharts API Docs - Tooltip (cursor prop)](https://recharts.github.io/en-US/api/Tooltip/)
- [Recharts Performance Guide](https://recharts.github.io/en-US/guide/performance/)
- [Recharts v3.0 Migration Guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide)
- [Recharts Synchronized Charts Discussion](https://github.com/recharts/recharts/discussions/4567)
- [TimescaleDB time_bucket() Documentation](https://docs.timescale.com/timescaledb/latest/how-to-guides/time-buckets/about-time-buckets/)
- [TimescaleDB Downsampling Guide](https://oneuptime.com/blog/post/2026-02-02-timescaledb-downsampling/view)
- [SSE vs WebSocket Performance Comparison (2025)](https://dev.to/polliog/server-sent-events-beat-websockets-for-95-of-real-time-apps-heres-why-a4l)
- [WebSocket vs SSE (2025)](https://websocket.org/comparisons/sse/)
- [LTTB Algorithm Reference](https://github.com/sveinn-steinarsson/flot-downsample)
- [shadcn/ui Date Picker](https://ui.shadcn.com/docs/components/radix/date-picker)
- [react-day-picker v9](https://daypicker.dev/)
- [date-range-picker-for-shadcn](https://github.com/johnpolacek/date-range-picker-for-shadcn)
- [LogRocket: Best React Chart Libraries 2025](https://blog.logrocket.com/best-react-chart-libraries-2025/)
