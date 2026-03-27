# Domain Pitfalls: Metrics Visualization Redesign

**Domain:** Real-time metrics dashboard with Recharts, SSE streaming, time-bucketed historical data
**Researched:** 2026-03-28
**Codebase version:** voyager-platform v1.0 (main branch)

---

## Critical Pitfalls

Mistakes that cause rewrites, major performance regressions, or broken user experience.

### Pitfall 1: Recharts Full Remount on Every Data Update (key prop anti-pattern)

**What goes wrong:** The current `MetricsAreaChart.tsx` (line 296) uses a `key` prop that includes `data.length`:
```tsx
key={`${range}-${activeMetrics.join('-')}-${data.length}`}
```
When SSE pushes a new data point, `data.length` changes, React unmounts the entire `<AreaChart>` SVG tree and remounts it from scratch. With 4 synchronized panels updating every 5 seconds, this means 4 full SVG teardowns and rebuilds per update cycle. At 200+ SVG elements per chart (areas, gradients, axes, grid lines), this creates visible flicker and wasted CPU.

**Why it happens:** Developers add data-dependent keys to "force" Recharts to pick up new data, not realizing Recharts already handles data prop changes via its internal reconciliation. The key prop should only change when the chart's *structure* changes (different metric types, different axis configuration), not when data updates.

**Consequences:** Visible chart flicker on SSE updates, animation replaying on every data push, wasted reconciliation work, and tooltip state loss mid-hover.

**Prevention:**
- Remove `data.length` from the key prop. Use `key={`${range}-${activeMetrics.join('-')}`}` -- only structural changes.
- Verify Recharts re-renders correctly with new data arrays by checking React DevTools profiler.
- If Recharts fails to update on data change, the root cause is usually stale memoization upstream (e.g., `useMemo` with wrong deps), not a missing key.

**Detection:** React DevTools shows the chart component unmounting/remounting instead of updating. Profiler flame chart shows mount operations instead of update operations on data refresh.

**Phase:** Address in Phase 1 (backend bucketing + chart foundation), since the chart component will be refactored anyway.

---

### Pitfall 2: Crosshair Sync Causes Render Cascade Across 4 Panels

**What goes wrong:** Recharts' `syncId` prop synchronizes tooltip position across charts sharing the same ID. Internally, every mouse move event on *any* chart triggers `setState` in *every* synchronized chart. With 4 panels, a single mouse move fires 4 re-renders. At 60fps mouse movement, that is 240 render cycles per second. Each render recalculates tooltip payload, searches for nearest data point, and re-renders the custom tooltip component.

**Why it happens:** Recharts' tooltip system re-renders on every `onMouseMove` event. The `HandleMouseMove` method changes internal state on every tick, causing a wave of re-renders. The `throttleDelay` prop exists but [has known issues](https://github.com/recharts/recharts/issues/1820) -- it does not reliably throttle in all chart types.

**Consequences:** Janky crosshair movement on lower-end machines, high CPU during hover, tooltip content flickering, and potential frame drops that make the dashboard feel sluggish. Particularly bad on datasets with 500+ data points where the nearest-point search is expensive.

