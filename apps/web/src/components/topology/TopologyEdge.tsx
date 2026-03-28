'use client'

import { BaseEdge, getBezierPath, type EdgeProps, type Edge } from '@xyflow/react'

export interface TopologyEdgeData extends Record<string, unknown> {
  label?: string
}

type TopologyEdgeType = Edge<TopologyEdgeData, 'topologyEdge'>

export function TopologyEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps<TopologyEdgeType>) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? 'var(--color-accent)' : 'var(--color-border-hover)',
          strokeWidth: 1.5,
          strokeDasharray: '0',
        }}
        markerEnd="url(#topology-arrow)"
      />
      {data?.label && (
        <text
          x={(sourceX + targetX) / 2}
          y={(sourceY + targetY) / 2 - 8}
          textAnchor="middle"
          className="text-[10px] fill-[var(--color-text-dim)]"
        >
          {data.label}
        </text>
      )}
    </>
  )
}
