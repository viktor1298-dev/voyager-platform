# Animation & Micro-Interaction Design Spec

**Date:** 2026-03-27
**Style:** B — Confident & Expressive (Raycast/Arc)
**Approach:** Hybrid — System First + Priority Waves

---

## 1. Animation Philosophy

Voyager Platform animations follow the **Raycast/Arc style**: confident, expressive, premium. Every animation expresses a cause-effect relationship. Springs feel physical. Success moments feel rewarding. Critical alerts demand attention through pulse and glow.

### Core Principles

| Principle | Rule | Source |
|-----------|------|--------|
| Spring-first | Default to spring physics (stiffness 300-400, damping 20-30) for interactive elements | Apple HIG, Material Motion |
| Exit faster than enter | Exit animations at ~60-70% of enter duration | Material Design motion spec |
| Meaningful motion | Every animation expresses cause-effect, not decoration | UI/UX Pro Max §7: motion-meaning |
| Stagger for hierarchy | Lists/grids cascade 30-50ms per item | Material Design §7: stagger-sequence |
| Scale for feedback | 0.95-1.05 scale on press/hover for tappable elements | HIG + Material state layers |
| Glow for status | Critical states get animated glow, not just color | Ops-specific: draws attention to what matters |
| Reduced motion | All animations respect `prefers-reduced-motion` | Non-negotiable accessibility |
| Transform-only | Animate only transform and opacity; never width/height/top/left | UI/UX Pro Max §7: transform-performance |
| Duration 150-300ms | Micro-interactions stay in 150-300ms range; complex transitions max 400ms | UI/UX Pro Max §7: duration-timing |

---

## 2. Timing Tokens

All values live in `apps/web/src/lib/animation-constants.ts`. Never use inline magic numbers.

### Durations (seconds)

| Token | Value | Usage |
|-------|-------|-------|
| `DURATION.instant` | 0.08 | Button tap, micro-feedback |
| `DURATION.fast` | 0.15 | Hover states, quick transitions |
| `DURATION.normal` | 0.2 | General UI transitions |
| `DURATION.slow` | 0.3 | Status changes, health indicators |
| `DURATION.page` | 0.25 | Page entry/exit |
| `DURATION.counter` | 0.8 | Animated number count-up |
| `DURATION.counterLarge` | 1.2 | Large number animations |

### Easings

| Token | Value | Usage |
|-------|-------|-------|
| `EASING.default` | `[0.25, 0.1, 0.25, 1]` | Standard smooth curve |
| `EASING.standard` | `[0.4, 0, 0.2, 1]` | Material Design standard |
| `EASING.decelerate` | `[0, 0, 0.2, 1]` | Entering elements (ease-out) |
| `EASING.accelerate` | `[0.4, 0, 1, 1]` | Exiting elements (ease-in) |
| `EASING.spring` | stiffness: 350, damping: 24 | General spring (B-style: bouncier) |
| `EASING.snappy` | stiffness: 500, damping: 40 | Sidebar active indicator, responsive |
| `EASING.bouncy` | stiffness: 380, damping: 20, mass: 0.8 | Delight moments (badges, success) |
| `EASING.exit` | `[0.4, 0, 1, 1]` | Quick exit curve |
| `EASING.enter` | `[0, 0, 0.2, 1]` | Slow enter curve |

### Stagger Delays (seconds)

| Token | Value | Usage |
|-------|-------|-------|
| `STAGGER.fast` | 0.03 | Dense table rows |
| `STAGGER.normal` | 0.05 | Card grids, dashboard widgets |
| `STAGGER.slow` | 0.08 | Hero cards, feature sections |
| `STAGGER.max` | 0.3 | Cap total stagger (10 items max) |

---

## 3. Variant Presets

All defined in `animation-constants.ts`. Components use these — never define inline variants.

