# Resource Status Indicator Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace plain colored dots across all cluster resource pages with icon-driven bordered badges that provide instant status recognition through unique icons, semantic colors, and animated glow effects.

**Architecture:** One centralized config map (`resource-status.ts`) defines the status taxonomy. One shared component (`ResourceStatusBadge`) renders all status badges. CSS variables in `globals.css` provide theme-aware colors. Animation tokens in `animation-constants.ts` drive glow effects. Twelve consumer pages swap inline logic for the shared component.

**Tech Stack:** React 19, Tailwind 4, Motion 12, lucide-react, CSS custom properties

**Spec:** `docs/superpowers/specs/2026-03-31-resource-status-indicators-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/web/src/lib/resource-status.ts` | Status taxonomy config map + resolver |
| Create | `apps/web/src/components/shared/ResourceStatusBadge.tsx` | Shared badge component |
| Modify | `apps/web/src/app/globals.css` | Add CSS variables + light-mode overrides |
| Modify | `apps/web/src/lib/animation-constants.ts` | Add `resourceStatusGlow` variants |
| Modify | `apps/web/src/lib/status-utils.ts` | Add `getResourceStatusColor` backward-compat helper |
| Modify | `apps/web/src/app/clusters/[id]/pods/page.tsx` | Replace inline status ternary |
| Modify | `apps/web/src/app/clusters/[id]/deployments/page.tsx` | Replace `statusColor()` function |
| Modify | `apps/web/src/app/clusters/[id]/statefulsets/page.tsx` | Replace inline status color logic |
| Modify | `apps/web/src/app/clusters/[id]/daemonsets/page.tsx` | Replace inline status color logic |
| Modify | `apps/web/src/app/clusters/[id]/jobs/page.tsx` | Replace `statusColor()` function |
| Modify | `apps/web/src/app/clusters/[id]/cronjobs/page.tsx` | Replace conditional status badges |
| Modify | `apps/web/src/app/clusters/[id]/pvcs/page.tsx` | Replace `phaseColor()` function |
| Modify | `apps/web/src/app/clusters/[id]/nodes/page.tsx` | Replace status dot + imported utility |
| Modify | `apps/web/src/app/clusters/[id]/namespaces/page.tsx` | Replace `statusColor()` function |
| Modify | `apps/web/src/components/PodDetailSheet.tsx` | Replace inline `StatusBadge` function |
| Modify | `apps/web/src/components/resource/RelatedPodsList.tsx` | Replace `statusDot()` function |
| Skip | `apps/web/src/components/topology/TopologyNode.tsx` | **Out of scope** — uses cluster-level health strings (`healthy`/`warning`/`error`), not K8s resource statuses |
| Skip | `apps/web/src/app/clusters/[id]/page.tsx` | **Out of scope** — Overview page uses `nodeStatusColor` in DataTable column renderer |
| Skip | `apps/web/src/components/helm/HelmReleaseDetail.tsx` | **Out of scope** — uses Helm-specific statuses (`deployed`/`pending-install`/etc.) |

---

### Task 1: Add CSS Variables + Animation Constants

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/lib/animation-constants.ts`

- [ ] **Step 1: Add new CSS variables to globals.css dark mode**

In `globals.css`, after `--color-status-healthy: #10b981;` (around line 159), add:

```css
  --color-status-info: #a78bfa;
```

- [ ] **Step 2: Add light-mode overrides to globals.css**

In `globals.css`, in the `html.light` block after `--color-status-healthy: #047857;` (around line 308), add:

```css
  --color-status-active: #059669;
  --color-status-error: #dc2626;
  --color-status-warning: #d97706;
  --color-status-idle: #64748b;
  --color-status-info: #7c3aed;
```

- [ ] **Step 3: Add resourceStatusGlow to animation-constants.ts**

In `animation-constants.ts`, after the `glowVariants` export (after line 159), add:

```typescript
// Resource status badge glow (Critical / Fatal)
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

- [ ] **Step 4: Verify build**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/lib/animation-constants.ts
git commit -m "feat: add status-info CSS variable and resourceStatusGlow animation constants"
```

---

### Task 2: Create resource-status.ts Config Map

**Files:**
- Create: `apps/web/src/lib/resource-status.ts`
- Modify: `apps/web/src/lib/status-utils.ts`

