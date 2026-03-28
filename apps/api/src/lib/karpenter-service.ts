import * as k8s from '@kubernetes/client-node'
import { CACHE_TTL } from '@voyager/config'
import { type Database, karpenterCache } from '@voyager/db'
import type {
  KarpenterEC2NodeClass,
  KarpenterMetrics,
  KarpenterNodeClaim,
  KarpenterNodePool,
  KarpenterTopology,
} from '@voyager/types'
import { and, desc, eq, sql } from 'drizzle-orm'
import { clusterClientPool } from './cluster-client-pool.js'
import { KARPENTER_COST, KARPENTER_CRD, KARPENTER_LABELS } from './karpenter-constants.js'

type PodLike = {
  metadata?: {
    namespace?: string
    name?: string
    ownerReferences?: Array<{ kind?: string; name?: string }>
  }
  spec?: {
    nodeName?: string
  }
  status?: {
    phase?: string
  }
}

type NodeLike = {
  metadata?: {
    name?: string
    labels?: Record<string, string>
  }
}

type CustomObjectsClient = {
  listClusterCustomObject: (params: {
    group: string
    version: string
    plural: string
  }) => Promise<unknown>
}

type CoreV1Client = {
  listNode: () => Promise<{ items: NodeLike[] }>
  listPodForAllNamespaces: () => Promise<{ items: PodLike[] }>
}

