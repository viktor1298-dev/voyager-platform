# K8s Resource Explorer — Wave 1: Component Library + Grouped Tab Bar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Design skills:** Use `frontend-design` and `ui-ux-pro-max` skills for all UI component design and implementation.
>
> **Safety:** READ-ONLY cluster access. No mutating K8s commands. `kubectl get` and `kubectl describe` only.

**Goal:** Build the reusable expandable component library and grouped tab bar navigation that all subsequent waves depend on.

**Architecture:** 8 new components in `apps/web/src/components/expandable/`, 1 new navigation component in `apps/web/src/components/clusters/`, new animation tokens in `animation-constants.ts`, and a refactored cluster layout replacing the flat tab bar with grouped dropdowns. Components are framework-agnostic within the app — they accept data via props, not tRPC queries.

**Tech Stack:** React 19, Motion 12 (spring animations), Tailwind 4, Lucide React (icons), existing CSS custom properties for theming.

**Spec:** `docs/superpowers/specs/2026-03-28-k8s-resource-explorer-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `apps/web/src/components/expandable/ExpandableCard.tsx` | Spring-animated accordion card |
| `apps/web/src/components/expandable/ExpandableTableRow.tsx` | Expandable row for DataTable pages |
| `apps/web/src/components/expandable/DetailTabs.tsx` | Tabbed sections with icons inside expanded area |
| `apps/web/src/components/expandable/DetailRow.tsx` | Icon + ID + meta display row |
| `apps/web/src/components/expandable/DetailGrid.tsx` | Auto-fit responsive grid |
| `apps/web/src/components/expandable/ResourceBar.tsx` | Utilization bar (used/total with %) |
| `apps/web/src/components/expandable/ConditionsList.tsx` | K8s conditions with status indicators |
| `apps/web/src/components/expandable/TagPills.tsx` | Key=value pill display |
| `apps/web/src/components/expandable/index.ts` | Barrel export for all components |
| `apps/web/src/components/clusters/GroupedTabBar.tsx` | Grouped dropdown tab navigation |
| `apps/web/src/components/clusters/cluster-tabs-config.ts` | Tab/group definitions + types |

### Modified Files
| File | Change |
|------|--------|
| `apps/web/src/lib/animation-constants.ts` | Add DROPDOWN, EXPAND, TAB_SLIDE tokens + variants |
| `apps/web/src/app/clusters/[id]/layout.tsx` | Replace flat `CLUSTER_TABS` + inline tab bar with `GroupedTabBar` |
| `apps/api/src/trpc.ts` | Add `clusterId` to `authorizationObjectIdInputSchema` |

### New Page Stubs (empty Next.js pages for new routes)
| File | Resource |
|------|----------|
| `apps/web/src/app/clusters/[id]/statefulsets/page.tsx` | StatefulSets stub |
| `apps/web/src/app/clusters/[id]/daemonsets/page.tsx` | DaemonSets stub |
| `apps/web/src/app/clusters/[id]/jobs/page.tsx` | Jobs stub |
| `apps/web/src/app/clusters/[id]/cronjobs/page.tsx` | CronJobs stub |
| `apps/web/src/app/clusters/[id]/ingresses/page.tsx` | Ingresses stub |
| `apps/web/src/app/clusters/[id]/configmaps/page.tsx` | ConfigMaps stub |
| `apps/web/src/app/clusters/[id]/secrets/page.tsx` | Secrets stub |
| `apps/web/src/app/clusters/[id]/pvcs/page.tsx` | PVCs stub |
| `apps/web/src/app/clusters/[id]/hpa/page.tsx` | HPA stub |

---

## Tasks

### Task 1: Add new animation tokens

**Files:**
- Modify: `apps/web/src/lib/animation-constants.ts`

- [ ] **Step 1: Add DROPDOWN, EXPAND, and TAB_SLIDE variant objects**

Add after the existing `alertEntranceVariants` at the end of the file:

```typescript
// Dropdown menu (grouped tab bar)
export const dropdownVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 400, damping: 28 },
  },
  exit: { opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.12, ease: EASING.exit } },
} as const

export const dropdownItemVariants = {
  hidden: { opacity: 0, x: -4 },
  visible: { opacity: 1, x: 0, transition: { duration: DURATION.fast, ease: EASING.default } },
} as const

// Expandable card/row
export const expandVariants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { height: { type: 'spring' as const, stiffness: 350, damping: 24 }, opacity: { duration: DURATION.fast, delay: 0.05 } },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { height: { duration: DURATION.fast, ease: EASING.exit }, opacity: { duration: DURATION.instant } },
  },
} as const

