# Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate verified performance bottlenecks across the entire stack to make voyager-platform as fast as Lens and Rancher Desktop.

**Architecture:** 4 independent phases (A→D), each deployable separately. Phase A = quick wins touching single files. Phase B = bundle diet via lazy loading and dead dep removal. Phase C = core data-layer changes (virtual scrolling, O(1) store, DB caching). Phase D = backend/infra optimizations.

**Tech Stack:** Next.js 16, React 19, Zustand 5, Motion 12, TanStack Query, @tanstack/react-virtual (new), Fastify 5, tRPC 11, Drizzle ORM, PostgreSQL + TimescaleDB, Redis, Helm

**Spec:** `docs/superpowers/specs/2026-04-02-performance-optimization-design.md`

---

## Phase A — Quick Wins

### Task 1: LiveTimeAgo — Single Shared Interval (A1)

**Files:**
- Create: `apps/web/src/components/shared/TimeAgoProvider.tsx`
- Modify: `apps/web/src/components/shared/LiveTimeAgo.tsx`
- Modify: `apps/web/src/components/providers.tsx`

- [ ] **Step 1: Create TimeAgoProvider**

```tsx
// apps/web/src/components/shared/TimeAgoProvider.tsx
'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const TimeAgoCtx = createContext(0)

export function TimeAgoProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  return <TimeAgoCtx.Provider value={tick}>{children}</TimeAgoCtx.Provider>
}

export function useTimeAgoTick(): number {
  return useContext(TimeAgoCtx)
}
```

- [ ] **Step 2: Rewrite LiveTimeAgo to consume context**

Replace the full contents of `apps/web/src/components/shared/LiveTimeAgo.tsx`:

```tsx
'use client'

import { timeAgo } from '@/lib/time-utils'
import { useTimeAgoTick } from './TimeAgoProvider'

/**
 * Self-updating relative time label — re-renders every second via a shared
 * global interval (TimeAgoProvider) instead of per-instance setInterval.
 *
 * With 200+ instances, one interval + one batched React commit replaces
 * 200 independent microtasks/second.
 */
export function LiveTimeAgo({ date }: { date: string | Date | null | undefined }) {
  useTimeAgoTick() // subscribe to 1s global tick
  return <>{date ? timeAgo(date) : '—'}</>
}
```

- [ ] **Step 3: Mount TimeAgoProvider in providers.tsx**

In `apps/web/src/components/providers.tsx`, add the import and wrap children:

```tsx
// Add import at top:
import { TimeAgoProvider } from './shared/TimeAgoProvider'

// In the JSX, wrap inside TerminalProvider:
<TerminalProvider>
  <TimeAgoProvider>
    <AuthSessionSync />
    {children}
    {/* ...rest stays the same */}
  </TimeAgoProvider>
</TerminalProvider>
```

- [ ] **Step 4: Verify build and types**

Run: `pnpm typecheck && pnpm build`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shared/TimeAgoProvider.tsx apps/web/src/components/shared/LiveTimeAgo.tsx apps/web/src/components/providers.tsx
git commit -m "perf(A1): LiveTimeAgo shared interval — 200 timers → 1"
```

---

### Task 2: K8s Events Debounce at WatchManager (A3)

**Files:**
- Modify: `apps/api/src/routes/resource-stream.ts`

- [ ] **Step 1: Add 500ms debounce for `events` resource type**

In `apps/api/src/routes/resource-stream.ts`, in the watch event listener that writes SSE frames, add a debounce buffer specifically for the `events` resource type. Other types (pods, nodes, deployments) remain unbatched:

```tsx
// Module-level debounce buffer for K8s events
const eventDebounceBuffers = new Map<string, { timer: ReturnType<typeof setTimeout>; events: WatchEvent[] }>()
const EVENT_DEBOUNCE_MS = 500

// In the watch event handler, before writing to SSE:
if (event.resourceType === 'events') {
  const bufferKey = clusterId
  let buf = eventDebounceBuffers.get(bufferKey)
  if (!buf) {
    buf = { timer: null as any, events: [] }
    eventDebounceBuffers.set(bufferKey, buf)
  }
  buf.events.push(event)
  clearTimeout(buf.timer)
  buf.timer = setTimeout(() => {
    const batch = buf!.events
    buf!.events = []
    eventDebounceBuffers.delete(bufferKey)
    // Write batch as single SSE frame
    for (const evt of batch) {
      // ... existing SSE write logic
    }
  }, EVENT_DEBOUNCE_MS)
  return // skip immediate write
}
// ... existing immediate write for all other types
```

- [ ] **Step 2: Verify build**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/resource-stream.ts
git commit -m "perf(A3): 500ms debounce for K8s events SSE — reduces 10 frames/s to 2 during deployments"
```

---

### Task 3: AnimatedList Default layout=false (A5)

**Files:**
- Modify: `apps/web/src/components/animations/AnimatedList.tsx`

- [ ] **Step 1: Change default**

In `apps/web/src/components/animations/AnimatedList.tsx` line 23, change:

```tsx
// FROM:
  layout = true,
// TO:
  layout = false,
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/animations/AnimatedList.tsx
git commit -m "perf(A5): AnimatedList default layout=false — skip FLIP on SSE-driven lists"
```

---

### Task 4: Fix preconnect + RelationsTab + TooltipProvider (A4, A6, A9)

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/components/resource/RelationsTab.tsx`
- Modify: `apps/web/src/app/clusters/[id]/pods/page.tsx`

- [ ] **Step 1: Fix preconnect in layout.tsx**

In `apps/web/src/app/layout.tsx`, replace the preconnect block (lines 47-49):

```tsx
// FROM:
        {process.env.NEXT_PUBLIC_API_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_API_URL} />
        )}