| Variant | Entry | Exit | Usage |
|---------|-------|------|-------|
| `fadeVariants` | opacity 0→1 | opacity 1→0 | Light visibility transitions |
| `slideUpVariants` | opacity 0→1, y 8→0 | opacity 1→0, y 0→-4 | General content entrance |
| `scaleVariants` | opacity 0→1, scale 0.95→1 | opacity 1→0, scale 1→0.95 | Cards, modals |
| `pageVariants` | opacity 0→1, y 6→0 | opacity 1→0, y 0→-4 | Page transitions |
| `listContainerVariants` | staggerChildren: 0.03 | — | List/grid wrappers |
| `listItemVariants` | opacity 0→1, y 6→0 | opacity 1→0, scale 1→0.95 | Individual list items |
| `dialogVariants` | scale 0.96→1, y 4→0 | scale 1→0.96, y 0→4 | Modals, dialogs |
| `overlayVariants` | opacity 0→1 | opacity 1→0 | Backdrop overlays |
| `cardHover` | scale 1.02, y -4, boxShadow lift | — | Interactive card hover |
| `cardTap` | scale 0.98 | — | Interactive card press |
| `buttonHover` | scale 1.02 | — | Button hover |
| `buttonTap` | scale 0.97 | — | Button press |
| `badgePopVariants` | scale 0→1 (bouncy spring) | scale 1→0 | Badge entrance/exit |
| `successCheckVariants` | pathLength 0→1 | — | SVG checkmark draw |
| `errorShakeVariants` | x: [0,-8,8,-6,6,-3,3,0] | — | Form error shake |
| `sortRotateVariants` | rotate 0 or 180 | — | Sort indicator |
| `glowVariants` | boxShadow pulse | — | Status indicator glow |
| `healthDotVariants` | scale pulse by severity | — | Cluster health dots |

---

## 4. Component Animation Requirements

### 4.1 Cards

Every interactive card MUST have:
- **Hover:** `whileHover` with `y: -4`, elevated `boxShadow`, spring transition (stiffness 350, damping 24)
- **Tap:** `whileTap` with `scale: 0.98`
- **Entry:** `slideUpVariants` or staggered via parent `listContainerVariants`
- **Reduced motion:** All gesture props set to `undefined` when reduced

**Applies to:** ClusterCard, MetricCard, SettingsCard, TeamCard, WebhookCard, AlertCard, AnomalyWidget, WidgetLibraryDrawer items, FeatureFlagCard.

### 4.2 Buttons

**Primary/CTA buttons (MotionButton):**
- `whileHover={{ scale: 1.02 }}` + `whileTap={{ scale: 0.97 }}`
- Loading state: spinner icon replacing text, button disabled
- Success state: animated SVG checkmark (0.4s draw), then revert after 1.2s
- Error state: brief red flash via `transition-colors`

**Ghost/Icon buttons (CSS only):**
- `transition-colors duration-150` on all hover states
- `active:scale-95` for press feedback
- No Motion library needed — CSS handles these

### 4.3 Charts (Recharts)

Every chart component (except SparklineChart) MUST set:
- `animationBegin`: stagger per series (0, 150, 300ms)
- `animationDuration`: 800ms (lines/areas), 600ms (bars), 600ms (scatter)
- `animationEasing`: `"ease-out"`

Wrap chart containers in `motion.div` with `whileInView` trigger (viewport once: true).

SparklineChart stays `isAnimationActive={false}` — intentionally static for inline metrics.

### 4.4 Forms

**Input focus:**
- `focus-visible:` outline (2px solid accent) + box-shadow glow (4px accent/15%)
- Smooth transition: `transition: outline-color 150ms, box-shadow 150ms`

**Validation error:**
- Error shake on form container: `errorShakeVariants` (0.5s)
- Auto-focus first invalid field after submission
- Error message fades in below field: `fadeVariants`

**Submit feedback:**
- Loading: spinner replacing button text + disabled state
- Success: checkmark draw animation (0.4s) → toast notification
- Error: shake + red flash on button

### 4.5 Hover Transitions

EVERY element with `hover:bg-*`, `hover:text-*`, or `hover:border-*` MUST also have `transition-colors duration-150` (or `transition-all duration-150` if multiple properties change).

