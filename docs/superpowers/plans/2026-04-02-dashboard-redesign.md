# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the verbose 640px-chrome dashboard with a compact Rancher-style layout (~92px to first cluster card), removing widget mode entirely.

**Architecture:** Delete all widget infrastructure (16 frontend files + backend router + DB schema). Replace `page.tsx` monolith with 5 focused components: KpiStrip, ClusterCard, EnvironmentGroup, DashboardFilterChips, DashboardSkeleton. All values centralized via CSS variables and animation tokens.

**Tech Stack:** Next.js 16, React 19, Motion v12, Tailwind 4, tRPC 11, Drizzle ORM, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-02-dashboard-redesign-design.md`

---

## File Map

### Files to Delete (19 total)

**Frontend — Widget Mode:**
- `apps/web/src/components/dashboard/DashboardGrid.tsx`
- `apps/web/src/components/dashboard/WidgetWrapper.tsx`
- `apps/web/src/components/dashboard/WidgetConfigModal.tsx`
- `apps/web/src/components/dashboard/DashboardEditBar.tsx`
- `apps/web/src/components/dashboard/WidgetLibraryDrawer.tsx`
- `apps/web/src/components/dashboard/DashboardRefreshContext.tsx`
- `apps/web/src/components/dashboard/RefreshIntervalSelector.tsx`
- `apps/web/src/components/dashboard/AnomalyTimeline.tsx`
- `apps/web/src/components/dashboard/widgets/StatCardsWidget.tsx`
- `apps/web/src/components/dashboard/widgets/ClusterHealthWidget.tsx`
- `apps/web/src/components/dashboard/widgets/ResourceChartsWidget.tsx`
- `apps/web/src/components/dashboard/widgets/AlertFeedWidget.tsx`
- `apps/web/src/components/dashboard/widgets/AnomalyTimelineWidget.tsx`
- `apps/web/src/components/dashboard/widgets/DeploymentListWidget.tsx`
- `apps/web/src/components/dashboard/widgets/LogTailWidget.tsx`
- `apps/web/src/components/dashboard/widgets/PodStatusWidget.tsx`
- `apps/web/src/stores/dashboard-layout.ts`

**Backend:**
- `apps/api/src/routers/dashboard-layout.ts`
- `packages/db/src/schema/dashboard-layouts.ts`

### Files to Modify

- `apps/web/src/app/globals.css` — add `--color-accent-glow`, `--shadow-card-hover`
- `apps/web/src/lib/animation-constants.ts` — add `DURATION.statusPulse`, `DURATION.statusPulseCrit`, `dashboardCardVariants`
- `apps/web/src/app/page.tsx` — gut and rebuild (from ~1000 lines to ~120 lines)
- `apps/web/src/components/TopBar.tsx` — accept optional `pageTitle` prop
- `apps/api/src/routers/index.ts` — remove `dashboardLayout` registration
- `packages/db/src/schema/index.ts` — remove `dashboardLayouts` export
- `charts/voyager/sql/init.sql` — drop `dashboard_layouts` table

### Files to Create

- `apps/web/src/components/dashboard/KpiStrip.tsx`
- `apps/web/src/components/dashboard/ClusterCard.tsx`
- `apps/web/src/components/dashboard/EnvironmentGroup.tsx`
- `apps/web/src/components/dashboard/DashboardFilterChips.tsx`
- `apps/web/src/components/dashboard/DashboardSkeleton.tsx`

---

## Task 1: Add Centralized Tokens (CSS Variables + Animation Constants)

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/lib/animation-constants.ts`

- [ ] **Step 1: Add CSS variables to dark theme in globals.css**

In `:root` block (after `--shadow-card` line ~219), add:

```css
  --color-accent-glow: rgba(139, 92, 246, 0.25);
  --shadow-card-hover: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.1);
```

- [ ] **Step 2: Add CSS variables to light theme in globals.css**

In `html.light` block (after `--shadow-card` line ~349), add:

```css
  --color-accent-glow: rgba(79, 70, 229, 0.2);
  --shadow-card-hover: 0 4px 12px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(79, 70, 229, 0.08);
```

- [ ] **Step 3: Add animation tokens to animation-constants.ts**

After the `DURATION` object (line 15), add `statusPulse` and `statusPulseCrit`:

```typescript
export const DURATION = {
  instant: 0.08,
  fast: 0.15,
  normal: 0.2,
  slow: 0.3,
  page: 0.25,
  counter: 0.8,
  counterLarge: 1.2,
  statusPulse: 2,
  statusPulseCrit: 1.5,
} as const
```

After `cardTap` (line 113), add dashboard-specific card entrance variants:

