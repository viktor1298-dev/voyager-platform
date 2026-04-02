# Sidebar Visual Redesign — Style B: Neon Depth

**Date:** 2026-04-02
**Scope:** Visual upgrade of the existing sidebar navigation — same structure, same items, modernized visual treatment with bug fix.
**Style:** Neon Depth — gradient active backgrounds, pulsing neon accent bar, icon glow, hover color shift.

---

## Problem Statement

The current sidebar has three issues:

1. **Selection bug:** When a nav item is selected, the icon visually shifts out of bounds in collapsed mode. Root cause: dual `layoutId` Motion divs (`sidebar-active-bg` + `sidebar-active-border`) use `absolute inset-0` inside nav items that change dimensions between expanded (gap-3, px-3) and collapsed (w-10, justify-center, px-0, mx-auto). Motion springs the layout between these geometries, stretching the absolute element beyond container bounds.

2. **Dead CSS code:** `.sidebar-nav-item` hover classes in `globals.css` reference a class never applied to the `<Link>` elements. The `.sidebar-active-bar::before` pseudo-element draws a 3px accent bar while a separate `layoutId="sidebar-active-border"` Motion div draws a 2px bar — redundant.

3. **Mixed animation paradigm:** Width uses CSS transitions, active indicators use Motion `layoutId`, labels use `AnimatePresence`, hover effects reference unused CSS — no unified approach.

## Design Direction

**Keep:** Same 6 nav items, clusters accordion, collapse/expand toggle, version display, keyboard shortcut (⌘B), auto-collapse on cluster detail, mobile drawer.

**Upgrade:** Active state treatment, hover interactions, badge styling, animation architecture, centralized tokens.

## What Gets Preserved (No Changes)

- Navigation config (`config/navigation.ts`) — same 6 items
- AppLayout (`AppLayout.tsx`) — same auto-collapse, mobile hamburger, spring main content offset
- Sidebar width: 224px expanded, 56px collapsed
- CSS `transition-[width] duration-200 ease-out` for sidebar width (hardware-accelerated)
- `data-collapsible` attribute propagation for child selectors
- `AnimatePresence` for label show/hide on collapse
- TooltipProvider with 300ms delay in collapsed mode
- Clusters accordion with tRPC query and env-color dots
- Alert badge count with `badgePopVariants` spring entrance
- Anomaly badge logic (DB-003)
- Keyboard shortcut ⌘B with `keyboardToggleRef` for near-instant toggle
- Mobile backdrop + close button + translateX slide
- Accessibility: `aria-current`, `aria-expanded`, `aria-label`, focus rings, skip-to-content

## Active State — Expanded

| Property | Value | Source |
|----------|-------|--------|
| Background | `var(--sidebar-active-gradient)` | globals.css |
| Left accent bar | 2.5px wide, solid `--color-accent` | Sidebar.tsx |
| Bar glow | Pulsing via CSS `@keyframes sidebar-bar-pulse` (not Motion — see note below) | globals.css |
| Bar pulse timing | 2.5s ease-in-out infinite | CSS `@keyframes` |
| Icon color | `--color-accent` | Sidebar.tsx |
| Icon glow | `filter: var(--sidebar-icon-glow)` | globals.css |
| Text color | `--color-text-primary` | Existing |
| Text weight | `font-weight: 600` | Sidebar.tsx |
| Border radius | 8px | Sidebar.tsx |
| Active bar animation | Single `layoutId="sidebar-active-bar"` with `EASING.snappy` | animation-constants.ts |

**Architecture change:** Remove `layoutId="sidebar-active-bg"` (the stretching div). Active background is CSS-only (no layout animation needed — it appears instantly per item). Only the accent **bar** uses `layoutId` for the spring slide effect between items.

