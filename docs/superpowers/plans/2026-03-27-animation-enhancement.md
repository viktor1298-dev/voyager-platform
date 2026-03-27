# Animation Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade all animations, hover effects, and micro-interactions to "Confident & Expressive" (Raycast/Arc Style B) quality across the entire Voyager Platform frontend.

**Architecture:** 4-wave implementation — foundation first (constants + CSS), then charts + hover transitions (biggest visual impact), then buttons + forms, then polish. Each wave produces a working build. All changes use centralized `animation-constants.ts` tokens. Every Motion component respects `useReducedMotion()`.

**Tech Stack:** Motion v12 (`motion/react`), Tailwind 4, Recharts, CSS custom properties, React 19

**Spec:** `docs/superpowers/specs/2026-03-27-animation-design.md`
**Design Standards:** `docs/DESIGN.md`

---

## File Map

### Wave 1: Foundation + Charts + Hover Transitions
| Action | File |
|--------|------|
| Modify | `apps/web/src/lib/animation-constants.ts` |
| Modify | `apps/web/src/app/globals.css` |
| Modify | `apps/web/src/components/charts/chart-theme.ts` |
| Modify | `apps/web/src/components/charts/ClusterHealthChart.tsx` |
| Modify | `apps/web/src/components/charts/ResourceUsageChart.tsx` |
| Modify | `apps/web/src/components/charts/UptimeChart.tsx` |
| Modify | `apps/web/src/components/charts/RequestRateChart.tsx` |
| Modify | `apps/web/src/components/charts/AlertsTimelineChart.tsx` |
| Modify | ~40 files with missing `transition-colors` on hover states |

### Wave 2: Cards + Buttons
| Action | File |
|--------|------|
| Modify | `apps/web/src/components/MotionButton.tsx` |
| Modify | `apps/web/src/app/page.tsx` (dashboard ClusterCard) |
| Modify | `apps/web/src/app/settings/page.tsx` (settings cards) |
| Modify | `apps/web/src/app/settings/teams/page.tsx` |
| Modify | `apps/web/src/app/settings/webhooks/page.tsx` |
| Modify | `apps/web/src/components/shared/MetricCard.tsx` |
| Modify | `apps/web/src/components/dashboard/widgets/StatCardsWidget.tsx` |
| Modify | `apps/web/src/components/dashboard/DashboardGrid.tsx` |

### Wave 3: Forms + Badges + Sort + Stagger
| Action | File |
|--------|------|
| Modify | `apps/web/src/app/login/page.tsx` |
| Modify | `apps/web/src/components/DataTable.tsx` |
| Modify | `apps/web/src/components/Sidebar.tsx` (badge animations) |
| Modify | `apps/web/src/components/ui/badge.tsx` |
| Modify | `apps/web/src/components/dashboard/widgets/AlertFeedWidget.tsx` |
| Modify | `apps/web/src/app/alerts/page.tsx` |

### Wave 4: Polish
| Action | File |
|--------|------|
| Create | `apps/web/src/components/animations/SuccessCheck.tsx` |
| Modify | `apps/web/src/components/ClusterHealthIndicator.tsx` |
| Modify | `apps/web/src/app/not-found.tsx` |
| Modify | `apps/web/src/app/error.tsx` |

---

## Wave 1: Foundation + Charts + Hover Transitions

### Task 1: Update animation-constants.ts with B-Style values and new variants

**Files:**
- Modify: `apps/web/src/lib/animation-constants.ts`

- [ ] **Step 1: Update spring configs to B-style (bouncier)**

Change `EASING.spring` from `{ stiffness: 300, damping: 30 }` to `{ stiffness: 350, damping: 24 }`.
Change `EASING.bouncy` from `{ stiffness: 400, damping: 25, mass: 0.8 }` to `{ stiffness: 380, damping: 20, mass: 0.8 }`.

```ts
spring: { type: 'spring' as const, stiffness: 350, damping: 24 },
bouncy: { type: 'spring' as const, stiffness: 380, damping: 20, mass: 0.8 },
```

- [ ] **Step 2: Update cardHover and cardTap to B-style**

Replace the existing `cardHover` and `cardTap` with the enhanced versions:

```ts
export const cardHover = {
  y: -4,
  scale: 1.02,
  boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
  transition: { type: 'spring' as const, stiffness: 350, damping: 24 },
} as const

export const cardTap = {
  scale: 0.98,
} as const
```

