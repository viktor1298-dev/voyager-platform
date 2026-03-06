# 🏗️ BOARD.md — Voyager v192

**Pipeline:** v192 | **Phase:** Bug Fix + Feature Sprint  
**Status:** 🔵 RUNNING  
**Opened:** 2026-03-06  

---

## 🔴 CRITICAL

### [x] BUG-192-001 — Anomalies Tab Crashes All Navigation [v192 — Dima — 2026-03-06]
**Severity:** Critical | **Owner:** Dima | **Area:** Frontend / Routing

**What's broken:**  
When the user navigates to the Anomalies page, ALL sidebar tabs become non-functional. Clicking any nav item does nothing. The only fix is a full page refresh. This only happens after visiting Anomalies — if you never click it, everything works fine.

**Root cause hypothesis:**  
- The Anomalies component likely has an unhandled exception (JS error) that corrupts the React Router state or the global Zustand navigation store
- Possible: event listeners being added but never cleaned up (memory leak → freeze)
- Possible: async data fetch inside Anomalies throws an error that bubbles and kills the router context
- Possible: a `useEffect` with a missing cleanup that attaches conflicting router listeners

**How to fix:**  
1. Open the Anomalies page component (`apps/web/src/pages/anomalies/` or similar)
2. Wrap the entire component in a React `ErrorBoundary` — if it throws, the boundary catches it and navigation stays alive
3. Check all `useEffect` hooks for missing cleanup functions — every `addEventListener` must have a corresponding `removeEventListener` in the return function
4. Add try/catch around ALL async data fetches in the component
5. Check tRPC query hooks — if the query throws, ensure it uses `onError` handler that doesn't propagate
6. In the router: verify the Anomalies route does NOT reset or mutate the shared router context
7. Test: navigate to Anomalies → click Dashboard → verify navigation works

**Modern 2026 pattern:**  
- Use React 19 `use()` with Suspense + ErrorBoundary for data fetching
- Add Sentry-style error capture in the boundary: `console.error` + toast notification
- Never let a page component kill the app shell

---

## 🟡 HIGH

### [x] BUG-192-002 — Light Mode: Resource Utilization Bars Invisible at 0% [v192 — Dima — 2026-03-06]
**Severity:** High | **Owner:** Dima | **Area:** Frontend / Theming

**What's broken:**  
In Light Mode, when a cluster has 0% CPU or Memory utilization, the progress bars are completely invisible. There is no background track shown — just empty space. The user has no way to know that progress bars even exist in that widget. Only visible when value > 0%.

**How to fix:**  
1. Find the progress bar component used in Resource Utilization widget
2. Add a visible **track layer** (background) behind the filled bar — this track must ALWAYS be visible regardless of value
3. In Light Mode: track should be `bg-gray-200` or equivalent design token (e.g., `var(--color-progress-track)`)
4. In Dark Mode: track should be `bg-gray-700` or `var(--color-progress-track-dark)`
5. The track opacity/color must use **CSS variables from the design system** — NOT hardcoded
6. Ensure the bar label "0%" text is visible in both light and dark mode
7. Test: switch to Light Mode → verify ALL bars are visible even at 0%

**Modern 2026 pattern:**  
```tsx
// Example
<div className="w-full h-2 rounded-full bg-[var(--color-progress-track)]">
  <div 
    className="h-2 rounded-full bg-[var(--color-cpu)] transition-all duration-500"
    style={{ width: `${value}%` }} 
  />
</div>
```
Use `transition-all duration-500` for smooth animated fills when data updates.

---

### [x] BUG-192-003 — "VA" Avatar Badge: Unclear + Mispositioned [v192 — Dima — 2026-03-06]
**Severity:** High | **Owner:** Dima | **Area:** Frontend / Header UI

**What's broken:**  
A "VA" badge (user initials for "Voyager Admin") appears in the header area but:
- Vik doesn't know what it is — no tooltip, no context
- It overlaps/crowds the ONLINE status indicator
- It looks like a stray element, not an intentional design piece
- The green presence dot partially overlaps the notification count badge

**How to fix:**  
1. Identify the user avatar component in the header
2. Add a **Tooltip** (Radix UI or similar) that shows "Voyager Admin · Administrator" on hover
3. Fix positioning: the avatar should be part of the **user menu group** in the top-right nav (between notifications and logout)
4. The avatar circle should: have a border ring in the user's role color (admin = primary purple), show initials in a clean font, have an online status dot in the bottom-right corner (not top-right)
5. On click: open a user profile dropdown with: profile info, settings shortcut, logout

