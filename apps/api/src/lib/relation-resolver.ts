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

function deriveStatus(
  kind: string,
  raw: k8s.KubernetesObject,
): { status: string; statusCategory: StatusCategory } {
  const obj = raw as Record<string, any>
  const status = obj.status ?? {}
  const spec = obj.spec ?? {}

  switch (kind) {
    case 'Pod': {
      const phase = obj.metadata?.deletionTimestamp ? 'Terminating' : (status.phase ?? 'Unknown')
      const cat: StatusCategory =
        phase === 'Running' || phase === 'Succeeded'
          ? 'healthy'
          : phase === 'Pending'
            ? 'warning'
            : phase === 'Failed' || phase === 'Terminating'
              ? 'error'
              : 'unknown'
      return { status: phase, statusCategory: cat }
    }
    case 'Deployment': {
      const available = (status.conditions ?? []).find((c: any) => c.type === 'Available')
      const ready = status.readyReplicas ?? 0
      const desired = spec.replicas ?? 0
      if (available?.status === 'True' && ready >= desired)
        return { status: `${ready}/${desired}`, statusCategory: 'healthy' }
      if (ready > 0) return { status: `${ready}/${desired}`, statusCategory: 'warning' }
      return { status: `${ready}/${desired}`, statusCategory: 'error' }
    }
    case 'StatefulSet': {
      const ready = status.readyReplicas ?? 0
      const desired = spec.replicas ?? 0
      if (ready >= desired && desired > 0)
        return { status: `${ready}/${desired}`, statusCategory: 'healthy' }
      if (ready > 0) return { status: `${ready}/${desired}`, statusCategory: 'warning' }
      return { status: `${ready}/${desired}`, statusCategory: desired === 0 ? 'unknown' : 'error' }
    }
    case 'DaemonSet': {
      const desired = status.desiredNumberScheduled ?? 0
      const current = status.currentNumberScheduled ?? 0
      if (current >= desired && desired > 0)
        return { status: `${current}/${desired}`, statusCategory: 'healthy' }
      if (current > 0) return { status: `${current}/${desired}`, statusCategory: 'warning' }
      return {
        status: `${current}/${desired}`,
        statusCategory: desired === 0 ? 'unknown' : 'error',
      }
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
  | 'pods'
  | 'deployments'
  | 'statefulsets'
  | 'daemonsets'
  | 'services'
  | 'ingresses'
  | 'jobs'
  | 'cronjobs'
  | 'hpa'
  | 'configmaps'
  | 'secrets'
  | 'pvcs'
  | 'nodes'

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

export function resolveRelations(wm: WatchManager, input: ResolverInput): RelationGroup[] {
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
    (r) => r.metadata?.name === name && (r.metadata?.namespace ?? '') === namespace,
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
      if (
        owners.some((o) => o.kind === 'Job' && o.name === name) &&
        pod.metadata?.namespace === namespace
      ) {
        familyPods.push(pod)
        addResult('Pod', pod, false)
      }
    }
  } else if (kind === 'CronJob') {
    // Find jobs owned by this cronjob, then pods owned by those jobs
    const allJobs = getAll('jobs')
    for (const job of allJobs) {
      const owners = job.metadata?.ownerReferences ?? []
      if (
        owners.some((o) => o.kind === 'CronJob' && o.name === name) &&
        job.metadata?.namespace === namespace
      ) {
        addResult('Job', job, false)
        for (const pod of allPods) {
          const podOwners = pod.metadata?.ownerReferences ?? []
          if (
            podOwners.some((o) => o.kind === 'Job' && o.name === job.metadata?.name) &&
            pod.metadata?.namespace === namespace
          ) {
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
      const refs =
        kind === 'ConfigMap'
          ? mapped.configMapRefs
          : kind === 'Secret'
            ? mapped.secretRefs
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

  // Node relations: only show pods on the node, skip workload/service walking
  if (kind === 'Node') {
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
            if (
              path.backend?.service?.name &&
              familyServiceNames.includes(path.backend.service.name)
            ) {
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
        (s) =>
          s.metadata?.name === stsResource.name && s.metadata?.namespace === stsResource.namespace,
      )
      if (!sts) continue
      const vctNames = ((sts as any).spec?.volumeClaimTemplates ?? [])
        .map((vct: any) => vct.metadata?.name ?? '')
        .filter(Boolean) as string[]
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