**Bar glow uses CSS `@keyframes`, not Motion keyframes.** Motion v12's WAAPI path cannot interpolate `boxShadow` values containing `var()` CSS custom property references — it falls back to discrete steps (strobe, not smooth pulse). CSS `@keyframes` resolves `var()` at runtime and interpolates correctly. Bonus: the existing `prefers-reduced-motion` wildcard rule in globals.css automatically disables CSS animations, so no extra JS logic needed.

**No explicit `<LayoutGroup>` needed.** The single `layoutId="sidebar-active-bar"` uses Motion v12's global layout scope. All nav items are in the same component tree, so the spring slide between items works without wrapping in `<LayoutGroup>`. Do not add one — it would over-scope and break the transition.

**All decorative motion.div elements must have `aria-hidden="true"`.** The accent bar and active background divs are purely visual — screen readers should skip them.

**Collapsed bar position:** In collapsed mode, `mx-auto` + `w-10` centers the icon container within the `w-14` sidebar. The bar's `left: 0` positions it at the left edge of the w-10 container (2px inset from the sidebar outer edge). This is intentional — it aligns the bar with the icon box, not the sidebar edge.

**Hover physics intentionally differ between states.** Expanded uses a tween (`duration: 150ms, ease: default`) for the `translateX(2px)` shift — crisp and linear. Collapsed uses a spring (`stiffness: 400, damping: 25`) for the `scale(1.1)` — bouncy and tactile. Different physics for different gestalts by design.

**Touch devices:** Motion `whileHover` does not fire on touch — this is correct. Tap feedback (`whileTap`) provides the only interaction response on mobile. No separate handling needed.

## Active State — Collapsed

| Property | Value |
|----------|-------|
| Background | `var(--sidebar-active-bg-collapsed)` (accent/14% radial) |
| Left bar | Same 2.5px with glow, at container left edge |
| Icon | Accent color + drop-shadow glow |
| Border radius | 8px |
| Tooltip | Radix tooltip, 300ms delay, `side="right"` `sideOffset={8}` |

## Hover State — Inactive Items

| Property | Expanded | Collapsed |
|----------|----------|-----------|
| Background | `var(--sidebar-hover-bg)` — `rgba(255,255,255,0.03)` | `var(--sidebar-hover-bg-collapsed)` — `rgba(255,255,255,0.04)` |
| Icon color | Shift to `--color-accent` (200ms ease) | Same |
| Icon transform | `translateX(2px)` (150ms ease) | `scale(1.1)` (spring 400/25) |
| Text color | `--color-text-primary` (150ms) | N/A |
| Border radius | 8px | 8px |
| Tap feedback | `scale(0.97)` on press | `scale(0.95)` on press |

## Alerts Badge

| State | Expanded | Collapsed |
|-------|----------|-----------|
| Background | Gradient `#ef4444 → #dc2626` | 8px red dot, top-right absolute |
| Glow | `var(--sidebar-badge-glow)` — `0 0 8px rgba(239,68,68,0.4)` | `0 0 6px rgba(239,68,68,0.5)` |
| Entrance | Bouncy spring `badgePopVariants` (existing) | Same |
| Exit | Fast scale 1→0 `DURATION.fast` (existing) | Same |

## Clusters Accordion

| Property | Value |
|----------|-------|
| Chevron rotation | 0→180° with `EASING.default`, 200ms |
| Expand/collapse | `height: auto` with spring `EASING.spring` (stiffness 350, damping 24) |
| Sub-item hover | `bg-accent/5%`, text shift to `--color-text-primary` |
| Active cluster | `bg-accent/8%` with env-color dot |

## Collapse/Expand Toggle

No changes to behavior. Visual upgrade:

| Property | Value |
|----------|-------|
| Hover bg | `rgba(255,255,255,0.06)` |
| Hover icon color | `--color-text-secondary` |
| Transition | `transition-colors 150ms` |

## New CSS Variables — globals.css (Dark)

