# Sidebar Visual Redesign (Style B: Neon Depth) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the sidebar's visual treatment to Style B (Neon Depth) — gradient active backgrounds, pulsing neon accent bar, icon glow, hover color shift — while fixing the selection bug caused by dual layoutId Motion divs.

**Architecture:** Three files modified atomically: globals.css (add CSS tokens + @keyframes, remove dead CSS), animation-constants.ts (add hover/tap Motion variants), Sidebar.tsx (rewrite active/hover states using new tokens and variants, fix selection bug by removing dual layoutId). No structural changes — same 6 nav items, same collapse behavior, same accordion.

**Tech Stack:** Next.js 16, React 19, Motion v12, Tailwind 4, CSS custom properties, Lucide icons

**Spec:** `docs/superpowers/specs/2026-04-02-sidebar-redesign-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/web/src/app/globals.css` | Modify | Add sidebar Neon Depth CSS tokens (dark + light), `@keyframes sidebar-bar-pulse`, remove 6 blocks of dead CSS |
| `apps/web/src/lib/animation-constants.ts` | Modify | Add 4 sidebar Motion variants (icon hover, collapsed hover, tap, tap collapsed) |
| `apps/web/src/components/Sidebar.tsx` | Modify | Rewrite active state (single layoutId bar + CSS bg), add Motion hover/tap, import useReducedMotion, add aria-hidden |

---

### Task 1: Add sidebar CSS tokens and @keyframes to globals.css

**Files:**
- Modify: `apps/web/src/app/globals.css:242-243` (dark tokens — replace `--sidebar-hover-shift`)
- Modify: `apps/web/src/app/globals.css` (light overrides — add after existing light vars ~line 399)
- Modify: `apps/web/src/app/globals.css:545-557` (remove dead `.sidebar-nav-item` hover rules)
- Modify: `apps/web/src/app/globals.css:575-593` (remove dead `prefers-reduced-motion` `.sidebar-nav-item` block)
- Modify: `apps/web/src/app/globals.css:716-745` (remove dead `.sidebar-active-bar` and `.sidebar-hover-bar`)

- [ ] **Step 1: Replace `--sidebar-hover-shift` with new Neon Depth tokens in `:root` block**

Find in globals.css (line ~242):
```css
  /* Sidebar micro-interactions */
  --sidebar-hover-shift: 2px;
```

Replace with:
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

- [ ] **Step 2: Add light mode overrides in `html.light` block**

Add after the last existing light mode variable (inside `html.light {}`, after the `--gradient-ai-info` line ~399):

```css
  /* Sidebar Neon Depth tokens (light) */
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

- [ ] **Step 3: Add `@keyframes sidebar-bar-pulse`**

Add right before the existing `/* Respect prefers-reduced-motion */` block (~line 575):

```css
/* Sidebar active bar glow pulse — CSS @keyframes, not Motion (var() interpolation) */
@keyframes sidebar-bar-pulse {
  0%, 100% { box-shadow: var(--sidebar-bar-glow-pulse-min); }
  50% { box-shadow: var(--sidebar-bar-glow-pulse-max); }
}
```

- [ ] **Step 4: Remove dead sidebar CSS blocks**

Delete the following blocks entirely:

1. Lines ~545-557 — `.sidebar-nav-item .sidebar-icon` and `.sidebar-nav-item .sidebar-label` hover rules (class never applied):
```css
/* Sidebar hover micro-interactions */
.sidebar-nav-item .sidebar-icon {
  transition: transform var(--duration-fast) ease;
}
.sidebar-nav-item .sidebar-label {
  transition: transform var(--duration-fast) ease;
}
.sidebar-nav-item:hover .sidebar-icon {
  transform: translateX(var(--sidebar-hover-shift));
}
.sidebar-nav-item:hover .sidebar-label {
  transform: translateX(1px);
}
```

2. Lines ~584-587 inside the `prefers-reduced-motion` block — remove only the `.sidebar-nav-item` lines:
```css
  .sidebar-nav-item:hover .sidebar-icon,
  .sidebar-nav-item:hover .sidebar-label {
    transform: none !important;
  }
