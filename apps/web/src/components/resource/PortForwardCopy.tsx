'use client'

import { Check, Copy } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface ContainerPort {
  name?: string
  containerPort: number
}

interface PortForwardCopyProps {
  podName: string
  namespace: string
  containerPorts: ContainerPort[]
  clusterContext: string
  children: React.ReactNode
}

export function PortForwardCopy({
  podName,
  namespace,
  containerPorts,
  clusterContext,
  children,
}: PortForwardCopyProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-[500px] bg-[var(--color-bg-card)] border-[var(--color-border)] p-3"
      >
        <h4 className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">
          Port Forward Command
        </h4>
        <div className="flex flex-col gap-2">
          {containerPorts.map((port) => (
            <PortCommand
              key={`${port.containerPort}-${port.name ?? ''}`}
              podName={podName}
              namespace={namespace}
              containerPort={port.containerPort}
              portName={port.name}
              clusterContext={clusterContext}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function PortCommand({
  podName,
  namespace,
  containerPort,
  portName,
  clusterContext,
}: {
  podName: string
  namespace: string
  containerPort: number
  portName?: string
  clusterContext: string
}) {
  const [copied, setCopied] = useState(false)

  const command = `kubectl port-forward pod/${podName} ${containerPort}:${containerPort} -n ${namespace} --context ${clusterContext}`

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      toast.success('Command copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy command')
    }
  }, [command])

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 font-mono text-[13px] text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] px-2 py-1 rounded border border-[var(--color-border)]/60 select-all">
        {command}
      </code>
      {portName && (
        <span className="text-[10px] text-[var(--color-text-muted)] whitespace-nowrap">
          {portName}
        </span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 p-1 rounded hover:bg-white/[0.06] transition-colors cursor-pointer"
        aria-label="Copy command"
      >
        {copied ? (
          <Check size={14} className="text-emerald-500" />
        ) : (
          <Copy size={14} className="text-[var(--color-text-muted)]" />
        )}
      </button>
    </div>
  )
}
