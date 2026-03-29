import * as k8s from '@kubernetes/client-node'
import { z } from 'zod'
import { cached } from '../lib/cache.js'
import { CACHE_KEYS } from '../lib/cache-keys.js'
import { clusterClientPool } from '../lib/cluster-client-pool.js'
import { handleK8sError } from '../lib/error-handler.js'
import { protectedProcedure, router } from '../trpc.js'

const MAX_NODES = 200

interface TopologyNode {
  id: string
  type: 'ingress' | 'service' | 'deployment' | 'statefulset' | 'daemonset' | 'pod' | 'node'
  name: string
  namespace: string
  status: string
  resourceCount?: number
}

interface TopologyEdge {
  id: string
  source: string
  target: string
  label?: string
}

function matchLabels(
  selector: Record<string, string> | undefined,
  labels: Record<string, string> | undefined,
): boolean {
  if (!selector || !labels) return false
  return Object.entries(selector).every(([k, v]) => labels[k] === v)
}

function podStatus(phase: string | undefined): string {
  if (!phase) return 'Unknown'
  if (phase === 'Running') return 'healthy'
  if (phase === 'Succeeded') return 'healthy'
  if (phase === 'Pending') return 'warning'
  return 'error'
}

function nodeStatus(conditions: k8s.V1NodeCondition[] | undefined): string {
  if (!conditions) return 'Unknown'
  const ready = conditions.find((c) => c.type === 'Ready')
  return ready?.status === 'True' ? 'healthy' : 'error'
}

