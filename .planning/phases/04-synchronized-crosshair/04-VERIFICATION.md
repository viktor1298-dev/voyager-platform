---
phase: 04-synchronized-crosshair
verified: 2026-03-28T02:55:00Z
status: gaps_found
score: 3/5 must-haves verified
gaps:
  - truth: "User can drag-to-select a time region on any panel to zoom into that range"
    status: failed
    reason: "Brush component exists and calls setCustomRange, but useMetricsData explicitly returns empty data when range='custom' (stub). Zooming produces a blank panel — not a zoom. Backend custom range support is explicitly deferred ('until backend custom range support is added')."
    artifacts:
      - path: "apps/web/src/hooks/useMetricsData.ts"
        issue: "Lines 82-93: when isCustom=true, returns data:[] unconditionally. The zoom action produces an empty chart."
      - path: "apps/web/src/stores/metrics-preferences.ts"
        issue: "Duplicate setCustomRange identifier (lines 15+18 in interface, lines 46+50 in implementation) — TypeScript error TS2300 and TS1117."
      - path: "apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx"
        issue: "Line 93: passes MetricsRange (includes 'custom') directly to trpc.metrics.history.useQuery which only accepts GrafanaTimeRange (no 'custom') — TypeScript error TS2769."
    missing:
      - "Fix duplicate setCustomRange in metrics-preferences.ts (remove one definition from both interface and implementation)"
      - "Fix MetricsTimeSeriesPanel.tsx line 93: guard the query against 'custom' range (e.g. pass apiRange fallback like useMetricsData does, or use skipToken when range='custom')"
      - "Fix MetricsTimeSeriesPanel.tsx line 143: type cast issue (use as unknown as MetricsDataPoint[] or extract data field)"
      - "Either implement backend custom range support so brush zoom shows real zoomed data, or document VIZ-03 as partial pending backend work"
  - truth: "TypeScript compiles clean (pnpm typecheck exits 0)"
    status: failed
    reason: "pnpm typecheck exits 2 with 4 errors across 2 files, all introduced in this phase."
    artifacts:
      - path: "apps/web/src/stores/metrics-preferences.ts"
        issue: "TS2300: Duplicate identifier 'setCustomRange' (lines 15, 18 in interface); TS1117: duplicate property in object literal (line 50)"
      - path: "apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx"
        issue: "TS2769 line 93: 'custom' not assignable to GrafanaTimeRange; TS2352 line 143: data cast overlap error"
    missing:
      - "Resolve all 4 TypeScript errors before declaring phase complete"
---

# Phase 4: Synchronized Crosshair Verification Report

**Phase Goal:** Users can hover any panel and see a synchronized crosshair with timestamp across all 4 metric panels
**Verified:** 2026-03-28T02:55:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Hovering any of the 4 panels shows a vertical crosshair line at the same timestamp on all panels simultaneously | VERIFIED | `syncId="metrics-sync"` passed to all 4 MetricsAreaChart instances in MetricsTimeSeriesPanel.tsx:336; Recharts built-in sync active |
| 2 | Crosshair renders as a dashed vertical line across full chart height with a timestamp label | VERIFIED | `CustomCursor` memo component (MetricsAreaChart.tsx:183-222): SVG `<line>` with `strokeDasharray="3 3"`, monospace timestamp `<text>` below; wired via `<Tooltip cursor={<CustomCursor />}` at line 448 |
| 3 | CPU and Memory panels show horizontal dashed reference lines at 65% (warning) and 85% (critical) | VERIFIED | MetricsAreaChart.tsx:381-400: `showThresholds && primaryConfig?.yAxis === 'percent'` guards two `<ReferenceLine>` elements using `var(--color-threshold-critical)` and `var(--color-threshold-warn)`; MetricsTimeSeriesPanel.tsx:337 passes `showThresholds={panel.id === 'cpu' \|\| panel.id === 'memory'}` |
| 4 | User can drag-to-select a time region on any panel to zoom into that range | FAILED | Brush component exists (MetricsAreaChart.tsx:471-493) and calls `onBrushChange`. MetricsTimeSeriesPanel.tsx:162-167 wires it to `setCustomRange`. However `useMetricsData` (line 82-93) explicitly returns `data: []` when `range='custom'` — the zoom produces a blank chart, not zoomed data. Additionally, the store has a duplicate `setCustomRange` definition causing TS2300/TS1117 errors, and MetricsTimeSeriesPanel.tsx passes `range` (including `'custom'`) directly to `trpc.metrics.history.useQuery` at line 93, causing TS2769. |
| 5 | User can click an expand icon on any panel to see it full-width | VERIFIED | `expandedPanel` state (MetricsTimeSeriesPanel.tsx:160); `Maximize2`/`Minimize2` icons from lucide-react (line 19); expand button at lines 317-328; PANEL_METRICS filtered to single panel when expanded (lines 296-298); grid switches to `md:grid-cols-1`; chartHeight increases to 400 (line 169) |

