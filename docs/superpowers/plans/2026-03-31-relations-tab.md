# Relations Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Relations" tab to every K8s resource detail view that shows all connected resources (full ancestry chain) with clickable cross-navigation links.

**Architecture:** New `relations` tRPC router walks the K8s relationship graph server-side using WatchManager cached data. Returns grouped, sorted results. Frontend `RelationsTab` component renders an auto-flow CSS grid with section headers and `RelatedResourceLink` navigation. Pod mapper extended to extract ConfigMap/Secret/PVC volume references.

**Tech Stack:** tRPC 11, @kubernetes/client-node types, Zod v4, React 19, Tailwind 4, lucide-react

**Spec:** `docs/superpowers/specs/2026-03-31-relations-tab-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `packages/types/src/relations.ts` | Shared types: `RelationGroup`, `RelationResource`, `KIND_TO_TAB`, `RELATION_KINDS` |
| Modify | `packages/types/src/index.ts:1-4` | Re-export relations types |
| Modify | `apps/api/src/lib/resource-mappers.ts:146-206` | Add `configMapRefs`, `secretRefs`, `pvcRefs` to pod mapper output |
| Modify | `apps/api/src/lib/resource-mappers.ts:529-558` | Add `volumeClaimTemplateNames` to statefulset mapper output |
| Create | `apps/api/src/lib/relation-resolver.ts` | Core relationship walking logic — `resolveRelations(watchManager, clusterId, kind, namespace, name)` |
| Create | `apps/api/src/routers/relations.ts` | tRPC router with `forResource` query procedure |
| Modify | `apps/api/src/routers/index.ts:44,91` | Import + register `relationsRouter` |
| Create | `apps/web/src/components/resource/RelationsTab.tsx` | Frontend component — grid layout, section headers, relation items |
| Modify | 13 resource page files in `apps/web/src/app/clusters/[id]/` | Add Relations tab to each page's tabs array |

---

### Task 1: Shared Types

**Files:**
- Create: `packages/types/src/relations.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Create relations types file**

```typescript
// packages/types/src/relations.ts

export interface RelationGroup {
  kind: string
  displayName: string
  order: number
  resources: RelationResource[]
}

export interface RelationResource {
  name: string
  namespace: string
  status: string
  statusCategory: 'healthy' | 'warning' | 'error' | 'unknown'
  isCurrent: boolean
}

/** Hierarchy order for display sorting — lower number = higher in chain */
export const RELATION_KINDS = [
  { kind: 'Ingress', displayName: 'Ingresses', order: 1 },
  { kind: 'Service', displayName: 'Services', order: 2 },
  { kind: 'Deployment', displayName: 'Deployments', order: 3 },
  { kind: 'StatefulSet', displayName: 'StatefulSets', order: 4 },
  { kind: 'DaemonSet', displayName: 'DaemonSets', order: 5 },
  { kind: 'Job', displayName: 'Jobs', order: 6 },
  { kind: 'CronJob', displayName: 'CronJobs', order: 7 },
  { kind: 'Pod', displayName: 'Pods', order: 8 },
  { kind: 'HorizontalPodAutoscaler', displayName: 'HPAs', order: 9 },
  { kind: 'ConfigMap', displayName: 'ConfigMaps', order: 10 },
  { kind: 'Secret', displayName: 'Secrets', order: 11 },
  { kind: 'PersistentVolumeClaim', displayName: 'PVCs', order: 12 },
  { kind: 'Node', displayName: 'Nodes', order: 13 },
] as const

/** Maps API kind → cluster tab URL segment */
export const KIND_TO_TAB: Record<string, string> = {
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

- [ ] **Step 2: Add re-export to index.ts**

In `packages/types/src/index.ts`, add:
```typescript
export * from './relations.js'
```

- [ ] **Step 3: Verify types build**

Run: `pnpm --filter @voyager/types build`
Expected: Clean build with no errors

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/relations.ts packages/types/src/index.ts
git commit -m "feat(types): add shared Relations tab types and constants"
```

---

### Task 2: Pod Mapper — Extract Volume References

**Files:**
- Modify: `apps/api/src/lib/resource-mappers.ts` (pod mapper at lines 146-206)

The pod mapper currently returns labels, status, containers, conditions — but NOT which ConfigMaps, Secrets, or PVCs the pod mounts. The relations resolver needs this data.

- [ ] **Step 1: Add helper function above mapPod**

Insert before the pod mapper function (before line 144):