export const chevronVariants = {
  collapsed: { rotate: 0 },
  expanded: { rotate: 180 },
} as const

// Detail tab content slide
export const tabSlideLeftVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: DURATION.fast, ease: EASING.default } },
  exit: { opacity: 0, x: 8, transition: { duration: DURATION.instant, ease: EASING.exit } },
} as const

export const tabSlideRightVariants = {
  hidden: { opacity: 0, x: 8 },
  visible: { opacity: 1, x: 0, transition: { duration: DURATION.fast, ease: EASING.default } },
  exit: { opacity: 0, x: -8, transition: { duration: DURATION.instant, ease: EASING.exit } },
} as const

// Resource bar fill animation
export const resourceBarVariants = {
  hidden: { width: 0 },
  visible: (percent: number) => ({
    width: `${percent}%`,
    transition: { duration: 0.6, ease: EASING.decelerate },
  }),
} as const
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/animation-constants.ts
git commit -m "feat: add dropdown, expand, tab-slide, resource-bar animation tokens"
```

---

### Task 2: Build ExpandableCard component

**Files:**
- Create: `apps/web/src/components/expandable/ExpandableCard.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import {
  chevronVariants,
  EASING,
  expandVariants,
} from '@/lib/animation-constants'

interface ExpandableCardProps {
  summary: ReactNode
  children: ReactNode
  defaultExpanded?: boolean
}

