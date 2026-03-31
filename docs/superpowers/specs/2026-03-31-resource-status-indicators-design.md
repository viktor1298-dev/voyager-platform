# Resource Status Indicator Redesign

Replace plain colored dots across all cluster resource pages with icon-driven bordered badges that provide instant status recognition through unique icons, semantic colors, and animated glow effects for critical states.

## Problem

Status indicators across ~10 page components use a simple 3-bucket system: green dot for Running/Succeeded, yellow dot for Pending, red dot for everything else. This collapses distinct operational states (Terminating, CrashLoopBackOff, OOMKilled, Failed) into one "red" bucket, making it impossible to scan a pod list and instantly distinguish a graceful shutdown from a crash loop. The status color logic is also duplicated inline across each page rather than centralized.

## Design Decision

**Option B — Icon + Bordered Badges** was selected over two alternatives:
- Option A (Colored Pill Badges) — scannable but lacked icon-based instant recognition
- Option C (Semantic Animated Dots) — minimal but too subtle for a power-user dashboard

Option B provides the best information density: unique icons enable recognition without reading text, bordered badges create clear visual boundaries, and animated glow effects draw attention to states that require operator action.

## Status Taxonomy

Eight visual categories, each with a unique color, icon, and animation behavior. Every K8s status string maps to exactly one category.

| Category | Color Variable | Lucide Icon | Animation | Mapped Statuses |
|----------|---------------|-------------|-----------|-----------------|
| Healthy | `--color-status-active` | `CircleCheck` | Static | Running, Ready, Active, Bound |
| Completed | `--color-status-healthy` | `CircleCheckBig` | None | Succeeded, Complete |
| Transitional | `--color-status-warning` | `Loader2` | Spin (2s) | Pending, Scaling |
| Draining | `--color-status-info` (new) | `MinusCircle` | Spin (2s) | Terminating, Suspended |
| Error | `--color-status-error` | `XCircle` | None | Failed, NotReady, Lost |
| Critical | `--color-status-error` | `AlertTriangle` | Glow pulse (1.5s) | CrashLoopBackOff |
| Fatal | `--color-status-error` | `Zap` | Glow pulse (1.2s) | OOMKilled |
| Unknown | `--color-status-idle` | `HelpCircle` | None | Unknown, fallback |

`CircleCheck` (Healthy) vs `CircleCheckBig` (Completed) are visually distinct — CircleCheckBig has a bolder, filled checkmark making "done" states clearly different from "running" states. `Loader2` is used over `Loader` because it is the codebase convention for spinners (used in 10+ files) and renders as a proper rotating indicator.

### Color values

All colors reference CSS variables from `globals.css`. One new variable is added, and four existing variables need light-mode overrides (currently only defined in dark mode):

```css
/* New variable */
Dark:  --color-status-info: #a78bfa
Light: --color-status-info: #7c3aed

/* Light-mode overrides for existing variables (currently missing) */
Light: --color-status-active: #059669
Light: --color-status-error: #dc2626
Light: --color-status-warning: #d97706
Light: --color-status-idle: #64748b
```

### Badge visual treatment

Each badge renders as:
- Background: status color at 8% opacity
- Border: status color at 20% opacity (25% for Critical/Fatal)
- Text + icon: status color at full opacity
- Border radius: 8px
- Padding: 3px 10px
- Font: 12px, weight 500

Critical and Fatal categories add a CSS `box-shadow` glow animation that pulses infinitely, using the existing `glowVariants` pattern from `animation-constants.ts`.

## Architecture

### New files

**`apps/web/src/lib/resource-status.ts`** — Centralized status configuration map. Exports:
- `ResourceStatusCategory` type: `'healthy' | 'completed' | 'transitional' | 'draining' | 'error' | 'critical' | 'fatal' | 'unknown'`
- `RESOURCE_STATUS_MAP`: `Record<ResourceStatusCategory, { colorVar: string, iconName: string, animation: 'none' | 'spin' | 'glow-critical' | 'glow-fatal', label: string }>` — references CSS variables and animation-constants tokens, no hardcoded values
- `resolveResourceStatus(raw: string): { category: ResourceStatusCategory, config: StatusConfig }` — normalizes any status string to its category and visual config. Matching is **case-insensitive** (`.toLowerCase()`) and uses exact full-string matching against a lookup map. For example, `"CrashLoopBackOff"` and `"crashloopbackoff"` both resolve to Critical, but `"crashloop"` resolves to Unknown. The lookup map is a `Record<string, ResourceStatusCategory>` keyed by lowercase status strings