```typescript
/** Extract ConfigMap and Secret names referenced by containers via env/envFrom */
function collectContainerRefs(containers: k8s.V1Container[]) {
  const configMapRefs = new Set<string>()
  const secretRefs = new Set<string>()
  for (const c of containers) {
    for (const e of c.envFrom ?? []) {
      if (e.configMapRef?.name) configMapRefs.add(e.configMapRef.name)
      if (e.secretRef?.name) secretRefs.add(e.secretRef.name)
    }
    for (const e of c.env ?? []) {
      if (e.valueFrom?.configMapKeyRef?.name) configMapRefs.add(e.valueFrom.configMapKeyRef.name)
      if (e.valueFrom?.secretKeyRef?.name) secretRefs.add(e.valueFrom.secretKeyRef.name)
    }
  }
  return { configMapRefs, secretRefs }
}
```

- [ ] **Step 2: Add volume ref extraction inside mapPod body**

Insert after `const containers = ...` (around line 179), before the return statement:

```typescript
  const allContainers = [...(p.spec?.containers ?? []), ...(p.spec?.initContainers ?? [])]
  const { configMapRefs, secretRefs } = collectContainerRefs(allContainers)

  for (const v of p.spec?.volumes ?? []) {
    if (v.configMap?.name) configMapRefs.add(v.configMap.name)
    if (v.secret?.secretName) secretRefs.add(v.secret.secretName)
    if (v.projected?.sources) {
      for (const s of v.projected.sources) {
        if (s.configMap?.name) configMapRefs.add(s.configMap.name)
        if (s.secret?.name) secretRefs.add(s.secret.name)
      }
    }
  }

  const pvcRefs = (p.spec?.volumes ?? [])
    .filter((v) => v.persistentVolumeClaim)
    .map((v) => v.persistentVolumeClaim!.claimName)
```

- [ ] **Step 3: Add new fields to return object**

Add these three fields to the return object (after `labels` at line 204):

```typescript
    configMapRefs: [...configMapRefs],
    secretRefs: [...secretRefs],
    pvcRefs,
```

- [ ] **Step 4: Verify build**

Run: `pnpm --filter api build`
Expected: Clean build (these are additive fields — no breaking changes to existing consumers)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/resource-mappers.ts
git commit -m "feat(api): extract configMap/secret/PVC refs from pod mapper"
```

---

### Task 3: StatefulSet Mapper — Add VolumeClaimTemplate Names

**Files:**
- Modify: `apps/api/src/lib/resource-mappers.ts` (statefulset mapper at lines 529-558)

StatefulSet → PVC matching requires knowing the VCT template names. The mapper already extracts `volumeClaimTemplates` with full details, but we also need the raw template names for prefix-matching PVCs.

- [ ] **Step 1: Add volumeClaimTemplateNames to return object**

In `mapStatefulSet` return object (around line 555, after `conditions`), add:

```typescript
    volumeClaimTemplateNames: (ss.spec?.volumeClaimTemplates ?? []).map(
      (vct) => vct.metadata?.name ?? '',
    ).filter(Boolean),
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter api build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/resource-mappers.ts
git commit -m "feat(api): add volumeClaimTemplateNames to statefulset mapper"
```

---

### Task 4: Relation Resolver — Core Graph Walking Logic

**Files:**
- Create: `apps/api/src/lib/relation-resolver.ts`

This is the core of the feature. The resolver takes a resource identifier, walks the K8s relationship graph using WatchManager cached data, and returns grouped/sorted results.

- [ ] **Step 1: Create the relation-resolver.ts file**

```typescript
// apps/api/src/lib/relation-resolver.ts
import type * as k8s from '@kubernetes/client-node'
import { RELATION_KINDS, type RelationGroup, type RelationResource } from '@voyager/types'
import { mapPod } from './resource-mappers.js'
import type { WatchManager } from './watch-manager.js'

// ── Label Matching (same as topology.ts) ──────────────────────

function matchLabels(
  selector: Record<string, string> | undefined,
  labels: Record<string, string> | undefined,
): boolean {
  if (!selector || !labels) return false
  return Object.entries(selector).every(([k, v]) => labels[k] === v)
}

// ── Status Derivation ─────────────────────────────────────────

type StatusCategory = 'healthy' | 'warning' | 'error' | 'unknown'