- [ ] **Step 1: Create resource-status.ts**

```typescript
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  CircleCheck,
  CircleCheckBig,
  HelpCircle,
  Loader2,
  MinusCircle,
  XCircle,
  Zap,
} from 'lucide-react'

export type ResourceStatusCategory =
  | 'healthy'
  | 'completed'
  | 'transitional'
  | 'draining'
  | 'error'
  | 'critical'
  | 'fatal'
  | 'unknown'

export interface ResourceStatusConfig {
  category: ResourceStatusCategory
  colorVar: string
  Icon: LucideIcon
  animation: 'none' | 'spin' | 'glow-critical' | 'glow-fatal'
}

/** Category visual config — references CSS variables only, no hardcoded colors */
const CATEGORY_CONFIG: Record<
  ResourceStatusCategory,
  Omit<ResourceStatusConfig, 'category'>
> = {
  healthy: {
    colorVar: 'var(--color-status-active)',
    Icon: CircleCheck,
    animation: 'none',
  },
  completed: {
    colorVar: 'var(--color-status-healthy)',
    Icon: CircleCheckBig,
    animation: 'none',
  },
  transitional: {
    colorVar: 'var(--color-status-warning)',
    Icon: Loader2,
    animation: 'spin',
  },
  draining: {
    colorVar: 'var(--color-status-info)',
    Icon: MinusCircle,
    animation: 'spin',
  },
  error: {
    colorVar: 'var(--color-status-error)',
    Icon: XCircle,
    animation: 'none',
  },
  critical: {
    colorVar: 'var(--color-status-error)',
    Icon: AlertTriangle,
    animation: 'glow-critical',
  },
  fatal: {
    colorVar: 'var(--color-status-error)',
    Icon: Zap,
    animation: 'glow-fatal',
  },
  unknown: {
    colorVar: 'var(--color-status-idle)',
    Icon: HelpCircle,
    animation: 'none',
  },
}

/** Case-insensitive exact-match lookup: lowercase status string → category */
const STATUS_LOOKUP: Record<string, ResourceStatusCategory> = {
  // Healthy
  running: 'healthy',
  ready: 'healthy',
  active: 'healthy',
  bound: 'healthy',
  // Completed
  succeeded: 'completed',
  complete: 'completed',
  // Transitional
  pending: 'transitional',
  scaling: 'transitional',
  // Draining
  terminating: 'draining',
  suspended: 'draining',
  // Error
  failed: 'error',
  notready: 'error',
  lost: 'error',
  // Critical
  crashloopbackoff: 'critical',
  // Fatal
  oomkilled: 'fatal',
  // Unknown handled by fallback
}

/** Resolve any raw K8s status string to its category + visual config */
export function resolveResourceStatus(raw: string | null | undefined): ResourceStatusConfig {
  const key = (raw ?? '').toLowerCase()
  const category = STATUS_LOOKUP[key] ?? 'unknown'
  return { category, ...CATEGORY_CONFIG[category] }
}
```

- [ ] **Step 2: Add backward-compat helper to status-utils.ts**

At the end of `apps/web/src/lib/status-utils.ts`, add:

```typescript
import { resolveResourceStatus } from './resource-status.js'

/** Returns a CSS variable string for any K8s resource status */
export function getResourceStatusColor(status: string): string {
  return resolveResourceStatus(status).colorVar
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/resource-status.ts apps/web/src/lib/status-utils.ts
git commit -m "feat: add centralized resource status config map and resolver"
```

---

### Task 3: Create ResourceStatusBadge Component

