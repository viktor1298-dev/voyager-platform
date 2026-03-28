# K8s Resource Explorer with Expandable Details

**Date:** 2026-03-28
**Status:** Approved
**Scope:** Full milestone (v2.0) — navigation redesign, reusable component library, 9 new resource pages, expandable details for all cluster tabs

---

## Purpose

Transform the cluster detail view from a flat 10-tab layout showing summary tables into a full K8s operations dashboard with grouped navigation, expandable detail panels, and 19 resource types — eliminating the need to run `kubectl describe` for day-to-day DevOps work.

## Safety Rule — READ-ONLY Cluster Access

**IRON RULE:** All K8s operations are strictly read-only. Only `get`, `list`, `describe` operations permitted. No `create`, `delete`, `patch`, `apply`, `edit`, `exec`, `port-forward`, or any mutating command. This applies to:

- All new tRPC routers — use only `listNamespacedX`, `listClusterCustomObject`, `readNamespacedX` from `@kubernetes/client-node`
- All kubectl commands during development — only `kubectl get` and `kubectl describe`
- New resource pages have no write actions (no delete buttons, no edit forms)
- Secrets page shows metadata only (type, age, labels) — never `.data` values
- The devops cluster (`eks-devops-separate-us-east-1`) is a production cluster — zero tolerance for writes

This is enforced at multiple layers: K8s MCP server (`ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS=true`), PreToolUse hook, and explicit backend code review.

## Design Skills

All UI/UX design and implementation MUST use:
- `frontend-design` skill — for component design, page layouts, visual hierarchy
- `ui-ux-pro-max` skill — for professional-grade visual design, icon selection, color systems, responsive behavior, accessibility

These skills are required for every wave of implementation, not just the component library wave.

---

## Pillar 1: Navigation Redesign — Grouped Tab Bar

### Current State
10 horizontal tabs that overflow: Overview, Nodes, Pods, Deployments, Services, Namespaces, Events, Logs, Metrics, Karpenter (labeled "Autoscaling" before this milestone).

### New Design
Categorized tab bar with dropdown groups. Standalone tabs for high-frequency resources, grouped dropdowns for related resources.

**Layout:**

```
[Overview] [Nodes] [Workloads ▾] [Networking ▾] [Config ▾] [Storage ▾] [Scaling ▾] [Events] [Logs] [Metrics]
```

**Groups:**

| Category | Resources | Icon |
|----------|-----------|------|
| Standalone | Overview | LayoutDashboard |
| Standalone | Nodes | Server |
| Workloads ▾ | Pods, Deployments, StatefulSets, DaemonSets, Jobs, CronJobs | Box |
| Networking ▾ | Services, Ingresses | Network |
| Config ▾ | ConfigMaps, Secrets, Namespaces | Settings |
| Storage ▾ | PVCs | HardDrive |
| Scaling ▾ | HPA, Karpenter | TrendingUp |
| Standalone | Events | Activity |
| Standalone | Logs | FileText |
| Standalone | Metrics | BarChart3 |

**Interaction:**
- Click standalone tab → navigate directly
- Click group tab → spring-animated dropdown appears (scale 0.95→1 + opacity 0→1, staggered items at 30ms)
- Click resource in dropdown → navigate, dropdown closes
- Active resource shows: category tab highlighted + underline on the active resource name in dropdown
- Keyboard: number keys for standalone tabs, arrow keys within dropdowns
- Click outside or Escape → close dropdown

**URL structure:** `/clusters/[id]/[resource]` — flat URL, no category nesting. E.g., `/clusters/[id]/statefulsets`, `/clusters/[id]/ingresses`.

**Karpenter URL migration:** The existing Karpenter page at `/autoscaling` stays at that path (no URL break). The grouped tab bar maps "Karpenter" in the "Scaling" dropdown to `/autoscaling`. NodePools, NodeClaims, and EC2NodeClasses remain as sections within the single `/autoscaling` page (multi-section layout with `ExpandableCard` per section) — they do NOT become separate URL routes. HPA gets its own new route at `/clusters/[id]/hpa`.

**Component:** `GroupedTabBar` in `apps/web/src/components/clusters/GroupedTabBar.tsx`

**File changes:**
- Replace `CLUSTER_TABS` array in `apps/web/src/app/clusters/[id]/layout.tsx` with grouped structure
- New component: `GroupedTabBar.tsx`
- New directory pages under `apps/web/src/app/clusters/[id]/` for each new resource

---

## Pillar 2: Reusable Expandable Component Library

All components go in `apps/web/src/components/expandable/`.

### ExpandableCard
Spring-animated accordion card for card-layout pages (Karpenter, Pods).