function deriveStatus(kind: string, raw: k8s.KubernetesObject): { status: string; statusCategory: StatusCategory } {
  const obj = raw as Record<string, any>
  const status = obj.status ?? {}
  const spec = obj.spec ?? {}

  switch (kind) {
    case 'Pod': {
      const phase = obj.metadata?.deletionTimestamp ? 'Terminating' : (status.phase ?? 'Unknown')
      const cat: StatusCategory =
        phase === 'Running' || phase === 'Succeeded' ? 'healthy' :
        phase === 'Pending' ? 'warning' :
        phase === 'Failed' || phase === 'Terminating' ? 'error' : 'unknown'
      return { status: phase, statusCategory: cat }
    }
    case 'Deployment': {
      const available = (status.conditions ?? []).find((c: any) => c.type === 'Available')
      const ready = status.readyReplicas ?? 0
      const desired = spec.replicas ?? 0
      if (available?.status === 'True' && ready >= desired) return { status: `${ready}/${desired}`, statusCategory: 'healthy' }
      if (ready > 0) return { status: `${ready}/${desired}`, statusCategory: 'warning' }
      return { status: `${ready}/${desired}`, statusCategory: 'error' }
    }
    case 'StatefulSet': {
      const ready = status.readyReplicas ?? 0
      const desired = spec.replicas ?? 0
      if (ready >= desired && desired > 0) return { status: `${ready}/${desired}`, statusCategory: 'healthy' }
      if (ready > 0) return { status: `${ready}/${desired}`, statusCategory: 'warning' }
      return { status: `${ready}/${desired}`, statusCategory: desired === 0 ? 'unknown' : 'error' }
    }
    case 'DaemonSet': {
      const desired = status.desiredNumberScheduled ?? 0
      const current = status.currentNumberScheduled ?? 0
      if (current >= desired && desired > 0) return { status: `${current}/${desired}`, statusCategory: 'healthy' }
      if (current > 0) return { status: `${current}/${desired}`, statusCategory: 'warning' }
      return { status: `${current}/${desired}`, statusCategory: desired === 0 ? 'unknown' : 'error' }
    }
    case 'Job': {
      const conditions = status.conditions ?? []
      const complete = conditions.find((c: any) => c.type === 'Complete' && c.status === 'True')
      const failed = conditions.find((c: any) => c.type === 'Failed' && c.status === 'True')
      if (complete) return { status: 'Complete', statusCategory: 'healthy' }
      if (failed) return { status: 'Failed', statusCategory: 'error' }
      return { status: 'Active', statusCategory: 'warning' }
    }
    case 'CronJob': {
      return spec.suspend
        ? { status: 'Suspended', statusCategory: 'unknown' }
        : { status: 'Active', statusCategory: 'healthy' }
    }
    case 'Node': {
      const ready = (status.conditions ?? []).find((c: any) => c.type === 'Ready')
      if (ready?.status === 'True') return { status: 'Ready', statusCategory: 'healthy' }
      if (ready?.status === 'Unknown') return { status: 'Unknown', statusCategory: 'warning' }
      return { status: 'NotReady', statusCategory: 'error' }
    }
    case 'HorizontalPodAutoscaler': {
      const active = (status.conditions ?? []).find((c: any) => c.type === 'ScalingActive')
      return active?.status === 'True'
        ? { status: 'Active', statusCategory: 'healthy' }
        : { status: 'Unable', statusCategory: 'warning' }
    }
    case 'PersistentVolumeClaim': {
      const phase = status.phase ?? 'Unknown'
      if (phase === 'Bound') return { status: 'Bound', statusCategory: 'healthy' }
      if (phase === 'Pending') return { status: 'Pending', statusCategory: 'warning' }
      return { status: phase, statusCategory: 'error' }
    }
    // Service, Ingress, ConfigMap, Secret — no meaningful status
    default:
      return { status: 'Active', statusCategory: 'healthy' }
  }
}

// ── Resource Key Helper ───────────────────────────────────────

function resourceKey(kind: string, namespace: string, name: string) {
  return `${kind}/${namespace}/${name}`
}

// ── Main Resolver ─────────────────────────────────────────────

interface ResolverInput {
  clusterId: string
  kind: string
  namespace: string
  name: string
}

/** WatchManager resource type keys */
type WatchResourceType =
  | 'pods' | 'deployments' | 'statefulsets' | 'daemonsets' | 'services'
  | 'ingresses' | 'jobs' | 'cronjobs' | 'hpa' | 'configmaps'
  | 'secrets' | 'pvcs' | 'nodes'

const KIND_TO_WATCH_TYPE: Record<string, WatchResourceType> = {
  Pod: 'pods',
  Deployment: 'deployments',
  StatefulSet: 'statefulsets',
  DaemonSet: 'daemonsets',
  Service: 'services',
  Ingress: 'ingresses',
  Job: 'jobs',
  CronJob: 'cronjobs',
  HorizontalPodAutoscaler: 'hpa',
  ConfigMap: 'configmaps',
  Secret: 'secrets',
  PersistentVolumeClaim: 'pvcs',
  Node: 'nodes',
}