```

3. Lines ~716-745 — `.sidebar-active-bar` and `.sidebar-hover-bar` blocks:
```css
/* Sidebar active accent bar */
.sidebar-active-bar {
  position: relative;
}
.sidebar-active-bar::before {
  content: "";
  position: absolute;
  left: 0;
  top: 25%;
  bottom: 25%;
  width: 3px;
  background: var(--color-accent);
  border-radius: 0 3px 3px 0;
}

/* Sidebar hover bar preview */
.sidebar-hover-bar {
  position: relative;
}
.sidebar-hover-bar:hover::before {
  content: "";
  position: absolute;
  left: 0;
  top: 25%;
  bottom: 25%;
  width: 3px;
  background: var(--color-accent);
  border-radius: 0 3px 3px 0;
  opacity: 0.3;
}
```

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors (CSS-only changes, no TS impact)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "style(sidebar): add Neon Depth CSS tokens and remove dead sidebar CSS"
```

---

### Task 2: Add sidebar Motion variants to animation-constants.ts

**Files:**
- Modify: `apps/web/src/lib/animation-constants.ts` (append after last export, ~line 316)

- [ ] **Step 1: Add sidebar Motion variants**

Append to the end of `animation-constants.ts`:

```ts
// Sidebar Neon Depth — icon hover scale (collapsed, spring)
export const sidebarCollapsedIconHover = {
  scale: 1.1,
  transition: { type: 'spring' as const, stiffness: 400, damping: 25 },
}

// Sidebar Neon Depth — tap feedback (expanded)
export const sidebarTapFeedback = {
  scale: 0.97,
  transition: { duration: DURATION.instant },
}

// Sidebar Neon Depth — tap feedback (collapsed)
export const sidebarTapFeedbackCollapsed = {
  scale: 0.95,
  transition: { duration: DURATION.instant },
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/animation-constants.ts
git commit -m "style(sidebar): add Neon Depth Motion variants for hover and tap"
```

---

### Task 3: Rewrite Sidebar.tsx active states, hover effects, and fix selection bug

This is the main task. It rewrites the nav item rendering in `Sidebar.tsx` to use the new CSS tokens and Motion variants, and fixes the selection bug by removing the dual `layoutId` approach.

**Files:**
- Modify: `apps/web/src/components/Sidebar.tsx`

**Key changes:**
1. Add import for `useReducedMotion` hook
2. Add import for new animation constants
3. Remove `layoutId="sidebar-active-bg"` div (bug source) — replace with CSS-only gradient bg
4. Rewrite `layoutId="sidebar-active-border"` → single `layoutId="sidebar-active-bar"` with CSS glow pulse
5. Add `aria-hidden="true"` to decorative motion divs
6. Wrap nav items in `motion.div` for `whileHover` / `whileTap` effects
7. Add icon color shift and transform on hover via Motion variants
8. Add gradient badge glow on alerts badge

- [ ] **Step 1: Add new imports**

In `Sidebar.tsx`, update the imports from `animation-constants`:

Find:
```ts
import { badgePopVariants, EASING } from '@/lib/animation-constants'
```

Replace with:
```ts
import {
  badgePopVariants,
  EASING,
  sidebarCollapsedIconHover,
  sidebarTapFeedback,
  sidebarTapFeedbackCollapsed,
} from '@/lib/animation-constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'
```

- [ ] **Step 2: Add `useReducedMotion` hook call**

Inside the `Sidebar` function body, after the `const anomalyCount = useAnomalyCount()` line (~line 41), add:

```ts
const reducedMotion = useReducedMotion()
```

- [ ] **Step 3: Rewrite the nav link rendering — replace dual layoutId with single bar + CSS bg**

Find the nav link's active state section (lines ~186-201):
```tsx
                  {/* P3-002 / SB-007: Active background with layoutId spring + left accent border */}
                  {isNavActive && (
                    <motion.div
                      layoutId="sidebar-active-bg"
                      className="absolute inset-0 bg-[var(--color-accent)]/10 rounded-lg sidebar-active-bar"
                      transition={EASING.snappy}
                    />
                  )}
                  {/* SB-008: Reduce active border bar from 3px -> 2px */}
                  {isNavActive && (
                    <motion.div
                      layoutId="sidebar-active-border"
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-[var(--color-accent)]"
                      transition={EASING.snappy}
                    />
                  )}
```

