'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { Search } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { NetworkPolicyNodeComponent, type NetworkPolicyNodeData } from './NetworkPolicyNode'
import { NetworkPolicyEdgeComponent, type NetworkPolicyEdgeData } from './NetworkPolicyEdge'

const nodeTypes = { netpolNode: NetworkPolicyNodeComponent }
const edgeTypes = { netpolEdge: NetworkPolicyEdgeComponent }

const NODE_WIDTH = 120
const NODE_HEIGHT = 56

interface NetworkPolicyGraphProps {
  clusterId: string
}

interface PolicyItem {
  name: string
  namespace: string
  podSelector: Record<string, string>
  policyTypes: string[]
  ingressRules: Array<{
    from: Array<{
      podSelector: Record<string, string> | null
      namespaceSelector: Record<string, string> | null
      ipBlock: { cidr: string; except: string[] } | null
    }>
    ports: Array<{ protocol: string; port: string | null }>
  }>
  egressRules: Array<{
    to: Array<{
      podSelector: Record<string, string> | null
      namespaceSelector: Record<string, string> | null
      ipBlock: { cidr: string; except: string[] } | null
    }>
    ports: Array<{ protocol: string; port: string | null }>
  }>
}

function selectorToId(selector: Record<string, string> | null, ns: string): string {
  if (!selector || Object.keys(selector).length === 0) return `ns:${ns}:all`
  const parts = Object.entries(selector)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',')
  return `pod:${ns}:${parts}`
}

function selectorToLabel(selector: Record<string, string> | null): string {
  if (!selector || Object.keys(selector).length === 0) return '*'
  return Object.entries(selector)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')
}

function getLayoutedElements(
  rawNodes: Node<NetworkPolicyNodeData>[],
  rawEdges: Edge<NetworkPolicyEdgeData>[],
): { nodes: Node<NetworkPolicyNodeData>[]; edges: Edge<NetworkPolicyEdgeData>[] } {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 120, nodesep: 50 })

  for (const node of rawNodes) {
    const w = node.data.nodeType === 'namespace' ? 160 : NODE_WIDTH
    g.setNode(node.id, { width: w, height: NODE_HEIGHT })
  }

  for (const edge of rawEdges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  const layoutedNodes = rawNodes.map((node) => {
    const pos = g.node(node.id)
    const w = node.data.nodeType === 'namespace' ? 160 : NODE_WIDTH
    return {
      ...node,
      position: { x: pos.x - w / 2, y: pos.y - NODE_HEIGHT / 2 },
    }
  })

  return { nodes: layoutedNodes, edges: rawEdges }
}

