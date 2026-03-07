# Part 2: Tech Stack Analysis — Voyager Platform

> **Date:** 2026-03-07 | **Analyst:** Frontend Architecture Audit
> **Codebase:** 87 components · 27 pages · 7 stores · React 19.2 + Next.js 16.1

---

## Installed Libraries (UI/Animation/Data)

| Library | Version | Actually Used? | Files | Unused Potential |
|---------|---------|----------------|-------|------------------|
| **motion** | ^12.34.0 | ✅ Heavy (19 files) | Animations, transitions, presence | ~60% of API unused (scroll, springs, drag, reorder, layout groups, gesture hooks) |
| **recharts** | ^3.7.0 | ✅ Heavy (9 files) | Area, Bar, Line charts, Sparklines | Custom tooltips, Brush zoom, Reference lines, animated gradients |
| **cmdk** | ^1.1.1 | ✅ Active (1 file) | CommandPalette.tsx | Fully utilized — well-built with recent items, resource search, AI integration |
| **sonner** | ^2.0.7 | ✅ Active (5+ files) | Toast notifications via `toast()` | Rich toasts (promise, loading, custom JSX), action buttons |
| **react-grid-layout** | ^2.2.2 | ✅ Active (dashboard) | DashboardGrid.tsx (lazy-loaded) | Drag constraints, resize handles, breakpoint-specific layouts |
| **zustand** | ^5.0.11 | ✅ Heavy (7 stores) | Auth, notifications, dashboard, metrics, presence, cluster, AI | `subscribeWithSelector`, `devtools`, computed selectors |
| **@tanstack/react-query** | ^5.90.21 | ✅ Heavy (35+ files) | Data fetching everywhere via tRPC | `useSuspenseQuery`, prefetching, optimistic updates, infinite scroll |
| **@tanstack/react-form** | ^1.28.2 | ✅ Light (3 files) | Teams, Login, Users pages | Async validation, field arrays, form-level validation |
| **@tanstack/react-table** | ^8.21.3 | ✅ Active (DataTable) | Full-featured reusable DataTable | Column pinning, virtual rows, row selection, grouping |
| **radix-ui** | ^1.4.3 | ✅ Light (4 primitives) | Tooltip, Tabs, Progress, Collapsible | Vast library of primitives unused (Accordion, Dropdown, Popover, Select, ContextMenu, etc.) |
| **lucide-react** | ^0.564.0 | ✅ Heavy (30+ files) | Icons everywhere | Good — well-utilized |
| **@iconify/react** | ^6.0.2 | ⚠️ Minimal (1 file) | ProviderLogo.tsx only | Could replace Lucide OR use alongside for brand/provider icons |
| **next-themes** | ^0.4.6 | ✅ Active | Theme provider + toggle | System preference, custom themes |
| **@sentry/nextjs** | ^10.38.0 | ✅ Active (2 files) | ErrorBoundary + global-error | Replay, Tracing, Performance, User Feedback — all unused |
| **better-auth** | ^1.4.18 | ✅ Active | Auth client, session hooks, sign-in | Social providers, 2FA, org/team scoping |
| **class-variance-authority** | ^0.7.1 | ✅ Active | Component variants | Well-utilized |
| **tailwind-merge** | ^3.4.0 | ✅ Active | `cn()` utility | Well-utilized |
| **zod** | ^4.3.6 | ✅ Active | Schema validation | Well-utilized |

---

## Motion (v12) — Unused Capabilities

**Currently using:** `motion.div`, `AnimatePresence`, `animate()`, `useMotionValue`, `layout`, basic variants (fade, slide, scale)

### 🔴 Not Used At All — HIGH Impact

| Feature | What It Does | Perfect For |
|---------|-------------|-------------|
| **`useScroll`** | Scroll-linked animations with progress tracking | Dashboard header shrink, parallax stat cards, scroll-progress indicator |
| **`useSpring`** | Physics-based spring values | Smoother number counters, gauge needles, drag snapping |
| **`useInView`** | Trigger animations when elements enter viewport | Lazy-animate chart sections, stagger widget cards on scroll |
| **`useTransform`** | Map one value range to another | Scroll → opacity, mouse position → card tilt, progress → color |
| **`Reorder`** | Drag-to-reorder lists | Widget reorder in dashboard edit mode (replaces react-grid-layout for simple cases) |
| **`whileHover` / `whileTap`** | Gesture-driven animations | Interactive stat cards, button micro-interactions |
| **`layoutId`** | Shared layout animations between components | Seamless page transitions, tab content morphing, card → detail expansion |
| **`LayoutGroup`** | Coordinate layout animations across siblings | Dashboard widget add/remove flow |
| **`MotionConfig`** | Global animation defaults | Reduce motion globally, set default transition for entire app |
| **`LazyMotion`** | Tree-shakeable animation features | Reduce bundle by ~50% loading only `domAnimation` subset |
| **Scroll-triggered variants** | `whileInView` on `motion.div` | Animate dashboard sections as user scrolls down |
| **SVG animation** | Animate SVG paths, morphing | Animated logo, loading states, chart line draw-in effect |
| **`useVelocity`** | Track velocity of motion values | Momentum-based scroll, fling gestures |

