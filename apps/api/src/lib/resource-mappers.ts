/**
 * Resource mappers — extract transformation logic from tRPC routers into shared functions.
 * Each mapper transforms a raw K8s object into the same shape returned by the router's list response.
 * Used by both tRPC routers (for API responses) and WatchManager (for SSE events).
 */
import type * as k8s from '@kubernetes/client-node'
import { parseCpuToNano, parseMemToBytes } from './k8s-units.js'

// ── Shared Helpers ────────────────────────────────────────────

export function computeAge(creationTimestamp: Date | string | undefined): string {
  if (!creationTimestamp) return 'unknown'
  const diff = Date.now() - new Date(creationTimestamp).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function deriveImageVersion(image: string): string {
  if (!image || image === 'unknown') return 'unknown'
  const digestIndex = image.indexOf('@')
  if (digestIndex > -1) return image.slice(digestIndex + 1)
  const tagIndex = image.lastIndexOf(':')
  if (tagIndex > -1 && tagIndex < image.length - 1) return image.slice(tagIndex + 1)
  return 'latest'
}

export function deriveDeploymentStatus(params: {
  ready: number
  replicas: number
  available: number
  unavailable: number
  generation?: number
  observedGeneration?: number
}): 'Running' | 'Pending' | 'Failed' | 'Scaling' {
  const { ready, replicas, available, unavailable, generation, observedGeneration } = params

  if (
    generation !== undefined &&
    observedGeneration !== undefined &&
    generation > observedGeneration
  ) {
    return 'Scaling'
  }

  if (replicas === 0) return 'Pending'
  if (unavailable > 0 && ready === 0) return 'Failed'
  if (ready === replicas && available === replicas) return 'Running'
  if (ready > 0 || available > 0) return 'Scaling'
  return 'Pending'
}

function mapConditions(
  conditions: Array<{
    type?: string
    status?: string
    reason?: string
    message?: string
    lastTransitionTime?: Date | string
  }> = [],
) {
  return conditions.map((c) => ({
    type: c.type ?? '',
    status: c.status ?? 'Unknown',
    reason: c.reason ?? undefined,
    message: c.message ?? undefined,
    lastTransitionTime: c.lastTransitionTime
      ? new Date(c.lastTransitionTime as unknown as string).toISOString()
      : undefined,
  }))
}

export function mapContainer(c: k8s.V1Container) {
  return {
    name: c.name ?? '',
    image: c.image ?? '',
    ports: (c.ports ?? []).map((p) => ({
      containerPort: p.containerPort,
      protocol: p.protocol ?? 'TCP',
      name: p.name ?? null,
    })),
    command: c.command ?? null,
    volumeMounts: (c.volumeMounts ?? []).map((vm) => ({
      name: vm.name,
      mountPath: vm.mountPath,
      readOnly: vm.readOnly ?? false,
    })),
    envCount: (c.env ?? []).length + (c.envFrom ?? []).length,
    resources: {
      cpuRequest: c.resources?.requests?.cpu ?? null,
      cpuLimit: c.resources?.limits?.cpu ?? null,
      memRequest: c.resources?.requests?.memory ?? null,
      memLimit: c.resources?.limits?.memory ?? null,
    },
  }
}

export function mapPorts(ports: k8s.V1ServicePort[] | undefined) {
  return (ports ?? []).map((p) => ({
    name: p.name ?? null,
    protocol: p.protocol ?? null,
    port: p.port,
    targetPort: p.targetPort ?? null,
    nodePort: p.nodePort ?? null,
  }))
}

function computeDuration(start?: Date | string, end?: Date | string): string | null {
  if (!start) return null
  const startMs = new Date(start).getTime()
  const endMs = end ? new Date(end).getTime() : Date.now()
  const diff = endMs - startMs
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function findLastUpdated(deployment: {
  metadata?: { creationTimestamp?: Date | string }
  status?: {
    conditions?: Array<{ lastUpdateTime?: Date | string; lastTransitionTime?: Date | string }>
  }
}): string {
  const conditionTimes = (deployment.status?.conditions ?? [])
    .flatMap((condition) => [condition.lastUpdateTime, condition.lastTransitionTime])
    .filter(Boolean)
    .map((value) => new Date(value as Date | string).toISOString())
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())

  if (conditionTimes.length > 0) return conditionTimes[0]
  return deployment.metadata?.creationTimestamp
    ? new Date(deployment.metadata.creationTimestamp).toISOString()
    : new Date(0).toISOString()
}

// ── Pod Mapper ────────────────────────────────────────────────

export function mapPod(
  p: k8s.V1Pod,
  metricsMap?: Map<string, { cpuNano: number; memBytes: number }>,
) {
  const podKey = `${p.metadata?.namespace ?? ''}/${p.metadata?.name ?? ''}`
  const metrics = metricsMap?.get(podKey)

  const cpuRequestNano = (p.spec?.containers ?? []).reduce(
    (sum, c) => sum + parseCpuToNano(c.resources?.requests?.cpu ?? '0'),
    0,
  )
  const memRequestBytes = (p.spec?.containers ?? []).reduce(
    (sum, c) => sum + parseMemToBytes(c.resources?.requests?.memory ?? '0'),
    0,
  )

  const containerStatuses = p.status?.containerStatuses ?? []
  const totalContainers = containerStatuses.length || (p.spec?.containers ?? []).length
  const readyContainers = containerStatuses.filter((cs) => cs.ready).length
  const restartCount = containerStatuses.reduce((sum, cs) => sum + (cs.restartCount ?? 0), 0)

  let lastRestartReason: string | null = null
  if (restartCount > 0) {
    for (const cs of containerStatuses) {
      const terminated = cs.lastState?.terminated
      if (terminated?.reason) {
        lastRestartReason = terminated.reason
        break
      }
    }
  }

  const conditions = mapConditions(p.status?.conditions)
  const containers = (p.spec?.containers ?? []).map(mapContainer)

  return {
    name: p.metadata?.name ?? '',
    namespace: p.metadata?.namespace ?? '',
    status: p.status?.phase ?? 'Unknown',
    createdAt: p.metadata?.creationTimestamp
      ? new Date(p.metadata.creationTimestamp as unknown as string).toISOString()
      : null,
    nodeName: p.spec?.nodeName ?? null,
    cpuMillis: metrics ? Math.round(metrics.cpuNano / 1_000_000) : null,
    memoryMi: metrics ? Math.round(metrics.memBytes / (1024 * 1024)) : null,
    cpuPercent:
      metrics && cpuRequestNano > 0
        ? Math.round((metrics.cpuNano / cpuRequestNano) * 1000) / 10
        : null,
    memoryPercent:
      metrics && memRequestBytes > 0
        ? Math.round((metrics.memBytes / memRequestBytes) * 1000) / 10
        : null,
    ready: `${readyContainers}/${totalContainers}`,
    restartCount,
    lastRestartReason,
    containers,
    conditions,
    labels: (p.metadata?.labels as Record<string, string>) ?? {},
  }
}

// ── Deployment Mapper ─────────────────────────────────────────

export function mapDeployment(
  deployment: k8s.V1Deployment,
  clusterId: string,
  clusterName: string,
) {
  const name = deployment.metadata?.name ?? 'unknown'
  const namespace = deployment.metadata?.namespace ?? 'default'
  const replicas = deployment.spec?.replicas ?? 0
  const ready = deployment.status?.readyReplicas ?? 0
  const available = deployment.status?.availableReplicas ?? 0
  const unavailable = deployment.status?.unavailableReplicas ?? Math.max(replicas - ready, 0)
  const image = deployment.spec?.template?.spec?.containers?.[0]?.image ?? 'unknown'

  const conditions = (deployment.status?.conditions ?? []).map((c) => ({
    type: c.type ?? '',
    status: c.status ?? '',
    reason: c.reason ?? null,
    message: c.message ?? null,
    lastTransitionTime: c.lastTransitionTime
      ? new Date(c.lastTransitionTime as unknown as string).toISOString()
      : null,
  }))

  const strategy = deployment.spec?.strategy
  const selector = (deployment.spec?.selector?.matchLabels as Record<string, string>) ?? {}

  return {
    clusterId,
    clusterName,
    name,
    namespace,
    replicas,
    ready,
    image,
    imageVersion: deriveImageVersion(image),
    status: deriveDeploymentStatus({
      ready,
      replicas,
      available,
      unavailable,
      generation: deployment.metadata?.generation,
      observedGeneration: deployment.status?.observedGeneration,
    }),
    lastUpdated: findLastUpdated(deployment),
    age: computeAge(deployment.metadata?.creationTimestamp),
    rolloutHistory: [] as Array<{ revision: string; image: string; updatedAt: string }>,
    selector,
    conditions,
    strategyType: strategy?.type ?? null,
    maxSurge: strategy?.rollingUpdate?.maxSurge ?? null,
    maxUnavailable: strategy?.rollingUpdate?.maxUnavailable ?? null,
  }
}

// ── Service Mapper ────────────────────────────────────────────

export function mapService(svc: k8s.V1Service) {
  return {
    name: svc.metadata?.name ?? '',
    namespace: svc.metadata?.namespace ?? '',
    type: svc.spec?.type ?? 'ClusterIP',
    clusterIP: svc.spec?.clusterIP ?? null,
    ports: mapPorts(svc.spec?.ports),
    createdAt: svc.metadata?.creationTimestamp ?? null,
    selector: (svc.spec?.selector as Record<string, string>) ?? {},
    externalTrafficPolicy: svc.spec?.externalTrafficPolicy ?? null,
    sessionAffinity: svc.spec?.sessionAffinity ?? 'None',
    loadBalancerIngress: (svc.status?.loadBalancer?.ingress ?? []).map((i) => ({
      ip: i.ip ?? null,
      hostname: i.hostname ?? null,
    })),
    healthCheckNodePort: svc.spec?.healthCheckNodePort ?? null,
  }
}

// ── Node Mapper ───────────────────────────────────────────────

export function mapNode(
  node: k8s.V1Node,
  metricsMap?: Map<string, { cpuNano: number; memBytes: number }>,
) {
  const name = node.metadata?.name ?? ''
  const metrics = metricsMap?.get(name)

  const cpuCapacityNano = parseCpuToNano(node.status?.capacity?.cpu ?? '0')
  const cpuAllocatableNano = parseCpuToNano(node.status?.allocatable?.cpu ?? '0')
  const memCapacityBytes = parseMemToBytes(node.status?.capacity?.memory ?? '0')
  const memAllocatableBytes = parseMemToBytes(node.status?.allocatable?.memory ?? '0')
  const podsCapacity = Number.parseInt(node.status?.capacity?.pods ?? '0', 10) || 0
  const podsAllocatable = Number.parseInt(node.status?.allocatable?.pods ?? '0', 10) || 0
  const ephStorageCapacity = parseMemToBytes(node.status?.capacity?.['ephemeral-storage'] ?? '0')
  const ephStorageAllocatable = parseMemToBytes(
    node.status?.allocatable?.['ephemeral-storage'] ?? '0',
  )

  const cpuPercent =
    metrics && cpuAllocatableNano > 0
      ? Math.round((metrics.cpuNano / cpuAllocatableNano) * 1000) / 10
      : null
  const memPercent =
    metrics && memAllocatableBytes > 0
      ? Math.round((metrics.memBytes / memAllocatableBytes) * 1000) / 10
      : null

  const conditions = mapConditions(node.status?.conditions)

  const taints = (node.spec?.taints ?? []).map((t) => ({
    key: t.key ?? '',
    value: t.value ?? '',
    effect: t.effect ?? '',
  }))

  const addresses = (node.status?.addresses ?? []).map((a) => ({
    type: a.type ?? '',
    address: a.address ?? '',
  }))

  return {
    name,
    status:
      node.status?.conditions?.find((c) => c.type === 'Ready')?.status === 'True'
        ? 'Ready'
        : 'NotReady',
    role:
      node.metadata?.labels?.['node-role.kubernetes.io/control-plane'] !== undefined
        ? 'control-plane'
        : 'worker',
    kubeletVersion: node.status?.nodeInfo?.kubeletVersion ?? '',
    os: node.status?.nodeInfo?.osImage ?? '',
    cpuCapacityMillis: Math.round(cpuCapacityNano / 1_000_000),
    cpuAllocatableMillis: Math.round(cpuAllocatableNano / 1_000_000),
    memCapacityMi: Math.round(memCapacityBytes / (1024 * 1024)),
    memAllocatableMi: Math.round(memAllocatableBytes / (1024 * 1024)),
    podsCapacity,
    podsAllocatable,
    ephStorageCapacityGi: Math.round(ephStorageCapacity / (1024 * 1024 * 1024)),
    ephStorageAllocatableGi: Math.round(ephStorageAllocatable / (1024 * 1024 * 1024)),
    cpuUsageMillis: metrics ? Math.round(metrics.cpuNano / 1_000_000) : null,
    memUsageMi: metrics ? Math.round(metrics.memBytes / (1024 * 1024)) : null,
    cpuPercent,
    memPercent,
    labels: (node.metadata?.labels as Record<string, string>) ?? {},
    taints,
    conditions,
    addresses,
  }
}

// ── ConfigMap Mapper ──────────────────────────────────────────

const MAX_INLINE_VALUE_LENGTH = 200

export function mapConfigMap(cm: k8s.V1ConfigMap) {
  const dataKeys = Object.keys(cm.data ?? {})
  const binaryDataKeys = Object.keys(cm.binaryData ?? {})

  const dataEntries = dataKeys.map((key) => {
    const value = cm.data?.[key] ?? ''
    return {
      key,
      value: value.length > MAX_INLINE_VALUE_LENGTH ? null : value,
      size: value.length,
    }
  })

  return {
    name: cm.metadata?.name ?? '',
    namespace: cm.metadata?.namespace ?? '',
    dataKeysCount: dataKeys.length,
    binaryDataKeysCount: binaryDataKeys.length,
    age: computeAge(cm.metadata?.creationTimestamp),
    labels: (cm.metadata?.labels as Record<string, string>) ?? {},
    dataEntries,
  }
}

// ── Secret Mapper ─────────────────────────────────────────────

export function mapSecret(secret: k8s.V1Secret) {
  const dataKeyNames = Object.keys(secret.data ?? {})

  const annotations = Object.fromEntries(
    Object.entries((secret.metadata?.annotations as Record<string, string>) ?? {}).filter(
      ([key]) => !key.startsWith('kubectl.kubernetes.io/'),
    ),
  )

  return {
    name: secret.metadata?.name ?? '',
    namespace: secret.metadata?.namespace ?? '',
    type: secret.type ?? 'Opaque',
    dataKeysCount: dataKeyNames.length,
    dataKeyNames,
    age: computeAge(secret.metadata?.creationTimestamp),
    labels: (secret.metadata?.labels as Record<string, string>) ?? {},
    annotations,
  }
}

// ── PVC Mapper ────────────────────────────────────────────────

export function mapPVC(pvc: k8s.V1PersistentVolumeClaim) {
  return {
    name: pvc.metadata?.name ?? '',
    namespace: pvc.metadata?.namespace ?? '',
    phase: pvc.status?.phase ?? 'Pending',
    capacity: pvc.status?.capacity?.storage ?? '\u2014',
    requestedStorage: pvc.spec?.resources?.requests?.storage ?? '\u2014',
    storageClass: pvc.spec?.storageClassName ?? 'default',
    accessModes: pvc.spec?.accessModes ?? [],
    volumeName: pvc.spec?.volumeName ?? null,
    volumeMode: pvc.spec?.volumeMode ?? 'Filesystem',
    age: computeAge(pvc.metadata?.creationTimestamp),
    labels: (pvc.metadata?.labels as Record<string, string>) ?? {},
    annotations: (pvc.metadata?.annotations as Record<string, string>) ?? {},
    finalizers: pvc.metadata?.finalizers ?? [],
    conditions: mapConditions(pvc.status?.conditions),
  }
}

// ── Namespace Mapper ──────────────────────────────────────────

export function mapNamespace(ns: k8s.V1Namespace) {
  return {
    name: ns.metadata?.name ?? '',
    status: ns.status?.phase ?? null,
    labels: (ns.metadata?.labels as Record<string, string>) ?? null,
    annotations: (ns.metadata?.annotations as Record<string, string>) ?? {},
    createdAt: ns.metadata?.creationTimestamp ?? null,
    resourceQuota: null as {
      cpuLimit: string | null
      memLimit: string | null
      cpuUsed: string | null
      memUsed: string | null
    } | null,
  }
}

// ── Event Mapper ──────────────────────────────────────────────

export function mapEvent(event: k8s.CoreV1Event) {
  const eventTimestamp = event.lastTimestamp ?? event.eventTime ?? event.metadata?.creationTimestamp
  const ts = eventTimestamp ? new Date(eventTimestamp as unknown as string).toISOString() : null

  return {
    id: event.metadata?.uid ?? '',
    namespace: event.metadata?.namespace ?? null,
    kind: event.type ?? 'Normal',
    reason: event.reason ?? null,
    message: event.message ?? null,
    source: event.source?.component ?? null,
    involvedObject: event.involvedObject
      ? {
          kind: event.involvedObject.kind,
          name: event.involvedObject.name,
          namespace: event.involvedObject.namespace,
        }
      : null,
    timestamp: ts,
  }
}

// ── Ingress Mapper ────────────────────────────────────────────

export function mapIngress(ing: k8s.V1Ingress) {
  const rules = (ing.spec?.rules ?? []).map((rule) => ({
    host: rule.host ?? '*',
    paths: (rule.http?.paths ?? []).map((p) => ({
      path: p.path ?? '/',
      pathType: p.pathType ?? 'Prefix',
      serviceName: p.backend?.service?.name ?? '',
      servicePort: p.backend?.service?.port?.number ?? p.backend?.service?.port?.name ?? '',
    })),
  }))

  const tls = (ing.spec?.tls ?? []).map((t) => ({
    hosts: t.hosts ?? [],
    secretName: t.secretName ?? '',
  }))

  const hosts = rules.map((r) => r.host).filter((h) => h !== '*')

  return {
    name: ing.metadata?.name ?? '',
    namespace: ing.metadata?.namespace ?? '',
    ingressClassName: ing.spec?.ingressClassName ?? null,
    hosts,
    ports: tls.length > 0 ? '80, 443' : '80',
    createdAt: ing.metadata?.creationTimestamp
      ? new Date(ing.metadata.creationTimestamp as unknown as string).toISOString()
      : null,
    rules,
    tls,
    annotations: (ing.metadata?.annotations as Record<string, string>) ?? {},
    defaultBackend: ing.spec?.defaultBackend
      ? {
          serviceName: ing.spec.defaultBackend.service?.name ?? '',
          servicePort:
            ing.spec.defaultBackend.service?.port?.number ??
            ing.spec.defaultBackend.service?.port?.name ??
            '',
        }
      : null,
  }
}

// ── StatefulSet Mapper ────────────────────────────────────────

export function mapStatefulSet(ss: k8s.V1StatefulSet) {
  const replicas = ss.spec?.replicas ?? 0
  const ready = ss.status?.readyReplicas ?? 0
  const current = ss.status?.currentReplicas ?? 0
  const updated = ss.status?.updatedReplicas ?? 0
  const image = ss.spec?.template?.spec?.containers?.[0]?.image ?? '\u2014'

  const vcts = (ss.spec?.volumeClaimTemplates ?? []).map((vct) => ({
    name: vct.metadata?.name ?? '',
    storageClass: vct.spec?.storageClassName ?? 'default',
    size: vct.spec?.resources?.requests?.storage ?? '\u2014',
    accessModes: vct.spec?.accessModes ?? [],
  }))

  const conditions = mapConditions(ss.status?.conditions)
  const selector = (ss.spec?.selector?.matchLabels as Record<string, string>) ?? {}

  return {
    name: ss.metadata?.name ?? '',
    namespace: ss.metadata?.namespace ?? '',
    replicas,
    readyReplicas: ready,
    currentReplicas: current,
    updatedReplicas: updated,
    image,
    age: computeAge(ss.metadata?.creationTimestamp),
    volumeClaimTemplates: vcts,
    conditions,
    selector,
  }
}

// ── DaemonSet Mapper ──────────────────────────────────────────

export function mapDaemonSet(ds: k8s.V1DaemonSet) {
  const desired = ds.status?.desiredNumberScheduled ?? 0
  const current = ds.status?.currentNumberScheduled ?? 0
  const ready = ds.status?.numberReady ?? 0
  const updated = ds.status?.updatedNumberScheduled ?? 0
  const available = ds.status?.numberAvailable ?? 0
  const unavailable = ds.status?.numberUnavailable ?? 0

  const nodeSelector = (ds.spec?.template?.spec?.nodeSelector as Record<string, string>) ?? {}
  const tolerations = (ds.spec?.template?.spec?.tolerations ?? []).map((t) => ({
    key: t.key ?? '*',
    operator: t.operator ?? 'Equal',
    value: t.value ?? '',
    effect: t.effect ?? 'NoSchedule',
  }))

  const conditions = mapConditions(ds.status?.conditions)
  const selector = (ds.spec?.selector?.matchLabels as Record<string, string>) ?? {}

  return {
    name: ds.metadata?.name ?? '',
    namespace: ds.metadata?.namespace ?? '',
    desired,
    current,
    ready,
    updated,
    available,
    unavailable,
    age: computeAge(ds.metadata?.creationTimestamp),
    nodeSelector,
    tolerations,
    conditions,
    selector,
  }
}

// ── Job Mapper ────────────────────────────────────────────────

export function mapJob(job: k8s.V1Job) {
  const succeeded = job.status?.succeeded ?? 0
  const failed = job.status?.failed ?? 0
  const active = job.status?.active ?? 0
  const completions = job.spec?.completions ?? 1

  let status: string
  if (succeeded >= completions) status = 'Complete'
  else if (failed > 0 && active === 0) status = 'Failed'
  else if (active > 0) status = 'Running'
  else status = 'Pending'

  const conditions = mapConditions(job.status?.conditions)

  return {
    name: job.metadata?.name ?? '',
    namespace: job.metadata?.namespace ?? '',
    status,
    completions: `${succeeded}/${completions}`,
    succeeded,
    failed,
    active,
    parallelism: job.spec?.parallelism ?? 1,
    completionsTotal: completions,
    backoffLimit: job.spec?.backoffLimit ?? 6,
    activeDeadlineSeconds: job.spec?.activeDeadlineSeconds ?? null,
    ttlSecondsAfterFinished: job.spec?.ttlSecondsAfterFinished ?? null,
    startTime: job.status?.startTime
      ? new Date(job.status.startTime as unknown as string).toISOString()
      : null,
    completionTime: job.status?.completionTime
      ? new Date(job.status.completionTime as unknown as string).toISOString()
      : null,
    duration: computeDuration(
      job.status?.startTime as unknown as string,
      job.status?.completionTime as unknown as string,
    ),
    age: computeAge(job.metadata?.creationTimestamp),
    conditions,
  }
}

// ── CronJob Mapper ────────────────────────────────────────────

export function mapCronJob(cj: k8s.V1CronJob) {
  const lastSchedule = cj.status?.lastScheduleTime
    ? new Date(cj.status.lastScheduleTime as unknown as string).toISOString()
    : null
  const lastSuccess = cj.status?.lastSuccessfulTime
    ? new Date(cj.status.lastSuccessfulTime as unknown as string).toISOString()
    : null

  return {
    name: cj.metadata?.name ?? '',
    namespace: cj.metadata?.namespace ?? '',
    schedule: cj.spec?.schedule ?? '\u2014',
    suspend: cj.spec?.suspend ?? false,
    lastScheduleTime: lastSchedule,
    lastSuccessfulTime: lastSuccess,
    age: computeAge(cj.metadata?.creationTimestamp),
    timezone: cj.spec?.timeZone ?? null,
    concurrencyPolicy: cj.spec?.concurrencyPolicy ?? 'Allow',
    startingDeadlineSeconds: cj.spec?.startingDeadlineSeconds ?? null,
    successfulJobsHistoryLimit: cj.spec?.successfulJobsHistoryLimit ?? 3,
    failedJobsHistoryLimit: cj.spec?.failedJobsHistoryLimit ?? 1,
    activeJobs: (cj.status?.active ?? []).length,
  }
}

// ── HPA Mapper ────────────────────────────────────────────────

export function mapHPA(hpa: k8s.V2HorizontalPodAutoscaler) {
  const ref = hpa.spec?.scaleTargetRef
  const refStr = ref ? `${ref.kind}/${ref.name}` : '\u2014'

  const metrics = (hpa.spec?.metrics ?? []).map((m) => {
    if (m.type === 'Resource' && m.resource) {
      const current = (hpa.status?.currentMetrics ?? []).find(
        (cm) => cm.type === 'Resource' && cm.resource?.name === m.resource?.name,
      )
      return {
        type: 'Resource' as const,
        name: m.resource.name ?? '',
        targetType: m.resource.target?.type ?? 'Utilization',
        targetValue:
          m.resource.target?.averageUtilization ?? m.resource.target?.averageValue ?? '\u2014',
        currentValue:
          current?.resource?.current?.averageUtilization ??
          current?.resource?.current?.averageValue ??
          null,
      }
    }
    return {
      type: (m.type ?? 'Unknown') as string,
      name: ((m as unknown as Record<string, unknown>)['name'] as string) ?? 'custom',
      targetType: 'Value',
      targetValue: '\u2014' as string | number,
      currentValue: null as string | number | null,
    }
  })

  const conditions = mapConditions(hpa.status?.conditions)

  const behavior = hpa.spec?.behavior
  const scaleUp =
    behavior?.scaleUp?.policies?.map((p) => ({
      type: p.type ?? '',
      value: p.value ?? 0,
      periodSeconds: p.periodSeconds ?? 0,
    })) ?? []
  const scaleDown =
    behavior?.scaleDown?.policies?.map((p) => ({
      type: p.type ?? '',
      value: p.value ?? 0,
      periodSeconds: p.periodSeconds ?? 0,
    })) ?? []

  return {
    name: hpa.metadata?.name ?? '',
    namespace: hpa.metadata?.namespace ?? '',
    reference: refStr,
    minReplicas: hpa.spec?.minReplicas ?? 1,
    maxReplicas: hpa.spec?.maxReplicas ?? 0,
    currentReplicas: hpa.status?.currentReplicas ?? 0,
    desiredReplicas: hpa.status?.desiredReplicas ?? 0,
    age: computeAge(hpa.metadata?.creationTimestamp),
    metrics,
    conditions,
    scaleUpPolicies: scaleUp,
    scaleDownPolicies: scaleDown,
  }
}