- [ ] **Step 3: Add new button interaction variants**

Add after `cardTap`:

```ts
// Button micro-interactions (B-style)
export const buttonHover = {
  scale: 1.02,
  transition: { duration: DURATION.instant, ease: 'easeOut' as const },
} as const

export const buttonTap = {
  scale: 0.97,
  transition: { duration: DURATION.instant, ease: 'easeOut' as const },
} as const
```

- [ ] **Step 4: Add status glow variants**

Add after `healthDotVariants`:

```ts
// Status glow for alerts and critical indicators
export const glowVariants = {
  idle: { boxShadow: '0 0 0 rgba(0,0,0,0)' },
  warning: {
    boxShadow: ['0 0 0 rgba(245,158,11,0)', '0 0 12px rgba(245,158,11,0.4)', '0 0 0 rgba(245,158,11,0)'],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' as const },
  },
  critical: {
    boxShadow: ['0 0 0 rgba(239,68,68,0)', '0 0 16px rgba(239,68,68,0.5)', '0 0 0 rgba(239,68,68,0)'],
    transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const },
  },
}
```

- [ ] **Step 5: Add badge, sort, error shake, success check, and chart animation constants**

Add at end of file:

```ts
// Badge pop-in (bouncy spring)
export const badgePopVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { type: 'spring' as const, stiffness: 380, damping: 20, mass: 0.8 } },
  exit: { scale: 0, opacity: 0, transition: { duration: DURATION.fast } },
}

// Sort indicator rotation
export const sortRotateVariants = {
  asc: { rotate: 0, transition: { duration: DURATION.fast, ease: EASING.default } },
  desc: { rotate: 180, transition: { duration: DURATION.fast, ease: EASING.default } },
}

// Form error shake
export const errorShakeVariants = {
  idle: { x: 0 },
  shake: { x: [0, -8, 8, -6, 6, -3, 3, 0], transition: { duration: 0.5 } },
}

// SVG checkmark draw
export const successCheckVariants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: { pathLength: 1, opacity: 1, transition: { duration: 0.4, ease: EASING.decelerate } },
}

// Recharts animation config
export const CHART_ANIMATION = {
  duration: 800,
  durationFast: 600,
  easing: 'ease-out' as const,
  staggerDelay: 150,
} as const

// Alert entrance
export const alertEntranceVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 350, damping: 24 } },
  exit: { opacity: 0, x: 12, scale: 0.95, transition: { duration: DURATION.fast } },
}
```

- [ ] **Step 6: Verify build**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/animation-constants.ts
git commit -m "feat(animations): update constants to B-style with new variants

Add bouncier springs, card lift hover, button interactions,
status glow, badge pop, sort rotation, error shake, success
check, chart animation, and alert entrance variants."
```

---

### Task 2: Fix globals.css — add missing keyframes and focus glow

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Add fade-out keyframe after fade-in (line ~50)**

After the `fade-in` keyframe block, add:

```css
@keyframes fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
```

- [ ] **Step 2: Add glow-warning and glow-critical keyframes after glow-pulse (line ~41)**

After the `glow-pulse` keyframe block, add:

```css
@keyframes glow-warning {
  0%,
  100% {
    box-shadow: 0 0 0 rgba(245, 158, 11, 0);
  }
  50% {
    box-shadow: 0 0 12px rgba(245, 158, 11, 0.4);
  }
}

@keyframes glow-critical {
  0%,
  100% {
    box-shadow: 0 0 0 rgba(239, 68, 68, 0);
  }
  50% {
    box-shadow: 0 0 16px rgba(239, 68, 68, 0.5);
  }
}

@keyframes success-flash {
  0% {
    background-color: transparent;
  }
  30% {
    background-color: rgba(34, 197, 94, 0.1);
  }
  100% {
    background-color: transparent;
  }
}
```

- [ ] **Step 3: Add utility classes in @theme block (line ~13)**

Add to the `@theme` block:

```css
--animate-glow-warning: glow-warning 2s ease-in-out infinite;
--animate-glow-critical: glow-critical 1.5s ease-in-out infinite;
--animate-success-flash: success-flash 0.6s ease-out;
--animate-fade-out: fade-out 0.3s ease-out;
```

- [ ] **Step 4: Add global focus glow for form inputs**

Add before the `@view-transition` block (around line 663):

```css
/* Focus glow for form inputs — B-style accent ring */
input:focus-visible,
textarea:focus-visible,
select:focus-visible,
[role="combobox"]:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-accent) 15%, transparent);
  transition: outline-color 150ms ease, box-shadow 150ms ease;
}
```

- [ ] **Step 5: Verify build**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "fix(css): add missing fade-out keyframe, glow animations, focus glow

Adds fade-out (referenced by View Transitions), glow-warning,
glow-critical, success-flash keyframes. Adds global input focus
glow with accent ring for B-style form interactions."
```

