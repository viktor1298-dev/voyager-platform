export const KARPENTER_CRD = {
  nodePools: {
    group: 'karpenter.sh',
    version: 'v1',
    plural: 'nodepools',
  },
  nodeClaims: {
    group: 'karpenter.sh',
    version: 'v1',
    plural: 'nodeclaims',
  },
  ec2NodeClasses: {
    group: 'karpenter.k8s.aws',
    version: 'v1',
    plural: 'ec2nodeclasses',
  },
} as const

export const KARPENTER_LABELS = {
  nodePool: 'karpenter.sh/nodepool',
} as const

export const KARPENTER_COST = {
  defaultHourlyUsdPerNode: 0.12,
} as const
