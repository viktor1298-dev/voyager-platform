# Voyager Platform — Design Standards

**Style:** Confident & Expressive (Raycast/Arc — Style B)
**Last Updated:** 2026-04-03

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
11. **CSS-first for paint-heavy animations.** `box-shadow`, `margin`, `background`, glow pulses → CSS `@keyframes`. Motion only for interactive springs and `AnimatePresence`.
12. **Lazy-load heavy visualization libs.** React Flow (~220KB), xterm.js → dynamic `import()` inside `useEffect` for SSR safety.
13. **Brand colors are tokens.** Provider accents, status glows, chart palettes → CSS custom properties from `globals.css`. Never hardcode hex in components.

---

## CSS vs Motion Decision Guide

This is a performance-driven architectural decision established post-v1.0 optimization.

| Use CSS `@keyframes` / `transition` | Use Motion (framer-motion) |
|--------------------------------------|----------------------------|
| Paint-heavy: `box-shadow`, `background`, glow pulses | Interactive: drag, spring physics, gesture response |
| Infinite/repeating animations (status pulses, sidebar bar glow) | Enter/exit with `AnimatePresence` |
| Layout transitions (`margin-left`, `width` on sidebar) | `layoutId` spring animations (sidebar active indicator) |
| SSE-driven list items (skip FLIP overhead) | User-triggered expansions, dropdowns, dialogs |
| Properties with CSS `var()` references (Motion can't interpolate) | Scale/translate micro-interactions on hover/tap |

**Decision rule:** If `box-shadow` or layout property AND repeating → CSS. If user-initiated AND spring physics → Motion.

**Files:**
- CSS keyframes + tokens → `apps/web/src/app/globals.css`
- Motion presets + variants → `apps/web/src/lib/animation-constants.ts`

---

## Animation Tokens Reference

Source of truth: `apps/web/src/lib/animation-constants.ts`

### Durations

| Token | Value | Use |
|-------|-------|-----|
| `DURATION.instant` | 80ms | Button tap, micro-feedback |
| `DURATION.fast` | 150ms | Hover, quick transitions, exits |
| `DURATION.normal` | 200ms | General transitions, entrances |
| `DURATION.slow` | 300ms | Status changes, complex transitions |
| `DURATION.page` | 250ms | Page entry/exit |
| `DURATION.counter` | 800ms | Number count-up |
| `DURATION.counterLarge` | 1.2s | Large counters |
| `DURATION.statusPulse` | 2s | Warning glow pulse cycle |
| `DURATION.statusPulseCrit` | 1.5s | Critical glow pulse cycle |

### Springs (B-Style)

| Token | Config | Use |
|-------|--------|-----|
| `EASING.spring` | stiffness: 350, damping: 24 | General interactive spring |
| `EASING.snappy` | stiffness: 500, damping: 40 | Sidebar indicator, tab indicators |
| `EASING.bouncy` | stiffness: 380, damping: 20, mass: 0.8 | Delight moments (badges, success) |

### Cubic-Bezier Easings

| Token | Value | Use |
|-------|-------|-----|
| `EASING.default` | [0.25, 0.1, 0.25, 1] | General purpose |
| `EASING.standard` | [0.4, 0, 0.2, 1] | Material standard |
| `EASING.decelerate` | [0, 0, 0.2, 1] | Entering elements |
| `EASING.accelerate` | [0.4, 0, 1, 1] | Exiting elements |
| `EASING.enter` | [0, 0, 0.2, 1] | Entrance alias |
| `EASING.exit` | [0.4, 0, 1, 1] | Exit alias |

### Stagger

| Token | Value | Use |
|-------|-------|-----|
| `STAGGER.fast` | 30ms | Dense table rows |
| `STAGGER.normal` | 50ms | Card grids, widgets |
| `STAGGER.slow` | 80ms | Hero cards, dashboard |
| `STAGGER.max` | 300ms | Total stagger cap |

---

## Variant Presets Reference

All exported from `animation-constants.ts`. Use these instead of defining ad-hoc animation objects.

| Variant | Pattern | Use For |
|---------|---------|---------|
| `fadeVariants` | Opacity 0→1→0 | Simple fades |
| `slideUpVariants` | Y: 8→0, opacity | Cards, list items, general entrance |
| `scaleVariants` | Scale: 0.95→1, opacity | Modals, centered elements |
| `pageVariants` | Y: 6→0, opacity | Page-level transitions |
| `listContainerVariants` | staggerChildren: STAGGER.fast | Parent of staggered lists |
| `listItemVariants` | Y: 6→0, opacity | Children of staggered lists |
| `dialogVariants` | Scale: 0.96→1, Y: 4→0 | Dialog/modal entrance |
| `overlayVariants` | Opacity fast fade | Backdrop overlays |
| `dashboardCardVariants` | Custom index-based stagger (STAGGER.slow) | Dashboard grid cards |
| `badgePopVariants` | Bouncy spring scale 0→1 | Badge/pill entrance |
| `expandVariants` | Spring height 0→auto, delayed opacity | Expandable rows and cards |
| `alertEntranceVariants` | Spring slide from left (X: -12→0) | Alert/notification entrance |
| `dropdownVariants` | Spring scale 0.95→1, Y: -4→0 (stiffness: 400) | Dropdown menus, popovers |
| `tabSlideLeftVariants` | X: -8→0, opacity | Tab content (navigating left) |
| `tabSlideRightVariants` | X: 8→0, opacity | Tab content (navigating right) |
| `swimLaneVariants` | X: -12→0, opacity | Timeline swim lane entrance |
| `resourceBarVariants` | Width: 0→percent% (0.6s decelerate) | Gauge bar fill animation |
| `chevronVariants` | Rotate: 0↔180 | Expand/collapse chevron |
| `sortRotateVariants` | Rotate: 0↔180 (150ms) | Sort direction indicator |
| `errorShakeVariants` | X: [0,-8,8,-6,6,-3,3,0] (0.5s) | Form validation shake |
| `successCheckVariants` | SVG pathLength: 0→1 (0.4s decelerate) | Submit success checkmark |
| `glowVariants` | Warning (2s) / Critical (1.5s) box-shadow pulse | Alert glow effects |
| `resourceStatusGlow` | Critical (1.5s) / Fatal (1.2s) box-shadow pulse | Resource badge glow |
| `healthDotVariants` | Scale [1,1.3,1] warning / [1,1.5,1] critical | Status dot animation |

### Interactive Element Presets

| Preset | Config | Use For |
|--------|--------|---------|
| `cardHover` | y: -4, scale: 1.02, boxShadow, spring | `whileHover` on cards |
| `cardTap` | scale: 0.98 | `whileTap` on cards |
| `buttonHover` | scale: 1.02, instant | `whileHover` on primary buttons |
| `buttonTap` | scale: 0.97, instant | `whileTap` on primary buttons |
| `sidebarCollapsedIconHover` | scale: 1.1, spring (stiffness: 400) | Sidebar icons in collapsed mode |
| `sidebarTapFeedback` | scale: 0.97, instant | Sidebar item tap (expanded) |
| `sidebarTapFeedbackCollapsed` | scale: 0.95, instant | Sidebar item tap (collapsed) |

---

## Component Requirements

### Cards
- `whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(0,0,0,0.15)' }}`
- `whileTap={{ scale: 0.98 }}`
- Spring transition: stiffness 350, damping 24
- Entry via `slideUpVariants` or staggered list
- **ClusterCard**: Rotating conic-gradient border with `--status-color` (CSS `rotate-border` keyframe, 4s linear infinite)

### Buttons
- **Primary (MotionButton):** hover scale 1.02, tap scale 0.97, loading spinner, success checkmark
- **Ghost/Icon (CSS):** `transition-colors duration-150`, `active:scale-95`
- **Destructive:** semantic danger color (red), visually separated from primary actions

### Charts (Recharts)
- `animationBegin`: stagger per series (0, 150, 300ms)
- `animationDuration`: 800ms (lines/areas), 600ms (bars/scatter)
- `animationEasing`: "ease-out"
- Wrap in `motion.div` with `whileInView` (once: true)
- SparklineChart: `isAnimationActive={false}` (intentionally static)
- Colors via CSS variables (`--chart-1` through `--chart-5`, semantic aliases in `chart-theme.ts`)
- Series differentiation: `strokeDasharray` patterns for colorblind accessibility

### Forms
- Focus: 2px accent outline + 4px glow ring (accent/15%)
- Error: shake animation on form container (0.5s)
- Submit: loading spinner → success checkmark → toast
- Auto-focus first invalid field on error
- Inline validation on blur, not on keystroke

### Status Indicators
- Critical: red glow (16px, 1.5s pulse) + dot scale [1, 1.5, 1]
- Warning: amber glow (12px, 2s pulse) + dot scale [1, 1.3, 1]
- Info: static blue dot
- Healthy: static green dot
- **CSS glow for badges:** `animate-glow-critical` (1.5s), `animate-glow-fatal` (1.2s) — NOT Motion (performance)
- Status always uses icon + color, never color alone

### Hover States
- EVERY `hover:bg-*` / `hover:text-*` / `hover:border-*` MUST pair with `transition-colors duration-150`
- No exceptions. This is a hard gate.

### Badges
- Entrance: bouncy spring scale (0 → 1) via `badgePopVariants`
- Exit: fast scale (1 → 0, 150ms)
- Count change: AnimatePresence with key={count}

### DataTable
- Row stagger on viewport entry (useInView, once: true)
- Sort icon: smooth 180deg rotation on direction change
- Row hover: `transition-colors` (already correct)

### Dashboard Widgets
- **Compact layout:** KpiStrip (36px) → DashboardFilterChips (32px) → EnvironmentGroup → ClusterCard grid
- Grid wrapper: `listContainerVariants` with `STAGGER.normal`
- Each widget: `slideUpVariants` entrance
- Stat numbers: AnimatedNumber counter (existing)
- Container-query responsive sizing on `WidgetWrapper`

### Expandable Components
- **ExpandableTableRow / ExpandableCard:** Spring height via `expandVariants` (spring height + delayed opacity). Chevron rotation 180deg.
- **DetailTabs:** Directional slide (`tabSlideLeftVariants` / `tabSlideRightVariants`) based on tab index delta.
- **GroupedTabBar:** Spring-animated dropdown via `dropdownVariants` (stiffness: 400, damping: 28). Active child label display, not group label.

### Sidebar (Neon Depth Design)
- **Active background:** CSS gradient (`--sidebar-active-gradient`), NOT Motion — avoids absolute sizing bugs in collapsed mode
- **Active bar:** Single `layoutId="sidebar-active-bar"` spring slide (snappy: stiffness 500, damping 40). Glow via CSS `@keyframes sidebar-bar-pulse` — Motion cannot interpolate `box-shadow` with CSS `var()` references
- **Expanded hover:** Tween `translateX(2px)` | **Collapsed hover:** Spring `scale(1.1)`
- **Badges:** Wrap `<AnimatePresence>` inside `showLabels` conditional (prevents ghost flex space during exit animation in collapsed mode)
- **All tokens:** `--sidebar-*` CSS variables in `globals.css` — never hardcode

### Dialogs & Modals
- Entrance via `dialogVariants` (scale: 0.96, Y: 4)
- Overlay via `overlayVariants` (fast fade)
- Size variants: default and `xl` (`min(960px, 90vw)` for wizard)
- **Tiered confirmation:** Simple confirm for reversible actions. Detailed step-by-step for destructive actions (delete, scale-down). Destructive buttons use semantic danger color.

### Two-Panel Layouts (Wizard Pattern)
- Left panel: Fixed 320px, adaptive visual content per step (floating logos, progress rings, summary cards)
- Right panel: Flexible multi-step form content
- Step indicator dots with active/completed state
- Provider tiles: Brand-color accent bars + gradient backgrounds via CSS custom properties
- Validation progress ticker: Staggered sub-step rows with `slideUpVariants`
- Wizard-specific CSS keyframes: `wizard-float` (translateY -6px bounce), `wizard-ring-pulse` (scale 0.95↔1.05)

### Terminal & Code Viewers
- **TerminalDrawer:** VS Code-style bottom panel — slides up (`y: 100% → 0`), multi-tab, draggable height resize
- **YamlViewer:** Syntax-highlighted, theme-aware read-only with copy button
- **ResourceDiff:** Side-by-side diff (current vs last-applied, Helm revision support)
- **SSR safety:** xterm.js accesses `window`/`document` — must use dynamic `import()` in `useEffect`, never at module level
- Terminal tokens: `--color-terminal-bg/fg/cursor/selection` in globals.css

### Graph & Topology Visualization
- **React Flow** (`@xyflow/react`) for topology map and network policy graphs
- **dagre** layout algorithm (LR direction, ranked spacing)
- **Lazy-loaded** (~220KB) — dynamic import to avoid bundle impact
- **Stable `nodeTypes` reference required** — define outside component or `useMemo`. Changing reference = infinite re-renders
- Custom edge components: color-coded allow/deny for network policies, traffic flow labels for topology

### Events Timeline
- Horizontal swim lanes per resource type
- `swimLaneVariants` entrance (slide from left)
- Color-coded dots per event type: Normal (`--color-timeline-normal`), Warning (`--color-timeline-warning`), Error (`--color-timeline-error`)
- Adaptive time axis labels based on range (HH:MM:SS for <1h, HH:MM for 1-24h, Mon Day for >24h)

### Resource Status Badges
- Icon + bordered design, 8 categories (healthy, completed, transitional, draining, error, critical, fatal, unknown)
- CSS glow animations for critical/fatal (NOT Motion — performance)
- Single source of truth: `lib/resource-status.ts` → `resolveResourceStatus()`

### Presence UI
- Overlapping avatar cluster (ghost-style) in TopBar
- Filters out current user (already shown in UserMenu)
- Bouncy spring for badge counts

---

## CSS Design Tokens

Source of truth: `apps/web/src/app/globals.css` (`:root` for dark, `html.light` for light overrides)

### Token Families

| Family | Prefix | Count | Key Tokens |
|--------|--------|-------|------------|
| **Surface depth** | `--surface-0..3` | 4 | 4-level depth scale (7%→17% lightness) |
| **Backgrounds** | `--color-bg-*` | 6 | primary, secondary, card, card-hover, panel-bg, panel-bg-inner |
| **Text** | `--color-text-*` | 5 | primary, secondary, muted, dim, secondary-strong |
| **Borders** | `--color-border*` | 2 | border (6% white), border-hover (15% white) |
| **Status** | `--color-status-*` | 6 | active, idle, error, warning, healthy, info |
| **Glow effects** | `--glow-*` | 8 | healthy, degraded, warning, accent (each with hover variant) |
| **Chart palette** | `--chart-1..5` | 5 | indigo, green, amber, pink, cyan |
| **Chart semantic** | `--color-chart-*` | 8 | cpu, mem, pods, warnings, clusters, critical, warning, info |
| **Glassmorphism** | `--glass-*` | 4 | bg, border, border-hover, blur |
| **Shadows** | `--shadow-card*` | 2 | card, card-hover (with accent ring) |
| **Terminal** | `--color-terminal-*` | 4 | bg, fg, cursor, selection |
| **Log viewer** | `--color-log-*` | 12 | bg, header, text, line-number + syntax highlighting (oklch) |
| **Sidebar neon depth** | `--sidebar-*` | 10 | active-gradient, bar-glow, icon-glow, badge-glow, hover-bg |
| **Wizard** | `--wizard-*` | 4 | left-bg, ring-color, ring-success, ring-error |
| **Diff viewer** | `--color-diff-*` | 5 | added-bg, added-text, removed-bg, removed-text, modified-bg |
| **Gradient text** | `--gradient-text-*` | 3 | default, healthy, warning |
| **Thresholds** | `--color-threshold-*` | 3 | critical, warn, normal |
| **AI gradients** | `--gradient-ai-*` | 3 | critical, warning, info |
| **Timeline** | `--color-timeline-*` | 3 | normal, warning, error |
| **Animation** | `--duration-*` | 4 | fast (150ms), normal (200ms), slow (300ms), pulse (2s) |
| **Card transitions** | `--card-hover-*` | 2 | scale (1.015), y (-2px) |

### Light Mode
`html.light` provides 65+ token overrides. Key differences:
- Backgrounds: white surfaces instead of dark
- Text: darker values with stronger contrast for WCAG 2.2 AA
- Shadows: lighter, more subtle
- Glows: reduced opacity (10-18% vs 15-25%)
- Sidebar: lower accent mix percentages (12% vs 18%)
- Chart palette: deeper/darker variants for white backgrounds
- Mobile `@media (max-width: 768px)`: further text contrast boost

---

## Layout Patterns

Eight established page-level layouts in the app:

| # | Pattern | Structure | Used By |
|---|---------|-----------|---------|
| 1 | **DataTable** | PageHeader → FilterBar → DataTable (sort/paginate/select) | Clusters, Users, Teams, Alerts |
| 2 | **ExpandableTableRow** | Virtualized list → NamespaceGroup sections → expandable detail | Nodes, Pods, Deployments, Services |
| 3 | **Graph visualization** | React Flow + dagre + sidebar filter + detail panel on click | Topology, Network Policies |
| 4 | **Tab-based detail** | GroupedTabBar (6 groups, 24 tabs) + URL-driven tab state | Cluster detail (`/clusters/[id]/*`) |
| 5 | **Dashboard** | KpiStrip → FilterChips → EnvironmentGroup → ClusterCard grid | Dashboard (`/`) |
| 6 | **Two-panel modal** | Fixed 320px left + flexible right (multi-step wizard) | Add Cluster Wizard |
| 7 | **Split view** | Alerts table + Anomaly card grid side-by-side | Alerts + Anomalies |
| 8 | **Bottom panel** | VS Code-style TerminalDrawer, fixed-position, draggable height | Pod exec terminal |

### App Shell
- **Sidebar:** 56px collapsed / 224px expanded. CSS `transition-[width]` (200ms ease-out). Auto-collapses on cluster detail routes. Cmd+B toggles.
- **TopBar:** 56px fixed, z-50. Minimal Linear-style: logo, page title, presence cluster, command palette trigger, notifications, theme toggle, user menu.
- **Content area:** `margin-left` transitions via CSS (not Motion). Background: `bg-dot-grid` pattern.
- **Mobile (< 768px):** Single-column. Sidebar slides in with backdrop blur. Tables convert to card layout.

---

## Accessibility

### Hard Requirements
- `useReducedMotion()` hook in every Motion component — no exceptions
- `prefers-reduced-motion: reduce` CSS fallback in globals.css (zeroes all durations)
- Focus rings: 2px solid accent, 2px offset, visible in both themes
- Status: icon + color, never color alone
- Charts: data readable immediately (animation is enhancement); `strokeDasharray` for colorblind series differentiation
- Exit animations shorter than enter (responsive feel)
- Stagger capped at 300ms total

### WCAG 2.2 AA Compliance
- Text contrast: 4.5:1 minimum (body), 3:1 (large text). Light mode `--color-text-muted` and `--color-log-line-number` adjusted.
- `aria-live` regions on: SSE connection status, AI streaming output, loading state transitions
- Touch targets: 44px minimum on all interactive elements
- View Transitions API: fade-out 150ms → fade-in 200ms (with `prefers-reduced-motion` override)
- Container queries on dashboard `WidgetWrapper` for responsive sizing (no viewport media query needed)
- Keyboard shortcuts: Cmd+B (sidebar), Cmd+K (command palette), Ctrl+` (terminal). Guards prevent bare-key shortcuts from catching modifier combos.

---

## Performance Patterns

| Pattern | Implementation | Impact |
|---------|---------------|--------|
| **LazyMotion** | `providers.tsx` — tree-shakes unused Motion features | Smaller bundle |
| **Lazy-load heavy libs** | React Flow, xterm.js via dynamic `import()` in `useEffect` | ~220KB+ deferred |
| **`optimizePackageImports`** | lucide-react, recharts, @xyflow/react in `next.config.ts` | Tree-shaking |
| **Dynamic import CommandPalette** | `next/dynamic` in providers.tsx | ~20KB savings |
| **AnimatedList `layout=false`** | Default off — skip FLIP calculation on SSE-driven lists | No reflow on live updates |
| **RAF batching** | ClusterCard spotlight, CrosshairProvider crosshair sync | Fewer paints |
| **Shared timer context** | `LiveTimeAgo` — 1 interval for all age labels, not 200+ individual timers | O(1) timer overhead |
| **Global QueryClient staleTime** | 30s default — prevents unnecessary refetches | Fewer API calls |
| **CSS over Motion for paint** | `box-shadow` glow, `margin-left` layout → CSS transitions/keyframes | No JS paint per frame |
| **Virtualization** | TanStack Virtual on 100+ item resource lists | DOM node cap |

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
| Motion for box-shadow glow pulses | CSS `@keyframes` (no JS paint per frame) |
| Motion `marginLeft` for sidebar layout | CSS `transition-[margin-left]` |
| `layout=true` on SSE-driven lists | `layout=false` (skip FLIP overhead) |
| Multiple `layoutId` on same element | Single `layoutId` per animation concern |
| `AnimatePresence` wrapping visibility conditional | Visibility conditional wrapping `AnimatePresence` (ghost space fix) |
| Hardcode provider brand colors | CSS custom properties per provider |
| Module-level import of xterm.js | Dynamic `import()` in useEffect (SSR safety) |
| Individual timers per time-ago label | Shared `LiveTimeAgo` component (1 interval) |
| `hover:*` without `transition-*` pair | Always pair hover utilities with transition |

---

## Pre-Change Checklist

Before submitting any UI/animation change:

- [ ] All new animations use `animation-constants.ts` tokens
- [ ] `useReducedMotion()` respected in new Motion usage
- [ ] Every new `hover:*` has a `transition-*` pair
- [ ] Charts set `animationBegin`, `animationDuration`, `animationEasing`
- [ ] Cards have `whileHover` + `whileTap`
- [ ] Buttons have loading + success states (if async)
- [ ] CSS vs Motion: paint-heavy animations use CSS, not Motion
- [ ] Heavy libs lazy-loaded (React Flow, xterm.js)
- [ ] Brand colors use CSS variables, not hardcoded hex
- [ ] `aria-live` on dynamic status regions
- [ ] Touch targets are 44px minimum
- [ ] Sidebar tokens are in `--sidebar-*` CSS variables, not inline
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` passes
- [ ] Tested in dark AND light theme
- [ ] Console shows 0 errors
