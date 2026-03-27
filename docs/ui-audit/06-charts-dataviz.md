# Charts & Data Visualization Audit

**Auditor:** Chart Quality Agent
**Date:** 2026-03-27
**Scope:** All chart components, dashboard widgets, metrics panels, sparklines, anomaly visualizations
**Files Reviewed:** 28 files across `charts/`, `dashboard/widgets/`, `metrics/`, `anomalies/`, `shared/`

---

## Executive Summary

| Severity | Count |
|----------|-------|
| P0 (Critical) | 2 |
| P1 (High) | 7 |
| P2 (Medium) | 10 |
| P3 (Low) | 6 |
| **Total** | **25** |

The chart system is well-structured with good use of `ResponsiveContainer`, centralized theme constants, and proper `role="img"` accessibility on major charts. Key concerns: color-blind safety gaps, undefined CSS variables creating fragile fallback chains, missing chart empty states, hardcoded HSL colors bypassing the theme system, and lack of ARIA descriptions for screen readers.

---

## Findings

---

### [P0] Undefined `--chart-1` through `--chart-5` CSS variables — silent fallback chain

- **File:** `apps/web/src/components/charts/chart-theme.ts:24-35`
- **Issue:** `CHART_COLORS` references `hsl(var(--chart-1, 142 71% 45%))` etc., but `--chart-1` through `--chart-5` are **never defined** in `globals.css`. The entire Recharts color palette relies on HSL fallback values baked into the JS. This means:
  1. Charts cannot be re-themed via CSS variables (the shadcn `--chart-*` convention is broken)
  2. If someone adds `--chart-1` in the future with a different format, it will silently break all charts
  3. Dark/light mode chart color control via CSS is impossible for these charts
- **Best practice:** Define all CSS variables used, or remove the `var()` wrapper and use direct HSL values to avoid confusion.
- **Fix:** Either add `--chart-1` through `--chart-5` to both dark and light theme blocks in `globals.css`:
  ```css
  /* Dark theme */
  --chart-1: 142 71% 45%;
  --chart-2: 48 96% 53%;
  --chart-3: 0 84% 60%;
  --chart-4: 262 83% 58%;
  --chart-5: 199 89% 48%;
  ```
  Or simplify `chart-theme.ts` to use the already-defined `--color-chart-*` tokens:
  ```ts
  export const CHART_COLORS = {
    healthy: 'var(--color-chart-pods)',   // uses globals.css token
    degraded: 'var(--color-chart-warning)',
    offline: 'var(--color-chart-critical)',
    cpu: 'var(--color-chart-cpu)',
    memory: 'var(--color-chart-mem)',
    // ...
  } as const
  ```
- **Priority:** P0 — fragile architecture, theme system is silently broken

---

### [P0] Color-blind safety — chart-cpu and chart-mem are indistinguishable for deuteranopia

- **File:** `apps/web/src/app/globals.css:111-113` (dark) and `:208-210` (light)
- **Issue:** In dark mode:
  - `--color-chart-cpu: #6366f1` (indigo)
  - `--color-chart-mem: #10b981` (emerald)
  - `--color-chart-pods: #10b981` (emerald)

  `chart-mem` and `chart-pods` are **identical** (`#10b981`). In any context where memory and pods are shown together, they are literally the same color. More critically, the CPU (indigo) vs Memory (green) palette fails deuteranopia simulation — both appear as a dull brownish hue.

  In `ResourceUsageChart.tsx`, CPU and Memory are the two primary series plotted together, making this a direct accessibility failure.
- **Best practice:** Use a color-blind-safe palette (e.g., Wong palette, Tableau 10). Differentiate series with pattern/dash/shape in addition to hue.
- **Fix:**
  1. Change `--color-chart-pods` to a distinct color (e.g., `#06b6d4` cyan)
  2. Use complementary colors that remain distinguishable under all forms of color blindness
  3. Add `strokeDasharray` differentiation to `ResourceUsageChart.tsx`:
     ```tsx
     <Area dataKey="memory" strokeDasharray="6 3" ... />
     ```
- **Priority:** P0 — accessibility violation, two data series share identical color

---

### [P1] Dual color system — hardcoded HSL in MetricsAreaChart bypasses CSS tokens