**Files:**
- Create: `apps/web/src/components/shared/ResourceStatusBadge.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { resolveResourceStatus } from '@/lib/resource-status.js'
import { resourceStatusGlow } from '@/lib/animation-constants.js'

interface ResourceStatusBadgeProps {
  status: string
  size?: 'sm' | 'md'
  className?: string
}

const SIZE_CLASSES = {
  sm: { badge: 'gap-1 px-1.5 py-0.5 text-[10px] rounded-md', icon: 'h-3 w-3' },
  md: { badge: 'gap-1.5 px-2.5 py-0.5 text-xs rounded-lg', icon: 'h-3.5 w-3.5' },
} as const

export function ResourceStatusBadge({
  status,
  size = 'md',
  className,
}: ResourceStatusBadgeProps) {
  const { category, colorVar, Icon, animation } = resolveResourceStatus(status)
  const shouldReduceMotion = useReducedMotion()
  const sizeClasses = SIZE_CLASSES[size]

  const isGlow = animation === 'glow-critical' || animation === 'glow-fatal'
  const isSpin = animation === 'spin'
  const glowKey = animation === 'glow-critical' ? 'critical' : 'fatal'

  const badgeStyle = {
    color: colorVar,
    backgroundColor: `color-mix(in srgb, ${colorVar} 8%, transparent)`,
    borderColor: `color-mix(in srgb, ${colorVar} ${isGlow ? '25' : '20'}%, transparent)`,
  }

  const badge = (
    <span
      className={cn(
        'inline-flex items-center font-medium border whitespace-nowrap',
        sizeClasses.badge,
        className,
      )}
      style={badgeStyle}
      role="status"
      aria-label={`Status: ${status}`}
    >
      <Icon
        className={cn(
          sizeClasses.icon,
          'shrink-0',
          isSpin && !shouldReduceMotion && 'animate-spin',
        )}
        style={isSpin && !shouldReduceMotion ? { animationDuration: '2s' } : undefined}
        aria-hidden="true"
      />
      {status}
    </span>
  )

  // Wrap in motion.span for glow animation on Critical/Fatal
  if (isGlow && !shouldReduceMotion) {
    return (
      <motion.span
        className="inline-flex rounded-lg"
        initial="idle"
        animate={glowKey}
        variants={resourceStatusGlow}
      >
        {badge}
      </motion.span>
    )
  }

  return badge
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/shared/ResourceStatusBadge.tsx
git commit -m "feat: add ResourceStatusBadge component with icon + bordered design"
```

---

### Task 4: Replace Status Indicators — Pods Page

**Files:**
- Modify: `apps/web/src/app/clusters/[id]/pods/page.tsx`

- [ ] **Step 1: Add import**

Add to the imports section:

```typescript
import { ResourceStatusBadge } from '@/components/shared/ResourceStatusBadge'
```

- [ ] **Step 2: Replace status rendering in PodSummary**

In the `PodSummary` component (~line 355), remove the `statusColor` ternary:

```typescript
// DELETE these lines:
const statusColor =
  pod.status === 'Running' || pod.status === 'Succeeded'
    ? 'bg-[var(--color-status-active)]'
    : pod.status === 'Pending'
      ? 'bg-[var(--color-status-warning)]'
      : 'bg-[var(--color-status-error)]'
```

Then in the JSX, replace the dot span + status text:

