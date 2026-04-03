---
name: new-page
description: >
  Scaffold a new Next.js page in voyager-platform with the correct directory structure,
  AppLayout wrapper, tRPC hook wiring, loading state, and sidebar navigation entry. Use this
  skill whenever adding a new route to the web app, creating a new page, adding a new section
  to the sidebar, or when the user says "add a page for X", "create the UI for X", "new page",
  "scaffold page", or needs a new top-level route under apps/web/src/app/.
disable-model-invocation: true
---

# Scaffold New Page

Create a new page in the voyager-platform web app following established conventions.

## Required Input

Ask the user for:
1. **Page name** (e.g., "network-policies") — becomes the URL path and directory name
2. **Sidebar label** (e.g., "Network Policies") — display name in navigation
3. **Sidebar icon** — a lucide-react icon name (e.g., `Shield`, `Network`, `Database`)
4. **tRPC router** — which existing router to query, or "none" if static page
5. **Sub-routes?** — whether the page needs nested routes (like clusters/[id]/nodes)

## Files to Create

### 1. Page Component

**Path:** `apps/web/src/app/<page-name>/page.tsx`

```tsx
'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { trpc } from '@/lib/trpc'
import { usePageTitle } from '@/hooks/usePageTitle'

export default function <PageName>Page() {
  usePageTitle('<Sidebar Label>')

  // Replace with actual tRPC query
  const data = trpc.<router>.<procedure>.useQuery()

  return (
    <AppLayout>
      <PageTransition>
        <div className="space-y-6 p-6">
          <Breadcrumbs />
          {/* Page content here */}
        </div>
      </PageTransition>
    </AppLayout>
  )
}
```

**Conventions:**
- Always `'use client'` at the top
- Always wrap in `<AppLayout>` (provides sidebar, topbar, auth guard)
- Always wrap content in `<PageTransition>` (Motion animation)
- Always include `<Breadcrumbs />`
- Always call `usePageTitle()` with the page label
- Use `p-6` padding on the outer content div
- Use `space-y-6` for vertical spacing between sections

### 2. Loading State

**Path:** `apps/web/src/app/<page-name>/loading.tsx`

```tsx
import { ConstellationLoader } from '@/components/animations/ConstellationLoader'

export default function <PageName>Loading() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <ConstellationLoader label="Loading <page label>..." />
    </div>
  )
}
```

### 3. Sidebar Navigation Entry

**Path:** `apps/web/src/config/navigation.ts`

Add to the `navItems` array in the appropriate position:

```tsx
import { <IconName> } from 'lucide-react'

// Add to navItems array (before Settings, which stays last)
{ id: '/<page-name>', label: '<Sidebar Label>', icon: <IconName> },
```

**Positioning rules:**
- Dashboard is always first
- Settings is always last
- New items go between the last feature item and Settings

## Optional: Sub-Route Layout

If the page has nested routes (like clusters/[id]/nodes), also create:

**Path:** `apps/web/src/app/<page-name>/[id]/layout.tsx`

```tsx
'use client'

import { useParams } from 'next/navigation'
import { AppLayout } from '@/components/AppLayout'
import { trpc } from '@/lib/trpc'

export default function <PageName>DetailLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>()
  const detail = trpc.<router>.get.useQuery({ id })

  return (
    <AppLayout>
      <div className="flex flex-col">
        {/* Tab bar or header here */}
        {children}
      </div>
    </AppLayout>
  )
}
```

## tRPC Query Patterns

Choose the right pattern based on data needs:

**Simple list page:**
```tsx
const data = trpc.<router>.list.useQuery()
```

**With refresh interval:**
```tsx
const data = trpc.<router>.list.useQuery(undefined, { refetchInterval: 60000 })
```

**With parameters:**
```tsx
const data = trpc.<router>.list.useQuery({ clusterId, page: 1, pageSize: 50 })
```

**Conditional fetch (depends on another value):**
```tsx
const data = trpc.<router>.get.useQuery(
  { id: selectedId ?? '' },
  { enabled: Boolean(selectedId) }
)
```

**With mutations (optimistic updates):**
```tsx
import { useOptimisticOptions } from '@/hooks/useOptimisticOptions'

const queryKey = [['<router>', 'list'], { type: 'query' }] as const

const deleteMut = trpc.<router>.delete.useMutation(
  useOptimisticOptions<ItemRow[], { id: string }>({
    queryKey,
    updater: (old, vars) => (old ?? []).filter((item) => item.id !== vars.id),
    successMessage: 'Item deleted',
    errorMessage: 'Failed to delete — rolled back',
  }),
)
```

## Checklist

After scaffolding, verify:
- [ ] Page renders at `http://localhost:3000/<page-name>`
- [ ] Sidebar shows the new item with correct icon
- [ ] Loading state displays during data fetch
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] Page title appears in browser tab as "<Label> - Voyager Platform"