// TO:
        {process.env.NEXT_PUBLIC_API_URL && (
          <>
            <link rel="preconnect" href={process.env.NEXT_PUBLIC_API_URL} crossOrigin="use-credentials" />
            <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_API_URL} />
          </>
        )}
```

- [ ] **Step 2: Fix RelationsTab refetchOnWindowFocus**

In `apps/web/src/components/resource/RelationsTab.tsx` line 142, change:

```tsx
// FROM:
    { staleTime: SYNC_INTERVAL_MS, refetchOnWindowFocus: true },
// TO:
    { staleTime: SYNC_INTERVAL_MS, refetchOnWindowFocus: false },
```

- [ ] **Step 3: Hoist TooltipProvider in pods page**

In `apps/web/src/app/clusters/[id]/pods/page.tsx`, find where `PodSummary` components render individual `<TooltipProvider>` wrappers and hoist one `<TooltipProvider>` to wrap the pods list at the page level. Remove the per-row `<TooltipProvider>` instances inside `PodSummary`.

The page-level wrapper goes around the main content area:

```tsx
import { TooltipProvider } from '@radix-ui/react-tooltip'

// Wrap the pods list container:
<TooltipProvider delayDuration={200}>
  {/* ...existing pods list content... */}
</TooltipProvider>
```

Remove each individual `<TooltipProvider>` inside `PodSummary` rows — keep the `<Tooltip>`, `<TooltipTrigger>`, and `<TooltipContent>` but not the per-row `<TooltipProvider>`.

- [ ] **Step 4: Verify build**

Run: `pnpm typecheck && pnpm build`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/components/resource/RelationsTab.tsx apps/web/src/app/clusters/[id]/pods/page.tsx
git commit -m "perf(A4,A6,A9): fix preconnect crossOrigin, hoist TooltipProvider, disable refetchOnWindowFocus"
```

---

### Task 5: AppLayout CSS Transition Instead of Motion marginLeft (A7)

**Files:**
- Modify: `apps/web/src/components/AppLayout.tsx`

- [ ] **Step 1: Replace motion.main with plain main**

In `apps/web/src/components/AppLayout.tsx`, replace lines 100-110:

```tsx
// FROM:
      {/* P3-001: spring animated main content offset */}
      <motion.main
        id="main"
        animate={{ marginLeft: isDesktop ? (collapsed ? 56 : 224) : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="pt-14 min-h-screen overflow-x-clip"
      >
        <div key={pathname} className="p-3 sm:p-5 w-full overflow-x-hidden bg-dot-grid min-h-full">
          {children}
        </div>
      </motion.main>

// TO:
      <main
        id="main"
        className="pt-14 min-h-screen overflow-x-clip transition-[margin-left] duration-200 ease-out"
        style={{ marginLeft: isDesktop ? (collapsed ? 56 : 224) : 0 }}
      >
        <div key={pathname} className="p-3 sm:p-5 w-full overflow-x-hidden bg-dot-grid min-h-full">
          {children}
        </div>
      </main>
```

- [ ] **Step 2: Remove motion import if no longer needed**

Check if `motion` is still imported elsewhere in this file. If this was the only usage, remove:
```tsx
import { motion } from 'motion/react'
```

- [ ] **Step 3: Verify build**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/AppLayout.tsx
git commit -m "perf(A7): replace Motion marginLeft spring with CSS transition — no layout thrashing"
```

---

### Task 6: ResourceStatusBadge CSS Glow Instead of Motion (A8)

**Files:**
- Modify: `apps/web/src/components/shared/ResourceStatusBadge.tsx`
- Possibly modify: `apps/web/src/app/globals.css` (if `animate-glow-fatal` doesn't exist)

- [ ] **Step 1: Check if animate-glow-fatal CSS class exists**

Run: `grep -r 'animate-glow-fatal\|glow-fatal' apps/web/src/app/globals.css`

If it doesn't exist, add it alongside the existing `animate-glow-critical` pattern in `globals.css`.

- [ ] **Step 2: Replace motion.span with CSS animation**

In `apps/web/src/components/shared/ResourceStatusBadge.tsx`, replace lines 58-70:

```tsx
// FROM:
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

// TO:
  // CSS-driven glow animation (no JS per-frame paint)
  if (isGlow && !shouldReduceMotion) {
    return (
      <span className={`inline-flex rounded-lg ${glowKey === 'critical' ? 'animate-glow-critical' : 'animate-glow-fatal'}`}>
        {badge}
      </span>
    )
  }
```

- [ ] **Step 3: Remove unused imports**

Remove `motion` and `resourceStatusGlow` imports if no longer used:
```tsx
// Remove from imports:
import { motion, useReducedMotion } from 'motion/react'
import { resourceStatusGlow } from '@/lib/animation-constants'

// Replace with:
import { useReducedMotion } from 'motion/react'
```

- [ ] **Step 4: Verify build**

Run: `pnpm typecheck && pnpm build`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shared/ResourceStatusBadge.tsx apps/web/src/app/globals.css
git commit -m "perf(A8): replace Motion boxShadow glow with CSS animation — no JS paint per frame"
```

---

## Phase B — Bundle Diet

### Task 7: Replace @iconify with Inline SVGs (B1, ~320KB saved)

**Files:**
- Create: `apps/web/src/components/icons/provider-icons.tsx`
- Modify: `apps/web/src/components/ProviderLogo.tsx`
- Modify: `apps/web/src/app/clusters/[id]/page.tsx` (remove dead import)
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Create inline SVG icon components**