### 🟡 Partially Used

| Feature | Current | Could Do |
|---------|---------|----------|
| **`animate()`** | StatCards number counter | Could power all numeric transitions — alert counts, progress bars, sparkline highlight values |
| **`layout`** | AnimatedList only | Should be on FilterBar chips, sidebar collapse, notification panel expand |
| **Variants** | Basic fade/slide | Missing: staggerChildren on dashboard grid, orchestrated multi-element sequences |

---

## Quick Wins — Use What We Already Have (Zero New Dependencies)

### 1. 🎯 Scroll-Progress Indicator (Top Bar)
```tsx
// components/ScrollProgress.tsx
'use client'
import { motion, useScroll, useSpring } from 'motion/react'

export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 })
  
  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-0.5 bg-[var(--color-accent)] origin-left z-[200]"
      style={{ scaleX }}
    />
  )
}
```

### 2. 🎯 Interactive Stat Cards with Hover + Tap
```tsx
// Replace static div with motion.div in StatCard
<motion.div
  className={cn(cardClasses)}
  whileHover={{ scale: 1.02, y: -2 }}
  whileTap={{ scale: 0.98 }}
  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
>
  {/* existing card content */}
</motion.div>
```

### 3. 🎯 Dashboard Widgets Stagger on Load
```tsx
// DashboardGrid.tsx — wrap each widget
<motion.div
  key={widget.id}
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: index * 0.05, duration: 0.3 }}
>
  <WidgetWrapper widget={widget} />
</motion.div>
```

### 4. 🎯 Shared Layout Animation for Tab Content
```tsx
// Use layoutId for active tab indicator
<motion.div
  layoutId="active-tab"
  className="absolute bottom-0 h-0.5 bg-[var(--color-accent)]"
  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
/>
```

### 5. 🎯 Chart Draw-In Effect (useInView)
```tsx
// Wrap chart containers — animate only when scrolled into view
import { motion, useInView } from 'motion/react'
import { useRef } from 'react'

function ChartReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  )
}
```

---

## Libraries to ADD

| Library | Purpose | Key Feature | Install | Priority |
|---------|---------|-------------|---------|----------|
| **`@number-flow/react`** | Animated number transitions | Smooth digit-by-digit counting for stat cards, counters — open-source alternative to Motion+ AnimateNumber | `pnpm add @number-flow/react` | 🔴 High |
| **`vaul`** | Mobile-friendly drawer/sheet | Bottom drawer that replaces Sheet for better mobile UX, smooth spring physics | `pnpm add vaul` | 🟡 Medium |
| **`react-resizable-panels`** | Resizable pane layouts | Draggable split panels for logs vs. detail view, AI chat sidebar | `pnpm add react-resizable-panels` | 🟡 Medium |
| **`@dnd-kit/core`** | Advanced drag-and-drop | Multi-container DnD for dashboard widget management (if react-grid-layout becomes limiting) | `pnpm add @dnd-kit/core @dnd-kit/sortable` | 🟢 Low |
| **`mini-svg-data-uri`** | Optimized SVG backgrounds | Encode SVG patterns for glassmorphism/grid backgrounds at tiny size | `pnpm add mini-svg-data-uri` | 🟢 Low |

### Libraries NOT to Add (Already Covered)
- ❌ **Framer Motion** → We have `motion` v12 (same team, modern package name)
- ❌ **shadcn/ui full install** → We cherry-pick Radix primitives + build custom UI (better for our design system)
- ❌ **Chart.js / D3** → Recharts 3 covers all our charting needs
- ❌ **React Spring** → Motion v12 is strictly better for our use case
- ❌ **Tailwind Animate plugin** → Tailwind 4 has native animation utilities + our custom @keyframes

---

## 2026 Animation Patterns (Using Our Stack)

### Pattern 1: Scroll-Linked Dashboard Header Shrink
```tsx
'use client'
import { motion, useScroll, useTransform } from 'motion/react'

export function ShrinkingHeader() {
  const { scrollY } = useScroll()
  const height = useTransform(scrollY, [0, 100], [64, 48])
  const opacity = useTransform(scrollY, [0, 100], [1, 0.8])
  const fontSize = useTransform(scrollY, [0, 100], [20, 16])

  return (
    <motion.header
      className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/80 backdrop-blur-xl"
      style={{ height }}
    >
      <motion.h1 style={{ opacity, fontSize }} className="font-semibold text-[var(--color-text-primary)]">
        Dashboard
      </motion.h1>
    </motion.header>
  )
}
```

