# 🏗️ BOARD.md — Voyager v193

**Pipeline:** v193 | **Phase:** UI Polish Sprint  
**Status:** 🔵 RUNNING  
**Opened:** 2026-03-06  

---

## 🔴 HIGH

### [x] BUG-193-001 — Light Mode: Gauge Rings Invisible (CPU + Memory) ✅ v193 Ron 2026-03-06
**Severity:** High | **Owner:** Ron | **Area:** Frontend / Theming

**What's broken:**  
In Light Mode, the circular gauge rings (donut charts) for CPU and Memory in the Resource Utilization widget are **completely invisible**. Only a small floating dot appears above the percentage number. In Dark Mode everything works perfectly — meaning the ring track color is identical to the light background (white on white).

**Root cause:**  
The gauge track SVG circle has a hardcoded or CSS-variable color that evaluates to white/transparent in Light Mode. Likely `stroke="var(--color-bg-card)"` or similar — which is white in Light mode.

**How to fix:**  
1. Find the radial/donut gauge component (search: `CircularProgress`, `RadialGauge`, `donut`, `stroke-dasharray`)
2. The **track circle** (background ring) needs a visible color in both modes:
   - Light mode: `stroke="rgba(0,0,0,0.10)"` → subtle gray ring
   - Dark mode: `stroke="rgba(255,255,255,0.12)"` → subtle light ring
3. Use a CSS variable: `var(--color-gauge-track)` defined in the theme:
   ```css
   /* light */ --color-gauge-track: rgba(0,0,0,0.10);
   /* dark  */ --color-gauge-track: rgba(255,255,255,0.12);
   ```
4. The **progress arc** (filled portion) should use the existing accent color — already works.
5. Test: Light Mode → CPU 0% and Memory 0% → both rings must show visible circles even at 0%.

**Modern 2026 pattern:**  
```tsx
<circle
  cx="50" cy="50" r="40"
  fill="none"
  strokeWidth="6"
  stroke="var(--color-gauge-track)"  // ← track: visible in both modes
  strokeLinecap="round"
/>
<circle
  cx="50" cy="50" r="40"
  fill="none"
  strokeWidth="6"
  stroke="var(--color-cpu)"           // ← progress arc
  strokeDasharray={`${value * 2.51} 251`}
  strokeLinecap="round"
  transform="rotate(-90 50 50)"
/>
```

---

### [x] BUG-193-002 — Stat Card Sparklines: Erratic + Clipping Outside Cards ✅ v193 Ron 2026-03-06
**Severity:** High | **Owner:** Ron | **Area:** Frontend / Dashboard

**What's broken:**  
1. **Overflow/clipping:** Sparklines extend outside their card boundaries — peaks and valleys bleed above/below the card edges. The SVG is not constrained to its container.
2. **Erratic/random movement:** The sparklines animate randomly (moving on their own) with no meaningful pattern. They should represent 24h historical data — not random noise.
3. **24h deltas incorrect:** Labels like "+1 (24h)", "+5 (24h)" appear to be random mock data, not based on actual 24h history.

**How to fix:**

**Part A — Fix overflow:**
```tsx
// Sparkline container must clip
<div className="overflow-hidden" style={{ height: '40px' }}>
  <SparklineChart data={data} />
</div>
```
Ensure the SVG has `viewBox` and `preserveAspectRatio="none"` + parent has `overflow: hidden`.

**Part B — Fix erratic animation:**
The sparkline data should NOT be randomly generated on every render. Instead:
1. Generate 24h mock data ONCE (on mount) using `useMemo` with a **stable seed** based on the metric name:
   ```tsx
   const sparkData = useMemo(() => generateMockTimeSeries({
     seed: metricName,      // stable seed = same shape every render
     hours: 24,
     points: 48,            // 1 point per 30min
     baseline: currentValue,
     variance: 0.15,        // 15% variance for realistic look
   }), [metricName])        // only recalculate when metric changes
   ```
2. The 24h delta should be `currentValue - sparkData[0].value` (first point 24h ago vs now).
3. On live refresh: append new point, drop oldest — smooth scrolling update.

**Part C — 24h time axis:**  
When the chart is hovered or in full widget view, show X axis with timestamps:
```
11:00 PM   1:00 AM   3:00 AM   5:00 AM   ...   11:00 PM (now)
```

---

### [x] BUG-193-003 — Live Graphs: Poor Visual Quality vs 2026 Standard ✅ v193 Ron 2026-03-06
**Severity:** High | **Owner:** Ron | **Area:** Frontend / Dashboard / Charts

**What's broken (reference: Polymarket screenshot):**  
The Anomaly Timeline and other live charts look amateurish compared to a professional chart like Polymarket's. Issues:
- No clear time labels on X axis (just "24h" label, no actual timestamps)  
- Y axis has no scale or grid lines  
- Line is jagged/noisy instead of smooth  
- No "current value" indicator (like Polymarket's "Target" badge)  
- Chart doesn't clearly show 24h window start vs end

**How to fix — professional chart standard (2026):**

1. **X axis timestamps:** Show HH:MM every 4-6 hours across the 24h window
   ```
   11PM  3AM  7AM  11AM  3PM  7PM  11PM(now)
   ```

2. **Smooth line:** Use `type="monotone"` in Recharts or cubic bezier in custom SVG:
   ```tsx
   <Line type="monotone" dataKey="value" dot={false} strokeWidth={2} />
   ```

3. **Current value indicator:** A small badge/pill at the rightmost data point showing the current value (like Polymarket "Target")

4. **Subtle grid:** Horizontal dashed grid lines at major Y axis values — low opacity (`rgba(255,255,255,0.06)`)

5. **Gradient fill under line:** Semi-transparent gradient from line color to transparent:
   ```tsx
   <defs>
     <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
       <stop offset="5%" stopColor="var(--color-cpu)" stopOpacity={0.3} />
       <stop offset="95%" stopColor="var(--color-cpu)" stopOpacity={0} />
     </linearGradient>
   </defs>
   <Area dataKey="value" fill="url(#cpuGrad)" stroke="var(--color-cpu)" />
   ```

6. **Zoom/pan hint:** Small "drag to zoom" or time-range selector (1H / 6H / 24H / 7D) at top-right of each chart widget

7. **Responsive container:** Chart must resize cleanly without overflow at any viewport width

**Reference:** The Polymarket chart shows: smooth orange line, clean timestamp X axis (HH:MM), adequate left/right padding, current value badge, dashed target line. This is the visual standard to reach.

---

## 📋 Pipeline Checklist

- [x] BUG-193-001 — Light mode gauge rings ✅
- [x] BUG-193-002 — Sparklines erratic + overflow ✅
- [x] BUG-193-003 — Live charts 2026 quality ✅
- [ ] Code review (Lior) — 10/10
- [ ] Merge + tag v193 (Gil)
- [ ] Deploy v193 (Uri) — helm uninstall + install
- [ ] E2E tests ≥88/96 (Yuval)
- [ ] Desktop QA ≥8.5/10 (Mai)

---

## ✅ Completed (v192-fix)
- [x] BUG-192-001 — Anomalies tab crash ✅
- [x] BUG-192-002 — Light mode progress bars ✅
- [x] BUG-192-003 — VA Avatar badge ✅
- [x] BUG-192-004 — Widget colors hardcoded ✅
- [x] BUG-192-005 — Add Widget broken ✅
- [x] FEAT-192-001 — Live 24h graphs + refresh interval ✅
- [x] BUG-192-006 — Cluster selection state ✅
