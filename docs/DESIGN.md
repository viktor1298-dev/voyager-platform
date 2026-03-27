# Voyager Platform — Design Standards

**Style:** Confident & Expressive (Raycast/Arc — Style B)
**Last Updated:** 2026-03-27

This is the **animation and interaction design source of truth**. All agents, contributors, and AI assistants MUST read this file before making any UI/animation changes.

For the full design spec with implementation details, see `docs/superpowers/specs/2026-03-27-animation-design.md`.

---

## Quick Rules

1. **Spring-first.** Use spring physics for interactive elements (stiffness 300-400, damping 20-30). Cubic-bezier only for simple fades.
2. **Every hover needs a transition.** Zero tolerance for abrupt state changes. If it has `hover:*`, it has `transition-*`.
3. **Every interactive card lifts.** `whileHover={{ y: -4, boxShadow }}` + `whileTap={{ scale: 0.98 }}`.
4. **Every button responds.** Primary: scale 1.02 hover, 0.97 tap. Ghost: `transition-colors` + `active:scale-95`.
5. **Every chart animates.** Set `animationBegin`, `animationDuration` (800ms), `animationEasing` ("ease-out") on Recharts components. Exception: SparklineChart stays static.
6. **Every form gives feedback.** Focus glow on inputs. Error shake on validation failure. Loading spinner + success checkmark on submit.
7. **Status = animation hierarchy.** Critical pulses + glows. Warning pulses gently. Info and healthy are static.
8. **Exit faster than enter.** Exit at ~60-70% of enter duration. Makes the UI feel responsive.
9. **Use constants, never magic numbers.** All values from `animation-constants.ts` — DURATION, EASING, STAGGER, variant presets.
10. **Respect reduced motion.** Every Motion component checks `useReducedMotion()`. No exceptions.

---

## Animation Tokens Reference

### Durations

| Token | Value | Use |
|-------|-------|-----|
| `DURATION.instant` | 80ms | Button tap, micro-feedback |
| `DURATION.fast` | 150ms | Hover, quick transitions |
| `DURATION.normal` | 200ms | General transitions |
| `DURATION.slow` | 300ms | Status changes |
| `DURATION.page` | 250ms | Page entry/exit |
| `DURATION.counter` | 800ms | Number count-up |
| `DURATION.counterLarge` | 1.2s | Large counters |

### Springs (B-Style)

| Token | Config | Use |
|-------|--------|-----|
| `EASING.spring` | stiffness: 350, damping: 24 | General interactive spring |
| `EASING.snappy` | stiffness: 500, damping: 40 | Sidebar, tab indicators |
| `EASING.bouncy` | stiffness: 380, damping: 20, mass: 0.8 | Delight moments (badges, success) |

### Stagger

| Token | Value | Use |
|-------|-------|-----|
| `STAGGER.fast` | 30ms | Dense table rows |
| `STAGGER.normal` | 50ms | Card grids, widgets |
| `STAGGER.slow` | 80ms | Hero cards |
| `STAGGER.max` | 300ms | Total stagger cap |

---

## Component Requirements

### Cards
- `whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(0,0,0,0.15)' }}`
- `whileTap={{ scale: 0.98 }}`
- Spring transition: stiffness 350, damping 24
- Entry via `slideUpVariants` or staggered list

### Buttons
- **Primary (MotionButton):** hover scale 1.02, tap scale 0.97, loading spinner, success checkmark
- **Ghost/Icon (CSS):** `transition-colors duration-150`, `active:scale-95`

### Charts (Recharts)
- `animationBegin`: stagger per series (0, 150, 300ms)
- `animationDuration`: 800ms (lines/areas), 600ms (bars/scatter)
- `animationEasing`: "ease-out"
- Wrap in `motion.div` with `whileInView` (once: true)
- SparklineChart: `isAnimationActive={false}` (intentionally static)

### Forms
- Focus: 2px accent outline + 4px glow ring (accent/15%)
- Error: shake animation on form container (0.5s)
- Submit: loading spinner → success checkmark → toast
- Auto-focus first invalid field on error

### Status Indicators
- Critical: red glow (16px, 1.5s pulse) + dot scale [1, 1.5, 1]
- Warning: amber glow (12px, 2s pulse) + dot scale [1, 1.3, 1]
- Info: static blue dot
- Healthy: static green dot

### Hover States
- EVERY `hover:bg-*` / `hover:text-*` / `hover:border-*` MUST pair with `transition-colors duration-150`
- No exceptions. This is a hard gate.

### Badges
- Entrance: bouncy spring scale (0 → 1)
- Exit: fast scale (1 → 0, 150ms)
- Count change: AnimatePresence with key={count}

### DataTable
- Row stagger on viewport entry (useInView, once: true)
- Sort icon: smooth 180deg rotation on direction change
- Row hover: `transition-colors` (already correct)

### Dashboard Widgets
- Grid wrapper: `listContainerVariants` with `STAGGER.normal`
- Each widget: `slideUpVariants` entrance
- Stat numbers: AnimatedNumber counter (existing)

---

## Anti-Patterns (Never Do)

| Don't | Do Instead |
|-------|------------|
| Animate width/height/top/left | Use transform (translateY, scale) + opacity |
| Duration > 500ms for micro-interactions | Keep 150-300ms |
| Animate > 2 elements simultaneously | Stagger or animate key element only |
| Infinite animation on non-loading elements | Only loaders and critical status get infinite |
| Linear easing for UI | ease-out for enter, ease-in for exit |
| Color-only status | Icon + color always |
| Remove focus ring without replacement | Keep visible focus-visible outline |
| Skip prefers-reduced-motion | Always check useReducedMotion() |
| Inline duration/easing values | Import from animation-constants.ts |
| Block input during animation | Keep UI interactive always |

---

## Accessibility

- `useReducedMotion()` hook in every Motion component
- `prefers-reduced-motion: reduce` CSS fallback in globals.css
- Focus rings: 2px solid, 2px offset, visible in both themes
- Status: icon + color, never color alone
- Charts: data readable immediately (animation is enhancement)
- Exit animations shorter than enter (responsive feel)
- Stagger capped at 300ms total

---

## Pre-Change Checklist

Before submitting any UI/animation change:

- [ ] All new animations use `animation-constants.ts` tokens
- [ ] `useReducedMotion()` respected in new Motion usage
- [ ] Every new `hover:*` has a `transition-*` pair
- [ ] Charts set `animationBegin`, `animationDuration`, `animationEasing`
- [ ] Cards have `whileHover` + `whileTap`
- [ ] Buttons have loading + success states (if async)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` passes
- [ ] Tested in dark AND light theme
- [ ] Console shows 0 errors
