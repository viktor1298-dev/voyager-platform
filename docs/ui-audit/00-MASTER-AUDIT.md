# UI/UX Master Audit Report — Voyager Platform

**Date:** 2026-03-27
**Scope:** Full frontend (`apps/web/src/`) — 42 pages, 94+ components, globals.css
**Agents:** 6 parallel auditors (a11y, design system, performance, responsive, components, charts)

---

## Executive Summary

| Track | Total | P0 | P1 | P2 | P3 |
|-------|-------|----|----|----|----|
| Accessibility (WCAG 2.2) | 78 | 8 | 36 | 27 | 4 |
| Design System | 32 | 4 | 11 | 12 | 5 |
| Performance & Modern CSS | 28 | 1 | 8 | 14 | 5 |
| Responsive & Mobile | 25 | 2 | 8 | 10 | 5 |
| Component Quality | 31 | 0 | 6 | 18 | 7 |
| Charts & Data Viz | 25 | 2 | 7 | 10 | 6 |
| **TOTAL** | **219** | **17** | **76** | **91** | **32** |

### Top 5 Systemic Issues

1. **Light-mode breakage** — 68+ instances of `bg-white/[0.0x]` hover states, `rgba(255,255,255,*)` borders/backgrounds invisible in light mode
2. **Chart color fragmentation** — 3 disconnected color systems (CSS tokens, chart-theme.ts HSL, inline hardcoded HSL) — charts not theme-aware
3. **WCAG contrast failures** — `--color-text-muted`, `--color-log-line-number`, `--color-accent` (light) all fail AA
4. **Bundle bloat ~250KB** — Recharts, AI Chat, CommandPalette loaded eagerly
5. **Missing component states** — All 6 dashboard widgets lack loading skeletons and error states

---

## Fix Agent Assignment (Phase 2)

### Agent 1: CSS Foundations
**Files:** `globals.css`, `next.config.ts`
- Fix all contrast failures (P0: text-muted, log-line-number; P1: accent, log-dim, status-idle)
- Add missing tokens (hover-overlay, threshold colors, AI gradients, chart-1..5)
- Add `safe-area-inset` support
- Add View Transitions CSS
- Add `@view-transition { navigation: auto; }` rules
- Add `scroll-behavior: smooth`
- Fix light-mode surface scale

### Agent 2: Component Primitives (ui/)
**Files:** `ui/dialog.tsx`, `ui/sheet.tsx`, `ui/badge.tsx`, `ui/card.tsx`, `ui/skeleton.tsx`, `ui/tabs.tsx`
- Add `role="dialog"`, `aria-modal`, focus trap to dialog/sheet (P0)
- Fix sheet width overflow on mobile (`w-full sm:w-3/4`)
- Fix touch targets (close buttons, tab buttons)
- Fix badge default variant (use theme tokens)
- Standardize skeleton pattern

### Agent 3: Layout & Navigation
**Files:** `Sidebar.tsx`, `TopBar.tsx`, `AppLayout.tsx`, `Breadcrumbs.tsx`, `NotificationsPanel.tsx`, `CommandPalette.tsx`, `providers.tsx`, `layout.tsx`
- Add viewport meta export (P0)
- Fix sidebar touch targets (collapse toggle, cluster sub-nav)
- Fix TopBar SSE rgba → tokens
- Fix NotificationsPanel border/overflow
- Fix CommandPalette mobile sizing
- Add `aria-current="page"` to nav items
- Dynamic import CommandPalette
- Add global `staleTime` to QueryClient
- Add `optimizePackageImports` to next.config.ts

### Agent 4: Charts & Metrics
**Files:** `charts/*.tsx`, `chart-theme.ts`, `metrics/*.tsx`, `dashboard/widgets/*.tsx`, `anomalies/*.tsx`
- Define `--chart-1` through `--chart-5` in globals.css (P0)
- Unify 3 color systems into CSS tokens
- Fix color-blind issues (identical mem/pods colors)
- Add ARIA descriptions to all charts
- Fix SVG gradient ID collisions
- Add loading skeletons to all 6 dashboard widgets
- Add error states to all 6 dashboard widgets
- Fix tooltip consistency
- Add chart empty states
- Replace hardcoded HSL threshold colors with tokens

### Agent 5: Pages & Accessibility
**Files:** All `page.tsx` files, form components, `ConfirmDialog.tsx`, `FilterBar.tsx`
- Add missing `<h1>` to logs, settings, pods, nodes pages (P0)
- Add `aria-live` regions (ConnectionStatus, AI chat, SSE updates)
- Fix form label associations
- Add `inputMode` and `autoComplete` to form inputs
- Add debounce to FilterBar search
- Add "Revoke all" confirmation dialog
- Fix `timeAgo()` duplication (use canonical `time-utils.ts`)
- Fix `StatCardsWidget` isLoading `&&` → `||`

### Agent 6: Performance & Dynamic Imports
**Files:** Various — dynamic import wrappers, `WidgetWrapper.tsx`, `WidgetLibraryDrawer.tsx`
- Dynamic import Recharts components (~150KB savings)
- Dynamic import AI Chat components (~50KB)
- Add container queries to WidgetWrapper
- Fix WidgetLibraryDrawer mobile width
- Add `React.memo` to expensive pure components
- Convert simple Motion animations to CSS `@starting-style`
- Add Suspense boundaries for data-fetching pages

---

## Detailed Reports

- [01-accessibility.md](./01-accessibility.md) — 78 findings
- [02-design-system.md](./02-design-system.md) — 32 findings
- [03-performance-modern-css.md](./03-performance-modern-css.md) — 28 findings
- [04-responsive-mobile.md](./04-responsive-mobile.md) — 25 findings
- [05-component-quality.md](./05-component-quality.md) — 31 findings
- [06-charts-dataviz.md](./06-charts-dataviz.md) — 25 findings