Replace with:
```tsx
                  {/* Neon Depth: CSS-only gradient background (no layoutId — fixes selection bug) */}
                  {isNavActive && (
                    <div
                      className={[
                        'absolute inset-0 rounded-lg',
                        isDesktop && collapsed
                          ? 'bg-[var(--sidebar-active-bg-collapsed)]'
                          : 'bg-[image:var(--sidebar-active-gradient)]',
                      ].join(' ')}
                      aria-hidden="true"
                    />
                  )}
                  {/* Neon Depth: Single layoutId accent bar with CSS glow pulse */}
                  {isNavActive && (
                    <motion.div
                      layoutId="sidebar-active-bar"
                      className="absolute left-0 top-[15%] bottom-[15%] w-[2.5px] rounded-r-full bg-[var(--color-accent)]"
                      style={{
                        boxShadow: 'var(--sidebar-bar-glow)',
                        animation: reducedMotion ? 'none' : 'sidebar-bar-pulse 2.5s ease-in-out infinite',
                      }}
                      transition={reducedMotion ? { duration: 0.01 } : EASING.snappy}
                      aria-hidden="true"
                    />
                  )}
```

- [ ] **Step 4: Update icon styling for active glow and hover color shift**

Find the icon element (line ~203):
```tsx
                  <Icon className="sidebar-icon h-4 w-4 shrink-0 relative z-10" />
```

Replace with:
```tsx
                  <Icon
                    className="h-4 w-4 shrink-0 relative z-10 transition-colors duration-200"
                    style={isNavActive ? {
                      color: 'var(--color-accent)',
                      filter: 'var(--sidebar-icon-glow)',
                    } : undefined}
                  />
```

- [ ] **Step 5: Add font-weight 600 to active label**

Find the label motion.span (lines ~206-216):
```tsx
                      <motion.span
                        key="label"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                        className="sidebar-label text-[13px] font-medium relative z-10 overflow-hidden whitespace-nowrap flex-1"
                      >
```

Replace `font-medium` with a conditional:
```tsx
                      <motion.span
                        key="label"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                        className={[
                          'text-[13px] relative z-10 overflow-hidden whitespace-nowrap flex-1',
                          isNavActive ? 'font-semibold' : 'font-medium',
                        ].join(' ')}
                      >
```

- [ ] **Step 6: Add gradient + glow to alerts badge (expanded)**

Find the alerts badge span (lines ~227-229):
```tsx
                        className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 relative z-10"
```

Replace with:
```tsx
                        className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-white text-[10px] font-bold px-1 relative z-10"
                        style={{
                          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                          boxShadow: 'var(--sidebar-badge-glow)',
                        }}
```

- [ ] **Step 7: Add glow to collapsed alerts dot**

Find the collapsed badge dot (lines ~243-246):
```tsx
                        className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 z-10"
```

Replace with:
```tsx
                        className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 z-10"
                        style={{ boxShadow: 'var(--sidebar-badge-glow-collapsed)' }}
```

- [ ] **Step 8: Wrap nav link with motion hover/tap effects**

Find the `navLink` constant definition. The entire `<Link>` element needs to be wrapped in a `motion.div` to get `whileHover` and `whileTap`. 

Find the Link's className array (lines ~170-183) — update the Link itself to be wrapped. Replace the `const navLink = (` section.

Before the `<Link>` (line 158), wrap the entire navLink in a motion container. The simplest approach: convert the `<Link>` wrapper `<div>` (line 299) / `<Tooltip>` (line 292) into `motion.div` with hover/tap props.

Actually, the cleanest approach is to add the hover/tap to the `<Link>` by replacing it with `motion(Link)`. But since we use Next.js Link with `asChild` patterns, the simplest reliable approach is to add inline `onMouseEnter`/`onMouseLeave` state for icon color, and use the existing `style={{ transition: 'color 150ms ease' }}` on the Link.

**Important: `motion.div` must be OUTSIDE `<Tooltip>`, not inside `<TooltipTrigger asChild>`.** Radix `asChild` clones props onto its single child — if that child is `motion.div`, it becomes the tooltip anchor instead of the `<Link>`. Place motion wrapper outside to keep `<Link>` as the tooltip trigger target.