---

### Task 3: Add chart animation constants to chart-theme.ts

**Files:**
- Modify: `apps/web/src/components/charts/chart-theme.ts`

- [ ] **Step 1: Import CHART_ANIMATION from animation-constants**

At top of file, add import:

```ts
import { CHART_ANIMATION } from '@/lib/animation-constants'
```

Then re-export for chart component use:

```ts
export { CHART_ANIMATION }
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/charts/chart-theme.ts
git commit -m "feat(charts): re-export CHART_ANIMATION from chart-theme"
```

---

### Task 4: Add animation props to all chart components

**Files:**
- Modify: `apps/web/src/components/charts/ClusterHealthChart.tsx`
- Modify: `apps/web/src/components/charts/ResourceUsageChart.tsx`
- Modify: `apps/web/src/components/charts/UptimeChart.tsx`
- Modify: `apps/web/src/components/charts/RequestRateChart.tsx`
- Modify: `apps/web/src/components/charts/AlertsTimelineChart.tsx`

- [ ] **Step 1: ClusterHealthChart — add animation to 3 Line components**

Import `CHART_ANIMATION` from `./chart-theme`.

On each `<Line>` component (lines ~78, ~86, ~94), add:
- First Line: `animationBegin={0} animationDuration={CHART_ANIMATION.duration} animationEasing={CHART_ANIMATION.easing}`
- Second Line: `animationBegin={CHART_ANIMATION.staggerDelay} animationDuration={CHART_ANIMATION.duration} animationEasing={CHART_ANIMATION.easing}`
- Third Line: `animationBegin={CHART_ANIMATION.staggerDelay * 2} animationDuration={CHART_ANIMATION.duration} animationEasing={CHART_ANIMATION.easing}`

- [ ] **Step 2: ResourceUsageChart — add animation to 2 Area components**

Import `CHART_ANIMATION` from `./chart-theme`.

On each `<Area>` component (lines ~108, ~116), add:
- CPU Area: `animationBegin={0} animationDuration={CHART_ANIMATION.duration} animationEasing={CHART_ANIMATION.easing}`
- Memory Area: `animationBegin={CHART_ANIMATION.staggerDelay} animationDuration={CHART_ANIMATION.duration} animationEasing={CHART_ANIMATION.easing}`

- [ ] **Step 3: UptimeChart — add animation to Bar component**

Import `CHART_ANIMATION` from `./chart-theme`.

On `<Bar>` component (line ~97), add:
`animationBegin={0} animationDuration={CHART_ANIMATION.duration} animationEasing={CHART_ANIMATION.easing}`

- [ ] **Step 4: RequestRateChart — add animation to 2 Bar components**

Import `CHART_ANIMATION` from `./chart-theme`.

On each `<Bar>` (lines ~74, ~75), add:
- Success Bar: `animationBegin={0} animationDuration={CHART_ANIMATION.durationFast} animationEasing={CHART_ANIMATION.easing}`
- Error Bar: `animationBegin={CHART_ANIMATION.staggerDelay} animationDuration={CHART_ANIMATION.durationFast} animationEasing={CHART_ANIMATION.easing}`

- [ ] **Step 5: AlertsTimelineChart — add animation to Scatter**

Import `CHART_ANIMATION` from `./chart-theme`.

Find the `<Scatter>` component and add:
`animationBegin={200} animationDuration={CHART_ANIMATION.durationFast} animationEasing={CHART_ANIMATION.easing}`

- [ ] **Step 6: Verify build**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/charts/
git commit -m "feat(charts): add entry animations to all chart components

