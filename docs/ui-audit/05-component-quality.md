# Component Quality & UX Audit

**Audited:** `apps/web/src/` (all pages, components, hooks, utilities)
**Date:** 2026-03-27
**Auditor:** Automated deep scan (4 parallel agents + manual verification)

---

## Table of Contents

1. [Loading States](#1-loading-states)
2. [Error States](#2-error-states)
3. [Empty States](#3-empty-states)
4. [Optimistic Updates](#4-optimistic-updates)
5. [Toast Notifications](#5-toast-notifications)
6. [Confirm Dialogs](#6-confirm-dialogs)
7. [Micro-Interactions](#7-micro-interactions)
8. [Animation Consistency](#8-animation-consistency)
9. [Data Formatting](#9-data-formatting)
10. [Pagination / Infinite Scroll](#10-pagination--infinite-scroll)
11. [Search / Filter UX](#11-search--filter-ux)
12. [Breadcrumbs & Navigation](#12-breadcrumbs--navigation)
13. [Keyboard Shortcuts](#13-keyboard-shortcuts)
14. [Copy-to-Clipboard](#14-copy-to-clipboard)
15. [Skeleton Consistency](#15-skeleton-consistency)

---

## 1. Loading States

### [P1] Dashboard widgets missing loading state

- **File:** `components/dashboard/widgets/DeploymentListWidget.tsx:15`
- **Issue:** `deploymentsQuery.data` falls back to `[]` with no loading skeleton. When `deploymentsQuery.isLoading` is true, users see "No deployments found" instead of a loading indicator.
- **Expected UX:** Show skeleton rows while `deploymentsQuery.isLoading && deploymentsQuery.data === undefined`.
- **Fix:**
  ```tsx
  // Before line 23
  {deploymentsQuery.isLoading && (
    <div className="space-y-1.5">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="skeleton-shimmer h-10 rounded-lg" />
      ))}
    </div>
  )}
  ```
- **Priority:** P1

### [P2] AlertFeedWidget has no loading skeleton

- **File:** `components/dashboard/widgets/AlertFeedWidget.tsx:11`
- **Issue:** `alertsQuery.isLoading` is never checked. Shows "No active alerts" (the empty state icon) while data is still loading.
- **Expected UX:** Show skeleton rows during initial load, then empty state only after data resolves to empty.
- **Fix:** Add `alertsQuery.isLoading` check before the empty state block (line 20).
- **Priority:** P2

### [P2] PodStatusWidget has no loading skeleton

- **File:** `components/dashboard/widgets/PodStatusWidget.tsx:16-18`
- **Issue:** All values default to `0` via `?? 0` while loading. Users see "Running: 0, Pending: 0, Total: 0" which looks like a real result.
- **Expected UX:** Show shimmer placeholders for the three stat boxes while `liveQuery.isLoading`.
- **Fix:** Wrap stat grid in `liveQuery.isLoading ? <Shimmer /> : <StatGrid />`.
- **Priority:** P2

### [P2] ResourceChartsWidget has no loading skeleton

- **File:** `components/dashboard/widgets/ResourceChartsWidget.tsx:14-15`
- **Issue:** CPU and memory default to `0%` while loading. Chart renders with flat-line data.
- **Expected UX:** Show shimmer placeholders for chart areas during initial load.
- **Fix:** Add `statsQuery.isLoading` check.
- **Priority:** P2

### [P2] ClusterHealthWidget has no loading skeleton

- **File:** `components/dashboard/widgets/ClusterHealthWidget.tsx:38`
- **Issue:** `dbClusters` defaults to `[]` and gauges show `0%` while queries load. Shows "No clusters" text (line 80) which is the empty state, not the loading state.
- **Expected UX:** Show skeleton grid cells for cluster list and shimmer for gauges.
- **Fix:** Check `listQuery.isLoading || statsQuery.isLoading` before rendering content.
- **Priority:** P2

### [P2] StatCardsWidget — combined isLoading masks individual failures

- **File:** `components/dashboard/widgets/StatCardsWidget.tsx:114`
- **Issue:** `isLoading = liveQuery.isLoading && listQuery.isLoading` — this means loading skeleton only shows if BOTH queries are loading. If one finishes fast, skeleton disappears while other data shows as `0`.
- **Expected UX:** `isLoading = listQuery.isLoading || liveQuery.isLoading` (OR, not AND) to keep skeleton until all data is ready.
- **Fix:** Change `&&` to `||` on line 114.
- **Priority:** P2

---

## 2. Error States

### [P1] All 6 dashboard widgets missing error handling

- **Files:**
  - `components/dashboard/widgets/DeploymentListWidget.tsx` — no error check
  - `components/dashboard/widgets/AlertFeedWidget.tsx` — no error check
  - `components/dashboard/widgets/PodStatusWidget.tsx` — no error check
  - `components/dashboard/widgets/ResourceChartsWidget.tsx` — no error check
  - `components/dashboard/widgets/ClusterHealthWidget.tsx` — 3 queries, no error check
  - `components/dashboard/widgets/StatCardsWidget.tsx` — 3 queries, no error check
- **Issue:** If any tRPC query fails, widgets silently show empty/zero data. No error message, no retry button.
- **Expected UX:** Each widget should show a compact inline error state with retry capability: "Failed to load [widget name]. [Retry]"
- **Fix:** For each widget, add a check like:
  ```tsx
  if (query.isError) return (
    <div className="h-full flex flex-col items-center justify-center text-[var(--color-text-dim)] gap-2">
      <AlertTriangle className="h-4 w-4 text-amber-400/50" />
      <span className="text-xs">Failed to load</span>
      <button onClick={() => query.refetch()} className="text-xs text-[var(--color-accent)]">Retry</button>
    </div>
  )
  ```
- **Priority:** P1

### Verified: Pages with correct error handling

The following pages correctly handle errors (no issues):
- `app/clusters/page.tsx:375` — `QueryError` on `clusters.error`
- `app/alerts/page.tsx:209` — `QueryError` on `alertsQuery.isError`
- `app/events/page.tsx:223` — `QueryError` on `eventsQuery.error`
- `app/logs/page.tsx:487-488` — multiple error checks
- `app/namespaces/page.tsx:103` — `QueryError` on error
- `app/deployments/page.tsx:353` — `QueryError` with retry button
- `app/services/page.tsx:104` — `QueryError` on `servicesQuery.error`

---

## 3. Empty States

### [P1] DeploymentListWidget — ambiguous empty vs loading

- **File:** `components/dashboard/widgets/DeploymentListWidget.tsx:25-27`
- **Issue:** Shows "No deployments found" when `deployments.length === 0 && activeClusterId`. This matches BOTH loading (data hasn't arrived) AND truly empty states.
- **Expected UX:** Three distinct states: loading skeleton, empty state with helpful message, error state.
- **Fix:** Guard with `!deploymentsQuery.isLoading && deployments.length === 0`.
- **Priority:** P1

### [P2] ClusterHealthWidget — empty state too minimal

- **File:** `components/dashboard/widgets/ClusterHealthWidget.tsx:80`
- **Issue:** Empty state is a single `<span>` text "No clusters" with no icon, no helpful guidance.
- **Expected UX:** Use a compact empty state with icon and action: "No clusters connected. [Add Cluster]"
- **Fix:** Replace with `<EmptyState>` or at minimum add a link to `/clusters`.
- **Priority:** P2

### Verified: Pages with correct empty states

The following have proper empty states:
- `app/clusters/page.tsx:460` — emptyTitle, emptyIcon, emptyDescription
- `app/alerts/page.tsx:216` — emptyIcon, emptyTitle
- `app/logs/page.tsx:500-505` — custom EmptyState with description
- `app/namespaces/page.tsx:111` — emptyIcon, emptyTitle, emptyDescription
- `app/services/page.tsx:107-111` — EmptyState with icon, title, description
- `app/deployments/page.tsx:456-466` — context-aware empty state (different message for namespace filter)

---

## 4. Optimistic Updates

### [P2] Pod delete mutation not using useOptimisticOptions

- **File:** `app/clusters/[id]/pods/page.tsx`
- **Issue:** Pod deletion uses `trpc.pods.delete.useMutation()` with manual `onSuccess/onError` callbacks instead of the standardized `useOptimisticOptions` hook.
- **Expected UX:** Pod should visually disappear from list immediately, with rollback on failure.
- **Fix:** Convert to use `useOptimisticOptions` like deployments/alerts/clusters pages do.
- **Priority:** P2

### [P2] ApiTokens mutations not using useOptimisticOptions

- **File:** `components/settings/ApiTokens.tsx:47-78`
- **Issue:** Three mutations (`createToken`, `revokeToken`, `revokeTestTokens`) use manual `onSuccess`/`onError` with `invalidate()` instead of optimistic updates.
- **Expected UX:** Token revocation should remove the item from the list immediately.
- **Fix:** Convert revoke mutations to `useOptimisticOptions` for instant UI feedback.
- **Priority:** P2

### [P3] Feature flag toggle — manual optimistic logic

- **File:** `app/settings/features/page.tsx`
- **Issue:** Implements custom optimistic update logic instead of using `useOptimisticOptions`.
- **Expected UX:** Toggle should use the same pattern as the rest of the app for consistency.
- **Fix:** Refactor to use `useOptimisticOptions`.
- **Priority:** P3

### Verified: Pages with correct optimistic updates

- `app/clusters/page.tsx` — create + delete
- `app/alerts/page.tsx` — create + update + delete
- `app/deployments/page.tsx` — scale + restart
- `app/settings/users/page.tsx` — create + update + delete

---

## 5. Toast Notifications

### Verified: All mutations show toasts

Toast coverage is comprehensive across the app. Every mutation checked shows appropriate success/error toasts:
- Pages using `useOptimisticOptions` get automatic toast via the hook
- Pages using manual mutations all include `toast.success()` / `toast.error()` calls
- Toast provider configured in `providers.tsx:79-91` (sonner)

### [P3] InlineAiPanel — error shown inline, not as toast

- **File:** `components/ai/InlineAiPanel.tsx:70-75`
- **Issue:** AI errors are shown as assistant messages inline in the chat panel, not as toast notifications.
- **Expected UX:** This is actually **correct UX** for a chat panel — errors should appear in context. No change needed.
- **Priority:** N/A (not an issue)

---

## 6. Confirm Dialogs

### [P1] "Revoke all test tokens" — no confirmation dialog

- **File:** `components/settings/ApiTokens.tsx:126-137`
- **Issue:** The "Revoke N Test Tokens" button calls `revokeTestTokens.mutate()` directly without any confirmation. This is a bulk destructive action.
- **Expected UX:** Should open a `ConfirmDialog` asking: "Revoke {N} test token(s)? This action cannot be undone."
- **Fix:**
  ```tsx
  const [confirmBulkRevoke, setConfirmBulkRevoke] = useState(false)
  // Button: onClick={() => setConfirmBulkRevoke(true)}
  // Add ConfirmDialog with variant="danger"
  ```
- **Priority:** P1

### [P2] Single token revoke — inline confirm instead of dialog

- **File:** `components/settings/ApiTokens.tsx:186-203`
- **Issue:** Uses inline Confirm/Cancel buttons instead of the standard `ConfirmDialog` component used everywhere else in the app.
- **Expected UX:** Should use `ConfirmDialog` for consistency with user deletion, webhook deletion, alert deletion, etc.
- **Fix:** Replace inline confirm/cancel buttons with `ConfirmDialog`.
- **Priority:** P2

### Verified: Pages with correct confirmation dialogs

- `app/settings/users/page.tsx:402-418` — ConfirmDialog for user deletion
- `app/alerts/page.tsx:271-280` — ConfirmDialog for alert deletion
- `app/clusters/[id]/pods/page.tsx:164-229` — Custom dialog with typed confirmation
- `app/settings/webhooks/page.tsx:305-321` — ConfirmDialog for webhook deletion
- `app/settings/permissions/page.tsx:170-188` — ConfirmDialog for permission revocation
- `app/deployments/page.tsx:473-497` — ConfirmDialog for deployment restart

---

## 7. Micro-Interactions

### [P2] MotionButton component underutilized

- **File:** `components/MotionButton.tsx`
- **Issue:** `MotionButton` exists with `whileHover`/`whileTap` animations but is barely used. Most buttons use plain `<button>` with only `transition-colors`.
- **Expected UX:** Interactive buttons throughout the app should provide tactile feedback (scale on hover/tap).
- **Fix:** Replace key action buttons (ConfirmDialog buttons, form submit buttons, dashboard edit bar buttons) with `motion.button` or `MotionButton`.
- **Priority:** P2

### [P2] MetricCard missing hover lift animation

- **File:** `components/shared/MetricCard.tsx:84-88`
- **Issue:** MetricCard only has `hover:bg-[...]` with `transition-colors`. No lift/scale effect.
- **Expected UX:** Should match StatCardsWidget pattern: `whileHover={{ y: -2, boxShadow: '...' }}`.
- **Fix:** Wrap in `motion.div` with hover lift animation matching StatCardsWidget.
- **Priority:** P2

### [P2] DataTable sort header buttons — no animation

- **File:** `components/DataTable.tsx:216-232`
- **Issue:** Sort buttons have `hover:text-[...]` but no scale/press animation. Contrast with PaginationBtn (line 489) which has `whileHover={{ scale: 1.02 }}` + `whileTap={{ scale: 0.97 }}`.
- **Expected UX:** Sort buttons should have subtle scale animation on hover.
- **Fix:** Wrap sort button in `motion.button` with `whileHover={{ scale: 1.02 }}`.
- **Priority:** P2

### [P3] FilterBar tag buttons — no hover animation

- **File:** `components/FilterBar.tsx:168-181`
- **Issue:** Tag toggle buttons have `hover:border-[...]` and `hover:bg-[...]` but no scale animation matching the rest of the app's interactive elements.
- **Expected UX:** Consistent with other pill/chip buttons.
- **Fix:** Add `whileHover` to tag buttons.
- **Priority:** P3

---

## 8. Animation Consistency

### [P2] Hardcoded animation durations instead of constants

- **Files:**
  - `components/dashboard/widgets/StatCardsWidget.tsx:63` — hardcoded `duration: 0.15` (should use `DURATION.fast` = 0.15)
  - `components/MotionButton.tsx:18` — hardcoded `duration: 0.08` (should use `DURATION.instant` = 0.08)
  - `components/ClusterHealthIndicator.tsx:130` — hardcoded `duration: 0.3` (should use `DURATION.slow`)
  - `components/ai/InlineAiPanel.tsx:118` — hardcoded `duration: 0.2` (should use `DURATION.normal`)
  - `components/FilterBar.tsx:193` — hardcoded `duration: 0.18`
- **Issue:** `animation-constants.ts` defines `DURATION` and `EASING` objects, but many components use inline values instead.
- **Expected UX:** All animation timings should reference constants for consistency and maintainability.
- **Fix:** Replace all hardcoded durations with imports from `@/lib/animation-constants`.
- **Priority:** P2

### [P2] Sheet uses CSS animations, Dialog uses Motion

- **File:** `components/ui/sheet.tsx:42-49`
- **Issue:** Sheet overlay/content use CSS classes (`animate-fade-in`, `animate-slide-in-right`) while the Dialog component uses Motion. Same UX pattern, different animation systems.
- **Expected UX:** Both modal-like overlays should use the same animation system.
- **Fix:** Convert Sheet to use Motion `variants` from `animation-constants.ts`.
- **Priority:** P2

### [P3] Sidebar hover uses CSS, rest of app uses Motion

- **File:** `app/globals.css:370-382`
- **Issue:** Sidebar nav item hover animations are pure CSS (`transition: transform ...`). Rest of interactive elements use Motion `whileHover`.
- **Expected UX:** Sidebar could use Motion for consistency, but CSS transitions here are fine for performance. Low priority.
- **Fix:** Optional — convert to Motion only if sidebar animations need to be more complex.
- **Priority:** P3

### [P2] prefers-reduced-motion not consistently respected

- **Files with checks:** AnimatedList, FadeIn, AnimatedStatCount, FilterBar, InlineAiPanel
- **Files missing checks:**
  - `StatCardsWidget.tsx:62` — `motion.div whileHover` without reduced motion check
  - `DataTable.tsx` sort button — `motion.button` without reduced motion check
  - `MotionButton.tsx` — no reduced motion check
- **Fix:** Add `useReducedMotion()` check to all Motion components that animate on interaction.
- **Priority:** P2

---

## 9. Data Formatting

### [P1] timeAgo() duplicated 3 times across codebase

- **Files:**
  - `lib/time-utils.ts:1-11` — **canonical** `timeAgo()` function
  - `app/alerts/page.tsx:52-60` — local duplicate `timeAgo()` (identical logic)
  - `components/dashboard/AnomalyTimeline.tsx:38` — local duplicate `timeAgo()` (identical logic)
  - `lib/anomalies.ts:178-191` — `getRelativeTime()` (same logic, different name)
- **Issue:** Four copies of identical relative-time logic. Bug fix in one won't propagate.
- **Expected UX:** Single source of truth in `lib/time-utils.ts`.
- **Fix:**
  1. Delete local `timeAgo()` in `alerts/page.tsx` and `AnomalyTimeline.tsx`, import from `@/lib/time-utils`
  2. Replace `getRelativeTime()` in `lib/anomalies.ts` with re-export of `timeAgo`
- **Priority:** P1

### [P2] Hardcoded locale 'en-IL' in formatTimestamp

- **File:** `lib/formatters.ts:16`
- **Issue:** `formatTimestamp()` uses `toLocaleString('en-IL')` — Israeli English locale. This should use the user's browser locale for a global app.
- **Expected UX:** Use `toLocaleString()` without explicit locale, or make locale configurable.
- **Fix:** Remove the `'en-IL'` parameter: `d.toLocaleString(undefined, { ... })`.
- **Priority:** P2

### [P2] ApiTokens has its own date formatter

- **File:** `components/settings/ApiTokens.tsx:28-39`
- **Issue:** `formatDate()` function defined locally with `toLocaleString('en-US', ...)`. Different format from `lib/formatters.ts`.
- **Expected UX:** All date formatting should use shared utility.
- **Fix:** Move to `lib/formatters.ts` or unify with existing `formatTimestamp()`.
- **Priority:** P2

### [P3] Deployments page — custom formatTimestamp

- **File:** `app/deployments/page.tsx:231-239`
- **Issue:** Implements its own `formatTimestamp()` callback with SSR-aware logic, separate from `lib/formatters.ts`.
- **Expected UX:** Share SSR-aware formatting logic rather than duplicating.
- **Fix:** Create a shared `useFormattedTimestamp()` hook or extend `formatters.ts`.
- **Priority:** P3

### [P3] Missing formatters

- **File:** `lib/formatters.ts`
- **Issue:** Only has `formatCPU`, `formatMemory`, and `formatTimestamp`. Missing:
  - `formatBytes()` for generic byte display
  - `formatPercentage()` — percentages are hardcoded throughout UI
  - `formatNumber()` with thousands separator for large counts
- **Expected UX:** Shared formatters for consistent number display.
- **Fix:** Add missing formatters as needed.
- **Priority:** P3

---

## 10. Pagination / Infinite Scroll

### [P2] Global pages don't use DataTable pagination

- **Files:**
  - `app/deployments/page.tsx` — `paginated` prop NOT set (loads all, no pagination)
  - `app/services/page.tsx` — `paginated` prop NOT set
  - `app/events/page.tsx` — hardcoded `limit: 50`, no client-side pagination
  - `app/alerts/page.tsx` — alert history `limit: 20`, no pagination
- **Issue:** DataTable supports `paginated` prop with full pagination UI (lines 426-471), but global pages don't use it. Cluster detail pages DO use it correctly.
- **Expected UX:** Lists that can grow large should be paginated.
- **Fix:** Add `paginated` prop to global page DataTables: `<DataTable paginated pageSize={20} ... />`
- **Priority:** P2

### Verified: Cluster detail pages use pagination correctly

- `clusters/[id]/deployments/page.tsx:193` — `paginated`
- `clusters/[id]/services/page.tsx:167` — `paginated`
- `clusters/[id]/events/page.tsx:167` — `paginated`
- `clusters/[id]/namespaces/page.tsx:133` — `paginated`
- `clusters/[id]/nodes/page.tsx:234` — `paginated`

### [P3] Dashboard widget lists hardcoded to 8-10 items

- **Files:**
  - `DeploymentListWidget.tsx:28` — `.slice(0, 8)`
  - `AlertFeedWidget.tsx:11` — `.slice(0, 10)`
- **Issue:** Fixed limit with no "show more" or scroll-to-full-page option.
- **Expected UX:** This is actually acceptable for dashboard widgets — they're summary views. "View all" links exist. No change needed.
- **Priority:** N/A

---

## 11. Search / Filter UX

### [P1] FilterBar search has no debounce

- **File:** `components/FilterBar.tsx:125-131`
- **Issue:** Every keystroke calls `updateParams()` which does `router.replace()`. This triggers URL update + re-render on every character typed.
- **Expected UX:** Search input should debounce with ~300ms delay before updating URL.
- **Fix:**
  ```tsx
  // Add debounced value
  const [localSearch, setLocalSearch] = useState(parsed.q)
  useEffect(() => {
    const timer = setTimeout(() => {
      updateParams((params) => {
        if (!localSearch.trim()) params.delete('q')
        else params.set('q', localSearch)
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [localSearch])
  ```
- **Priority:** P1

### [P2] DataTable search has no debounce

- **File:** `components/DataTable.tsx:261-262`
- **Issue:** `onChange={(e) => setGlobalFilter(e.target.value)}` — filters on every keystroke. For client-side filtering this is OK for small lists but can stutter for large tables.
- **Expected UX:** Add 150ms debounce for smoother typing UX.
- **Fix:** Debounce `setGlobalFilter` with short delay.
- **Priority:** P2

### [P2] Logs page search not URL-persisted

- **File:** `app/logs/page.tsx`
- **Issue:** Search/filter state uses `useState` only, not URL params. Navigating away and back loses the search.
- **Expected UX:** Search state should persist in URL via `nuqs` or `useSearchParams`.
- **Fix:** Use `nuqs` for search/filter/tail persistence.
- **Priority:** P2

---

## 12. Breadcrumbs & Navigation

### [P3] No back button on nested pages

- **Issue:** Users must use breadcrumbs or browser back button to navigate up. No explicit back button on cluster detail pages.
- **Expected UX:** Acceptable for desktop — breadcrumbs serve this purpose. Mobile may benefit from a back arrow, but low priority.
- **Fix:** Consider adding a back arrow on mobile breakpoints.
- **Priority:** P3

### Verified: Breadcrumbs are present

- `Breadcrumbs.tsx` builds trail from pathname with truncation
- Most pages pass breadcrumb config via `PageHeader`
- Cluster detail pages show cluster name in breadcrumb

---

## 13. Keyboard Shortcuts

### [P2] DataTable j/k navigation not wired to keyboard

- **File:** `components/DataTable.tsx:121-158`
- **Issue:** DataTable listens for custom `voyager:list-down` and `voyager:list-up` events for j/k navigation, but no global keyboard handler dispatches these events.
- **Expected UX:** j/k keys should navigate rows when a table is focused.
- **Fix:** Add a `KeyboardShortcuts` handler or extend `CommandPalette` to dispatch `voyager:list-down/up` events on j/k keys when a table is visible.
- **Priority:** P2

### Verified: Working keyboard shortcuts

- `Cmd+K` / `Ctrl+K` — Command palette (works)
- `/` — Focus FilterBar search input (works)
- `Escape` — Close command palette (works)
- Arrow keys — Navigate command palette items (works)
- `1-9` — Cluster tab shortcuts in command palette (works)

---

## 14. Copy-to-Clipboard

### [P2] Missing copy buttons for identifiers

- **Issue:** Many places display IDs, names, and technical values that users would want to copy, but lack copy buttons.
- **Missing locations:**
  - Cluster names in cluster list / detail page
  - Pod names in pod list
  - Deployment names
  - Service names
  - Namespace names
  - Event messages / object names
  - Log lines
- **Expected UX:** Hover to reveal a small copy icon next to technical values.
- **Fix:** Create a shared `<CopyableText value={text}>` component that wraps text with a hover-to-copy button.
- **Priority:** P2

### [P3] Inconsistent copy feedback pattern

- **Files:**
  - `components/settings/ApiTokens.tsx:102-109` — toast notification approach
  - `app/settings/audit/page.tsx:59-77` — checkmark icon approach
- **Issue:** Two different feedback patterns for copy-to-clipboard.
- **Expected UX:** Standardize on one pattern (toast is more discoverable).
- **Fix:** Convert audit page `TruncatedId` to use toast instead of inline checkmark.
- **Priority:** P3

### Verified: Existing copy implementations

- ApiTokens: copy token, copy MCP snippet (toast feedback)
- Audit log: copy resource ID (checkmark feedback)

---

## 15. Skeleton Consistency

### [P1] Four different skeleton patterns used inconsistently

- **Files:**
  1. `components/Skeleton.tsx` — `Shimmer` component using `skeleton-shimmer` CSS class (linear gradient animation, 1.5s)
  2. `components/ui/skeleton.tsx` — `Skeleton` component using `animate-pulse` (opacity pulse)
  3. `components/DataTable.tsx:298-322` — `skeleton-shimmer` CSS class directly
  4. `components/CardSkeleton.tsx` — uses `<Skeleton>` from ui/skeleton (pulse)
- **Issue:** Two fundamentally different animation approaches:
  - **Shimmer** (linear gradient sweep, used in DataTable, Skeleton.tsx)
  - **Pulse** (opacity fade in/out, used in ui/skeleton.tsx, CardSkeleton)
  - Same type of content (table rows, cards) uses different patterns depending on which component is used
- **Expected UX:** Single consistent skeleton animation across the entire app. Choose one: shimmer OR pulse.
- **Fix:** Standardize on `skeleton-shimmer` (linear gradient sweep is more modern). Update `ui/skeleton.tsx` to use shimmer instead of pulse.
- **Priority:** P1

---

## Summary by Priority

| Priority | Count | Description |
|----------|-------|-------------|
| **P0** | 0 | No blocking issues found |
| **P1** | 6 | Dashboard widget loading/error states, timeAgo duplication, skeleton inconsistency, FilterBar debounce, bulk revoke confirmation |
| **P2** | 18 | Animation constants, hover animations, reduced motion, pagination, search UX, copy-to-clipboard, misc state handling |
| **P3** | 7 | Sidebar animation, date formatters, missing utility functions, back navigation |

### Critical Fix Order

1. **Dashboard widgets** — Add loading skeleton + error state to all 6 widgets (P1, highest user-visible impact)
2. **Skeleton pattern** — Standardize shimmer vs pulse (P1, visual consistency)
3. **timeAgo deduplication** — Delete duplicates, use single source (P1, code health)
4. **FilterBar debounce** — Add 300ms debounce to search (P1, performance)
5. **Bulk revoke confirmation** — Add ConfirmDialog to "Revoke all test tokens" (P1, data safety)
6. **Global page pagination** — Add `paginated` prop to deployments/services/events pages (P2, scalability)
7. **Animation constants** — Replace all hardcoded durations with DURATION imports (P2, consistency)