Find the wrappedNavLink section (lines ~290-300):
```tsx
              const wrappedNavLink =
                isDesktop && collapsed ? (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8} className="text-xs">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div key={item.id}>{navLink}</div>
                )
```

Replace with:
```tsx
              const wrappedNavLink =
                isDesktop && collapsed ? (
                  <motion.div
                    key={item.id}
                    whileHover={!isNavActive && !reducedMotion ? sidebarCollapsedIconHover : undefined}
                    whileTap={!reducedMotion ? sidebarTapFeedbackCollapsed : undefined}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8} className="text-xs">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  </motion.div>
                ) : (
                  <motion.div
                    key={item.id}
                    whileTap={!reducedMotion ? sidebarTapFeedback : undefined}
                  >
                    {navLink}
                  </motion.div>
                )
```

- [ ] **Step 9: Add hover background and icon color shift to the Link**

Update the Link's className to include hover bg. Find (line ~170):
```tsx
                  className={[
                    'relative flex items-center py-2.5 rounded-lg',
                    // SB-002: respond to data-collapsible via group selectors
                    'gap-3 px-3',
                    'group-data-[collapsible=icon]:gap-0',
                    'group-data-[collapsible=icon]:justify-center',
                    'group-data-[collapsible=icon]:px-0',
                    'group-data-[collapsible=icon]:mx-auto',
                    'group-data-[collapsible=icon]:w-10',
                    'group-data-[collapsible=icon]:h-10',
                    isNavActive
                      ? 'text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                  ].join(' ')}
                  style={{ transition: 'color 150ms ease' }}
```

Replace with:
```tsx
                  className={[
                    'relative flex items-center py-2.5 rounded-lg',
                    'gap-3 px-3',
                    'group-data-[collapsible=icon]:gap-0',
                    'group-data-[collapsible=icon]:justify-center',
                    'group-data-[collapsible=icon]:px-0',
                    'group-data-[collapsible=icon]:mx-auto',
                    'group-data-[collapsible=icon]:w-10',
                    'group-data-[collapsible=icon]:h-10',
                    isNavActive
                      ? 'text-[var(--color-text-primary)]'
                      : [
                          'text-[var(--color-text-secondary)]',
                          'hover:text-[var(--color-text-primary)]',
                          isDesktop && collapsed
                            ? 'hover:bg-[var(--sidebar-hover-bg-collapsed)]'
                            : 'hover:bg-[var(--sidebar-hover-bg)]',
                        ].join(' '),
                  ].join(' ')}
                  style={{ transition: 'color 150ms ease, background-color 150ms ease' }}
```

- [ ] **Step 10: Add hover icon color shift via CSS**

Update the Icon to shift to accent on hover. Replace the Icon from Step 4:
```tsx
                  <Icon
                    className="h-4 w-4 shrink-0 relative z-10 transition-colors duration-200"
                    style={isNavActive ? {
                      color: 'var(--color-accent)',
                      filter: 'var(--sidebar-icon-glow)',
                    } : undefined}
                  />
```

With a version that includes the hover color shift AND translateX(2px) via CSS group-hover (this replaces the deleted `sidebarIconHoverVariants` — CSS is cleaner here since Motion `whileHover` would require converting Icon to a motion element):
```tsx
                  <Icon
                    className={[
                      'h-4 w-4 shrink-0 relative z-10 transition-[color,filter,transform] duration-200',
                      !isNavActive && 'group-hover/navitem:text-[var(--color-accent)] group-hover/navitem:translate-x-0.5',
                    ].filter(Boolean).join(' ')}
                    style={isNavActive ? {
                      color: 'var(--color-accent)',
                      filter: 'var(--sidebar-icon-glow)',
                    } : undefined}
                  />
```

Note: `translate-x-0.5` = 2px in Tailwind 4 (0.5 * 4px = 2px). This delivers the spec's `translateX(2px)` hover requirement via CSS instead of the `sidebarIconHoverVariants` Motion variant (which was removed — Motion would require wrapping the Icon in a motion element for whileHover, adding unnecessary complexity).