- Click summary row → `AnimatePresence` + `motion.div` expand with spring (stiffness 350, damping 24)
- Chevron icon rotates 0→180deg on expand
- Card border transitions to accent color when expanded
- Subtle box-shadow glow when expanded
- `whileHover={{ y: -2 }}` on collapsed state (lighter than standard card lift)
- Reduced motion: instant expand, no spring

### ExpandableTableRow
Same pattern adapted for DataTable rows (Nodes, Deployments, Services, etc.).

- Click row → detail section slides down below the row
- Maintains table column alignment in summary row
- Detail area spans full table width
- Row gets highlighted background when expanded

### DetailTabs
Tabbed sections inside expanded area with icon support.

- Each tab: icon (Lucide 13px) + label
- Active tab: accent color + 2px bottom border
- Tab switch: content crossfade with directional slide (left→right if moving to higher index, right→left if lower)
- Spring animation on the active tab indicator (layoutId pattern, same as main tab underline)

### DetailRow
Icon + ID + metadata display for resource lists (AMIs, subnets, security groups, etc.).

- Layout: `[icon 14px] [id monospace accent] [meta monospace dim]`
- Rounded container with subtle background
- Hover: slight background brightness increase

### DetailGrid
Auto-fit grid for organizing detail sections.

- `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`
- Responsive: 3 columns on wide, 2 on medium, 1 on narrow

### ResourceBar
Utilization bar showing used/total with percentage.

- Label with icon + resource name
- Value: `used / total (percent%)`
- Track: subtle background, fill with gradient (different color per resource type)
- Width animates from 0 on first appearance (600ms ease-out)
- Color thresholds: <70% normal gradient, 70-85% amber, >85% red

### ConditionsList
Status conditions with colored indicators.

- Each row: status dot + condition type + status text + timestamp
- Green dot for `True`, red for `False`, amber for `Unknown`
- Critical conditions (Ready=False) get subtle red glow
- Staggered row entry at 30ms

### TagPills
Key=value pill display for labels, annotations, tags.

- Pill: `[key]=[value]` in monospace
- Key in accent color, separator dim, value in secondary
- Flex wrap layout with 6px gap
- Entrance: staggered scale-in (bouncy spring)

---

## Pillar 3: Resource Pages with Expandable Details

### Existing Tabs — Enhanced

#### Nodes (DataTable → expandable rows)
**Summary row:** Name, Status (dot), Role, Kubelet Version, OS, CPU bar, Memory bar (existing)

**Expand tabs:**

| Tab | Icon | Contents |
|-----|------|----------|
| Resources | Box | Allocatable vs Capacity bars (CPU, memory, pods, ephemeral-storage) using `ResourceBar` |
| Labels & Taints | Tag | Labels as `TagPills`, taints as pills with effect badge (NoSchedule/NoExecute/PreferNoSchedule), node addresses (InternalIP, Hostname) |
| Conditions | CircleCheck | Ready, MemoryPressure, DiskPressure, PIDPressure, NetworkUnavailable with `ConditionsList` |

**Backend:** Extend `nodes.list` response with labels, taints, conditions, addresses, allocatable, capacity.

#### Pods (Card layout → expandable cards)
**Summary row:** Name, Namespace (grouped), Status (dot), Ready count, Restarts, Age (existing)

**Replace** existing `PodDetailSheet` (drawer) with inline `ExpandableCard` for consistency.

**Expand tabs:**

| Tab | Icon | Contents |
|-----|------|----------|
| Containers | Package | Per-container: image, ports, volume mounts, command (if set), env var count |
| Resources | Box | Per-container: `ResourceBar` for CPU requests/limits, memory requests/limits |
| Conditions | CircleCheck | PodScheduled, Initialized, ContainersReady, Ready + last restart reason if restarts > 0 |

**Backend:** Extend `pods.list` response with container details (image, ports, resources, volumeMounts), conditions.

#### Deployments (DataTable → expandable rows)
**Summary row:** Name, Namespace, Ready count, Image, Status, Age (existing)

**Expand tabs:**

| Tab | Icon | Contents |
|-----|------|----------|
| Replicas | BarChart3 | Ready/Updated/Available/Unavailable counts, visual replica breakdown |
| Strategy | Settings | Type (RollingUpdate/Recreate), maxSurge, maxUnavailable, selector labels as `TagPills` |
| Conditions | CircleCheck | Available, Progressing, ReplicaFailure with `ConditionsList` |

**Backend:** Extend `deployments.list` response with strategy, conditions, selector.

#### Services (DataTable → expandable rows)
**Summary row:** Name, Namespace, Type (badge), ClusterIP, Ports, Age (existing)