**Score:** 3/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/components/metrics/MetricsAreaChart.tsx` | syncId prop, CustomCursor, threshold ReferenceLine, Brush zoom, animationDuration=0 | VERIFIED (substantive, wired) | All features present: syncId (line 352), CustomCursor memo (183-222), threshold ReferenceLines (381-400), Brush (471-493), animationDuration={0} on every Area (line 466), debounce={100} on ResponsiveContainer (line 348) |
| `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` | expandedPanel state, full-width panel rendering, brush-to-range callback | PARTIAL | expandedPanel and expand UI verified; brush wired to setCustomRange but zoom produces empty data (hollow prop to useMetricsData) |
| `apps/web/src/stores/metrics-preferences.ts` | setCustomRange action | STUB | setCustomRange added but defined twice — duplicate identifier in both the TypeScript interface (lines 15 and 18) and the Zustand store implementation (lines 46 and 50). The second definition wins at runtime but TypeScript compilation fails. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| MetricsAreaChart.tsx | MetricsTimeSeriesPanel.tsx | `syncId="metrics-sync"` | WIRED | All 4 chart instances receive the literal string at MetricsTimeSeriesPanel.tsx:336 |
| MetricsAreaChart.tsx | MetricsTimeSeriesPanel.tsx | `onBrushChange` callback | PARTIAL | Callback wired (line 338) and store action called (line 164), but data source is hollow for custom range |
| MetricsAreaChart.tsx | globals.css | CSS vars `--color-threshold-critical` and `--color-threshold-warn` | WIRED | Both CSS vars referenced in ReferenceLine stroke props; vars defined in globals.css for dark and light themes |
| MetricsTimeSeriesPanel.tsx | metrics-preferences store | `setCustomRange` | BROKEN | Duplicate identifier TS2300; second definition in Zustand store sets `customRangeFrom`/`customRangeTo` but does NOT update `customFrom`/`customTo` which is what `useMetricsData` is expected to read |
| MetricsTimeSeriesPanel.tsx | trpc.metrics.history | `range` prop | BROKEN | Line 93 passes raw `range` (type `MetricsRange` including `'custom'`) to query that expects `GrafanaTimeRange` (no `'custom'`); causes TS2769 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| MetricsAreaChart.tsx | `data` prop | `normalizedData` in MetricsTimeSeriesPanel | Yes (when range != 'custom') | FLOWING for normal ranges |
| MetricsTimeSeriesPanel.tsx (brush zoom path) | chart data after brush selection | `useMetricsData` → returns `data: []` when `range='custom'` | No | HOLLOW — brush sets range='custom', data source explicitly stubs custom range as empty |

**Root cause:** `useMetricsData.ts` line 82-93 has a known stub for custom range: `"For 'custom' ranges, the query is disabled until backend custom range support is added."` The brush zoom selects a time window but cannot display it because the API layer does not yet support custom time windows. The brush UI is wired but the goal of "zoom into that range" is not delivered.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles clean | `pnpm --filter web typecheck` | 4 errors in 2 files | FAIL |
| syncId on all 4 panels | `grep 'syncId="metrics-sync"' MetricsTimeSeriesPanel.tsx` | 1 match (line 336, inside PANEL_METRICS.map) | PASS |
| CustomCursor component exists and memoized | `grep -c 'CustomCursor\|React.memo\|memo(' MetricsAreaChart.tsx` | CustomCursor defined with memo() | PASS |
| Threshold lines use CSS vars | `grep 'color-threshold-critical\|color-threshold-warn' MetricsAreaChart.tsx` | 2 matches | PASS |
| Brush gated by data.length > 5 | `grep 'showBrush\|data.length > 5' MetricsAreaChart.tsx` | line 341: `const showBrush = chartData.length > 5 && !!onBrushChange` | PASS |
| key prop excludes data.length | `grep -c 'data.length' MetricsAreaChart.tsx` | 0 matches in key prop | PASS |
| Duplicate setCustomRange in store | `grep -c 'setCustomRange' metrics-preferences.ts` | 4 matches (2 in interface, 2 in impl) | FAIL |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VIZ-01 | 04-01-PLAN.md | 4 panels synchronized crosshair — hover one shows same timestamp on all | SATISFIED | syncId="metrics-sync" on all MetricsAreaChart instances |
| VIZ-02 | 04-01-PLAN.md | Custom crosshair cursor: vertical dashed line + timestamp label | SATISFIED | CustomCursor memo component renders SVG line + monospace text |
| VIZ-03 | 04-01-PLAN.md | Brush zoom — drag to select time region | PARTIAL | Brush UI present and calls setCustomRange, but custom range renders empty data. Goal of zoomed view not delivered. TypeScript also broken. |
| VIZ-04 | 04-01-PLAN.md | Threshold reference lines on CPU/Memory (85% critical, 65% warning) | SATISFIED | ReferenceLine at y=65 and y=85, gated by showThresholds and percent yAxis |
| VIZ-05 | 04-01-PLAN.md | Panel fullscreen expand — full-width detail view | SATISFIED | expandedPanel state, icon toggle, filtered PANEL_METRICS, height 400 when expanded |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/src/stores/metrics-preferences.ts` | 15, 18 | Duplicate `setCustomRange` in TypeScript interface | Blocker | TypeScript TS2300 compilation failure |
| `apps/web/src/stores/metrics-preferences.ts` | 46, 50 | Duplicate property `setCustomRange` in Zustand store literal | Blocker | TypeScript TS1117 compilation failure; second definition silently wins |
| `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` | 93 | Passes `MetricsRange` (includes `'custom'`) to query expecting `GrafanaTimeRange` | Blocker | TypeScript TS2769; if `range='custom'` is ever sent to the query, runtime error |
| `apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx` | 143 | `as MetricsDataPoint[]` cast on response object (not array) | Blocker | TypeScript TS2352; miscast data type |
| `apps/web/src/hooks/useMetricsData.ts` | 82-93 | `data: []` returned unconditionally for custom range | Warning | Brush zoom produces blank chart instead of zoomed view — VIZ-03 not delivered |