All Line/Area/Bar/Scatter components now animate on render with
staggered delays. Uses centralized CHART_ANIMATION constants.
SparklineChart intentionally excluded (stays static)."
```

---

### Task 5: Bulk fix — add transition-colors to all missing hover states

**Files:**
- Modify: ~40 files across `apps/web/src/`

This is a mechanical sweep. For EVERY element across the codebase that has `hover:bg-*`, `hover:text-*`, or `hover:border-*` but does NOT have a `transition-` class, add `transition-colors duration-150`.

- [ ] **Step 1: Search and fix all missing transitions**

Search pattern: Find all instances of `hover:bg-` or `hover:text-` or `hover:border-` in `.tsx` files. For each, check if the same element's className also includes `transition-`. If not, add `transition-colors duration-150`.

Key files to fix (identified in audit):
- `apps/web/src/app/settings/permissions/page.tsx` — revoke button, input fields, grant button
- `apps/web/src/app/settings/page.tsx` — settings cards border hover
- `apps/web/src/app/settings/teams/page.tsx` — delete button, team card selection border
- `apps/web/src/app/settings/webhooks/page.tsx` — delete icon, copy button
- `apps/web/src/app/health/page.tsx` — row hover backgrounds
- `apps/web/src/app/clusters/page.tsx` — card button active state
- `apps/web/src/app/logs/page.tsx` — tabs hover
- `apps/web/src/app/ai/page.tsx` — button hover
- `apps/web/src/app/settings/features/page.tsx` — toggle buttons
- `apps/web/src/app/settings/audit/page.tsx` — expandable rows
- `apps/web/src/app/settings/users/page.tsx` — action buttons
- All remaining files with missing transitions

The pattern is simple: if className has `hover:bg-` but not `transition-`, add `transition-colors duration-150` to that className.

- [ ] **Step 2: Verify no visual regressions**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/
git commit -m "fix(ui): add transition-colors to all hover states missing transitions

Mechanical sweep: every hover:bg-*, hover:text-*, hover:border-*
now paired with transition-colors duration-150. Zero tolerance for
abrupt hover state changes per DESIGN.md."
```

---

## Wave 2: Cards + Buttons

### Task 6: Add card hover lift to dashboard cluster cards

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Update ClusterCard whileHover to use new cardHover constant**

The dashboard page already has `motion.div` for ClusterCard with inline hover values. Update the `whileHover` and `whileTap` to use the constants from `animation-constants.ts`:

```tsx
import { cardHover, cardTap } from '@/lib/animation-constants'

// In the ClusterCard motion.div:
whileHover={reduced ? undefined : cardHover}
whileTap={reduced ? undefined : cardTap}
```

Remove the inline `boxShadow` and `y` values — they're now in `cardHover`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "refactor(dashboard): use cardHover/cardTap constants for cluster cards"
```

---

### Task 7: Add card hover to settings page cards

**Files:**
- Modify: `apps/web/src/app/settings/page.tsx`

- [ ] **Step 1: Wrap settings section cards with motion.div**

Import `motion` from `motion/react`, `useReducedMotion` from `@/hooks/useReducedMotion`, and `cardHover`, `cardTap` from `@/lib/animation-constants`.

For each settings card (the div elements with `hover:border-*`), wrap in or convert to `motion.div` with:

```tsx
<motion.div
  whileHover={reduced ? undefined : cardHover}
  whileTap={reduced ? undefined : cardTap}
  className={/* existing classes */}
>
```

- [ ] **Step 2: Add card hover to teams page cards**

**File:** `apps/web/src/app/settings/teams/page.tsx`

Same pattern — team cards get `cardHover` + `cardTap`.

- [ ] **Step 3: Add card hover to webhooks page cards**

**File:** `apps/web/src/app/settings/webhooks/page.tsx`

Same pattern — webhook rows/cards get `cardHover` + `cardTap`.

- [ ] **Step 4: Verify build**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/settings/
git commit -m "feat(settings): add B-style card hover lift to all settings cards

Settings hub, teams, and webhooks cards now lift on hover
with spring animation and press feedback."
```

---

### Task 8: Add card hover to MetricCard and StatCardsWidget

**Files:**
- Modify: `apps/web/src/components/shared/MetricCard.tsx`
- Modify: `apps/web/src/components/dashboard/widgets/StatCardsWidget.tsx`

- [ ] **Step 1: Update MetricCard to use cardHover/cardTap**

Import `motion`, `useReducedMotion`, `cardHover`, `cardTap`. Convert the card wrapper div to `motion.div` with hover + tap.

- [ ] **Step 2: Update StatCardsWidget to use centralized constants**