- **File:** `apps/web/src/components/metrics/MetricsAreaChart.tsx:47-83`
- **Issue:** `METRIC_CONFIG` hardcodes colors as raw HSL strings (`'hsl(262,83%,58%)'`, `'hsl(199,89%,48%)'`, etc.) instead of using the `--color-chart-*` CSS variables from `globals.css`. This creates two independent color systems:
  1. `chart-theme.ts` → uses `hsl(var(--chart-N, ...))` (also broken, see P0 above)
  2. `MetricsAreaChart.tsx` → raw HSL literals
  3. `globals.css` → `--color-chart-*` tokens

  None of these three are connected. Changing the theme in `globals.css` will NOT update MetricsAreaChart colors.
- **Best practice:** Single source of truth for chart colors. All components should read from CSS custom properties.
- **Fix:** Replace hardcoded HSL in `METRIC_CONFIG` with CSS variable references:
  ```ts
  cpu: { color: 'var(--color-chart-cpu)', ... },
  memory: { color: 'var(--color-chart-mem)', ... },
  pods: { color: 'var(--color-status-healthy)', ... },
  networkIn: { color: 'var(--color-chart-warning)', ... },
  networkOut: { color: 'var(--color-chart-critical)', ... },
  ```
  **Note:** Recharts SVG `stroke`/`fill` accept CSS variables — this works.
- **Priority:** P1

---

### [P1] Hardcoded HSL colors in ResourceSparkline and NodeResourceBreakdown

- **File:** `apps/web/src/components/metrics/ResourceSparkline.tsx:37,93-102`
- **File:** `apps/web/src/components/metrics/NodeResourceBreakdown.tsx:23-34`
- **File:** `apps/web/src/components/metrics/NodeMetricsTable.tsx:13-18`
- **Issue:** Three components independently hardcode the same HSL threshold colors:
  ```ts
  // Repeated in 3 files:
  > 85 → 'hsl(0,84%,60%)'    // red
  > 65 → 'hsl(48,96%,53%)'   // yellow
  else → 'hsl(262,83%,58%)'  // purple (CPU) or 'hsl(199,89%,48%)' (memory)
  ```
  `NodeMetricsTable.tsx` uses a different threshold scheme (`getColor` at line 13) with slightly different breakpoints and green instead of purple for normal.

  This is a DRY violation and a consistency issue — the same metric at the same value will show different colors depending on which component renders it.
- **Best practice:** Extract threshold-to-color mapping to a shared utility in `chart-theme.ts`.
- **Fix:** Add to `chart-theme.ts`:
  ```ts
  export function getThresholdColor(value: number, metric: 'cpu' | 'memory'): string {
    if (value > 85) return 'var(--color-status-error)'
    if (value > 65) return 'var(--color-status-warning)'
    return metric === 'cpu' ? 'var(--color-chart-cpu)' : 'var(--color-chart-mem)'
  }
  ```
  Then use in all three components.
- **Priority:** P1

---

### [P1] Missing ARIA descriptions on chart SVGs — screen readers get no data

- **File:** `apps/web/src/components/charts/ClusterHealthChart.tsx:40`
- **File:** `apps/web/src/components/charts/ResourceUsageChart.tsx:43`
- **File:** `apps/web/src/components/charts/AlertsTimelineChart.tsx:70`
- **File:** `apps/web/src/components/charts/RequestRateChart.tsx:40`
- **File:** `apps/web/src/components/charts/UptimeChart.tsx:53`
- **Issue:** All major charts have `role="img"` and `aria-label` (good), but **no `aria-roledescription`** and **no hidden data table fallback**. A screen reader user sees "Cluster health over time chart" but gets zero actual data. The Recharts SVG internals are not accessible — they produce unlabeled `<path>` and `<rect>` elements.
- **Best practice:** For data-rich charts, provide either:
  1. An `aria-describedby` pointing to a visually-hidden summary (e.g., "Healthy: 95%, Degraded: 3%, Offline: 2%")
  2. A visually-hidden `<table>` with the same data
- **Fix:** Add a visually-hidden summary below each chart:
  ```tsx
  <div role="img" aria-label="Cluster health chart" aria-describedby="health-summary">
    <ResponsiveContainer ...>...</ResponsiveContainer>
    <div id="health-summary" className="sr-only">
      Latest values: Healthy {healthData.at(-1)?.healthy}%,
      Degraded {healthData.at(-1)?.degraded}%,
      Offline {healthData.at(-1)?.offline}%
    </div>
  </div>
  ```
- **Priority:** P1

---

### [P1] MetricsAreaChart — no `role="img"` or ARIA attributes