export function resolveRelations(
  wm: WatchManager,
  input: ResolverInput,
): RelationGroup[] {
  const { clusterId, kind, namespace, name } = input
  const visited = new Set<string>()
  const results = new Map<string, RelationResource[]>()

  // Helper: get all resources of a type from WatchManager
  function getAll(watchType: WatchResourceType): k8s.KubernetesObject[] {
    return (wm.getResources(clusterId, watchType) ?? []) as k8s.KubernetesObject[]
  }

  // Helper: add a resource to results
  function addResult(k: string, raw: k8s.KubernetesObject, isCurrent: boolean) {
    const rName = raw.metadata?.name ?? ''
    const rNs = raw.metadata?.namespace ?? ''
    const key = resourceKey(k, rNs, rName)
    if (visited.has(key)) return
    visited.add(key)

    const { status, statusCategory } = deriveStatus(k, raw)
    const group = results.get(k) ?? []
    group.push({ name: rName, namespace: rNs, status, statusCategory, isCurrent })
    results.set(k, group)
  }

  // Helper: get selector from a workload
  function getSelector(raw: k8s.KubernetesObject): Record<string, string> | undefined {
    return (raw as any).spec?.selector?.matchLabels
  }

  // Helper: get labels
  function getLabels(raw: k8s.KubernetesObject): Record<string, string> | undefined {
    return raw.metadata?.labels as Record<string, string> | undefined
  }

  // ── Step 1: Find the target resource ──────────────────────
  const watchType = KIND_TO_WATCH_TYPE[kind]
  if (!watchType) return []

  const allOfKind = getAll(watchType)
  const target = allOfKind.find(
    (r) => r.metadata?.name === name && r.metadata?.namespace === namespace,
  )
  if (!target) return []

  // Add the current resource
  addResult(kind, target, true)

  // ── Step 2: Collect all pods in the family ────────────────
  // This is the anchor — most relationships flow through pods
  const allPods = getAll('pods')
  const familyPods: k8s.KubernetesObject[] = []

  if (kind === 'Pod') {
    familyPods.push(target)
  } else if (['Deployment', 'StatefulSet', 'DaemonSet'].includes(kind)) {
    // Find pods matching this workload's selector
    const selector = getSelector(target)
    for (const pod of allPods) {
      if (pod.metadata?.namespace === namespace && matchLabels(selector, getLabels(pod))) {
        familyPods.push(pod)
        addResult('Pod', pod, false)
      }
    }
  } else if (kind === 'Service') {
    // Find pods matching this service's selector (namespace-scoped — K8s Service endpoints are namespace-local)
    const selector = (target as any).spec?.selector as Record<string, string> | undefined
    for (const pod of allPods) {
      if (pod.metadata?.namespace === namespace && matchLabels(selector, getLabels(pod))) {
        familyPods.push(pod)
        addResult('Pod', pod, false)
      }
    }
  } else if (kind === 'Job') {
    // Find pods owned by this job
    for (const pod of allPods) {
      const owners = pod.metadata?.ownerReferences ?? []
      if (owners.some((o) => o.kind === 'Job' && o.name === name) && pod.metadata?.namespace === namespace) {
        familyPods.push(pod)
        addResult('Pod', pod, false)
      }
    }
  } else if (kind === 'CronJob') {
    // Find jobs owned by this cronjob, then pods owned by those jobs
    const allJobs = getAll('jobs')
    for (const job of allJobs) {
      const owners = job.metadata?.ownerReferences ?? []
      if (owners.some((o) => o.kind === 'CronJob' && o.name === name) && job.metadata?.namespace === namespace) {
        addResult('Job', job, false)
        for (const pod of allPods) {
          const podOwners = pod.metadata?.ownerReferences ?? []
          if (podOwners.some((o) => o.kind === 'Job' && o.name === job.metadata?.name) && pod.metadata?.namespace === namespace) {
            familyPods.push(pod)
            addResult('Pod', pod, false)
          }
        }
      }
    }
  } else if (kind === 'Node') {
    // Find pods on this node
    for (const pod of allPods) {
      if ((pod as any).spec?.nodeName === name) {
        familyPods.push(pod)
        addResult('Pod', pod, false)
      }
    }
  } else if (kind === 'ConfigMap' || kind === 'Secret' || kind === 'PersistentVolumeClaim') {
    // Find pods that reference this config/storage resource
    for (const pod of allPods) {
      if (pod.metadata?.namespace !== namespace) continue
      const mapped = mapPod(pod as k8s.V1Pod)
      const refs = kind === 'ConfigMap' ? mapped.configMapRefs
        : kind === 'Secret' ? mapped.secretRefs
        : mapped.pvcRefs
      if (refs.includes(name)) {
        familyPods.push(pod)
        addResult('Pod', pod, false)
      }
    }
  } else if (kind === 'HorizontalPodAutoscaler') {
    // Find the target workload
    const scaleRef = (target as any).spec?.scaleTargetRef
    if (scaleRef) {
      const targetKind = scaleRef.kind as string
      const targetName = scaleRef.name as string
      const targetWatchType = KIND_TO_WATCH_TYPE[targetKind]
      if (targetWatchType) {
        const allTargets = getAll(targetWatchType)
        const workload = allTargets.find(
          (r) => r.metadata?.name === targetName && r.metadata?.namespace === namespace,
        )
        if (workload) {
          addResult(targetKind, workload, false)
          // Find pods of that workload
          const selector = getSelector(workload)
          for (const pod of allPods) {
            if (pod.metadata?.namespace === namespace && matchLabels(selector, getLabels(pod))) {
              familyPods.push(pod)
              addResult('Pod', pod, false)
            }
          }
        }
      }
    }
  } else if (kind === 'Ingress') {
    // Find services referenced by this ingress
    const rules = (target as any).spec?.rules ?? []
    const serviceNames = new Set<string>()
    for (const rule of rules) {
      for (const path of rule.http?.paths ?? []) {
        if (path.backend?.service?.name) serviceNames.add(path.backend.service.name)
      }
    }
    const defaultBackend = (target as any).spec?.defaultBackend?.service?.name
    if (defaultBackend) serviceNames.add(defaultBackend)

    const allServices = getAll('services')
    for (const svc of allServices) {
      if (svc.metadata?.namespace === namespace && serviceNames.has(svc.metadata?.name ?? '')) {
        addResult('Service', svc, false)
        // Find pods for this service
        const selector = (svc as any).spec?.selector as Record<string, string> | undefined
        for (const pod of allPods) {
          if (matchLabels(selector, getLabels(pod))) {
            familyPods.push(pod)
            addResult('Pod', pod, false)
          }
        }
      }
    }
  }

  // ── Step 3: From pods, walk UP to find parent workloads ───
  for (const pod of familyPods) {
    const podNs = pod.metadata?.namespace ?? ''
    const podLabels = getLabels(pod)

    // Pod → Deployment (via label selector matching — no ReplicaSet in WatchManager)
    for (const dep of getAll('deployments')) {
      if (dep.metadata?.namespace === podNs && matchLabels(getSelector(dep), podLabels)) {
        addResult('Deployment', dep, false)
      }
    }
    // Pod → StatefulSet
    for (const ss of getAll('statefulsets')) {
      if (ss.metadata?.namespace === podNs && matchLabels(getSelector(ss), podLabels)) {
        addResult('StatefulSet', ss, false)
      }
    }
    // Pod → DaemonSet
    for (const ds of getAll('daemonsets')) {
      if (ds.metadata?.namespace === podNs && matchLabels(getSelector(ds), podLabels)) {
        addResult('DaemonSet', ds, false)
      }
    }
    // Pod → Job (ownerReferences)
    const owners = pod.metadata?.ownerReferences ?? []
    for (const o of owners) {
      if (o.kind === 'Job') {
        const job = getAll('jobs').find(
          (j) => j.metadata?.name === o.name && j.metadata?.namespace === podNs,
        )
        if (job) {
          addResult('Job', job, false)
          // Job → CronJob
          const jobOwners = job.metadata?.ownerReferences ?? []
          for (const jo of jobOwners) {
            if (jo.kind === 'CronJob') {
              const cj = getAll('cronjobs').find(
                (c) => c.metadata?.name === jo.name && c.metadata?.namespace === podNs,
              )
              if (cj) addResult('CronJob', cj, false)
            }
          }
        }
      }
    }

    // Pod → Node
    const nodeName = (pod as any).spec?.nodeName
    if (nodeName) {
      const node = getAll('nodes').find((n) => n.metadata?.name === nodeName)
      if (node) addResult('Node', node, false)
    }

    // Pod → ConfigMaps, Secrets, PVCs (via volume refs)
    const mapped = mapPod(pod as k8s.V1Pod)
    for (const ref of mapped.configMapRefs) {
      const cm = getAll('configmaps').find(
        (c) => c.metadata?.name === ref && c.metadata?.namespace === podNs,
      )
      if (cm) addResult('ConfigMap', cm, false)
    }
    for (const ref of mapped.secretRefs) {
      const s = getAll('secrets').find(
        (c) => c.metadata?.name === ref && c.metadata?.namespace === podNs,
      )
      if (s) addResult('Secret', s, false)
    }
    for (const ref of mapped.pvcRefs) {
      const pvc = getAll('pvcs').find(
        (c) => c.metadata?.name === ref && c.metadata?.namespace === podNs,
      )
      if (pvc) addResult('PersistentVolumeClaim', pvc, false)
    }
  }

  // ── Step 4: Walk SIDEWAYS — Services, Ingresses, HPAs ─────
  // Find Services that select any of our family's pods (namespace-scoped)
  const allServices = getAll('services')
  for (const svc of allServices) {
    const selector = (svc as any).spec?.selector as Record<string, string> | undefined
    if (!selector) continue
    const svcNs = svc.metadata?.namespace ?? ''
    for (const pod of familyPods) {
      if (pod.metadata?.namespace === svcNs && matchLabels(selector, getLabels(pod))) {
        addResult('Service', svc, false)
        break
      }
    }
  }

  // Find Ingresses that reference any of our family's services
  const familyServiceNames = (results.get('Service') ?? []).map((s) => s.name)
  if (familyServiceNames.length > 0) {
    const allIngresses = getAll('ingresses')
    for (const ing of allIngresses) {
      const rules = (ing as any).spec?.rules ?? []
      const defaultBackend = (ing as any).spec?.defaultBackend?.service?.name
      let found = false
      if (defaultBackend && familyServiceNames.includes(defaultBackend)) found = true
      if (!found) {
        for (const rule of rules) {
          for (const path of rule.http?.paths ?? []) {
            if (path.backend?.service?.name && familyServiceNames.includes(path.backend.service.name)) {
              found = true
              break
            }
          }
          if (found) break
        }
      }
      if (found) addResult('Ingress', ing, false)
    }
  }

  // Find HPAs targeting any of our family's workloads
  const allHpa = getAll('hpa')
  const workloadKinds = ['Deployment', 'StatefulSet']
  for (const hpa of allHpa) {
    const ref = (hpa as any).spec?.scaleTargetRef
    if (!ref) continue
    for (const wk of workloadKinds) {
      const workloads = results.get(wk) ?? []
      if (workloads.some((w) => w.name === ref.name && ref.kind === wk)) {
        addResult('HorizontalPodAutoscaler', hpa, false)
      }
    }
  }

  // ── Step 5: StatefulSet → PVC (volumeClaimTemplate matching) ─
  const familySts = results.get('StatefulSet') ?? []
  if (familySts.length > 0) {
    const allPvcs = getAll('pvcs')
    for (const stsResource of familySts) {
      const sts = getAll('statefulsets').find(
        (s) => s.metadata?.name === stsResource.name && s.metadata?.namespace === stsResource.namespace,
      )
      if (!sts) continue
      const vctNames = ((sts as any).spec?.volumeClaimTemplates ?? []).map(
        (vct: any) => vct.metadata?.name ?? '',
      ).filter(Boolean) as string[]
      for (const vctName of vctNames) {
        const prefix = `${vctName}-${stsResource.name}-`
        for (const pvc of allPvcs) {
          if (
            pvc.metadata?.namespace === stsResource.namespace &&
            (pvc.metadata?.name ?? '').startsWith(prefix)
          ) {
            addResult('PersistentVolumeClaim', pvc, false)
          }
        }
      }
    }
  }

  // ── Step 6: Build output groups ───────────────────────────
  const groups: RelationGroup[] = []
  for (const kindDef of RELATION_KINDS) {
    const resources = results.get(kindDef.kind)
    if (!resources || resources.length === 0) continue
    resources.sort((a, b) => a.name.localeCompare(b.name))
    groups.push({
      kind: kindDef.kind,
      displayName: kindDef.displayName,
      order: kindDef.order,
      resources,
    })
  }

  return groups
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter api build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/relation-resolver.ts
git commit -m "feat(api): add relation-resolver for K8s resource family graph walking"
```

---

### Task 5: Relations tRPC Router

**Files:**
- Create: `apps/api/src/routers/relations.ts`
- Modify: `apps/api/src/routers/index.ts`

- [ ] **Step 1: Create the router file**

```typescript
// apps/api/src/routers/relations.ts
import { z } from 'zod'
import { resolveRelations } from '../lib/relation-resolver.js'
import { watchManager } from '../lib/watch-manager.js'
import { protectedProcedure, router } from '../trpc.js'

export const relationsRouter = router({
  forResource: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        kind: z.string(),
        namespace: z.string(),
        name: z.string(),
      }),
    )
    .query(({ input }) => {
      const groups = resolveRelations(watchManager, input)
      return { groups }
    }),
})
```

- [ ] **Step 2: Register in router index**

In `apps/api/src/routers/index.ts`:

Add import (after line 43, before the `appRouter` export):
```typescript
import { relationsRouter } from './relations.js'
```

Add to the router object (after line 89, before closing `}`):
```typescript
  relations: relationsRouter,