**Modern 2026 design:**  
```tsx
<Avatar>
  <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
    VA
  </AvatarFallback>
  {/* Online dot — bottom right */}
  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-background" />
</Avatar>
```
Use shadcn/ui `Avatar` + `Tooltip` + `DropdownMenu` — one cohesive component.

---

### [ ] BUG-192-004 — Widgets Dialog: Hardcoded Colors Don't Match Design System
**Severity:** High | **Owner:** Ron | **Area:** Frontend / Design System

**What's broken:**  
The "Add Widget" / "Widgets" selection dialog uses hardcoded hex colors (e.g., `#3B82F6`, `#10B981`) that don't match the Voyager design system. When the user switches themes, these colors stay the same and look completely out of place.

**How to fix:**  
1. Audit the Widgets dialog component — find every hardcoded color (`#xxx`, `rgb()`, `hsl()` literals)
2. Replace ALL with CSS variables or Tailwind design tokens from the project's single source of truth:
   - Source of truth for env colors: `apps/web/src/lib/cluster-meta.ts` (`ENV_META`)
   - For theme colors: use Tailwind CSS variables (`var(--primary)`, `var(--muted)`, `var(--card)`, etc.)
3. Widget category cards: use `bg-card`, `border-border`, `text-foreground`
4. Selected state: `border-primary`, `bg-primary/10`, `text-primary`
5. Icons: use `text-primary` or specific semantic color tokens
6. Zero hardcoded hex/rgb anywhere in the widgets UI

**Rule to enforce:**  
Add a comment at the top of the file: `// ⚠️ NO HARDCODED COLORS — use CSS vars only. See: lib/cluster-meta.ts`

---

### [ ] BUG-192-005 — Add Widget Functionality Silently Broken
**Severity:** High | **Owner:** Ron | **Area:** Frontend / Dashboard

**What's broken:**  
In Edit Mode, clicking "Add Widget" → selecting a widget → confirming does NOTHING. No widget is added. No error. Complete silent failure.