```typescript
export const dashboardCardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATION.slow,
      delay: i * STAGGER.slow,
      ease: EASING.default,
    },
  }),
  exit: { opacity: 0, scale: 0.96, transition: { duration: DURATION.fast, ease: EASING.exit } },
} as const
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/lib/animation-constants.ts
git commit -m "feat(web): add centralized tokens for dashboard redesign

Add --color-accent-glow and --shadow-card-hover CSS variables (both themes).
Add DURATION.statusPulse, DURATION.statusPulseCrit, and dashboardCardVariants
animation constants."
```

---

## Task 2: Delete Widget Mode Frontend (17 files)

**Files:**
- Delete: all files listed in "Files to Delete — Frontend" above
- Modify: none yet (page.tsx handled in Task 6)

- [ ] **Step 1: Delete all widget component files**

```bash
cd /Users/viktork/Documents/private/GitHub-private/voyager-platform
rm apps/web/src/components/dashboard/DashboardGrid.tsx
rm apps/web/src/components/dashboard/WidgetWrapper.tsx
rm apps/web/src/components/dashboard/WidgetConfigModal.tsx
rm apps/web/src/components/dashboard/DashboardEditBar.tsx
rm apps/web/src/components/dashboard/WidgetLibraryDrawer.tsx
rm apps/web/src/components/dashboard/DashboardRefreshContext.tsx
rm apps/web/src/components/dashboard/RefreshIntervalSelector.tsx
rm apps/web/src/components/dashboard/AnomalyTimeline.tsx
rm -rf apps/web/src/components/dashboard/widgets/
rm apps/web/src/stores/dashboard-layout.ts
```

- [ ] **Step 2: Verify no other files import the deleted modules**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && grep -r "dashboard/DashboardGrid\|dashboard/WidgetWrapper\|dashboard/DashboardEditBar\|dashboard/WidgetLibraryDrawer\|dashboard/DashboardRefreshContext\|dashboard/RefreshIntervalSelector\|dashboard/AnomalyTimeline\|dashboard/WidgetConfigModal\|stores/dashboard-layout" apps/web/src/ --include="*.ts" --include="*.tsx" -l`

Expected: only `apps/web/src/app/page.tsx` (will be refactored in Task 6)

- [ ] **Step 3: Commit deletions**

```bash
git add -u apps/web/src/components/dashboard/ apps/web/src/stores/dashboard-layout.ts
git commit -m "refactor(web): delete widget mode infrastructure (17 files)

Remove DashboardGrid, WidgetWrapper, all 8 widget components,
DashboardEditBar, WidgetLibraryDrawer, DashboardRefreshContext,
RefreshIntervalSelector, AnomalyTimeline, WidgetConfigModal,
and dashboard-layout Zustand store."
```

---

## Task 3: Delete Widget Mode Backend (router + schema + migration)

**Files:**
- Delete: `apps/api/src/routers/dashboard-layout.ts`
- Delete: `packages/db/src/schema/dashboard-layouts.ts`
- Modify: `apps/api/src/routers/index.ts` (remove registration)
- Modify: `packages/db/src/schema/index.ts` (remove export)
- Modify: `charts/voyager/sql/init.sql` (drop table)

- [ ] **Step 1: Delete the router file**

```bash
rm /Users/viktork/Documents/private/GitHub-private/voyager-platform/apps/api/src/routers/dashboard-layout.ts
```

- [ ] **Step 2: Remove router registration from index.ts**

In `apps/api/src/routers/index.ts`, remove the import line:
```typescript
import { dashboardLayoutRouter } from './dashboard-layout.js'
```

And remove the registration line:
```typescript
  dashboardLayout: dashboardLayoutRouter,
```

- [ ] **Step 3: Delete the DB schema file**

```bash
rm /Users/viktork/Documents/private/GitHub-private/voyager-platform/packages/db/src/schema/dashboard-layouts.ts
```

- [ ] **Step 4: Remove export from schema/index.ts**

In `packages/db/src/schema/index.ts`, remove:
```typescript
export { dashboardLayouts } from './dashboard-layouts.js'
```

- [ ] **Step 5: Drop table from init.sql**

In `charts/voyager/sql/init.sql`, find the `CREATE TABLE IF NOT EXISTS dashboard_layouts` block and remove it entirely. Add a `DROP TABLE IF EXISTS dashboard_layouts;` at the top of the file (in the cleanup section if one exists, otherwise before the first CREATE TABLE).

- [ ] **Step 6: Generate Drizzle migration**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm db:generate`

- [ ] **Step 7: Verify typecheck passes**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`
Expected: errors only in `page.tsx` (still references `dashboardLayout` — fixed in Task 6)

- [ ] **Step 8: Commit**

```bash
git add -u apps/api/src/routers/ packages/db/src/schema/ charts/voyager/sql/init.sql
git add packages/db/drizzle/
git commit -m "refactor(api,db): remove dashboard-layout backend

