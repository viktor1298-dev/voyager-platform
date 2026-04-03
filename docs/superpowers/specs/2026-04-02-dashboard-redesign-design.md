# Dashboard Redesign — Minimal Compact Layout

**Date:** 2026-04-02
**Status:** Approved
**Approach:** Rancher-style grouped compact (Approach B)

## Problem

The current dashboard wastes ~586px of vertical space before the first cluster card appears. A full-screen search bar, verbose section titles, descriptive text blocks, environment lane sidebars with health summary grids, and an expandable stats panel all compete for space. The user must scroll past an entire viewport of chrome to see any cluster data.

## Design Goals

- **84% vertical space reduction** — from ~586px to ~92px before first cluster card
- **Single viewport fleet visibility** — 5+ clusters visible without scrolling on 1080p
- **Premium motion** — spring-physics hover, staggered entrances, count-up KPIs, pulsing status indicators
- **Remove widget mode** — a well-designed dashboard doesn't need a widget layer
- **Preserve environment grouping** — critical for ops triage (prod-first scanning)
- **Zero hardcoded values** — all colors, spacing, and animation durations via centralized CSS variables and animation tokens

## Inspiration

Lens (density), Rancher (grouped cards), Portainer (compact metrics), Datadog (KPI strips), modern 2026 minimal dashboard patterns.

---

## Layout Structure

```
┌─────────────────────────────────────────────┐
│ Topbar (48px fixed)                         │
│  "Dashboard"  [Search... ⌘K]  [☀] [🔔] [VK]│
├─────────────────────────────────────────────┤
│ KPI Strip (36px)                            │
│  ● 5 clusters │ 37 nodes │ 248/312 pods │   │
│  ● 3 warnings │         ● 4  ● 1  ● 0    │
├─────────────────────────────────────────────┤
│ Filter Chips (32px)                         │
│  [All 5] [Prod 3] [Staging 1] [Dev 1]      │
│                          [▾ status] [▾ prov]│
├─────────────────────────────────────────────┤
│ ● PRODUCTION · 3 clusters ──────────── (24px│
│ ┌──────────────┐ ┌──────────────┐ ┌────────┐│
│ │ ● eks-jupiter│ │ ● eks-saturn │ │ ● eks- ││
│ │ EKS · v1.29  │ │ EKS · v1.28  │ │ neptune││
│ │ 12 nodes 86p │ │ 8 nodes  52p │ │ 10 nod ││
│ └──────────────┘ └──────────────┘ └────────┘│
│                                             │
│ ● STAGING · 1 cluster ─────────────── (24px)│
│ ┌──────────────┐                            │
│ │ ● eks-staging│                            │
│ │ EKS · v1.29  │                            │
│ │ 4 nodes  28p │                            │
│ └──────────────┘                            │
│                                             │
│ ● DEV · 1 cluster ───────────────── (24px)  │
│ ┌──────────────┐                            │
│ │ ● eks-devops │                            │
│ │ EKS · v1.33  │                            │
│ │ 3 nodes  11p │                            │
│ └──────────────┘                            │
└─────────────────────────────────────────────┘
```

---

## Centralization Rules

**No hardcoded values anywhere.** Every color, spacing value, and animation duration must come from a centralized source:

| Value Type | Source | Example |
|-----------|--------|---------|
| **Colors** | CSS variables in `globals.css` | `var(--color-bg-card)`, `var(--color-border)`, `var(--color-text-primary)` |
| **Status colors** | CSS variables | `var(--color-status-active)`, `var(--color-status-warning)`, `var(--color-status-error)` |
| **Environment colors** | `lib/cluster-meta.ts` → `ENV_META` | `ENV_META.prod.color`, `ENV_META.staging.color` |
| **Animation durations** | `lib/animation-constants.ts` | `DURATION.fast`, `DURATION.normal`, `DURATION.slow` |
| **Animation easings** | `lib/animation-constants.ts` | `EASING.spring`, `EASING.snappy` |
| **Stagger delays** | `lib/animation-constants.ts` | `STAGGER.fast`, `STAGGER.normal`, `STAGGER.slow` |
| **Hover/tap variants** | `lib/animation-constants.ts` | `cardHover`, `cardTap` |
| **Spacing/sizing** | Tailwind utility classes | `p-3`, `gap-2`, `rounded-xl` — never raw pixel values in style attributes |