export function NetworkPolicyGraph({ clusterId }: NetworkPolicyGraphProps) {
  const [namespace, setNamespace] = useState<string>('')
  const [search, setSearch] = useState('')
  const [selectedPod, setSelectedPod] = useState<string | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NetworkPolicyNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<NetworkPolicyEdgeData>>([])

  const policiesQuery = trpc.networkPolicies.list.useQuery(
    { clusterId },
    { staleTime: 15000, refetchInterval: 30000 },
  )

  const policies = (policiesQuery.data ?? []) as PolicyItem[]

  // Extract unique namespaces
  const namespaces = useMemo(() => {
    const nsSet = new Set<string>()
    for (const p of policies) {
      if (p.namespace) nsSet.add(p.namespace)
    }
    return Array.from(nsSet).sort()
  }, [policies])

  const transformData = useCallback(() => {
    if (!policies.length) return

    let filtered = policies
    if (namespace) {
      filtered = filtered.filter((p) => p.namespace === namespace)
    }
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(q))
    }

    const nodeMap = new Map<string, Node<NetworkPolicyNodeData>>()
    const edgeList: Edge<NetworkPolicyEdgeData>[] = []

    for (const policy of filtered) {
      // Target pod (selected by the policy)
      const targetId = selectorToId(policy.podSelector, policy.namespace)
      if (!nodeMap.has(targetId)) {
        const isAllPods = !policy.podSelector || Object.keys(policy.podSelector).length === 0
        nodeMap.set(targetId, {
          id: targetId,
          type: 'netpolNode',
          position: { x: 0, y: 0 },
          data: {
            nodeType: isAllPods ? 'namespace' : 'pod',
            name: isAllPods ? policy.namespace : selectorToLabel(policy.podSelector),
            namespace: policy.namespace,
            selected: selectedPod === targetId,
          },
        })
      }

      // Ingress rules
      for (const rule of policy.ingressRules) {
        const ports = rule.ports.filter((p) => p.port).map((p) => `${p.port}/${p.protocol}`)

        for (const from of rule.from) {
          let sourceId: string
          let sourceNode: Node<NetworkPolicyNodeData>

          if (from.ipBlock) {
            sourceId = `ext:${from.ipBlock.cidr}`
            sourceNode = {
              id: sourceId,
              type: 'netpolNode',
              position: { x: 0, y: 0 },
              data: {
                nodeType: 'external',
                name: from.ipBlock.cidr,
                selected: selectedPod === sourceId,
              },
            }
          } else if (from.namespaceSelector && !from.podSelector) {
            const nsLabel = selectorToLabel(from.namespaceSelector)
            sourceId = `ns-sel:${nsLabel}`
            sourceNode = {
              id: sourceId,
              type: 'netpolNode',
              position: { x: 0, y: 0 },
              data: {
                nodeType: 'namespace',
                name: nsLabel,
                selected: selectedPod === sourceId,
              },
            }
          } else {
            sourceId = selectorToId(from.podSelector, policy.namespace)
            sourceNode = {
              id: sourceId,
              type: 'netpolNode',
              position: { x: 0, y: 0 },
              data: {
                nodeType: 'pod',
                name: selectorToLabel(from.podSelector),
                namespace: policy.namespace,
                selected: selectedPod === sourceId,
              },
            }
          }

          if (!nodeMap.has(sourceId)) {
            nodeMap.set(sourceId, sourceNode)
          }

          edgeList.push({
            id: `edge:${sourceId}->${targetId}:${policy.name}`,
            source: sourceId,
            target: targetId,
            type: 'netpolEdge',
            data: {
              ruleType: 'allow',
              direction: 'ingress',
              ports: ports.length > 0 ? ports : undefined,
            },
          })
        }
      }

      // Egress rules
      for (const rule of policy.egressRules) {
        const ports = rule.ports.filter((p) => p.port).map((p) => `${p.port}/${p.protocol}`)

        for (const to of rule.to) {
          let destId: string
          let destNode: Node<NetworkPolicyNodeData>

          if (to.ipBlock) {
            destId = `ext:${to.ipBlock.cidr}`
            destNode = {
              id: destId,
              type: 'netpolNode',
              position: { x: 0, y: 0 },
              data: {
                nodeType: 'external',
                name: to.ipBlock.cidr,
                selected: selectedPod === destId,
              },
            }
          } else if (to.namespaceSelector && !to.podSelector) {
            const nsLabel = selectorToLabel(to.namespaceSelector)
            destId = `ns-sel:${nsLabel}`
            destNode = {
              id: destId,
              type: 'netpolNode',
              position: { x: 0, y: 0 },
              data: {
                nodeType: 'namespace',
                name: nsLabel,
                selected: selectedPod === destId,
              },
            }
          } else {
            destId = selectorToId(to.podSelector, policy.namespace)
            destNode = {
              id: destId,
              type: 'netpolNode',
              position: { x: 0, y: 0 },
              data: {
                nodeType: 'pod',
                name: selectorToLabel(to.podSelector),
                namespace: policy.namespace,
                selected: selectedPod === destId,
              },
            }
          }

          if (!nodeMap.has(destId)) {
            nodeMap.set(destId, destNode)
          }

          edgeList.push({
            id: `edge:${targetId}->${destId}:${policy.name}`,
            source: targetId,
            target: destId,
            type: 'netpolEdge',
            data: {
              ruleType: 'allow',
              direction: 'egress',
              ports: ports.length > 0 ? ports : undefined,
            },
          })
        }
      }

      // Deny-all: if policyTypes includes Ingress/Egress but no rules, show deny indicator
      if (policy.policyTypes.includes('Ingress') && policy.ingressRules.length === 0) {
        const denySourceId = `deny:ingress:${policy.name}`
        nodeMap.set(denySourceId, {
          id: denySourceId,
          type: 'netpolNode',
          position: { x: 0, y: 0 },
          data: {
            nodeType: 'external',
            name: 'ALL',
            selected: false,
          },
        })
        edgeList.push({
          id: `edge:${denySourceId}->${targetId}:deny`,
          source: denySourceId,
          target: targetId,
          type: 'netpolEdge',
          data: { ruleType: 'deny', direction: 'ingress' },
        })
      }

      if (policy.policyTypes.includes('Egress') && policy.egressRules.length === 0) {
        const denyDestId = `deny:egress:${policy.name}`
        nodeMap.set(denyDestId, {
          id: denyDestId,
          type: 'netpolNode',
          position: { x: 0, y: 0 },
          data: {
            nodeType: 'external',
            name: 'ALL',
            selected: false,
          },
        })
        edgeList.push({
          id: `edge:${targetId}->${denyDestId}:deny`,
          source: targetId,
          target: denyDestId,
          type: 'netpolEdge',
          data: { ruleType: 'deny', direction: 'egress' },
        })
      }
    }

    // Filter edges if a pod is selected
    let filteredEdges = edgeList
    if (selectedPod) {
      filteredEdges = edgeList.filter((e) => e.source === selectedPod || e.target === selectedPod)
    }

    const allNodes = Array.from(nodeMap.values())
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      allNodes,
      filteredEdges,
    )
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
  }, [policies, namespace, search, selectedPod, setNodes, setEdges])

  useEffect(() => {
    transformData()
  }, [transformData])

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node<NetworkPolicyNodeData>) => {
    setSelectedPod((prev) => (prev === node.id ? null : node.id))
  }, [])

  if (policiesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`skel-${i}`}
              className="w-[48px] h-[48px] rounded-full bg-[var(--color-bg-card-hover)] animate-pulse"
            />
          ))}
        </div>
      </div>
    )
  }

  if (policiesQuery.isError) {
    return (
      <div className="flex items-center justify-center h-[500px] text-sm text-[var(--color-text-muted)]">
        Failed to load network policy data.
      </div>
    )
  }

  if (!policies.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] text-sm text-[var(--color-text-muted)] gap-2">
        <p>No network policies found.</p>
        <p className="text-xs text-[var(--color-text-dim)]">All traffic is allowed by default.</p>
      </div>
    )
  }

  return (
    <div className="h-[500px] w-full">
      {/* Filters */}
      <div className="flex items-center gap-2 mb-2">
        <select
          value={namespace}
          onChange={(e) => setNamespace(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] outline-none"
        >
          <option value="">All Namespaces</option>
          {namespaces.map((ns) => (
            <option key={ns} value={ns}>
              {ns}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--color-text-dim)]" />
          <input
            type="text"
            placeholder="Search policies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs pl-7 pr-2 py-1.5 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] outline-none w-[200px]"
          />
        </div>
        {/* Legend */}
        <div className="ml-auto flex items-center gap-3 text-[10px] text-[var(--color-text-dim)]">
          <span className="flex items-center gap-1">
            <span className="w-4 h-0 border-t-2 border-[var(--color-status-active)]" />
            Allow
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-0 border-t-2 border-dashed border-[var(--color-status-error)]" />
            Deny
          </span>
        </div>
      </div>

      {/* Graph */}
      <div className="h-[460px] rounded-lg border border-[var(--color-border)] overflow-hidden bg-[var(--color-bg-card)]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <svg>
            <defs>
              <marker
                id="netpol-arrow-allow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-status-active)" />
              </marker>
              <marker
                id="netpol-arrow-deny"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-status-error)" />
              </marker>
            </defs>
          </svg>
          <Controls className="!bg-[var(--color-bg-card)] !border-[var(--color-border)] !shadow-lg [&_button]:!bg-[var(--color-bg-card)] [&_button]:!border-[var(--color-border)] [&_button]:!text-[var(--color-text-primary)] [&_button:hover]:!bg-[var(--color-bg-card-hover)]" />
          <MiniMap
            style={{
              width: 150,
              height: 100,
              backgroundColor: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
            }}
            maskColor="rgba(0,0,0,0.3)"
            nodeColor="var(--color-accent)"
          />
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color="var(--color-border)"
          />
        </ReactFlow>
      </div>
    </div>
  )
}
