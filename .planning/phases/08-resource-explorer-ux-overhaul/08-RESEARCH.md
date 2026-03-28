# Phase 8: Resource Explorer UX Overhaul - Research

**Researched:** 2026-03-28
**Domain:** Frontend UX (React/Next.js), K8s resource display, real-time data, log visualization, cross-resource navigation
**Confidence:** HIGH

## Summary

Phase 8 transforms 12 cluster resource tabs from disconnected table views into a cohesive, Pods-style dashboard with namespace grouping, search/filter, expand all/collapse all, log beautification, real-time data refresh after mutations, and cross-resource hyperlink navigation. The codebase is well-structured for this work -- the Pods page is a proven 629-line reference implementation, the `expandable/` component library (ExpandableCard, DetailTabs, TagPills, ConditionsList, ResourceBar) is mature and reusable, and the backend router pattern is consistent across all 12 resource types.

The primary technical challenges are: (1) making ExpandableCard support external state control for expand-all/collapse-all (currently uses internal `useState`), (2) building a shared page scaffold to avoid 12 copy-paste page components, (3) implementing cross-resource queries efficiently (label selectors, owner references), and (4) building a log beautifier that handles JSON + plain text with syntax highlighting without adding new dependencies.

**Primary recommendation:** Extract a reusable `ResourcePage` scaffold component that encapsulates the cluster query boilerplate, namespace grouping, search/filter, and expand-all logic. Redesign tabs one-by-one against this scaffold to minimize risk. Add controlled-mode support to ExpandableCard via an optional `expanded` prop.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01: Tab Redesign -- Namespace-Grouped Card Layout:** All namespaced resource tabs converted from ExpandableTableRow to Pods-style: namespace-grouped collapsible sections, search/filter bar, ExpandableCard, summary row per card, detail panel with DetailTabs
- **D-02: Cluster-Scoped Resource Handling:** Namespaces page = flat card list (no namespace grouping). Events page = group by involvedObject.namespace. Nodes page = not in scope.
- **D-03: Expand All / Collapse All Toggle:** Right-aligned button in search/filter bar. Per-page scope. Applies to all tabs including Pods. Text toggles. Local component state (not persisted).
- **D-04: Real-Time Data Refresh After Mutations:** Pod deletion calls `utils.pods.list.invalidate()` with optimistic removal. Other mutations: same invalidation pattern. K8s informers handle background refresh for SSE-backed resources.
- **D-05: Logs Beautifier:** Auto-detect JSON vs plain text per line. JSON pretty-print with syntax highlighting. Log level badges (ERROR/WARN/INFO/DEBUG). Timestamp parsing. Search within logs with match count. Line numbering. Word wrap toggle. Keep existing react-resizable-panels layout.
- **D-06: Cross-Resource Navigation -- Bidirectional Hyperlinks:** New detail tabs: Pod->Logs, Pod->Node, Deployment->Pods, StatefulSet->Pods, DaemonSet->Pods, Service->Endpoints, Ingress->Services, Job->Pods, CronJob->Jobs, HPA->Target. Hyperlink clicks navigate to tab + scroll/expand target. May need new backend procedures (pods.listBySelector, pods.listByOwner).

