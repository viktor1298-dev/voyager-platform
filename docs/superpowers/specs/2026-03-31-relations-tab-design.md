# Relations Tab — Design Spec

**Date:** 2026-03-31
**Feature:** Add a "Relations" tab to all resource detail views showing the full family of connected K8s resources with clickable cross-navigation.

---

## Problem

Resource detail tabs currently show limited relationships — a Deployment shows its Pods, a Pod shows its Node. But K8s resources form deep chains (Ingress → Service → Deployment → ReplicaSet → Pod → Node) with side connections (ConfigMaps, Secrets, PVCs, HPAs). Users must manually hop between tabs to understand the full picture. There's no single view that shows "everything connected to this resource."

## Solution

Add a **"Relations"** tab to every resource type's detail view. When opened, it displays all related resources in a flat, auto-flow grid grouped by kind, ordered from highest to lowest in the hierarchy. Each resource is a clickable link that navigates to that resource's tab and highlights it. The current resource appears in the list with a visual marker.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tab name | "Relations" | Short, fits existing tab bar style (Containers, Resources, Conditions...) |
| Depth | Full ancestry chain | Walk both directions — find parents AND children of the target resource |
| Layout | Auto-flow CSS grid | `grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))` — responsive 2-3 columns, matches existing `DetailGrid` pattern |
| Metadata per link | Icon + Name + Status badge | Quick health visibility without clicking through |
| Current resource | Highlighted | Accent left-border + "← current" italic marker — shows position in family |
| Section order | Top-down hierarchy | Ingresses first, Nodes last — reads like a deployment flow |
| Architecture | Backend-computed | New tRPC endpoint; server has all data in WatchManager cache |

## Resource Types in Scope (13)

Ordered by hierarchy position (display order, `order` field value):

| # | Kind | Display Name | `order` | Notes |
|---|------|-------------|---------|-------|
| 1 | Ingress | Ingresses | 1 | |
| 2 | Service | Services | 2 | |
| 3 | Deployment | Deployments | 3 | |
| 4 | StatefulSet | StatefulSets | 4 | |
| 5 | DaemonSet | DaemonSets | 5 | |
| 6 | Job | Jobs | 6 | |
| 7 | CronJob | CronJobs | 7 | |
| 8 | Pod | Pods | 8 | |
| 9 | HorizontalPodAutoscaler | HPAs | 9 | |
| 10 | ConfigMap | ConfigMaps | 10 | |
| 11 | Secret | Secrets | 11 | |
| 12 | PersistentVolumeClaim | PVCs | 12 | |
| 13 | Node | Nodes | 13 | |

**Excluded:** ReplicaSets (not in WatchManager — resolved indirectly via label selectors, same approach as topology.ts), Events, Namespaces, ResourceQuotas, NetworkPolicies.

### Kind-to-Tab URL Mapping

The frontend needs to map `kind` from the API response to the cluster tab URL segment:

```typescript
const KIND_TO_TAB: Record<string, string> = {
  Ingress: 'ingresses',
  Service: 'services',
  Deployment: 'deployments',
  StatefulSet: 'statefulsets',
  DaemonSet: 'daemonsets',
  Job: 'jobs',
  CronJob: 'cronjobs',
  Pod: 'pods',
  HorizontalPodAutoscaler: 'hpa',
  ConfigMap: 'configmaps',
  Secret: 'secrets',
  PersistentVolumeClaim: 'pvcs',
  Node: 'nodes',
}
```

## Relationship Resolution

The backend resolves relationships using these mechanisms:

### Already Extracted by Resource Mappers