export function ExpandableCard({
  summary,
  children,
  defaultExpanded = false,
}: ExpandableCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const shouldReduceMotion = useReducedMotion()

  return (
    <div
      className={`rounded-xl border bg-[var(--color-bg-card)] overflow-hidden transition-colors duration-150 ${
        expanded
          ? 'border-[var(--color-accent)]/30 shadow-[0_4px_24px_rgba(129,140,248,0.06)]'
          : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/20'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors duration-150"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">{summary}</div>
        <motion.div
          variants={chevronVariants}
          animate={expanded ? 'expanded' : 'collapsed'}
          transition={shouldReduceMotion ? { duration: 0 } : EASING.spring}
        >
          <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            variants={shouldReduceMotion ? undefined : expandVariants}
            initial="collapsed"
            animate="expanded"
            exit="exit"
            className="border-t border-[var(--color-border)]/40 bg-[var(--color-accent)]/[0.01]"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/expandable/ExpandableCard.tsx
git commit -m "feat: add ExpandableCard component with spring animation"
```

---

### Task 3: Build DetailTabs component

**Files:**
- Create: `apps/web/src/components/expandable/DetailTabs.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { EASING, tabSlideLeftVariants, tabSlideRightVariants } from '@/lib/animation-constants'

export interface DetailTab {
  id: string
  label: string
  icon?: ReactNode
  content: ReactNode
}

interface DetailTabsProps {
  id: string
  tabs: DetailTab[]
  defaultTab?: string
}

export function DetailTabs({ id, tabs, defaultTab }: DetailTabsProps) {
  const [activeId, setActiveId] = useState(defaultTab ?? tabs[0]?.id ?? '')
  const prevIndexRef = useRef(0)
  const shouldReduceMotion = useReducedMotion()

  const activeIndex = tabs.findIndex((t) => t.id === activeId)
  const activeTab = tabs[activeIndex]
  const direction = activeIndex >= prevIndexRef.current ? 'right' : 'left'

  const handleTabClick = (id: string) => {
    prevIndexRef.current = activeIndex
    setActiveId(id)
  }

  return (
    <div>
      <div className="flex gap-0 border-b border-[var(--color-border)]/60 px-4">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              className={`relative flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium cursor-pointer transition-colors duration-150 ${
                isActive
                  ? 'text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {tab.icon}
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId={`detail-tab-${id}`}
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--color-accent)] rounded-t-full"
                  transition={shouldReduceMotion ? { duration: 0 } : EASING.snappy}
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeId}
            variants={
              shouldReduceMotion
                ? undefined
                : direction === 'right'
                  ? tabSlideRightVariants
                  : tabSlideLeftVariants
            }
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {activeTab?.content}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/expandable/DetailTabs.tsx
git commit -m "feat: add DetailTabs component with directional slide animation"
```

---

### Task 4: Build DetailRow, DetailGrid, TagPills components

**Files:**
- Create: `apps/web/src/components/expandable/DetailRow.tsx`
- Create: `apps/web/src/components/expandable/DetailGrid.tsx`
- Create: `apps/web/src/components/expandable/TagPills.tsx`

- [ ] **Step 1: Create DetailRow**

```typescript
import type { ReactNode } from 'react'

interface DetailRowProps {
  icon?: ReactNode
  id: string
  meta?: string
}

export function DetailRow({ icon, id, meta }: DetailRowProps) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.02] border border-[var(--color-border)]/40 rounded-lg font-mono text-[11px] hover:bg-white/[0.04] transition-colors duration-150">
      {icon && <span className="text-[var(--color-text-muted)] shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
      <span className="text-[var(--color-accent)] min-w-[110px]">{id}</span>
      {meta && <span className="text-[var(--color-text-muted)] flex-1 truncate">{meta}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Create DetailGrid**

```typescript
import type { ReactNode } from 'react'

interface DetailGridProps {
  children: ReactNode
}

export function DetailGrid({ children }: DetailGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Create TagPills**

```typescript
'use client'

import { motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { EASING, STAGGER } from '@/lib/animation-constants'

interface TagPillsProps {
  tags: Record<string, string>
}

export function TagPills({ tags }: TagPillsProps) {
  const shouldReduceMotion = useReducedMotion()
  const entries = Object.entries(tags)

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, value], i) => (
        <motion.span
          key={key}
          initial={shouldReduceMotion ? undefined : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { ...EASING.bouncy, delay: Math.min(i * STAGGER.fast, 0.3) }
          }
          className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-white/[0.03] border border-[var(--color-border)]/60 rounded-md font-mono text-[10px]"
        >
          <span className="text-[var(--color-accent)]">{key}</span>
          <span className="text-[var(--color-text-dim)]">=</span>
          <span className="text-[var(--color-text-secondary)]">{value}</span>
        </motion.span>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Verify typecheck**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/expandable/DetailRow.tsx apps/web/src/components/expandable/DetailGrid.tsx apps/web/src/components/expandable/TagPills.tsx
git commit -m "feat: add DetailRow, DetailGrid, TagPills components"
```

---

### Task 5: Build ResourceBar and ConditionsList components

**Files:**
- Create: `apps/web/src/components/expandable/ResourceBar.tsx`
- Create: `apps/web/src/components/expandable/ConditionsList.tsx`

- [ ] **Step 1: Create ResourceBar**

```typescript
'use client'

import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { EASING } from '@/lib/animation-constants'

interface ResourceBarProps {
  label: string
  icon?: ReactNode
  used: number
  total: number
  unit?: string
  colorClass?: string
}

function getBarColor(percent: number): string {
  if (percent >= 85) return 'bg-gradient-to-r from-red-500 to-red-400'
  if (percent >= 70) return 'bg-gradient-to-r from-amber-500 to-amber-400'
  return 'bg-gradient-to-r from-indigo-400 to-indigo-500'
}

function formatValue(value: number, unit?: string): string {
  if (unit) return `${value}${unit}`
  return String(value)
}

export function ResourceBar({ label, icon, used, total, unit, colorClass }: ResourceBarProps) {
  const shouldReduceMotion = useReducedMotion()
  const percent = total > 0 ? Math.round((used / total) * 100) : 0
  const barColor = colorClass ?? getBarColor(percent)

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5">
          {icon && <span className="[&>svg]:h-3 [&>svg]:w-3 text-[var(--color-accent)]">{icon}</span>}
          {label}
        </span>
        <span className="text-[11px] font-mono text-[var(--color-text-primary)]">
          {formatValue(used, unit)} / {formatValue(total, unit)}{' '}
          <span className="text-[var(--color-text-muted)]">({percent}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={shouldReduceMotion ? { width: `${percent}%` } : { width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.6, ease: EASING.decelerate }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create ConditionsList**

```typescript
'use client'

import { motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { STAGGER } from '@/lib/animation-constants'

interface Condition {
  type: string
  status: string
  reason?: string
  message?: string
  lastTransitionTime?: string
}

interface ConditionsListProps {
  conditions: Condition[]
}

function statusDotClass(status: string): string {
  switch (status) {
    case 'True':
      return 'bg-[var(--color-status-active)]'
    case 'False':
      return 'bg-[var(--color-status-error)] shadow-[0_0_8px_rgba(239,68,68,0.3)]'
    default:
      return 'bg-[var(--color-status-warning)]'
  }
}

function formatAge(isoString?: string): string {
  if (!isoString) return ''
  const diff = Date.now() - new Date(isoString).getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return `${Math.floor(diff / 60_000)}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function ConditionsList({ conditions }: ConditionsListProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="space-y-1">
      {conditions.map((cond, i) => (
        <motion.div
          key={cond.type}
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { duration: 0.15, delay: Math.min(i * STAGGER.fast, 0.3) }
          }
          className="flex items-center gap-2.5 px-2.5 py-1.5 bg-white/[0.02] border border-[var(--color-border)]/40 rounded-lg text-[11px]"
        >
          <span className={`h-2 w-2 rounded-full shrink-0 ${statusDotClass(cond.status)}`} />
          <span className="font-semibold text-[var(--color-text-primary)] min-w-[120px]">
            {cond.type}
          </span>
          <span
            className={`font-mono ${cond.status === 'True' ? 'text-[var(--color-status-active)]' : cond.status === 'False' ? 'text-[var(--color-status-error)]' : 'text-[var(--color-status-warning)]'}`}
          >
            {cond.status}
          </span>
          {cond.reason && (
            <span className="text-[var(--color-text-muted)] truncate">{cond.reason}</span>
          )}
          {cond.lastTransitionTime && (
            <span className="text-[var(--color-text-dim)] ml-auto shrink-0">
              {formatAge(cond.lastTransitionTime)}
            </span>
          )}
        </motion.div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/expandable/ResourceBar.tsx apps/web/src/components/expandable/ConditionsList.tsx
git commit -m "feat: add ResourceBar and ConditionsList components"
```

---

### Task 6: Build ExpandableTableRow component + barrel export

**Files:**
- Create: `apps/web/src/components/expandable/ExpandableTableRow.tsx`
- Create: `apps/web/src/components/expandable/index.ts`

- [ ] **Step 1: Create ExpandableTableRow**

This is a wrapper for DataTable row expansion. It renders a `<tr>` that, when clicked, reveals a detail `<tr>` spanning the full table width below it. Since our DataTable uses TanStack Table with `flexRender`, we integrate via a wrapper that the page passes as a custom row renderer.

```typescript
'use client'

import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { chevronVariants, EASING, expandVariants } from '@/lib/animation-constants'

interface ExpandableTableRowProps {
  cells: ReactNode
  detail: ReactNode
  columnCount: number
  defaultExpanded?: boolean
}

export function ExpandableTableRow({
  cells,
  detail,
  columnCount,
  defaultExpanded = false,
}: ExpandableTableRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const shouldReduceMotion = useReducedMotion()

  return (
    <>
      <tr
        onClick={() => setExpanded((prev) => !prev)}
        className={`cursor-pointer transition-colors duration-150 ${
          expanded
            ? 'bg-[var(--color-accent)]/[0.03]'
            : 'hover:bg-white/[0.02]'
        }`}
      >
        {cells}
        <td className="px-3 py-2 text-right">
          <motion.div
            variants={chevronVariants}
            animate={expanded ? 'expanded' : 'collapsed'}
            transition={shouldReduceMotion ? { duration: 0 } : EASING.spring}
            className="inline-flex"
          >
            <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
          </motion.div>
        </td>
      </tr>
      <AnimatePresence initial={false}>
        {expanded && (
          <tr>
            <td colSpan={columnCount + 1} className="p-0">
              <motion.div
                variants={shouldReduceMotion ? undefined : expandVariants}
                initial="collapsed"
                animate="expanded"
                exit="exit"
                className="border-t border-[var(--color-border)]/40 bg-[var(--color-accent)]/[0.01]"
              >
                {detail}
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  )
}
```

- [ ] **Step 2: Create barrel export**

```typescript
// apps/web/src/components/expandable/index.ts
export { ExpandableCard } from './ExpandableCard'
export { ExpandableTableRow } from './ExpandableTableRow'
export { DetailTabs, type DetailTab } from './DetailTabs'
export { DetailRow } from './DetailRow'
export { DetailGrid } from './DetailGrid'
export { ResourceBar } from './ResourceBar'
export { ConditionsList } from './ConditionsList'
export { TagPills } from './TagPills'
```

- [ ] **Step 3: Verify typecheck**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/expandable/
git commit -m "feat: add ExpandableTableRow + barrel export for expandable library"
```

---

### Task 7: Create cluster tabs configuration

**Files:**
- Create: `apps/web/src/components/clusters/cluster-tabs-config.ts`

- [ ] **Step 1: Create the configuration file**

This defines the grouped tab structure used by `GroupedTabBar`. Each entry is either a standalone tab or a group with children.

```typescript
import {
  Activity,
  BarChart3,
  Box,
  FileText,
  HardDrive,
  LayoutDashboard,
  Network,
  Server,
  Settings,
  TrendingUp,
} from 'lucide-react'
import type { ElementType } from 'react'

export interface StandaloneTab {
  type: 'standalone'
  id: string
  label: string
  path: string
  icon: ElementType
}

export interface TabGroup {
  type: 'group'
  id: string
  label: string
  icon: ElementType
  children: { id: string; label: string; path: string }[]
}

export type ClusterTabEntry = StandaloneTab | TabGroup

export const CLUSTER_TAB_ENTRIES: ClusterTabEntry[] = [
  { type: 'standalone', id: 'overview', label: 'Overview', path: '', icon: LayoutDashboard },
  { type: 'standalone', id: 'nodes', label: 'Nodes', path: '/nodes', icon: Server },
  {
    type: 'group',
    id: 'workloads',
    label: 'Workloads',
    icon: Box,
    children: [
      { id: 'pods', label: 'Pods', path: '/pods' },
      { id: 'deployments', label: 'Deployments', path: '/deployments' },
      { id: 'statefulsets', label: 'StatefulSets', path: '/statefulsets' },
      { id: 'daemonsets', label: 'DaemonSets', path: '/daemonsets' },
      { id: 'jobs', label: 'Jobs', path: '/jobs' },
      { id: 'cronjobs', label: 'CronJobs', path: '/cronjobs' },
    ],
  },
  {
    type: 'group',
    id: 'networking',
    label: 'Networking',
    icon: Network,
    children: [
      { id: 'services', label: 'Services', path: '/services' },
      { id: 'ingresses', label: 'Ingresses', path: '/ingresses' },
    ],
  },
  {
    type: 'group',
    id: 'config',
    label: 'Config',
    icon: Settings,
    children: [
      { id: 'configmaps', label: 'ConfigMaps', path: '/configmaps' },
      { id: 'secrets', label: 'Secrets', path: '/secrets' },
      { id: 'namespaces', label: 'Namespaces', path: '/namespaces' },
    ],
  },
  {
    type: 'group',
    id: 'storage',
    label: 'Storage',
    icon: HardDrive,
    children: [{ id: 'pvcs', label: 'PVCs', path: '/pvcs' }],
  },
  {
    type: 'group',
    id: 'scaling',
    label: 'Scaling',
    icon: TrendingUp,
    children: [
      { id: 'hpa', label: 'HPA', path: '/hpa' },
      { id: 'autoscaling', label: 'Karpenter', path: '/autoscaling' },
    ],
  },
  { type: 'standalone', id: 'events', label: 'Events', path: '/events', icon: Activity },
  { type: 'standalone', id: 'logs', label: 'Logs', path: '/logs', icon: FileText },
  { type: 'standalone', id: 'metrics', label: 'Metrics', path: '/metrics', icon: BarChart3 },
]

/** Flatten all tab entries to a flat list of { id, path } for URL matching */
export function getAllTabPaths(): { id: string; path: string }[] {
  return CLUSTER_TAB_ENTRIES.flatMap((entry) =>
    entry.type === 'standalone'
      ? [{ id: entry.id, path: entry.path }]
      : entry.children.map((child) => ({ id: child.id, path: child.path })),
  )
}

/** Find which group (if any) contains the active tab */
export function findGroupForTab(tabId: string): string | null {
  for (const entry of CLUSTER_TAB_ENTRIES) {
    if (entry.type === 'group' && entry.children.some((c) => c.id === tabId)) {
      return entry.id
    }
  }
  return null
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/clusters/cluster-tabs-config.ts
git commit -m "feat: add grouped cluster tab configuration with 19 resources"
```

---

### Task 8: Build GroupedTabBar component

**Files:**
- Create: `apps/web/src/components/clusters/GroupedTabBar.tsx`

- [ ] **Step 1: Create the GroupedTabBar**

This replaces the flat tab bar in `layout.tsx`. It renders standalone tabs and grouped dropdowns with spring animations.

```typescript
'use client'

import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import {
  dropdownItemVariants,
  dropdownVariants,
  EASING,
  STAGGER,
} from '@/lib/animation-constants'
import {
  type ClusterTabEntry,
  CLUSTER_TAB_ENTRIES,
  findGroupForTab,
  getAllTabPaths,
} from './cluster-tabs-config'

interface GroupedTabBarProps {
  clusterRouteSegment: string
  activeTab: string
}

export function GroupedTabBar({ clusterRouteSegment, activeTab }: GroupedTabBarProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const shouldReduceMotion = useReducedMotion()
  const dropdownRef = useRef<HTMLDivElement>(null)

  const activeGroup = findGroupForTab(activeTab)
  const basePath = `/clusters/${clusterRouteSegment}`

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!openGroup) return

    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenGroup(null)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenGroup(null)
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openGroup])

  return (
    <div className="mb-3 border-b border-[var(--color-border)] overflow-x-auto" ref={dropdownRef}>
      <nav className="flex items-end gap-0 min-w-max" aria-label="Cluster tabs">
        {CLUSTER_TAB_ENTRIES.map((entry) =>
          entry.type === 'standalone' ? (
            <StandaloneTabItem
              key={entry.id}
              entry={entry}
              basePath={basePath}
              isActive={activeTab === entry.id}
              shouldReduceMotion={shouldReduceMotion}
            />
          ) : (
            <GroupTabItem
              key={entry.id}
              entry={entry}
              basePath={basePath}
              activeTab={activeTab}
              activeGroup={activeGroup}
              isOpen={openGroup === entry.id}
              onToggle={() => setOpenGroup((prev) => (prev === entry.id ? null : entry.id))}
              onClose={() => setOpenGroup(null)}
              shouldReduceMotion={shouldReduceMotion}
            />
          ),
        )}
      </nav>
    </div>
  )
}

function StandaloneTabItem({
  entry,
  basePath,
  isActive,
  shouldReduceMotion,
}: {
  entry: Extract<ClusterTabEntry, { type: 'standalone' }>
  basePath: string
  isActive: boolean
  shouldReduceMotion: boolean | null
}) {
  const Icon = entry.icon

  return (
    <Link
      href={`${basePath}${entry.path}`}
      data-testid={`cluster-tab-${entry.id}`}
      className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 ${
        isActive
          ? 'text-[var(--color-text-primary)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {entry.label}
      {isActive && (
        <motion.div
          layoutId="cluster-tab-underline"
          className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[var(--color-accent)]"
          transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
        />
      )}
    </Link>
  )
}

function GroupTabItem({
  entry,
  basePath,
  activeTab,
  activeGroup,
  isOpen,
  onToggle,
  onClose,
  shouldReduceMotion,
}: {
  entry: Extract<ClusterTabEntry, { type: 'group' }>
  basePath: string
  activeTab: string
  activeGroup: string | null
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  shouldReduceMotion: boolean | null
}) {
  const Icon = entry.icon
  const isGroupActive = activeGroup === entry.id
  const activeChild = entry.children.find((c) => c.id === activeTab)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        data-testid={`cluster-tab-group-${entry.id}`}
        className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap cursor-pointer transition-colors duration-150 ${
          isGroupActive || isOpen
            ? 'text-[var(--color-text-primary)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        {activeChild ? activeChild.label : entry.label}
        <ChevronDown
          className={`h-3 w-3 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
        {isGroupActive && (
          <motion.div
            layoutId="cluster-tab-underline"
            className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[var(--color-accent)]"
            transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
          />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={shouldReduceMotion ? undefined : dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute top-full left-0 mt-1 z-50 min-w-[180px] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-sm overflow-hidden"
          >
            <div className="py-1">
              {entry.children.map((child, i) => (
                <motion.div
                  key={child.id}
                  variants={shouldReduceMotion ? undefined : dropdownItemVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: i * STAGGER.fast }}
                >
                  <Link
                    href={`${basePath}${child.path}`}
                    onClick={onClose}
                    data-testid={`cluster-tab-${child.id}`}
                    className={`block px-4 py-2 text-[13px] transition-colors duration-150 ${
                      activeTab === child.id
                        ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/[0.05] font-medium'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.03]'
                    }`}
                  >
                    {child.label}
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/clusters/GroupedTabBar.tsx
git commit -m "feat: add GroupedTabBar with spring-animated dropdowns"
```

---

### Task 9: Integrate GroupedTabBar into cluster layout

**Files:**
- Modify: `apps/web/src/app/clusters/[id]/layout.tsx`

- [ ] **Step 1: Replace the flat CLUSTER_TABS and inline tab bar**

In `apps/web/src/app/clusters/[id]/layout.tsx`:

1. Remove the `CLUSTER_TABS` const (lines 13-24)
2. Remove the inline `<nav>` tab bar (the section rendering `CLUSTER_TABS.map(...)`)
3. Import `GroupedTabBar` and `getAllTabPaths` instead
4. Update `getActiveTab()` to use `getAllTabPaths()`
5. Update the keyboard shortcut handler to work with the new structure
6. Replace the tab bar JSX with `<GroupedTabBar clusterRouteSegment={clusterRouteSegment} activeTab={activeTab} />`

Key changes in the `getActiveTab` function:
```typescript
import { GroupedTabBar } from '@/components/clusters/GroupedTabBar'
import { getAllTabPaths } from '@/components/clusters/cluster-tabs-config'

// In the component:
const getActiveTab = () => {
  const base = `/clusters/${clusterRouteSegment}`
  const rest = pathname.replace(base, '')
  if (!rest || rest === '/') return 'overview'
  const segment = rest.replace(/^\//, '').split('/')[0]
  return segment || 'overview'
}
```

Replace the `{/* 10-Tab Bar */}` section with:
```tsx
<GroupedTabBar
  clusterRouteSegment={clusterRouteSegment}
  activeTab={activeTab}
/>
```

Update keyboard shortcut handler: Remove the number-key shortcuts (they mapped to flat tab indices), keep `[` and `]` for prev/next using `getAllTabPaths()` instead of the old `CLUSTER_TABS`.

- [ ] **Step 2: Verify typecheck + build**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck && pnpm build`

- [ ] **Step 3: Manual verification**

Start dev servers and verify:
1. Navigate to a cluster detail page
2. Confirm standalone tabs (Overview, Nodes, Events, Logs, Metrics) work as direct links
3. Confirm group tabs (Workloads, Networking, Config, Storage, Scaling) show dropdown on click
4. Confirm dropdown items navigate correctly
5. Confirm active tab highlighting works for both standalone and grouped tabs
6. Confirm Karpenter is accessible under Scaling → Karpenter at `/autoscaling` URL

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/clusters/[id]/layout.tsx
git commit -m "feat: replace flat 10-tab bar with GroupedTabBar navigation"
```

---

### Task 10: Create page stubs for new resources

**Files:**
- Create: 9 new `page.tsx` files for new resource routes

- [ ] **Step 1: Create stub pages**

Each stub is a minimal placeholder showing the resource name and a "Coming soon" message. This ensures the navigation links don't 404.

Create each file with this pattern (replace `ResourceName`):

```typescript
'use client'

import { usePageTitle } from '@/hooks/usePageTitle'

export default function ResourceNamePage() {
  usePageTitle('ResourceName')

  return (
    <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[var(--color-border)] rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)]">
      <p className="text-sm font-medium">ResourceName</p>
      <p className="text-xs text-[var(--color-text-dim)] mt-1">
        Coming in a future update.
      </p>
    </div>
  )
}
```

Create files for: `statefulsets`, `daemonsets`, `jobs`, `cronjobs`, `ingresses`, `configmaps`, `secrets`, `pvcs`, `hpa`

Each at: `apps/web/src/app/clusters/[id]/{resource}/page.tsx`

- [ ] **Step 2: Verify build**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm build`
Expected: All pages compile without error

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/clusters/[id]/statefulsets/ apps/web/src/app/clusters/[id]/daemonsets/ apps/web/src/app/clusters/[id]/jobs/ apps/web/src/app/clusters/[id]/cronjobs/ apps/web/src/app/clusters/[id]/ingresses/ apps/web/src/app/clusters/[id]/configmaps/ apps/web/src/app/clusters/[id]/secrets/ apps/web/src/app/clusters/[id]/pvcs/ apps/web/src/app/clusters/[id]/hpa/
git commit -m "feat: add stub pages for 9 new K8s resource routes"
```

---

### Task 11: Fix authorizedProcedure to recognize clusterId

**Files:**
- Modify: `apps/api/src/trpc.ts`

- [ ] **Step 1: Add `clusterId` to the authorization schema**

In `apps/api/src/trpc.ts`, update `authorizationObjectIdInputSchema` (line 93-96):

```typescript
const authorizationObjectIdInputSchema = z.object({
  id: z.string().optional(),
  objectId: z.string().optional(),
  clusterId: z.string().optional(),
})
```

Then update the object ID extraction (line 117-118):

```typescript
const objectId = objectIdInput.success
  ? (objectIdInput.data.objectId ?? objectIdInput.data.id ?? objectIdInput.data.clusterId)
  : undefined
```

And update the error message (line ~122):

```typescript
throw new TRPCError({
  code: 'BAD_REQUEST',
  message: 'authorizedProcedure requires input with `id`, `objectId`, or `clusterId`',
})
```

- [ ] **Step 2: Run existing tests**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm --filter api test`
Expected: All existing tests pass (this is additive, not breaking)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/trpc.ts
git commit -m "fix: add clusterId to authorizedProcedure input recognition"
```

---

## Wave 2-8 Roadmap

Each subsequent wave follows the patterns established in Wave 1. Here's the key file mapping for each wave:

### Wave 2: Karpenter (NodeClaims + Expand)
| Action | Files |
|--------|-------|
| Add NodeClaim types | `packages/types/src/karpenter.ts` |
| Add listNodeClaims endpoint | `apps/api/src/routers/karpenter.ts`, `apps/api/src/lib/karpenter-service.ts` |
| Extend EC2NodeClass schema | `packages/types/src/karpenter.ts` (blockDeviceMappings, metadataOptions, tags) |
| Extend EC2NodeClass extraction | `apps/api/src/lib/karpenter-service.ts` |
| Rewrite autoscaling page | `apps/web/src/app/clusters/[id]/autoscaling/page.tsx` — use `ExpandableCard`, `DetailTabs`, `ResourceBar`, `ConditionsList`, `TagPills` |

### Wave 3: Nodes + Pods
| Action | Files |
|--------|-------|
| Extend nodes router | `apps/api/src/routers/nodes.ts` — add labels, taints, conditions, allocatable, capacity |
| Extend pods router | `apps/api/src/routers/pods.ts` — add container details, conditions |
| Rewrite nodes page | `apps/web/src/app/clusters/[id]/nodes/page.tsx` — add `ExpandableTableRow` |
| Rewrite pods page | `apps/web/src/app/clusters/[id]/pods/page.tsx` — replace `PodDetailSheet` with `ExpandableCard` |

### Wave 4: Deployments + Services
| Action | Files |
|--------|-------|
| Extend deployments router | `apps/api/src/routers/deployments.ts` — add strategy, conditions, selector |
| Extend services router | `apps/api/src/routers/services.ts` — add endpoints, selector |
| Update pages | `apps/web/src/app/clusters/[id]/deployments/page.tsx`, `services/page.tsx` |

### Wave 5: Ingresses + StatefulSets + DaemonSets
| Action | Files |
|--------|-------|
| New routers | `apps/api/src/routers/ingresses.ts`, `statefulsets.ts`, `daemonsets.ts` |
| New types | `packages/types/src/ingresses.ts`, `statefulsets.ts`, `daemonsets.ts` |
| Register routers | `apps/api/src/routers/index.ts` |
| Full pages | Replace stubs with DataTable + `ExpandableTableRow` pages |

### Wave 6: Jobs + CronJobs + HPA
| Action | Files |
|--------|-------|
| New routers | `apps/api/src/routers/jobs.ts`, `cronjobs.ts`, `hpa.ts` |
| New types | `packages/types/src/jobs.ts`, `cronjobs.ts`, `hpa.ts` |
| Register routers | `apps/api/src/routers/index.ts` |
| Full pages | Replace stubs |

### Wave 7: ConfigMaps + Secrets + PVCs
| Action | Files |
|--------|-------|
| New routers | `apps/api/src/routers/configmaps.ts`, `secrets.ts`, `pvcs.ts` |
| New types | `packages/types/src/configmaps.ts`, `secrets.ts`, `pvcs.ts` |
| **Secrets safety** | Server-side strip `.data` and `.stringData` — only return key names |
| Register routers | `apps/api/src/routers/index.ts` |
| Full pages | Replace stubs |

### Wave 8: Namespaces + Events + Polish
| Action | Files |
|--------|-------|
| Extend namespaces router | `apps/api/src/routers/namespaces.ts` — add labels, annotations |
| Extend events router | `apps/api/src/routers/events.ts` — add involved object, source, full message |
| Update pages | `namespaces/page.tsx`, `events/page.tsx` — add expandable details |
| Final QA | Full typecheck, build, both themes, reduced motion |

---

## Verification

After Wave 1 is complete, verify:
1. `pnpm typecheck` — 0 errors
2. `pnpm build` — all pages compile
3. `pnpm test` — all existing tests pass
4. Manual: grouped tab bar works with all navigation patterns
5. Manual: all 9 stub pages accessible via grouped navigation
6. Manual: component library components render correctly (test via Karpenter page in Wave 2)
