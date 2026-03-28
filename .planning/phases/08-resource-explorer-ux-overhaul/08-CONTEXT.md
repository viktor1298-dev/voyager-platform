# Phase 8: Resource Explorer UX Overhaul - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Unify all cluster resource tabs to match the Pods tab design pattern (namespace-grouped cards, search/filter bar, expand all/collapse all), add real-time data updates after mutations, beautify the logs viewer, and add cross-resource navigation with hyperlinks between related resources. This phase delivers 5 connected capabilities that together transform the resource explorer from a collection of disconnected table views into a cohesive, navigable K8s operations dashboard.

**In scope:** Services, Ingresses, StatefulSets, DaemonSets, Deployments, Jobs, CronJobs, HPA, ConfigMaps, Secrets, PVCs, Namespaces, Events tab redesign; Pods tab expand-all enhancement; Nodes page light-mode/spacing fix; logs viewer beautification; full K8s Watch-based real-time data for ALL resource types; cross-resource hyperlinks.

**Out of scope:** Karpenter/autoscaling tab (already good, special design), Overview tab, Metrics tab. Lens power features (exec, helm, YAML viewer, etc.) deferred to Phase 9.

</domain>

<decisions>
## Implementation Decisions

### D-01: Tab Redesign — Namespace-Grouped Card Layout
All namespaced resource tabs (services, ingresses, statefulsets, daemonsets, **deployments**, jobs, cronjobs, hpa, configmaps, secrets, pvcs) will be converted from the current ExpandableTableRow table layout to the Pods-style design:
- **Namespace-grouped** collapsible sections with namespace name + count badge
- **Search/filter bar** at the top with real-time result count
- **ExpandableCard** components for each resource item within namespace groups
- **Summary row** per card showing key info (name, status indicators, key metrics) horizontally
- **Detail panel** on expand with DetailTabs for resource-specific information

### D-02: Cluster-Scoped Resource Handling
- **Namespaces page**: Flat card list (it IS the namespace list — no namespace grouping). Search/filter + expand all still apply.
- **Events page**: Group by `involvedObject.namespace`. Cluster-wide events go under a "cluster" group.
- **Nodes page**: Keep unique table design but fix light-mode visibility issues (CPU/Memory bars invisible, poor spacing, visual hierarchy problems). NOT a full redesign — UI polish fix only.
- **Deployments page**: Redesign to match Pods-style card layout (same as all other namespaced resources).

### D-03: Expand All / Collapse All Toggle
- **Location**: Right-aligned button in the search/filter bar area, next to the search input
- **Behavior**: Toggles all cards expanded or collapsed. Text changes between "Expand All" and "Collapse All"
- **Scope**: Per-page (not per-namespace). Expanding all opens every card on the page.
- **Applies to**: All resource tabs including Pods (Pods currently lacks this)
- **State**: Local component state, not persisted across page navigations

### D-04: Real-Time Data — Full K8s Watch for ALL Resource Types (Lens-inspired)
- **Architecture**: K8s Watch API (list-then-watch pattern) for ALL resource types, not just pods/deployments/nodes. This is how Lens does it.
- **Per-user, per-cluster**: Watchers start when a user navigates to a cluster, stop when they leave. Reference-counted like the existing MetricsStreamJob pattern — first subscriber triggers watch, last disconnect stops it.
- **Event flow**: K8s informer detects ADDED/MODIFIED/DELETED → voyagerEmitter fires event → SSE stream to client → client invalidates tRPC query cache → UI updates within ~1s.
- **Event buffering**: Buffer events for ~1s before flushing to prevent UI thrashing during rapid changes (rolling deployments, etc.). Same pattern Lens uses.
- **Resource types to watch**: pods, deployments, statefulsets, daemonsets, services, ingresses, jobs, cronjobs, hpa, configmaps, secrets, pvcs, namespaces, events, nodes (15 total).
- **SSE endpoint**: New `/api/resources/stream?clusterId=<uuid>` SSE endpoint (similar to existing `/api/metrics/stream`). Streams resource change events per cluster.
- **Pod deletion fix**: Additionally add optimistic cache removal on mutation success for immediate visual feedback.
- **Scalability**: Each API pod manages its own watchers. K8s API servers handle hundreds of watch connections easily. Future optimization: shared watches via Redis pub/sub if needed at scale.

### D-05: Logs Beautifier
- **Auto-detect format**: JSON vs plain text detection per log line
- **JSON pretty-print**: Collapsible JSON objects with syntax highlighting (keys in accent color, strings in green, numbers in blue, booleans in purple)
- **Log level badges**: ERROR (red), WARN (amber), INFO (blue), DEBUG (gray) — extracted from log line content
- **Timestamp parsing**: Detect and format timestamps consistently (relative time on hover shows absolute)
- **Search within logs**: Text search with match highlighting and match count
- **Line numbering**: Gutter with line numbers, clickable for permalink/selection
- **Word wrap toggle**: Option to wrap long lines vs horizontal scroll
- **Existing infrastructure**: Keep the current `react-resizable-panels` split layout, pod/container/tail selectors. Enhance the log output area.