```

- [ ] **Step 3: Verify build**

Run: `pnpm --filter api build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routers/relations.ts apps/api/src/routers/index.ts
git commit -m "feat(api): add relations tRPC router with forResource endpoint"
```

---

### Task 6: Frontend — RelationsTab Component

**Files:**
- Create: `apps/web/src/components/resource/RelationsTab.tsx`

- [ ] **Step 1: Create the RelationsTab component**

```typescript
// apps/web/src/components/resource/RelationsTab.tsx
'use client'

import { KIND_TO_TAB } from '@voyager/types'
import type { RelationGroup, RelationResource } from '@voyager/types'
import {
  Box,
  CircleDot,
  Database,
  FileText,
  GitFork,
  Globe,
  HardDrive,
  Lock,
  Network,
  Server,
  Timer,
  Workflow,
  Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { trpc } from '@/lib/trpc'
import { RelatedResourceLink } from './RelatedResourceLink'

// ── Icon mapping per resource kind ──────────────────────────

const KIND_ICONS: Record<string, ReactNode> = {
  Ingress: <Globe className="h-3.5 w-3.5" />,
  Service: <Network className="h-3.5 w-3.5" />,
  Deployment: <Server className="h-3.5 w-3.5" />,
  StatefulSet: <Database className="h-3.5 w-3.5" />,
  DaemonSet: <Workflow className="h-3.5 w-3.5" />,
  Job: <Zap className="h-3.5 w-3.5" />,
  CronJob: <Timer className="h-3.5 w-3.5" />,
  Pod: <Box className="h-3.5 w-3.5" />,
  HorizontalPodAutoscaler: <CircleDot className="h-3.5 w-3.5" />,
  ConfigMap: <FileText className="h-3.5 w-3.5" />,
  Secret: <Lock className="h-3.5 w-3.5" />,
  PersistentVolumeClaim: <HardDrive className="h-3.5 w-3.5" />,
  Node: <Server className="h-3.5 w-3.5" />,
}

// ── Status badge colors ─────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  healthy: {
    bg: 'bg-[var(--color-status-active)]/12',
    text: 'text-[var(--color-status-active)]',
    dot: 'bg-[var(--color-status-active)]',
  },
  warning: {
    bg: 'bg-[var(--color-status-warning)]/12',
    text: 'text-[var(--color-status-warning)]',
    dot: 'bg-[var(--color-status-warning)]',
  },
  error: {
    bg: 'bg-[var(--color-status-error)]/12',
    text: 'text-[var(--color-status-error)]',
    dot: 'bg-[var(--color-status-error)]',
  },
  unknown: {
    bg: 'bg-[var(--color-text-muted)]/12',
    text: 'text-[var(--color-text-muted)]',
    dot: 'bg-[var(--color-text-muted)]',
  },
}