### Claude's Discretion
- Specific card summary layout per resource type (what columns to show)
- Animation details for new card layouts (follow B-style constants)
- Exact color scheme for log level badges and JSON syntax highlighting (follow chart-theme.ts patterns)
- Whether to add "Copy log line" / "Download logs" buttons
- Search/filter implementation details (debounce timing, fuzzy vs exact match)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 8 requirement IDs (UX-01 through UX-15) are defined during planning, not in REQUIREMENTS.md (which covers the Metrics Graph Redesign). The phase success criteria serve as the requirement map:

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | All resource tabs use namespace-grouped card layout matching Pods design | Pods page reference (629 LOC), ExpandableCard + Collapsible pattern documented |
| UX-02 | Search/filter bar on every resource tab with real-time result count | Pods page search pattern documented, 200ms debounce recommended |
| UX-03 | Expand All / Collapse All toggle on every tab including Pods | ExpandableCard needs controlled mode (optional `expanded` prop) |
| UX-04 | Pod deletion triggers immediate UI update (no manual refresh) | `utils.pods.list.invalidate()` + optimistic cache update pattern |
| UX-05 | Other resource mutations trigger immediate UI update | Same invalidation pattern via `trpc.useUtils()` |
| UX-06 | Logs tab has syntax highlighting for JSON | Custom JSON tokenizer (no new deps), CSS var colors |
| UX-07 | Logs tab has log level coloring (ERROR/WARN/INFO/DEBUG) | Badge component with severity colors from chart-theme.ts |
| UX-08 | Logs tab has search/filter with match highlighting and count | Text search with `mark` element highlighting |
| UX-09 | Logs tab has timestamp parsing with relative/absolute toggle | Backend already sends timestamps; frontend formats |
| UX-10 | Logs tab has line numbering and word wrap toggle | Gutter + CSS `white-space` toggle |
| UX-11 | Cross-resource Pod tabs (Deployment->Pods, StatefulSet->Pods, DaemonSet->Pods, Job->Pods) | New `pods.listByLabels` or client-side label matching from existing pods.list |
| UX-12 | Cross-resource Service->Endpoints tab | Service selector labels -> pods.list filter |
| UX-13 | Cross-resource Ingress->Services, CronJob->Jobs, HPA->Target tabs | Navigation links using router.push |
| UX-14 | Pod->Logs embedded tab | Reuse logs.get tRPC procedure in pod detail panel |
| UX-15 | Karpenter/autoscaling tab design unchanged | No changes to autoscaling/page.tsx |
</phase_requirements>

## Standard Stack

### Core (Already Installed -- No New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | UI framework | Already in project |
| Next.js | 16.x | App Router, SSR | Already in project |
| motion | 12.38.0 | Animation (B-style springs) | Already in project, animation-constants.ts |
| @tanstack/react-query | 5.95.2 | Server state (via tRPC) | Already in project |
| shadcn/ui | latest | Collapsible, Tooltip, Skeleton | Already in project |
| lucide-react | 1.7.0 | Icons | Already in project |
| sonner | 2.0.7 | Toast notifications | Already in project |
| react-resizable-panels | 4.7.6 | Logs split pane | Already in project |
| Tailwind CSS | 4.2.2 | Styling | Already in project |

### No New Dependencies Required

This phase requires **zero new npm packages**. All functionality can be built with existing libraries:
- Log syntax highlighting: custom CSS + inline tokenizer (no `prism.js` or `highlight.js` needed)
- JSON pretty-print: `JSON.parse` + recursive renderer
- Search highlighting: `<mark>` elements with CSS
- Line numbering: CSS counter or inline gutter

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom JSON renderer | react-json-view | Adds 30KB+ dep for simple display; our logs are flat JSON lines, not deep trees |
| Custom log viewer | @monaco-editor/react | 2MB+ dep, massive overkill for read-only log display |
| Custom search highlight | mark.js | 8KB dep for something achievable with 20 LOC |

## Architecture Patterns

### Recommended Project Structure