The StatCardsWidget already has inline `whileHover={{ y: -2, boxShadow: '...' }}`. Replace with `cardHover` constant for consistency.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/shared/MetricCard.tsx apps/web/src/components/dashboard/widgets/StatCardsWidget.tsx
git commit -m "feat(cards): standardize MetricCard and StatCard hover to B-style constants"
```

---

### Task 9: Add dashboard widget entrance stagger

**Files:**
- Modify: `apps/web/src/components/dashboard/DashboardGrid.tsx`

- [ ] **Step 1: Add staggered entrance to widget grid**

Import `motion` from `motion/react`, `useReducedMotion`, `listContainerVariants`, `slideUpVariants` from animation-constants.

Wrap the grid layout children in a motion container that uses `listContainerVariants` (stagger: STAGGER.normal = 50ms). Each widget wrapper gets `slideUpVariants`.

If the grid uses `react-grid-layout` which renders its own children, wrap each widget's content in `motion.div`:

```tsx
<motion.div
  variants={slideUpVariants}
  initial="hidden"
  animate="visible"
>
  {widgetContent}
</motion.div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/dashboard/DashboardGrid.tsx
git commit -m "feat(dashboard): add staggered entrance animation to widgets"
```

---

## Wave 3: Forms + Badges + Sort

### Task 10: Add error shake and loading state to login form

**Files:**
- Modify: `apps/web/src/app/login/page.tsx`

- [ ] **Step 1: Add error shake to login form**

Import `motion` and `errorShakeVariants` from animation-constants.

Wrap the form in a `motion.div`:

```tsx
<motion.div
  variants={errorShakeVariants}
  animate={loginError ? 'shake' : 'idle'}
>
  <form>...</form>
</motion.div>
```

- [ ] **Step 2: Add loading spinner to submit button**

When the login mutation is pending, show spinner:

```tsx
<button disabled={isPending}>
  {isPending ? (
    <span className="flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      Signing in...
    </span>
  ) : 'Sign in'}
