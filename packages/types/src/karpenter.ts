import { z } from 'zod'

export const karpenterConditionSchema = z.object({
  type: z.string(),
  status: z.string(),
  reason: z.string().optional(),
  message: z.string().optional(),
  lastTransitionTime: z.string().optional(),
})

export const karpenterNodePoolSchema = z.object({
  name: z.string(),
  nodeClassRef: z
    .object({
      group: z.string().optional(),
      kind: z.string().optional(),
      name: z.string().optional(),
    })
    .nullable(),
  limits: z.record(z.string(), z.string()).default({}),
  disruption: z
    .object({
      consolidationPolicy: z.string().nullable(),
      consolidateAfter: z.string().nullable(),
      budgets: z.array(z.record(z.string(), z.unknown())).default([]),
    })
    .default({
      consolidationPolicy: null,
      consolidateAfter: null,
      budgets: [],
    }),
  replicas: z.number().nullable(),
  status: z.object({
    nodes: z.number().int().nonnegative(),
    conditions: z.array(karpenterConditionSchema),
    resources: z.record(z.string(), z.string()).default({}),
  }),
})

export const karpenterNodeClaimSchema = z.object({
  name: z.string(),
  nodePoolName: z.string().nullable(),
  instanceType: z.string().nullable(),
  capacityType: z.string().nullable(),
  zone: z.string().nullable(),
  nodeName: z.string().nullable(),
  providerID: z.string().nullable(),
  imageID: z.string().nullable(),
  expireAfter: z.string().nullable(),
  resources: z.object({
    requests: z.record(z.string(), z.string()).default({}),
    allocatable: z.record(z.string(), z.string()).default({}),
    capacity: z.record(z.string(), z.string()).default({}),
  }),
  requirements: z
    .array(
      z.object({
        key: z.string(),
        operator: z.string(),
        values: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  conditions: z.array(karpenterConditionSchema),
})

export const karpenterEC2NodeClassSchema = z.object({
  name: z.string(),
  amiFamily: z.string().nullable(),
  role: z.string().nullable(),
  instanceProfile: z.string().nullable(),
  subnetSelectorTerms: z.array(z.record(z.string(), z.unknown())).default([]),
  securityGroupSelectorTerms: z.array(z.record(z.string(), z.unknown())).default([]),
  amiSelectorTerms: z.array(z.record(z.string(), z.unknown())).default([]),
  blockDeviceMappings: z
    .array(
      z.object({
        deviceName: z.string(),
        ebs: z
          .object({
            volumeSize: z.string().nullable(),
            volumeType: z.string().nullable(),
            deleteOnTermination: z.boolean().nullable(),
          })
          .default({ volumeSize: null, volumeType: null, deleteOnTermination: null }),
      }),
    )
    .default([]),
  metadataOptions: z
    .object({
      httpEndpoint: z.string().nullable(),
      httpTokens: z.string().nullable(),
      httpPutResponseHopLimit: z.number().nullable(),
      httpProtocolIPv6: z.string().nullable(),
    })
    .nullable()
    .default(null),
  tags: z.record(z.string(), z.string()).default({}),
  status: z.object({
    subnets: z.array(z.object({ id: z.string(), zone: z.string().nullable() })).default([]),
    securityGroups: z.array(z.object({ id: z.string(), name: z.string().nullable() })).default([]),
    amis: z.array(z.object({ id: z.string(), name: z.string().nullable() })).default([]),
    conditions: z.array(karpenterConditionSchema),
  }),
})

export const karpenterMetricsSchema = z.object({
  nodesProvisioned: z.number().int().nonnegative(),
  pendingPods: z.number().int().nonnegative(),
  estimatedHourlyCostUsd: z.number().nonnegative(),
})

export const karpenterTopologyWorkloadSchema = z.object({
  namespace: z.string(),
  kind: z.string(),
  name: z.string(),
  replicas: z.number().int().nonnegative(),
})

export const karpenterTopologyNodePoolSchema = z.object({
  nodePool: z.string(),
  nodes: z.number().int().nonnegative(),
  workloads: z.array(karpenterTopologyWorkloadSchema),
})

export const karpenterTopologySchema = z.object({
  nodePools: z.array(karpenterTopologyNodePoolSchema),
})

export type KarpenterNodePool = z.infer<typeof karpenterNodePoolSchema>
export type KarpenterNodeClaim = z.infer<typeof karpenterNodeClaimSchema>
export type KarpenterEC2NodeClass = z.infer<typeof karpenterEC2NodeClassSchema>
export type KarpenterMetrics = z.infer<typeof karpenterMetricsSchema>
export type KarpenterTopology = z.infer<typeof karpenterTopologySchema>