**`apps/web/src/components/shared/ResourceStatusBadge.tsx`** — Single component that:
- Accepts `status: string` (raw K8s status) and `size?: 'sm' | 'md'` (default `'md'`)
- Calls `resolveResourceStatus()` to get category + config
- Renders Lucide icon + bordered badge with tinted background
- Applies glow animation via Motion for Critical/Fatal
- Applies CSS spin animation for Transitional/Draining
- Sets `role="status"` and `aria-label` for accessibility
- Respects `prefers-reduced-motion` — disables spin/glow, shows static icons

### Modified files

**`apps/web/src/app/globals.css`**
- Add `--color-status-info: #a78bfa` to dark mode variables
- Add `--color-status-info: #7c3aed` to light mode variables

**`apps/web/src/lib/animation-constants.ts`**
- Add `resourceStatusGlow` variants following the existing `glowVariants` pattern (line 141):

```typescript
export const resourceStatusGlow = {
  idle: { boxShadow: '0 0 0 rgba(0,0,0,0)' },
  critical: {
    boxShadow: [
      '0 0 0 rgba(255,77,106,0)',
      '0 0 12px rgba(255,77,106,0.3)',
      '0 0 0 rgba(255,77,106,0)',
    ],
    transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const },
  },
  fatal: {
    boxShadow: [
      '0 0 0 rgba(239,68,68,0)',
      '0 0 14px rgba(239,68,68,0.35)',
      '0 0 0 rgba(239,68,68,0)',
    ],
    transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' as const },
  },
}
```

**`apps/web/src/lib/status-utils.ts`**
- Add `getResourceStatusColor(status: string): string` that delegates to `resolveResourceStatus` — provides backward-compatible utility for code that needs just the color

### Consumer pages (replace inline status logic)

Each page replaces its inline `statusColor()` function + dot/text rendering with `<ResourceStatusBadge status={item.status} />`:

1. `apps/web/src/app/clusters/[id]/pods/page.tsx` — PodSummary: replace inline `statusColor` ternary + dot span
2. `apps/web/src/app/clusters/[id]/deployments/page.tsx` — DeploymentSummary: replace `statusColor()` function + colored dot/pill
3. `apps/web/src/app/clusters/[id]/statefulsets/page.tsx` — StatefulSetSummary: replace inline status color logic
4. `apps/web/src/app/clusters/[id]/daemonsets/page.tsx` — DaemonSetSummary: replace inline status color logic
5. `apps/web/src/app/clusters/[id]/jobs/page.tsx` — JobSummary: replace `statusColor()` function
6. `apps/web/src/app/clusters/[id]/cronjobs/page.tsx` — CronJobSummary: inspect and replace any status rendering (may use different pattern than `statusColor`)
7. `apps/web/src/app/clusters/[id]/pvcs/page.tsx` — PvcSummary: replace `phaseColor()` function
8. `apps/web/src/app/clusters/[id]/nodes/page.tsx` — NodeSummary: replace node status dot rendering
9. `apps/web/src/app/clusters/[id]/namespaces/page.tsx` — NamespaceSummary: replace namespace phase rendering
10. `apps/web/src/components/PodDetailSheet.tsx` — replace inline StatusBadge function with ResourceStatusBadge
11. `apps/web/src/components/resource/RelatedPodsList.tsx` — replace `statusDot()` function
12. `apps/web/src/components/topology/TopologyNode.tsx` — replace `statusDotColor`/`statusBorderColor` functions (badge used for dot color, border derived from same config)

The existing `StatusBadge` component in `components/shared/StatusBadge.tsx` remains for cluster-level health status (healthy/warning/error/unknown). The new `ResourceStatusBadge` is specifically for K8s resource statuses.

## Constraints

- All color values must reference CSS variables from `globals.css` — no hex/rgb hardcoding in components
- All animation timings must use tokens from `animation-constants.ts` — no magic numbers
- Icons from `lucide-react` only (already in the project, tree-shaken via `optimizePackageImports`)
- Must work in both dark and light themes
- Must respect `prefers-reduced-motion` media query
- The existing `StatusBadge` (cluster health) is not replaced — different abstraction level

## Testing

- Visual: verify all 8 categories render correctly in dark and light mode
- Animation: CrashLoopBackOff and OOMKilled glow, Pending and Terminating spin
- Reduced motion: verify animations disabled when OS preference is set
- Type safety: `resolveResourceStatus` handles unknown strings gracefully (returns 'unknown' category)
- All 12 consumer pages render with the new component without regressions
