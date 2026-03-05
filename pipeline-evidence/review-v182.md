# 📋 Code Review — v182 Design Tokens + Shared Components

📊 ציון: 6/10 — CHANGES_REQUESTED

🔍 סיכום: Shared components are well-structured with proper TypeScript types, but two blocking issues prevent approval: undefined CSS variables and a services page regression to mock data.

## 📝 ממצאים

### 🔴 CRITICAL (2):

**[CRITICAL] globals.css — Missing CSS variable definitions**
`--color-surface-secondary` and `--color-brand` are referenced 20+ times across all 5 shared components (DataTable, EmptyState, MetricCard, StatusBadge, PageHeader) but are **never defined** in globals.css. This means backgrounds, accents, and hover states will render as transparent/invisible.
Fix: Add `--color-surface-secondary` and `--color-brand` to the `:root` block in globals.css, mapping to appropriate values (e.g., `--color-surface-secondary: var(--elevated);` and `--color-brand: var(--color-accent);`).

**[CRITICAL] services/page.tsx:12 — Regression: live data replaced with mock data**
The entire tRPC integration (`trpc.clusters.list`, `trpc.services.list`, cluster selector) was removed and replaced with a hardcoded `mockServices` array. This is a functional regression — the page no longer shows real data.
Fix: Restore tRPC queries and use the new shared components with live data, not mock data.

### 🟠 HIGH (1):

**[HIGH] shared/index.ts — Dual component implementations without migration**
Old `@/components/PageHeader` and `@/components/DataTable` are still imported by 12+ pages. New `shared/` versions are separate components with different APIs. No migration strategy documented.
Fix: Either migrate all pages to shared/ in this PR, or document the migration plan and add `@deprecated` comments to old components.

### 🟡 MEDIUM (1):

**[MEDIUM] globals.css:71 — Unused surface tokens**
New `--surface-0` through `--surface-3` tokens are defined but none of the shared components use them (they reference `--color-surface-secondary` instead).
Fix: Either use the new tokens in shared components or remove them until needed.

### 🔵 LOW (1):

**[LOW] deployments/page.tsx:5 — Unused EmptyState import**
`EmptyState` is imported but the page uses an inline empty state div instead.
Fix: Either use the `EmptyState` component or remove the import.

## ✅ מה טוב:
- Shared components have excellent TypeScript types with proper generics (DataTable<TData>)
- StatusBadge normaliseStatus() covers common Kubernetes status strings
- MetricCard sparkline implementation is clean and lightweight
- PageHeader breadcrumb pattern is well-designed
- Barrel export in index.ts with proper type re-exports
- All components use CSS variables for theming (when they exist)

## 💡 המלצות:
1. Define a complete design token map before building components that reference them
2. Consider a single PR that migrates ALL pages to shared components instead of dual implementations
3. Add Storybook stories or a visual test page for the shared components
