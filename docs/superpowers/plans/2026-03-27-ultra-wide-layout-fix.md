# Ultra-Wide Layout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the 1400px max-width cap so the dashboard fills the entire screen on ultra-wide monitors, and activate already-written `3xl:`/`4xl:` responsive breakpoints.

**Architecture:** Four surgical edits — remove one CSS class from the layout shell, register two Tailwind breakpoints, and add one `react-grid-layout` breakpoint with its default layout. No new files, no new dependencies.

**Tech Stack:** Next.js 16, Tailwind CSS 4, react-grid-layout, Zustand

**Spec:** `docs/superpowers/specs/2026-03-27-ultra-wide-layout-fix-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/components/AppLayout.tsx` | Modify line 111 | Remove `max-w-[min(1400px,100vw)]` |
| `apps/web/src/app/globals.css` | Modify `@theme` block | Register `--breakpoint-3xl` and `--breakpoint-4xl` |
| `apps/web/src/components/dashboard/DashboardGrid.tsx` | Modify lines 109-110 | Add `xl: 1920` breakpoint to react-grid-layout |
| `apps/web/src/stores/dashboard-layout.ts` | Modify `makeDefaultLayouts()` | Add `xl` default layout |

---

### Task 1: Remove max-width cap from AppLayout

**Files:**
- Modify: `apps/web/src/components/AppLayout.tsx:111`

- [ ] **Step 1: Edit AppLayout.tsx**

In `apps/web/src/components/AppLayout.tsx` line 111, change:

```tsx
className="p-3 sm:p-5 w-full max-w-[min(1400px,100vw)] overflow-x-hidden bg-dot-grid min-h-full"
```

to:

```tsx
className="p-3 sm:p-5 w-full overflow-x-hidden bg-dot-grid min-h-full"
```

Remove only `max-w-[min(1400px,100vw)]`. Keep everything else.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors (this is a CSS-only change, should not affect types)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/AppLayout.tsx
git commit -m "fix: remove 1400px max-width cap from AppLayout

Content was constrained to 1400px, wasting 58% of ultra-wide screens.
Now flows to fill all available width."
```

---

### Task 2: Register 3xl and 4xl Tailwind breakpoints

**Files:**
- Modify: `apps/web/src/app/globals.css` (inside `@theme` block, around line 13-25)

- [ ] **Step 1: Add breakpoints to @theme**

In `apps/web/src/app/globals.css`, inside the existing `@theme { ... }` block, add these two lines at the end (before the closing `}`):

```css
  --breakpoint-3xl: 112rem;
  --breakpoint-4xl: 140rem;
```

The full `@theme` block should look like:

```css
@theme {
  --animate-pulse-slow: pulse-slow var(--duration-pulse) ease-in-out infinite;
  --animate-glow-pulse: glow-pulse 2s ease-in-out infinite;
  --animate-fade-in: fade-in 0.3s ease-out;
  --animate-fade-out: fade-out 0.3s ease-out;
  --animate-slide-up: slide-up 0.3s ease-out;
  --animate-glow-warning: glow-warning 2s ease-in-out infinite;
  --animate-glow-critical: glow-critical 1.5s ease-in-out infinite;
  --animate-success-flash: success-flash 0.6s ease-out;
  --animate-count-up: count-up 0.6s ease-out;
  --color-surface: var(--surface);
  --color-elevated: var(--elevated);
  --breakpoint-3xl: 112rem;
  --breakpoint-4xl: 140rem;
}
```

This activates `3xl:` and `4xl:` utility classes already used in `apps/web/src/app/page.tsx` (lines 496, 530, 543, 568, 596) that were previously dead code.

- [ ] **Step 2: Verify build passes**

Run: `pnpm --filter web build`
Expected: Build succeeds. Tailwind now generates CSS for `3xl:` and `4xl:` variants.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat: register 3xl/4xl Tailwind breakpoints for ultra-wide screens

3xl (112rem/1792px) and 4xl (140rem/2240px) activate existing responsive
grid classes in the dashboard page that were previously dead code."
```

---

### Task 3: Add xl breakpoint to DashboardGrid

**Files:**
- Modify: `apps/web/src/components/dashboard/DashboardGrid.tsx:109-110`

- [ ] **Step 1: Edit DashboardGrid.tsx**

In `apps/web/src/components/dashboard/DashboardGrid.tsx`, change lines 109-110 from:

```tsx
            breakpoints={{ lg: 1280, md: 996, sm: 768, xs: 480 }}
            cols={{ lg: 12, md: 12, sm: 6, xs: 1 }}
```

to:

```tsx
            breakpoints={{ xl: 1920, lg: 1280, md: 996, sm: 768, xs: 480 }}
            cols={{ xl: 12, lg: 12, md: 12, sm: 6, xs: 1 }}
```

Column count stays at 12 for `xl` — widgets fill wider columns, preserving existing user-saved layouts. Missing `xl` layouts in persisted Zustand state fall back to `lg` automatically.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/DashboardGrid.tsx
git commit -m "feat: add xl breakpoint to dashboard widget grid

react-grid-layout now has xl (1920px) breakpoint. Widgets render at
proper widths on large/ultra-wide screens instead of using the lg layout."
```

---

### Task 4: Add xl default layout to dashboard store

**Files:**
- Modify: `apps/web/src/stores/dashboard-layout.ts:101-124` (function `makeDefaultLayouts`)

- [ ] **Step 1: Edit dashboard-layout.ts**

In `apps/web/src/stores/dashboard-layout.ts`, in the `makeDefaultLayouts()` function, add the `xl` layout as the first entry in the returned object:

Change from:

```typescript
function makeDefaultLayouts(): ResponsiveLayouts {
  return {
    lg: [
```

to:

```typescript
function makeDefaultLayouts(): ResponsiveLayouts {
  return {
    xl: [
      { i: 'w-stat-cards', x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 2 },
      { i: 'w-cluster-health', x: 0, y: 2, w: 12, h: 5, minW: 6, minH: 3 },
      { i: 'w-anomaly-timeline', x: 0, y: 7, w: 12, h: 3, minW: 6, minH: 2 },
    ],
    lg: [
```

The `xl` layout matches `lg` (full-width widgets at 12 cols). Existing users with persisted layouts won't have `xl` — react-grid-layout falls back to `lg` gracefully.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/stores/dashboard-layout.ts
git commit -m "feat: add xl default layout for dashboard widgets

New users and reset-to-default get proper xl breakpoint layout.
Existing persisted layouts fall back to lg automatically."
```

---

### Task 5: Final verification

- [ ] **Step 1: Full build check**

Run: `pnpm build`
Expected: All packages build successfully, 0 errors.

- [ ] **Step 2: Lint check**

Run: `pnpm lint`
Expected: 0 errors (no new lint issues introduced).

- [ ] **Step 3: Type check**

Run: `pnpm typecheck`
Expected: 0 errors.