```
apps/web/src/
├── components/
│   ├── expandable/
│   │   ├── ExpandableCard.tsx        # MODIFY: add optional controlled mode (expanded prop)
│   │   ├── DetailTabs.tsx            # REUSE as-is
│   │   ├── ExpandableTableRow.tsx    # KEEP (not removed, but no longer used by resource tabs)
│   │   └── ...                       # All other components reuse as-is
│   ├── resource/                     # NEW: shared resource page scaffold
│   │   ├── ResourcePageScaffold.tsx  # Cluster query, namespace grouping, search, expand-all
│   │   ├── NamespaceGroup.tsx        # Collapsible namespace section (extracted from Pods)
│   │   └── SearchFilterBar.tsx       # Search input + expand-all button + result count
│   └── logs/                         # NEW: log beautifier components
│       ├── LogViewer.tsx             # Main log viewer (replaces inline <pre> in logs page)
│       ├── LogLine.tsx               # Single log line with level badge, timestamp, content
│       ├── JsonRenderer.tsx          # Collapsible JSON syntax highlighting
│       └── LogSearch.tsx             # Search input with match highlighting
├── app/clusters/[id]/
│   ├── services/page.tsx             # REWRITE using ResourcePageScaffold
│   ├── ingresses/page.tsx            # REWRITE using ResourcePageScaffold
│   ├── statefulsets/page.tsx         # REWRITE using ResourcePageScaffold
│   ├── daemonsets/page.tsx           # REWRITE using ResourcePageScaffold
│   ├── jobs/page.tsx                 # REWRITE using ResourcePageScaffold
│   ├── cronjobs/page.tsx             # REWRITE using ResourcePageScaffold
│   ├── hpa/page.tsx                  # REWRITE using ResourcePageScaffold
│   ├── configmaps/page.tsx           # REWRITE using ResourcePageScaffold
│   ├── secrets/page.tsx              # REWRITE using ResourcePageScaffold
│   ├── pvcs/page.tsx                 # REWRITE using ResourcePageScaffold
│   ├── namespaces/page.tsx           # REWRITE (flat cards, no namespace groups)
│   ├── events/page.tsx               # REWRITE (group by involvedObject.namespace)
│   ├── pods/page.tsx                 # ENHANCE: add expand-all + cross-resource tabs
│   └── logs/page.tsx                 # ENHANCE: add log beautifier components
```

### Pattern 1: ResourcePageScaffold (Shared Page Wrapper)

**What:** A reusable component that encapsulates the common patterns across all resource tab pages: cluster query boilerplate, search/filter bar, namespace grouping, expand-all state, loading/empty/error states.

**When to use:** Every resource tab page except Nodes and Karpenter.

**Example:**
```typescript
// Source: Extracted from Pods page pattern (apps/web/src/app/clusters/[id]/pods/page.tsx)
interface ResourcePageScaffoldProps<T> {
  title: string
  queryHook: (clusterId: string) => { data: T[] | undefined; isLoading: boolean }
  getNamespace: (item: T) => string
  getKey: (item: T) => string
  filterFn: (item: T, query: string) => boolean
  renderSummary: (item: T) => ReactNode
  renderDetail: (item: T) => ReactNode
  searchPlaceholder: string
  emptyMessage: string
  emptyDescription?: string
  icon?: ReactNode
  // For flat lists (namespaces page): skip namespace grouping
  flatList?: boolean
}
```

**Why:** All 12 resource pages share identical patterns: cluster query, hasCredentials check, loading skeleton, empty state, search filter, namespace grouping. Currently each page duplicates ~100 lines of this boilerplate. The scaffold eliminates this.

### Pattern 2: Controlled ExpandableCard

**What:** Add an optional `expanded` prop to ExpandableCard for parent-controlled expand/collapse state.

**When to use:** When expand-all/collapse-all toggle needs to control all cards from a parent.

**Example:**
```typescript
// Source: Modified from apps/web/src/components/expandable/ExpandableCard.tsx
interface ExpandableCardProps {
  summary: ReactNode
  children: ReactNode
  defaultExpanded?: boolean
  expanded?: boolean          // NEW: controlled mode
  onExpandedChange?: (expanded: boolean) => void  // NEW: callback
}
```

**Key implementation detail:** When `expanded` prop is provided, the component becomes controlled. When undefined, it uses internal state (backward compatible). This follows the React controlled/uncontrolled pattern.

### Pattern 3: Cross-Resource Hyperlinks via URL Navigation

**What:** Cross-resource links use `router.push()` to navigate to the target tab URL with a query parameter to identify the target resource, then scroll to and auto-expand it.

**Example:**
```typescript
// Navigate from Deployment detail -> Pods tab, highlighting pods matching selector
router.push(
  `/clusters/${clusterRouteSegment}/pods?highlight=${encodeURIComponent(
    JSON.stringify({ labels: deployment.spec.selector.matchLabels })
  )}`
)
```

