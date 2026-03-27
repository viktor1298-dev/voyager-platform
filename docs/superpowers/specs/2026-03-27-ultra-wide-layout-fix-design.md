# Ultra-Wide Layout Fix — Fluid Full-Width

**Date:** 2026-03-27
**Status:** Approved
**Approach:** A — Fluid Full-Width (remove max-width cap, register breakpoints)

## Problem

On ultra-wide monitors (~3440px), the dashboard content is constrained to a narrow 1400px column hugging the left side, leaving ~58% of the screen as dead space. The root cause is `max-w-[min(1400px,100vw)]` in `AppLayout.tsx:111`.

Additionally, `3xl:` and `4xl:` responsive utility classes already exist in the dashboard page code but are dead — Tailwind v4 requires custom breakpoints to be registered via `--breakpoint-*` in `@theme`, which was never done.

## Solution

Remove the outer max-width cap and register the missing breakpoints so the existing responsive code activates. Add an `xl` breakpoint to `react-grid-layout` so the widget dashboard also expands.

## Files Changed

### 1. `apps/web/src/components/AppLayout.tsx` (line 111)

**Before:**
```tsx
className="p-3 sm:p-5 w-full max-w-[min(1400px,100vw)] overflow-x-hidden bg-dot-grid min-h-full"
```

**After:**
```tsx
className="p-3 sm:p-5 w-full overflow-x-hidden bg-dot-grid min-h-full"
```

Remove `max-w-[min(1400px,100vw)]`. The `w-full` and `overflow-x-hidden` remain.

### 2. `apps/web/src/app/globals.css` (inside `@theme` block)

Add custom breakpoints so that `3xl:` and `4xl:` utility classes (already used in `page.tsx`) become active:

```css
@theme {
  /* existing entries ... */
  --breakpoint-3xl: 112rem;  /* 1792px */
  --breakpoint-4xl: 140rem;  /* 2240px */
}
```

**Why these values:**
- `3xl: 112rem` (1792px) — triggers on large desktop monitors (1920px viewport minus sidebar)
- `4xl: 140rem` (2240px) — triggers on ultra-wide monitors (3440px class)
- These activate the already-written responsive classes in `page.tsx` lines 496, 530, 543, 568, 596

### 3. `apps/web/src/components/dashboard/DashboardGrid.tsx` (line 109)

Add `xl` breakpoint to `react-grid-layout`:

**Before:**
```tsx
breakpoints={{ lg: 1280, md: 996, sm: 768, xs: 480 }}
cols={{ lg: 12, md: 12, sm: 6, xs: 1 }}
```

**After:**
```tsx
breakpoints={{ xl: 1920, lg: 1280, md: 996, sm: 768, xs: 480 }}
cols={{ xl: 12, lg: 12, md: 12, sm: 6, xs: 1 }}
```

The `xl` breakpoint at 1920px ensures widget layouts adapt properly on wide screens. Column count stays at 12 (widgets fill wider columns rather than adding more columns, which would break existing user-saved layouts).

**Persist safety:** Existing users with Zustand-persisted layouts (`dashboard-layout-v1` key) won't have an `xl` entry. This is safe — `react-grid-layout`'s `ResponsiveGridLayout` falls back to the nearest smaller breakpoint (`lg`) when a layout for the active breakpoint is missing.

### 4. `apps/web/src/stores/dashboard-layout.ts` (function `makeDefaultLayouts`)

Add `xl` layout to default layouts:

```typescript
function makeDefaultLayouts(): ResponsiveLayouts {
  return {
    xl: [
      { i: 'w-stat-cards', x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 2 },
      { i: 'w-cluster-health', x: 0, y: 2, w: 12, h: 5, minW: 6, minH: 3 },
      { i: 'w-anomaly-timeline', x: 0, y: 7, w: 12, h: 3, minW: 6, minH: 2 },
    ],
    lg: [ /* unchanged */ ],
    // ... rest unchanged
  }
}
```

## What We're NOT Changing

- **Individual page layouts** — Clusters, alerts, events, logs, settings pages all use flex/grid layouts that naturally expand with available width. No changes needed.
- **Text readability caps** — This is a dashboard (cards, tables, charts), not a blog. No `max-w-prose` needed.
- **Centering** — Content flows from sidebar edge rightward, consistent with current behavior.
- **Mobile/tablet layouts** — Only affects screens wider than the existing `lg` (1280px) breakpoint. All current responsive behavior preserved.

## Impact Assessment

| Screen Size | Before | After |
|-------------|--------|-------|
| Mobile (<768px) | No change | No change |
| Tablet (768-1280px) | No change | No change |
| Desktop (1280-1792px) | Content capped at 1400px | Content fills width (gain ~300px) |
| Large Desktop (1792-2240px) | Content capped at 1400px | Full width + `3xl:` grid activates |
| Ultra-wide (2240px+) | Content capped at 1400px | Full width + `4xl:` grid activates |

## Testing

- Verify on standard 1920x1080 desktop — content should fill width naturally
- Verify on ultra-wide resolution — fleet grid, cluster cards, and widget dashboard should use full width
- Verify mobile (375px) and tablet (768px) are unchanged
- Verify existing user-saved dashboard layouts are not broken (Zustand persisted state)
- `pnpm typecheck` and `pnpm build` must pass