```tsx
// REPLACE: <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusColor}`} />
// AND the status text span further in the row
// WITH:
<ResourceStatusBadge status={pod.status} size="sm" />
```

The dot and status text are separate elements in the current row — both get replaced by the single `ResourceStatusBadge`.

- [ ] **Step 3: Verify build**

Run: `pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/clusters/[id]/pods/page.tsx
git commit -m "refactor(pods): use ResourceStatusBadge for pod status indicators"
```

---

### Task 5: Replace Status Indicators — Deployments Page

**Files:**
- Modify: `apps/web/src/app/clusters/[id]/deployments/page.tsx`

- [ ] **Step 1: Add import and remove statusColor function**

Add import:
```typescript
import { ResourceStatusBadge } from '@/components/shared/ResourceStatusBadge'
```

Remove the `statusColor()` function (~lines 56-60):
```typescript
// DELETE:
function statusColor(status: string): string {
  if (status === 'Running') return 'var(--color-status-active)'
  if (status === 'Scaling') return 'var(--color-status-warning)'
  if (status === 'Failed') return 'var(--color-status-error)'
  return 'var(--color-text-dim)'
}
```

- [ ] **Step 2: Replace status pill in DeploymentSummary JSX**

Replace the status pill span (~lines 78-86):
```tsx
// REPLACE the <span> with style={{ color: statusColor(d.status), background: ... }}>
// WITH:
<ResourceStatusBadge status={d.status} size="sm" />
```

Keep the ready ratio badge (`{d.readyReplicas}/{d.replicas}`) — only replace the status pill.

- [ ] **Step 3: Verify build and commit**

```bash
pnpm typecheck
git add apps/web/src/app/clusters/[id]/deployments/page.tsx
git commit -m "refactor(deployments): use ResourceStatusBadge for deployment status"
```

---

### Task 6: Replace Status Indicators — StatefulSets Page

**Files:**
- Modify: `apps/web/src/app/clusters/[id]/statefulsets/page.tsx`

- [ ] **Step 1: Add import and simplify status logic**

Add import:
```typescript
import { ResourceStatusBadge } from '@/components/shared/ResourceStatusBadge'
```

In `StatefulSetSummary`, the current code derives `statusLabel` and `statusClr` inline. Keep the `statusLabel` derivation (since it computes Running/Pending/Scaling from replica counts) but remove `statusClr`. Replace the status pill span with:

```tsx
<ResourceStatusBadge status={statusLabel} size="sm" />
```

Remove the `statusClr` variable and its usage in the styled span.

- [ ] **Step 2: Verify build and commit**

```bash
pnpm typecheck
git add apps/web/src/app/clusters/[id]/statefulsets/page.tsx
git commit -m "refactor(statefulsets): use ResourceStatusBadge for statefulset status"
```

---

### Task 7: Replace Status Indicators — DaemonSets, Jobs, CronJobs

**Files:**
- Modify: `apps/web/src/app/clusters/[id]/daemonsets/page.tsx`
- Modify: `apps/web/src/app/clusters/[id]/jobs/page.tsx`
- Modify: `apps/web/src/app/clusters/[id]/cronjobs/page.tsx`

- [ ] **Step 1: DaemonSets — replace status label span**

Add import. In `DaemonSetSummary`, the status label is `{isReady ? 'Ready' : 'Updating'}`. Replace the styled status span (~lines 64-69) with:

```tsx
<ResourceStatusBadge status={isReady ? 'Ready' : 'Pending'} size="sm" />
```

Note: Map "Updating" → "Pending" since "Updating" is not in the K8s status taxonomy. The badge will show "Pending" with the transitional spinner which correctly represents a DaemonSet rolling update.

- [ ] **Step 2: Jobs — remove statusColor function, replace status pill**

Add import. Remove the `statusColor()` function (~lines 43-47). Replace the status pill span with:

```tsx
<ResourceStatusBadge status={job.status} size="sm" />
```

- [ ] **Step 3: CronJobs — replace conditional status badges**

Add import. CronJobs renders `Suspended` as a hardcoded red badge and `{activeJobs} active` as a blue badge. Replace the `Suspended` span (~line 45):

```tsx
{cj.suspend && <ResourceStatusBadge status="Suspended" size="sm" />}
```

Replace the active jobs span (~line 49):

```tsx
{cj.activeJobs > 0 && <ResourceStatusBadge status="Running" size="sm" />}
```

- [ ] **Step 4: Verify build and commit**

```bash
pnpm typecheck
git add apps/web/src/app/clusters/[id]/daemonsets/page.tsx apps/web/src/app/clusters/[id]/jobs/page.tsx apps/web/src/app/clusters/[id]/cronjobs/page.tsx
git commit -m "refactor(workloads): use ResourceStatusBadge for daemonsets, jobs, cronjobs"
```

---

### Task 8: Replace Status Indicators — PVCs, Nodes, Namespaces

**Files:**
- Modify: `apps/web/src/app/clusters/[id]/pvcs/page.tsx`
- Modify: `apps/web/src/app/clusters/[id]/nodes/page.tsx`
- Modify: `apps/web/src/app/clusters/[id]/namespaces/page.tsx`

- [ ] **Step 1: PVCs — remove phaseColor function, replace status rendering**

Add imports:
```typescript
import { ResourceStatusBadge } from '@/components/shared/ResourceStatusBadge'
import { resolveResourceStatus } from '@/lib/resource-status.js'
```

Remove `phaseColor()` function (~lines 35-39). Replace the **summary row** status pill with:
```tsx
<ResourceStatusBadge status={pvc.phase} size="sm" />
```

For the **expanded detail** grid (~line 100), use the resolver for color only (a full badge would break the compact grid layout):
```tsx
<span style={{ color: resolveResourceStatus(pvc.phase).colorVar }} className="font-bold">
  {pvc.phase}