**Why:** This keeps navigation simple and shareable. The target page reads the `highlight` query param using `nuqs` (already installed) and filters/scrolls to matching resources.

### Pattern 4: Log Beautifier Architecture

**What:** A layered log viewer that processes each log line through: (1) timestamp extraction, (2) log level detection, (3) JSON detection, (4) content rendering with syntax highlighting.

**Rendering pipeline per line:**
```
Raw log line
  -> extractTimestamp(line) -> { timestamp: string, content: string }
  -> detectLevel(content)   -> 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'
  -> isJSON(content)        -> render JsonRenderer or plain text
  -> applySearchHighlight() -> wrap matches in <mark>
```

### Anti-Patterns to Avoid

- **Copy-pasting the Pods page 12 times:** Extract shared scaffold instead. Each resource page should be ~80-120 lines of resource-specific logic, not 600+ lines.
- **Adding ExpandableCard state to URL params:** Expand/collapse is ephemeral UI state, not worth persisting. Use local `useState`.
- **Fetching cross-resource data in the parent page:** Cross-resource tabs should lazy-fetch data only when the tab is opened (not on page load). Use separate tRPC queries inside the detail tab content.
- **Building a custom log streaming WebSocket:** Keep existing tRPC-based log fetching. Real-time log streaming is a v2 feature.
- **Adding react-json-view or monaco for logs:** Massive bundle size for simple read-only log display. Build a lightweight custom renderer.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collapsible sections | Custom collapse logic | shadcn/ui Collapsible | Already used in Pods page, handles a11y |
| Toast notifications | Custom toast system | sonner | Already used everywhere |
| Animation springs | Raw CSS animations | motion + animation-constants.ts | B-style standard, reduced-motion support |
| URL query state | Manual searchParams | nuqs | Already installed, handles serialization |
| Debounced search | Custom debounce | useCallback + setTimeout | Simple 200ms pattern, no lib needed |

**Key insight:** This phase is about unifying existing patterns, not inventing new ones. The Pods page has already solved every UX problem -- the work is extraction and replication.

## Common Pitfalls

### Pitfall 1: ExpandableCard Internal State vs Controlled Mode
**What goes wrong:** Adding an `expanded` prop without handling the controlled/uncontrolled transition properly. The card ignores parent state changes or enters infinite re-render loops.
**Why it happens:** React controlled/uncontrolled pattern requires careful implementation. If `expanded` prop changes but internal state doesn't sync, the card appears stuck.
**How to avoid:** Use `expanded !== undefined` as the controlled check. When controlled, ignore `defaultExpanded` and use `expanded` directly. Call `onExpandedChange` on click. When uncontrolled, use internal `useState` as today.
**Warning signs:** Cards don't expand/collapse when Expand All is clicked, or all cards re-render on every parent state change.

