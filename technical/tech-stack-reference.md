# Voyager Platform — Tech Stack Quick Reference

> **Generated:** 2026-02-04 | **Purpose:** Comprehensive quick-reference for building a modern K8s operations platform
> All versions verified from npm registry and official sources.

---

## Table of Contents

- [Frontend Stack](#frontend-stack)
  1. [Next.js (App Router)](#1-nextjs-app-router)
  2. [React 19](#2-react-19)
  3. [Tailwind CSS v4](#3-tailwind-css-v4)
  4. [shadcn/ui](#4-shadcnui)
  5. [TanStack Table](#5-tanstack-table)
  6. [TanStack Query](#6-tanstack-query)
  7. [Recharts](#7-recharts)
  8. [Zustand](#8-zustand)
- [Backend Stack](#backend-stack)
  9. [Fastify](#9-fastify)
  10. [tRPC v11](#10-trpc-v11)
  11. [Drizzle ORM](#11-drizzle-orm)
  12. [BullMQ](#12-bullmq)
- [Data Stack](#data-stack)
  13. [PostgreSQL 17](#13-postgresql-17)
  14. [TimescaleDB](#14-timescaledb)
  15. [Redis](#15-redis)
  16. [OpenSearch](#16-opensearch)
- [Infrastructure](#infrastructure)
  17. [Docker](#17-docker)
  18. [Helm Charts](#18-helm-charts)
  19. [GitHub Actions](#19-github-actions)
- [Auth](#auth)
  20. [Clerk](#20-clerk)

---

# Frontend Stack

---

## 1. Next.js (App Router)

| Field | Value |
|-------|-------|
| **Latest Version** | `16.1.6` |
| **Released by** | Vercel |
| **Docs** | https://nextjs.org/docs |
| **GitHub** | https://github.com/vercel/next.js |

### Installation

```bash
npx create-next-app@latest voyager-dashboard --typescript --tailwind --eslint --app --src-dir
# Or add to existing project:
npm install next@latest react@latest react-dom@latest
```

### Key APIs & Concepts

#### App Router File Conventions
```
app/
├── layout.tsx          # Root layout (wraps all routes)
├── page.tsx            # Home page (/)
├── loading.tsx         # Loading UI (Suspense boundary)
├── error.tsx           # Error boundary
├── not-found.tsx       # 404 page
├── route.ts            # API route handler (GET/POST/etc)
├── template.tsx        # Re-rendered layout (no state preservation)
├── global-error.tsx    # Global error boundary
├── (group)/            # Route group (not in URL)
│   └── page.tsx
├── [slug]/             # Dynamic segment
│   └── page.tsx
├── [...slug]/          # Catch-all segment
│   └── page.tsx
├── [[...slug]]/        # Optional catch-all
│   └── page.tsx
├── @modal/             # Parallel route (named slot)
│   └── page.tsx
└── (.)photo/           # Intercepting route
    └── page.tsx
```

#### Server Components (default in App Router)
```tsx
// app/dashboard/page.tsx — Server Component by default
import { db } from '@/lib/db';

export default async function DashboardPage() {
  const clusters = await db.query.clusters.findMany();
  return <ClusterList clusters={clusters} />;
}
```

#### Client Components
```tsx
'use client';
import { useState } from 'react';

export function ClusterFilter({ onFilter }: { onFilter: (q: string) => void }) {
  const [query, setQuery] = useState('');
  return <input value={query} onChange={e => { setQuery(e.target.value); onFilter(e.target.value); }} />;
}
```

#### Route Handlers (API Routes)
```tsx
// app/api/clusters/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const clusters = await getClusters(searchParams.get('status'));
  return NextResponse.json(clusters);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const cluster = await createCluster(body);
  return NextResponse.json(cluster, { status: 201 });
}
```

#### Middleware
```tsx
// middleware.ts (root of project)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Auth check, redirects, rewrites, headers
  const token = request.cookies.get('session');
  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
```

#### Metadata API
```tsx
// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { template: '%s | Voyager', default: 'Voyager Platform' },
  description: 'Kubernetes Operations Platform',
  openGraph: { title: 'Voyager', description: 'K8s Ops' },
};

// Dynamic metadata per page
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const cluster = await getCluster(params.slug);
  return { title: cluster.name };
}
```

#### Server Actions
```tsx
// app/actions.ts
'use server';
import { revalidatePath } from 'next/cache';

export async function deployCluster(formData: FormData) {
  const name = formData.get('name') as string;
  await db.insert(clusters).values({ name });
  revalidatePath('/dashboard');
}
```

### Project Structure Best Practices
```
src/
├── app/                    # App Router pages & layouts
│   ├── (auth)/             # Auth route group
│   │   ├── sign-in/
│   │   └── sign-up/
│   ├── (dashboard)/        # Dashboard route group
│   │   ├── layout.tsx      # Shared dashboard layout (sidebar, nav)
│   │   ├── clusters/
│   │   ├── nodes/
│   │   └── logs/
│   ├── api/                # Route handlers (or use tRPC)
│   └── layout.tsx          # Root layout
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── dashboard/          # Dashboard-specific components
│   └── shared/             # Shared/reusable components
├── lib/                    # Utility functions, db client, etc.
├── hooks/                  # Custom React hooks
├── stores/                 # Zustand stores
├── types/                  # TypeScript types
└── styles/                 # Global styles
```

### Common Pitfalls
- **"use client" boundary**: Everything below a `'use client'` directive becomes client-side. Keep it as low in the tree as possible.
- **Async Server Components**: Only Server Components can be async. Don't `await` in Client Components.
- **Caching**: Next.js 15+ changed default fetch caching from `force-cache` to `no-store`. Be explicit: `fetch(url, { cache: 'force-cache' })`.
- **Dynamic vs Static**: Use `generateStaticParams()` for static generation. Use `export const dynamic = 'force-dynamic'` for always-dynamic pages.
- **Parallel Data Fetching**: Use `Promise.all()` for independent data fetches in Server Components to avoid waterfalls.
- **maxParamLength**: When using with tRPC/Fastify, set `maxParamLength: 5000` to avoid truncated batch requests.

### Best Practices for Production
- Use **Streaming** with `<Suspense>` boundaries for slow data
- Implement **Partial Prerendering (PPR)** for hybrid static/dynamic pages
- Use **`instrumentation.ts`** for OpenTelemetry integration
- Co-locate components with their routes using private folders (`_components/`)
- Use route groups `(marketing)`, `(dashboard)` to share layouts without URL impact

---

## 2. React 19

| Field | Value |
|-------|-------|
| **Latest Version** | `19.2.4` |
| **Released by** | Meta |
| **Docs** | https://react.dev |
| **Blog Post** | https://react.dev/blog/2024/12/05/react-19 |

### Installation

```bash
npm install react@latest react-dom@latest
npm install -D @types/react@latest @types/react-dom@latest
```

### Key New Features

#### `use()` Hook — Read resources in render
```tsx
import { use } from 'react';

function ClusterDetails({ clusterPromise }: { clusterPromise: Promise<Cluster> }) {
  const cluster = use(clusterPromise);  // Suspends until resolved
  return <div>{cluster.name}</div>;
}

// Also works with Context
function ThemeButton() {
  const theme = use(ThemeContext);  // Can be called conditionally!
  return <button className={theme}>{theme}</button>;
}
```

#### Actions & Form Handling
```tsx
'use client';
import { useActionState } from 'react';

function DeployForm() {
  const [state, formAction, isPending] = useActionState(
    async (previousState: any, formData: FormData) => {
      const result = await deployCluster(formData);
      return result;
    },
    null // initial state
  );

  return (
    <form action={formAction}>
      <input name="clusterName" />
      <button disabled={isPending}>
        {isPending ? 'Deploying...' : 'Deploy'}
      </button>
      {state?.error && <p>{state.error}</p>}
    </form>
  );
}
```

#### `useFormStatus` — Access parent form state
```tsx
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending, data, method, action } = useFormStatus();
  return <button disabled={pending}>{pending ? 'Submitting...' : 'Submit'}</button>;
}
```

#### `useOptimistic` — Optimistic UI updates
```tsx
import { useOptimistic } from 'react';

function ClusterList({ clusters }: { clusters: Cluster[] }) {
  const [optimisticClusters, addOptimistic] = useOptimistic(
    clusters,
    (state, newCluster: Cluster) => [...state, newCluster]
  );

  async function handleAdd(formData: FormData) {
    const newCluster = { name: formData.get('name') as string, status: 'pending' };
    addOptimistic(newCluster as Cluster);
    await createCluster(formData);
  }

  return (
    <form action={handleAdd}>
      {optimisticClusters.map(c => <div key={c.id}>{c.name} ({c.status})</div>)}
    </form>
  );
}
```

#### Server Components
```tsx
// Server Component (default in Next.js App Router)
// Can: fetch data, access backend resources, keep secrets server-side
// Cannot: use hooks (useState, useEffect), browser APIs, event handlers
async function ClusterMetrics() {
  const metrics = await fetch('http://prometheus:9090/api/v1/query?query=up');
  const data = await metrics.json();
  return <MetricsChart data={data} />;
}
```

### Complete Hooks Reference

| Hook | Purpose |
|------|---------|
| `useState` | Local component state |
| `useReducer` | Complex state logic |
| `useEffect` | Side effects (API calls, subscriptions) |
| `useContext` | Read context value |
| `useRef` | Mutable ref / DOM element ref |
| `useMemo` | Memoize expensive computations |
| `useCallback` | Memoize callback functions |
| `useId` | Generate unique IDs for accessibility |
| `useTransition` | Mark state updates as non-blocking |
| `useDeferredValue` | Defer re-rendering of non-critical UI |
| `useSyncExternalStore` | Subscribe to external stores |
| **`use`** | ✨ Read promises/context (can be conditional!) |
| **`useActionState`** | ✨ Form action state management |
| **`useFormStatus`** | ✨ Access parent form pending state |
| **`useOptimistic`** | ✨ Optimistic UI updates |

### Common Pitfalls
- **`use()` is not `useEffect`**: `use()` suspends rendering. Wrap in `<Suspense>` with a fallback.
- **Server vs Client Components**: Server Components can't use hooks or browser APIs. Use `'use client'` directive.
- **`ref` is now a prop**: In React 19, `ref` is passed as a regular prop. No need for `forwardRef` anymore.
- **Compiler (React Forget)**: React Compiler auto-memoizes. If enabled, remove manual `useMemo`/`useCallback` gradually.
- **Hydration Mismatches**: Ensure server and client render identical initial HTML.

### Best Practices
- Use Server Components by default; add `'use client'` only when needed
- Prefer `useActionState` over manual `useState` + `useEffect` for form submission
- Use `useOptimistic` for instant UI feedback on mutations
- Use `useTransition` for expensive state updates to keep UI responsive
- Move data fetching to Server Components and pass as props

---

## 3. Tailwind CSS v4

| Field | Value |
|-------|-------|
| **Latest Version** | `4.1.18` |
| **Released by** | Tailwind Labs |
| **Docs** | https://tailwindcss.com/docs |
| **Migration** | https://tailwindcss.com/docs/upgrade-guide |

### Installation

```bash
npm install tailwindcss @tailwindcss/postcss
# For Next.js (v4 uses PostCSS plugin):
# postcss.config.mjs
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

### Key Change: CSS-First Configuration

**v4 eliminates `tailwind.config.js`** — everything is configured in CSS using `@theme`:

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  /* Colors */
  --color-primary: oklch(0.6 0.18 250);
  --color-primary-foreground: oklch(0.98 0.01 250);
  --color-destructive: oklch(0.55 0.22 25);
  --color-muted: oklch(0.95 0.01 250);
  --color-border: oklch(0.88 0.02 250);

  /* Spacing */
  --spacing-sidebar: 16rem;
  --spacing-header: 4rem;

  /* Fonts */
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* Border Radius */
  --radius-lg: 0.75rem;
  --radius-md: 0.5rem;
  --radius-sm: 0.25rem;

  /* Breakpoints */
  --breakpoint-3xl: 120rem;

  /* Shadows */
  --shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.08);

  /* Animations */
  --animate-slide-in: slide-in 0.2s ease-out;
}

@keyframes slide-in {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}
```

### Theme Variable Namespaces

| Namespace | Generates Utilities |
|-----------|-------------------|
| `--color-*` | `bg-*`, `text-*`, `border-*`, `fill-*`, etc. |
| `--font-*` | `font-*` (font family) |
| `--text-*` | `text-*` (font size) |
| `--font-weight-*` | `font-*` (weight) |
| `--spacing-*` | `px-*`, `py-*`, `gap-*`, `w-*`, `h-*`, etc. |
| `--radius-*` | `rounded-*` |
| `--shadow-*` | `shadow-*` |
| `--breakpoint-*` | `sm:`, `md:`, `lg:` etc. (variants) |
| `--animate-*` | `animate-*` |
| `--ease-*` | `ease-*` |

### Dark Mode

```css
/* CSS-native dark mode with @theme */
@import "tailwindcss";

@theme {
  --color-background: oklch(0.99 0 0);
  --color-foreground: oklch(0.15 0 0);
}

/* Override in dark mode using CSS custom properties */
@media (prefers-color-scheme: dark) {
  :root {
    --color-background: oklch(0.15 0 0);
    --color-foreground: oklch(0.95 0 0);
  }
}
```

```html
<!-- Or class-based dark mode (add `dark` class to html) -->
<div class="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
  Dashboard content
</div>
```

### Common Pitfalls
- **No more `tailwind.config.js`**: Configuration is now CSS-first via `@theme`. Legacy JS config still works with `@config` directive but is deprecated.
- **PostCSS plugin changed**: Use `@tailwindcss/postcss` instead of the old `tailwindcss` PostCSS plugin.
- **`@apply` still works** but CSS-native approach with `@theme` variables is preferred.
- **Content detection is automatic**: v4 auto-detects template files. No need for `content` config.
- **Lightning CSS**: v4 uses Lightning CSS (Rust-based) for much faster builds. Some PostCSS plugins may be incompatible.

### Best Practices
- Define all design tokens in `@theme` for single source of truth
- Use `oklch()` color format for perceptually uniform colors
- Use CSS custom properties (generated from @theme) for JS access: `var(--color-primary)`
- Leverage the `@theme inline` directive for tokens that shouldn't generate utilities
- Use `@source` directive if auto-detection misses some files

---

## 4. shadcn/ui

| Field | Value |
|-------|-------|
| **Latest CLI** | `shadcn@latest` (not versioned — copies into project) |
| **Foundation** | Radix UI primitives + Tailwind CSS |
| **Docs** | https://ui.shadcn.com |
| **GitHub** | https://github.com/shadcn-ui/ui |

### Installation

```bash
# New project with shadcn/create
npx shadcn@latest init

# Follow prompts to configure:
# - Style (New York / Default)
# - Base color
# - CSS variables (yes)
# - React Server Components (yes)
# - Import alias (@/components)

# Add individual components:
npx shadcn@latest add button card table dialog sheet command chart
```

### Key Components for K8s Dashboard

#### Data Table (built on TanStack Table)
```bash
npx shadcn@latest add table data-table
```
```tsx
import { DataTable } from '@/components/ui/data-table';
import { columns } from './columns';

export function ClustersPage() {
  const data = await getClusters();
  return <DataTable columns={columns} data={data} />;
}
```

#### Card — Metric Cards
```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Active Clusters</CardTitle>
    <CardDescription>Currently running K8s clusters</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="text-3xl font-bold">24</div>
  </CardContent>
</Card>
```

#### Chart (wraps Recharts)
```bash
npx shadcn@latest add chart
```
```tsx
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend } from '@/components/ui/chart';
import { Area, AreaChart, XAxis, YAxis } from 'recharts';

const chartConfig = {
  cpu: { label: 'CPU Usage', color: 'hsl(var(--chart-1))' },
  memory: { label: 'Memory', color: 'hsl(var(--chart-2))' },
};

<ChartContainer config={chartConfig} className="h-[300px]">
  <AreaChart data={metricsData}>
    <XAxis dataKey="timestamp" />
    <YAxis />
    <ChartTooltip content={<ChartTooltipContent />} />
    <Area dataKey="cpu" fill="var(--color-cpu)" stroke="var(--color-cpu)" />
    <Area dataKey="memory" fill="var(--color-memory)" stroke="var(--color-memory)" />
  </AreaChart>
</ChartContainer>
```

#### Dialog — Confirm Actions
```tsx
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';

<Dialog>
  <DialogTrigger asChild><Button variant="destructive">Delete Cluster</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Delete Cluster?</DialogTitle>
      <DialogDescription>This action cannot be undone.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button variant="destructive" onClick={handleDelete}>Delete</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

#### Sheet — Side Panel
```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

<Sheet>
  <SheetTrigger asChild><Button>View Details</Button></SheetTrigger>
  <SheetContent side="right" className="w-[600px]">
    <SheetHeader><SheetTitle>Cluster Details</SheetTitle></SheetHeader>
    <ClusterDetailPanel cluster={cluster} />
  </SheetContent>
</Sheet>
```

#### Command — Command Palette (Ctrl+K)
```tsx
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';

<CommandDialog open={open} onOpenChange={setOpen}>
  <CommandInput placeholder="Search clusters, pods, logs..." />
  <CommandList>
    <CommandEmpty>No results found.</CommandEmpty>
    <CommandGroup heading="Clusters">
      {clusters.map(c => (
        <CommandItem key={c.id} onSelect={() => navigateToCluster(c.id)}>
          {c.name}
        </CommandItem>
      ))}
    </CommandGroup>
  </CommandList>
</CommandDialog>
```

### Theming

shadcn/ui uses CSS variables. Customize in `globals.css`:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --destructive: 0 84.2% 60.2%;
    --muted: 240 4.8% 95.9%;
    --border: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
  }
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    /* ... dark values */
  }
}
```

### Common Pitfalls
- **Not a package**: Components are copied into your project. You own them. No version updates to manage.
- **Radix vs Base UI**: shadcn now supports both Radix and Base UI (MUI) primitives. Choose during init.
- **Tailwind v4 compatibility**: Make sure to use latest `shadcn` CLI for Tailwind v4 support.
- **Import paths**: Components install to `@/components/ui/`. Don't restructure without updating all imports.

### Best Practices
- Use the **Sidebar** component for dashboard navigation
- Combine **Data Table** + **Sheet** for list → detail patterns
- Use **Sonner** (toast) for async operation feedback
- Install only components you need to keep bundle small
- Customize theme colors in CSS variables for consistent branding

---

## 5. TanStack Table

| Field | Value |
|-------|-------|
| **Latest Version** | `8.21.3` (`@tanstack/react-table`) |
| **Docs** | https://tanstack.com/table/latest |
| **GitHub** | https://github.com/TanStack/table |

### Installation

```bash
npm install @tanstack/react-table
# For virtual scrolling:
npm install @tanstack/react-virtual
```

### Basic Setup

```tsx
import { useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';

// 1. Define columns
const columns: ColumnDef<Cluster>[] = [
  { accessorKey: 'name', header: 'Cluster Name',
    cell: ({ row }) => <span className="font-medium">{row.getValue('name')}</span> },
  { accessorKey: 'status', header: 'Status',
    filterFn: 'equals',
    cell: ({ row }) => <Badge variant={row.getValue('status')}>{row.getValue('status')}</Badge> },
  { accessorKey: 'nodes', header: ({ column }) => (
    <Button variant="ghost" onClick={() => column.toggleSorting()}>
      Nodes <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  )},
  { accessorKey: 'cpu', header: 'CPU %', cell: ({ row }) => `${row.getValue('cpu')}%` },
];

// 2. Create table instance
function ClustersTable({ data }: { data: Cluster[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  // 3. Render with flexRender...
}
```

### Virtual Scrolling for Large Datasets (1000+ rows)

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualTable({ data }: { data: Pod[] }) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  const { rows } = table.getRowModel();
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // row height
    overscan: 20,
  });

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const row = rows[virtualRow.index];
          return (
            <tr key={row.id} style={{
              position: 'absolute', top: 0,
              transform: `translateY(${virtualRow.start}px)`,
              height: `${virtualRow.size}px`,
            }}>
              {row.getVisibleCells().map(cell => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          );
        })}
      </div>
    </div>
  );
}
```

### Server-Side Operations

```tsx
const table = useReactTable({
  data,
  columns,
  manualSorting: true,      // Server handles sorting
  manualFiltering: true,     // Server handles filtering
  manualPagination: true,    // Server handles pagination
  pageCount: totalPages,
  state: { sorting, columnFilters, pagination },
  onSortingChange: setSorting,
  onPaginationChange: setPagination,
  getCoreRowModel: getCoreRowModel(),
});
```

### Common Pitfalls
- **Stable `data` reference**: Memoize data array with `useMemo` to prevent infinite re-renders.
- **Column definitions**: Define columns outside component or memoize with `useMemo`.
- **Large datasets**: Use virtual scrolling + server-side pagination. Don't render 10K rows in DOM.
- **Type safety**: Use `ColumnDef<TData>` generic for full type inference.

### Best Practices
- Combine with shadcn/ui Table component for consistent styling
- Use `getFilteredRowModel()` for client-side, `manualFiltering` for server-side
- Implement column visibility toggle for wide tables
- Use `columnHelper = createColumnHelper<Cluster>()` for better type inference

---

## 6. TanStack Query

| Field | Value |
|-------|-------|
| **Latest Version** | `5.90.20` (`@tanstack/react-query`) |
| **Docs** | https://tanstack.com/query/latest |
| **GitHub** | https://github.com/TanStack/query |

### Installation

```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

### Setup with Provider

```tsx
// app/providers.tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,         // 1 minute
        gcTime: 5 * 60 * 1000,        // 5 minutes (was cacheTime)
        retry: 3,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

### Setup with tRPC (v11)

```tsx
// lib/trpc.ts
import { createTRPCClient, httpBatchLink, splitLink, httpSubscriptionLink } from '@trpc/client';
import type { AppRouter } from '@voyager/api';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({ url: 'http://localhost:4000/trpc' }),
      false: httpBatchLink({ url: 'http://localhost:4000/trpc' }),
    }),
  ],
});

// With TanStack Query integration:
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';

export const trpcOptions = createTRPCOptionsProxy<AppRouter>({
  client: trpc,
});
```

### Caching Strategies for K8s Data

```tsx
// Real-time cluster status — short stale time, frequent refetch
const { data: clusters } = useQuery({
  queryKey: ['clusters', 'status'],
  queryFn: () => trpc.clusters.list.query(),
  staleTime: 5_000,            // 5 seconds
  refetchInterval: 10_000,     // Poll every 10s
});

// Static config — long cache
const { data: config } = useQuery({
  queryKey: ['cluster', clusterId, 'config'],
  queryFn: () => trpc.clusters.getConfig.query({ id: clusterId }),
  staleTime: 5 * 60_000,      // 5 minutes
});

// Log search — no cache
const { data: logs } = useQuery({
  queryKey: ['logs', query, timeRange],
  queryFn: () => trpc.logs.search.query({ query, timeRange }),
  staleTime: 0,
  gcTime: 30_000,              // Keep 30s then GC
});
```

### Mutations with Optimistic Updates

```tsx
const queryClient = useQueryClient();

const deleteCluster = useMutation({
  mutationFn: (id: string) => trpc.clusters.delete.mutate({ id }),
  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: ['clusters'] });
    const previous = queryClient.getQueryData(['clusters']);
    queryClient.setQueryData(['clusters'], (old: Cluster[]) =>
      old.filter(c => c.id !== id)
    );
    return { previous };
  },
  onError: (err, id, context) => {
    queryClient.setQueryData(['clusters'], context?.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['clusters'] });
  },
});
```

### Real-Time Data Patterns

```tsx
// Polling for metrics
useQuery({
  queryKey: ['metrics', clusterId],
  queryFn: () => trpc.metrics.getCurrent.query({ clusterId }),
  refetchInterval: 5_000,
  refetchIntervalInBackground: true,
});

// WebSocket subscription (tRPC)
// See tRPC section for subscription setup

// Invalidation on WebSocket event
useEffect(() => {
  const ws = new WebSocket('ws://localhost:4000/events');
  ws.onmessage = (event) => {
    const { type, clusterId } = JSON.parse(event.data);
    if (type === 'cluster:updated') {
      queryClient.invalidateQueries({ queryKey: ['clusters', clusterId] });
    }
  };
  return () => ws.close();
}, [queryClient]);
```

### Common Pitfalls
- **`gcTime` (not `cacheTime`)**: v5 renamed `cacheTime` to `gcTime` (garbage collection time).
- **QueryKey arrays**: Always use arrays. Include all variables the query depends on.
- **Stable queryFn**: Don't create inline arrow functions referencing changing closures without including deps in queryKey.
- **Server Components**: TanStack Query is for Client Components. For Server Components, fetch data directly.
- **DevTools**: Only include in development. The import is tree-shaken in production.

### Best Practices
- Use **query key factories**: `clusterKeys.all`, `clusterKeys.detail(id)`, `clusterKeys.list(filters)`
- Set `staleTime` based on data volatility: metrics (5s), configs (5min), static data (Infinity)
- Use `select` option to transform/filter data without refetching
- Use `placeholderData` (replaced `keepPreviousData`) for pagination UX
- Prefetch on hover: `queryClient.prefetchQuery(...)` for instant navigation

---

## 7. Recharts

| Field | Value |
|-------|-------|
| **Latest Version** | `3.7.0` |
| **Docs** | https://recharts.org |
| **GitHub** | https://github.com/recharts/recharts |

### Installation

```bash
npm install recharts
```

### Time-Series Charts for K8s Metrics

```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

// CPU usage over time
function CpuChart({ data }: { data: MetricPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <defs>
          <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
          className="text-xs"
        />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="cpu"
          stroke="hsl(var(--chart-1))"
          fill="url(#cpuGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

### Custom Tooltip

```tsx
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm text-muted-foreground">
        {new Date(label).toLocaleString()}
      </p>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center gap-2 text-sm">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="font-medium">{entry.name}:</span>
          <span>{entry.value}%</span>
        </div>
      ))}
    </div>
  );
}
```

### Multi-Line Chart (CPU + Memory + Network)

```tsx
<ResponsiveContainer width="100%" height={400}>
  <LineChart data={metricsTimeSeries}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="timestamp" tickFormatter={formatTime} />
    <YAxis yAxisId="percent" domain={[0, 100]} />
    <YAxis yAxisId="bytes" orientation="right" />
    <Tooltip content={<CustomTooltip />} />
    <Line yAxisId="percent" type="monotone" dataKey="cpu" stroke="hsl(var(--chart-1))" dot={false} />
    <Line yAxisId="percent" type="monotone" dataKey="memory" stroke="hsl(var(--chart-2))" dot={false} />
    <Line yAxisId="bytes" type="monotone" dataKey="networkIn" stroke="hsl(var(--chart-3))" dot={false} />
  </LineChart>
</ResponsiveContainer>
```

### Common Pitfalls
- **Always wrap in `ResponsiveContainer`**: Without it, charts won't resize.
- **`ResponsiveContainer` needs a parent with defined height**: The parent div must have `height` set.
- **Performance with many points**: Use `dot={false}` and reduce data points (downsample) for 1000+ points.
- **SSR**: Recharts uses SVG and requires browser APIs. Use dynamic import with `ssr: false` in Next.js if needed.
- **Recharts v3 breaking changes**: v3 dropped some legacy APIs. Check migration guide.

### Best Practices
- Use `ResponsiveContainer` with `width="100%"` and explicit `height`
- Integrate with shadcn/ui `ChartContainer` for consistent theming
- Downsample time-series data server-side (e.g., 1000-point max)
- Use `type="monotone"` for smooth curves on metrics
- Use `isAnimationActive={false}` for real-time updating charts

---

## 8. Zustand

| Field | Value |
|-------|-------|
| **Latest Version** | `5.0.11` |
| **Docs** | https://zustand.docs.pmnd.rs |
| **GitHub** | https://github.com/pmndrs/zustand |

### Installation

```bash
npm install zustand
```

### Store Patterns

#### Basic Store
```tsx
import { create } from 'zustand';

interface DashboardStore {
  selectedClusterId: string | null;
  sidebarOpen: boolean;
  timeRange: '1h' | '6h' | '24h' | '7d';
  setSelectedCluster: (id: string | null) => void;
  toggleSidebar: () => void;
  setTimeRange: (range: DashboardStore['timeRange']) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  selectedClusterId: null,
  sidebarOpen: true,
  timeRange: '1h',
  setSelectedCluster: (id) => set({ selectedClusterId: id }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setTimeRange: (range) => set({ timeRange: range }),
}));
```

#### Slice Pattern (for large stores)
```tsx
// stores/clusterSlice.ts
import { StateCreator } from 'zustand';

export interface ClusterSlice {
  clusters: Cluster[];
  selectedCluster: Cluster | null;
  setClusters: (clusters: Cluster[]) => void;
  selectCluster: (cluster: Cluster | null) => void;
}

export const createClusterSlice: StateCreator<ClusterSlice & UISlice, [], [], ClusterSlice> = (set) => ({
  clusters: [],
  selectedCluster: null,
  setClusters: (clusters) => set({ clusters }),
  selectCluster: (cluster) => set({ selectedCluster: cluster }),
});

// stores/index.ts — Combine slices
import { create } from 'zustand';
export const useAppStore = create<ClusterSlice & UISlice>()((...a) => ({
  ...createClusterSlice(...a),
  ...createUISlice(...a),
}));
```

### Middleware

#### Persist (localStorage/sessionStorage)
```tsx
import { persist, createJSONStorage } from 'zustand/middleware';

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: 'system' as 'light' | 'dark' | 'system',
      compactMode: false,
      setTheme: (theme) => set({ theme }),
      toggleCompactMode: () => set((s) => ({ compactMode: !s.compactMode })),
    }),
    {
      name: 'voyager-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme, compactMode: state.compactMode }),
    }
  )
);
```

#### DevTools
```tsx
import { devtools } from 'zustand/middleware';

export const useStore = create<AppStore>()(
  devtools(
    persist(
      (set) => ({ /* ... */ }),
      { name: 'voyager' }
    ),
    { name: 'VoyagerStore', enabled: process.env.NODE_ENV === 'development' }
  )
);
```

#### Immer (for immutable updates)
```tsx
import { immer } from 'zustand/middleware/immer';

export const useClusterStore = create<ClusterStore>()(
  immer((set) => ({
    clusters: {},
    updateClusterStatus: (id, status) => set((state) => {
      state.clusters[id].status = status; // Direct mutation with Immer!
    }),
  }))
);
```

### Selectors (Prevent Unnecessary Re-renders)

```tsx
// ❌ Bad — re-renders on ANY store change
const { selectedClusterId, timeRange } = useDashboardStore();

// ✅ Good — re-renders only when selectedClusterId changes
const selectedClusterId = useDashboardStore((s) => s.selectedClusterId);

// ✅ Good — shallow comparison for object selections
import { useShallow } from 'zustand/react/shallow';
const { clusters, selectedCluster } = useDashboardStore(
  useShallow((s) => ({ clusters: s.clusters, selectedCluster: s.selectedCluster }))
);
```

### Common Pitfalls
- **v5 breaking changes**: `create` no longer accepts `(set, get, api)` — middleware chaining changed.
- **Selector performance**: Always use selectors. Destructuring entire store causes re-renders on every change.
- **`useShallow`**: Use for selecting multiple values. Replaces the old `shallow` equality function.
- **SSR hydration**: Use `skipHydration` or `onRehydrateStorage` to avoid hydration mismatches.
- **No async in set()**: Don't put async logic inside `set()`. Call async functions that then call `set()`.

### Best Practices
- Use Zustand for **client-side UI state** (selected items, filters, sidebar state)
- Use TanStack Query for **server state** (API data, caching)
- Keep stores small and focused; use slice pattern for large apps
- Use `subscribeWithSelector` middleware for reacting to state changes outside React
- Combine `devtools` + `persist` middleware stack for great DX

---

# Backend Stack

---

## 9. Fastify

| Field | Value |
|-------|-------|
| **Latest Version** | `5.7.4` |
| **Docs** | https://fastify.dev/docs/latest/ |
| **GitHub** | https://github.com/fastify/fastify |

### Installation

```bash
npm install fastify
npm install -D typescript @types/node tsx
# Common plugins:
npm install @fastify/cors @fastify/websocket @fastify/helmet @fastify/rate-limit
npm install zod
```

### TypeScript Setup

```typescript
// server.ts
import Fastify, { FastifyInstance } from 'fastify';

const app: FastifyInstance = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  routerOptions: { maxParamLength: 5000 },  // Required for tRPC
});

// Register plugins
await app.register(import('@fastify/cors'), { origin: ['http://localhost:3000'] });
await app.register(import('@fastify/helmet'));
await app.register(import('@fastify/websocket'));

// Start
const start = async () => {
  try {
    await app.listen({ port: 4000, host: '0.0.0.0' });
    console.log(`Server running on port 4000`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};
start();
```

### Plugin System

```typescript
// plugins/db.ts
import fp from 'fastify-plugin';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export default fp(async (fastify) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool });

  fastify.decorate('db', db);
  fastify.addHook('onClose', async () => { await pool.end(); });
}, { name: 'db' });

// Use in routes
app.get('/clusters', async (request, reply) => {
  const clusters = await app.db.select().from(clustersTable);
  return clusters;
});
```

### Validation with Zod (via fastify-type-provider-zod)

```typescript
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.withTypeProvider<ZodTypeProvider>().route({
  method: 'POST',
  url: '/clusters',
  schema: {
    body: z.object({
      name: z.string().min(1).max(63),
      region: z.enum(['us-east-1', 'eu-west-1', 'ap-southeast-1']),
      nodeCount: z.number().int().min(1).max(100),
    }),
    response: { 201: z.object({ id: z.string(), name: z.string() }) },
  },
  handler: async (request, reply) => {
    const cluster = await createCluster(request.body);
    reply.status(201).send(cluster);
  },
});
```

### WebSocket Support

```typescript
import websocket from '@fastify/websocket';

await app.register(websocket);

app.get('/ws/metrics', { websocket: true }, (socket, req) => {
  const interval = setInterval(() => {
    socket.send(JSON.stringify({ cpu: Math.random() * 100, ts: Date.now() }));
  }, 1000);

  socket.on('close', () => clearInterval(interval));
});
```

### Common Pitfalls
- **Fastify v5 requires ESM-aware setup**: Use `"type": "module"` in package.json or `.mts` extensions.
- **Plugin encapsulation**: Plugins are scoped by default. Use `fastify-plugin` (`fp()`) to share decorators across the app.
- **Don't use `reply.send()` with `return`**: Either `return` data OR call `reply.send()`, not both.
- **Lifecycle hooks order**: `onRequest` → `preParsing` → `preValidation` → `preHandler` → handler → `preSerialization` → `onSend` → `onResponse`.
- **Graceful shutdown**: Register `onClose` hooks for cleanup. Use `app.close()` on SIGTERM.

### Best Practices
- Use `fastify-plugin` for plugins that need to be accessible in parent scope
- Structure as: `plugins/` (infrastructure), `routes/` (API), `services/` (business logic)
- Use `fastify-type-provider-zod` for Zod-based validation with full type inference
- Set `trustProxy: true` when behind a reverse proxy / load balancer
- Use `ajv-formats` for additional schema validation formats

---

## 10. tRPC v11

| Field | Value |
|-------|-------|
| **Latest Version** | `11.9.0` (`@trpc/server`) |
| **Docs** | https://trpc.io/docs |
| **GitHub** | https://github.com/trpc/trpc |

### Installation

```bash
# Server
npm install @trpc/server zod

# Client (Next.js)
npm install @trpc/client @trpc/tanstack-react-query @tanstack/react-query

# WebSocket (Fastify)
npm install @fastify/websocket
```

### Server Setup on Fastify

```typescript
// server/trpc.ts — Initialize tRPC
import { initTRPC, TRPCError } from '@trpc/server';
import { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import superjson from 'superjson';
import { z } from 'zod';

// Context
export function createContext({ req, res }: CreateFastifyContextOptions) {
  return { req, res, user: req.headers.authorization ? decodeToken(req.headers.authorization) : null };
}
type Context = Awaited<ReturnType<typeof createContext>>;

// Init
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return { ...shape, data: { ...shape.data, zodError: error.cause instanceof z.ZodError ? error.cause.flatten() : null } };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
```

```typescript
// server/routers/clusters.ts
import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';

export const clusterRouter = router({
  list: publicProcedure
    .input(z.object({
      status: z.enum(['running', 'stopped', 'error']).optional(),
      limit: z.number().min(1).max(100).default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      return ctx.db.query.clusters.findMany({
        where: input.status ? eq(clusters.status, input.status) : undefined,
        limit: input.limit + 1,
        cursor: input.cursor,
      });
    }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1), region: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.db.insert(clusters).values(input).returning();
    }),

  // Real-time subscription
  onStatusChange: publicProcedure.subscription(async function* ({ ctx }) {
    // Async generator pattern (tRPC v11)
    for await (const event of ctx.eventEmitter.on('cluster:status')) {
      yield event;
    }
  }),
});
```

```typescript
// server/routers/_app.ts
import { router } from '../trpc';
import { clusterRouter } from './clusters';
import { metricsRouter } from './metrics';
import { logsRouter } from './logs';

export const appRouter = router({
  clusters: clusterRouter,
  metrics: metricsRouter,
  logs: logsRouter,
});

export type AppRouter = typeof appRouter;
```

```typescript
// server/index.ts — Register with Fastify
import { fastifyTRPCPlugin, FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import ws from '@fastify/websocket';

await app.register(ws);
await app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  useWSS: true,
  keepAlive: { enabled: true, pingMs: 30000, pongWaitMs: 5000 },
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error }) {
      console.error(`tRPC error on '${path}':`, error);
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
});
```

### Client Setup on Next.js

```typescript
// lib/trpc-client.ts
import { createTRPCClient, httpBatchLink, splitLink, createWSClient, wsLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@voyager/api';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: wsLink({ client: createWSClient({ url: 'ws://localhost:4000/trpc' }) }),
      false: httpBatchLink({
        url: 'http://localhost:4000/trpc',
        transformer: superjson,
        headers: () => ({ authorization: `Bearer ${getToken()}` }),
      }),
    }),
  ],
});
```

### Middleware Pattern

```typescript
// Logging middleware
const loggedProcedure = t.procedure.use(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;
  console.log(`${type} ${path} — ${duration}ms`);
  return result;
});

// Rate limiting middleware
const rateLimitedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const key = `ratelimit:${ctx.user?.id || ctx.req.ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  if (count > 100) throw new TRPCError({ code: 'TOO_MANY_REQUESTS' });
  return next();
});
```

### Error Handling

```typescript
import { TRPCError } from '@trpc/server';

// Throw typed errors
throw new TRPCError({
  code: 'NOT_FOUND',          // Maps to HTTP 404
  message: 'Cluster not found',
  cause: originalError,        // Original error for logging
});

// Error codes: PARSE_ERROR, BAD_REQUEST, UNAUTHORIZED, FORBIDDEN,
// NOT_FOUND, TIMEOUT, CONFLICT, PRECONDITION_FAILED, PAYLOAD_TOO_LARGE,
// METHOD_NOT_SUPPORTED, TOO_MANY_REQUESTS, CLIENT_CLOSED_REQUEST,
// INTERNAL_SERVER_ERROR, UNPROCESSABLE_CONTENT
```

### Common Pitfalls
- **Fastify v5 required**: tRPC v11 Fastify adapter requires Fastify v5+. Fastify v4 silently returns empty responses.
- **Transformer mismatch**: Use the same transformer (superjson) on both server and client.
- **WebSocket URL**: For WSS in production, use `wss://` protocol, not `ws://`.
- **Subscriptions v11**: Use async generators (`async function*`) instead of the old `observable()` pattern.
- **Type export**: Only export `type AppRouter` — never import the actual router in the client bundle.

### Best Practices
- Use `superjson` transformer for Date, Map, Set, BigInt serialization
- Split routers into feature-based files and merge with `t.router()`
- Use middleware chains: `publicProcedure` → `loggedProcedure` → `protectedProcedure`
- Implement cursor-based pagination for large datasets
- Use `splitLink` to route subscriptions to WebSocket and queries/mutations to HTTP

---

## 11. Drizzle ORM

| Field | Value |
|-------|-------|
| **Latest Version** | `0.45.1` (drizzle-orm), `0.31.8` (drizzle-kit) |
| **Docs** | https://orm.drizzle.team |
| **GitHub** | https://github.com/drizzle-team/drizzle-orm |

### Installation

```bash
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg tsx
```

### Schema Definition (PostgreSQL)

```typescript
// db/schema/clusters.ts
import { pgTable, text, timestamp, integer, boolean, jsonb, uuid, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const clusterStatusEnum = pgEnum('cluster_status', ['provisioning', 'running', 'degraded', 'stopped', 'error']);

export const clusters = pgTable('clusters', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  status: clusterStatusEnum('status').default('provisioning').notNull(),
  region: text('region').notNull(),
  kubeVersion: text('kube_version').notNull(),
  nodeCount: integer('node_count').default(3).notNull(),
  config: jsonb('config').$type<ClusterConfig>(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const nodes = pgTable('nodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  clusterId: uuid('cluster_id').references(() => clusters.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['control-plane', 'worker'] }).notNull(),
  status: text('status').notNull(),
  cpu: integer('cpu_millicores'),
  memory: integer('memory_mb'),
});
```

### Relations

```typescript
// db/schema/relations.ts
export const clustersRelations = relations(clusters, ({ many }) => ({
  nodes: many(nodes),
  deployments: many(deployments),
}));

export const nodesRelations = relations(nodes, ({ one }) => ({
  cluster: one(clusters, { fields: [nodes.clusterId], references: [clusters.id] }),
}));
```

### Querying with Relations (Relational Query Builder)

```typescript
// Find cluster with all nodes
const clusterWithNodes = await db.query.clusters.findFirst({
  where: eq(clusters.id, clusterId),
  with: {
    nodes: {
      where: eq(nodes.status, 'ready'),
      orderBy: [asc(nodes.name)],
    },
  },
});
```

### Migrations

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema/*',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});

// Commands:
// npx drizzle-kit generate   — Generate migration SQL files
// npx drizzle-kit migrate    — Apply migrations
// npx drizzle-kit push       — Push schema directly (dev only)
// npx drizzle-kit studio     — Visual DB browser
```

### Prepared Statements

```typescript
import { sql, eq } from 'drizzle-orm';

// Prepared statement for frequent queries
const getClusterByName = db
  .select()
  .from(clusters)
  .where(eq(clusters.name, sql.placeholder('name')))
  .prepare('get_cluster_by_name');

// Execute
const cluster = await getClusterByName.execute({ name: 'prod-us-east' });
```

### PostgreSQL-Specific Features

```typescript
// JSONB queries
const clustersWithGPU = await db.select().from(clusters)
  .where(sql`${clusters.config}->>'gpuEnabled' = 'true'`);

// Full-text search
const results = await db.select().from(logs)
  .where(sql`to_tsvector('english', ${logs.message}) @@ plainto_tsquery('english', ${searchQuery})`);

// Upsert (ON CONFLICT)
await db.insert(clusters).values(clusterData)
  .onConflictDoUpdate({
    target: clusters.name,
    set: { status: clusterData.status, updatedAt: new Date() },
  });

// Array columns
import { text } from 'drizzle-orm/pg-core';
const tags = text('tags').array(); // PostgreSQL text[]
```

### Row-Level Security (RLS) with Drizzle

```typescript
import { pgPolicy } from 'drizzle-orm/pg-core';

export const clusters = pgTable('clusters', {
  // ... columns
}, (table) => [
  pgPolicy('tenant_isolation', {
    as: 'permissive',
    for: 'all',
    to: 'authenticated',
    using: sql`${table.tenantId} = current_setting('app.tenant_id')::uuid`,
  }),
]);
```

### Common Pitfalls
- **Schema must be imported**: Pass all schema files to `drizzle()` for relations to work.
- **Circular imports**: Split schema and relations into separate files if circular deps occur.
- **`push` vs `migrate`**: Use `push` for development only. Use `generate` + `migrate` for production.
- **Pool management**: Use `pg.Pool` (not `pg.Client`) for connection pooling.
- **Timestamp timezone**: Always use `{ withTimezone: true }` for timestamps to avoid timezone bugs.

### Best Practices
- Use prepared statements for frequently-executed queries
- Define schemas in separate files per domain, combine in `schema/index.ts`
- Use `$inferInsert` and `$inferSelect` for TypeScript types
- Use `drizzle-kit studio` for visual debugging during development
- Implement soft deletes with `deletedAt` column and global filter

---

## 12. BullMQ

| Field | Value |
|-------|-------|
| **Latest Version** | `5.67.2` |
| **Docs** | https://bullmq.io |
| **GitHub** | https://github.com/taskforcesh/bullmq |

### Installation

```bash
npm install bullmq ioredis
```

### Queue Setup

```typescript
// queues/connection.ts
import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

// Shared Redis connection
const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,  // Required for BullMQ
  enableReadyCheck: false,
});

// Define queues
export const clusterQueue = new Queue('cluster-operations', { connection });
export const metricsQueue = new Queue('metrics-collection', { connection });
export const alertQueue = new Queue('alerts', { connection });
```

### Worker Patterns

```typescript
// workers/cluster-worker.ts
import { Worker, Job } from 'bullmq';

const clusterWorker = new Worker('cluster-operations',
  async (job: Job) => {
    switch (job.name) {
      case 'provision':
        await provisionCluster(job.data);
        break;
      case 'scale':
        await scaleCluster(job.data.clusterId, job.data.nodeCount);
        break;
      case 'destroy':
        await destroyCluster(job.data.clusterId);
        break;
    }

    // Report progress
    await job.updateProgress(100);
    return { success: true };
  },
  {
    connection,
    concurrency: 5,           // Process 5 jobs simultaneously
    limiter: { max: 10, duration: 60_000 },  // Rate limit: 10/min
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  }
);

// Event handlers
clusterWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});
clusterWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});
```

### Job Scheduling

```typescript
// Add a job
await clusterQueue.add('provision', {
  name: 'prod-cluster',
  region: 'us-east-1',
  nodeCount: 5,
}, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  priority: 1,       // Lower = higher priority
  delay: 0,          // Process immediately
  jobId: 'unique-id', // Deduplicate
});

// Repeatable jobs (cron)
await metricsQueue.add('collect', {}, {
  repeat: { pattern: '*/30 * * * * *' },  // Every 30 seconds
  removeOnComplete: true,
});

// Delayed job
await alertQueue.add('check-health', { clusterId: 'abc' }, {
  delay: 60_000,     // Run after 60 seconds
});

// Bulk add
await clusterQueue.addBulk([
  { name: 'healthcheck', data: { clusterId: '1' } },
  { name: 'healthcheck', data: { clusterId: '2' } },
  { name: 'healthcheck', data: { clusterId: '3' } },
]);
```

### Job Progress & Events

```typescript
// Queue events (for real-time updates)
const queueEvents = new QueueEvents('cluster-operations', { connection });

queueEvents.on('completed', ({ jobId, returnvalue }) => {
  // Notify via WebSocket
  broadcastToClients({ type: 'job:completed', jobId, result: returnvalue });
});

queueEvents.on('progress', ({ jobId, data }) => {
  broadcastToClients({ type: 'job:progress', jobId, progress: data });
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  broadcastToClients({ type: 'job:failed', jobId, reason: failedReason });
});
```

### Flow (Parent-Child Jobs)

```typescript
import { FlowProducer } from 'bullmq';

const flow = new FlowProducer({ connection });

// Parent job waits for all children
await flow.add({
  name: 'deploy-cluster',
  queueName: 'cluster-operations',
  data: { clusterId: 'abc' },
  children: [
    { name: 'provision-network', queueName: 'infra', data: { vpcId: 'vpc-1' } },
    { name: 'provision-storage', queueName: 'infra', data: { size: '100Gi' } },
    { name: 'provision-nodes', queueName: 'infra', data: { count: 3 } },
  ],
});
```

### Common Pitfalls
- **`maxRetriesPerRequest: null`**: MUST be set on the Redis connection. BullMQ requires this.
- **Separate connections**: Use separate Redis connections for Queue, Worker, and QueueEvents.
- **Graceful shutdown**: Call `worker.close()` and `queue.close()` on process exit.
- **Job serialization**: Job data must be JSON-serializable. No functions, Dates (use ISO strings), etc.
- **Stalled jobs**: Configure `stalledInterval` and `lockDuration` for long-running jobs.

### Best Practices
- Use `FlowProducer` for parent-child job dependencies
- Implement exponential backoff for retries
- Use `removeOnComplete` and `removeOnFail` to prevent Redis memory bloat
- Use `QueueEvents` for real-time progress tracking via WebSockets
- Run workers in separate processes for isolation and scaling
- Use `sandboxed` processors for CPU-intensive jobs

---

# Data Stack

---

## 13. PostgreSQL 17

| Field | Value |
|-------|-------|
| **Latest Version** | `17.7` (patch), `18.1` also released |
| **Released** | September 26, 2024 (17.0) |
| **Docs** | https://www.postgresql.org/docs/17/ |
| **Docker** | `postgres:17-alpine` |

### Key Features in PG17
- Incremental backups with `pg_basebackup --incremental`
- Enhanced SQL/JSON support (JSON_TABLE, JSON_QUERY, JSON_VALUE, etc.)
- Logical replication improvements (failover slots)
- COPY performance improvements (up to 2x faster)
- MERGE improvements with RETURNING clause
- Identity columns enhancements

### Row-Level Security (RLS)

```sql
-- Enable RLS on a table
ALTER TABLE clusters ENABLE ROW LEVEL SECURITY;
-- Force RLS for table owner too
ALTER TABLE clusters FORCE ROW LEVEL SECURITY;

-- Create policies
-- Tenants can only see their own clusters
CREATE POLICY tenant_isolation ON clusters
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Admins can see all clusters
CREATE POLICY admin_access ON clusters
  FOR ALL
  TO admin_role
  USING (true);

-- Read-only policy for viewers
CREATE POLICY viewer_read ON clusters
  FOR SELECT
  TO viewer_role
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Set tenant context per request (from Fastify middleware)
-- SET LOCAL app.tenant_id = 'uuid-here';  -- Scoped to transaction
```

#### RLS in Application Code (Drizzle/Fastify)

```typescript
// Fastify hook to set tenant context
app.addHook('preHandler', async (request, reply) => {
  if (request.user?.tenantId) {
    await app.db.execute(sql`SET LOCAL app.tenant_id = ${request.user.tenantId}`);
  }
});
```

### Table Partitioning

```sql
-- Range partitioning for time-series data (logs, metrics, events)
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE events_2026_01 PARTITION OF events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE events_2026_02 PARTITION OF events
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Auto-create partitions with pg_partman extension
CREATE EXTENSION pg_partman;
SELECT create_parent(
  p_parent_table := 'public.events',
  p_control := 'created_at',
  p_type := 'range',
  p_interval := '1 month',
  p_premake := 3  -- Create 3 months ahead
);
```

### JSONB Operations

```sql
-- Store flexible cluster config
CREATE TABLE clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'
);

-- Query nested JSONB
SELECT name, config->>'kubeVersion' AS version
FROM clusters
WHERE config->'features' @> '{"gpu": true}';

-- Update nested JSONB
UPDATE clusters
SET config = jsonb_set(config, '{autoscaling,maxNodes}', '10')
WHERE id = 'cluster-uuid';

-- JSONB indexes
CREATE INDEX idx_clusters_config_gin ON clusters USING GIN (config);
CREATE INDEX idx_clusters_gpu ON clusters ((config->'features'->>'gpu'));
```

### Full-Text Search

```sql
-- Add tsvector column
ALTER TABLE logs ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', message)) STORED;

-- Create GIN index
CREATE INDEX idx_logs_search ON logs USING GIN (search_vector);

-- Search
SELECT * FROM logs
WHERE search_vector @@ plainto_tsquery('english', 'kubernetes pod crash restart')
ORDER BY ts_rank(search_vector, plainto_tsquery('english', 'kubernetes pod crash restart')) DESC
LIMIT 50;

-- Phrase search
SELECT * FROM logs
WHERE search_vector @@ phraseto_tsquery('english', 'out of memory');

-- Weighted search (title matches rank higher)
SELECT *, ts_rank(
  setweight(to_tsvector(title), 'A') || setweight(to_tsvector(body), 'B'),
  query
) AS rank
FROM documents, plainto_tsquery('english', 'search terms') query
WHERE search_vector @@ query
ORDER BY rank DESC;
```

### Common Pitfalls
- **RLS and superusers**: Superusers bypass RLS. Use `FORCE ROW LEVEL SECURITY` for owner.
- **RLS performance**: Add indexes on columns used in RLS policies.
- **Partition pruning**: Ensure queries include the partition key in WHERE clause.
- **JSONB vs JSON**: Always use `JSONB` (binary, indexable). Never use `JSON` for querying.
- **Connection limits**: PG default is 100 connections. Use PgBouncer for connection pooling.

### Best Practices
- Use RLS for multi-tenant isolation — safer than application-level filtering
- Partition time-series tables by time range for query performance and retention
- Use `GIN` indexes for JSONB and full-text search
- Use `pgcrypto` for `gen_random_uuid()` or use `uuid-ossp`
- Implement connection pooling with PgBouncer (transaction mode)
- Use `pg_stat_statements` extension for query performance monitoring

---

## 14. TimescaleDB

| Field | Value |
|-------|-------|
| **Latest Version** | `2.x` (extension for PostgreSQL) |
| **Cloud** | Tiger Data (formerly Timescale Cloud) |
| **Docs** | https://docs.timescale.com |
| **Docker** | `timescale/timescaledb:latest-pg17` |

### Installation

```sql
-- As PostgreSQL extension
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

### Hypertable Creation

```sql
-- Create regular table first
CREATE TABLE metrics (
  time        TIMESTAMPTZ NOT NULL,
  cluster_id  UUID NOT NULL,
  node_id     UUID,
  metric_name TEXT NOT NULL,
  value       DOUBLE PRECISION NOT NULL,
  labels      JSONB
);

-- Convert to hypertable (auto-partitions by time)
SELECT create_hypertable('metrics', by_range('time', INTERVAL '1 day'));

-- With space partitioning (for multi-tenant)
SELECT create_hypertable('metrics', by_range('time', INTERVAL '1 day'));
SELECT add_dimension('metrics', by_hash('cluster_id', 4));
```

### Continuous Aggregates

```sql
-- Pre-compute hourly averages
CREATE MATERIALIZED VIEW metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  cluster_id,
  metric_name,
  AVG(value) AS avg_value,
  MAX(value) AS max_value,
  MIN(value) AS min_value,
  COUNT(*) AS sample_count
FROM metrics
GROUP BY bucket, cluster_id, metric_name
WITH NO DATA;

-- Refresh policy (auto-refresh)
SELECT add_continuous_aggregate_policy('metrics_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

-- Hierarchical: daily from hourly
CREATE MATERIALIZED VIEW metrics_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', bucket) AS bucket,
  cluster_id,
  metric_name,
  AVG(avg_value) AS avg_value,
  MAX(max_value) AS max_value,
  MIN(min_value) AS min_value,
  SUM(sample_count) AS sample_count
FROM metrics_hourly
GROUP BY 1, 2, 3
WITH NO DATA;
```

### Compression (Columnstore)

```sql
-- Enable compression
ALTER TABLE metrics SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'cluster_id, metric_name',
  timescaledb.compress_orderby = 'time DESC'
);

-- Add compression policy (compress data older than 7 days)
SELECT add_compression_policy('metrics', compress_after => INTERVAL '7 days');

-- Manual compression
SELECT compress_chunk(c) FROM show_chunks('metrics', older_than => INTERVAL '7 days') c;

-- Check compression stats
SELECT * FROM hypertable_compression_stats('metrics');
```

### Retention Policies

```sql
-- Auto-delete data older than 90 days
SELECT add_retention_policy('metrics', drop_after => INTERVAL '90 days');

-- Tiered retention: keep raw 7d, hourly 90d, daily forever
SELECT add_retention_policy('metrics', drop_after => INTERVAL '7 days');
SELECT add_retention_policy('metrics_hourly', drop_after => INTERVAL '90 days');
-- metrics_daily: no retention policy (keep forever)
```

### Common Queries

```sql
-- Last known value per cluster
SELECT DISTINCT ON (cluster_id, metric_name)
  cluster_id, metric_name, time, value
FROM metrics
WHERE time > NOW() - INTERVAL '5 minutes'
ORDER BY cluster_id, metric_name, time DESC;

-- Time-bucketed for charts
SELECT
  time_bucket('5 minutes', time) AS bucket,
  AVG(value) AS avg_cpu,
  MAX(value) AS max_cpu
FROM metrics
WHERE cluster_id = 'abc'
  AND metric_name = 'cpu_usage'
  AND time > NOW() - INTERVAL '1 hour'
GROUP BY bucket
ORDER BY bucket;

-- Gap filling
SELECT
  time_bucket_gapfill('5 minutes', time) AS bucket,
  locf(AVG(value)) AS cpu  -- Last Observation Carried Forward
FROM metrics
WHERE time BETWEEN '2026-01-01' AND '2026-01-02'
  AND metric_name = 'cpu_usage'
GROUP BY bucket;
```

### Common Pitfalls
- **Chunk interval**: Default is 7 days. For high-ingest, use smaller chunks (1 day or less).
- **Compression delays queries on uncompressed recent data**: That's normal — compressed data is faster.
- **Continuous aggregate refresh**: Set `start_offset` larger than `end_offset` to avoid refreshing incomplete data.
- **Hypertable constraints**: Primary keys must include the time column.
- **Don't use UPDATE on compressed chunks**: Decompress first or redesign for append-only.

### Best Practices
- Use continuous aggregates for all dashboard queries (pre-computed)
- Implement tiered storage: raw → hourly → daily with retention policies
- Compress data aggressively (10-20x compression typical for metrics)
- Use `segmentby` on columns you filter by most (cluster_id, metric_name)
- Monitor chunk sizes with `SELECT * FROM timescaledb_information.chunks`

---

## 15. Redis

| Field | Value |
|-------|-------|
| **Recommended Version** | `7.4+` |
| **Node.js Client** | `ioredis` (recommended) or `redis` |
| **Docs** | https://redis.io/docs |
| **Docker** | `redis:7-alpine` |

### Installation

```bash
npm install ioredis
npm install -D @types/ioredis
```

### Connection Pooling

```typescript
import IORedis from 'ioredis';

// Single connection (for pub/sub)
const redis = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  enableReadyCheck: true,
  lazyConnect: false,
});

// Cluster mode
const cluster = new IORedis.Cluster([
  { host: 'redis-node-1', port: 6379 },
  { host: 'redis-node-2', port: 6379 },
  { host: 'redis-node-3', port: 6379 },
], {
  redisOptions: { password: process.env.REDIS_PASSWORD },
  scaleReads: 'slave',  // Read from replicas
});
```

### Pub/Sub for Real-Time Events

```typescript
// Publisher (in API/worker)
const publisher = new IORedis(process.env.REDIS_URL!);

async function publishClusterEvent(event: ClusterEvent) {
  await publisher.publish('cluster:events', JSON.stringify(event));
  // Channel-specific
  await publisher.publish(`cluster:${event.clusterId}:status`, JSON.stringify(event));
}

// Subscriber (in WebSocket server)
const subscriber = new IORedis(process.env.REDIS_URL!);

subscriber.subscribe('cluster:events', (err, count) => {
  console.log(`Subscribed to ${count} channels`);
});

subscriber.on('message', (channel, message) => {
  const event = JSON.parse(message);
  // Broadcast to connected WebSocket clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
});

// Pattern subscribe
subscriber.psubscribe('cluster:*:status');
subscriber.on('pmessage', (pattern, channel, message) => {
  const clusterId = channel.split(':')[1];
  // Route to specific cluster subscribers
});
```

### Caching Patterns

```typescript
// Cache-aside pattern
async function getCluster(id: string): Promise<Cluster> {
  const cached = await redis.get(`cluster:${id}`);
  if (cached) return JSON.parse(cached);

  const cluster = await db.query.clusters.findFirst({ where: eq(clusters.id, id) });
  if (cluster) {
    await redis.setex(`cluster:${id}`, 300, JSON.stringify(cluster)); // 5 min TTL
  }
  return cluster;
}

// Write-through invalidation
async function updateCluster(id: string, data: Partial<Cluster>) {
  await db.update(clusters).set(data).where(eq(clusters.id, id));
  await redis.del(`cluster:${id}`);                    // Invalidate cache
  await redis.del('clusters:list');                     // Invalidate list cache
  await publisher.publish('cluster:events', JSON.stringify({ type: 'updated', clusterId: id }));
}

// Hash for structured data
await redis.hset(`cluster:${id}:metrics`, {
  cpu: '45.2',
  memory: '72.8',
  pods: '142',
  lastUpdated: Date.now().toString(),
});
const metrics = await redis.hgetall(`cluster:${id}:metrics`);
```

### Session & Rate Limiting

```typescript
// Rate limiting with Redis
async function rateLimit(key: string, maxRequests: number, windowSec: number): Promise<boolean> {
  const current = await redis.incr(`ratelimit:${key}`);
  if (current === 1) {
    await redis.expire(`ratelimit:${key}`, windowSec);
  }
  return current <= maxRequests;
}

// Distributed lock (for cluster operations)
async function acquireLock(key: string, ttlMs: number): Promise<string | null> {
  const lockId = crypto.randomUUID();
  const acquired = await redis.set(`lock:${key}`, lockId, 'PX', ttlMs, 'NX');
  return acquired ? lockId : null;
}
```

### Common Pitfalls
- **Pub/Sub connections**: Subscriber connections can't be used for other commands. Use separate connections.
- **`maxRetriesPerRequest: null`**: Required for BullMQ, but use a number for general caching.
- **JSON serialization**: Redis stores strings. Always `JSON.stringify/parse`.
- **Memory limits**: Set `maxmemory` and `maxmemory-policy` (e.g., `allkeys-lru`).
- **Key expiration**: Always set TTL on cache keys to prevent unbounded memory growth.

### Best Practices
- Use separate Redis connections for: caching, pub/sub, BullMQ
- Implement key prefixing: `voyager:cluster:{id}`, `voyager:cache:{key}`
- Use Redis Streams for ordered event logs (alternative to pub/sub)
- Use pipelining for batch operations: `redis.pipeline().set(...).set(...).exec()`
- Monitor with `redis-cli INFO memory` and `SLOWLOG`

---

## 16. OpenSearch

| Field | Value |
|-------|-------|
| **Latest Version** | `3.4.0` (Dec 2025), `2.19.x` (LTS maintenance) |
| **Docs** | https://docs.opensearch.org |
| **GitHub** | https://github.com/opensearch-project/OpenSearch |
| **Docker** | `opensearchproject/opensearch:3.4.0` |

### Index Templates for Logs

```json
PUT _index_template/voyager-logs
{
  "index_patterns": ["voyager-logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "index.codec": "zstd",
      "index.refresh_interval": "5s"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "cluster_id": { "type": "keyword" },
        "namespace": { "type": "keyword" },
        "pod_name": { "type": "keyword" },
        "container": { "type": "keyword" },
        "level": { "type": "keyword" },
        "message": { "type": "text", "analyzer": "standard" },
        "labels": { "type": "object", "enabled": true }
      }
    }
  },
  "priority": 100,
  "composed_of": ["voyager-common-settings"]
}
```

### ISM (Index State Management) Policies

```json
PUT _plugins/_ism/policies/voyager-logs-lifecycle
{
  "policy": {
    "description": "Manage log index lifecycle",
    "default_state": "hot",
    "states": [
      {
        "name": "hot",
        "actions": [
          {
            "rollover": {
              "min_size": "30gb",
              "min_index_age": "1d"
            }
          }
        ],
        "transitions": [
          { "state_name": "warm", "conditions": { "min_index_age": "3d" } }
        ]
      },
      {
        "name": "warm",
        "actions": [
          { "replica_count": { "number_of_replicas": 0 } },
          { "force_merge": { "max_num_segments": 1 } }
        ],
        "transitions": [
          { "state_name": "cold", "conditions": { "min_index_age": "30d" } }
        ]
      },
      {
        "name": "cold",
        "actions": [
          { "read_only": {} }
        ],
        "transitions": [
          { "state_name": "delete", "conditions": { "min_index_age": "90d" } }
        ]
      },
      {
        "name": "delete",
        "actions": [{ "delete": {} }]
      }
    ],
    "ism_template": [
      { "index_patterns": ["voyager-logs-*"], "priority": 100 }
    ]
  }
}
```

### Search Queries for Logs

```json
// Full-text search with filters
POST voyager-logs-*/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "message": "OOMKilled" } }
      ],
      "filter": [
        { "term": { "cluster_id": "prod-us-east" } },
        { "term": { "level": "error" } },
        { "range": {
          "@timestamp": {
            "gte": "now-1h",
            "lte": "now"
          }
        }}
      ]
    }
  },
  "sort": [{ "@timestamp": "desc" }],
  "size": 100,
  "highlight": {
    "fields": { "message": {} }
  }
}

// Aggregation: error count by namespace
POST voyager-logs-*/_search
{
  "size": 0,
  "query": {
    "bool": {
      "filter": [
        { "term": { "level": "error" } },
        { "range": { "@timestamp": { "gte": "now-24h" } } }
      ]
    }
  },
  "aggs": {
    "by_namespace": {
      "terms": { "field": "namespace", "size": 20 },
      "aggs": {
        "over_time": {
          "date_histogram": {
            "field": "@timestamp",
            "calendar_interval": "hour"
          }
        }
      }
    }
  }
}
```

### Node.js Client

```typescript
import { Client } from '@opensearch-project/opensearch';

const client = new Client({
  node: process.env.OPENSEARCH_URL || 'https://localhost:9200',
  auth: { username: 'admin', password: process.env.OPENSEARCH_PASSWORD! },
  ssl: { rejectUnauthorized: false },  // Dev only
});

// Search
const { body } = await client.search({
  index: 'voyager-logs-*',
  body: {
    query: { bool: { must: [{ match: { message: query } }], filter: filters } },
    sort: [{ '@timestamp': 'desc' }],
    size: limit,
  },
});
```

### Common Pitfalls
- **OpenSearch 3.x vs 2.x**: v3 has breaking changes. Choose based on stability needs (2.19.x for LTS).
- **Mapping explosion**: Use `"enabled": false` for objects you only store, not search.
- **Shard count**: Don't over-shard. ~30-50GB per shard is ideal.
- **Refresh interval**: Default 1s is aggressive for heavy ingest. Use 5-30s for log ingestion.
- **Date format**: Always use ISO 8601 format for `@timestamp`.

### Best Practices
- Use ISM policies for automated index lifecycle management
- Implement index rollover for predictable shard sizes
- Use `keyword` type for fields you filter/aggregate on, `text` for full-text search
- Use index aliases for zero-downtime index migrations
- Bulk index logs (don't send one-by-one): use `_bulk` API
- Use data streams for append-only time-series data (logs, metrics)

---

# Infrastructure

---

## 17. Docker

| Field | Value |
|-------|-------|
| **Docs** | https://docs.docker.com |
| **Best Practices** | https://docs.docker.com/build/building/best-practices/ |

### Multi-Stage Build for Node.js Monorepo

```dockerfile
# Dockerfile (monorepo root)

# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --omit=dev

# Stage 2: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=packages/api

# Stage 3: Production
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Security: non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 fastify
USER fastify

COPY --from=builder --chown=fastify:nodejs /app/packages/api/dist ./dist
COPY --from=builder --chown=fastify:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=fastify:nodejs /app/packages/api/package.json ./

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
```

### Next.js Dockerfile

```dockerfile
FROM node:22-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

### docker-compose.yml for Development

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: timescale/timescaledb:latest-pg17
    environment:
      POSTGRES_DB: voyager
      POSTGRES_USER: voyager
      POSTGRES_PASSWORD: localdev
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U voyager']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    ports:
      - '6379:6379'
    volumes:
      - redisdata:/data

  opensearch:
    image: opensearchproject/opensearch:2.19.1
    environment:
      - discovery.type=single-node
      - OPENSEARCH_INITIAL_ADMIN_PASSWORD=Admin123!
      - 'OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m'
    ports:
      - '9200:9200'
    volumes:
      - osdata:/usr/share/opensearch/data

  opensearch-dashboards:
    image: opensearchproject/opensearch-dashboards:2.19.1
    ports:
      - '5601:5601'
    environment:
      OPENSEARCH_HOSTS: '["https://opensearch:9200"]'

  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
      target: builder
    command: npx tsx watch packages/api/src/index.ts
    volumes:
      - .:/app
      - /app/node_modules
    ports:
      - '4000:4000'
    environment:
      DATABASE_URL: postgresql://voyager:localdev@postgres:5432/voyager
      REDIS_URL: redis://redis:6379
      OPENSEARCH_URL: https://opensearch:9200
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }

volumes:
  pgdata:
  redisdata:
  osdata:
```

### Common Pitfalls
- **Layer caching**: Copy `package.json` and `package-lock.json` BEFORE source code for better caching.
- **`.dockerignore`**: Always exclude `node_modules`, `.next`, `.git`, `*.md`, `.env`.
- **Alpine images**: Some native modules fail on Alpine. Use `node:22-slim` (Debian) as fallback.
- **Multi-stage `--from`**: Reference specific stage names, not indices, for clarity.
- **Health checks**: Always include health checks for orchestrator integration.

### Best Practices
- Use multi-stage builds to keep production images < 200MB
- Run as non-root user in production
- Use `.dockerignore` aggressively
- Pin base image versions (not `latest`)
- Use `npm ci` instead of `npm install` in Docker builds
- For Next.js, enable `output: 'standalone'` in `next.config.js`

---

## 18. Helm Charts

| Field | Value |
|-------|-------|
| **Helm Version** | `3.x` |
| **Docs** | https://helm.sh/docs/ |
| **Chart Spec** | https://helm.sh/docs/topics/charts/ |

### Chart Structure

```
voyager-agent/
├── Chart.yaml
├── values.yaml
├── values-production.yaml
├── templates/
│   ├── _helpers.tpl
│   ├── daemonset.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── serviceaccount.yaml
│   ├── clusterrole.yaml
│   ├── clusterrolebinding.yaml
│   ├── service.yaml
│   └── NOTES.txt
└── charts/                   # Sub-charts
```

### Chart.yaml

```yaml
apiVersion: v2
name: voyager-agent
description: Voyager K8s monitoring agent (DaemonSet)
type: application
version: 0.1.0
appVersion: "1.0.0"
keywords:
  - kubernetes
  - monitoring
  - observability
maintainers:
  - name: Voyager Team
    email: team@voyager.dev
```

### values.yaml Patterns

```yaml
# values.yaml
global:
  imageRegistry: ""
  imagePullSecrets: []

image:
  repository: voyager/agent
  tag: ""  # Defaults to .Chart.AppVersion
  pullPolicy: IfNotPresent

# DaemonSet-specific
daemonSet:
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
  tolerations:
    - operator: Exists  # Run on ALL nodes including control-plane
  nodeSelector: {}
  priorityClassName: system-node-critical

# Agent config
agent:
  logLevel: info
  collectionInterval: 30s
  apiEndpoint: ""  # Voyager API URL
  features:
    metrics: true
    logs: true
    events: true

# Resources
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 256Mi

# RBAC
rbac:
  create: true
  rules:
    - apiGroups: [""]
      resources: ["pods", "nodes", "services", "endpoints", "namespaces"]
      verbs: ["get", "list", "watch"]
    - apiGroups: ["apps"]
      resources: ["deployments", "daemonsets", "replicasets", "statefulsets"]
      verbs: ["get", "list", "watch"]
    - apiGroups: ["batch"]
      resources: ["jobs", "cronjobs"]
      verbs: ["get", "list", "watch"]

serviceAccount:
  create: true
  name: ""
  annotations: {}
```

### DaemonSet Template

```yaml
# templates/daemonset.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: {{ include "voyager-agent.fullname" . }}
  labels:
    {{- include "voyager-agent.labels" . | nindent 4 }}
spec:
  selector:
    matchLabels:
      {{- include "voyager-agent.selectorLabels" . | nindent 6 }}
  updateStrategy:
    {{- toYaml .Values.daemonSet.updateStrategy | nindent 4 }}
  template:
    metadata:
      labels:
        {{- include "voyager-agent.selectorLabels" . | nindent 8 }}
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
    spec:
      serviceAccountName: {{ include "voyager-agent.serviceAccountName" . }}
      {{- with .Values.global.imagePullSecrets }}
      imagePullSecrets: {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.daemonSet.priorityClassName }}
      priorityClassName: {{ . }}
      {{- end }}
      containers:
        - name: agent
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          env:
            - name: NODE_NAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
            - name: VOYAGER_API_ENDPOINT
              value: {{ .Values.agent.apiEndpoint | quote }}
            - name: VOYAGER_API_KEY
              valueFrom:
                secretKeyRef:
                  name: {{ include "voyager-agent.fullname" . }}
                  key: api-key
          envFrom:
            - configMapRef:
                name: {{ include "voyager-agent.fullname" . }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          volumeMounts:
            - name: proc
              mountPath: /host/proc
              readOnly: true
            - name: sys
              mountPath: /host/sys
              readOnly: true
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
      {{- with .Values.daemonSet.tolerations }}
      tolerations: {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.daemonSet.nodeSelector }}
      nodeSelector: {{- toYaml . | nindent 8 }}
      {{- end }}
      volumes:
        - name: proc
          hostPath:
            path: /proc
        - name: sys
          hostPath:
            path: /sys
```

### RBAC Templates

```yaml
# templates/clusterrole.yaml
{{- if .Values.rbac.create }}
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: {{ include "voyager-agent.fullname" . }}
  labels: {{- include "voyager-agent.labels" . | nindent 4 }}
rules:
  {{- toYaml .Values.rbac.rules | nindent 2 }}
{{- end }}

# templates/clusterrolebinding.yaml
{{- if .Values.rbac.create }}
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: {{ include "voyager-agent.fullname" . }}
  labels: {{- include "voyager-agent.labels" . | nindent 4 }}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: {{ include "voyager-agent.fullname" . }}
subjects:
  - kind: ServiceAccount
    name: {{ include "voyager-agent.serviceAccountName" . }}
    namespace: {{ .Release.Namespace }}
{{- end }}
```

### Helpers Template

```yaml
# templates/_helpers.tpl
{{- define "voyager-agent.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "voyager-agent.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "voyager-agent.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/name: {{ include "voyager-agent.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "voyager-agent.selectorLabels" -}}
app.kubernetes.io/name: {{ include "voyager-agent.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "voyager-agent.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "voyager-agent.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
```

### Common Pitfalls
- **Indentation**: YAML indentation errors are the #1 Helm issue. Use `nindent` helper.
- **Checksum annotations**: Use config checksum annotations to trigger pod restarts on config changes.
- **Release names**: Keep names short — K8s has 63-char limits on resource names.
- **Values defaults**: Always provide sensible defaults in `values.yaml`.
- **Secret management**: Never put actual secrets in `values.yaml`. Use `ExternalSecrets` or `SealedSecrets`.

### Best Practices
- Use `helm lint` and `helm template` in CI before deploying
- Implement `helm test` hooks for smoke tests
- Use `values-production.yaml` for environment-specific overrides
- Always include RBAC templates with `rbac.create` toggle
- Add pod disruption budgets for production deployments
- Use `helm-docs` to auto-generate documentation from values.yaml

---

## 19. GitHub Actions

| Field | Value |
|-------|-------|
| **Docs** | https://docs.github.com/en/actions |
| **Marketplace** | https://github.com/marketplace?type=actions |

### CI/CD for Monorepo

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      api: ${{ steps.filter.outputs.api }}
      dashboard: ${{ steps.filter.outputs.dashboard }}
      shared: ${{ steps.filter.outputs.shared }}
      helm: ${{ steps.filter.outputs.helm }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            api:
              - 'packages/api/**'
              - 'packages/shared/**'
            dashboard:
              - 'packages/dashboard/**'
              - 'packages/shared/**'
            shared:
              - 'packages/shared/**'
            helm:
              - 'charts/**'

  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test-api:
    needs: [changes, lint-and-type-check]
    if: needs.changes.outputs.api == 'true'
    runs-on: ubuntu-latest
    services:
      postgres:
        image: timescale/timescaledb:latest-pg17
        env:
          POSTGRES_DB: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npm run test --workspace=packages/api
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
          REDIS_URL: redis://localhost:6379

  test-dashboard:
    needs: [changes, lint-and-type-check]
    if: needs.changes.outputs.dashboard == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npm run test --workspace=packages/dashboard

  build-and-push:
    needs: [test-api, test-dashboard]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      matrix:
        package: [api, dashboard]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: packages/${{ matrix.package }}/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/${{ matrix.package }}:${{ github.sha }}
            ghcr.io/${{ github.repository }}/${{ matrix.package }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: [build-and-push]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-helm@v4
      - uses: azure/setup-kubectl@v4
      - run: |
          helm upgrade --install voyager-api ./charts/voyager-api \
            --namespace voyager --create-namespace \
            --set image.tag=${{ github.sha }} \
            --values charts/voyager-api/values-production.yaml
```

### Build Caching Strategy

```yaml
# Efficient caching with actions/cache
- uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      ${{ github.workspace }}/.next/cache
    key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**/*.ts', '**/*.tsx') }}
    restore-keys: |
      ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-
      ${{ runner.os }}-nextjs-

# Docker layer caching with GitHub Actions Cache
- uses: docker/build-push-action@v6
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

### Reusable Workflows

```yaml
# .github/workflows/reusable-test.yml
name: Reusable Test Workflow
on:
  workflow_call:
    inputs:
      package:
        required: true
        type: string
      node-version:
        required: false
        type: string
        default: '22'
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run test --workspace=packages/${{ inputs.package }}
```

### Common Pitfalls
- **Path filters**: Use `dorny/paths-filter` for monorepo — built-in `paths` only triggers/skips entire workflows.
- **Cache keys**: Include `hashFiles('**/package-lock.json')` for dependency caching.
- **Concurrency**: Always set `concurrency` with `cancel-in-progress` for PR workflows.
- **Secrets in PRs**: `GITHUB_TOKEN` has reduced permissions in fork PRs.
- **Service containers**: Services run on the runner host network. Use `localhost` to connect.

### Best Practices
- Use path-based filtering to only run affected package tests
- Cache aggressively: npm cache, Next.js cache, Docker layers
- Use `concurrency` groups to cancel stale runs
- Use matrix strategy for building multiple packages
- Use reusable workflows to DRY common patterns
- Use GitHub Environments for deployment approvals
- Run linting in parallel with tests for faster feedback

---

# Auth

---

## 20. Clerk

| Field | Value |
|-------|-------|
| **Latest Version** | `6.37.2` (`@clerk/nextjs`), `2.6.20` (`@clerk/fastify`) |
| **Docs** | https://clerk.com/docs |
| **Dashboard** | https://dashboard.clerk.com |

### Installation

```bash
# Next.js
npm install @clerk/nextjs

# Fastify
npm install @clerk/fastify
```

### Next.js Integration

#### Environment Variables
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

#### Root Layout
```tsx
// app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

#### Middleware (protect routes)
```tsx
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();  // Redirects to sign-in if not authenticated
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

#### Server-Side Auth
```tsx
// In Server Components
import { currentUser, auth } from '@clerk/nextjs/server';

export default async function DashboardPage() {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await currentUser();
  return <div>Welcome, {user?.firstName}</div>;
}

// In Route Handlers
import { auth } from '@clerk/nextjs/server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  // ...
}
```

#### Client-Side Auth
```tsx
'use client';
import { useUser, useAuth, UserButton, SignInButton, SignedIn, SignedOut } from '@clerk/nextjs';

function Header() {
  return (
    <header>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal" />
      </SignedOut>
    </header>
  );
}

function ClusterActions() {
  const { has } = useAuth();
  const canDelete = has?.({ role: 'org:admin' }) || has?.({ permission: 'org:cluster:delete' });

  return canDelete ? <DeleteButton /> : null;
}
```

### Fastify Middleware

```typescript
// server/plugins/auth.ts
import { clerkPlugin, getAuth } from '@clerk/fastify';
import fp from 'fastify-plugin';

export default fp(async (app) => {
  await app.register(clerkPlugin, {
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY!,
    secretKey: process.env.CLERK_SECRET_KEY!,
  });

  // Global auth hook
  app.addHook('preHandler', async (request, reply) => {
    const auth = getAuth(request);
    request.auth = auth;  // Attach to request
  });
});

// In tRPC context
import { getAuth } from '@clerk/fastify';

export function createContext({ req, res }: CreateFastifyContextOptions) {
  const auth = getAuth(req);
  return { req, res, auth, userId: auth.userId, orgId: auth.orgId };
}
```

### Webhook Events

```typescript
// app/api/webhooks/clerk/route.ts
import { Webhook } from 'svix';
import { headers } from 'next/headers';

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET!;
  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id')!;
  const svixTimestamp = headerPayload.get('svix-timestamp')!;
  const svixSignature = headerPayload.get('svix-signature')!;

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  const event = wh.verify(body, {
    'svix-id': svixId,
    'svix-timestamp': svixTimestamp,
    'svix-signature': svixSignature,
  }) as WebhookEvent;

  switch (event.type) {
    case 'user.created':
      await db.insert(users).values({
        clerkId: event.data.id,
        email: event.data.email_addresses[0]?.email_address,
        name: `${event.data.first_name} ${event.data.last_name}`,
      });
      break;
    case 'organization.created':
      await db.insert(tenants).values({
        clerkOrgId: event.data.id,
        name: event.data.name,
      });
      break;
    case 'organizationMembership.created':
      // Sync role to local DB
      break;
  }

  return new Response('OK', { status: 200 });
}
```

### RBAC with Organizations

```typescript
// Define roles in Clerk Dashboard:
// org:admin — Full access
// org:operator — Can deploy, scale, restart
// org:viewer — Read-only

// Check permissions in middleware/components
import { auth } from '@clerk/nextjs/server';

export default clerkMiddleware(async (auth, request) => {
  // Admin-only routes
  if (request.nextUrl.pathname.startsWith('/dashboard/settings')) {
    const { orgRole } = await auth();
    if (orgRole !== 'org:admin') {
      return new Response('Forbidden', { status: 403 });
    }
  }
});

// In tRPC middleware
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.auth.orgRole !== 'org:admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next();
});

// Custom permissions (defined in Clerk Dashboard)
const canDeployProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.auth.has({ permission: 'org:cluster:deploy' })) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});
```

### Common Pitfalls
- **Middleware matcher**: Must include all routes you want Clerk to process. The regex is tricky — copy from docs.
- **Webhook verification**: Always verify Svix signatures. Don't skip in production.
- **`auth()` is async in Next.js 16**: Was sync in earlier versions. Now must `await`.
- **Session tokens**: Clerk session tokens expire. Use `getToken()` for API calls to your backend.
- **Organization context**: User must actively select an organization. Check `orgId` is not null.

### Best Practices
- Use **Clerk Organizations** for multi-tenancy (maps to tenants/workspaces)
- Sync user/org data to your DB via webhooks for relational queries
- Use **custom permissions** over roles for fine-grained RBAC
- Pass Clerk's JWT to Fastify backend and verify with `@clerk/fastify`
- Implement **Sign In with SAML/SSO** for enterprise customers
- Use `auth().protect()` in middleware for automatic redirects
- Cache organization membership checks with short TTL

---

# Version Summary

| Technology | Version | Package |
|-----------|---------|---------|
| Next.js | 16.1.6 | `next` |
| React | 19.2.4 | `react` |
| Tailwind CSS | 4.1.18 | `tailwindcss` |
| shadcn/ui | Latest CLI | `shadcn@latest` |
| TanStack Table | 8.21.3 | `@tanstack/react-table` |
| TanStack Query | 5.90.20 | `@tanstack/react-query` |
| Recharts | 3.7.0 | `recharts` |
| Zustand | 5.0.11 | `zustand` |
| Fastify | 5.7.4 | `fastify` |
| tRPC | 11.9.0 | `@trpc/server` |
| Drizzle ORM | 0.45.1 | `drizzle-orm` |
| Drizzle Kit | 0.31.8 | `drizzle-kit` |
| BullMQ | 5.67.2 | `bullmq` |
| PostgreSQL | 17.7 | `postgres:17-alpine` |
| TimescaleDB | 2.x ext | `timescale/timescaledb:latest-pg17` |
| Redis | 7.4+ | `redis:7-alpine` |
| OpenSearch | 3.4.0 / 2.19.x | `opensearchproject/opensearch` |
| Clerk (Next.js) | 6.37.2 | `@clerk/nextjs` |
| Clerk (Fastify) | 2.6.20 | `@clerk/fastify` |

---

# Quick Links

| Category | Resource | URL |
|----------|----------|-----|
| **Next.js** | App Router Docs | https://nextjs.org/docs/app |
| **React** | Reference | https://react.dev/reference/react |
| **Tailwind** | Theme Variables | https://tailwindcss.com/docs/theme |
| **shadcn/ui** | Components | https://ui.shadcn.com/docs/components |
| **TanStack Table** | API | https://tanstack.com/table/latest/docs/api/core/table |
| **TanStack Query** | API | https://tanstack.com/query/latest/docs/framework/react/reference/useQuery |
| **Recharts** | API | https://recharts.org/en-US/api |
| **Zustand** | Guide | https://zustand.docs.pmnd.rs |
| **Fastify** | Reference | https://fastify.dev/docs/latest/Reference/ |
| **tRPC** | Server Docs | https://trpc.io/docs/server |
| **Drizzle** | PostgreSQL | https://orm.drizzle.team/docs/get-started-postgresql |
| **BullMQ** | Guide | https://docs.bullmq.io |
| **PostgreSQL** | Manual | https://www.postgresql.org/docs/17/ |
| **TimescaleDB** | Docs | https://docs.timescale.com |
| **Redis** | Commands | https://redis.io/commands |
| **OpenSearch** | Docs | https://docs.opensearch.org/latest/ |
| **Helm** | Charts | https://helm.sh/docs/topics/charts/ |
| **GitHub Actions** | Docs | https://docs.github.com/en/actions |
| **Clerk** | Next.js | https://clerk.com/docs/nextjs/overview |

---

*Last verified: 2026-02-04. All versions from npm registry & official sources.*