**Zero tolerance for abrupt hover state changes.** This is a mechanical sweep — no exceptions.

### 4.6 Status Indicators

Severity hierarchy through animation:

| Severity | Dot Scale | Glow | Duration | Repeat |
|----------|-----------|------|----------|--------|
| Critical | [1, 1.5, 1] | Red 16px radius | 1.5s | infinite |
| Warning/Degraded | [1, 1.3, 1] | Amber 12px radius | 2s | infinite |
| Info | static (scale 1) | none | — | — |
| Healthy | static (scale 1) | none | — | — |

### 4.7 Alerts

- **New alert entrance:** slide from left (x: -12 → 0) + fade, spring transition
- **Acknowledge:** scale down + fade out (0.2s)
- **Critical alert row:** `glow-critical` CSS animation on the row background
- **Alert feed widget:** new alerts animate in with `listItemVariants`

### 4.8 Dashboard Widgets

- **Widget grid:** Parent wraps in `listContainerVariants` with `STAGGER.normal`
- **Each widget:** `slideUpVariants` for entrance
- **Stat card numbers:** AnimatedNumber counter (already implemented)
- **Widget resize/drag:** CSS `transition-all` during edit mode

### 4.9 DataTable Sort

- Sort icon: `motion.div` with `sortRotateVariants` — rotates 180deg on direction change
- Sort column header: brief background flash on click (`transition-colors`)

### 4.10 Badges

- **Entrance:** `badgePopVariants` — scale from 0 with bouncy spring
- **Exit:** scale to 0, fast (0.15s)
- **Count change:** AnimatePresence with key={count} for number flip

### 4.11 Sidebar (Existing — Maintain)

Already excellent. No changes needed:
- layoutId spring indicators (snappy)
- Label collapse/expand (AnimatePresence)
- Chevron rotation
- Cluster accordion

### 4.12 Dialogs & Sheets (Existing — Maintain)

Already good. No changes needed:
- Dialog: scale + fade with `dialogVariants`
- Sheet: CSS slide-in-right
- Overlay: `overlayVariants`

### 4.13 Page Transitions (Existing — Maintain)

Already good. No changes needed:
- `pageVariants` with View Transitions API fallback
- `useReducedMotion` hook respected

---

## 5. CSS Foundation Fixes

### globals.css additions:

```css
/* Missing fade-out keyframe (referenced by View Transitions API) */
@keyframes fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* Status glow keyframes */
@keyframes glow-warning {
  0%, 100% { box-shadow: 0 0 0 rgba(245, 158, 11, 0); }
  50% { box-shadow: 0 0 12px rgba(245, 158, 11, 0.4); }
}

@keyframes glow-critical {
  0%, 100% { box-shadow: 0 0 0 rgba(239, 68, 68, 0); }
  50% { box-shadow: 0 0 16px rgba(239, 68, 68, 0.5); }
}

/* Success flash */
@keyframes success-flash {
  0% { background-color: transparent; }
  30% { background-color: rgba(34, 197, 94, 0.1); }
  100% { background-color: transparent; }
}

/* Focus glow for form inputs */
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-accent) 15%, transparent);
  transition: outline-color 150ms ease, box-shadow 150ms ease;
}

/* Utility classes */
.glow-warning { animation: glow-warning 2s ease-in-out infinite; }
.glow-critical { animation: glow-critical 1.5s ease-in-out infinite; }
.animate-success-flash { animation: success-flash 0.6s ease-out; }

/* Scrollbar hover transition (Webkit) */
::-webkit-scrollbar-thumb {
  transition: background-color var(--duration-fast) ease;
}
```

### Focus state standardization:

Replace all `focus:` with `focus-visible:` across form components. Standard pattern:
```
focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-4 focus-visible:ring-accent/15
```

---

## 6. Implementation Waves

### Wave 1: Critical (Charts + Missing Transitions + Card Hovers)