Create `apps/web/src/components/icons/provider-icons.tsx` with SVG components for each provider. Source SVG paths from [simpleicons.org](https://simpleicons.org/). Each icon should be a simple function component accepting `width`, `height`, and `color` props:

```tsx
// apps/web/src/components/icons/provider-icons.tsx
interface IconProps {
  width?: number
  height?: number
  color?: string
}

export function KubernetesIcon({ width = 16, height = 16, color = '#326CE5' }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill={color} role="img">
      <path d="M10.204 14.35l.007.01-.999 2.413a5.171 5.171 0 0 1-2.075-2.597l2.578-.437.004.005a.44.44 0 0 1 .484.606zm-.833-2.129a.44.44 0 0 0 .173-.756l.002-.011L7.585 9.7a5.143 5.143 0 0 0-.73 3.255l2.514-.725.002-.009zm1.145-1.98a.44.44 0 0 0 .699-.337l.01-.005.15-2.62a5.144 5.144 0 0 0-3.01 1.442l2.147 1.523.004-.002zm2.369 1.882a.44.44 0 0 0 .166.759v.013l2.555.434a5.15 5.15 0 0 1-2.071 2.579l-.99-2.406.003-.003a.44.44 0 0 0 .337-.376zm.456-.753a.44.44 0 0 0-.176-.752l-.003-.012-1.96-1.754c.696-.44 1.5-.703 2.334-.765l.15 2.624.003.005a.44.44 0 0 0-.348.654zm-2.337-.696a.44.44 0 0 0-.762-.065h-.007l-1.963 1.752a5.13 5.13 0 0 1-.732-3.249l2.522.723-.002.005a.44.44 0 0 0 .253.694l-.003.015 1.001 2.409a5.17 5.17 0 0 1-2.089-2.6l-2.576.436v.005a.44.44 0 0 1-.042-.014l-.002.002L5.07 9.697l-.003-.002a.44.44 0 0 1 .013-.04 5.15 5.15 0 0 0-.277 1.667c0 .593.1 1.163.282 1.696l.003-.001a.44.44 0 0 1-.014.038l2.514.724h.005a.44.44 0 0 1 .166.758v.013l.99 2.407.003-.003a5.15 5.15 0 0 0 2.077 2.596l.999-2.413-.004-.006a.44.44 0 0 1 .484-.606l.003.005 2.58.438a5.17 5.17 0 0 0 .282-1.693c0-.593-.099-1.163-.28-1.695l-.003.001a.44.44 0 0 1 .017-.043L16.93 9.7l.002-.003a.44.44 0 0 1-.013.038 5.145 5.145 0 0 0-2.098-2.598l-.992 2.408.003.003a.44.44 0 0 1-.337.375v.016l-2.558-.435a5.14 5.14 0 0 1 2.078-2.582l-.15 2.622-.009.005a.44.44 0 0 1 .348.654l-.003.005 1.96 1.755a5.13 5.13 0 0 0 .735-3.256l-2.516.726-.002.01a.44.44 0 0 1-.172.755l-.003.011L12 3.006l-.002.004zM12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z" />
    </svg>
  )
}

export function AwsIcon({ width = 16, height = 16, color = '#FF9900' }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill={color} role="img">
      <path d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.374 6.18 6.18 0 0 1-.248-.47c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.44.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.415-.287-.806-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415a3.64 3.64 0 0 1 1.013-.143c.18 0 .367.008.559.032.2.024.383.056.558.096.168.048.327.096.479.151.151.056.263.112.335.168a.696.696 0 0 1 .24.2.44.44 0 0 1 .063.24v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.694 0 .224.08.416.24.567.159.152.454.304.878.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.742.167-1.142.167zM21.698 16.207c-2.626 1.94-6.442 2.969-9.722 2.969-4.598 0-8.74-1.7-11.87-4.526-.247-.223-.024-.527.27-.351 3.384 1.963 7.559 3.153 11.877 3.153 2.914 0 6.114-.607 9.06-1.852.439-.2.814.287.385.607zM22.792 14.961c-.336-.43-2.22-.207-3.074-.103-.255.032-.295-.192-.063-.36 1.5-1.053 3.967-.75 4.254-.399.287.36-.08 2.826-1.485 4.007-.215.184-.423.088-.327-.151.32-.79 1.03-2.57.695-2.994z" />
    </svg>
  )
}

// Continue for: GoogleCloudIcon, AzureIcon, K3sIcon, DockerIcon, DigitalOceanIcon, RancherIcon, FileCogIcon
// Source SVG paths from https://simpleicons.org/ for each icon name
// Each follows the same pattern: function component with IconProps
```

**Note to implementer:** Source the actual SVG `<path>` data from simpleicons.org for each of the ~10 icons. The pattern above is correct — replicate for all providers in the `PROVIDER_ICONS` map.

- [ ] **Step 2: Rewrite ProviderLogo to use inline SVGs**

Replace `@iconify/react` import in `apps/web/src/components/ProviderLogo.tsx` with the new components. Change `PROVIDER_ICONS` to reference the React components instead of icon string identifiers.

- [ ] **Step 3: Remove dead Icon import from clusters/[id]/page.tsx**

Remove the unused `import { Icon } from '@iconify/react'` from `apps/web/src/app/clusters/[id]/page.tsx` line 3.

- [ ] **Step 4: Remove @iconify packages from package.json**

In `apps/web/package.json`, remove:
```
"@iconify-json/simple-icons": "^1.2.75",
"@iconify/react": "^6.0.2",
```

- [ ] **Step 5: Remove @iconify/react from optimizePackageImports**

In `apps/web/next.config.ts` line 18, remove `'@iconify/react'` from the array:
```tsx
// FROM:
optimizePackageImports: ['lucide-react', 'recharts', '@iconify/react', '@xyflow/react'],
// TO:
optimizePackageImports: ['lucide-react', 'recharts', '@xyflow/react'],
```

- [ ] **Step 6: Run pnpm install and verify build**

Run: `pnpm install && pnpm typecheck && pnpm build`
Expected: 0 errors, no missing icon references

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/icons/ apps/web/src/components/ProviderLogo.tsx apps/web/src/app/clusters/[id]/page.tsx apps/web/package.json apps/web/next.config.ts pnpm-lock.yaml
git commit -m "perf(B1): replace @iconify with inline SVGs — ~320KB gzipped saved"
```

---

### Task 8: Lazy-Load React Flow + dagre (B2, ~220KB saved)

**Files:**
- Modify: `apps/web/src/app/clusters/[id]/page.tsx`
- Modify: `apps/web/src/app/clusters/[id]/network-policies/page.tsx`

- [ ] **Step 1: Wrap TopologyMap in next/dynamic**

In `apps/web/src/app/clusters/[id]/page.tsx`, replace the static import of `TopologyMap` with dynamic:

```tsx
// FROM:
import { TopologyMap } from '@/components/topology/TopologyMap'

// TO:
import dynamic from 'next/dynamic'
const TopologyMap = dynamic(
  () => import('@/components/topology/TopologyMap').then((m) => ({ default: m.TopologyMap })),
  { ssr: false, loading: () => <div className="h-[500px] animate-pulse rounded-xl bg-[var(--color-bg-card)]" /> },
)
```

- [ ] **Step 2: Wrap NetworkPolicyGraph in next/dynamic**

In `apps/web/src/app/clusters/[id]/network-policies/page.tsx`, replace the static import:

```tsx
// FROM:
import { NetworkPolicyGraph } from '@/components/network/NetworkPolicyGraph'

// TO:
import dynamic from 'next/dynamic'
const NetworkPolicyGraph = dynamic(
  () => import('@/components/network/NetworkPolicyGraph').then((m) => ({ default: m.NetworkPolicyGraph })),
  { ssr: false, loading: () => <div className="h-[600px] animate-pulse rounded-xl bg-[var(--color-bg-card)]" /> },
)
```

- [ ] **Step 3: Verify build**

Run: `pnpm typecheck && pnpm build`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/clusters/[id]/page.tsx apps/web/src/app/clusters/[id]/network-policies/page.tsx
git commit -m "perf(B2): lazy-load React Flow + dagre — ~220KB gzipped deferred to route chunk"
```

---

### Task 9: Remove Dead Dependencies + Lazy-Load Terminal (B3, B4, B5)

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/components/providers.tsx`

- [ ] **Step 1: Remove react-grid-layout from package.json**

In `apps/web/package.json`, remove:
```
"react-grid-layout": "^2.2.3",
```

- [ ] **Step 2: Move @voyager/api to devDependencies**

In `apps/web/package.json`, move `"@voyager/api": "workspace:*"` from `dependencies` to `devDependencies`.

- [ ] **Step 3: Lazy-load TerminalDrawer**

In `apps/web/src/components/providers.tsx`, replace:

```tsx
// FROM:
import { TerminalDrawer } from './terminal/TerminalDrawer'

// TO (add alongside existing dynamic import):
const TerminalDrawer = dynamic(
  () => import('./terminal/TerminalDrawer').then((m) => ({ default: m.TerminalDrawer })),
  { ssr: false },
)
```

Remove the static import line. The `dynamic` import from `next/dynamic` is already imported at line 11.

- [ ] **Step 4: Run pnpm install and verify build**

Run: `pnpm install && pnpm typecheck && pnpm build`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/components/providers.tsx
git commit -m "perf(B3,B4,B5): remove phantom deps, lazy-load TerminalDrawer — ~37KB saved"
```

---

### Task 10: Lazy-Load YAML/Diff Components (B6, ~14KB saved)

**Files:**
- Modify: Files that statically import `YamlViewer` or `ResourceDiff` and render them in tab panels

- [ ] **Step 1: Identify all static import sites**

Run: `grep -rn "import.*YamlViewer\|import.*ResourceDiff" apps/web/src/ --include="*.tsx" | grep -v "next/dynamic\|dynamic("`

For each file that statically imports these components and renders them inside tab content (not top-level pages), wrap the import in `next/dynamic`:

```tsx
const YamlViewer = dynamic(
  () => import('@/components/resource/YamlViewer').then((m) => ({ default: m.YamlViewer })),
  { ssr: false },
)
const ResourceDiff = dynamic(
  () => import('@/components/resource/ResourceDiff').then((m) => ({ default: m.ResourceDiff })),
  { ssr: false },
)
```

- [ ] **Step 2: Verify build**

Run: `pnpm typecheck && pnpm build`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/
git commit -m "perf(B6): lazy-load YamlViewer + ResourceDiff — yaml package deferred to tab click"
```

---

## Phase C — Core Performance

### Task 11: Normalize Resource Store to O(1) Mutations + Remove incrementTick (C2 + A2)

**Files:**
- Modify: `apps/web/src/stores/resource-store.ts`
- Modify: `apps/web/src/hooks/useResources.ts`
- Modify: `apps/web/src/hooks/useResourceSSE.ts`

**Note:** A2 (remove incrementTick from SSE flush) is combined with C2 because the tick removal is only safe after the Map-of-Maps rewrite guarantees new references on every mutation. Doing A2 before C2 risks breaking re-renders for subscribers to unaffected resource types.

- [ ] **Step 1: Rewrite resource-store.ts with Map-of-Maps**

Replace the entire store implementation in `apps/web/src/stores/resource-store.ts`:

```tsx
import { create } from 'zustand'
import type { ResourceType, WatchEvent } from '@voyager/types'

export type ConnectionState = 'initializing' | 'connected' | 'reconnecting' | 'disconnected'

/** Resource key for O(1) lookup: "namespace/name" or just "name" for cluster-scoped */
function resourceKey(obj: { name: string; namespace?: string | null }): string {
  return obj.namespace ? `${obj.namespace}/${obj.name}` : obj.name
}

interface ResourceStoreState {
  /** Keyed by `${clusterId}:${resourceType}` → inner Map keyed by resourceKey */
  resources: Map<string, Map<string, unknown>>
  connectionState: Record<string, ConnectionState>
  snapshotsReady: Set<string>
  tick: number

  setResources: (clusterId: string, type: ResourceType, items: unknown[]) => void
  applyEvent: (clusterId: string, event: WatchEvent) => void
  applyEvents: (clusterId: string, events: WatchEvent[]) => void
  setConnectionState: (clusterId: string, state: ConnectionState) => void
  clearCluster: (clusterId: string) => void
  incrementTick: () => void
}

export const useResourceStore = create<ResourceStoreState>()((set) => ({
  resources: new Map(),
  connectionState: {},
  snapshotsReady: new Set(),
  tick: 0,

  setResources: (clusterId, type, items) =>
    set((state) => {
      const key = `${clusterId}:${type}`
      const innerMap = new Map<string, unknown>()
      for (const item of items) {
        const obj = item as { name: string; namespace?: string | null }
        innerMap.set(resourceKey(obj), item)
      }
      const next = new Map(state.resources)
      next.set(key, innerMap)
      if (!state.snapshotsReady.has(clusterId)) {
        const ready = new Set(state.snapshotsReady)
        ready.add(clusterId)
        return { resources: next, snapshotsReady: ready }
      }
      return { resources: next }
    }),

  applyEvent: (clusterId, event) =>
    set((state) => {
      const key = `${clusterId}:${event.resourceType}`
      const current = state.resources.get(key)
      if (!current) return state

      const obj = event.object as { name: string; namespace?: string | null }
      const rk = resourceKey(obj)
      const updated = new Map(current)

      switch (event.type) {
        case 'ADDED':
        case 'MODIFIED':
          updated.set(rk, event.object)
          break
        case 'DELETED':
          updated.delete(rk)
          break
      }

      const next = new Map(state.resources)
      next.set(key, updated)
      return { resources: next }
    }),

  applyEvents: (clusterId, events) =>
    set((state) => {
      const next = new Map(state.resources)

      for (const event of events) {
        const key = `${clusterId}:${event.resourceType}`
        // Get or clone the inner map for this resource type
        let inner = next.get(key)
        if (!inner) continue
        // Clone inner map only once per resource type per batch
        if (inner === state.resources.get(key)) {
          inner = new Map(inner)
          next.set(key, inner)
        }

        const obj = event.object as { name: string; namespace?: string | null }
        const rk = resourceKey(obj)

        switch (event.type) {
          case 'ADDED':
          case 'MODIFIED':
            inner.set(rk, event.object)
            break
          case 'DELETED':
            inner.delete(rk)
            break
        }
      }

      return { resources: next }
    }),

  setConnectionState: (clusterId, connState) =>
    set((state) => ({
      connectionState: { ...state.connectionState, [clusterId]: connState },
    })),

  incrementTick: () => set((state) => ({ tick: state.tick + 1 })),

  clearCluster: (clusterId) =>
    set((state) => {
      const next = new Map(state.resources)
      const prefix = `${clusterId}:`
      for (const key of state.resources.keys()) {
        if (key.startsWith(prefix)) {
          next.delete(key)
        }
      }
      const ready = new Set(state.snapshotsReady)
      ready.delete(clusterId)
      return {
        resources: next,
        snapshotsReady: ready,
        connectionState: { ...state.connectionState, [clusterId]: 'disconnected' as const },
      }
    }),
}))
```

- [ ] **Step 2: Update useClusterResources selector with shallow equality**

In `apps/web/src/hooks/useResources.ts`, update the hook to use `useShallow` from Zustand to prevent over-rendering (plain `[...inner.values()]` creates a new array on every call, defeating Zustand's `Object.is()` equality):

```tsx
import { useCallback, useEffect, useRef } from 'react'
import type { ResourceType } from '@voyager/types'
import { useResourceStore, type ConnectionState } from '@/stores/resource-store'

export type { ConnectionState }

const EMPTY: unknown[] = []

/**
 * Read resources for a specific cluster + type from the Zustand store.
 * Returns a stable array reference — only creates a new array when the
 * inner Map contents actually change (tracked via Map size + reference).
 */
export function useClusterResources<T>(clusterId: string, type: ResourceType): T[] {
  // Subscribe to global tick for time label refresh (5s via useResourceTick)
  useResourceStore((s) => s.tick)

  // Cache the previous array to avoid unnecessary re-renders
  const prevRef = useRef<{ map: Map<string, unknown> | undefined; arr: unknown[] }>({
    map: undefined,
    arr: EMPTY,
  })

  return useResourceStore(
    useCallback(
      (s) => {
        const inner = s.resources.get(`${clusterId}:${type}`)
        if (!inner || inner.size === 0) return EMPTY as T[]
        // Only rebuild array if the inner Map reference changed
        if (inner === prevRef.current.map) return prevRef.current.arr as T[]
        const arr = [...inner.values()] as T[]
        prevRef.current = { map: inner, arr }
        return arr
      },
      [clusterId, type],
    ),
  )
}
```

This ensures `[...inner.values()]` only runs when the inner Map reference actually changes (which happens on each batch that touches this resource type).

- [ ] **Step 3: Remove incrementTick from SSE flush (A2)**

In `apps/web/src/hooks/useResourceSSE.ts`, in the `flushBuffer()` function, remove lines 104-106:

```tsx
// REMOVE these lines:
      // Increment tick to guarantee consumer re-renders — Zustand Map-based
      // selectors don't always trigger re-renders on their own.
      store.incrementTick()
```

This is now safe because: (a) the new store creates new inner Map references on every mutation, (b) the selector uses reference comparison to detect changes, (c) the 5-second `useResourceTick` still handles time label refresh.

- [ ] **Step 4: Run existing tests**

Run: `pnpm test`
Expected: All resource-store tests pass

- [ ] **Step 4: Verify build**

Run: `pnpm typecheck && pnpm build`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/stores/resource-store.ts apps/web/src/hooks/useResources.ts apps/web/src/hooks/useResourceSSE.ts
git commit -m "perf(C2+A2): normalize resource store to Map-of-Maps + remove redundant incrementTick"
```

---

### Task 12: Install @tanstack/react-virtual (C1 prep)

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install the dependency**

Run: `pnpm --filter @voyager/web add @tanstack/react-virtual`

- [ ] **Step 2: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore: add @tanstack/react-virtual for list virtualization"
```

---

### Task 13: Virtual Scrolling — LogViewer (C1, easiest target)

**Files:**
- Modify: `apps/web/src/components/logs/LogViewer.tsx`

- [ ] **Step 1: Add virtualization to LogViewer**

The LogViewer has a `scrollRef` and renders `lines.map()` — replace with `useVirtualizer`. Read the current `LogViewer.tsx` to understand the exact structure, then:

1. Import `useVirtualizer` from `@tanstack/react-virtual`
2. Create the virtualizer with `count: lines.length` and `estimateSize: () => 20` (log lines are ~20px)
3. Replace the `lines.map((line, i) => <LogLine ...>)` with the virtualizer pattern:

```tsx
const virtualizer = useVirtualizer({
  count: filteredLines.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 20,
  overscan: 50,
})

// In JSX:
<div ref={scrollRef} className="..." style={{ overflow: 'auto' }}>
  <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
    {virtualizer.getVirtualItems().map((virtualRow) => {
      const line = filteredLines[virtualRow.index]
      return (
        <div
          key={virtualRow.key}
          style={{
            position: 'absolute',
            top: virtualRow.start,
            left: 0,
            right: 0,
            height: virtualRow.size,
          }}
        >
          <LogLine ... />
        </div>
      )
    })}
  </div>
</div>
```

- [ ] **Step 2: Verify scroll behavior**

Run the app locally, open a log stream, and verify:
- Smooth scrolling through many lines
- Auto-scroll to bottom still works
- Search highlighting still works

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/logs/LogViewer.tsx
git commit -m "perf(C1): virtualize LogViewer — 10K lines render only visible rows"
```

---

### Task 14: Cache metrics.currentStats (C3)

**Files:**
- Modify: `apps/api/src/routers/metrics.ts`

- [ ] **Step 1: Wrap currentStats computation in cached()**

Find the `currentStats` procedure in `apps/api/src/routers/metrics.ts`. Wrap the entire async body in the existing `cached()` utility:

```tsx
// Import cached if not already imported:
import { cached } from '../lib/cache.js'

// Inside the procedure:
const result = await cached('metrics:currentStats', 15, async () => {
  // ... existing currentStats logic (all the Promise.allSettled per-cluster K8s calls)
  return statsResult
})
return result
```

The `15` is seconds TTL — matches `JOB_INTERVALS.METRICS_STREAM_POLL_MS / 1000`. The `cached()` function handles singleflight deduplication automatically.

- [ ] **Step 2: Verify build**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routers/metrics.ts
git commit -m "perf(C3): cache metrics.currentStats — dashboard loads in <500ms instead of 1-3s"
```

---

### Task 15: Port resourceUsage to time_bucket() (C4)

**Files:**
- Modify: `apps/api/src/routers/metrics.ts`

- [ ] **Step 1: Replace JS bucketing with SQL aggregation**

Find the `resourceUsage` procedure in `apps/api/src/routers/metrics.ts`. Read the existing implementation to understand the bucketing logic. Then replace `db.select().from(metricsHistory)` + JS loop with a `time_bucket()` SQL query matching the pattern used by `metrics.history` elsewhere in the same file.

The SQL should look like:

```sql
SELECT
  time_bucket('${bucketSize} seconds'::interval, timestamp) AS bucket,
  round(avg(cpu_percent)::numeric, 1)::real AS cpu,
  round(avg(mem_percent)::numeric, 1)::real AS memory
FROM metrics_history
WHERE timestamp >= ${startTime}
GROUP BY bucket
ORDER BY bucket
```

Use `db.execute(sql`...`)` from Drizzle's `drizzle-orm/sql` module, matching the pattern of other raw SQL queries in the file.

- [ ] **Step 2: Compare output with old implementation**

Before removing the old JS bucketing, log both outputs for the same time range and verify they match within rounding tolerance.

- [ ] **Step 3: Verify build**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routers/metrics.ts
git commit -m "perf(C4): port resourceUsage to time_bucket() — DB aggregation replaces 50K-row JS bucketing"
```

---

### Task 15b: Replace computeAge() with createdAt in SSE Payload (C5)

**Files:**
- Modify: `apps/api/src/lib/resource-mappers.ts` (15 mappers)
- Modify: ~9 frontend pages in `apps/web/src/app/clusters/[id]/`
- Modify: Types in `packages/types/` if `age` is in a shared type

**Important:** This is a coordinated cross-layer change. Only 6 of 15 mappers already have `createdAt`. The other 9 need it added.

- [ ] **Step 1: Grep for all `resource.age` render sites**

Run: `grep -rn '\.age\b' apps/web/src/app/clusters/ --include="*.tsx" | grep -v 'page\.' | head -30`
And: `grep -rn 'resource\.age\|\.age}' apps/web/src/app/clusters/ --include="*.tsx"`

Build the complete list of frontend files that render `.age`.

- [ ] **Step 2: Add createdAt to the 9 mappers that lack it**

In `apps/api/src/lib/resource-mappers.ts`, for each of these mappers: `mapDeployment`, `mapConfigMap`, `mapSecret`, `mapPVC`, `mapStatefulSet`, `mapDaemonSet`, `mapJob`, `mapCronJob`, `mapHPA` — add:

```tsx
createdAt: metadata?.creationTimestamp ?? null,
```

to the return object, right next to the existing `age` field.

- [ ] **Step 3: Remove age from ALL 15 mappers**

Remove `age: computeAge(...)` from every mapper's return object. Also remove the `computeAge` import/function if it becomes unused.

- [ ] **Step 4: Update frontend pages — replace {resource.age} with <LiveTimeAgo>**

For each page found in Step 1, replace `{resource.age}` with `<LiveTimeAgo date={resource.createdAt} />`. Add the import if not already present.

- [ ] **Step 5: Update TypeScript types**

Grep for any shared type that defines `age: string` and update to `createdAt: string | null`. Run: `grep -rn 'age.*string' packages/types/src/ --include="*.ts"`

- [ ] **Step 6: Verify build and types**

Run: `pnpm typecheck && pnpm build`
Expected: 0 errors, no `undefined` renders

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/resource-mappers.ts apps/web/src/app/clusters/ packages/types/
git commit -m "perf(C5): replace stale age string with createdAt + LiveTimeAgo — live-updating age labels"
```

---

## Phase D — Backend & Infrastructure

### Task 16: Nginx SSE Proxy Timeout (D1)

**Files:**
- Modify: `charts/voyager/values.yaml`
- Modify: `charts/voyager/templates/ingress.yaml`

- [ ] **Step 1: Add SSE timeout annotations to values.yaml**

In `charts/voyager/values.yaml`, add to the ingress section:

```yaml
ingress:
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
```

- [ ] **Step 2: Ensure ingress template renders annotations from values**

Read the ingress template to verify it renders `{{ .Values.ingress.annotations }}`. If not, add the annotation rendering block.

- [ ] **Step 3: Verify Helm template renders correctly**

Run: `helm template voyager charts/voyager/ -f charts/voyager/values.yaml | grep proxy-read-timeout`
Expected: Output includes `proxy-read-timeout: "3600"`

- [ ] **Step 4: Commit**

```bash
git add charts/voyager/
git commit -m "perf(D1): add nginx SSE proxy timeout 3600s — prevents 60s forced reconnects"
```

---

### Task 16b: PodDetail Tabs Memoization (D2)

**Files:**
- Modify: `apps/web/src/app/clusters/[id]/pods/page.tsx`

- [ ] **Step 1: Wrap tabs array in useMemo**

In the `PodDetail` component, wrap the `tabs` array construction in `useMemo`:

```tsx
const tabs = useMemo(() => [
  { id: 'containers', label: 'Containers', content: <ContainersTab pod={pod} /> },
  { id: 'yaml', label: 'YAML', content: <YamlViewer ... /> },
  // ... rest of tabs
], [pod, clusterId])
```

This prevents rebuilding the full tabs array (including all JSX for YAML, Diff, Relations tabs) on every re-render from the 5s tick or SSE events.

- [ ] **Step 2: Verify tabs still work**

Run: `pnpm typecheck`
Expected: 0 errors. Manually verify pod detail tabs render correctly.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/clusters/[id]/pods/page.tsx
git commit -m "perf(D2): memoize PodDetail tabs array — skip rebuilding YAML/Diff JSX on every tick"
```

---

### Task 17: Alert Evaluator N+1 Fix (D3)

**Files:**
- Modify: `apps/api/src/jobs/alert-evaluator.ts`

- [ ] **Step 1: Hoist queries outside per-alert loop**

In `apps/api/src/jobs/alert-evaluator.ts`, fetch all active clusters once and batch the dedup check using `inArray()`:

```tsx
// Fetch once before the loop
const activeClusters = await db.select({ id: clusters.id }).from(clusters).where(eq(clusters.isActive, true))
const cutoff = new Date(Date.now() - JOB_INTERVALS.ALERT_DEDUP_WINDOW_MS)
const recentAlertIds = new Set(
  (await db.select({ alertId: alertHistory.alertId })
    .from(alertHistory)
    .where(and(
      inArray(alertHistory.alertId, allAlerts.map(a => a.id)),
      gte(alertHistory.triggeredAt, cutoff)
    ))).map(r => r.alertId)
)

for (const alert of allAlerts) {
  if (recentAlertIds.has(alert.id)) continue
  const clusterIds = alert.clusterFilter ? [alert.clusterFilter] : activeClusters.map(c => c.id)
  // ... rest
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/jobs/alert-evaluator.ts
git commit -m "perf(D3): batch alert evaluator queries — N dedup + N cluster queries → 2 total"
```

---

### Task 17b: SSE Pipeline Fixes (D5, D7)

**Files:**
- Modify: `apps/api/src/routes/resource-stream.ts`

- [ ] **Step 1: Add event loop yield between snapshots (D5)**

In the loop that sends snapshot events per resource type:

```tsx
for (const def of RESOURCE_DEFS) {
  await new Promise(resolve => setImmediate(resolve)) // yield event loop
  // ... existing snapshot logic
}
```

- [ ] **Step 2: Clean up replay buffer on disconnect (D7)**

Add cleanup when a cluster disconnects:

```tsx
// Listen for cluster teardown to clean up replay buffers
voyagerEmitter.on('watch-teardown', (clusterId: string) => {
  clusterReplayBuffers.delete(clusterId)
  clusterEventCounters.delete(clusterId)
})
```

- [ ] **Step 3: Verify build**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/resource-stream.ts
git commit -m "perf(D5,D7): event loop yield between snapshots + replay buffer cleanup on disconnect"
```

---

### Task 17c: Backend One-Liners (D9, D10)

**Files:**
- Modify: `apps/api/src/jobs/metrics-stream-job.ts`
- Modify: `apps/api/src/lib/authorization.ts`

- [ ] **Step 1: Use WatchManager pod cache in metrics job (D9)**

In `apps/api/src/jobs/metrics-stream-job.ts`, replace `coreApi.listPodForAllNamespaces()` with `watchManager.getResources(clusterId, 'pods')?.length ?? 0`.

- [ ] **Step 2: Parallelize auth queries (D10)**

In `apps/api/src/lib/authorization.ts`, in the `check()` method:

```tsx
const [userRole, teamIds] = await Promise.all([
  this.repo.getUserRole(subject.id),
  this.repo.getUserTeamIds(subject.id),
])
```

- [ ] **Step 3: Verify build**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/jobs/metrics-stream-job.ts apps/api/src/lib/authorization.ts
git commit -m "perf(D9,D10): use WatchManager pod cache + parallelize auth queries"
```

---

### Task 17d: HTTP Cache Headers on Read-Only tRPC (D11)

**Files:**
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Add onSend hook for tRPC GET requests**

In `apps/api/src/server.ts`, after the tRPC plugin registration, add an `onSend` hook:

```tsx
app.addHook('onSend', (request, reply, _payload, done) => {
  // Only cache GET tRPC requests (queries, not mutations)
  if (request.method === 'GET' && request.url.startsWith('/trpc/')) {
    reply.header('cache-control', 'private, max-age=10, stale-while-revalidate=30')
    reply.header('vary', 'Cookie')
  }
  done()
})
```

- [ ] **Step 2: Verify build**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "perf(D11): add Cache-Control headers to read-only tRPC GET responses"
```

---

### Task 18: Metrics Router JOIN Optimization (D4)

**Files:**
- Modify: `apps/api/src/routers/metrics.ts`

- [ ] **Step 1: Replace two-query pattern with JOINs**

In `apps/api/src/routers/metrics.ts`:

For `uptimeHistory`: replace the sequential cluster name lookup with an inner join between `healthHistory` and `clusters`.

For `aggregatedMetrics`: replace the sequential cluster name lookup with an inner join between `metricsHistory` and `clusters`.

Follow the Drizzle ORM JOIN pattern used elsewhere in the codebase.

- [ ] **Step 2: Verify build**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routers/metrics.ts
git commit -m "perf(D4): metrics JOINs — eliminate serial cluster name lookups"
```

---

### Task 19: Log Stream Backpressure + Watch-DB-Writer Narrow SELECT (D6, D8)

**Files:**
- Modify: `apps/api/src/routes/log-stream.ts`
- Modify: `apps/api/src/lib/watch-db-writer.ts`

- [ ] **Step 1: Add backpressure to log stream (D6)**

In `apps/api/src/routes/log-stream.ts`, in the log stream data handler, add drain/pause pattern:

```tsx
logStream.on('data', (chunk) => {
  const canWrite = reply.raw.write(/* existing frame format */)
  if (!canWrite) {
    logStream.pause()
    reply.raw.once('drain', () => logStream.resume())
  }
})
```

- [ ] **Step 2: Narrow SELECT in watch-db-writer (D8)**

In `apps/api/src/lib/watch-db-writer.ts`, change the `syncClusterHealth` query to fetch only `status` and `provider`. Fetch `connectionConfig` only when provider detection is needed (when `provider === 'kubeconfig'`).

- [ ] **Step 3: Verify build**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/log-stream.ts apps/api/src/lib/watch-db-writer.ts
git commit -m "perf(D6,D8): log stream backpressure + narrow SELECT in watch-db-writer"
```

---

## Final Verification

### Task 20: Full Build + Type Check + Test Suite

- [ ] **Step 1: Run complete verification**

```bash
pnpm typecheck && pnpm build && pnpm test
```

Expected: All pass with 0 errors.

- [ ] **Step 2: Start dev servers and smoke test**

```bash
pnpm dev
```

Verify:
1. Login page works
2. Dashboard loads quickly (should be <500ms with C3 cache)
3. Navigate to a cluster detail page
4. Open pods tab — verify all pods render
5. SSE connection establishes (check ConnectionStatusBadge)
6. Time labels ("3s ago") still update every second
7. Expand a pod card — verify tabs work
8. Check browser console for errors