**If a value doesn't exist in a centralized file yet, add it there first.** For example, if the KPI count-up duration (800ms) isn't in `animation-constants.ts`, add a `DURATION.counter` token. If the card spotlight purple isn't a CSS variable, add `--color-accent-glow` to `globals.css`.

**Both themes must work.** All new components must use CSS variables that resolve correctly in both dark and light themes. Never use literal hex values like `#14141f` in component code — use `var(--color-bg-card)` instead.

---

## Component Specifications

### 1. Page Title — Moved to Topbar

The "Dashboard" text moves into the existing topbar component. No separate page header, breadcrumb, description, or action buttons.

**Removes:** PageHeader block (breadcrumb + title + description + Widgets button + Customize button) — ~90px saved.

### 2. KPI Strip (36px)

Single horizontal row of inline metric pills separated by thin vertical dividers.

**Content (left to right):**
- Green dot + `5` clusters
- `37` nodes
- `248`/`312` pods (running/total, total is dimmed)
- Warning dot + `3` warnings
- Right-aligned health summary: green dot `4` · amber dot `1` · red dot `0`

**Behavior:**
- Numbers animate with count-up on page load (800ms, ease-out-cubic, 400ms delay)
- Warning dot has breathing glow animation (2s cycle) when count > 0
- Health dots scale 1.5x on hover
- No expand/collapse — always single line

**Replaces:** CompactStatsBar (56px collapsed + 140px expanded grid).

### 3. Filter Chips (32px)

Single row of pill-shaped filter chips.

**Left side — environment tabs:**
- `All 5` (active by default, purple highlight)
- `Prod 3`
- `Staging 1`
- `Dev 1`

**Right side — dropdown filters:**
- `▾ status`
- `▾ provider`

**Behavior:**
- Single-select for environment tabs (click activates, deactivates others)
- Hover: translateY(-1px) + border brightens, 200ms spring
- Active press: scale(0.97) instant
- Active state: purple background tint + purple border + purple text + subtle glow
- Dropdown filters open a popover on click (reuse existing multi-select from FilterBar)

**Replaces:** Cluster badge strip + "Fleet inventory..." title + description + environment pill tabs + full FilterBar search input — ~160px saved.

**Note:** Global search remains accessible via ⌘K (CommandDialog already exists). No inline search bar needed.

### 4. Environment Group Headers (24px each)

Thin label rows that separate cluster groups.

**Content:** Color dot + `PRODUCTION` (uppercase, 11px, semibold, letter-spaced) + `3 clusters` (dimmed) + chevron + horizontal divider line (gradient fade to transparent)

**Colors:** Sourced from `ENV_META` in `lib/cluster-meta.ts` (already centralized):
- Production: `ENV_META.prod.color` (rose)
- Staging: `ENV_META.staging.color` (amber)
- Dev: `ENV_META.dev.color` (indigo)

**Behavior:**
- Click header to collapse/expand group
- Collapse: max-height 0 + opacity 0, `DURATION.slow` (300ms) + `EASING.spring`
- Expand: max-height auto + opacity 1, `DURATION.slow` (300ms) + `EASING.spring`
- Chevron rotates -90deg when collapsed
- Env dot scales 1.3x on header hover
- Chevron hidden by default, appears on hover (opacity 0 → 1)

**Replaces:** Environment lane header + sidebar (description + 3 health summary cards per lane) — ~280px saved per lane.

### 5. Cluster Cards (~80px)

Two-row compact cards in a responsive grid.

**Grid:** `grid-template-columns: repeat(auto-fill, minmax(340px, 1fr))`, gap 10px.

**Row 1 — Identity:**
- Status dot (8px, colored with glow) + cluster name (13px, semibold, truncate with ellipsis)
- Right side: optional SSE live badge + provider/version label (e.g., "EKS · v1.29")

**Row 2 — Metrics:**
- `12` nodes · `86`/`94` pods · `● healthy` (colored status label)

**Card chrome:**
- Background: `var(--color-bg-card)`, border: `var(--color-border)`, border-radius: `rounded-xl` (12px)
- Left accent bar (3px, env-colored via `ENV_META[env].color`, 60% opacity → 100% on hover)
- Padding: `p-3.5 px-4` (14px 16px)

