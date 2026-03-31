# Cluster Header & Stats Redesign

**Date:** 2026-03-31
**Scope:** Cluster detail page header + overview stat cards
**File:** `apps/web/src/app/clusters/[id]/layout.tsx` (header), `apps/web/src/app/clusters/[id]/page.tsx` (stats)

## Problem

The current cluster header uses a full gradient card (`rounded-2xl`, `p-4`, border, shadow) that consumes ~80px of vertical space for 4 pieces of info (name, provider, status, connection). The 4 stat cards below the tabs add another ~76px. Combined, ~156px is spent on metadata before any real content appears.

## Design: Breadcrumb-Fused Header + Inline Stats Strip

### Header (Design B — Breadcrumb-Fused)

**Replace** the gradient card header (lines 136-202 of `layout.tsx`) with cluster info merged into the existing breadcrumb row. Zero additional vertical height.

**Layout:**
```
[Left]  🏠 › Clusters › [ProviderIcon-xs] eks-devops-separate-us-east-1
[Right] kubeconfig  [active]  ● Live
```

**Approach:** Build a custom breadcrumb-fused row directly in `layout.tsx`. Do NOT modify the shared `Breadcrumbs` component. Remove the existing `<Breadcrumbs>` call (line 134) and the gradient card (lines 136-202), replace both with one unified row.

**Specifics:**
- Remove the entire `rounded-2xl` gradient card container
- Remove the `<Breadcrumbs>` call and inline a custom breadcrumb row that includes cluster metadata
- The custom row renders breadcrumb segments (Home icon → "Clusters" link → cluster name) on the left, metadata on the right
- Left side: breadcrumb links + `ProviderLogo` (`size={14}`, renders as 22px with padding) inline before cluster name
- Cluster name: `font-weight: 700`, `color: var(--color-text-primary)`, uses breadcrumb text scale (`text-xs font-mono`)
- Right side (`flex-shrink-0 ml-auto`): provider label, status badge, ConnectionStatusBadge
- Provider label: `text-xs font-mono text-[var(--color-text-dim)]`
- Status badge: inline Tailwind `text-[10px] font-mono px-1.5 py-0.5 rounded-md border border-[var(--color-border)] bg-white/[0.05] text-[var(--color-text-secondary)]` (matching current code pattern, no external class)
- ConnectionStatusBadge: existing component, unchanged
- Container: `flex items-center justify-between gap-1.5 text-xs font-mono mb-4` (preserves `mb-4` from current Breadcrumbs)
- Loading skeleton: single-line shimmer placeholder in breadcrumb position
- Disconnected state: keep existing Reconnect button inline after status badge
- `ProviderLogo` `layoutId` preserved for shared element transition from cluster list

**Responsive behavior:**
- Left side uses `min-w-0` + `truncate` on cluster name for narrow viewports
- Right side uses `flex-shrink-0` to always show status indicators
- On very narrow screens (<640px), the right-side metadata wraps below via `flex-wrap` on the container

### Stats (Design A — Inline Stats Strip)

**Replace** the 4-card grid (lines 446-488 of `page.tsx`) with a single horizontal flex row with vertical dividers.

**Layout:**
```
[Server] 4 Nodes  |  [Box] 44 / 45 Pods  |  [Globe] 19 Namespaces  |  [Cpu] 1.29 Version
```

**Specifics:**
- Container: `flex items-center` with no background, no border, no card
- Each stat item: `flex items-center gap-2 px-4 py-2.5` with relative positioning
- Dividers: explicit `<div>` elements between items — `w-px h-4 bg-[var(--color-border)]` (simpler and more maintainable than pseudo-elements)
- Icon: Lucide icon (Server, Box, Globe, Cpu), `h-3.5 w-3.5 text-[var(--color-text-dim)]`
- Value: `text-[15px] font-bold font-mono tabular-nums text-[var(--color-text-primary)]`
- Label: `text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]`
- Keep `AnimatedStatCount` for the value (count-up animation)
- Keep STALE badge for unreachable clusters (`ml-auto` within the item)
- Layout order within each item: icon → value → label (horizontal)

**Animations (using existing `animation-constants.ts`):**
- Container: `motion.div` with `listContainerVariants` (staggerChildren: `STAGGER.fast`)
- Each stat item: `motion.div` with `listItemVariants` (fade + slide-up)
- Values: existing `AnimatedStatCount` (count-up with `DURATION.counter`)
- No hover effects on individual stats (they're not interactive cards anymore)

**Responsive behavior:**
- Stats strip uses `flex-wrap` — on narrow screens, items wrap to a second row
- Each item has `flex-shrink-0` to prevent text compression
- On mobile (<640px), items naturally wrap into 2x2 layout due to flex-wrap

### Removed
- Gradient card container (header)
- `whileHover` lift on stat cards
- `boxShadow` card hover effect
- `rounded-xl bg-white/[0.03] border` card styling on stats
- 4-column grid layout for stats

### Preserved
- `ProviderLogo` with `layoutId` (shared element transition)
- `ConnectionStatusBadge` component (unchanged)
- `AnimatedStatCount` component (unchanged)
- Status detection regex (`/disconnected|unreachable|error/i`)
- Reconnect button for disconnected clusters
- STALE badge for unreachable clusters
- All CSS variable references (no hardcoded colors)
- Loading skeleton (adapted to inline format)
- `useReducedMotion` respect

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/app/clusters/[id]/layout.tsx` | Remove gradient card header (lines 136-202), replace with breadcrumb-fused row |
| `apps/web/src/app/clusters/[id]/page.tsx` | Replace stat card grid (lines 446-488) with inline stats strip |
| `apps/web/src/components/ProviderLogo.tsx` | No change (size prop already supports small sizes) |
| `apps/web/src/components/Breadcrumbs.tsx` | No change (shared component untouched) |
| `apps/web/src/components/ConnectionStatusBadge.tsx` | No change |
| `apps/web/src/components/AnimatedStatCount.tsx` | No change |
| `apps/web/src/lib/animation-constants.ts` | No change (using existing variants) |

## Space Savings

| Area | Before | After | Saved |
|------|--------|-------|-------|
| Header | ~80px | ~0px (fused) | ~80px |
| Stat cards | ~76px | ~36px | ~40px |
| **Total** | **~156px** | **~36px** | **~120px** |

## Testing

- Both dark and light themes
- Disconnected cluster state (Reconnect button visible)
- Unreachable cluster (STALE badges on stats)
- Loading state (skeleton)
- Long cluster names (truncation with `text-ellipsis`)
- `prefers-reduced-motion` (animations skipped)
- Shared element transition from cluster list → detail (ProviderLogo layoutId)
