'use client'

import { BaseEdge, getBezierPath, type EdgeProps, type Edge } from '@xyflow/react'

export interface NetworkPolicyEdgeData extends Record<string, unknown> {
  ruleType: 'allow' | 'deny'
  direction: 'ingress' | 'egress'
  ports?: string[]
  protocol?: string
}

type NetworkPolicyEdgeType = Edge<NetworkPolicyEdgeData, 'netpolEdge'>

export function NetworkPolicyEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<NetworkPolicyEdgeType>) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const isAllow = data?.ruleType === 'allow'
  const strokeColor = isAllow ? 'var(--color-status-active)' : 'var(--color-status-error)'

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: 1.5,
          strokeDasharray: isAllow ? '0' : '6 4',
        }}
        markerEnd={isAllow ? 'url(#netpol-arrow-allow)' : 'url(#netpol-arrow-deny)'}
      />
      {data?.ports && data.ports.length > 0 && (
        <text
          x={(sourceX + targetX) / 2}
          y={(sourceY + targetY) / 2 - 8}
          textAnchor="middle"
          className="text-[9px] fill-[var(--color-text-dim)]"
        >
          {data.ports.join(', ')}
        </text>
      )}
    </>
  )
}