**Prevention:**
- Implement a **shared crosshair state via Zustand or useRef** instead of relying on Recharts' built-in syncId. Use a single `onMouseMove` handler on the chart container div (not on each Recharts chart) that calculates the X-axis position once and passes it to all charts as a controlled prop.
- Throttle the shared mouse position update to 16ms (60fps cap) using `requestAnimationFrame` instead of raw mouse events.
- Memoize the custom tooltip component with `React.memo` and ensure it receives primitive props (not objects) to avoid unnecessary re-renders.
- Use `isAnimationActive={false}` on all Area/Line elements (already done in current code -- keep it).
- Set `animationDuration={0}` alongside `isAnimationActive={false}` to eliminate the [known 1500ms dot render delay](https://github.com/recharts/recharts/issues/945).

**Detection:** Open React DevTools profiler, hover across charts, and check if all 4 panels show re-render highlights simultaneously. Measure with Performance tab -- each mouse event should not trigger more than 1 component tree update.

**Phase:** Phase 2 (Grafana-style crosshair UX). This is the core UX feature and must be performance-tested before shipping.

---

### Pitfall 3: SSE Connection Leak and Stale Data Accumulation

**What goes wrong:** When the metrics page uses SSE for real-time short-range data, three failure modes emerge:
1. **Connection leak:** Navigating away from the metrics tab without closing the EventSource leaves the server streaming to a dead connection. The `voyagerEmitter` keeps its listener, and the Fastify response object holds the socket open.
2. **Hidden tab accumulation:** Browsers throttle JavaScript execution in background tabs but do NOT close SSE connections. Data accumulates in the browser's SSE buffer while the tab is hidden. When the user returns, the queued events flood React state, causing a burst of re-renders and a temporary spike in CPU/memory.
3. **Stale reconnection:** After a network hiccup, the EventSource reconnects and receives current data, but the client's chart state still contains pre-disconnect data. Without a "reset" signal, the chart shows a discontinuity or duplicate data points.

**Why it happens:** The existing `useSSEConnection` hook handles reconnection with exponential backoff but does not handle tab visibility or data staleness. The `SSE_EVENT_BUFFER_SIZE` (100) in `packages/config/src/sse.ts` limits server-side buffering but not client-side accumulation.

**Consequences:** Memory leaks in long-running sessions, server-side resource exhaustion (file descriptors) from zombie connections, chart showing stale/duplicated data after reconnection, and CPU spikes when returning to backgrounded tab.

**Prevention:**
- Use `document.visibilitychange` listener to pause/close SSE when the tab is hidden and reconnect when it becomes visible again. On reconnect, discard all buffered data and request a fresh snapshot.
- On the server side, send periodic heartbeat events (already configured: `SSE_HEARTBEAT_INTERVAL_MS = 30_000`). If the client doesn't receive a heartbeat within 2x the interval, auto-reconnect.
- On reconnect, send a `reset` event type that tells the client to clear its chart data buffer before accepting new points.
- Implement a client-side ring buffer (fixed-size array) for SSE data points instead of appending to an unbounded array. For a 15-minute window at 5-second intervals, that is max 180 points -- preallocate and rotate.
- Clean up EventSource in the useEffect cleanup function. Test cleanup by navigating away and checking server logs for closed connections.

**Detection:** Open DevTools Network tab, navigate away from metrics page, check if the SSE connection shows as "pending" indefinitely. Monitor server-side with `voyagerEmitter.listenerCount('metrics')` -- should drop to 0 when no clients are viewing metrics.

**Phase:** Phase 1 (SSE real-time stream), since the SSE infrastructure is built here. The ring buffer and visibility handling must be part of the initial implementation, not bolted on later.

---

### Pitfall 4: Bucket Boundary Drift Between Server `alignFloor` and Client Display

**What goes wrong:** The server's `getBucketTimeline()` uses `alignFloor(now.getTime(), intervalMs)` to snap the end time to the nearest interval boundary. This means the "current" bucket's end time is always in the past (rounded down). When the client receives this data and the user is looking at a "Live" view, the most recent bucket appears to be missing data because the current wall-clock time is ahead of the last bucket's end time. The gap between the last bucket boundary and `now` grows from 0 to `intervalMs` over the course of one interval.

Additionally, the server computes `now` at request time. If the tRPC query has a `refetchInterval` of 60 seconds and the server rounds down, the returned timeline shifts by up to one full interval between consecutive fetches, causing X-axis labels to visibly jump.

**Why it happens:** `alignFloor` rounds to epoch-aligned boundaries (e.g., minute boundaries, 5-minute boundaries). The `now` parameter varies on each request. Two requests 30 seconds apart can produce timelines shifted by one full bucket if they straddle a boundary.

**Consequences:** X-axis labels jump on refetch, creating a disorienting visual jitter. The "current" data point appears to lag behind real time. With SSE data overlaid on DB-bucketed data, the SSE points do not align to the same grid, creating a visible seam when transitioning from live to historical view.

**Prevention:**
- **Server side:** Include `serverTime` (ISO string of `now` before rounding) in the response. Include the `intervalMs` used. This lets the client understand the alignment.
- **Client side:** For the "live" tail, extend the timeline by one partial bucket (from last bucket end to `now`) so the current interval always appears on the chart, even if partially filled.
- **Transition seam:** When switching from SSE (real-time) to DB (historical), ensure the SSE data points are bucketed into the same grid as DB data. Send the bucket configuration (start, interval) to the client so it can align SSE points to the same boundaries.
- **Stable refetch:** Use `staleTime` to prevent unnecessary refetches, and when refetching, pass the *previous* timeline's start time as a hint to the server to maintain alignment continuity.

**Detection:** Watch the X-axis labels during auto-refresh. If labels shift position (e.g., "14:05" jumps to "14:10" and back) without the user changing the time range, bucket alignment is drifting.

**Phase:** Phase 1 (backend bucketing fix). This is the foundational data alignment issue that must be solved before any visualization work.

---

## Moderate Pitfalls

### Pitfall 5: Timezone Display Inconsistency -- UTC Storage vs Local Rendering

**What goes wrong:** The server stores and returns all timestamps as ISO 8601 UTC strings (e.g., `2026-03-28T14:00:00.000Z`). The current `formatXAxis` function uses `toLocaleTimeString()` which renders in the browser's *local* timezone. This works until:
1. **DST transitions:** During spring-forward, one hour disappears from local time. A 1-hour range spanning the transition shows a gap in the X-axis labels (e.g., 1:45 AM jumps to 3:00 AM) while the data is continuous.
2. **Cross-timezone collaboration:** Two team members looking at the same cluster see different X-axis labels for the same data, making incident correlation via screenshots confusing.
3. **Bucket boundaries vs display:** A "1 hour" bucket aligned to UTC midnight looks odd when displayed in UTC-5 (it shows 7:00 PM to 8:00 PM, straddling the previous day).

**Why it happens:** JavaScript `Date` objects are inherently UTC internally but display in local time by default. The `toLocaleTimeString()` call converts implicitly.

**Prevention:**
- Display all chart times in UTC by default, with a user-preference toggle for "Local time" or "UTC". Store the preference in the existing Zustand metrics-preferences store.
- When UTC mode is selected, pass `{ timeZone: 'UTC' }` to all `toLocaleTimeString`/`toLocaleDateString` calls.
- For DST-aware local display, use `Intl.DateTimeFormat` with explicit IANA timezone rather than bare `toLocaleTimeString()`. This handles DST transitions correctly.
- In tooltips, always show both UTC and local time to avoid ambiguity during incidents.
- Bucket alignment on the server should always use UTC epoch alignment (current behavior is correct). Never align buckets to local-time boundaries.

**Detection:** Test the dashboard during a DST transition window (simulate by changing system timezone). Check if X-axis labels show a gap or overlap. Check if tooltip timestamps match the bucket window boundaries.

**Phase:** Phase 2 or Phase 3 (crosshair/tooltip phase). The axis formatting is part of the tooltip and label design.

---

### Pitfall 6: Recharts Performance Cliff at 500+ Data Points Per Panel

**What goes wrong:** For a 7-day range with 6-hour buckets, you have only 28 data points -- fine. But for a 24-hour range with 1-minute buckets (if switching to SSE-quality resolution), that is 1,440 points per chart, times 4 panels = 5,760 SVG path recalculations on every render. Recharts renders via SVG, and each `<Area>` element is a single `<path>` with a `d` attribute containing all coordinates. The path calculation itself is O(n), but the SVG rendering and hit-testing for tooltips is expensive.

**Why it happens:** No downsampling is applied between the server response and the chart. The server returns every bucket, and the chart renders every point. Recharts [does not implement LTTB or any downsampling](https://github.com/recharts/recharts/issues/1356) -- this is explicitly the consumer's responsibility.

**Consequences:** For historical ranges (24h, 7d) with fine-grained data, initial render takes 1-3 seconds. Tooltip hover becomes janky. Page scrolling stutters while charts are visible.

**Prevention:**
- Implement client-side downsampling using the [LTTB (Largest-Triangle-Three-Buckets)](https://github.com/recharts/recharts/issues/1356) algorithm. Target 200-300 points per chart as the rendering sweet spot.
- The downsampling should be a `useMemo` that runs when data or chart container width changes. Points per pixel should be roughly 1:2 (one data point per 2-3 horizontal pixels).
- For the server side, the current bucket configuration already limits point count well for most ranges (30 points for 30m, 60 for 1h, 72 for 6h, 28 for 7d). The risk is only if finer-grained ranges are added later (e.g., 24h at 1-minute resolution).
- Conditionally disable dot rendering (`dot={false}`) and reduce stroke width for datasets above 200 points.
- Use `isAnimationActive={false}` and `animationDuration={0}` for all time-series charts (partially done in current code).

**Detection:** Use React DevTools profiler to measure render time for each chart panel. If any single panel exceeds 16ms (one frame), downsampling is needed. Chrome Performance tab can show "Long Task" warnings.

**Phase:** Phase 1 (data pipeline), since downsampling logic should be built into the data layer from the start, not retrofitted.

---

### Pitfall 7: ResponsiveContainer Resize Thrashing on Dashboard Layout

**What goes wrong:** Recharts' `<ResponsiveContainer>` uses ResizeObserver internally. When the browser window resizes, sidebar collapses/expands, or CSS transitions change the container size, ResizeObserver fires. Each fire triggers a full chart re-render with new dimensions. During a sidebar collapse animation (~300ms), the container width changes on every animation frame, causing 18+ re-renders of each chart.

The current `MetricsTimeSeriesPanel` uses a 2-column grid (`md:grid-cols-2`). When the viewport crosses the `md` breakpoint, all 4 charts resize simultaneously, causing a burst of 4 ResizeObserver callbacks, each triggering a full re-render.

**Why it happens:** ResponsiveContainer re-renders on every pixel change by default. The `debounce` prop exists but defaults to 0.

**Consequences:** Visible chart flicker during sidebar toggle animation. CPU spike during window resize. On slower machines, the sidebar animation stutters because chart re-renders block the main thread.

**Prevention:**
- Set `debounce={100}` on all `<ResponsiveContainer>` instances. This delays the resize response by 100ms, enough to skip intermediate animation frames.
- During sidebar collapse/expand, hide charts with `visibility: hidden` (preserves layout) and re-show after the animation completes. This prevents any resize-triggered re-renders during the transition.
- Alternatively, use `content` CSS `contain` on chart containers to prevent layout thrashing from propagating.
- Consider replacing ResponsiveContainer with a custom hook that uses ResizeObserver with a debounce, reading container width only and passing it as a prop to the chart.

**Detection:** Collapse the sidebar while watching React DevTools highlights. If the chart components flash (re-render) multiple times during the animation, ResponsiveContainer is thrashing.

**Phase:** Phase 2 (Grafana-style panel design), since the panel layout and sizing are redesigned here.

---

### Pitfall 8: SSE-to-DB Transition Shows Data Discontinuity

**What goes wrong:** Short time ranges (5m, 15m) use SSE for real-time data at 5-second resolution. When the user switches to a longer range (1h, 6h), the system switches to DB-bucketed data at 60-second resolution. The transition creates two problems:
1. **Resolution mismatch:** The last 15 minutes of the 1-hour view should show the same data the user just saw in the 15-minute view, but it is now averaged into 60-second buckets, making spikes disappear.
2. **Data gap:** If the SSE stream captured data that has not yet been persisted to the DB (the collector runs every 60 seconds), the most recent 0-59 seconds of data vanishes when switching to the DB view.

**Why it happens:** SSE and DB are separate data sources with different resolutions and different persistence timing. The DB always lags behind real-time by up to one collector interval.

**Consequences:** Users perceive "data loss" when switching time ranges. They distrust the tool because the same time window shows different values depending on which range is selected.

**Prevention:**
- When transitioning from SSE to DB, keep the SSE buffer in memory and overlay it on the DB response for the most recent interval. Fade out the SSE overlay gradually as DB data catches up.
- On the server, return a `lastCollectedAt` timestamp so the client knows exactly where DB data ends and can fill the gap with cached SSE data.
- Display a subtle indicator (e.g., a dotted line segment) for the "pending collection" window at the trailing edge of the chart.
- Consider a hybrid approach: for the most recent N minutes of any time range, always supplement DB data with the SSE buffer if available.

**Detection:** Select a 15-minute SSE range, note a CPU spike, then immediately switch to 1-hour range. If the spike disappears or the last few minutes show different values, the transition is broken.

**Phase:** Phase 3 (data source switching + polish). This requires both SSE and DB paths to be working first.

---

## Minor Pitfalls

### Pitfall 9: SVG Gradient IDs Collide in Multi-Instance Charts

**What goes wrong:** The current code uses `useId()` to generate unique gradient IDs (line 287 of MetricsAreaChart.tsx), which is correct. However, if the chart component is rendered inside a React portal, iframe, or server-side rendered context, `useId()` can produce collisions. More practically, if two panels render the same metric type (unlikely in current 4-panel layout, but possible in future dashboards), their gradient `<defs>` reference the same logical ID pattern.

**Prevention:** Continue using `useId()` (current approach is correct). If future features add user-configurable panels that could duplicate metric types, ensure the gradient ID includes the panel position or a unique panel ID, not just the metric key.

**Phase:** Not urgent -- current implementation is safe. Flag for future dashboard customization phase.

---

### Pitfall 10: Dark Mode Gradient Opacity Visibility

**What goes wrong:** Area chart gradients use `stopOpacity={0.3}` at the top and `stopOpacity={0}` at the bottom (current code, lines 306-307). In dark mode on a dark card background (`--color-bg-card`), the 0.3 opacity gradient is subtle but visible. In light mode, the same 0.3 opacity can appear washed out or invisible against a white background, making the chart look like it has no fill.

**Why it happens:** Opacity-based gradients interact differently with light vs dark backgrounds. The same opacity value produces very different perceived contrast.

**Prevention:**
- Define gradient opacity as CSS custom properties that differ per theme: `--chart-gradient-top: 0.3` (dark) vs `--chart-gradient-top: 0.15` (light).
- Alternatively, use `color-mix()` in the gradient stops to blend the chart color with the background color at a fixed ratio, which adapts automatically.
- Test both themes with screenshot comparison. The area fill should be visible but not overwhelming in both modes.

**Detection:** Switch to light mode and check if area chart fills are visible. If the chart looks like a line chart (no visible fill area), the gradient opacity is too low for the light background.

**Phase:** Phase 2 (Grafana-style dark panel design). The gradient styling is part of the panel visual redesign.

---

### Pitfall 11: Chart Accessibility -- Invisible to Screen Readers

**What goes wrong:** SVG charts are inherently inaccessible. The current code adds `role="img"` and `aria-label` to the chart container (line 292), which is a start, but provides no data-level accessibility. A screen reader user hears "CPU chart" and nothing else -- no values, no trends, no ability to navigate data points.

**Why it happens:** Recharts renders raw SVG with no ARIA attributes on individual data points. This is a known limitation of SVG-based charting libraries.

**Prevention:**
- Add a visually hidden data table (`sr-only` CSS class) below each chart that presents the same data in tabular form. Screen readers can navigate this table with standard table navigation keys.
- Use `aria-describedby` to link the chart to a summary paragraph: "CPU utilization averaged 45% over the last hour, peaking at 78% at 14:30 UTC."
- For keyboard navigation, add tab-focusable elements at chart start/end and data point annotations (e.g., peaks, anomalies) that can be navigated with arrow keys.
- This is a progressive enhancement -- implement a basic summary first, add detailed table navigation later.

**Detection:** Use VoiceOver (macOS) or NVDA (Windows) to navigate the metrics page. If the only information conveyed is "CPU chart image", accessibility is insufficient.

**Phase:** Phase 3 (polish and accessibility). Not a launch blocker, but should be in the roadmap.

---

### Pitfall 12: `toLocaleTimeString` Output Varies by Browser/OS

**What goes wrong:** The current `formatXAxis` function uses `toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })`. The output format varies by browser locale and OS:
- Chrome on macOS (en-US): "2:30 PM"
- Firefox on macOS (en-US): "2:30 PM"
- Chrome on macOS (de-DE): "14:30"
- Node.js SSR: may use a different ICU dataset

This means X-axis labels can be inconsistent between SSR and CSR (hydration mismatch), and label width varies (12h format is wider than 24h format), causing axis layout shifts.

**Prevention:**
- Use explicit `Intl.DateTimeFormat` with `hour12: false` for chart axes to ensure consistent 24-hour format regardless of locale. Monitoring tools universally use 24-hour time.
- For tooltips (where user preference matters more), allow locale-aware formatting but test for hydration consistency.
- Alternatively, format axis labels with a simple function (`${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`) to guarantee consistent output.

**Detection:** Compare chart screenshots between different browsers/locales. Check for React hydration warnings in the console on the metrics page.

**Phase:** Phase 1 (chart foundation), since axis formatting is part of the basic chart setup.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Phase 1: Backend bucketing + SSE stream** | Bucket alignment drift (#4), SSE connection leak (#3), key prop remount (#1) | Server must return `serverTime` + `intervalMs`. SSE cleanup in useEffect. Remove data.length from key. |
| **Phase 1: Data pipeline** | Performance cliff at high point counts (#6) | Build LTTB downsampling into the data layer from day one. Do not defer. |
| **Phase 2: Crosshair sync** | Render cascade (#2), ResponsiveContainer thrashing (#7) | Custom crosshair state via Zustand/ref, not Recharts syncId. Debounce ResponsiveContainer. |
| **Phase 2: Panel design** | Dark mode gradient visibility (#10), locale-dependent labels (#12) | Theme-aware gradient opacity. 24h time format for axes. |
| **Phase 3: SSE-to-DB transition** | Data discontinuity (#8), timezone display (#5) | Overlay SSE buffer on DB data. UTC/local toggle. |
| **Phase 3: Polish** | Accessibility (#11) | sr-only data table, aria-describedby summaries. |

---

## Existing Codebase Risks (Already Present)

These are not hypothetical -- they exist in the current code and will bite during the redesign:

| File | Risk | Line(s) | Action |
|------|------|---------|--------|
| `MetricsAreaChart.tsx` | key includes `data.length` -- causes full remount on data change | 296 | Remove `data.length` from key |
| `MetricsAreaChart.tsx` | `isAnimationActive={false}` set but `animationDuration` not set to 0 | 388 | Add `animationDuration={0}` |
| `MetricsAreaChart.tsx` | `ResponsiveContainer` has no `debounce` prop | 294 | Add `debounce={100}` |
| `MetricsAreaChart.tsx` | `formatXAxis` uses locale-dependent `toLocaleTimeString` | 111-126 | Switch to 24h format with explicit timezone |
| `metrics.ts` (router) | `getBucketTimeline` uses `new Date()` -- no server time returned | 56 | Return `serverTime` in response |
| `metrics.ts` (router) | Short ranges (30s, 1m, 5m) have intervals < collector frequency | 42-44 | Remove or repurpose -- SSE handles these ranges |
| `useSSEConnection.ts` | No visibility change handling | entire file | Add `document.visibilitychange` listener |
| `sse.ts` (config) | `SSE_MAX_RECONNECT_ATTEMPTS = 0` (infinite) | 16 | Set a reasonable limit (e.g., 20) or implement circuit breaker |
| `metrics-preferences.ts` | Persists `range` to localStorage but no migration for new range values | 23 | Add migration logic when new time ranges (15m, 30m, 3h, etc.) are added |

---

## Sources

- [Recharts performance guide](https://recharts.github.io/en-US/guide/performance/) -- HIGH confidence
- [Recharts large dataset issue #1146](https://github.com/recharts/recharts/issues/1146) -- HIGH confidence
- [Recharts LTTB downsampling issue #1356](https://github.com/recharts/recharts/issues/1356) -- HIGH confidence
- [Recharts tooltip frequency issue #1820](https://github.com/recharts/recharts/issues/1820) -- HIGH confidence
- [Recharts tooltip system architecture (DeepWiki)](https://deepwiki.com/recharts/recharts/5.2-tooltip-system) -- MEDIUM confidence
- [Recharts ResponsiveContainer docs](https://recharts.github.io/en-US/api/ResponsiveContainer/) -- HIGH confidence
- [MDN Date.getTimezoneOffset](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset) -- HIGH confidence
- [SSE best practices (OneUptime)](https://oneuptime.com/blog/post/2026-01-15-server-sent-events-sse-react/view) -- MEDIUM confidence
- [High Performance Browser Networking: SSE chapter](https://www.oreilly.com/library/view/high-performance-browser/9781449344757/ch16.html) -- HIGH confidence
- [TimescaleDB time_bucket documentation](https://docs.timescale.com/api/latest/hyperfunctions/time_bucket/) -- HIGH confidence
- [WCAG chart accessibility (Deque)](https://www.deque.com/blog/how-to-make-interactive-charts-accessible/) -- MEDIUM confidence
- [Chart accessibility checklist (A11Y Collective)](https://www.a11y-collective.com/blog/accessible-charts/) -- MEDIUM confidence