- **File:** `apps/web/src/components/metrics/MetricsAreaChart.tsx:265-266`
- **Issue:** Unlike the `charts/` directory components which all have `role="img"` and `aria-label`, the `MetricsAreaChart` wrapping `<div>` has **no accessibility attributes at all**. This is the primary metrics visualization in the cluster detail view.
- **Best practice:** All chart containers must have `role="img"` and `aria-label`.
- **Fix:**
  ```tsx
  <div role="img" aria-label={`${activeMetrics.map(k => METRIC_CONFIG[k].label).join(', ')} chart`}>
  ```
- **Priority:** P1

---

### [P1] SparklineChart gradient ID collision in repeated instances

- **File:** `apps/web/src/components/charts/SparklineChart.tsx:36`
- **Issue:** The gradient ID is generated as `spark-${color.replace(/[^a-z0-9]/gi, '')}`. When multiple SparklineChart instances use the same `color` prop (e.g., `var(--color-chart-cpu)` used in both `ResourceChartsWidget` and `StatCardsWidget`), they produce **identical SVG gradient IDs**. In the same DOM, duplicate SVG `<defs>` IDs cause the browser to use the **first** matching definition, which may have wrong dimensions or opacity if the parent container differs in size.
- **Best practice:** Use `React.useId()` or a counter to guarantee unique SVG gradient IDs.
- **Fix:**
  ```tsx
  import { useId } from 'react'

  export function SparklineChart({ data, color, height = 60, label, unit }: SparklineChartProps) {
    const id = useId()
    const gradientId = `spark-${id}`
    // ...
  }
  ```
- **Priority:** P1 — visual glitch when multiple sparklines of same color render

---

### [P1] ResourceUsageChart has duplicate SVG gradient IDs when rendered multiple times

- **File:** `apps/web/src/components/charts/ResourceUsageChart.tsx:47-54`
- **Issue:** Gradient IDs `cpuGradient` and `memGradient` are **static strings**. If `ResourceUsageChart` is ever rendered more than once on the same page (e.g., in a multi-cluster dashboard), the duplicate `<defs>` IDs will cause cross-chart gradient bleeding.

  Similarly, `MetricsAreaChart.tsx:277` generates gradients with static IDs from `METRIC_CONFIG` (`cpuGradient`, `memGradient`, etc.) — same collision risk.