**Hover effects (all via `DURATION.slow` + spring easing):**
- `cardHover` variant from `animation-constants.ts` (translateY(-4px))
- Border color: `var(--color-accent-glow)` (purple accent, add to globals.css if missing)
- Box shadow deepens via `var(--shadow-card-hover)` (add to globals.css if missing)
- Background: `var(--color-bg-card-hover)` (add to globals.css if missing — slightly brighter than card bg)
- Radial spotlight follows mouse cursor (CSS `--mouse-x`/`--mouse-y` custom properties, `radial-gradient` using `var(--color-accent-glow)` at low opacity)
- Status dot scales 1.3x
- Name text brightens to `var(--color-text-primary)`
- Muted text brightens to `var(--color-text-secondary)`

**Active press:** `cardTap` variant from `animation-constants.ts` (scale 0.98), `DURATION.instant`.

**Status dot animations:**
- Healthy: steady glow using `var(--color-status-active)` with box-shadow
- Degraded: pulsing glow using `var(--color-status-warning)` (2s ease-in-out infinite, scale 1→1.2)
- Critical: faster pulsing glow using `var(--color-status-error)` (1.5s, scale 1→1.3, stronger shadow)

**Live indicator:** Tiny badge `[● SSE]` with blinking dot (2s opacity cycle). Only shown for clusters with active SSE connection.

**Entrance animation:** Staggered fade-up (opacity 0 + translateY(10px) → visible), `DURATION.slow` (300ms) spring per card, `STAGGER.slow` (80ms) stagger delay between cards.

**Replaces:** Current 220px ClusterCard with status summary box, capability badges, footer metadata, inventory snapshot section.

### 6. Skeleton Loading State

Replace `DashboardPageFallback` with a minimal skeleton:
- KPI strip: 5 shimmer pills in a row (36px)
- Filter row: 4 shimmer chips (32px)
- 1 env header shimmer line (24px)
- 3 card skeletons in grid (~80px each, pulse animation)

---

## Files to Delete

All paths relative to `apps/web/src/`.

### Frontend — Widget Mode (entire `components/dashboard/` directory gutted and rebuilt)

| File | Reason |
|------|--------|
| `components/dashboard/DashboardGrid.tsx` | Widget mode removed |
| `components/dashboard/WidgetWrapper.tsx` | Widget mode removed |
| `components/dashboard/WidgetConfigModal.tsx` | Widget mode removed |
| `components/dashboard/DashboardEditBar.tsx` | Widget mode removed |
| `components/dashboard/WidgetLibraryDrawer.tsx` | Widget mode removed |
| `components/dashboard/DashboardRefreshContext.tsx` | Widget mode refresh provider removed |
| `components/dashboard/RefreshIntervalSelector.tsx` | Widget mode removed |
| `components/dashboard/AnomalyTimeline.tsx` | Only used by AnomalyTimelineWidget |
| `components/dashboard/widgets/StatCardsWidget.tsx` | Widget mode removed |
| `components/dashboard/widgets/ClusterHealthWidget.tsx` | Widget mode removed |
| `components/dashboard/widgets/ResourceChartsWidget.tsx` | Widget mode removed |
| `components/dashboard/widgets/AlertFeedWidget.tsx` | Widget mode removed |
| `components/dashboard/widgets/AnomalyTimelineWidget.tsx` | Widget mode removed |
| `components/dashboard/widgets/DeploymentListWidget.tsx` | Widget mode removed |
| `components/dashboard/widgets/LogTailWidget.tsx` | Widget mode removed |
| `components/dashboard/widgets/PodStatusWidget.tsx` | Widget mode removed |
| `stores/dashboard-layout.ts` | Widget mode Zustand store removed |

### Backend — Dashboard Layout API

| File | Reason |
|------|--------|
| `apps/api/src/routers/dashboard-layout.ts` | Backend for widget layout persistence — no longer needed |
| `packages/db/src/schema/dashboard-layouts.ts` | DB table for widget layouts — no longer needed |

**Note:** Also remove the `dashboardLayout` router registration from the tRPC router index, and generate a Drizzle migration to drop the `dashboard_layouts` table.