```css
/* Sidebar Neon Depth tokens */
--sidebar-active-gradient: linear-gradient(90deg,
  color-mix(in srgb, var(--color-accent) 18%, transparent),
  color-mix(in srgb, var(--color-accent) 3%, transparent));
--sidebar-active-bg-collapsed: color-mix(in srgb, var(--color-accent) 14%, transparent);
--sidebar-bar-glow: 0 0 16px color-mix(in srgb, var(--color-accent) 60%, transparent),
  0 0 4px color-mix(in srgb, var(--color-accent) 80%, transparent);
--sidebar-bar-glow-pulse-min: 0 0 8px color-mix(in srgb, var(--color-accent) 30%, transparent),
  0 0 3px color-mix(in srgb, var(--color-accent) 60%, transparent);
--sidebar-bar-glow-pulse-max: 0 0 18px color-mix(in srgb, var(--color-accent) 50%, transparent),
  0 0 5px color-mix(in srgb, var(--color-accent) 90%, transparent);
--sidebar-icon-glow: drop-shadow(0 0 6px color-mix(in srgb, var(--color-accent) 40%, transparent));
--sidebar-badge-glow: 0 0 8px rgba(239, 68, 68, 0.4);
--sidebar-badge-glow-collapsed: 0 0 6px rgba(239, 68, 68, 0.5);
--sidebar-hover-bg: rgba(255, 255, 255, 0.03);
--sidebar-hover-bg-collapsed: rgba(255, 255, 255, 0.04);
```

## New CSS Variables — globals.css (Light)

```css
--sidebar-active-gradient: linear-gradient(90deg,
  color-mix(in srgb, var(--color-accent) 12%, transparent),
  color-mix(in srgb, var(--color-accent) 2%, transparent));
--sidebar-active-bg-collapsed: color-mix(in srgb, var(--color-accent) 10%, transparent);
--sidebar-bar-glow: 0 0 8px color-mix(in srgb, var(--color-accent) 30%, transparent);
--sidebar-bar-glow-pulse-min: 0 0 4px color-mix(in srgb, var(--color-accent) 15%, transparent);
--sidebar-bar-glow-pulse-max: 0 0 10px color-mix(in srgb, var(--color-accent) 30%, transparent);
--sidebar-icon-glow: drop-shadow(0 0 4px color-mix(in srgb, var(--color-accent) 25%, transparent));
--sidebar-badge-glow: 0 0 6px rgba(239, 68, 68, 0.25);
--sidebar-badge-glow-collapsed: 0 0 4px rgba(239, 68, 68, 0.3);
--sidebar-hover-bg: rgba(0, 0, 0, 0.03);
--sidebar-hover-bg-collapsed: rgba(0, 0, 0, 0.04);
```

## CSS @keyframes — globals.css

The bar glow pulse uses CSS `@keyframes` (not Motion) because Motion v12 cannot interpolate `boxShadow` with `var()` references. CSS resolves vars at paint time and interpolates correctly. The existing `prefers-reduced-motion` wildcard rule automatically disables it.

```css
@keyframes sidebar-bar-pulse {
  0%, 100% { box-shadow: var(--sidebar-bar-glow-pulse-min); }
  50% { box-shadow: var(--sidebar-bar-glow-pulse-max); }
}
```

Applied to the accent bar element via: `animation: sidebar-bar-pulse 2.5s ease-in-out infinite;`

## New Animation Constants — animation-constants.ts

```ts
// Sidebar — icon hover shift (expanded, tween — crisp linear feel)
export const sidebarIconHoverVariants = {
  idle: { x: 0 },
  hover: { x: 2, transition: { duration: DURATION.fast, ease: EASING.default } },
}

// Sidebar — icon hover scale (collapsed, spring — bouncy tactile feel)
export const sidebarCollapsedIconHover = {
  scale: 1.1,
  transition: { type: 'spring', stiffness: 400, damping: 25 },
}

// Sidebar — tap feedback (expanded)
export const sidebarTapFeedback = {
  scale: 0.97,
  transition: { duration: DURATION.instant },
}

// Sidebar — tap feedback (collapsed)
export const sidebarTapFeedbackCollapsed = {
  scale: 0.95,
  transition: { duration: DURATION.instant },
}
```