### Pitfall 2: Void Return Type from handleK8sError
**What goes wrong:** (Gotcha #21 from CLAUDE.md) Routers using `handleK8sError` in catch blocks cause TypeScript to infer `void | undefined` return types. Frontend code using `.data` gets type errors.
**Why it happens:** TypeScript can't prove `handleK8sError` always throws.
**How to avoid:** Define explicit interface types for each resource and cast with `as`. This is already done in every existing page (e.g., `const pods = (podsQuery.data ?? []) as PodData[]`). Follow this pattern for all new cross-resource queries.
**Warning signs:** TypeScript errors about `void` when accessing `.data` from tRPC queries.

### Pitfall 3: Namespace Grouping Performance with Large Clusters
**What goes wrong:** Clusters with 500+ pods or services across 50+ namespaces cause sluggish grouping and rendering.
**Why it happens:** `useMemo` with `Array.from(map.entries()).sort()` re-runs on every data change. Rendering 500+ ExpandableCards with motion animations causes frame drops.
**How to avoid:** Use `useMemo` for grouping (already done). Consider virtualization only if measured performance is poor (unlikely with expand-all collapse pattern). The expand-all button actually helps -- collapsed cards render minimal DOM.
**Warning signs:** Sluggish typing in the search box, visible jank when expanding all cards.

### Pitfall 4: Search Filter Debounce Mismatch
**What goes wrong:** Search feels laggy because filtering 500+ items on every keystroke is expensive, or feels broken because debounce is too long.
**Why it happens:** No debounce = every keystroke triggers re-filter + re-render. Too much debounce = user types "nginx" and waits 500ms to see results.
**How to avoid:** Use 200ms debounce for the filter operation, but update the input value immediately (uncontrolled input with separate debounced filter state). The Pods page currently does NOT debounce -- it filters synchronously. For most cluster sizes (<200 items), this is fine. Only add debounce if measured lag appears.
**Warning signs:** Input feels unresponsive, search results flash/flicker.

### Pitfall 5: Cross-Resource Tab Lazy Loading Race Conditions
**What goes wrong:** Cross-resource tabs (e.g., Deployment->Pods) fetch data when the tab opens, but the user clicks another tab before data arrives, causing state updates on unmounted components.
**Why it happens:** tRPC queries don't automatically cancel when the component unmounts (they continue in the query cache).
**How to avoid:** tRPC/TanStack Query handles this gracefully -- the query continues and caches the result, but the component won't re-render if unmounted. No manual cleanup needed. The `enabled` flag on queries should be tied to whether the tab is active.
**Warning signs:** React warnings about state updates on unmounted components (rare with modern React/TanStack Query).

### Pitfall 6: Log Line Rendering Performance
**What goes wrong:** Rendering 1000 log lines with per-line JSON detection, syntax highlighting, and search highlighting causes visible lag.
**Why it happens:** Each line requires: JSON.parse attempt, regex matching, DOM creation. 1000x = noticeable.
**How to avoid:** Use `useMemo` to process all lines at once. For JSON detection, only `JSON.parse` lines that start with `{` or `[`. Consider windowed rendering (only visible lines) if logs exceed 500 lines -- use CSS `overflow-auto` with `position: sticky` line numbers.
**Warning signs:** Visible delay when switching pods in the log viewer, or when search results update.

## Code Examples

### Example 1: Namespace Grouping Pattern (from Pods page)

```typescript
// Source: apps/web/src/app/clusters/[id]/pods/page.tsx lines 409-417
const grouped = useMemo(() => {
  const map = new Map<string, PodData[]>()
  for (const pod of filteredPods) {
    const ns = pod.namespace || 'default'
    if (!map.has(ns)) map.set(ns, [])
    map.get(ns)?.push(pod)
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
}, [filteredPods])
```

### Example 2: Search Filter Pattern (from Pods page)

```typescript
// Source: apps/web/src/app/clusters/[id]/pods/page.tsx lines 398-407
const filteredPods = useMemo(() => {
  if (!searchQuery.trim()) return pods
  const q = searchQuery.toLowerCase().trim()
  return pods.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.namespace.toLowerCase().includes(q) ||
      p.status.toLowerCase().includes(q),
  )
}, [pods, searchQuery])
```

### Example 3: Mutation Cache Invalidation (from Pod Delete)

```typescript
// Source: apps/web/src/app/clusters/[id]/pods/page.tsx lines 534-539
const utils = trpc.useUtils()
const deleteMutation = trpc.pods.delete.useMutation({
  onSuccess: () => {
    toast.success(`Pod ${pod.name} deleted`)
    utils.pods.list.invalidate({ clusterId })
    onClose()
  },
  onError: (err) => toast.error(`Failed to delete pod: ${err.message}`),
})
```

### Example 4: ExpandableCard Current API

```typescript
// Source: apps/web/src/components/expandable/ExpandableCard.tsx
interface ExpandableCardProps {
  summary: ReactNode
  children: ReactNode
  defaultExpanded?: boolean
  // NOTE: No controlled mode yet -- needs expanded + onExpandedChange props
}
```

### Example 5: Backend Router Pattern (K8s Resources)

```typescript
// Source: apps/api/src/routers/services.ts (representative pattern for all resource routers)
export const servicesRouter = router({
  listDetail: protectedProcedure
    .input(z.object({ clusterId: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const response = await cached(cacheKey, CACHE_TTL.K8S_RESOURCES_SEC, () =>
          coreV1.listServiceForAllNamespaces(),
        )
        return response.items.map(/* ... */)
      } catch (error) {
        handleK8sError(error, 'list services detail')
      }
    }),
})
```

### Example 6: JSON Log Line Syntax Highlighting Pattern

```typescript
// Claude's discretion -- recommended implementation
const JSON_COLORS = {
  key: 'var(--color-accent)',           // Blue/purple keys
  string: 'var(--color-status-active)', // Green strings
  number: 'var(--color-chart-cpu)',     // Blue numbers
  boolean: 'var(--color-chart-mem)',    // Purple booleans
  null: 'var(--color-text-dim)',        // Gray null
  bracket: 'var(--color-text-muted)',   // Gray brackets
} as const

const LOG_LEVEL_COLORS = {
  ERROR: { bg: 'bg-red-500/15', text: 'text-red-400' },
  WARN: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  INFO: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  DEBUG: { bg: 'bg-gray-500/15', text: 'text-gray-400' },
} as const
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ExpandableTableRow (table-based) | ExpandableCard (card-based) | Wave 8 K8s Explorer | Cards are more flexible, better for responsive, namespace grouping |
| Flat resource lists | Namespace-grouped collapsible sections | Pods page (current) | Better visual organization for multi-namespace clusters |
| Internal-only expand state | Controlled/uncontrolled ExpandableCard | This phase | Enables expand-all/collapse-all feature |
| Plain text logs | Beautified logs with syntax highlighting | This phase | Professional log viewing experience |

**Deprecated/outdated:**
- `ExpandableTableRow`: Still in codebase but all resource tabs will switch to `ExpandableCard`. Keep the component (it may be useful elsewhere) but no longer used by resource pages after this phase.

## Open Questions

1. **Cross-resource queries -- client-side vs server-side filtering?**
   - What we know: The pods.list endpoint already returns all pods with labels. Cross-resource tabs (Deployment->Pods) could filter client-side using label matching.
   - What's unclear: Whether client-side filtering is fast enough for large clusters (500+ pods), or if new server-side `pods.listByLabels({ clusterId, labels })` procedures are needed.
   - Recommendation: Start with client-side filtering (use the already-cached pods.list data). Add server-side procedures only if performance is measured to be insufficient. This avoids unnecessary backend work.

2. **Cross-resource navigation -- scroll-to-resource behavior**
   - What we know: D-06 says "Clicking a hyperlink navigates to the appropriate tab and scrolls to / auto-expands the target resource"
   - What's unclear: How to scroll to and expand a specific resource card after navigation. The URL query param approach works for identifying the target, but scrolling to a dynamically-rendered card requires `scrollIntoView` after the card renders.
   - Recommendation: Use `nuqs` for a `highlight` query param. On page mount, find the matching card, expand it, and `scrollIntoView({ behavior: 'smooth', block: 'center' })` after a short delay (100ms for render completion).

3. **Logs beautifier -- structured log detection**
   - What we know: Backend already has `detectLogLevel()` in `logs.ts`. The `tail` procedure returns parsed lines with `{ timestamp, message, level }`.
   - What's unclear: Whether to use the `tail` procedure (structured) or the `get` procedure (raw text) for the beautified viewer.
   - Recommendation: Use the `tail` procedure for the beautified view (it already parses timestamps and levels). Use the `get` procedure as fallback for the raw/legacy view. The frontend `LogLine` component handles JSON detection per-line.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (API), Playwright (E2E) |
| Config file | vitest.config.ts (root), tests/e2e/ |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test && pnpm build && pnpm typecheck` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-01 | Resource tabs use namespace-grouped cards | manual (visual) | N/A | N/A |
| UX-02 | Search/filter bar works on all tabs | manual (visual) | N/A | N/A |
| UX-03 | Expand All / Collapse All toggle | manual (visual) | N/A | N/A |
| UX-04 | Pod deletion invalidates cache | unit | `pnpm test` (if test added) | No |
| UX-05 | Mutation invalidation pattern | unit | `pnpm test` (if test added) | No |
| UX-06-10 | Logs beautifier features | manual (visual) | N/A | N/A |
| UX-11-14 | Cross-resource navigation | manual (visual) | N/A | N/A |
| UX-15 | Karpenter unchanged | manual (visual) | N/A | N/A |
| BUILD | pnpm build passes | build | `pnpm build` | N/A |
| TYPE | pnpm typecheck passes | typecheck | `pnpm typecheck` | N/A |

### Sampling Rate
- **Per task commit:** `pnpm typecheck && pnpm build`
- **Per wave merge:** `pnpm test && pnpm build && pnpm typecheck`
- **Phase gate:** Full suite green + visual QA before `/gsd:verify-work`

### Wave 0 Gaps
None -- existing build and typecheck infrastructure covers all automated requirements. Frontend component tests are not part of the project's testing strategy (no `apps/web/src/__tests__/` directory exists). Visual verification is manual per QA Gate Rules in CLAUDE.md.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). This phase is purely frontend code changes with no new external tools, services, or CLIs required. All dependencies (React, Next.js, motion, shadcn/ui, tRPC, etc.) are already installed.

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** -- direct reading of all 12 resource page files, expandable component library, backend routers, animation constants, design doc, and tRPC client setup
- `apps/web/src/app/clusters/[id]/pods/page.tsx` -- 629-line reference implementation (gold standard)
- `apps/web/src/components/expandable/` -- full component library (8 components)
- `apps/api/src/routers/pods.ts`, `services.ts`, `logs.ts` -- backend patterns
- `docs/DESIGN.md` -- B-style animation standards
- `apps/web/src/lib/animation-constants.ts` -- all motion variants

### Secondary (MEDIUM confidence)
- React controlled/uncontrolled component pattern -- well-established React pattern
- JSON syntax highlighting without dependencies -- standard approach

### Tertiary (LOW confidence)
- Cross-resource navigation via URL query params -- untested in this codebase, may need adjustment

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, everything already in the project
- Architecture: HIGH -- Pods page is a proven reference, patterns are clear
- Pitfalls: HIGH -- identified from direct codebase analysis and CLAUDE.md gotchas
- Cross-resource navigation: MEDIUM -- URL-based approach is sound but implementation details may need iteration

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable domain, no fast-moving external dependencies)

