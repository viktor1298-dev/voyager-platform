import { db } from './client'
import { events, clusters, nodes } from './schema'

async function seed() {
  console.log('🌱 Seeding database...')

  // Clean existing data
  await db.delete(events)
  await db.delete(nodes)
  await db.delete(clusters)

  // Insert clusters
  const [minikube, eks] = await db
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
    ])
    .returning()

  console.log('✅ Inserted 2 clusters')

  // Insert nodes
  const nodeData = [
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
  ]
  await db.insert(nodes).values(nodeData)
  console.log('✅ Inserted 6 nodes')

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

  const eventValues = []
  for (let i = 0; i < 20; i++) {
    const kind = eventKinds[i % 2]
    const idx = i % 5
    const clusterId = i < 10 ? minikube.id : eks.id
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
  console.log('✅ Inserted 20 events')

  console.log('🎉 Seed complete!')
  process.exit(0)
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
