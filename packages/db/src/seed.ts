import { db } from './client'
import { events, clusters, nodes } from './schema'

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('🚨 Cannot run seed in production!')
    process.exit(1)
  }

  console.log('🌱 Seeding database...')

  // Clean existing data
  await db.delete(events)
  await db.delete(nodes)
  await db.delete(clusters)

  // Insert clusters
  const [minikube, eks, productionEks, stagingAks, analyticsGke, devK3s] = await db
    .insert(clusters)
    .values([
      {
        name: 'minikube-dev',
        provider: 'minikube',
        endpoint: 'https://192.168.49.2:8443',
        status: 'healthy',
        version: 'v1.33.0',
        nodesCount: 3,
      },
      {
        name: 'eks-production',
        provider: 'eks',
        endpoint: 'https://eks.us-east-1.amazonaws.com/prod',
        status: 'degraded',
        version: 'v1.31.2',
        nodesCount: 3,
      },
      {
        name: 'production-eks',
        provider: 'aws',
        endpoint: 'https://eks.us-east-1.amazonaws.com',
        status: 'healthy',
        version: 'v1.31',
        nodesCount: 12,
      },
      {
        name: 'staging-aks',
        provider: 'azure',
        endpoint: 'https://staging-aks.westeurope.azmk8s.io',
        status: 'healthy',
        version: 'v1.30',
        nodesCount: 6,
      },
      {
        name: 'analytics-gke',
        provider: 'gcp',
        endpoint: 'https://gke.europe-west1.gcp.com',
        status: 'warning',
        version: 'v1.32',
        nodesCount: 8,
      },
      {
        name: 'dev-k3s',
        provider: 'k3s',
        endpoint: 'https://k3s.internal.local',
        status: 'degraded',
        version: 'v1.29',
        nodesCount: 3,
      },
    ])
    .returning()

  console.log('✅ Inserted 6 clusters')

  // Insert nodes
  const nodeData = [
    // minikube-dev nodes
    {
      clusterId: minikube.id,
      name: 'minikube-node-1',
      status: 'Ready',
      role: 'control-plane',
      cpuCapacity: 4000,
      cpuAllocatable: 3500,
      memoryCapacity: 8_000_000_000,
      memoryAllocatable: 7_000_000_000,
      podsCount: 12,
      k8sVersion: 'v1.33.0',
    },
    {
      clusterId: minikube.id,
      name: 'minikube-node-2',
      status: 'Ready',
      role: 'worker',
      cpuCapacity: 4000,
      cpuAllocatable: 3800,
      memoryCapacity: 8_000_000_000,
      memoryAllocatable: 7_500_000_000,
      podsCount: 8,
      k8sVersion: 'v1.33.0',
    },
    {
      clusterId: minikube.id,
      name: 'minikube-node-3',
      status: 'Ready',
      role: 'worker',
      cpuCapacity: 4000,
      cpuAllocatable: 3800,
      memoryCapacity: 8_000_000_000,
      memoryAllocatable: 7_500_000_000,
      podsCount: 5,
      k8sVersion: 'v1.33.0',
    },
    // eks-production nodes
    {
      clusterId: eks.id,
      name: 'ip-10-0-1-101.ec2',
      status: 'Ready',
      role: 'worker',
      cpuCapacity: 8000,
      cpuAllocatable: 7500,
      memoryCapacity: 16_000_000_000,
      memoryAllocatable: 15_000_000_000,
      podsCount: 25,
      k8sVersion: 'v1.31.2',
    },
    {
      clusterId: eks.id,
      name: 'ip-10-0-1-102.ec2',
      status: 'Ready',
      role: 'worker',
      cpuCapacity: 8000,
      cpuAllocatable: 7500,
      memoryCapacity: 16_000_000_000,
      memoryAllocatable: 15_000_000_000,
      podsCount: 30,
      k8sVersion: 'v1.31.2',
    },
    {
      clusterId: eks.id,
      name: 'ip-10-0-1-103.ec2',
      status: 'NotReady',
      role: 'worker',
      cpuCapacity: 8000,
      cpuAllocatable: 7500,
      memoryCapacity: 16_000_000_000,
      memoryAllocatable: 15_000_000_000,
      podsCount: 0,
      k8sVersion: 'v1.31.2',
    },
    // production-eks (AWS) nodes
    ...Array.from({ length: 12 }, (_, i) => ({
      clusterId: productionEks.id,
      name: `ip-10-1-${Math.floor(i / 4)}-${10 + i}.ec2.internal`,
      status: 'Ready',
      role: i === 0 ? 'control-plane' : 'worker',
      cpuCapacity: 16000,
      cpuAllocatable: 15000,
      memoryCapacity: 64_000_000_000,
      memoryAllocatable: 62_000_000_000,
      podsCount: 20 + Math.floor(Math.random() * 30),
      k8sVersion: 'v1.31',
    })),
    // staging-aks (Azure) nodes
    ...Array.from({ length: 6 }, (_, i) => ({
      clusterId: stagingAks.id,
      name: `aks-nodepool1-${30000000 + i}-vmss00000${i}`,
      status: 'Ready',
      role: i === 0 ? 'control-plane' : 'worker',
      cpuCapacity: 8000,
      cpuAllocatable: 7500,
      memoryCapacity: 32_000_000_000,
      memoryAllocatable: 30_000_000_000,
      podsCount: 15 + Math.floor(Math.random() * 20),
      k8sVersion: 'v1.30',
    })),
    // analytics-gke (GCP) nodes
    ...Array.from({ length: 8 }, (_, i) => ({
      clusterId: analyticsGke.id,
      name: `gke-analytics-pool-${String(i).padStart(4, '0')}`,
      status: i === 5 ? 'NotReady' : 'Ready',
      role: i === 0 ? 'control-plane' : 'worker',
      cpuCapacity: 32000,
      cpuAllocatable: 31000,
      memoryCapacity: 128_000_000_000,
      memoryAllocatable: 126_000_000_000,
      podsCount: i === 5 ? 0 : 40 + Math.floor(Math.random() * 20),
      k8sVersion: 'v1.32',
    })),
    // dev-k3s nodes
    ...Array.from({ length: 3 }, (_, i) => ({
      clusterId: devK3s.id,
      name: `k3s-node-${i + 1}`,
      status: i === 2 ? 'NotReady' : 'Ready',
      role: i === 0 ? 'control-plane' : 'worker',
      cpuCapacity: 2000,
      cpuAllocatable: 1800,
      memoryCapacity: 4_000_000_000,
      memoryAllocatable: 3_500_000_000,
      podsCount: i === 2 ? 0 : 8 + Math.floor(Math.random() * 5),
      k8sVersion: 'v1.29',
    })),
  ]
  await db.insert(nodes).values(nodeData)
  console.log(`✅ Inserted ${nodeData.length} nodes`)

  // Insert events
  const eventKinds = ['Warning', 'Normal'] as const
  const reasons = {
    Warning: ['BackOff', 'FailedScheduling', 'Unhealthy', 'OOMKilling', 'FailedMount'],
    Normal: ['Scheduled', 'Pulled', 'Created', 'Started', 'ScalingReplicaSet'],
  }
  const messages = {
    Warning: [
      'Back-off restarting failed container',
      '0/3 nodes are available: insufficient memory',
      'Liveness probe failed: connection refused',
      'Container killed due to OOM',
      'Unable to attach or mount volumes',
    ],
    Normal: [
      'Successfully assigned pod to node',
      'Successfully pulled image nginx:latest',
      'Created container web-app',
      'Started container web-app',
      'Scaled up replica set to 3',
    ],
  }

  const allClusterIds = [minikube.id, eks.id, productionEks.id, stagingAks.id, analyticsGke.id, devK3s.id]
  const eventValues = []
  for (let i = 0; i < 30; i++) {
    const kind = eventKinds[i % 2]
    const idx = i % 5
    const clusterId = allClusterIds[i % allClusterIds.length]
    const hoursAgo = Math.floor(Math.random() * 48)
    eventValues.push({
      clusterId,
      namespace: i % 3 === 0 ? 'kube-system' : 'default',
      kind,
      reason: reasons[kind][idx],
      message: messages[kind][idx],
      source: 'kubelet',
      involvedObject: {
        kind: 'Pod',
        name: `pod-${i}`,
        namespace: i % 3 === 0 ? 'kube-system' : 'default',
      },
      timestamp: new Date(Date.now() - hoursAgo * 3600 * 1000),
    })
  }
  await db.insert(events).values(eventValues)
  console.log('✅ Inserted 30 events')

  console.log('🎉 Seed complete!')
  process.exit(0)
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