export const topologyRouter = router({
  graph: protectedProcedure
    .input(
      z.object({
        clusterId: z.string().uuid(),
        namespace: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        const kc = await clusterClientPool.getClient(input.clusterId)
        const coreV1 = kc.makeApiClient(k8s.CoreV1Api)
        const appsV1 = kc.makeApiClient(k8s.AppsV1Api)
        const networkingV1 = kc.makeApiClient(k8s.NetworkingV1Api)

        const [ingressRes, serviceRes, deployRes, stsRes, dsRes, podRes, nodeRes] = await cached(
          CACHE_KEYS.k8sTopology(input.clusterId),
          15_000,
          () =>
            Promise.all([
              networkingV1.listIngressForAllNamespaces(),
              coreV1.listServiceForAllNamespaces(),
              appsV1.listDeploymentForAllNamespaces(),
              appsV1.listStatefulSetForAllNamespaces(),
              appsV1.listDaemonSetForAllNamespaces(),
              coreV1.listPodForAllNamespaces(),
              coreV1.listNode(),
            ]),
        )

        const ns = input.namespace

        const ingresses = (ingressRes.items ?? []).filter(
          (r) => !ns || r.metadata?.namespace === ns,
        )
        const services = (serviceRes.items ?? []).filter((r) => !ns || r.metadata?.namespace === ns)
        const deployments = (deployRes.items ?? []).filter(
          (r) => !ns || r.metadata?.namespace === ns,
        )
        const statefulSets = (stsRes.items ?? []).filter((r) => !ns || r.metadata?.namespace === ns)
        const daemonSets = (dsRes.items ?? []).filter((r) => !ns || r.metadata?.namespace === ns)
        const pods = (podRes.items ?? []).filter((r) => !ns || r.metadata?.namespace === ns)
        const nodes = nodeRes.items ?? []

        const graphNodes: TopologyNode[] = []
        const graphEdges: TopologyEdge[] = []

        // Track pod-to-owner for grouping
        const podOwnerMap = new Map<string, string>() // podId -> ownerId

        // Add nodes (cluster-level)
        for (const n of nodes) {
          graphNodes.push({
            id: `node:${n.metadata?.name}`,
            type: 'node',
            name: n.metadata?.name ?? '',
            namespace: '',
            status: nodeStatus(n.status?.conditions),
          })
        }

        // Add deployments
        for (const d of deployments) {
          const id = `deployment:${d.metadata?.namespace}/${d.metadata?.name}`
          const ready = d.status?.readyReplicas ?? 0
          const desired = d.spec?.replicas ?? 0
          graphNodes.push({
            id,
            type: 'deployment',
            name: d.metadata?.name ?? '',
            namespace: d.metadata?.namespace ?? '',
            status: ready >= desired ? 'healthy' : ready > 0 ? 'warning' : 'error',
            resourceCount: d.status?.replicas ?? 0,
          })
        }

        // Add statefulsets
        for (const s of statefulSets) {
          const id = `statefulset:${s.metadata?.namespace}/${s.metadata?.name}`
          const ready = s.status?.readyReplicas ?? 0
          const desired = s.spec?.replicas ?? 0
          graphNodes.push({
            id,
            type: 'statefulset',
            name: s.metadata?.name ?? '',
            namespace: s.metadata?.namespace ?? '',
            status: ready >= desired ? 'healthy' : ready > 0 ? 'warning' : 'error',
            resourceCount: s.status?.replicas ?? 0,
          })
        }

        // Add daemonsets
        for (const d of daemonSets) {
          const id = `daemonset:${d.metadata?.namespace}/${d.metadata?.name}`
          const ready = d.status?.numberReady ?? 0
          const desired = d.status?.desiredNumberScheduled ?? 0
          graphNodes.push({
            id,
            type: 'daemonset',
            name: d.metadata?.name ?? '',
            namespace: d.metadata?.namespace ?? '',
            status: ready >= desired ? 'healthy' : ready > 0 ? 'warning' : 'error',
            resourceCount: desired,
          })
        }

        // Build owner references for pods
        const ownerToId = new Map<string, string>()
        for (const d of deployments) {
          // Deployments own ReplicaSets, which own Pods. Match via selector.
          const sel = d.spec?.selector?.matchLabels as Record<string, string> | undefined
          if (sel) {
            ownerToId.set(
              `deploy:${d.metadata?.namespace}/${d.metadata?.name}`,
              `deployment:${d.metadata?.namespace}/${d.metadata?.name}`,
            )
          }
        }

        // Determine if we need to group pods (over limit)
        const totalPotentialNodes =
          ingresses.length +
          services.length +
          deployments.length +
          statefulSets.length +
          daemonSets.length +
          pods.length +
          nodes.length

        const shouldGroupPods = totalPotentialNodes > MAX_NODES

        if (!shouldGroupPods) {
          // Add individual pods
          for (const p of pods) {
            const podId = `pod:${p.metadata?.namespace}/${p.metadata?.name}`
            graphNodes.push({
              id: podId,
              type: 'pod',
              name: p.metadata?.name ?? '',
              namespace: p.metadata?.namespace ?? '',
              status: podStatus(p.status?.phase),
            })

            // Pod -> Node edge
            if (p.spec?.nodeName) {
              graphEdges.push({
                id: `edge:${podId}->node:${p.spec.nodeName}`,
                source: podId,
                target: `node:${p.spec.nodeName}`,
              })
            }

            // Track owner
            const owners = p.metadata?.ownerReferences ?? []
            for (const owner of owners) {
              if (owner.kind === 'ReplicaSet') {
                // ReplicaSet is owned by Deployment - match by pod labels
                const podLabels = (p.metadata?.labels ?? {}) as Record<string, string>
                for (const d of deployments) {
                  const sel = d.spec?.selector?.matchLabels as Record<string, string> | undefined
                  if (
                    d.metadata?.namespace === p.metadata?.namespace &&
                    matchLabels(sel, podLabels)
                  ) {
                    const deployId = `deployment:${d.metadata?.namespace}/${d.metadata?.name}`
                    podOwnerMap.set(podId, deployId)
                    graphEdges.push({
                      id: `edge:${deployId}->${podId}`,
                      source: deployId,
                      target: podId,
                    })
                    break
                  }
                }
              } else if (owner.kind === 'StatefulSet') {
                const stsId = `statefulset:${p.metadata?.namespace}/${owner.name}`
                podOwnerMap.set(podId, stsId)
                graphEdges.push({
                  id: `edge:${stsId}->${podId}`,
                  source: stsId,
                  target: podId,
                })
              } else if (owner.kind === 'DaemonSet') {
                const dsId = `daemonset:${p.metadata?.namespace}/${owner.name}`
                podOwnerMap.set(podId, dsId)
                graphEdges.push({
                  id: `edge:${dsId}->${podId}`,
                  source: dsId,
                  target: podId,
                })
              }
            }
          }
        } else {
          // Grouped mode: Deployment/STS/DS nodes already have resourceCount (pod count)
          // Just add edges from workloads to nodes (representative)
          for (const p of pods) {
            const nodeName = p.spec?.nodeName
            if (!nodeName) continue
            const owners = p.metadata?.ownerReferences ?? []
            for (const owner of owners) {
              let ownerId: string | undefined
              if (owner.kind === 'ReplicaSet') {
                const podLabels = (p.metadata?.labels ?? {}) as Record<string, string>
                for (const d of deployments) {
                  const sel = d.spec?.selector?.matchLabels as Record<string, string> | undefined
                  if (
                    d.metadata?.namespace === p.metadata?.namespace &&
                    matchLabels(sel, podLabels)
                  ) {
                    ownerId = `deployment:${d.metadata?.namespace}/${d.metadata?.name}`
                    break
                  }
                }
              } else if (owner.kind === 'StatefulSet') {
                ownerId = `statefulset:${p.metadata?.namespace}/${owner.name}`
              } else if (owner.kind === 'DaemonSet') {
                ownerId = `daemonset:${p.metadata?.namespace}/${owner.name}`
              }
              if (ownerId) {
                const edgeId = `edge:${ownerId}->node:${nodeName}`
                if (!graphEdges.some((e) => e.id === edgeId)) {
                  graphEdges.push({ id: edgeId, source: ownerId, target: `node:${nodeName}` })
                }
              }
            }
          }
        }

        // Add services
        for (const svc of services) {
          const svcId = `service:${svc.metadata?.namespace}/${svc.metadata?.name}`
          graphNodes.push({
            id: svcId,
            type: 'service',
            name: svc.metadata?.name ?? '',
            namespace: svc.metadata?.namespace ?? '',
            status: 'healthy',
          })

          // Service -> workloads/pods via selector
          const sel = svc.spec?.selector as Record<string, string> | undefined
          if (sel) {
            if (shouldGroupPods) {
              // Link to deployments/sts/ds that match
              for (const d of deployments) {
                const dSel = d.spec?.selector?.matchLabels as Record<string, string> | undefined
                if (d.metadata?.namespace === svc.metadata?.namespace && dSel) {
                  if (Object.entries(sel).some(([k, v]) => dSel[k] === v)) {
                    graphEdges.push({
                      id: `edge:${svcId}->deployment:${d.metadata?.namespace}/${d.metadata?.name}`,
                      source: svcId,
                      target: `deployment:${d.metadata?.namespace}/${d.metadata?.name}`,
                    })
                  }
                }
              }
              for (const s of statefulSets) {
                const sSel = s.spec?.selector?.matchLabels as Record<string, string> | undefined
                if (s.metadata?.namespace === svc.metadata?.namespace && sSel) {
                  if (Object.entries(sel).some(([k, v]) => sSel[k] === v)) {
                    graphEdges.push({
                      id: `edge:${svcId}->statefulset:${s.metadata?.namespace}/${s.metadata?.name}`,
                      source: svcId,
                      target: `statefulset:${s.metadata?.namespace}/${s.metadata?.name}`,
                    })
                  }
                }
              }
            } else {
              // Link to matching pods
              for (const p of pods) {
                const podLabels = (p.metadata?.labels ?? {}) as Record<string, string>
                if (
                  p.metadata?.namespace === svc.metadata?.namespace &&
                  matchLabels(sel, podLabels)
                ) {
                  const podId = `pod:${p.metadata?.namespace}/${p.metadata?.name}`
                  graphEdges.push({
                    id: `edge:${svcId}->${podId}`,
                    source: svcId,
                    target: podId,
                  })
                }
              }
            }
          }
        }

        // Add ingresses
        for (const ing of ingresses) {
          const ingId = `ingress:${ing.metadata?.namespace}/${ing.metadata?.name}`
          graphNodes.push({
            id: ingId,
            type: 'ingress',
            name: ing.metadata?.name ?? '',
            namespace: ing.metadata?.namespace ?? '',
            status: 'healthy',
          })

          // Ingress -> Service edges from rules
          for (const rule of ing.spec?.rules ?? []) {
            for (const path of rule.http?.paths ?? []) {
              const svcName = path.backend?.service?.name
              if (svcName) {
                const svcId = `service:${ing.metadata?.namespace}/${svcName}`
                graphEdges.push({
                  id: `edge:${ingId}->${svcId}`,
                  source: ingId,
                  target: svcId,
                  label: path.path ?? '/',
                })
              }
            }
          }

          // Also check defaultBackend
          const defaultSvc = ing.spec?.defaultBackend?.service?.name
          if (defaultSvc) {
            const svcId = `service:${ing.metadata?.namespace}/${defaultSvc}`
            graphEdges.push({
              id: `edge:${ingId}->${svcId}:default`,
              source: ingId,
              target: svcId,
              label: 'default',
            })
          }
        }

        // Filter edges to only reference existing nodes and deduplicate by id
        const nodeIds = new Set(graphNodes.map((n) => n.id))
        const seenEdgeIds = new Set<string>()
        const validEdges: TopologyEdge[] = []
        for (const e of graphEdges) {
          if (nodeIds.has(e.source) && nodeIds.has(e.target) && !seenEdgeIds.has(e.id)) {
            seenEdgeIds.add(e.id)
            validEdges.push(e)
          }
        }

        return { nodes: graphNodes, edges: validEdges }
      } catch (err) {
        handleK8sError(err, 'get topology graph')
      }
    }),
})