</button>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/login/page.tsx
git commit -m "feat(login): add error shake and loading spinner to login form"
```

---

### Task 11: Add badge pop-in animation to sidebar

**Files:**
- Modify: `apps/web/src/components/Sidebar.tsx`

- [ ] **Step 1: Add AnimatePresence + badgePopVariants to alert/anomaly badges**

Import `badgePopVariants` from animation-constants.

Find the alert badge and anomaly badge in Sidebar. Wrap each in `AnimatePresence` with the badge pop variant:

```tsx
<AnimatePresence>
  {count > 0 && (
    <motion.span
      key="alert-badge"
      variants={badgePopVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <Badge variant="destructive">{count}</Badge>
    </motion.span>
  )}
</AnimatePresence>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/Sidebar.tsx
git commit -m "feat(sidebar): add badge pop-in animation with bouncy spring"
```

---

### Task 12: Add sort indicator rotation to DataTable

**Files:**
- Modify: `apps/web/src/components/DataTable.tsx`

- [ ] **Step 1: Add animated sort icon**

Import `motion` and `sortRotateVariants` from animation-constants.

Find the sort icon rendering (where ArrowUp/ArrowDown/ArrowUpDown icons are). Wrap in `motion.div`:

```tsx
{column.getIsSorted() ? (
  <motion.div
    variants={sortRotateVariants}
    animate={column.getIsSorted() === 'asc' ? 'asc' : 'desc'}
  >
    <ArrowUp className="h-4 w-4" />
  </motion.div>
) : (
  <ArrowUpDown className="h-4 w-4 opacity-40" />
)}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/DataTable.tsx
git commit -m "feat(table): add smooth sort indicator rotation animation"
```

---

### Task 13: Add alert severity glow and entrance animation

**Files:**
- Modify: `apps/web/src/app/alerts/page.tsx`
- Modify: `apps/web/src/components/dashboard/widgets/AlertFeedWidget.tsx`

- [ ] **Step 1: Add critical/warning glow to alert rows**

In the alerts page, find alert row elements. Add the CSS glow class based on severity:

```tsx
className={cn(
  existingClasses,
  alert.severity === 'critical' && 'animate-glow-critical',
  alert.severity === 'warning' && 'animate-glow-warning',
)}
```

- [ ] **Step 2: Add alert entrance animation to AlertFeedWidget**

Import `alertEntranceVariants` and `AnimatePresence` from motion/react.

Wrap alert list items:

```tsx
<AnimatePresence>
  {alerts.map(alert => (
    <motion.div
      key={alert.id}
      variants={alertEntranceVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* alert content */}
    </motion.div>
  ))}
</AnimatePresence>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/alerts/page.tsx apps/web/src/components/dashboard/widgets/AlertFeedWidget.tsx
git commit -m "feat(alerts): add severity glow and entrance animations

Critical alerts pulse with red glow, warning with amber.
New alerts slide in from left with spring animation."
```

---

## Wave 4: Polish

### Task 14: Create SuccessCheck animation component

**Files:**
- Create: `apps/web/src/components/animations/SuccessCheck.tsx`

- [ ] **Step 1: Create the animated SVG checkmark component**

```tsx
'use client'

import { motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { successCheckVariants } from '@/lib/animation-constants'

interface SuccessCheckProps {
  className?: string
  size?: number
}

export function SuccessCheck({ className, size = 16 }: SuccessCheckProps) {
  const reduced = useReducedMotion()

  if (reduced) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
        <path
          d="M5 13l4 4L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <motion.path
        d="M5 13l4 4L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={successCheckVariants}
        initial="hidden"
        animate="visible"
      />
    </svg>
  )
}
```

- [ ] **Step 2: Export from animations index**

Add to `apps/web/src/components/animations/index.ts`:

```ts
export { SuccessCheck } from './SuccessCheck'
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/animations/
git commit -m "feat(animations): add SuccessCheck SVG draw component"
```

---

### Task 15: Add severity glow to ClusterHealthIndicator

**Files:**
- Modify: `apps/web/src/components/ClusterHealthIndicator.tsx`

- [ ] **Step 1: Add CSS glow class based on health status**

Find the health dot span. In addition to the existing Motion scale pulse, add the CSS glow class:

```tsx
className={cn(
  'rounded-full',
  status === 'critical' && 'animate-glow-critical',
  status === 'degraded' && 'animate-glow-warning',
)}
```

This layers the CSS glow on top of the existing Motion scale pulse for a richer effect.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/ClusterHealthIndicator.tsx
git commit -m "feat(health): add CSS glow to cluster health indicator dots"
```

---

### Task 16: Final consistency sweep — replace inline animation values with constants

**Files:**
- Modify: Various files with inline animation values

- [ ] **Step 1: Search for inline easing arrays**

Search for hardcoded `[0.25, 0.1, 0.25, 1]` or `[0, 0, 0.2, 1]` or `ease: 'easeOut'` in .tsx files. Replace each with the appropriate `EASING.*` constant.

Key instances found in audit:
- `apps/web/src/app/page.tsx` (ClusterCard): inline easing → `EASING.default`
- `apps/web/src/components/AnimatedStatCount.tsx`: hardcoded easing → `EASING.decelerate`
- `apps/web/src/components/dashboard/widgets/StatCardsWidget.tsx`: `ease: 'easeOut'` → use constant

- [ ] **Step 2: Search for inline duration values**

Search for hardcoded `duration: 0.15` or `duration: 0.2` etc. Replace with `DURATION.*` constants where they match.

- [ ] **Step 3: Verify full build**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck && pnpm build`
Expected: Both pass with 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/
git commit -m "refactor(animations): replace all inline values with animation constants

DRY sweep: all hardcoded easing arrays, duration values, and
spring configs now use centralized DURATION/EASING/STAGGER tokens
from animation-constants.ts per DESIGN.md."
```

---

### Task 17: Final verification

- [ ] **Step 1: Full typecheck**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`
Expected: 0 errors

- [ ] **Step 2: Full build**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm build`
Expected: All pages compile

- [ ] **Step 3: Lint check**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm lint`
Expected: No new errors

---

## Summary

| Wave | Tasks | Focus | Key Metric |
|------|-------|-------|------------|
| 1 | 1-5 | Foundation + Charts + Hover | Charts go 0% → 100%, 40 hover fixes |
| 2 | 6-9 | Cards + Buttons + Dashboard | All interactive cards lift, widgets stagger |
| 3 | 10-13 | Forms + Badges + Sort + Alerts | Login shake, badge pop, sort rotation, alert glow |
| 4 | 14-17 | Polish + Consistency | SuccessCheck component, health glow, DRY sweep |