Delete dashboard-layout tRPC router, drop dashboard_layouts DB table,
remove schema and router registrations. Widget layout persistence
no longer needed."
```

---

## Task 4: Create KpiStrip Component

**Files:**
- Create: `apps/web/src/components/dashboard/KpiStrip.tsx`

- [ ] **Step 1: Create KpiStrip component**

Create `apps/web/src/components/dashboard/KpiStrip.tsx`:

```tsx
'use client'

import { DURATION, EASING } from '@/lib/animation-constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'

interface KpiStripProps {
  clusterCount: number
  totalNodes: number
  runningPods: number
  totalPods: number
  warningEvents: number
  healthCounts: { healthy: number; degraded: number; critical: number }
  isLoading: boolean
}

function AnimatedNumber({ value, duration }: { value: number; duration: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!ref.current || reduced) {
      if (ref.current) ref.current.textContent = String(value)
      return
    }
    const el = ref.current
    const start = performance.now()
    const durationMs = duration * 1000

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / durationMs, 1)
      const eased = 1 - (1 - progress) ** 3 // ease-out cubic
      el.textContent = String(Math.round(eased * value))
      if (progress < 1) requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  }, [value, duration, reduced])

  return <span ref={ref} className="tabular-nums font-semibold text-[var(--color-text-primary)]">{reduced ? value : 0}</span>
}