## Code to Remove (Dead/Duplicate)

**Implementation order:** Remove old code and add new tokens in the **same commit**. Do not split into separate steps — removing `--sidebar-hover-shift` before adding the new tokens leaves an interim state where the dead CSS silently falls back to `translateX(0)`.

| File | What | Why |
|------|------|-----|
| `globals.css` | `.sidebar-active-bar::before` pseudo-element | Replaced by Motion accent bar with CSS glow pulse |
| `globals.css` | `.sidebar-hover-bar` and `.sidebar-hover-bar:hover::before` | Replaced by Motion hover variants |
| `globals.css` | `.sidebar-nav-item .sidebar-icon` hover rules | Class `sidebar-nav-item` never applied to `<Link>` — dead code |
| `globals.css` | `.sidebar-nav-item .sidebar-label` hover rules | Same — dead code |
| `globals.css` | `--sidebar-hover-shift` variable | Replaced by `sidebarIconHoverVariants` |
| `globals.css` | `prefers-reduced-motion` block for `.sidebar-nav-item` | Dead code (class never used) |
| `Sidebar.tsx` | `layoutId="sidebar-active-bg"` motion div | Root cause of selection bug — replaced by CSS gradient |
| `Sidebar.tsx` | `layoutId="sidebar-active-border"` motion div | Merged into single `layoutId="sidebar-active-bar"` |

## Reduced Motion Support

Two mechanisms:

1. **CSS animations** (bar glow pulse): Automatically disabled by the existing `prefers-reduced-motion` wildcard in globals.css (line ~580: `animation-duration: 0.01ms !important`). No JS needed.
2. **Motion animations** (hover, tap, layoutId): Controlled by `useReducedMotion()` hook in Sidebar.tsx.

| Feature | Normal | Reduced | Mechanism |
|---------|--------|---------|-----------|
| Bar glow pulse | 2.5s CSS animation | Static glow (no pulse) | CSS `prefers-reduced-motion` wildcard |
| Icon hover translateX | 2px shift | Instant color change only, no transform | `useReducedMotion()` conditional |
| Icon hover scale (collapsed) | 1.1 spring | No scale | `useReducedMotion()` conditional |
| Tap scale feedback | 0.97 / 0.95 | Disabled | `useReducedMotion()` conditional |
| Active bar `layoutId` spring | Snappy spring (500/40) | `duration: 0.01` instant | `useReducedMotion()` + transition override |
| Badge entrance | Bouncy spring | Instant appear (opacity only) | `useReducedMotion()` conditional |

## Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/components/Sidebar.tsx` | Rewrite active state, hover interactions, remove dual layoutId, add Motion variants |
| `apps/web/src/app/globals.css` | Add sidebar tokens (dark + light), remove dead sidebar CSS |
| `apps/web/src/lib/animation-constants.ts` | Add sidebar glow/hover/tap variants |
| `apps/web/src/config/navigation.ts` | No changes |
| `apps/web/src/components/AppLayout.tsx` | No changes |

## Acceptance Criteria

1. Selection bug fixed — icon stays centered in collapsed mode when switching active items
2. Active state shows gradient background + pulsing neon accent bar in both expanded and collapsed
3. Active icon is accent-colored with drop-shadow glow
4. Hover shows icon color shift to accent (expanded + collapsed)
5. Hover shows icon translateX(2px) expanded, scale(1.1) collapsed
6. Tap shows scale(0.97) expanded, scale(0.95) collapsed
7. Alert badge has gradient background + glow shadow
8. All new values use centralized CSS variables and animation constants — zero hardcoded values
9. All dead CSS removed
10. Light mode parity — all tokens have light overrides
11. Reduced motion respected — all animations degrade gracefully
12. Both dark and light themes tested with zero console errors
13. No visual regression on clusters accordion, mobile drawer, or collapse toggle