### D-06: Cross-Resource Navigation — Bidirectional Hyperlinks
Add new tabs to expanded resource detail panels:

| Resource | New Detail Tab | Content |
|----------|---------------|---------|
| Pod | Logs | Embedded log viewer for that specific pod (reuse log components) |
| Pod | Node | Hyperlink to the node this pod runs on |
| Deployment | Pods | List of pods matching selector labels, each hyperlinked to pod detail |
| StatefulSet | Pods | List of pods matching selector labels, each hyperlinked |
| DaemonSet | Pods | List of pods matching selector labels, each hyperlinked |
| Service | Endpoints | List of pods backing this service, each hyperlinked |
| Ingress | Services | List of services referenced in rules, each hyperlinked |
| Job | Pods | List of pods created by this job, each hyperlinked |
| CronJob | Jobs | List of jobs created by this cronjob, each hyperlinked |
| HPA | Target | Hyperlink to the scale target (deployment/statefulset) |

- **Hyperlink behavior**: Clicking a hyperlink navigates to the appropriate tab and scrolls to / auto-expands the target resource
- **Backend requirements**: Most cross-resource data is available via label selectors. May need new tRPC procedures for efficient cross-resource queries (e.g., `pods.listBySelector`, `pods.listByOwner`).

### Claude's Discretion
- Specific card summary layout per resource type (what columns to show) — Claude decides based on each resource's key info
- Animation details for the new card layouts — follow existing B-style animation constants
- Exact color scheme for log level badges and JSON syntax highlighting — follow existing chart-theme.ts patterns
- Whether to add a "Copy log line" button or "Download logs" button to the beautified log viewer
- Search/filter implementation details (debounce timing, fuzzy vs exact match)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design & Animation Standards
- `docs/DESIGN.md` — Animation & interaction design source of truth (B-style: Confident & Expressive). Read before ANY UI change.
- `apps/web/src/lib/animation-constants.ts` — Motion v12 timing/easing/variant constants

### Reference Implementations (Pods Tab = Gold Standard)
- `apps/web/src/app/clusters/[id]/pods/page.tsx` — The target design pattern. All tabs should match this.
- `apps/web/src/app/clusters/[id]/autoscaling/page.tsx` — Karpenter design (do NOT change, but reference for card patterns)

### Expandable Component Library
- `apps/web/src/components/expandable/ExpandableCard.tsx` — Card-based expand (use this for new designs)
- `apps/web/src/components/expandable/ExpandableTableRow.tsx` — Table-based expand (being replaced)
- `apps/web/src/components/expandable/DetailTabs.tsx` — Tabbed detail panels (reuse for cross-resource tabs)
- `apps/web/src/components/expandable/index.ts` — Full component index

### Current Resource Tab Pages (to be redesigned)
- `apps/web/src/app/clusters/[id]/deployments/page.tsx`
- `apps/web/src/app/clusters/[id]/services/page.tsx`
- `apps/web/src/app/clusters/[id]/ingresses/page.tsx`
- `apps/web/src/app/clusters/[id]/statefulsets/page.tsx`
- `apps/web/src/app/clusters/[id]/daemonsets/page.tsx`
- `apps/web/src/app/clusters/[id]/jobs/page.tsx`
- `apps/web/src/app/clusters/[id]/cronjobs/page.tsx`
- `apps/web/src/app/clusters/[id]/hpa/page.tsx`
- `apps/web/src/app/clusters/[id]/configmaps/page.tsx`
- `apps/web/src/app/clusters/[id]/secrets/page.tsx`
- `apps/web/src/app/clusters/[id]/pvcs/page.tsx`
- `apps/web/src/app/clusters/[id]/namespaces/page.tsx`
- `apps/web/src/app/clusters/[id]/events/page.tsx`

### Nodes Page (light-mode fix)
- `apps/web/src/app/clusters/[id]/nodes/page.tsx` — Nodes page (fix light-mode bar visibility, spacing)

### Logs
- `apps/web/src/app/clusters/[id]/logs/page.tsx` — Current logs viewer (to be enhanced)
- `apps/api/src/routers/logs.ts` — Logs tRPC router (pods, get, tail, stream)

### Backend Routers (data sources)
- `apps/api/src/routers/pods.ts` — Pod list/delete (mutation needs cache invalidation fix)
- `apps/api/src/routers/services.ts` — Services list
- `apps/api/src/routers/ingresses.ts` — Ingresses list
- `apps/api/src/routers/statefulsets.ts` — StatefulSets list
- `apps/api/src/routers/daemonsets.ts` — DaemonSets list
- `apps/api/src/routers/jobs.ts` — Jobs list
- `apps/api/src/routers/cronjobs.ts` — CronJobs list
- `apps/api/src/routers/hpa.ts` — HPA list
- `apps/api/src/routers/configmaps.ts` — ConfigMaps list
- `apps/api/src/routers/secrets.ts` — Secrets list
- `apps/api/src/routers/pvcs.ts` — PVCs list