function KpiDot({ color, animate }: { color: string; animate?: boolean }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${animate ? 'animate-glow-warning' : ''}`}
      style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
    />
  )
}

function HealthDots({ counts }: { counts: KpiStripProps['healthCounts'] }) {
  return (
    <div className="ml-auto flex items-center gap-2.5">
      <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-dim)]">
        <span className="inline-block h-[7px] w-[7px] rounded-full bg-[var(--color-status-active)] shadow-[0_0_4px_var(--color-status-active)] transition-transform hover:scale-150" />
        <span className="tabular-nums">{counts.healthy}</span>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-dim)]">
        <span className="inline-block h-[7px] w-[7px] rounded-full bg-[var(--color-status-warning)] shadow-[0_0_4px_var(--color-status-warning)] transition-transform hover:scale-150" />
        <span className="tabular-nums">{counts.degraded}</span>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-dim)]">
        <span className="inline-block h-[7px] w-[7px] rounded-full bg-[var(--color-status-error)] shadow-[0_0_4px_var(--color-status-error)] transition-transform hover:scale-150" />
        <span className="tabular-nums">{counts.critical}</span>
      </div>
    </div>
  )
}

function Separator() {
  return <div className="h-4 w-px bg-[var(--color-border)]" />
}

export function KpiStrip({
  clusterCount,
  totalNodes,
  runningPods,
  totalPods,
  warningEvents,
  healthCounts,
  isLoading,
}: KpiStripProps) {
  const reduced = useReducedMotion()

  if (isLoading) {
    return (
      <div className="mb-4 flex items-center gap-4 px-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 w-20 animate-pulse rounded bg-[var(--color-bg-secondary)]" />
        ))}
      </div>
    )
  }

  return (
    <motion.div
      className="mb-4 flex items-center gap-4 px-1 text-xs text-[var(--color-text-muted)]"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: EASING.default }}
    >
      <div className="flex items-center gap-1.5">
        <KpiDot color="var(--color-status-active)" />
        <AnimatedNumber value={clusterCount} duration={DURATION.counter} />
        <span>clusters</span>
      </div>
      <Separator />
      <div className="flex items-center gap-1.5">
        <AnimatedNumber value={totalNodes} duration={DURATION.counter} />
        <span>nodes</span>
      </div>
      <Separator />
      <div className="flex items-center gap-1.5">
        <AnimatedNumber value={runningPods} duration={DURATION.counter} />
        <span className="text-[var(--color-text-dim)]">/{totalPods}</span>
        <span>pods</span>
      </div>
      <Separator />
      <div className="flex items-center gap-1.5">
        <KpiDot color="var(--color-status-warning)" animate={warningEvents > 0} />
        <AnimatedNumber value={warningEvents} duration={DURATION.counter} />
        <span>warnings</span>
      </div>
      <HealthDots counts={healthCounts} />
    </motion.div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/KpiStrip.tsx
git commit -m "feat(web): add KpiStrip — compact single-line metrics strip

36px inline KPI pills with animated count-up numbers, health dots
with hover scale, warning glow animation. All values from centralized
CSS variables and animation tokens."
```

---

## Task 5: Create ClusterCard, EnvironmentGroup, DashboardFilterChips, DashboardSkeleton

**Files:**
- Create: `apps/web/src/components/dashboard/ClusterCard.tsx`
- Create: `apps/web/src/components/dashboard/EnvironmentGroup.tsx`
- Create: `apps/web/src/components/dashboard/DashboardFilterChips.tsx`
- Create: `apps/web/src/components/dashboard/DashboardSkeleton.tsx`

- [ ] **Step 1: Create ClusterCard component**

Create `apps/web/src/components/dashboard/ClusterCard.tsx`:

```tsx
'use client'

import { ENV_META, type ClusterEnvironment } from '@/lib/cluster-meta'
import { dashboardCardVariants, cardHover, cardTap, DURATION } from '@/lib/animation-constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { motion } from 'motion/react'
import Link from 'next/link'
import { useCallback, useRef } from 'react'

interface ClusterCardProps {
  id: string
  name: string
  provider: string
  version: string | null
  status: string | null
  nodeCount: number
  runningPods: number
  totalPods: number
  source: 'live' | 'db'
  environment: ClusterEnvironment
  index: number
}

function getHealthLabel(status: string | null): { label: string; colorVar: string } {
  const s = (status ?? 'unknown').toLowerCase()
  if (s === 'healthy' || s === 'active' || s === 'ready') {
    return { label: 'healthy', colorVar: 'var(--color-status-active)' }
  }
  if (s === 'warning' || s === 'degraded') {
    return { label: 'degraded', colorVar: 'var(--color-status-warning)' }
  }
  return { label: 'critical', colorVar: 'var(--color-status-error)' }
}

function StatusDot({ status }: { status: string | null }) {
  const { label, colorVar } = getHealthLabel(status)
  const pulseClass =
    label === 'degraded'
      ? 'animate-glow-warning'
      : label === 'critical'
        ? 'animate-glow-critical'
        : ''

  return (
    <span
      className={`inline-block h-2 w-2 flex-shrink-0 rounded-full transition-transform group-hover:scale-[1.3] ${pulseClass}`}
      style={{ backgroundColor: colorVar, boxShadow: `0 0 6px ${colorVar}` }}
    />
  )
}

export function ClusterCard({
  id,
  name,
  provider,
  version,
  status,
  nodeCount,
  runningPods,
  totalPods,
  source,
  environment,
  index,
}: ClusterCardProps) {
  const reduced = useReducedMotion()
  const cardRef = useRef<HTMLDivElement>(null)
  const { label: healthLabel, colorVar: healthColor } = getHealthLabel(status)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1)
    const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1)
    cardRef.current.style.setProperty('--mouse-x', `${x}%`)
    cardRef.current.style.setProperty('--mouse-y', `${y}%`)
  }, [])

  return (
    <motion.div
      ref={cardRef}
      custom={index}
      variants={reduced ? undefined : dashboardCardVariants}
      initial={reduced ? false : 'hidden'}
      animate="visible"
      exit="exit"
      whileHover={reduced ? undefined : cardHover}
      whileTap={reduced ? undefined : cardTap}
      onMouseMove={handleMouseMove}
      className="group relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3.5 px-4 cursor-pointer transition-colors hover:border-[var(--color-accent-glow)] hover:bg-[var(--color-bg-card-hover)] hover:[box-shadow:var(--shadow-card-hover)]"
    >
      {/* Radial mouse spotlight */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity group-hover:opacity-100"
        style={{
          background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), var(--color-accent-glow), transparent 40%)`,
          opacity: 0.4,
        }}
      />

      {/* Left accent bar */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-sm opacity-60 transition-opacity group-hover:opacity-100"
        style={{ backgroundColor: ENV_META[environment].color }}
      />

      <Link href={`/clusters/${id}`} className="relative z-10 flex flex-col gap-2.5">
        {/* Row 1 — Identity */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={status} />
            <span className="truncate text-[13px] font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-white dark:group-hover:text-white">
              {name}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {source === 'live' && (
              <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium bg-[var(--color-status-active)]/10 text-[var(--color-status-active)]">
                <span className="inline-block h-[5px] w-[5px] rounded-full bg-[var(--color-status-active)] animate-pulse" />
                SSE
              </span>
            )}
            <span className="text-[11px] text-[var(--color-text-dim)] transition-colors group-hover:text-[var(--color-text-muted)]">
              {provider}{version ? ` · v${version}` : ''}
            </span>
          </div>
        </div>

        {/* Row 2 — Metrics */}
        <div className="flex items-center gap-4 text-[11px] text-[var(--color-text-muted)] transition-colors group-hover:text-[var(--color-text-secondary)]">
          <span><span className="tabular-nums font-semibold text-[var(--color-text-secondary)]">{nodeCount}</span> nodes</span>
          {(runningPods > 0 || totalPods > 0) && (
            <span>
              <span className="tabular-nums font-semibold text-[var(--color-text-secondary)]">{runningPods}</span>
              <span className="text-[var(--color-text-dim)]">/{totalPods}</span> pods
            </span>
          )}
          <span className="font-medium" style={{ color: healthColor }}>● {healthLabel}</span>
        </div>
      </Link>
    </motion.div>
  )
}
```

- [ ] **Step 2: Create EnvironmentGroup component**

Create `apps/web/src/components/dashboard/EnvironmentGroup.tsx`:

```tsx
'use client'

