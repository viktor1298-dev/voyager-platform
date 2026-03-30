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
import { TopologyNodeComponent, type TopologyNodeData } from './TopologyNode'
import { TopologyEdgeComponent, type TopologyEdgeData } from './TopologyEdge'

const nodeTypes = { topology: TopologyNodeComponent }
const edgeTypes = { topologyEdge: TopologyEdgeComponent }

const NODE_WIDTH = 180
const NODE_HEIGHT = 56

interface TopologyMapProps {
  clusterId: string
}

function getLayoutedElements(
  rawNodes: Node<TopologyNodeData>[],
  rawEdges: Edge<TopologyEdgeData>[],
): { nodes: Node<TopologyNodeData>[]; edges: Edge<TopologyEdgeData>[] } {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 60 })

  for (const node of rawNodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  for (const edge of rawEdges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  const layoutedNodes = rawNodes.map((node) => {
    const pos = g.node(node.id)
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    }
  })

  return { nodes: layoutedNodes, edges: rawEdges }
}

export function TopologyMap({ clusterId }: TopologyMapProps) {
  const [namespace, setNamespace] = useState<string>('')
  const [search, setSearch] = useState('')
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TopologyNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<TopologyEdgeData>>([])

  const graphQuery = trpc.topology.graph.useQuery(
    { clusterId, namespace: namespace || undefined },
    { staleTime: 5000, refetchInterval: 5000 },
  )

  const graphData = graphQuery.data as
    | {
        nodes: {
          id: string
          type: string
          name: string
          namespace: string
          status: string
          resourceCount?: number
        }[]
        edges: { id: string; source: string; target: string; label?: string }[]
      }
    | undefined

  // Extract unique namespaces for filter
  const namespaces = useMemo(() => {
    if (!graphData?.nodes) return []
    const nsSet = new Set<string>()
    for (const n of graphData.nodes) {
      if (n.namespace) nsSet.add(n.namespace)
    }
    return Array.from(nsSet).sort()
  }, [graphData])

  // Transform API data to React Flow format
  const transformData = useCallback(() => {
    if (!graphData?.nodes) return

    let filteredNodes = graphData.nodes
    if (search) {
      const q = search.toLowerCase()
      filteredNodes = filteredNodes.filter((n) => n.name.toLowerCase().includes(q))
    }

    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id))

    const rfNodes: Node<TopologyNodeData>[] = filteredNodes.map((n) => ({
      id: n.id,
      type: 'topology',
      position: { x: 0, y: 0 },
      data: {
        resourceType: n.type as TopologyNodeData['resourceType'],
        name: n.name,
        namespace: n.namespace,
        status: n.status,
        resourceCount: n.resourceCount,
        clusterId,
      },
    }))

    const rfEdges: Edge<TopologyEdgeData>[] = graphData.edges
      .filter((e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'topologyEdge',
        data: { label: e.label },
      }))

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rfNodes, rfEdges)
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
  }, [graphData, search, clusterId, setNodes, setEdges])

  useEffect(() => {
    transformData()
  }, [transformData])

  if (graphQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={`skel-${i}`}
              className="w-[160px] h-[48px] rounded-lg bg-[var(--color-bg-card-hover)] animate-pulse"
            />
          ))}
        </div>
      </div>
    )
  }

  if (graphQuery.isError) {
    return (
      <div className="flex items-center justify-center h-[500px] text-sm text-[var(--color-text-muted)]">
        Failed to load topology data.
      </div>
    )
  }

  if (!graphData?.nodes?.length) {
    return (
      <div className="flex items-center justify-center h-[500px] text-sm text-[var(--color-text-muted)]">
        No resources found in this cluster.
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
            placeholder="Search resources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs pl-7 pr-2 py-1.5 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] outline-none w-[200px]"
          />
        </div>
      </div>

      {/* Graph */}
      <div className="h-[460px] rounded-lg border border-[var(--color-border)] overflow-hidden bg-[var(--color-bg-card)]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
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
                id="topology-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-border-hover)" />
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