### Real-Time Infrastructure
- `apps/api/src/lib/event-emitter.ts` — VoyagerEventEmitter (pod/deployment/node events)
- `apps/api/src/lib/cluster-watch-manager.ts` — K8s informers for real-time updates
- `apps/api/src/lib/error-handler.ts` — handleK8sError for standardized error handling
- `apps/api/src/lib/cache-keys.ts` — Centralized Redis cache key builders

### Config
- `apps/web/src/lib/trpc.ts` — tRPC client setup (query invalidation patterns)
- `apps/web/src/components/charts/chart-theme.ts` — Color/theme patterns to follow for log syntax highlighting

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **ExpandableCard** (`components/expandable/ExpandableCard.tsx`): Card-based expand component — use for all redesigned tabs. Already used by Pods and Karpenter.
- **DetailTabs** (`components/expandable/DetailTabs.tsx`): Tabbed detail panels with slide animation — add new cross-resource tabs here.
- **ResourceBar** (`components/expandable/ResourceBar.tsx`): CPU/Memory progress bar — reuse for resource types that have resource metrics.
- **ConditionsList** (`components/expandable/ConditionsList.tsx`): K8s conditions display — reuse for any resource with conditions.
- **TagPills** (`components/expandable/TagPills.tsx`): Label/annotation display — reuse across all resource detail panels.
- **DetailRow, DetailGrid** (`components/expandable/`): Grid layouts for detail sections.
- **Pods page** (`clusters/[id]/pods/page.tsx`): 629-line reference implementation for namespace grouping, search, expand pattern.
- **Animation constants** (`lib/animation-constants.ts`): B-style springs, stagger, expand variants — all exist and should be reused.

### Established Patterns
- **K8s resource router pattern**: `authorizedProcedure('cluster', 'viewer')` + `clusterClientPool.getClient()` + `cached()` with 15s TTL. All resource routers follow this pattern.
- **tRPC query with refetch**: `trpc.resource.list.useQuery()` with `staleTime: 30_000` and `refetchInterval` for live updates.
- **Mutation → invalidation**: Pattern exists (pod delete mutation) but needs the `invalidate()` call added.
- **Namespace collapsible sections**: `Collapsible` + `CollapsibleTrigger` + `CollapsibleContent` from shadcn/ui, used in Pods page.
- **Motion animations**: `motion.div` with variants from `animation-constants.ts` for entrance, expand, hover effects.

### Integration Points
- **Cluster detail layout** (`clusters/[id]/layout.tsx`): GroupedTabBar with 19 resource types in categorized dropdowns — no changes needed.
- **tRPC router registry** (`api/src/routers/index.ts`): May need new procedures for cross-resource queries.
- **Event emitter** (`api/src/lib/event-emitter.ts`): May need new event types for resource mutations beyond pods.

</code_context>

<specifics>
## Specific Ideas

- User explicitly referenced the Pods tab as the "gold standard" design — all other tabs should look like it
- User specifically mentioned Karpenter tab should NOT be touched — it has its own special design
- User noticed the stale data issue after pod deletion — this is a specific bug (missing query invalidation)
- User wants "proper search bar" like Pods has — every tab must have search/filter
- User wants namespace grouping as visual organization — "separated properly by namespaces"
- User wants logs to not look like "exactly like in terminal" — needs proper formatting/beautification
- User wants "everything must be connected in the backend" with hyperlinks — full cross-resource navigation

</specifics>

<deferred>
## Deferred Ideas

### Phase 9 — Lens-Inspired Power Features (confirmed by user)
**Tier 1 (High Impact):**
- Pod exec/terminal — web terminal into any pod
- Pod log streaming — real-time SSE-based log tail (not polling)
- Resource YAML viewer — view raw YAML/JSON of any resource
- Restart workloads — rollout restart for Deployments/StatefulSets/DaemonSets
- Scale workloads — change replica count from the UI

**Tier 2 (Weekly Use):**
- Helm releases — view installed charts, versions, values, upgrade/rollback
- Events timeline — visual timeline of cluster events
- Resource diff — compare current vs desired state
- Port forwarding — forward pod port to temporary browser-accessible URL

**Tier 3 (Nice to Have):**
- CRD browser — view custom resources generically
- RBAC viewer — who can do what on which resources
- Network policy map — visual graph of allowed traffic flows
- Resource quotas dashboard — namespace usage vs limits

**Plus:** Update all existing tabs/features to be Lens-inspired with live data

</deferred>

---

*Phase: 08-resource-explorer-ux-overhaul*
*Context gathered: 2026-03-28*