## Project Constraints (from CLAUDE.md)

Actionable directives that the planner MUST follow:

1. **Iron Rule #1:** NEVER add `migrate()` to server.ts
2. **Iron Rule #8:** Read `docs/DESIGN.md` before ANY UI change -- B-style animation standard
3. **Gotcha #1:** tRPC uses `httpLink` (NOT `httpBatchLink`) -- do not revert
4. **Gotcha #10:** LazyMotion -- do NOT add `strict` flag to providers.tsx
5. **Gotcha #13:** SSR Hydration -- never branch on `typeof window` in render; use `useState(false)` + `useEffect`
6. **Gotcha #21:** `handleK8sError` causes `void` return type -- use explicit interface types and cast with `as`
7. **Code style:** 2-space indent, 100-char line width, single quotes, ESM with `.js` extensions
8. **Zod v4:** `z.record()` requires TWO arguments -- `z.record(z.string(), z.unknown())`
9. **Chart colors:** Use CSS custom properties from globals.css -- never hardcode colors
10. **Animation:** Use constants from `animation-constants.ts` -- never magic numbers. Check `useReducedMotion()`.
11. **Cache keys:** Use `CACHE_KEYS.*` from `cache-keys.ts` -- never construct inline
12. **Config constants:** Add new values to config files, not inline in routers
13. **Package prefix:** `@voyager/` for workspace packages
14. **Error handler:** Use `handleK8sError(error, operation)` for all K8s routers
15. **tRPC procedure types:** `publicProcedure`, `protectedProcedure`, `adminProcedure`, `authorizedProcedure` -- use appropriate level
16. **QA Gate:** Console errors = FAIL. Both themes tested. `pnpm build` + `pnpm typecheck` must pass.