## Files to Modify

| File | Changes |
|------|---------|
| `app/page.tsx` | Major refactor: remove widget mode toggle, remove CompactStatsBar inline definition, remove verbose ClusterCard inline definition, remove `trpc.dashboardLayout` calls, simplify to KPI strip → filters → env groups → card grid. Extract components. |
| `app/globals.css` | Add missing CSS variables: `--color-bg-card-hover`, `--color-accent-glow`, `--shadow-card-hover` (both dark and light themes) |
| `lib/animation-constants.ts` | Add `DURATION.counter` (800ms) token for KPI number animation |

**Note:** `FilterBar.tsx` is shared with `clusters/page.tsx`. Do NOT modify the shared component. Instead, build a new dashboard-specific `DashboardFilterChips.tsx` component that reuses the filter dropdown logic but with the compact chip layout.

## Files to Create

All paths relative to `apps/web/src/`.

| File | Purpose |
|------|---------|
| `components/dashboard/KpiStrip.tsx` | Compact KPI pills with count-up animation using `DURATION.counter` |
| `components/dashboard/ClusterCard.tsx` | Compact two-row card with hover effects (`cardHover`/`cardTap` variants) and mouse-follow spotlight |
| `components/dashboard/EnvironmentGroup.tsx` | Collapsible env group with thin header, colors from `ENV_META` |
| `components/dashboard/DashboardFilterChips.tsx` | Dashboard-specific filter chips (env tabs + dropdown filters), does NOT modify shared FilterBar |
| `components/dashboard/DashboardSkeleton.tsx` | Minimal loading skeleton |

---

## Animation Compliance (DESIGN.md)

**All animations use centralized tokens from `lib/animation-constants.ts`.** No hardcoded durations or easing values in component code.

| Animation | Token | Resolved Value |
|-----------|-------|----------------|
| Card entrance | `DURATION.slow` + `STAGGER.slow` | 300ms + 80ms stagger |
| Card hover lift | `cardHover` variant | translateY(-4px), spring easing |
| Card active press | `cardTap` variant | scale(0.98), `DURATION.instant` |
| KPI count-up | `DURATION.counter` (new) | 800ms ease-out-cubic |
| Group collapse | `DURATION.slow` + `EASING.spring` | 300ms spring |
| Filter hover | `DURATION.normal` | 200ms |
| Status dot pulse | `DURATION.statusPulse` (new, 2s) / `DURATION.statusPulseCrit` (new, 1.5s) | ease-in-out infinite |
| `prefers-reduced-motion` | All animations disabled | `useReducedMotion()` hook required on every Motion component |

**Animation tokens — reuse existing or add new:**
- `DURATION.counter` (already exists, 800ms) — reuse for KPI number count-up
- `DURATION.statusPulse = 2000` (new) — degraded/warning pulse cycle
- `DURATION.statusPulseCrit = 1500` (new) — critical pulse cycle (faster)

Mouse-follow spotlight uses pure CSS (no Motion dependency): `mousemove` event sets `--mouse-x`/`--mouse-y` CSS custom properties on the card element, consumed by a `radial-gradient` pseudo-element using `var(--color-accent-glow)`.

**New CSS variables to add to `globals.css` (both dark and light themes):**
- `--color-bg-card-hover` — slightly brighter than `--color-bg-card` for hover state
- `--color-accent-glow` — purple accent for hover borders and radial spotlight
- `--shadow-card-hover` — elevated shadow for card hover state

---

## Vertical Space Budget

| Element | Before | After | Savings |
|---------|--------|-------|---------|
| Page header | 90px | 0px | 90px |
| Operations pulse | 56px | 36px (KPI strip) | 20px |
| Section title + desc | 60px | 0px | 60px |
| Env pills | 40px | 0px (merged into filter chips) | 40px |
| Filter/search bar | 60px | 32px (chips only) | 28px |
| Env lane header | 40px | 24px | 16px |
| Lane sidebar | 240px | 0px | 240px |
| **Total to first card** | **~586px** | **~92px** | **~494px (84%)** |

## Mockup Reference

Interactive animated mockup: `.superpowers/brainstorm/36396-1775077078/dashboard-animated.html`