And add the `group/navitem` class to the `<Link>`:

Find the Link's className first line:
```tsx
                    'relative flex items-center py-2.5 rounded-lg',
```
Replace with:
```tsx
                    'group/navitem relative flex items-center py-2.5 rounded-lg',
```

- [ ] **Step 11: Remove `sidebar-icon` and `sidebar-label` class names**

These classes referenced dead CSS. Remove `sidebar-icon` from the Icon className (already done in step 10 — the new Icon doesn't include it). Remove `sidebar-label` from the label span.

The label motion.span from Step 5 no longer includes `sidebar-label` — confirm it's not present.

- [ ] **Step 12: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 13: Verify build passes**

Run: `pnpm build`
Expected: All pages compile successfully

- [ ] **Step 14: Commit**

```bash
git add apps/web/src/components/Sidebar.tsx
git commit -m "feat(sidebar): implement Neon Depth visual redesign and fix selection bug

- Replace dual layoutId (active-bg + active-border) with single bar + CSS bg
- Add gradient active background, pulsing neon accent bar with CSS @keyframes
- Add icon accent color + glow on active state
- Add hover icon color shift, hover background, tap scale feedback
- Add gradient + glow to alerts badge
- Add aria-hidden to decorative motion divs
- Add useReducedMotion for graceful degradation
- Remove sidebar-icon/sidebar-label dead class references"
```

---

### Task 4: Visual verification

**Files:** None (read-only verification)

- [ ] **Step 1: Start dev servers**

Run: `pnpm dev`
Expected: API + Web start without errors

- [ ] **Step 2: Test dark mode — expanded sidebar**

Navigate to Dashboard. Verify:
- Active item (Dashboard) shows gradient background fading right
- Left accent bar pulses with neon glow
- Dashboard icon is accent-colored with drop-shadow
- Dashboard label is font-weight 600
- Hovering Clusters: icon shifts to accent color, background appears
- Hovering Alerts: same hover treatment, red gradient badge with glow visible

- [ ] **Step 3: Test dark mode — collapsed sidebar**

Press ⌘B to collapse. Verify:
- Active icon stays centered (selection bug fixed)
- Active icon has accent color + glow
- Background is solid accent/14% (not gradient)
- Left accent bar with glow pulse visible
- Hover on inactive: slight scale-up on icon
- Alerts dot has red glow
- Tooltips appear on hover (300ms delay)

- [ ] **Step 4: Test light mode — both states**

Switch to light theme. Verify:
- Reduced glow intensity (dimmer shadows)
- Gradient still visible but subtler
- All text contrast is readable
- Badge glow is softer

- [ ] **Step 5: Test navigation spring**

Click between Dashboard → Clusters → Alerts → Events rapidly. Verify:
- Accent bar springs smoothly between items (layoutId)
- No icon shifting or layout jumping
- Background appears/disappears per item (no spring — instant)

- [ ] **Step 6: Test cluster accordion**

Expand Clusters accordion. Navigate to a cluster detail page. Verify:
- Sidebar auto-collapses
- Active state transfers correctly to collapsed mode
- No visual glitches during collapse animation

- [ ] **Step 7: Test mobile drawer**

Resize browser to < 768px (or use DevTools responsive mode). Verify:
- Hamburger button opens sidebar drawer
- Active state shows gradient bg + accent bar (same as expanded desktop)
- Hover effects work on non-touch interactions
- Close button works
- Backdrop click closes drawer
- No visual regressions vs. current mobile behavior

- [ ] **Step 8: Check console**

Open browser DevTools console. Verify: 0 errors, 0 warnings related to sidebar.

- [ ] **Step 9: Test reduced motion**

In System Preferences > Accessibility > Display > Reduce motion: ON. Verify:
- Bar glow pulse stops (static glow)
- No icon shift/scale on hover
- No tap scale feedback
- Bar still slides between items but near-instantly

---

### Task 5: Final commit with all changes

- [ ] **Step 1: Verify all 3 files are committed**

Run: `git log --oneline -5`
Expected: See commits for globals.css, animation-constants.ts, and Sidebar.tsx

- [ ] **Step 2: Verify clean git status**

Run: `git status`
Expected: No uncommitted changes in the 3 modified files