import { ENV_META, type ClusterEnvironment } from '@/lib/cluster-meta'
import { DURATION, EASING } from '@/lib/animation-constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'

interface EnvironmentGroupProps {
  environment: ClusterEnvironment
  clusterCount: number
  children: ReactNode
}

export function EnvironmentGroup({ environment, clusterCount, children }: EnvironmentGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const reduced = useReducedMotion()
  const meta = ENV_META[environment]

  if (clusterCount === 0) return null

  return (
    <section className="mb-5">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="group/header mb-2.5 flex w-full items-center gap-2 px-1 text-left"
      >
        <span
          className="inline-block h-2 w-2 rounded-full transition-transform group-hover/header:scale-[1.3]"
          style={{ backgroundColor: meta.color, boxShadow: `0 0 8px ${meta.color}` }}
        />
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--color-text-muted)]">
          {meta.sectionLabel}
        </span>
        <span className="text-[11px] text-[var(--color-text-dim)]">
          {clusterCount} cluster{clusterCount !== 1 ? 's' : ''}
        </span>
        <motion.span
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={{ duration: DURATION.fast }}
          className="text-[var(--color-text-dim)] opacity-0 transition-opacity group-hover/header:opacity-100"
        >
          <ChevronDown className="h-3 w-3" />
        </motion.span>
        <div className="ml-1 flex-1 h-px bg-gradient-to-r from-[var(--color-border)] to-transparent" />
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { type: 'spring', stiffness: EASING.spring.stiffness, damping: EASING.spring.damping },
              opacity: { duration: DURATION.fast, delay: 0.05 },
            }}
            className="overflow-hidden"
            style={{ overflow: 'clip', overflowClipMargin: '20px', paddingTop: 6, paddingBottom: 10 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
```

- [ ] **Step 3: Create DashboardFilterChips component**

Create `apps/web/src/components/dashboard/DashboardFilterChips.tsx`:

```tsx
'use client'

import { type ClusterEnvironment } from '@/lib/cluster-meta'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { useRef, useState, useEffect } from 'react'

interface DashboardFilterChipsProps {
  activeEnv: 'all' | ClusterEnvironment
  onEnvChange: (env: 'all' | ClusterEnvironment) => void
  envCounts: Record<'all' | ClusterEnvironment, number>
  statusOptions: string[]
  providerOptions: string[]
  activeStatus: string
  activeProvider: string
  onStatusChange: (status: string) => void
  onProviderChange: (provider: string) => void
}

const ENV_CHIPS: { key: 'all' | ClusterEnvironment; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'prod', label: 'Prod' },
  { key: 'staging', label: 'Staging' },
  { key: 'dev', label: 'Dev' },
]

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all duration-200',
          'hover:-translate-y-px hover:border-[var(--color-border-hover)]',
          value !== 'all'
            ? 'border-[var(--color-accent-glow)] bg-[var(--color-accent)]/12 text-[var(--color-accent)]'
            : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)]/30 text-[var(--color-text-muted)]',
        )}
      >
        <ChevronDown className="h-2.5 w-2.5" />
        {value === 'all' ? label : value}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[120px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] py-1 shadow-lg">
          <button
            type="button"
            onClick={() => { onChange('all'); setOpen(false) }}
            className={cn('w-full px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--color-bg-card-hover)]', value === 'all' && 'text-[var(--color-accent)]')}
          >
            All
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false) }}
              className={cn('w-full px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--color-bg-card-hover)]', value === opt && 'text-[var(--color-accent)]')}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DashboardFilterChips({
  activeEnv,
  onEnvChange,
  envCounts,
  statusOptions,
  providerOptions,
  activeStatus,
  activeProvider,
  onStatusChange,
  onProviderChange,
}: DashboardFilterChipsProps) {
  return (
    <div className="mb-5 flex items-center gap-1.5 px-1">
      {ENV_CHIPS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onEnvChange(key)}
          className={cn(
            'rounded-lg border px-3 py-1 text-[11px] font-medium transition-all duration-200',
            'hover:-translate-y-px hover:border-[var(--color-border-hover)]',
            'active:scale-[0.97]',
            activeEnv === key
              ? 'border-[var(--color-accent-glow)] bg-[var(--color-accent)]/12 text-[var(--color-accent)] shadow-[0_0_12px_var(--color-accent-glow)]'
              : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)]/30 text-[var(--color-text-muted)]',
          )}
        >
          {label} <span className="opacity-50">{envCounts[key]}</span>
        </button>
      ))}
      <div className="flex-1" />
      <FilterDropdown label="status" value={activeStatus} options={statusOptions} onChange={onStatusChange} />
      <FilterDropdown label="provider" value={activeProvider} options={providerOptions} onChange={onProviderChange} />
    </div>
  )
}
```

- [ ] **Step 4: Create DashboardSkeleton component**

Create `apps/web/src/components/dashboard/DashboardSkeleton.tsx`:

```tsx
export function DashboardSkeleton() {
  return (
    <div className="space-y-5 px-1">
      {/* KPI strip skeleton */}
      <div className="flex items-center gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 w-20 animate-pulse rounded bg-[var(--color-bg-secondary)]" />
        ))}
      </div>
      {/* Filter chips skeleton */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-16 animate-pulse rounded-lg bg-[var(--color-bg-secondary)]" />
        ))}
      </div>
      {/* Env header skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-bg-secondary)]" />
        <div className="h-3 w-24 animate-pulse rounded bg-[var(--color-bg-secondary)]" />
      </div>
      {/* Card skeletons */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify typecheck**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/dashboard/ClusterCard.tsx apps/web/src/components/dashboard/EnvironmentGroup.tsx apps/web/src/components/dashboard/DashboardFilterChips.tsx apps/web/src/components/dashboard/DashboardSkeleton.tsx
git commit -m "feat(web): add compact dashboard components

ClusterCard — two-row card with mouse-follow spotlight, accent bar,
spring hover/tap, pulsing status dots.
EnvironmentGroup — collapsible env sections with thin label headers.
DashboardFilterChips — inline env tabs replacing verbose FilterBar.
DashboardSkeleton — minimal loading state."
```

---

## Task 6: Rebuild page.tsx — Wire Everything Together

**Files:**
- Modify: `apps/web/src/app/page.tsx` (major rewrite)

- [ ] **Step 1: Rewrite page.tsx**

Replace the entire content of `apps/web/src/app/page.tsx` with the following. This keeps the data-fetching logic (tRPC queries, cluster list merging, filtering) but removes all widget mode code and uses the new components:

```tsx
'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { ClusterCard } from '@/components/dashboard/ClusterCard'
import { DashboardFilterChips } from '@/components/dashboard/DashboardFilterChips'
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton'
import { EnvironmentGroup } from '@/components/dashboard/EnvironmentGroup'
import { KpiStrip } from '@/components/dashboard/KpiStrip'
import {
  getClusterEnvironment,
  getClusterTags,
  type ClusterEnvironment,
} from '@/lib/cluster-meta'
import { DB_CLUSTER_REFETCH_MS } from '@/lib/cluster-constants'
import { trpc } from '@/lib/trpc'
import { useClusterContext } from '@/stores/cluster-context'
import { usePageTitle } from '@/hooks/usePageTitle'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'

interface ClusterCardData {
  id: string
  name: string
  provider: string
  version: string | null
  status: string | null
  nodeCount: number
  runningPods: number
  totalPods: number
  source: 'live' | 'db'
  environment: ClusterEnvironment
  tags: string[]
}

type HealthGroup = 'healthy' | 'degraded' | 'critical'
const ENV_ORDER: ClusterEnvironment[] = ['prod', 'staging', 'dev']

function getHealthGroup(status: string | null | undefined): HealthGroup {
  const s = (status ?? 'unknown').toLowerCase()
  if (s === 'healthy' || s === 'active' || s === 'ready') return 'healthy'
  if (s === 'warning' || s === 'degraded') return 'degraded'
  return 'critical'
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  usePageTitle('Dashboard')

  // --- Filters ---
  const [envFilter, setEnvFilter] = useState<'all' | ClusterEnvironment>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [providerFilter, setProviderFilter] = useState('all')

  useEffect(() => {
    const env = searchParams.get('environment')
    if (env === 'prod' || env === 'staging' || env === 'dev' || env === 'all') setEnvFilter(env)
    else if (!env) setEnvFilter('all')
  }, [searchParams])

  const changeEnvFilter = useCallback(
    (env: 'all' | ClusterEnvironment) => {
      const next = new URLSearchParams(searchParams.toString())
      if (env === 'all') next.delete('environment')
      else next.set('environment', env)
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname)
      setEnvFilter(env)
    },
    [searchParams, router, pathname],
  )

  // --- Data fetching ---
  const activeClusterId = useClusterContext((s) => s.activeClusterId)
  const liveQuery = trpc.clusters.live.useQuery(
    { clusterId: activeClusterId ?? '' },
    { enabled: Boolean(activeClusterId) },
  )
  const listQuery = trpc.clusters.list.useQuery(undefined, {
    refetchInterval: DB_CLUSTER_REFETCH_MS,
  })

  const liveData = liveQuery.data
  const dbClusters = listQuery.data ?? []
  const isLoading = liveQuery.isLoading && listQuery.isLoading

  // --- Merge live + DB clusters ---
  const clusterList = useMemo<ClusterCardData[]>(() => {
    const list: ClusterCardData[] = []
    if (liveData) {
      list.push({
        id: activeClusterId ?? 'live',
        name: liveData.name,
        provider: liveData.provider,
        version: liveData.version,
        status: liveData.status,
        nodeCount: liveData.nodes.length,
        runningPods: liveData.runningPods ?? 0,
        totalPods: liveData.totalPods ?? 0,
        source: 'live',
        environment: getClusterEnvironment(liveData.name, liveData.provider),
        tags: getClusterTags({ name: liveData.name, provider: liveData.provider, source: 'live' }),
      })
    }
    for (const c of dbClusters) {
      if (liveData && (c.name === liveData.name || c.name === 'minikube-dev')) continue
      list.push({
        id: c.id,
        name: c.name,
        provider: typeof c.provider === 'string' ? c.provider : 'unknown',
        version: typeof c.version === 'string' ? c.version : null,
        status: typeof c.status === 'string' ? c.status : null,
        nodeCount: c.nodeCount,
        runningPods: 0, // DB-only clusters don't have live pod counts
        totalPods: 0,
        source: 'db',
        environment: getClusterEnvironment(c.name, c.provider),
        tags: getClusterTags({ name: c.name, provider: c.provider, source: 'db' }),
      })
    }
    return list
  }, [liveData, dbClusters, activeClusterId])

  // --- Aggregates ---
  const totalNodes = useMemo(
    () => clusterList.reduce((sum, c) => sum + c.nodeCount, 0),
    [clusterList],
  )
  const runningPods = liveData?.runningPods ?? 0
  const totalPods = liveData?.totalPods ?? 0
  const warningEvents = liveData?.events.filter((e) => e.type === 'Warning').length ?? 0

  const healthCounts = useMemo(() => {
    const counts = { healthy: 0, degraded: 0, critical: 0 }
    for (const c of clusterList) counts[getHealthGroup(c.status)]++
    return counts
  }, [clusterList])

  const envCounts = useMemo(
    () => ({
      all: clusterList.length,
      prod: clusterList.filter((c) => c.environment === 'prod').length,
      staging: clusterList.filter((c) => c.environment === 'staging').length,
      dev: clusterList.filter((c) => c.environment === 'dev').length,
    }),
    [clusterList],
  )

  // --- Derived filter options ---
  const statusOptions = useMemo(() => [...new Set(clusterList.map((c) => (c.status ?? 'unknown').toLowerCase()))].sort(), [clusterList])
  const providerOptions = useMemo(() => [...new Set(clusterList.map((c) => c.provider))].sort(), [clusterList])

  // --- Filter ---
  const visibleClusters = useMemo(() => {
    return clusterList.filter((c) => {
      if (envFilter !== 'all' && c.environment !== envFilter) return false
      if (statusFilter !== 'all' && (c.status ?? 'unknown').toLowerCase() !== statusFilter) return false
      if (providerFilter !== 'all' && c.provider !== providerFilter) return false
      return true
    })
  }, [clusterList, envFilter, statusFilter, providerFilter])

  const groupedByEnv = useMemo(() => {
    const groups: Record<ClusterEnvironment, ClusterCardData[]> = { prod: [], staging: [], dev: [] }
    for (const c of visibleClusters) groups[c.environment].push(c)
    return groups
  }, [visibleClusters])

  if (isLoading) {
    return (
      <AppLayout>
        <PageTransition>
          <DashboardSkeleton />
        </PageTransition>
      </AppLayout>
    )
  }

  let cardIndex = 0

  return (
    <AppLayout>
      <PageTransition>
        <KpiStrip
          clusterCount={clusterList.length}
          totalNodes={totalNodes}
          runningPods={runningPods}
          totalPods={totalPods}
          warningEvents={warningEvents}
          healthCounts={healthCounts}
          isLoading={false}
        />

        <DashboardFilterChips
          activeEnv={envFilter}
          onEnvChange={changeEnvFilter}
          envCounts={envCounts}
          statusOptions={statusOptions}
          providerOptions={providerOptions}
          activeStatus={statusFilter}
          activeProvider={providerFilter}
          onStatusChange={setStatusFilter}
          onProviderChange={setProviderFilter}
        />

        <AnimatePresence mode="popLayout">
          {ENV_ORDER.map((env) => {
            const clusters = groupedByEnv[env]
            return (
              <EnvironmentGroup
                key={env}
                environment={env}
                clusterCount={clusters.length}
              >
                <div className="grid gap-2.5 px-1 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
                  {clusters.map((cluster) => (
                    <ClusterCard
                      key={cluster.id}
                      index={cardIndex++}
                      {...cluster}
                    />
                  ))}
                </div>
              </EnvironmentGroup>
            )
          })}
        </AnimatePresence>
      </PageTransition>
    </AppLayout>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<AppLayout><DashboardSkeleton /></AppLayout>}>
      <DashboardContent />
    </Suspense>
  )
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Verify build succeeds**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm build`
Expected: all pages compile

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): rebuild dashboard page with compact layout

Replace 1000-line monolith with ~120-line composition of KpiStrip,
DashboardFilterChips, EnvironmentGroup, and ClusterCard components.
Remove widget mode toggle, CompactStatsBar, verbose ClusterCard,
environment lane sidebars, and all dashboard-layout tRPC calls.
84% vertical space reduction (586px → 92px to first cluster card)."
```