---

### Human Verification Required

The following cannot be verified programmatically and should be tested visually once TypeScript errors are fixed:

#### 1. Cross-Panel Crosshair Sync Visual

**Test:** Start dev servers. Navigate to any cluster's Metrics tab. Hover slowly across the CPU panel chart area.
**Expected:** A dashed vertical line appears simultaneously at the same X position in all 4 panels (CPU, Memory, Network, Pods). A monospace timestamp label appears at the bottom of the cursor line.
**Why human:** Recharts syncId behavior requires browser rendering to verify actual cross-panel sync. No programmatic way to confirm visual synchronization.

#### 2. Threshold Lines Visibility

**Test:** Navigate to a cluster with CPU/Memory data. Look at the CPU Utilization and Memory Utilization panels.
**Expected:** Two horizontal dashed lines cross the chart area — a yellow one at 65% and a red one at 85%.
**Why human:** Visual verification of line color, position, and style requires browser rendering.

#### 3. Panel Expand Toggle

**Test:** Click the expand icon (top-right of any panel). Click it again to collapse.
**Expected:** Panel expands to full width at 400px height; other panels disappear. Clicking collapse restores 2-column grid at 240px height.
**Why human:** Layout transition behavior requires visual inspection.

---

### Gaps Summary

Two categories of gaps block goal achievement:

**Category 1: TypeScript compilation broken (4 errors)**

The SUMMARY claims "TypeScript compiles clean (pnpm typecheck exits 0)" but this is false. `pnpm typecheck` exits 2 with 4 errors:

1. `metrics-preferences.ts` has `setCustomRange` declared twice in the interface (lines 15 and 18) and implemented twice in the Zustand store object (lines 46 and 50). The second implementation writes to `customRangeFrom`/`customRangeTo` while the first writes to `customFrom`/`customTo` — the two implementations are inconsistent. The fix is to remove the first definition from both the interface and the implementation.

2. `MetricsTimeSeriesPanel.tsx` line 93 passes `range` directly to the tRPC query. The query type is `GrafanaTimeRange` (no `'custom'`), but `MetricsRange` includes `'custom'`. This needs a guard (e.g. `range === 'custom' ? '24h' : range` or `skipToken` when custom).

3. `MetricsTimeSeriesPanel.tsx` line 143 casts `historyQuery.data` (an object with a `.data` array) directly to `MetricsDataPoint[]`. Should be `historyQuery.data?.data as MetricsDataPoint[] | undefined`.

**Category 2: Brush zoom is functionally hollow (VIZ-03 partial)**

The brush UI is visible and interactive. When a user drags to select a region, `setCustomRange` is called, which sets `range='custom'` in the Zustand store. However `useMetricsData` (which the hook delegates to) explicitly returns empty data for `range='custom'` pending backend support. The zoomed time window is never actually displayed. This is acknowledged in `useMetricsData.ts` line 33 as deferred work.

The phase goal "zoom into that range" is not achieved. The brush is wired UI-to-store, but the store-to-data-display path is a known stub.

**Root cause of both gaps:** The phase added `setCustomRange` to the store as an auto-fix (noted in SUMMARY as "Rule 3 deviation") but introduced a duplicate definition. The brush zoom feature was completed without implementing or integrating the custom range backend support that `useMetricsData` already stubs for.

---

_Verified: 2026-03-28T02:55:00Z_
_Verifier: Claude (gsd-verifier)_
