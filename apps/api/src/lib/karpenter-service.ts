import * as k8s from '@kubernetes/client-node'
import { TRPCError } from '@trpc/server'
import { clusters, type Database } from '@voyager/db'
import type { KarpenterEC2NodeClass, KarpenterMetrics, KarpenterNodePool, KarpenterTopology } from '@voyager/types'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { connectionConfigSchema, type ClusterConnectionConfig } from './connection-config.js'
import { createKubeConfigForCluster } from './k8s-client-factory.js'
import { KARPENTER_COST, KARPENTER_CRD, KARPENTER_LABELS } from './karpenter-constants.js'

const clusterSchema = z.object({
  id: z.string(),
  provider: z.string(),
  connectionConfig: z.record(z.string(), z.unknown()),
})

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
    items: items.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null),
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

export class KarpenterService {
  constructor(
    private readonly db: Database,
    private readonly customObjectsClientFactory: (kc: k8s.KubeConfig) => CustomObjectsClient = (kc) =>
      kc.makeApiClient(k8s.CustomObjectsApi),
    private readonly coreV1ClientFactory: (kc: k8s.KubeConfig) => CoreV1Client = (kc) => kc.makeApiClient(k8s.CoreV1Api),
  ) {}

  private async getClusterKubeConfig(clusterId: string): Promise<k8s.KubeConfig> {
    const [cluster] = await this.db.select().from(clusters).where(eq(clusters.id, clusterId))
    const parsedCluster = clusterSchema.safeParse(cluster)

    if (!parsedCluster.success) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cluster not found' })
    }

    const parsedConnectionConfig = connectionConfigSchema.safeParse(parsedCluster.data.connectionConfig)
    if (!parsedConnectionConfig.success) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid cluster connection configuration' })
    }

    return createKubeConfigForCluster(
      parsedCluster.data.provider as Parameters<typeof createKubeConfigForCluster>[0],
      parsedConnectionConfig.data as ClusterConnectionConfig,
    )
  }

  async hasKarpenter(clusterId: string): Promise<boolean> {
    const kc = await this.getClusterKubeConfig(clusterId)
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
    const kc = await this.getClusterKubeConfig(clusterId)
    const customObjects = this.customObjectsClientFactory(kc)

    const res = await customObjects.listClusterCustomObject({
      group: KARPENTER_CRD.nodePools.group,
      version: KARPENTER_CRD.nodePools.version,
      plural: KARPENTER_CRD.nodePools.plural,
    })

    return asK8sList(res).items.map((item) => {
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
        limits: Object.fromEntries(Object.entries(limits).map(([key, value]) => [key, String(value)])),
        disruption: {
          consolidationPolicy:
            typeof disruption.consolidationPolicy === 'string' ? disruption.consolidationPolicy : null,
          consolidateAfter: typeof disruption.consolidateAfter === 'string' ? disruption.consolidateAfter : null,
          budgets: Array.isArray(disruption.budgets)
            ? disruption.budgets.filter(
                (budget): budget is Record<string, unknown> => typeof budget === 'object' && budget !== null,
              )
            : [],
        },
        replicas: typeof spec.replicas === 'number' ? spec.replicas : null,
        status: {
          nodes: typeof status.nodes === 'number' ? status.nodes : 0,
          conditions: mapConditions(status.conditions),
          resources: Object.fromEntries(Object.entries(resources).map(([key, value]) => [key, String(value)])),
        },
      }
    })
  }

  async listEC2NodeClasses(clusterId: string): Promise<KarpenterEC2NodeClass[]> {
    const kc = await this.getClusterKubeConfig(clusterId)
    const customObjects = this.customObjectsClientFactory(kc)

    const res = await customObjects.listClusterCustomObject({
      group: KARPENTER_CRD.ec2NodeClasses.group,
      version: KARPENTER_CRD.ec2NodeClasses.version,
      plural: KARPENTER_CRD.ec2NodeClasses.plural,
    })

    return asK8sList(res).items.map((item) => {
      const metadata = (item.metadata as Record<string, unknown> | undefined) ?? {}
      const spec = (item.spec as Record<string, unknown> | undefined) ?? {}
      const status = (item.status as Record<string, unknown> | undefined) ?? {}

      const subnets = Array.isArray(status.subnets)
        ? status.subnets.filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
        : []

      const securityGroups = Array.isArray(status.securityGroups)
        ? status.securityGroups.filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
        : []

      const amis = Array.isArray(status.amis)
        ? status.amis.filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
        : []

      return {
        name: typeof metadata.name === 'string' ? metadata.name : 'unknown',
        amiFamily: typeof spec.amiFamily === 'string' ? spec.amiFamily : null,
        role: typeof spec.role === 'string' ? spec.role : null,
        instanceProfile: typeof spec.instanceProfile === 'string' ? spec.instanceProfile : null,
        subnetSelectorTerms: Array.isArray(spec.subnetSelectorTerms)
          ? spec.subnetSelectorTerms.filter((term): term is Record<string, unknown> => typeof term === 'object')
          : [],
        securityGroupSelectorTerms: Array.isArray(spec.securityGroupSelectorTerms)
          ? spec.securityGroupSelectorTerms.filter((term): term is Record<string, unknown> => typeof term === 'object')
          : [],
        amiSelectorTerms: Array.isArray(spec.amiSelectorTerms)
          ? spec.amiSelectorTerms.filter((term): term is Record<string, unknown> => typeof term === 'object')
          : [],
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
  }

  async getMetrics(clusterId: string): Promise<KarpenterMetrics> {
    const kc = await this.getClusterKubeConfig(clusterId)
    const coreV1 = this.coreV1ClientFactory(kc)

    const [nodesRes, podsRes] = await Promise.all([coreV1.listNode(), coreV1.listPodForAllNamespaces()])

    const karpenterNodes = nodesRes.items.filter((node) => {
      const labels = node.metadata?.labels ?? {}
      return labels[KARPENTER_LABELS.nodePool] !== undefined
    })

    const pendingPods = podsRes.items.filter((pod) => pod.status?.phase === 'Pending').length

    return {
      nodesProvisioned: karpenterNodes.length,
      pendingPods,
      estimatedHourlyCostUsd: Number(
        (karpenterNodes.length * KARPENTER_COST.defaultHourlyUsdPerNode).toFixed(2),
      ),
    }
  }

  async getTopology(clusterId: string): Promise<KarpenterTopology> {
    const kc = await this.getClusterKubeConfig(clusterId)
    const coreV1 = this.coreV1ClientFactory(kc)

    const [nodesRes, podsRes] = await Promise.all([coreV1.listNode(), coreV1.listPodForAllNamespaces()])

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

    const poolToWorkloads = new Map<string, Map<string, { namespace: string; kind: string; name: string; replicas: number }>>()

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

    return {
      nodePools: [...poolToNodeCount.entries()].map(([nodePool, nodes]) => ({
        nodePool,
        nodes,
        workloads: [...(poolToWorkloads.get(nodePool)?.values() ?? [])],
      })),
    }
  }
}

export function createKarpenterService(db: Database): KarpenterService {
  return new KarpenterService(db)
}