**Expand tabs:**

| Tab | Icon | Contents |
|-----|------|----------|
| Endpoints | Globe | Pod IPs behind the service, ready/not-ready counts per subset |
| Selectors | Tag | Label selectors as `TagPills`, matching pod count |
| Config | Settings | Session affinity, external traffic policy, load balancer ingress/hostname (if LB type), health check port |

**Backend:** Extend `services.list` response with endpoints, selector, traffic policy. New endpoint or extend existing to include Endpoints API data.

#### Namespaces (DataTable → expandable rows)
**Summary row:** Name, Status (badge), Labels Count, Created (existing)

**Expand:** No tabs needed — flat sections.
- Labels as `TagPills`
- Annotations as key-value rows
- Resource quotas if they exist (CPU/memory limits)

**Backend:** Extend `namespaces.list` response with labels, annotations, resource quotas.

#### Events (DataTable → expandable rows)
**Summary row:** Time, Type (badge), Reason, Namespace, Message truncated (existing)

**Expand:** No tabs needed — flat detail view.
- Full untruncated message text
- Involved object: kind, name, namespace, UID
- Source: component, host
- Count + first/last timestamp

**Backend:** Already has most data — ensure message is not truncated in API response, add involved object and source fields.

#### Karpenter — NodePools (Card layout → expandable cards)
**Summary row:** Name, Status dot, CPU limit, Node count, NodeClassRef (existing)

**Expand tabs:**

| Tab | Icon | Contents |
|-----|------|----------|
| Resources | Box | Limits as `DetailRow` items, resource usage from `status.resources` as `ResourceBar` |
| Config | Settings | NodeClassRef, disruption policy, consolidation after, disruption budgets, replicas |
| Conditions | CircleCheck | `ConditionsList` from status.conditions |

**Backend:** No changes needed — data already returned.

#### Karpenter — NodeClaims (NEW — Card layout)
**Summary row:** Name, Status dot, Instance type (badge), Capacity type (spot/on-demand badge), Zone, Node name

**Expand tabs:**

| Tab | Icon | Contents |
|-----|------|----------|
| Resources | Box | `ResourceBar` for CPU, Memory, Pods (requests vs allocatable), ephemeral-storage capacity |
| Config | Settings | NodeClassRef, Instance ID (from providerID), AMI ID (imageID), expireAfter, scheduling requirements as `TagPills` |
| Conditions | CircleCheck | Launched, Registered, Initialized, Ready, Consolidated with `ConditionsList` |

**Backend:** New tRPC endpoint `karpenter.listNodeClaims`. New Zod schema `karpenterNodeClaimSchema` in `packages/types/src/karpenter.ts`.

#### Karpenter — EC2NodeClasses (Card layout → expandable cards)
**Summary row:** Name, Status dot, amiFamily, Role (existing)

**Expand tabs:**

| Tab | Icon | Contents |
|-----|------|----------|
| Resources | Box | AMIs as `DetailRow` (ID + name), Subnets as `DetailRow` (ID + zone), Security Groups as `DetailRow` (ID + name) |
| Config | Settings | Block device mappings (device, size, type), metadata options (IMDS settings), tags as `TagPills`, role, instance profile |
| Conditions | CircleCheck | AMIsReady, SubnetsReady, SecurityGroupsReady, InstanceProfileReady with `ConditionsList` |

**Backend:** Extend `karpenterEC2NodeClassSchema` with `blockDeviceMappings`, `metadataOptions`, `tags`. Extract from K8s spec in `KarpenterService.listEC2NodeClasses()`.

### New Resource Pages

All new pages follow the DataTable + expandable row pattern. All use `frontend-design` and `ui-ux-pro-max` skills for layout and visual design.

#### Ingresses (NEW)
**Summary row:** Name, Namespace, Class, Hosts (comma-separated), Ports (80/443), Age

**Expand tabs:**

| Tab | Icon | Contents |
|-----|------|----------|
| Rules | Route | Per-host: hostname, paths with backend service + port, path type |
| TLS | Lock | TLS hosts, secret name per host |
| Config | Settings | Ingress class, annotations as `TagPills`, default backend if set |

**Backend:** New router `ingresses.ts`, new tRPC endpoint `ingresses.list`. Uses `NetworkingV1Api.listNamespacedIngress()`.

#### StatefulSets (NEW)
**Summary row:** Name, Namespace, Ready count, Image, Age

**Expand tabs:**

| Tab | Icon | Contents |
|-----|------|----------|
| Replicas | BarChart3 | Ready/current/updated replicas, ordinal range |
| Storage | HardDrive | Volume claim templates (name, storage class, size, access modes) |
| Conditions | CircleCheck | `ConditionsList` |

