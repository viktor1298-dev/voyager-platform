export type NodePoolStatus = 'Ready' | 'Scaling' | 'Constrained'

export type NodePool = {
  id: string
  name: string
  status: NodePoolStatus
  cpuLimit: number
  memoryLimitGi: number
  nodeCount: number
  disruptionPolicy: 'WhenEmpty' | 'WhenUnderutilized' | 'Never'
  workloads: string[]
}

export type EC2NodeClass = {
  id: string
  name: string
  amiFamily: 'AL2' | 'Bottlerocket' | 'Ubuntu'
  instanceTypes: string[]
  subnets: string[]
}

const nodePools: NodePool[] = [
  {
    id: 'np-general',
    name: 'general-purpose',
    status: 'Ready',
    cpuLimit: 640,
    memoryLimitGi: 1280,
    nodeCount: 18,
    disruptionPolicy: 'WhenUnderutilized',
    workloads: ['api-gateway', 'worker-default', 'internal-tools'],
  },
  {
    id: 'np-spot-batch',
    name: 'spot-batch',
    status: 'Scaling',
    cpuLimit: 1200,
    memoryLimitGi: 4096,
    nodeCount: 37,
    disruptionPolicy: 'WhenEmpty',
    workloads: ['etl-jobs', 'ml-preprocessing', 'report-builder'],
  },
  {
    id: 'np-critical',
    name: 'critical-services',
    status: 'Constrained',
    cpuLimit: 320,
    memoryLimitGi: 768,
    nodeCount: 10,
    disruptionPolicy: 'Never',
    workloads: ['payments', 'auth-service', 'cluster-dns'],
  },
]

const ec2NodeClasses: EC2NodeClass[] = [
  {
    id: 'nc-default',
    name: 'default-amd64',
    amiFamily: 'AL2',
    instanceTypes: ['m6i.large', 'm6i.xlarge', 'c6i.large'],
    subnets: ['subnet-app-a', 'subnet-app-b', 'subnet-app-c'],
  },
  {
    id: 'nc-spot',
    name: 'spot-compute',
    amiFamily: 'Bottlerocket',
    instanceTypes: ['c7g.large', 'c7g.xlarge', 'm7g.large'],
    subnets: ['subnet-batch-a', 'subnet-batch-b'],
  },
  {
    id: 'nc-critical',
    name: 'critical-on-demand',
    amiFamily: 'Ubuntu',
    instanceTypes: ['r6i.large', 'r6i.xlarge'],
    subnets: ['subnet-core-a', 'subnet-core-b'],
  },
]

export function getMockNodePools() {
  return nodePools
}

export function getMockEC2NodeClasses() {
  return ec2NodeClasses
}

export function getKarpenterMetrics() {
  const nodesProvisioned = nodePools.reduce((acc, pool) => acc + pool.nodeCount, 0)
  const pendingPods = 23
  const estimatedCostPerHour = nodePools.reduce((acc, pool) => acc + pool.nodeCount * 0.21, 0)

  return {
    nodesProvisioned,
    pendingPods,
    estimatedCostPerHour,
  }
}