1. Update `animation-constants.ts` with B-style values and new variants
2. Fix `globals.css` — add fade-out, glow keyframes, focus glow, utility classes
3. Add Recharts animation props to all 5 chart components
4. Add `transition-colors duration-150` to all 40 missing hover states
5. Add card hover lift (`whileHover` + `whileTap`) to all interactive cards

### Wave 2: High (Buttons + Forms + Loading States)

6. Extend MotionButton usage to all primary/CTA buttons
7. Add CSS `active:scale-95` to ghost/icon buttons
8. Add form input focus glow (global CSS rule)
9. Add error shake to login form + settings forms
10. Add submit button loading → success checkmark pattern
11. Add loading skeletons to high-traffic pages missing them

### Wave 3: Medium (Badges + Sort + Dashboard Stagger + Focus)

12. Add badge pop-in animation with AnimatePresence
13. Add sort indicator rotation in DataTable
14. Add dashboard widget entrance stagger
15. Add alert severity glow animations
16. Add new alert entrance animations
17. Standardize focus-visible across all form inputs

### Wave 4: Polish (Success Feedback + Notifications + Empty States)

18. Add success checkmark SVG draw animation
19. Customize sonner toast entrance to match B-style
20. Add empty state scale + fade entrance
21. Add Karpenter/AI page specific animations
22. Final consistency sweep — verify all components use constants (no inline values)

---

## 7. Anti-Patterns (Never Do)

| Anti-Pattern | Why | Source |
|--------------|-----|--------|
| Animate width/height/top/left | Triggers layout reflow, causes jank | UI/UX Pro Max §7: transform-performance |
| Animation > 500ms for micro-interactions | Feels sluggish, blocks user | UI/UX Pro Max §7: duration-timing |
| Animate > 2 elements simultaneously per view | Causes visual chaos, motion sickness | UI/UX Pro Max §7: excessive-motion |
| Infinite animation on non-loading elements | Distracting | UI/UX Pro Max §7: continuous animation |
| Linear easing for UI transitions | Feels robotic | UI/UX Pro Max §7: easing |
| Color-only status indication | Accessibility failure | UI/UX Pro Max §1: color-not-only |
| Remove focus rings without replacement | Keyboard users lose navigation | UI/UX Pro Max §1: focus-states |
| Skip prefers-reduced-motion | Accessibility violation | UI/UX Pro Max §7: reduced-motion |
| Inline magic numbers for durations/easings | Drift from design system | Local convention |
| Block user input during animation | UX violation | UI/UX Pro Max §7: no-blocking-animation |
| Use `httpBatchLink` for tRPC | Breaks navigation — see Gotcha #1 | Local convention |
| Add `migrate()` to server.ts | Schema managed via init.sql | Local convention |

---

## 8. Accessibility Checklist

- [ ] All animations respect `prefers-reduced-motion: reduce`
- [ ] `useReducedMotion()` hook used in every Motion component
- [ ] Focus rings visible (2px solid, 2px offset) on all interactive elements
- [ ] Status conveyed by icon + color, not color alone
- [ ] Chart animations optional — data readable immediately
- [ ] No animation blocks user input
- [ ] Exit animations shorter than enter (60-70%)
- [ ] Stagger capped at STAGGER.max (0.3s total)
- [ ] All durations from DURATION constants
- [ ] All easings from EASING constants

---

## 9. Pre-Delivery Checklist (Per Wave)

- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm build` — all pages compile
- [ ] `pnpm lint` — no new lint errors
- [ ] All animations use constants from `animation-constants.ts`
- [ ] No inline duration/easing values
- [ ] `useReducedMotion` respected in every new Motion usage
- [ ] Hover states: every `hover:*` class paired with `transition-*`
- [ ] Charts: `animationBegin`, `animationDuration`, `animationEasing` set
- [ ] Cards: `whileHover` + `whileTap` present on interactive cards
- [ ] Buttons: loading state + success feedback on async actions
- [ ] Both dark and light themes tested
- [ ] Console: 0 errors after page navigation
