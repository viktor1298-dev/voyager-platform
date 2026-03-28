'use client'

import type { NodeProps, Node } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { useResourceNavigation } from '../resource/CrossResourceNav'

export interface TopologyNodeData extends Record<string, unknown> {
  resourceType: 'ingress' | 'service' | 'deployment' | 'statefulset' | 'daemonset' | 'pod' | 'node'
  name: string
  namespace: string
  status: string
  resourceCount?: number
  clusterId: string
}

type TopologyNodeType = Node<TopologyNodeData, 'topology'>

const typeToTab: Record<string, string> = {
  ingress: 'ingresses',
  service: 'services',
  deployment: 'deployments',
  statefulset: 'statefulsets',
  daemonset: 'daemonsets',
  pod: 'pods',
  node: 'nodes',
}

const typeLabel: Record<string, string> = {
  ingress: 'ING',
  service: 'SVC',
  deployment: 'DEPLOY',
  statefulset: 'STS',
  daemonset: 'DS',
  pod: 'POD',
  node: 'NODE',
}

function statusBorderColor(status: string): string {
  if (status === 'healthy') return 'var(--color-status-active)'
  if (status === 'warning') return 'var(--color-status-warning)'
  if (status === 'error') return 'var(--color-status-error)'
  return 'var(--color-border)'
}

function statusDotColor(status: string): string {
  if (status === 'healthy') return 'bg-[var(--color-status-active)]'
  if (status === 'warning') return 'bg-[var(--color-status-warning)]'
  if (status === 'error') return 'bg-[var(--color-status-error)]'
  return 'bg-[var(--color-text-dim)]'
}

function nodeShape(type: string): string {
  if (type === 'pod') return 'rounded-full'
  if (type === 'ingress')
    return 'rounded-lg [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]'
  if (type === 'service')
    return 'rounded-lg rotate-0 [clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]'
  if (type === 'node') return 'rounded-xl'
  return 'rounded-lg'
}

export function TopologyNodeComponent({ data }: NodeProps<TopologyNodeType>) {
  const { navigateToResource } = useResourceNavigation()
  const isShapeNode = data.resourceType === 'ingress' || data.resourceType === 'service'

  const handleClick = () => {
    const tab = typeToTab[data.resourceType]
    if (tab) {
      const key = data.namespace ? `${data.namespace}/${data.name}` : data.name
      navigateToResource(tab, key)
    }
  }

  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-[var(--color-accent)] !w-2 !h-2 !border-0"
      />
      <button
        type="button"
        onClick={handleClick}
        className={`
          flex items-center gap-2 px-3 py-2 min-w-[160px] min-h-[48px]
          bg-[var(--color-bg-card)] border-2 cursor-pointer
          hover:border-[3px] hover:shadow-[0_0_12px_rgba(124,140,248,0.3)]
          transition-all duration-150
          ${isShapeNode ? '' : nodeShape(data.resourceType)}
        `}
        style={{
          borderColor: statusBorderColor(data.status),
          ...(isShapeNode
            ? {
                clipPath:
                  data.resourceType === 'ingress'
                    ? 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'
                    : 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
              }
            : {}),
          ...(isShapeNode
            ? {
                borderRadius: '8px',
                minWidth: '180px',
                minHeight: '60px',
                justifyContent: 'center',
              }
            : {}),
        }}
      >
        <span className={`h-2 w-2 rounded-full shrink-0 ${statusDotColor(data.status)}`} />
        <div className="flex flex-col items-start min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
            {typeLabel[data.resourceType] ?? data.resourceType.toUpperCase()}
          </span>
          <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate max-w-[120px]">
            {data.name}
          </span>
        </div>
        {data.resourceCount != null && data.resourceCount > 0 && (
          <span className="ml-auto text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
            {data.resourceCount}
          </span>
        )}
      </button>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-[var(--color-accent)] !w-2 !h-2 !border-0"
      />
    </div>
  )
}