**Backend:** New router `statefulsets.ts`. Uses `AppsV1Api.listNamespacedStatefulSet()`.

#### DaemonSets (NEW)
**Summary row:** Name, Namespace, Desired/Current/Ready counts, Age

**Expand tabs:**

| Tab | Icon | Contents |
|-----|------|----------|
| Status | BarChart3 | Desired/current/ready/updated/available/unavailable node counts |
| Selectors | Tag | Node selector as `TagPills`, tolerations list |
| Conditions | CircleCheck | `ConditionsList` |

**Backend:** New router `daemonsets.ts`. Uses `AppsV1Api.listNamespacedDaemonSet()`.

#### Jobs (NEW)
**Summary row:** Name, Namespace, Status (Complete/Running/Failed badge), Completions (e.g., "3/5"), Duration, Age

**Expand tabs:**

| Tab | Icon | Contents |
|-----|------|----------|
| Status | CircleCheck | Start time, completion time, duration, succeeded/failed counts |
| Config | Settings | Parallelism, completions, backoff limit, active deadline, TTL after finished |
| Conditions | CircleCheck | `ConditionsList` (Complete, Failed) |

**Backend:** New router `jobs.ts`. Uses `BatchV1Api.listNamespacedJob()`.

#### CronJobs (NEW)
**Summary row:** Name, Namespace, Schedule (cron expression), Suspend (badge), Last Schedule, Age

**Expand tabs:**

| Tab | Icon | Contents |
|-----|------|----------|
| Schedule | Clock | Cron expression, timezone, concurrency policy, starting deadline |
| Jobs | List | Recent job history (last 3-5 jobs), success/fail status, duration |
| Config | Settings | Suspend flag, successful/failed job history limits, job template summary |

**Backend:** New router `cronjobs.ts`. Uses `BatchV1Api.listNamespacedCronJob()`.

#### ConfigMaps (NEW)
**Summary row:** Name, Namespace, Data Keys Count, Age

**Expand:** No tabs needed — flat sections.
- Data keys listed (key names only, values shown inline if < 200 chars, otherwise "... (large)" indicator)
- Labels as `TagPills`
- Binary data keys count (if any)

**Backend:** New router `configmaps.ts`. Uses `CoreV1Api.listNamespacedConfigMap()`. **Note:** Large ConfigMaps (>100KB) should have values truncated in the API response with a size indicator.

#### Secrets (NEW)
**Summary row:** Name, Namespace, Type (Opaque/TLS/docker-registry badge), Data Keys Count, Age

**Expand:** No tabs needed — flat sections.
- Data key names only — **NEVER expose `.data` values**
- Type description
- Labels as `TagPills`
- Annotations (if any, excluding kubectl.kubernetes.io internal annotations)

**Backend:** New router `secrets.ts`. Uses `CoreV1Api.listNamespacedSecret()`. **MUST strip `.data` and `.stringData` fields server-side before sending response.** Only return metadata, type, and key names.

#### PVCs (NEW)
**Summary row:** Name, Namespace, Status (Bound/Pending/Lost badge), Capacity, Storage Class, Age

**Expand tabs:**

| Tab | Icon | Contents |
|-----|------|----------|
| Status | CircleCheck | Phase, access modes, volume name, volume mode |
| Capacity | HardDrive | Requested storage, actual capacity, storage class details |
| Config | Settings | Labels as `TagPills`, annotations, finalizers |

**Backend:** New router `pvcs.ts`. Uses `CoreV1Api.listNamespacedPersistentVolumeClaim()`.

#### HPA (NEW)
**Summary row:** Name, Namespace, Reference (e.g., "Deployment/my-app"), Min/Max Replicas, Current Replicas, Age

**Expand tabs:**

| Tab | Icon | Contents |
|-----|------|----------|
| Targets | Target | Per-metric: type (CPU/Memory/Custom), target value, current value, `ResourceBar` showing current vs target |
| Scaling | TrendingUp | Current/desired/min/max replicas, behavior (scaleUp/scaleDown policies) |
| Conditions | CircleCheck | ScalingActive, AbleToScale, ScalingLimited with `ConditionsList` |

**Backend:** New router `hpa.ts`. Uses `AutoscalingV2Api.listNamespacedHorizontalPodAutoscaler()`.

---

## Motion Effects

All animations follow DESIGN.md B-style standards. New motion tokens to add to `animation-constants.ts`:

### New Tokens