function asK8sList(value: unknown): { items: Record<string, unknown>[] } {
  const body =
    value && typeof value === 'object' && 'body' in value
      ? (value as { body?: unknown }).body
      : value

  if (!body || typeof body !== 'object' || !('items' in body)) {
    return { items: [] }
  }

  const items = (body as { items?: unknown }).items
  if (!Array.isArray(items)) {
    return { items: [] }
  }

  return {
    items: items.filter(
      (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
    ),
  }
}

function mapConditions(conditions: unknown): KarpenterNodePool['status']['conditions'] {
  if (!Array.isArray(conditions)) {
    return []
  }

  return conditions
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((condition) => ({
      type: typeof condition.type === 'string' ? condition.type : 'Unknown',
      status: typeof condition.status === 'string' ? condition.status : 'Unknown',
      reason: typeof condition.reason === 'string' ? condition.reason : undefined,
      message: typeof condition.message === 'string' ? condition.message : undefined,
      lastTransitionTime:
        typeof condition.lastTransitionTime === 'string' ? condition.lastTransitionTime : undefined,
    }))
}

const KARPENTER_CACHE_TTL_MS = Number.parseInt(
  process.env.KARPENTER_CACHE_TTL_MS ?? String(CACHE_TTL.KARPENTER_MS),
  10,
)

type KarpenterCacheDataType =
  | 'node-pools'
  | 'node-claims'
  | 'ec2-node-classes'
  | 'metrics'
  | 'topology'

export class KarpenterService {
  constructor(
    private readonly kubeConfigGetter: (clusterId: string) => Promise<k8s.KubeConfig>,
    private readonly db: Database,
    private readonly customObjectsClientFactory: (kc: k8s.KubeConfig) => CustomObjectsClient = (
      kc,
    ) => kc.makeApiClient(k8s.CustomObjectsApi),
    private readonly coreV1ClientFactory: (kc: k8s.KubeConfig) => CoreV1Client = (kc) =>
      kc.makeApiClient(k8s.CoreV1Api),
  ) {}

  private async getCached<T>(
    clusterId: string,
    dataType: KarpenterCacheDataType,
  ): Promise<T | null> {
    try {
      const [row] = await this.db
        .select({ payload: karpenterCache.payload, observedAt: karpenterCache.observedAt })
        .from(karpenterCache)
        .where(and(eq(karpenterCache.clusterId, clusterId), eq(karpenterCache.dataType, dataType)))
        .orderBy(desc(karpenterCache.observedAt))
        .limit(1)

      if (!row) return null

      const ageMs = Date.now() - row.observedAt.getTime()
      if (ageMs > KARPENTER_CACHE_TTL_MS) {
        return null
      }

      return row.payload as T
    } catch {
      return null
    }
  }

  private async setCached(clusterId: string, dataType: KarpenterCacheDataType, payload: unknown) {
    try {
      const normalizedPayload =
        typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>)
          : { value: payload }

      await this.db
        .insert(karpenterCache)
        .values({
          clusterId,
          dataType,
          payload: normalizedPayload,
          observedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [karpenterCache.clusterId, karpenterCache.dataType],
          set: {
            payload: sql`excluded.payload`,
            observedAt: sql`excluded.observed_at`,
          },
        })
    } catch {
      // best-effort cache, never fail the request
    }
  }

  async hasKarpenter(clusterId: string): Promise<boolean> {
    const kc = await this.kubeConfigGetter(clusterId)
    const customObjects = this.customObjectsClientFactory(kc)

    try {
      await customObjects.listClusterCustomObject({
        group: KARPENTER_CRD.nodePools.group,
        version: KARPENTER_CRD.nodePools.version,
        plural: KARPENTER_CRD.nodePools.plural,
      })
      return true
    } catch {
      return false
    }
  }

  async listNodePools(clusterId: string): Promise<KarpenterNodePool[]> {
    const cached = await this.getCached<KarpenterNodePool[]>(clusterId, 'node-pools')
    if (cached) return cached

    const kc = await this.kubeConfigGetter(clusterId)
    const customObjects = this.customObjectsClientFactory(kc)

    const res = await customObjects.listClusterCustomObject({
      group: KARPENTER_CRD.nodePools.group,
      version: KARPENTER_CRD.nodePools.version,
      plural: KARPENTER_CRD.nodePools.plural,
    })

    const result = asK8sList(res).items.map((item) => {
      const metadata = (item.metadata as Record<string, unknown> | undefined) ?? {}
      const spec = (item.spec as Record<string, unknown> | undefined) ?? {}
      const status = (item.status as Record<string, unknown> | undefined) ?? {}
      const template = (spec.template as Record<string, unknown> | undefined) ?? {}
      const templateSpec = (template.spec as Record<string, unknown> | undefined) ?? {}
      const disruption = (spec.disruption as Record<string, unknown> | undefined) ?? {}

      const limits = (spec.limits as Record<string, unknown> | undefined) ?? {}
      const resources = (status.resources as Record<string, unknown> | undefined) ?? {}

      return {
        name: typeof metadata.name === 'string' ? metadata.name : 'unknown',
        nodeClassRef:
          templateSpec.nodeClassRef && typeof templateSpec.nodeClassRef === 'object'
            ? {
                group:
                  typeof (templateSpec.nodeClassRef as Record<string, unknown>).group === 'string'
                    ? ((templateSpec.nodeClassRef as Record<string, unknown>).group as string)
                    : undefined,
                kind:
                  typeof (templateSpec.nodeClassRef as Record<string, unknown>).kind === 'string'
                    ? ((templateSpec.nodeClassRef as Record<string, unknown>).kind as string)
                    : undefined,
                name:
                  typeof (templateSpec.nodeClassRef as Record<string, unknown>).name === 'string'
                    ? ((templateSpec.nodeClassRef as Record<string, unknown>).name as string)
                    : undefined,
              }
            : null,
        limits: Object.fromEntries(
          Object.entries(limits).map(([key, value]) => [key, String(value)]),
        ),
        disruption: {
          consolidationPolicy:
            typeof disruption.consolidationPolicy === 'string'
              ? disruption.consolidationPolicy
              : null,
          consolidateAfter:
            typeof disruption.consolidateAfter === 'string' ? disruption.consolidateAfter : null,
          budgets: Array.isArray(disruption.budgets)
            ? disruption.budgets.filter(
                (budget): budget is Record<string, unknown> =>
                  typeof budget === 'object' && budget !== null,
              )
            : [],
        },
        replicas: typeof spec.replicas === 'number' ? spec.replicas : null,
        status: {
          nodes: typeof status.nodes === 'number' ? status.nodes : 0,
          conditions: mapConditions(status.conditions),
          resources: Object.fromEntries(
            Object.entries(resources).map(([key, value]) => [key, String(value)]),
          ),
        },
      }
    })

    await this.setCached(clusterId, 'node-pools', result)
    return result
  }

  async listNodeClaims(clusterId: string): Promise<KarpenterNodeClaim[]> {
    const cached = await this.getCached<KarpenterNodeClaim[]>(clusterId, 'node-claims')
    if (cached) return cached

    const kc = await this.kubeConfigGetter(clusterId)
    const customObjects = this.customObjectsClientFactory(kc)

    const res = await customObjects.listClusterCustomObject({
      group: KARPENTER_CRD.nodeClaims.group,
      version: KARPENTER_CRD.nodeClaims.version,
      plural: KARPENTER_CRD.nodeClaims.plural,
    })

    const result = asK8sList(res).items.map((item) => {
      const metadata = (item.metadata as Record<string, unknown> | undefined) ?? {}
      const labels = (metadata.labels as Record<string, string> | undefined) ?? {}
      const spec = (item.spec as Record<string, unknown> | undefined) ?? {}
      const status = (item.status as Record<string, unknown> | undefined) ?? {}

      const specResources = (spec.resources as Record<string, unknown> | undefined) ?? {}
      const specRequests = (specResources.requests as Record<string, unknown> | undefined) ?? {}
      const statusAllocatable = (status.allocatable as Record<string, unknown> | undefined) ?? {}
      const statusCapacity = (status.capacity as Record<string, unknown> | undefined) ?? {}

      const rawRequirements = Array.isArray(spec.requirements) ? spec.requirements : []

      return {
        name: typeof metadata.name === 'string' ? metadata.name : 'unknown',
        nodePoolName:
          typeof labels[KARPENTER_LABELS.nodePool] === 'string'
            ? labels[KARPENTER_LABELS.nodePool]
            : null,
        instanceType:
          typeof labels['node.kubernetes.io/instance-type'] === 'string'
            ? labels['node.kubernetes.io/instance-type']
            : null,
        capacityType:
          typeof labels['karpenter.sh/capacity-type'] === 'string'
            ? labels['karpenter.sh/capacity-type']
            : null,
        zone:
          typeof labels['topology.kubernetes.io/zone'] === 'string'
            ? labels['topology.kubernetes.io/zone']
            : null,
        nodeName: typeof status.nodeName === 'string' ? status.nodeName : null,
        providerID: typeof status.providerID === 'string' ? status.providerID : null,
        imageID: typeof status.imageID === 'string' ? status.imageID : null,
        expireAfter: typeof spec.expireAfter === 'string' ? spec.expireAfter : null,
        resources: {
          requests: Object.fromEntries(
            Object.entries(specRequests).map(([key, value]) => [key, String(value)]),
          ),
          allocatable: Object.fromEntries(
            Object.entries(statusAllocatable).map(([key, value]) => [key, String(value)]),
          ),
          capacity: Object.fromEntries(
            Object.entries(statusCapacity).map(([key, value]) => [key, String(value)]),
          ),
        },
        requirements: rawRequirements
          .filter((req): req is Record<string, unknown> => typeof req === 'object' && req !== null)
          .map((req) => ({
            key: typeof req.key === 'string' ? req.key : 'unknown',
            operator: typeof req.operator === 'string' ? req.operator : 'unknown',
            values: Array.isArray(req.values)
              ? req.values.filter((v): v is string => typeof v === 'string')
              : [],
          })),
        conditions: mapConditions(status.conditions),
      }
    })

    await this.setCached(clusterId, 'node-claims', result)
    return result
  }

  async listEC2NodeClasses(clusterId: string): Promise<KarpenterEC2NodeClass[]> {
    const cached = await this.getCached<KarpenterEC2NodeClass[]>(clusterId, 'ec2-node-classes')
    if (cached) return cached

    const kc = await this.kubeConfigGetter(clusterId)
    const customObjects = this.customObjectsClientFactory(kc)

    const res = await customObjects.listClusterCustomObject({
      group: KARPENTER_CRD.ec2NodeClasses.group,
      version: KARPENTER_CRD.ec2NodeClasses.version,
      plural: KARPENTER_CRD.ec2NodeClasses.plural,
    })

    const result = asK8sList(res).items.map((item) => {
      const metadata = (item.metadata as Record<string, unknown> | undefined) ?? {}
      const spec = (item.spec as Record<string, unknown> | undefined) ?? {}
      const status = (item.status as Record<string, unknown> | undefined) ?? {}

      const subnets = Array.isArray(status.subnets)
        ? status.subnets.filter(
            (s): s is Record<string, unknown> => typeof s === 'object' && s !== null,
          )
        : []

      const securityGroups = Array.isArray(status.securityGroups)
        ? status.securityGroups.filter(
            (s): s is Record<string, unknown> => typeof s === 'object' && s !== null,
          )
        : []

      const amis = Array.isArray(status.amis)
        ? status.amis.filter(
            (s): s is Record<string, unknown> => typeof s === 'object' && s !== null,
          )
        : []

      return {
        name: typeof metadata.name === 'string' ? metadata.name : 'unknown',
        amiFamily: typeof spec.amiFamily === 'string' ? spec.amiFamily : null,
        role: typeof spec.role === 'string' ? spec.role : null,
        instanceProfile: typeof spec.instanceProfile === 'string' ? spec.instanceProfile : null,
        subnetSelectorTerms: Array.isArray(spec.subnetSelectorTerms)
          ? spec.subnetSelectorTerms.filter(
              (term): term is Record<string, unknown> => typeof term === 'object',
            )
          : [],
        securityGroupSelectorTerms: Array.isArray(spec.securityGroupSelectorTerms)
          ? spec.securityGroupSelectorTerms.filter(
              (term): term is Record<string, unknown> => typeof term === 'object',
            )
          : [],
        amiSelectorTerms: Array.isArray(spec.amiSelectorTerms)
          ? spec.amiSelectorTerms.filter(
              (term): term is Record<string, unknown> => typeof term === 'object',
            )
          : [],
        blockDeviceMappings: Array.isArray(spec.blockDeviceMappings)
          ? spec.blockDeviceMappings
              .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
              .map((mapping) => {
                const ebs =
                  typeof mapping.ebs === 'object' && mapping.ebs !== null
                    ? (mapping.ebs as Record<string, unknown>)
                    : {}
                return {
                  deviceName:
                    typeof mapping.deviceName === 'string' ? mapping.deviceName : 'unknown',
                  ebs: {
                    volumeSize: typeof ebs.volumeSize === 'string' ? ebs.volumeSize : null,
                    volumeType: typeof ebs.volumeType === 'string' ? ebs.volumeType : null,
                    deleteOnTermination:
                      typeof ebs.deleteOnTermination === 'boolean' ? ebs.deleteOnTermination : null,
                  },
                }
              })
          : [],
        metadataOptions:
          typeof spec.metadataOptions === 'object' && spec.metadataOptions !== null
            ? (() => {
                const mo = spec.metadataOptions as Record<string, unknown>
                return {
                  httpEndpoint: typeof mo.httpEndpoint === 'string' ? mo.httpEndpoint : null,
                  httpTokens: typeof mo.httpTokens === 'string' ? mo.httpTokens : null,
                  httpPutResponseHopLimit:
                    typeof mo.httpPutResponseHopLimit === 'number'
                      ? mo.httpPutResponseHopLimit
                      : null,
                  httpProtocolIPv6:
                    typeof mo.httpProtocolIPv6 === 'string' ? mo.httpProtocolIPv6 : null,
                }
              })()
            : null,
        tags:
          typeof spec.tags === 'object' && spec.tags !== null
            ? Object.fromEntries(
                Object.entries(spec.tags as Record<string, unknown>).filter(
                  (entry): entry is [string, string] => typeof entry[1] === 'string',
                ),
              )
            : {},
        status: {
          subnets: subnets.map((subnet) => ({
            id: typeof subnet.id === 'string' ? subnet.id : 'unknown',
            zone: typeof subnet.zone === 'string' ? subnet.zone : null,
          })),
          securityGroups: securityGroups.map((securityGroup) => ({
            id: typeof securityGroup.id === 'string' ? securityGroup.id : 'unknown',
            name: typeof securityGroup.name === 'string' ? securityGroup.name : null,
          })),
          amis: amis.map((ami) => ({
            id: typeof ami.id === 'string' ? ami.id : 'unknown',
            name: typeof ami.name === 'string' ? ami.name : null,
          })),
          conditions: mapConditions(status.conditions),
        },
      }
    })

    await this.setCached(clusterId, 'ec2-node-classes', result)
    return result
  }

  async getMetrics(clusterId: string): Promise<KarpenterMetrics> {
    const cached = await this.getCached<KarpenterMetrics>(clusterId, 'metrics')
    if (cached) return cached

    const kc = await this.kubeConfigGetter(clusterId)
    const coreV1 = this.coreV1ClientFactory(kc)

    const [nodesRes, podsRes] = await Promise.all([
      coreV1.listNode(),
      coreV1.listPodForAllNamespaces(),
    ])

    const karpenterNodes = nodesRes.items.filter((node) => {
      const labels = node.metadata?.labels ?? {}
      return labels[KARPENTER_LABELS.nodePool] !== undefined
    })

    const pendingPods = podsRes.items.filter((pod) => pod.status?.phase === 'Pending').length

    const result = {
      nodesProvisioned: karpenterNodes.length,
      pendingPods,
      estimatedHourlyCostUsd: Number(
        (karpenterNodes.length * KARPENTER_COST.defaultHourlyUsdPerNode).toFixed(2),
      ),
    }

    await this.setCached(clusterId, 'metrics', result)
    return result
  }

  async getTopology(clusterId: string): Promise<KarpenterTopology> {
    const cached = await this.getCached<KarpenterTopology>(clusterId, 'topology')
    if (cached) return cached

    const kc = await this.kubeConfigGetter(clusterId)
    const coreV1 = this.coreV1ClientFactory(kc)

    const [nodesRes, podsRes] = await Promise.all([
      coreV1.listNode(),
      coreV1.listPodForAllNamespaces(),
    ])

    const nodeNameToPool = new Map<string, string>()
    const poolToNodeCount = new Map<string, number>()

    for (const node of nodesRes.items) {
      const nodeName = node.metadata?.name
      const nodePool = node.metadata?.labels?.[KARPENTER_LABELS.nodePool]

      if (!nodeName || !nodePool) {
        continue
      }

      nodeNameToPool.set(nodeName, nodePool)
      poolToNodeCount.set(nodePool, (poolToNodeCount.get(nodePool) ?? 0) + 1)
    }

    const poolToWorkloads = new Map<
      string,
      Map<string, { namespace: string; kind: string; name: string; replicas: number }>
    >()

    for (const pod of podsRes.items) {
      const nodeName = pod.spec?.nodeName
      if (!nodeName) {
        continue
      }

      const nodePool = nodeNameToPool.get(nodeName)
      if (!nodePool) {
        continue
      }

      const namespace = pod.metadata?.namespace ?? 'default'
      const owner = pod.metadata?.ownerReferences?.[0]
      const kind = owner?.kind ?? 'Pod'
      const name = owner?.name ?? pod.metadata?.name ?? 'unknown'
      const key = `${namespace}/${kind}/${name}`

      if (!poolToWorkloads.has(nodePool)) {
        poolToWorkloads.set(nodePool, new Map())
      }

      const current = poolToWorkloads.get(nodePool)?.get(key)
      if (current) {
        current.replicas += 1
      } else {
        poolToWorkloads.get(nodePool)?.set(key, {
          namespace,
          kind,
          name,
          replicas: 1,
        })
      }
    }

    const result = {
      nodePools: [...poolToNodeCount.entries()].map(([nodePool, nodes]) => ({
        nodePool,
        nodes,
        workloads: [...(poolToWorkloads.get(nodePool)?.values() ?? [])],
      })),
    }

    await this.setCached(clusterId, 'topology', result)
    return result
  }
}

export function createKarpenterService(db: Database): KarpenterService {
  return new KarpenterService((clusterId) => clusterClientPool.getClient(clusterId), db)
}