---

## Task 7: Add Page Title to TopBar

**Files:**
- Modify: `apps/web/src/components/TopBar.tsx`

- [ ] **Step 1: Rewrite TopBar with pathname-based page title**

Replace the entire content of `apps/web/src/components/TopBar.tsx` with:

```tsx
'use client'

import { Search } from 'lucide-react'
import { NotificationsPanel } from './NotificationsPanel'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'
import { usePathname } from 'next/navigation'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/clusters': 'Clusters',
  '/alerts': 'Alerts',
  '/events': 'Events',
  '/logs': 'Logs',
  '/settings': 'Settings',
}

export function TopBar() {
  const pathname = usePathname()
  const pageTitle = PAGE_TITLES[pathname] ?? PAGE_TITLES[`/${pathname.split('/')[1]}`] ?? ''

  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-50 flex items-center justify-between px-3 sm:px-6 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/95 backdrop-blur-lg">
      {/* Left — Logo + Page Title */}
      <div className="flex items-center gap-2.5 group">
        <img src="/logo-mark.svg" alt="Voyager" className="h-8 w-8 object-contain" aria-hidden="true" />
        <span className="text-[13px] font-bold tracking-widest text-[var(--color-text-secondary)] transition-colors duration-200 group-hover:text-[var(--color-text-primary)]">
          VOYAGER
        </span>
        {pageTitle && (
          <>
            <span className="hidden sm:block text-[var(--color-border)] text-xs">/</span>
            <span className="hidden sm:block text-[13px] font-semibold text-[var(--color-text-primary)]">
              {pageTitle}
            </span>
          </>
        )}
      </div>

      {/* Right — Controls */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="hidden sm:flex items-center gap-2 px-2.5 h-8 rounded-lg border border-transparent text-[var(--color-text-muted)] transition-all duration-150 hover:border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-secondary)]"
          title="Command Palette (⌘K)"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" />
          <kbd className="text-[11px] font-medium font-mono text-[var(--color-text-dim)] border border-[var(--color-border)] bg-[var(--color-bg-primary)]/60 px-1.5 py-0.5 rounded transition-colors duration-150">
            ⌘K
          </kbd>
        </button>
        <ThemeToggle />
        <NotificationsPanel />
        <UserMenu />
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/TopBar.tsx
git commit -m "feat(web): show page title in TopBar breadcrumb

Display current page name (Dashboard, Clusters, etc.) in topbar
after VOYAGER logo with / separator. Derived from pathname."
```

---

## Task 8: Verify & QA

- [ ] **Step 1: Start dev servers**

```bash
cd /Users/viktork/Documents/private/GitHub-private/voyager-platform && pnpm dev
```

- [ ] **Step 2: Run typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 3: Run build**

```bash
pnpm build
```

- [ ] **Step 4: Visual QA — dark mode**

Open `http://localhost:3000` in browser. Verify:
- KPI strip shows counts with count-up animation
- Filter chips work (All/Prod/Staging/Dev)
- Environment groups show with thin headers
- Cluster cards are compact (~80px), show hover effects (lift, glow, spotlight)
- Status dots pulse for degraded/critical
- Groups collapse/expand on header click
- No console errors
- All clusters visible without scrolling

- [ ] **Step 5: Visual QA — light mode**

Switch to light theme. Verify same functionality with light theme CSS variables.

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(web): QA fixes for dashboard redesign"
```