| Token | Config | Use |
|-------|--------|-----|
| `DROPDOWN.enter` | spring: stiffness 400, damping 28 | Grouped tab dropdown entry |
| `DROPDOWN.exit` | duration: 0.12, ease: ease-in | Dropdown close (faster than open) |
| `EXPAND.enter` | spring: stiffness 350, damping 24 | Card/row expand |
| `EXPAND.exit` | duration: 0.15, ease: ease-in | Card/row collapse |
| `TAB_SLIDE.left` | x: -8→0, opacity: 0→1, duration: 0.15 | Tab content slide left |
| `TAB_SLIDE.right` | x: 8→0, opacity: 0→1, duration: 0.15 | Tab content slide right |

### Animation Behaviors

- **Dropdown menu:** Scale from 0.95 + opacity from 0, items stagger at 30ms, backdrop-blur behind
- **Card/row expand:** Height auto-animate via `AnimatePresence`, spring physics, content fades in after height settles
- **Chevron rotation:** 0→180deg with same spring as expand
- **Tab switch:** Crossfade with directional slide based on tab index delta
- **Resource bars:** Width from 0 on mount (600ms ease-out), smooth transition on value change
- **Detail rows:** Staggered entry at `STAGGER.fast` (30ms) when section first renders
- **Badge entrance:** Bouncy spring scale (0→1) for spot/on-demand/type badges
- **Condition dots:** Same DESIGN.md hierarchy — critical pulses with glow, warning gentle pulse, healthy static
- **Reduced motion:** All animations respect `useReducedMotion()` — instant transitions, no springs

---

## Implementation Waves

| Wave | Scope | Files | Dependencies |
|------|-------|-------|-------------|
| **1** | Component library + Grouped tab bar | `components/expandable/*`, `components/clusters/GroupedTabBar.tsx`, `layout.tsx` | None |
| **2** | Karpenter (NodeClaims, EC2NodeClass expand, NodePool expand) | `karpenter-service.ts`, `karpenter.ts` router, `autoscaling/page.tsx`, types | Wave 1 |
| **3** | Nodes + Pods expandable details | `nodes/page.tsx`, `pods/page.tsx`, extend routers | Wave 1 |
| **4** | Deployments + Services expandable | `deployments/page.tsx`, `services/page.tsx`, extend routers | Wave 1 |
| **5** | New: Ingresses, StatefulSets, DaemonSets | New routers, new pages, register in router index | Wave 1 |
| **6** | New: Jobs, CronJobs, HPA | New routers, new pages | Wave 1 |
| **7** | New: ConfigMaps, Secrets, PVCs | New routers, new pages | Wave 1 |
| **8** | Namespaces + Events expand + polish | Extend existing pages, final QA | Wave 1 |

Each wave includes backend (tRPC router) + frontend (page + components) + motion effects. Each wave uses `frontend-design` and `ui-ux-pro-max` skills for all visual design work.

---

## Backend Pattern for New Routers

All new routers follow the existing pattern:

```typescript
// apps/api/src/routers/{resource}.ts
export const {resource}Router = router({
  list: authorizedProcedure('cluster', 'viewer')
    .input(z.object({ clusterId: z.string().uuid() }))
    .output(z.array({resource}Schema))
    .query(async ({ ctx, input }) => {
      const kc = await clusterClientPool.getClient(input.clusterId)
      const api = kc.makeApiClient(k8s.{ApiClass})
      const res = await api.list{Namespaced|Cluster}{Resource}()
      return res.items.map(mapTo{Resource}(...))
    }),
})
```

**`authorizedProcedure` input field fix:** The existing `authorizedProcedure` middleware extracts the authorization object ID from `input.id` or `input.objectId`. New routers use `clusterId`. To fix this consistently across all new AND existing routers (including karpenter), update the `authorizedProcedure` middleware in `apps/api/src/trpc.ts` to also recognize `clusterId` as an authorization object ID. This is a one-line change that unblocks all 9+ new routers.

- Use `clusterClientPool.getClient()` (not duplicated connection logic)
- Use `authorizedProcedure('cluster', 'viewer')` (read-only, RBAC-checked)
- Register in `apps/api/src/routers/index.ts`
- Types in `packages/types/src/{resource}.ts`

---

## Success Criteria

- All 19 resource types accessible from grouped tab bar
- Every resource page has expandable detail panels (except Overview, Logs, Metrics)
- All expand/collapse and tab switch animations use B-style spring physics
- Reusable components used consistently across all pages
- Zero mutating K8s API calls in any new code
- Secrets page never exposes `.data` values
- All pages support both themes (dark + light)
- Reduced motion support on all animations
- `pnpm typecheck` + `pnpm build` + `pnpm test` all pass
