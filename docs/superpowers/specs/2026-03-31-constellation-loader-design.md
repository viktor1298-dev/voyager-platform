# Constellation Loader — Design Spec

**Date:** 2026-03-31
**Replaces:** Skeleton shimmer loading screens (`ResourceLoadingSkeleton`, `TableLoadingSkeleton`, `SectionLoadingSkeleton`)

---

## Summary

Replace all data-loading skeleton screens (the animated gray bars) with a full-width constellation particle animation. Floating dots connected by lines move slowly across the content area, with the resource loading label and connection status centered on top.

## Visual Specification

- **20-30 dots** moving in random directions at slow speed, bouncing off container edges
- **Connection lines** drawn between dots within ~80px of each other, opacity fading with distance
- Colors: `var(--color-accent)` for dots (opacity 0.5-0.7) and lines (opacity 0.05-0.15) — works in both themes
- **Centered text overlay:**
  - Primary: `label` prop (e.g., "Loading services...") — `text-sm font-medium`, `--color-text-secondary`
  - Subtitle: "Connecting to cluster" — `text-xs`, `--color-text-dim`
- Container height: `min-h-[400px]` filling available content area below tab bar
- Canvas renders at device pixel ratio for crisp dots on retina

## Reduced Motion

When `useReducedMotion()` returns true:
- Dots rendered statically (no `requestAnimationFrame` loop)
- Lines still drawn between nearby dots
- Text still shows
- No animation, zero motion

## Component API

```tsx
<ConstellationLoader label="Loading services..." />
```

Props:
- `label?: string` — defaults to "Loading resources..."

## Files Modified

| File | Change |
|---|---|
| `apps/web/src/components/animations/ConstellationLoader.tsx` | **Create** — canvas particle animation + centered text |
| `apps/web/src/components/resource/ResourceLoadingSkeleton.tsx` | **Modify** — all three exports render `ConstellationLoader` instead of skeleton bars |

## What Stays the Same

- All consumer pages (pods, services, nodes, rbac, etc.) — they import from `ResourceLoadingSkeleton.tsx`, no changes needed
- Loading label props — passed through to `ConstellationLoader`
- Accessibility: `role="status"`, `aria-busy="true"`, `aria-label` preserved
- `app/loading.tsx` and `app/clusters/[id]/loading.tsx` — navigation skeletons, untouched
- `Skeleton.tsx`, `CardSkeleton.tsx`, `TableSkeleton.tsx` — base components untouched (used elsewhere)
- `skeleton-shimmer` CSS — still used by other components

## Implementation Details

- HTML `<canvas>` element for particle rendering — no DOM nodes per dot
- **SSR safety:** Canvas setup, `ResizeObserver`, and `requestAnimationFrame` must all run inside `useEffect` only (not during render). The component is `'use client'` but Next.js still server-renders it — `document`/`window` APIs are not available during SSR.
- `requestAnimationFrame` loop with proper cleanup: `useEffect` return must call both `cancelAnimationFrame(id)` and `observer.disconnect()`
- Dots array initialized with `useRef` (stable across renders)
- Canvas size tracks container via `ResizeObserver`
- Device pixel ratio scaling for retina: `canvas.width = el.width * dpr`, `ctx.scale(dpr, dpr)`
- **Deprecated props:** `TableLoadingSkeleton` keeps its `rows`/`cols` signature and `SectionLoadingSkeleton` keeps its `sections` signature for TypeScript compatibility — these props are silently ignored (only `label` is passed to `ConstellationLoader`)
- **Removed imports:** `DURATION`, `EASING`, `STAGGER` imports from `animation-constants.ts` are removed from `ResourceLoadingSkeleton.tsx` (no longer needed — canvas animation doesn't use Motion variants)

## Testing Checklist

- [ ] All resource pages show constellation animation instead of skeleton bars
- [ ] Animation renders in both dark and light themes
- [ ] Text shows correct resource label (e.g., "Loading pods...", "Loading nodes...")
- [ ] Subtitle "Connecting to cluster" visible
- [ ] Reduced motion: static dots, no animation
- [ ] Canvas cleans up on unmount (no memory leaks)
- [ ] Console: 0 errors
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` passes

## QA Validation (Loop Until 100% Pass)

After implementation, run full QA. If any check fails, fix and re-run from step 1.

1. Restart dev servers (`pnpm dev:restart`)
2. Navigate to a cluster detail page
3. Click Services tab — verify constellation loader appears (not skeleton bars)
4. Click Pods tab — verify constellation loader
5. Click Nodes tab — verify constellation loader
6. Test at least one more tab (RBAC, CRDs, or Autoscaling)
7. Switch to light theme — verify animation looks correct
8. Check browser console — 0 errors
9. Navigate away and back — verify no canvas memory leaks (performance tab)
10. Screenshot for QA record

**Exit condition:** 10/10 checks pass. No partial passes.