</span>
```

- [ ] **Step 2: Nodes — replace status dot + text**

Add import. Remove the `nodeStatusColor` import from `@/lib/status-utils`. Replace the status dot + text rendering (~lines 334-340):

```tsx
// REPLACE the <span className="inline-flex items-center gap-1.5"> with dot and text
// WITH:
<td className="px-3 py-3">
  <ResourceStatusBadge status={node.status} size="sm" />
</td>
```

- [ ] **Step 3: Namespaces — remove statusColor function, replace status rendering**

Add imports:
```typescript
import { ResourceStatusBadge } from '@/components/shared/ResourceStatusBadge'
import { resolveResourceStatus } from '@/lib/resource-status.js'
```

Remove `statusColor()` function (~lines 27-31). Replace the **summary row** status pill with:
```tsx
<ResourceStatusBadge status={ns.status ?? 'Unknown'} size="sm" />
```

For the **expanded detail** grid (~line 68), use the resolver for color only:
```tsx
<span style={{ color: resolveResourceStatus(ns.status ?? 'Unknown').colorVar }} className="font-bold">
  {ns.status ?? '—'}
</span>
```

- [ ] **Step 4: Verify build and commit**

```bash
pnpm typecheck
git add apps/web/src/app/clusters/[id]/pvcs/page.tsx apps/web/src/app/clusters/[id]/nodes/page.tsx apps/web/src/app/clusters/[id]/namespaces/page.tsx
git commit -m "refactor(resources): use ResourceStatusBadge for pvcs, nodes, namespaces"
```

---

### Task 9: Replace Status Indicators — PodDetailSheet, RelatedPodsList

**Files:**
- Modify: `apps/web/src/components/PodDetailSheet.tsx`
- Modify: `apps/web/src/components/resource/RelatedPodsList.tsx`

- [ ] **Step 1: PodDetailSheet — remove inline StatusBadge, use ResourceStatusBadge**

Add import. Remove the local `StatusBadge` function (~lines 59-74). Replace its usage (~line 80):

```tsx
// REPLACE: <InfoRow label="Status" value={<StatusBadge status={pod.status} />} />
// WITH:
<InfoRow label="Status" value={<ResourceStatusBadge status={pod.status} />} />
```

- [ ] **Step 2: RelatedPodsList — remove statusDot function, replace dot + pill**

Add import. Remove the `statusDot()` function (~lines 21-25). In the pod map JSX, replace the dot span + status pill with:

```tsx
<ResourceStatusBadge status={pod.status} size="sm" />
```

Remove both the `<span className={statusDot(...)}/>` dot and the inline-styled status `<span>`. The badge replaces both.

- [ ] **Step 3: Verify build and commit**

```bash
pnpm typecheck
git add apps/web/src/components/PodDetailSheet.tsx apps/web/src/components/resource/RelatedPodsList.tsx
git commit -m "refactor(components): use ResourceStatusBadge in detail sheet and related pods"
```

> **Note:** `TopologyNode.tsx`, `HelmReleaseDetail.tsx`, and `clusters/[id]/page.tsx` (Overview) are intentionally **out of scope**. TopologyNode uses cluster-level health strings (`healthy`/`warning`/`error`), Helm uses release lifecycle statuses (`deployed`/`pending-install`), and Overview uses `nodeStatusColor` in DataTable columns — all different domains from K8s resource status.

---

### Task 10: Final Verification

- [ ] **Step 1: Full typecheck**

```bash
cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck
```

Expected: 0 errors

- [ ] **Step 2: Full build**

```bash
pnpm build
```

Expected: all pages compile successfully

- [ ] **Step 3: Start dev servers and visual check**

```bash
pnpm dev
```

Open `http://localhost:3000`, navigate to a cluster → Pods tab. Verify:
- Running pods show green CircleCheck icon badge
- Pending pods show yellow spinning Loader2 badge
- Failed pods show red XCircle badge
- Status badges have bordered, tinted backgrounds

Check 2-3 more tabs (Deployments, Nodes, Jobs) to verify badges appear everywhere.

- [ ] **Step 4: Check light mode**

Toggle to light mode. Verify badges have adequate contrast and correct light-mode colors.

- [ ] **Step 5: Commit any fixups if needed**

If any visual issues found, fix and commit.