// ── Sub-components ──────────────────────────────────────────

function StatusBadge({ status, category }: { status: string; category: string }) {
  const colors = STATUS_COLORS[category] ?? STATUS_COLORS.unknown
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] ${colors.bg} ${colors.text}`}
    >
      <span className={`h-1 w-1 rounded-full ${colors.dot}`} />
      {status}
    </span>
  )
}

function RelationItem({ resource, kind }: { resource: RelationResource; kind: string }) {
  const tab = KIND_TO_TAB[kind]
  if (!tab) return null

  if (resource.isCurrent) {
    return (
      <div className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)]/[0.06] border-l-2 border-[var(--color-accent)] px-2 py-1 -ml-2">
        <span className="text-[var(--color-accent)] shrink-0">{KIND_ICONS[kind]}</span>
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {resource.name}
        </span>
        <StatusBadge status={resource.status} category={resource.statusCategory} />
        <span className="text-[10px] italic text-[var(--color-accent)]">← current</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <RelatedResourceLink
        tab={tab}
        resourceKey={resource.namespace ? `${resource.namespace}/${resource.name}` : resource.name}
        label={resource.name}
        icon={KIND_ICONS[kind]}
      />
      <StatusBadge status={resource.status} category={resource.statusCategory} />
    </div>
  )
}

function RelationGroupSection({ group }: { group: RelationGroup }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">
        {group.displayName}
      </p>
      <div className="flex flex-col gap-1.5">
        {group.resources.map((r) => (
          <RelationItem key={`${r.namespace}/${r.name}`} resource={r} kind={group.kind} />
        ))}
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────

interface RelationsTabProps {
  clusterId: string
  kind: string
  namespace: string
  name: string
}

export function RelationsTab({ clusterId, kind, namespace, name }: RelationsTabProps) {
  const { data, isLoading } = trpc.relations.forResource.useQuery(
    { clusterId, kind, namespace, name },
    { staleTime: 30_000, refetchOnWindowFocus: true },
  )

  if (isLoading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-20 rounded bg-white/[0.04] animate-pulse" />
            <div className="h-4 w-40 rounded bg-white/[0.04] animate-pulse" />
            <div className="h-4 w-36 rounded bg-white/[0.04] animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  const groups = data?.groups ?? []

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-[var(--color-text-muted)]">No related resources found</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5 p-3">
      {groups.map((group) => (
        <RelationGroupSection key={group.kind} group={group} />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify frontend build**

Run: `pnpm --filter web build`
Expected: Clean build (component exists but isn't used by any page yet)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/resource/RelationsTab.tsx
git commit -m "feat(web): add RelationsTab component with grid layout and status badges"
```

