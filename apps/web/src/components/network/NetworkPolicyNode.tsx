'use client'

import type { NodeProps, Node } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'

export interface NetworkPolicyNodeData extends Record<string, unknown> {
  nodeType: 'pod' | 'namespace' | 'external'
  name: string
  namespace?: string
  selected?: boolean
}

type NetworkPolicyNodeType = Node<NetworkPolicyNodeData, 'netpolNode'>

export function NetworkPolicyNodeComponent({ data }: NodeProps<NetworkPolicyNodeType>) {
  const isNamespace = data.nodeType === 'namespace'
  const isExternal = data.nodeType === 'external'

  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-[var(--color-accent)] !w-2 !h-2 !border-0"
      />
      <div
        className={`
          flex items-center justify-center
          ${isNamespace ? 'px-4 py-2 min-w-[140px] rounded-lg border-2 border-dashed' : 'w-[48px] h-[48px] rounded-full border-2'}
          ${isExternal ? 'border-dashed' : ''}
          bg-[var(--color-bg-card)]
          transition-all duration-150
          ${data.selected ? 'border-[var(--color-accent)] shadow-[0_0_12px_rgba(124,140,248,0.3)]' : 'border-[var(--color-border)]'}
        `}
      >
        <div className={`flex flex-col items-center ${isNamespace ? 'gap-0.5' : ''}`}>
          {isNamespace && (
            <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
              NS
            </span>
          )}
          <span
            className={`font-semibold text-[var(--color-text-primary)] truncate ${
              isNamespace ? 'text-xs max-w-[120px]' : 'text-[10px] max-w-[40px]'
            }`}
            title={data.name}
          >
            {data.name}
          </span>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-[var(--color-accent)] !w-2 !h-2 !border-0"
      />
    </div>
  )
}