**How to fix (full flow investigation):**  
1. Find the `AddWidget` component and its submit handler
2. Check: is the widget being added to local Zustand store? → check the store action
3. Check: is the store update triggering a re-render of the dashboard grid?
4. Check: is the widget config being persisted (localStorage or API)?
5. Common bugs to look for:
   - `onConfirm` callback is wired to wrong function
   - Zustand `set()` not using correct state slice key
   - `gridLayout` array being mutated directly instead of creating new reference (React won't re-render)
   - Widget list is filtered to exclude already-added widgets but filtering logic is too aggressive
6. Fix the full flow: open dialog → select widget → click Add → widget appears on grid immediately → layout auto-saves

**Expected behavior after fix:**  
- Widget slides onto grid with a subtle entrance animation (`motion.div` with `initial={{ opacity: 0, scale: 0.9 }}`)
- Success toast: "Widget added ✓"
- Grid re-sorts gracefully using `react-grid-layout` or equivalent

---

## ✨ FEATURE

### [ ] FEAT-192-001 — Live 24h Graphs with Configurable Auto-Refresh
**Severity:** Feature | **Owner:** Ron | **Area:** Frontend / Dashboard / Data

**What Vik wants:**  
All dashboard graphs/charts should show the last 24 hours of data with live updates. User can configure how often the data refreshes. The UI should feel alive — not static snapshots.

**Full implementation spec:**

#### 1. Data Layer
- All time-series queries must accept `timeRange` param (default: `24h`)
- Backend tRPC/API: add `timeRange` query param to all metrics endpoints
- If real data isn't available: use mock time-series data generator that creates realistic-looking data over 24h

#### 2. Refresh Interval Selector
- Add a **global refresh control** in the dashboard header (top-right area, near the Live indicator)
- Options: `Off` | `30s` | `1m` | `5m` | `15m` | `30m` | `1h`
- Use a modern **segmented control** or **dropdown with icons**:
  ```tsx
  <Select value={interval} onValueChange={setInterval}>
    <SelectTrigger className="w-[100px] h-8 text-xs">
      <RefreshCw className="w-3 h-3 mr-1" />
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="off">Off</SelectItem>
      <SelectItem value="30">30s</SelectItem>
      <SelectItem value="60">1 min</SelectItem>
      <SelectItem value="300">5 min</SelectItem>
      ...
    </SelectContent>
  </Select>
  ```
- Store preference in `localStorage` key: `voyager:refresh-interval`
- Default: `5m` (5 minutes)

#### 3. Live Indicator
- The "LIVE" dot in the header: pulse animation when refresh is active
- Show "last updated: 2 min ago" relative timestamp that ticks every second
- On refresh: briefly show a spinning loader icon instead of the dot

#### 4. Chart Behavior
- Time axis: always show last 24h (or user-selected range: 1h, 6h, 24h, 7d)
- Add a **time range selector** per widget OR a global one: `1H · 6H · 24H · 7D`
- Smooth animated chart updates — no full re-render, just data append
- Use **Recharts** or **Tremor** with `animationDuration={300}`

#### 5. Auto-Refresh Implementation
```tsx
useEffect(() => {
  if (interval === 'off') return;
  const timer = setInterval(() => {
    refetchAllMetrics(); // invalidate all dashboard queries
    setLastUpdated(new Date());
  }, parseInt(interval) * 1000);
  return () => clearInterval(timer);
}, [interval]);
```

#### 6. Smart Features (2026 MUST-HAVE)
- **Pause on tab blur**: stop refreshing when tab is not visible (`document.visibilityState`)
- **Resume on focus**: restart timer when user returns to tab
- **Skeleton loading**: show skeleton placeholders during data fetch, not full spinner
- **Error state**: if fetch fails, show "⚠️ Data unavailable" with retry button — don't crash the widget
- **Stale indicator**: if data is >2x the refresh interval old, show "⚠️ Stale data" badge

---

## 🟡 HIGH

### [ ] BUG-192-006 — Add Cluster Wizard: No Visual Selection State (Step 1/4)
**Severity:** High | **Owner:** Ron | **Area:** Frontend / UX

**What's broken:**  
In the "Add Cluster" modal (Step 1/4), choosing a cluster type (Kubeconfig, AWS EKS, Azure AKS, Google GKE, Minikube) gives NO visual feedback. The only indication is tiny text in the corner. Completely non-modern and confusing.

**How to fix — 2026 UX standards:**

1. Find the cluster type selector component in the Add Cluster modal
2. Implement a **Card Selection Pattern**:

```tsx
// Selected card state
const selectedCard = `
  border-2 border-primary          // bold primary color border
  bg-primary/5                      // very light primary tint background  
  shadow-sm shadow-primary/20       // subtle glow
  scale-[1.02]                      // tiny scale up
  transition-all duration-200       // smooth transition
`;

const unselectedCard = `
  border border-border
  bg-card
  hover:border-primary/50
  hover:bg-primary/3
  transition-all duration-200
  cursor-pointer
`;
```

3. Add a **checkmark indicator** on selected card:
```tsx
{isSelected && (
  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
    <Check className="w-3 h-3 text-primary-foreground" />
  </div>
)}
```

4. Remove the "selected type: X" text from top-right corner — it's redundant once the card shows selection visually

5. Bonus: add a subtle **entrance animation** on the modal cards using `motion.div` with staggered delay:
```tsx
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: index * 0.05 }}
>
```

6. Fix the lone Minikube card on row 3: either add a 6th option (e.g., "Other / Manual") to fill the grid, or make the last row center-aligned

**Expected result:** User clicks a provider → card gets bold border + tint + checkmark. Unmistakable. Modern. Clean.

---

## ✅ Completed Items
*(Moved here as tasks are done)*

---

## 📋 Pipeline Checklist

- [x] BUG-192-001 — Anomalies tab crash [v192 — Dima]
- [x] BUG-192-002 — Light mode progress bars [v192 — Dima]
- [x] BUG-192-003 — VA avatar badge [v192 — Dima]
- [ ] BUG-192-004 — Widgets dialog hardcoded colors
- [ ] BUG-192-005 — Add Widget broken
- [ ] FEAT-192-001 — Live 24h graphs + refresh interval
- [ ] BUG-192-006 — Add Cluster selection state
- [ ] Code review (Lior)
- [ ] Merge + tag v192 (Gil)
- [ ] Deploy v192 (Uri) — helm uninstall + install
- [ ] E2E tests ≥88/96 (Yuval)
- [ ] Desktop QA ≥8.5/10 (Mai)