- **Best practice:** Scope gradient IDs per chart instance.
- **Fix:** Use `useId()`:
  ```tsx
  const chartId = useId()
  // Then: id={`${chartId}-cpuGradient`} and fill={`url(#${chartId}-cpuGradient)`}
  ```
- **Priority:** P1

---

### [P2] No empty state handling in individual chart components

- **File:** `apps/web/src/components/charts/ClusterHealthChart.tsx`
- **File:** `apps/web/src/components/charts/ResourceUsageChart.tsx`
- **File:** `apps/web/src/components/charts/AlertsTimelineChart.tsx`
- **File:** `apps/web/src/components/charts/UptimeChart.tsx`
- **Issue:** When `data` is an empty array `[]`, all chart components render an empty `ResponsiveContainer` with invisible axes. The parent `DashboardCharts.tsx` conditionally renders (`{health.data && ...}`), so it shows nothing — but if `data` is `[]` (truthy), a blank chart box appears with only grid lines and axes.

  `MetricsTimeSeriesPanel` handles this properly with `MetricsEmptyState`, but the dashboard charts do not.
- **Best practice:** Show a "No data available" empty state inside the chart area when data is empty.
- **Fix:** Add guard in each chart:
  ```tsx
  if (data.length === 0) {
    return (
      <div role="img" aria-label="..." className="flex items-center justify-center" style={{ height: CHART_HEIGHT }}>
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    )
  }
  ```
- **Priority:** P2

---

### [P2] Tooltip missing units in ClusterHealthChart and AlertsTimelineChart

- **File:** `apps/web/src/components/charts/ClusterHealthChart.tsx:51-54`
- **Issue:** The Y-axis shows `%` unit, but the tooltip values don't include the `%` suffix. When hovering, values show as raw numbers (e.g., "95") without context. Compare with `ResourceUsageChart` which also lacks tooltip unit formatting.
- **Best practice:** Tooltip values should always include units matching the axis.
- **Fix:** Add `formatter` to the Tooltip:
  ```tsx
  <Tooltip
    {...TOOLTIP_STYLE}
    labelFormatter={(v) => formatTimestamp(v as string, range)}
    formatter={(value: number) => [`${value}%`, undefined]}
  />
  ```
- **Priority:** P2

---

### [P2] Tooltip inconsistency — three different tooltip styles across chart families

- **File:** `apps/web/src/components/charts/chart-theme.ts:40-48` — `TOOLTIP_STYLE` (Recharts `contentStyle`)
- **File:** `apps/web/src/components/charts/SparklineChart.tsx:13-31` — custom Tailwind tooltip
- **File:** `apps/web/src/components/metrics/MetricsAreaChart.tsx:164-196` — custom Tailwind tooltip v2
- **File:** `apps/web/src/components/metrics/ResourceSparkline.tsx:31-41` — custom Tailwind tooltip v3
- **Issue:** Four distinct tooltip implementations with different:
  - Background colors (`popover` var vs `bg-card` var vs inline styles)
  - Border radius (`8px` vs `rounded-md` vs `rounded-lg` vs `rounded`)
  - Font sizes (`13px` vs `text-xs`)
  - Padding (`px-2 py-1` vs `p-2.5` vs `px-2 py-1`)
  - Shadow styles (none vs `shadow-lg` vs `shadow-xl`)
- **Best practice:** Centralize tooltip component or at minimum tooltip styles.
- **Fix:** Create a shared `ChartTooltip` component used by all chart types:
  ```tsx
  // chart-theme.ts
  export function ChartTooltipContainer({ children }: { children: React.ReactNode }) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2 text-xs shadow-lg">
        {children}
      </div>
    )
  }
  ```
- **Priority:** P2

---

### [P2] UptimeChart — no Legend component

- **File:** `apps/web/src/components/charts/UptimeChart.tsx:51-84`
- **Issue:** Unlike all other charts that include `<Legend />`, `UptimeChart` has no legend. The color-coded bars (green/yellow/red) have no legend explaining the threshold bands. Users must hover each bar to discover the tooltip says "Uptime %".
- **Best practice:** All charts should have either a legend or clear visual key for color meanings.
- **Fix:** Add a custom legend below the chart:
  ```tsx
  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded" style={{background: CHART_COLORS.healthy}} /> >99.9%</span>
    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded" style={{background: CHART_COLORS.degraded}} /> >99.0%</span>
    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded" style={{background: CHART_COLORS.offline}} /> <99.0%</span>
  </div>
  ```
- **Priority:** P2

---

### [P2] UptimeChart — cluster name truncation on narrow screens

- **File:** `apps/web/src/components/charts/UptimeChart.tsx:41,69`
- **Issue:** `CLUSTER_LABEL_WIDTH = 120` is fixed at 120px. Long cluster names (e.g., `eks-prod-shared-new-us-east-1`) will be truncated by Recharts without ellipsis, making names unreadable. On mobile (< 640px), the 120px label width consumes ~30% of the chart area.
- **Best practice:** Use responsive label width or truncate with Recharts `tick` custom renderer.
- **Fix:**
  ```tsx
  <YAxis
    tick={({ x, y, payload }) => (
      <text x={x} y={y} textAnchor="end" fill={CHART_TEXT_COLOR} fontSize={11}>
        {payload.value.length > 15 ? `${payload.value.slice(0, 15)}...` : payload.value}
      </text>
    )}
    width={Math.min(140, window?.innerWidth ? window.innerWidth * 0.2 : 120)}
  />
  ```
- **Priority:** P2

---

### [P2] ClusterHealthWidget gauge — SVG has no accessibility attributes

- **File:** `apps/web/src/components/dashboard/widgets/ClusterHealthWidget.tsx:94-98`
- **Issue:** The SVG gauge circles have no `role`, `aria-label`, or `<title>` element. Screen readers encounter raw `<svg>` and `<circle>` with no semantic meaning.
- **Best practice:** SVG visualizations should have `role="img"` and `aria-label` or a `<title>` child.
- **Fix:**
  ```tsx
  <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`${label}: ${pct}%`}>
    <title>{label}: {pct}%</title>
    ...
  </svg>
  ```
- **Priority:** P2

---

### [P2] Sparkline in MetricCard (shared/) — different implementation than SparklineChart

- **File:** `apps/web/src/components/shared/MetricCard.tsx:14-49`
- **Issue:** `MetricCard` has its own inline `Sparkline` component using raw SVG `<polyline>`, while the rest of the app uses the Recharts-based `SparklineChart` from `charts/SparklineChart.tsx`. Two completely different sparkline implementations:
  1. `SparklineChart.tsx` — Recharts AreaChart with gradient fill, tooltip, `ResponsiveContainer`
  2. `MetricCard/Sparkline` — raw SVG polyline, fixed 80px width, no tooltip, no responsive sizing

  Visually they produce different sparkline styles in the same app.
- **Best practice:** Single sparkline implementation across the app.
- **Fix:** Replace the inline `Sparkline` in `MetricCard` with the existing `SparklineChart`:
  ```tsx
  import { SparklineChart } from '@/components/charts/SparklineChart'
  // ...
  {sparklineData && sparklineData.length > 1 && (
    <SparklineChart data={sparklineData} color={sparklineColor ?? 'var(--color-brand)'} height={32} />
  )}
  ```
- **Priority:** P2

---

### [P2] ResourceChartsWidget — sparkline data never updates (empty dependency array)

- **File:** `apps/web/src/components/dashboard/widgets/ResourceChartsWidget.tsx:19-21`
- **Issue:**
  ```ts
  const cpuTrend = useMemo(() => generateStableTimeSeries('resource-cpu', cpuPct || 40), [])
  const memTrend = useMemo(() => generateStableTimeSeries('resource-mem', memPct || 60), [])
  ```
  The `useMemo` has an **empty dependency array** `[]`, but uses `cpuPct` and `memPct` which change on every data refetch. The sparkline data is computed once on mount and never updates. The eslint-disable comment acknowledges this is intentional for stability, but it means the sparkline always shows the initial value, not current data.

  Same pattern in `StatCardsWidget.tsx:122-128`.
- **Best practice:** If intentional (mock data), document clearly. If real-time data is expected, update dependencies.
- **Fix:** This is documented as intentional (`BUG-193-002`), but the sparkline should at minimum update its last point when `cpuPct` changes:
  ```ts
  const cpuTrend = useMemo(() => {
    const series = generateStableTimeSeries('resource-cpu', cpuPct || 40)
    series[series.length - 1] = cpuPct  // always reflect current value
    return series
  }, [cpuPct])
  ```
- **Priority:** P2

---

### [P2] TimelineDistributionBar — hardcoded light-theme fallback color

- **File:** `apps/web/src/components/dashboard/AnomalyTimeline.tsx:86`
- **Issue:** Empty bucket background uses `'rgba(255,255,255,0.06)'` — this is a dark-mode-only color. In light mode, white-on-white at 6% opacity is invisible.
- **Best practice:** Use CSS variables for all colors that differ between themes.
- **Fix:**
  ```ts
  : 'var(--color-track)'  // defined in both dark and light themes
  ```
- **Priority:** P2

---

### [P3] formatTimestamp — identical branches for '1h', '6h', '24h'

- **File:** `apps/web/src/components/charts/chart-theme.ts:52-66`
- **Issue:** Three switch cases return identical formatting:
  ```ts
  case '1h': return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  case '6h': return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  case '24h': return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  ```
  This is dead code duplication. Also, there's no timezone indicator anywhere — users in different timezones see different times with no indication.
- **Best practice:** Collapse identical branches. Consider adding timezone abbreviation for 7d/30d ranges.
- **Fix:**
  ```ts
  case '1h':
  case '6h':
  case '24h':
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  ```
- **Priority:** P3

---

### [P3] No chart animation on data update — abrupt transitions

- **File:** `apps/web/src/components/charts/SparklineChart.tsx:63`
- **File:** `apps/web/src/components/metrics/MetricsAreaChart.tsx:360`
- **Issue:** Both sparklines and metrics charts set `isAnimationActive={false}`, which means data transitions are instant (no smooth interpolation when values change). While this avoids initial render animation overhead, it also means when data updates (e.g., auto-refresh every 30s), the chart jumps abruptly from old values to new values.
- **Best practice:** Disable initial animation but enable update animation for smooth real-time feel:
  ```tsx
  animationDuration={300}
  animationEasing="ease-out"
  isAnimationActive={true}
  ```
  Or use Recharts' `animateNewValues` pattern.
- **Priority:** P3 — aesthetic improvement, not functional

---

### [P3] DashboardCharts loading spinner — no skeleton matching chart layout

- **File:** `apps/web/src/components/charts/DashboardCharts.tsx:118-125`
- **Issue:** Loading state shows a single centered spinner in the chart area. This causes layout shift when data loads because the spinner doesn't match the chart's visual weight. Compare with `MetricsTimeSeriesPanel.tsx:229-237` which properly uses `<Skeleton>` components matching the chart shape.
- **Best practice:** Use skeleton placeholders that match the chart's visual layout to prevent CLS.
- **Fix:** Replace spinner with skeleton:
  ```tsx
  {loading ? (
    <div style={{ height: CHART_HEIGHT }} className="space-y-2 p-2">
      <Skeleton className="h-4 w-32 rounded" />
      <Skeleton className="h-full w-full rounded-lg" />
    </div>
  ) : ...}
  ```
- **Priority:** P3

---

### [P3] AlertsTimelineChart scatter — no interactive features for dense data

- **File:** `apps/web/src/components/charts/AlertsTimelineChart.tsx:64-111`
- **Issue:** The scatter chart has no brush/zoom capability. With a 30-day range and many alerts, bubbles will overlap extensively with no way to drill down. The chart is view-only — no click-to-filter or selection interaction.
- **Best practice:** For time-series scatter charts with variable density, add a Recharts `<Brush>` component for range selection, or make bubbles clickable to filter.
- **Fix:**
  ```tsx
  import { Brush } from 'recharts'
  // Inside ScatterChart:
  <Brush dataKey="x" height={20} stroke={CHART_GRID_COLOR} />
  ```
- **Priority:** P3

---

### [P3] RequestRateChart — component exists but is never used with real data

- **File:** `apps/web/src/components/charts/RequestRateChart.tsx`
- **File:** `apps/web/src/components/charts/DashboardCharts.tsx:80-88`
- **Issue:** `DashboardCharts` renders a placeholder for "Request Rates":
  ```tsx
  <div>Coming Soon - Real request rate metrics</div>
  ```
  The `RequestRateChart` component is fully implemented but unused. It's exported from `index.ts` but no consumer passes it data.
- **Best practice:** Either wire it up or remove the dead code to avoid confusion.
- **Fix:** Low priority — just flagging for awareness. Remove from `index.ts` exports if not planned for near-term use.
- **Priority:** P3

---

### [P3] Number formatting inconsistency — `toFixed(1)` vs `Math.round` vs raw values

- **File:** `apps/web/src/components/metrics/MetricsAreaChart.tsx:97-101`
- **File:** `apps/web/src/components/metrics/NodeResourceBreakdown.tsx:60-62`
- **File:** `apps/web/src/components/dashboard/widgets/ClusterHealthWidget.tsx:120`
- **Issue:** Percentage values are formatted differently across components:
  - `MetricsAreaChart`: `value.toFixed(1)%` → "45.3%"
  - `NodeResourceBreakdown`: `${node.cpuPercent}%` → raw, possibly "45.33333%"
  - `ClusterHealthWidget`: `Math.round(cpu)` → "45%"
  - `NodeMetricsTable`: `${value}%` → whatever the backend sends

  A metric showing "45%", "45.3%", and "45.33%" in different parts of the UI is confusing.
- **Best practice:** Standardize percentage display to one consistent format (recommend `Math.round` for gauges, `toFixed(1)` for charts).
- **Fix:** Add a shared formatter to `chart-theme.ts`:
  ```ts
  export function formatPercent(value: number, precision: 'chart' | 'badge' = 'badge'): string {
    return precision === 'chart' ? `${value.toFixed(1)}%` : `${Math.round(value)}%`
  }
  ```
- **Priority:** P3

---

## Summary of Themes

### Positive Patterns Found
- All major charts use `<ResponsiveContainer width="100%" ...>` (responsive)
- `chart-theme.ts` centralizes constants (height, margin, font size, stroke width)
- `role="img"` with `aria-label` on 6/7 chart components
- `DashboardCharts` has proper loading and error states at the card level
- `MetricsTimeSeriesPanel` has comprehensive states: loading skeleton, error, empty, timeout
- `TimeRangeSelector` uses proper `role="tablist"` / `role="tab"` / `aria-selected`
- Time range buttons use `aria-pressed` in `DashboardCharts`
- `AnimatedStatCount` respects `prefers-reduced-motion`
- `MetricsAreaChart` handles null data gaps with `connectNulls={false}`

### Systemic Issues
1. **Three disconnected color systems** — `chart-theme.ts` vars (undefined), `globals.css` tokens, hardcoded HSL
2. **Tooltip style fragmentation** — 4 different tooltip implementations
3. **Threshold color duplication** — same red/yellow/green logic in 3+ files
4. **SVG gradient ID collisions** — static IDs in 2 chart components + SparklineChart
5. **Accessibility gaps** — charts readable by sighted users only, no data fallback for screen readers