| Relationship | Mechanism | Source |
|-------------|-----------|--------|
| Pod → StatefulSet/DaemonSet/Job | `metadata.ownerReferences` (direct owner) | resource-mappers.ts |
| Pod → Deployment | Pod labels matched against Deployment `spec.selector.matchLabels` (same approach as topology.ts lines 247-258 — bypasses ReplicaSet since it's not in WatchManager) | topology.ts |
| Job → CronJob | `metadata.ownerReferences` | ownerReferences on raw K8s object |
| Service → Pod | `spec.selector` matched against `pod.metadata.labels` | topology.ts |
| Ingress → Service | `spec.rules[].http.paths[].backend.service.name` (namespace-local only — K8s Ingress rules don't support cross-namespace service references) | topology.ts |
| HPA → Deployment/StatefulSet | `spec.scaleTargetRef` | resource-mappers.ts |
| Pod → Node | `spec.nodeName` | resource-mappers.ts |

**Note on ReplicaSets:** ReplicaSets are NOT in WatchManager (no informer). Pod → Deployment resolution uses label selector matching (compare pod labels against Deployment's `spec.selector.matchLabels`), the same approach as `topology.ts`. ReplicaSets are an implementation detail that users don't need to see.

### Needs New Extraction

| Relationship | Mechanism | Where to Add |
|-------------|-----------|--------------|
| Pod → ConfigMap | `spec.volumes[].configMap.name` + `spec.containers[].envFrom[].configMapRef.name` + `spec.containers[].env[].valueFrom.configMapKeyRef.name` + `spec.volumes[].projected.sources[].configMap.name` (same patterns for `initContainers`) | resource-mappers.ts (pod mapper) |
| Pod → Secret | `spec.volumes[].secret.secretName` + `spec.containers[].envFrom[].secretRef.name` + `spec.containers[].env[].valueFrom.secretKeyRef.name` + `spec.volumes[].projected.sources[].secret.name` (same patterns for `initContainers`) | resource-mappers.ts (pod mapper) |
| Pod → PVC | `spec.volumes[].persistentVolumeClaim.claimName` | resource-mappers.ts (pod mapper) |
| StatefulSet → PVC | `spec.volumeClaimTemplates[].metadata.name` — K8s generates PVC names as `{vctName}-{stsName}-{ordinal}` (e.g., `data-mysql-0`). Match PVCs whose name starts with `{vctName}-{stsName}-` | resource-mappers.ts (sts mapper) |

## Backend Design

### New Router: `relations`

**File:** `apps/api/src/routers/relations.ts`
**Registration:** Add to `apps/api/src/routers/index.ts` as `relations: relationsRouter`

A dedicated router rather than extending `resources.ts` (which is a minimal 30-line snapshot endpoint) or `topology.ts` (which returns a graph for React Flow). The relations endpoint returns a flat grouped list, not a graph — different shape, different consumer.

### Endpoint: `relations.forResource`

**Input:**
```typescript
{
  clusterId: string
  kind: string        // e.g., "Deployment"
  namespace: string   // e.g., "default"
  name: string        // e.g., "my-app"
}
```

**Output:**
```typescript
{
  groups: Array<{
    kind: string           // e.g., "Pod"
    displayName: string    // e.g., "Pods" (plural for section header)
    order: number          // hierarchy position for sorting
    resources: Array<{
      name: string
      namespace: string
      status: string       // e.g., "Running", "Ready", "Active"
      statusCategory: string  // "healthy" | "warning" | "error" | "unknown"
      isCurrent: boolean   // true for the resource being viewed
    }>
  }>
}
```

Empty groups are omitted from the response.

### Status Derivation Table

The endpoint reads raw K8s objects from WatchManager and must derive status per resource type:

| Kind | Display Status | Source | Category Mapping |
|------|---------------|--------|-----------------|
| Pod | Phase string | `status.phase` ("Running", "Pending", "Succeeded", "Failed", "Unknown") | Running/Succeeded → healthy, Pending → warning, Failed → error, Unknown → unknown |
| Deployment | Availability | `status.conditions` where `type=Available` | Available=True + all replicas ready → healthy, progressing → warning, Available=False → error |
| StatefulSet | Ready ratio | `status.readyReplicas` vs `spec.replicas` | All ready → healthy, partial → warning, 0 ready → error |
| DaemonSet | Scheduled | `status.desiredNumberScheduled` vs `currentNumberScheduled` | All scheduled → healthy, mismatch → warning, 0 → error |
| Job | Completion | `status.conditions` where `type=Complete` or `type=Failed` | Complete → healthy, active → warning, Failed → error |
| CronJob | Suspend status | `spec.suspend` | Not suspended → healthy, suspended → unknown |
| Service | Always healthy | No meaningful status | → healthy |
| Ingress | Always healthy | No meaningful status | → healthy |
| Node | Ready condition | `status.conditions` where `type=Ready` | Ready=True → healthy, Ready=False → error, Unknown → warning |
| HPA | Scaling status | `status.conditions` where `type=ScalingActive` | Active → healthy, unable → warning |
| ConfigMap | Always healthy | No meaningful status | → healthy |
| Secret | Always healthy | No meaningful status | → healthy |
| PVC | Phase | `status.phase` ("Bound", "Pending", "Lost") | Bound → healthy, Pending → warning, Lost → error |

### Caching Strategy

The tRPC query uses `staleTime: 30_000` (30s, project default) and `refetchOnWindowFocus: true`. No live SSE updates for v1 — the Relations tab shows a point-in-time snapshot from WatchManager cache, which itself is kept fresh by K8s informers (~2s latency). Status badges may lag by up to 30s between tab switches. This is acceptable for a relationship view that users open for exploration, not continuous monitoring.

### Resolution Algorithm

1. Look up the target resource in WatchManager cache (raw K8s object)
2. Walk UP: for Pods, match labels against Deployment/StatefulSet/DaemonSet selectors (no ReplicaSet traversal — same approach as topology.ts). For Jobs, check ownerReferences for CronJob. For other types, check ownerReferences directly.
3. Walk DOWN: find resources that reference the target via selectors, ownerReferences, volume mounts. E.g., from a Deployment, find Pods whose labels match its selector, then from those Pods find their ConfigMaps/Secrets/PVCs/Nodes.
4. Walk SIDEWAYS: find related resources at the same level. E.g., from a Deployment, find Services whose selector matches the same pod labels, find HPAs whose scaleTargetRef points to this Deployment.
5. Deduplicate by `kind/namespace/name` using a visited set (prevents infinite loops from selector-based bidirectional matches)
6. Group by kind, sort groups by hierarchy `order` value, sort resources within groups alphabetically by name

### Reuse from topology.ts

The relationship-walking logic in `topology.ts` already handles steps 2-4 for 7 resource types. The new endpoint should extract the shared matching logic (label selector matching, ownerReference traversal) into reusable functions rather than duplicating it. Key functions to extract:

- `matchLabels(selector, labels)` — already exists at topology.ts line 28
- `findOwnerChain(resource)` — walk ownerReferences up
- `findBySelector(kind, selector, allResources)` — find resources matching a label selector

## Frontend Design

### New Component: `RelationsTab`

**Location:** `apps/web/src/components/resource/RelationsTab.tsx`

**Props:**
```typescript
interface RelationsTabProps {
  clusterId: string
  kind: string
  namespace: string
  name: string
}
```

**Behavior:**
1. Calls `trpc.relations.forResource.useQuery({ clusterId, kind, namespace, name })`
2. Renders a CSS grid container: `grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5`
3. Each group renders:
   - Section header: `text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]`
   - Each resource as a `RelationItem` inline component: `RelatedResourceLink` (for icon + name + click navigation) followed by an inline status badge pill. The existing `RelatedResourceLink` component renders icon + name only — the status badge is placed adjacent to it, not inside it. No changes to `RelatedResourceLink` itself.
4. Current resource row: accent background + left border + "← current" marker (not a link, no `RelatedResourceLink` — just a styled div)
5. Loading state: skeleton matching grid layout
6. Empty state: "No related resources found" muted text

### Integration Points

Add the Relations tab to every resource page's tab array. Example for Deployments:

```typescript
{
  id: 'relations',
  label: 'Relations',
  icon: <GitFork className="h-3.5 w-3.5" />,
  content: (
    <RelationsTab
      clusterId={clusterId}
      kind="Deployment"
      namespace={deployment.namespace}
      name={deployment.name}
    />
  ),
}
```

The tab is added to all resource types that have `DetailTabs`: Pods, Deployments, StatefulSets, DaemonSets, Jobs, CronJobs, Services, Ingresses, ConfigMaps, Secrets, PVCs, HPAs, Nodes.

### Navigation

Clicking a resource link calls `navigateToResource(tab, resourceKey)` from the existing `useResourceNavigation()` hook. This navigates to `/clusters/{id}/{tab}?highlight={namespace/name}`, which auto-expands and scrolls to the target resource.

### Status Badges

Reuse the existing `ResourceStatusBadge` component or the inline pill pattern already used across the app. Map `statusCategory` from the API response to the existing color scheme:

- `healthy` → green (`--color-status-active`)
- `warning` → amber (`--color-status-warning`)
- `error` → red (`--color-status-error`)
- `unknown` → grey (`--color-text-muted`)

## Resource Mapper Changes

### Pod Mapper — Add Volume References

Extract ConfigMap, Secret, and PVC names from pod specs. Scan both `containers` and `initContainers`:

```typescript
// Helper: collect refs from a container array
function collectContainerRefs(containers: V1Container[]) {
  const configMapRefs = new Set<string>()
  const secretRefs = new Set<string>()
  for (const c of containers) {
    // envFrom bulk imports
    for (const e of c.envFrom || []) {
      if (e.configMapRef?.name) configMapRefs.add(e.configMapRef.name)
      if (e.secretRef?.name) secretRefs.add(e.secretRef.name)
    }
    // individual env var references
    for (const e of c.env || []) {
      if (e.valueFrom?.configMapKeyRef?.name) configMapRefs.add(e.valueFrom.configMapKeyRef.name)
      if (e.valueFrom?.secretKeyRef?.name) secretRefs.add(e.valueFrom.secretKeyRef.name)
    }
  }
  return { configMapRefs, secretRefs }
}

// In the pod mapper function, add:
const allContainers = [...(spec.containers || []), ...(spec.initContainers || [])]
const { configMapRefs, secretRefs } = collectContainerRefs(allContainers)

// Volume-based refs
for (const v of spec.volumes || []) {
  if (v.configMap?.name) configMapRefs.add(v.configMap.name)
  if (v.secret?.secretName) secretRefs.add(v.secret.secretName)
  if (v.projected?.sources) {
    for (const s of v.projected.sources) {
      if (s.configMap?.name) configMapRefs.add(s.configMap.name)
      if (s.secret?.name) secretRefs.add(s.secret.name)
    }
  }
}

const pvcRefs = (spec.volumes || [])
  .filter(v => v.persistentVolumeClaim)
  .map(v => v.persistentVolumeClaim!.claimName)

// Add to mapped output:
// configMapRefs: [...configMapRefs]
// secretRefs: [...secretRefs]
// pvcRefs
```

### StatefulSet Mapper — Add VolumeClaimTemplate Names

Extract PVC template names for matching against actual PVCs:

```typescript
volumeClaimTemplateNames: (raw.spec?.volumeClaimTemplates || []).map(t => t.metadata.name)
```

## Shared Type Updates

Add to `@voyager/types`:

```typescript
interface RelationGroup {
  kind: string
  displayName: string
  order: number
  resources: RelationResource[]
}

interface RelationResource {
  name: string
  namespace: string
  status: string
  statusCategory: 'healthy' | 'warning' | 'error' | 'unknown'
  isCurrent: boolean
}
```

## Edge Cases

- **Resource not found in cache:** Return empty groups array. WatchManager may not have the resource if informers haven't connected yet.
- **Circular references:** The algorithm walks a directed graph (ownerReferences are acyclic by K8s design). Selector-based matches could theoretically loop — use a visited set during traversal.
- **Large families (100+ pods):** The grid handles this naturally — it just adds rows. No pagination needed for v1 since clusters in scope have reasonable pod counts.
- **Resource types without relations:** Some resources (e.g., a standalone ConfigMap not mounted by any pod) will have an empty Relations tab. Show "No related resources found."
- **Cross-namespace relations:** The graph walk should not pre-filter candidates by the source resource's namespace (a Service in namespace A could select Pods in namespace B if labels match). However, most K8s references are namespace-local by design (e.g., Ingress `backend.service.name` is always same-namespace). No special handling needed — just don't add a namespace filter to the candidate lookup.

## What This Does NOT Change

- No changes to existing tabs, components, or styling
- No changes to the topology page
- No changes to SSE or WatchManager behavior
- No new database tables or migrations
- No changes to the Helm chart