---

### Task 7: Integrate Relations Tab Into All Resource Pages

**Files:**
- Modify: 13 resource page files in `apps/web/src/app/clusters/[id]/`

Each page needs the same addition: import `RelationsTab` and `GitFork`, then add a tab entry to the tabs array. The tab should be placed before YAML/Diff tabs (second-to-last position).

- [ ] **Step 1: Add to pods/page.tsx**

Add imports at top:
```typescript
import { GitFork } from 'lucide-react'
import { RelationsTab } from '@/components/resource/RelationsTab'
```

Add tab entry before the YAML tab in the tabs array:
```typescript
    {
      id: 'relations',
      label: 'Relations',
      icon: <GitFork className="h-3.5 w-3.5" />,
      content: (
        <RelationsTab
          clusterId={clusterId}
          kind="Pod"
          namespace={pod.namespace}
          name={pod.name}
        />
      ),
    },
```

- [ ] **Step 2: Add to deployments/page.tsx**

Same imports. Tab entry with `kind="Deployment"`, using `d.namespace` and `d.name` (or whatever the deployment variable is named in that file's tab function).

- [ ] **Step 3: Add to statefulsets/page.tsx**

Same pattern with `kind="StatefulSet"`.

- [ ] **Step 4: Add to daemonsets/page.tsx**

Same pattern with `kind="DaemonSet"`.

- [ ] **Step 5: Add to services/page.tsx**

Same pattern with `kind="Service"`.

- [ ] **Step 6: Add to ingresses/page.tsx**

Same pattern with `kind="Ingress"`.

- [ ] **Step 7: Add to jobs/page.tsx**

Same pattern with `kind="Job"`.

- [ ] **Step 8: Add to cronjobs/page.tsx**

Same pattern with `kind="CronJob"`.

- [ ] **Step 9: Add to configmaps/page.tsx**

Same pattern with `kind="ConfigMap"`.

- [ ] **Step 10: Add to secrets/page.tsx**

Same pattern with `kind="Secret"`.

- [ ] **Step 11: Add to pvcs/page.tsx**

Same pattern with `kind="PersistentVolumeClaim"`.

- [ ] **Step 12: Add to hpa/page.tsx**

Same pattern with `kind="HorizontalPodAutoscaler"`.

- [ ] **Step 13: Add to nodes/page.tsx**

**This page requires an extra change** — `NodeDetail` doesn't currently receive `clusterId`.

1. Change the function signature at line 54 from:
   ```typescript
   function NodeDetail({ node, podCount }: { node: LiveNode; podCount: number }) {
   ```
   to:
   ```typescript
   function NodeDetail({ node, podCount, clusterId }: { node: LiveNode; podCount: number; clusterId: string }) {
   ```

2. Update the call site at line 355 to pass `clusterId`:
   ```typescript
   detail={<NodeDetail node={node} podCount={podCountByNode.get(node.name) ?? 0} clusterId={clusterId} />}
   ```

3. Add the Relations tab with `kind="Node"` and `namespace=""` (Nodes are non-namespaced).

- [ ] **Step 14: Verify full build**

Run: `pnpm build`
Expected: Clean build across all packages

- [ ] **Step 15: Commit**

```bash
git add apps/web/src/app/clusters/[id]/*/page.tsx
git commit -m "feat(web): add Relations tab to all 13 resource detail views"
```

---

### Task 8: Typecheck and Final Verification

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: No new violations

- [ ] **Step 3: Run full build**

Run: `pnpm build`
Expected: Clean build

- [ ] **Step 4: Start dev servers and verify**

Run: `pnpm dev`

1. Open http://localhost:3000
2. Navigate to a cluster
3. Open any resource (e.g., a Deployment) by clicking it
4. Verify "Relations" tab appears in the tab bar
5. Click the Relations tab — verify it loads and shows related resources in grid layout
6. Click a related resource link — verify it navigates to the correct tab and highlights the resource
7. Verify the current resource is highlighted with purple accent border

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: relations tab adjustments after manual verification"
```