### Pattern 2: Card → Detail Shared Layout Transition
```tsx
'use client'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'

export function ExpandableCard({ cluster }: { cluster: Cluster }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <motion.div
        layoutId={`cluster-${cluster.id}`}
        onClick={() => setExpanded(true)}
        className="cursor-pointer rounded-xl border border-[var(--color-border)] p-4"
        whileHover={{ y: -2, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}
      >
        <motion.h3 layoutId={`title-${cluster.id}`}>{cluster.name}</motion.h3>
        <motion.p layoutId={`status-${cluster.id}`}>{cluster.status}</motion.p>
      </motion.div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            layoutId={`cluster-${cluster.id}`}
            className="fixed inset-4 z-50 rounded-2xl bg-[var(--color-bg-card)] p-6 overflow-auto"
            initial={{ borderRadius: 12 }}
          >
            <motion.h3 layoutId={`title-${cluster.id}`} className="text-xl">
              {cluster.name}
            </motion.h3>
            <motion.p layoutId={`status-${cluster.id}`}>{cluster.status}</motion.p>
            {/* Full detail content */}
            <button onClick={() => setExpanded(false)}>Close</button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
```

### Pattern 3: Staggered Widget Grid with Spring Physics
```tsx
'use client'
import { motion } from 'motion/react'

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
}

const item = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
}

export function WidgetGrid({ widgets }: { widgets: Widget[] }) {
  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {widgets.map((w) => (
        <motion.div key={w.id} variants={item} layout>
          <WidgetWrapper widget={w} />
        </motion.div>
      ))}
    </motion.div>
  )
}
```

### Pattern 4: Animated Counter with useSpring (Zero Extra Dependencies)
```tsx
'use client'
import { motion, useSpring, useTransform } from 'motion/react'
import { useEffect } from 'react'

export function SpringCounter({ value }: { value: number }) {
  const spring = useSpring(0, { stiffness: 100, damping: 30 })
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString())

  useEffect(() => {
    spring.set(value)
  }, [spring, value])

  return (
    <motion.span className="text-2xl font-semibold tabular-nums">
      {display}
    </motion.span>
  )
}
```

---

## CSS Animation Layer — What We Have in Tailwind 4

Our `globals.css` already defines custom animations via `@theme`:

| Animation Class | Keyframe | Used? |
|-----------------|----------|-------|
| `animate-pulse-slow` | `pulse-slow` (opacity 1→0.5→1) | ✅ Status dots, health indicators |
| `animate-glow-pulse` | `glow-pulse` (box-shadow pulse) | ⚠️ Defined but rarely used |
| `animate-fade-in` | `fade-in` (opacity 0→1) | ✅ Sheet overlay |
| `animate-slide-up` | `slide-up` (opacity+translateY) | ✅ Command palette |
| `animate-count-up` | `count-up` (opacity+translateY) | ⚠️ Defined but not actively used |
| `animate-pulse` | Built-in Tailwind | ✅ Loading states |
| `animate-spin` | Built-in Tailwind | ✅ Loader2 spinners |

### Missing CSS Animations to Add
```css
@theme {
  --animate-shimmer: shimmer 2s ease-in-out infinite;
  --animate-slide-in-right: slide-in-right 0.3s ease-out;
  --animate-scale-in: scale-in 0.2s ease-out;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes slide-in-right {
  from { opacity: 0; transform: translateX(16px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
```

---

## Performance Optimization — LazyMotion

**Current:** Every file imports from `motion/react` — this loads the full 40kb+ bundle.

**Recommendation:** Wrap the app in `LazyMotion` with `domAnimation` (covers 95% of use cases at ~17kb):

```tsx
// app/layout.tsx or components/providers.tsx
import { LazyMotion, domAnimation } from 'motion/react'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {/* ... existing providers ... */}
      {children}
    </LazyMotion>
  )
}
```

Then use `m` instead of `motion` for tree-shaking:
```tsx
import { m } from 'motion/react'

// Use <m.div> instead of <motion.div>
<m.div animate={{ opacity: 1 }}>...</m.div>
```

**Estimated savings:** ~23kb gzipped from the motion bundle.

---

## Summary: Priority Actions

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 1 | Add `whileHover`/`whileTap` to all interactive cards | 🔥 High — instant feel of polish | ⚡ 30min |
| 2 | Implement staggered widget load animation | 🔥 High — dashboard wow factor | ⚡ 1hr |
| 3 | Add `useInView` for chart reveal animations | 🔥 High — progressive disclosure | ⚡ 1hr |
| 4 | Install `@number-flow/react` for stat counters | 🔥 High — replaces custom AnimatedNumber | ⚡ 30min |
| 5 | Wrap app in `LazyMotion` for bundle savings | 📦 Medium — perf optimization | ⚡ 2hr |
| 6 | Add `layoutId` for card → detail transitions | ✨ High — premium UX | 🔧 3hr |
| 7 | Implement scroll-progress indicator | ✨ Medium — visual polish | ⚡ 15min |
| 8 | Add Reorder component for dashboard edit mode | ✨ Medium — replaces grid drag | 🔧 4hr |
| 9 | Add shimmer/skeleton animation keyframes | 📦 Low — polish | ⚡ 15min |

---

> **Note:** Web search API was unavailable during this analysis. Findings are based on direct codebase audit + current knowledge of motion v12, React 19, Tailwind 4, and shadcn/ui v4 (2026). Motion docs were fetched directly for API verification.
