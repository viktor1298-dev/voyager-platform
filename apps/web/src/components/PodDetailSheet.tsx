'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, Copy, Package } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Progress } from '@/components/ui/progress'
import { PodLogStream } from '@/components/PodLogStream'
import { timeAgo } from '@/lib/time-utils'

interface ContainerInfo {
  name: string
  image: string
  ready: boolean
  restartCount: number
  ports?: Array<{ containerPort: number; protocol?: string }>
  lastState?: string | null
}

interface PodInfo {
  name: string
  namespace: string
  status: string
  createdAt: string | null
  nodeName: string | null
  cpuMillis: number | null
  memoryMi: number | null
  cpuPercent: number | null
  memoryPercent: number | null
  labels?: Record<string, string>
  annotations?: Record<string, string>
  containers?: ContainerInfo[]
  restartCount?: number
}

type TabId = 'overview' | 'containers' | 'logs' | 'events' | 'yaml'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'containers', label: 'Containers' },
  { id: 'logs', label: 'Logs' },
  { id: 'events', label: 'Events' },
  { id: 'yaml', label: 'YAML' },
]

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--color-border)]/50 last:border-b-0">
      <span className="text-[11px] text-[var(--color-text-muted)] font-mono uppercase tracking-wider">{label}</span>
      <span className="text-[13px] text-[var(--color-text-primary)] font-medium">{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'Running'
      ? 'var(--color-status-active)'
      : status === 'Pending'
        ? 'var(--color-status-warning)'
        : 'var(--color-status-error)'
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span style={{ color }} className="text-[13px] font-semibold">
        {status}
      </span>
    </span>
  )
}

function OverviewTab({ pod }: { pod: PodInfo }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--color-border)] p-4 bg-[var(--surface,#14141f)]">
        <InfoRow label="Status" value={<StatusBadge status={pod.status} />} />
        <InfoRow label="Namespace" value={<span className="font-mono text-[12px]">{pod.namespace}</span>} />
        <InfoRow label="Node" value={<span className="font-mono text-[12px]">{pod.nodeName ?? '—'}</span>} />
        <InfoRow label="Age" value={pod.createdAt ? timeAgo(pod.createdAt) : '—'} />
        {pod.restartCount != null && (
          <InfoRow
            label="Restarts"
            value={
              <span className={pod.restartCount > 0 ? 'text-[var(--color-status-warning)] font-semibold' : ''}>
                {pod.restartCount}
              </span>
            }
          />
        )}
      </div>

      {(pod.cpuMillis != null || pod.memoryMi != null) && (
        <div className="rounded-xl border border-[var(--color-border)] p-4 bg-[var(--surface,#14141f)]">
          <h4 className="text-[11px] text-[var(--color-text-muted)] font-mono uppercase tracking-wider mb-3">
            Resource Usage
          </h4>
          {pod.cpuMillis != null && (
            <div className="mb-3">
              <div className="flex justify-between text-[12px] mb-1">
                <span className="text-[var(--color-text-muted)]">CPU</span>
                <span className="text-[var(--color-text-primary)] font-mono">
                  {pod.cpuMillis}m{pod.cpuPercent != null ? ` (${pod.cpuPercent.toFixed(0)}%)` : ''}
                </span>
              </div>
              {pod.cpuPercent != null && <Progress value={Math.min(pod.cpuPercent, 100)} className="h-1.5" />}
            </div>
          )}
          {pod.memoryMi != null && (
            <div>
              <div className="flex justify-between text-[12px] mb-1">
                <span className="text-[var(--color-text-muted)]">Memory</span>
                <span className="text-[var(--color-text-primary)] font-mono">
                  {pod.memoryMi}Mi{pod.memoryPercent != null ? ` (${pod.memoryPercent.toFixed(0)}%)` : ''}
                </span>
              </div>
              {pod.memoryPercent != null && <Progress value={Math.min(pod.memoryPercent, 100)} className="h-1.5" />}
            </div>
          )}
        </div>
      )}

      {pod.labels && Object.keys(pod.labels).length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] p-4 bg-[var(--surface,#14141f)]">
          <h4 className="text-[11px] text-[var(--color-text-muted)] font-mono uppercase tracking-wider mb-3">Labels</h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(pod.labels).map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-mono"
              >
                <span className="text-indigo-400">{k}</span>
                <span className="text-[var(--color-text-muted)]">=</span>
                <span className="text-[var(--color-text-secondary)]">{v}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {pod.annotations && Object.keys(pod.annotations).length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] p-4 bg-[var(--surface,#14141f)]">
          <h4 className="text-[11px] text-[var(--color-text-muted)] font-mono uppercase tracking-wider mb-3">
            Annotations
          </h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {Object.entries(pod.annotations)
              .slice(0, 10)
              .map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[11px] font-mono">
                  <span className="text-[var(--color-text-muted)] shrink-0 truncate max-w-[40%]">{k}</span>
                  <span className="text-[var(--color-text-secondary)] truncate">{v}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ContainersTab({ pod }: { pod: PodInfo }) {
  if (!pod.containers || pod.containers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package className="h-8 w-8 text-[var(--color-text-dim)] opacity-40 mb-3" />
        <p className="text-sm text-[var(--color-text-muted)]">Container details not available</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">
          Extended pod spec requires direct API access
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {pod.containers.map((c) => (
        <div
          key={c.name}
          className="rounded-xl border border-[var(--color-border)] p-4 bg-[var(--surface,#14141f)]"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-sm text-[var(--color-text-primary)] font-semibold">{c.name}</span>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${
                c.ready
                  ? 'text-[var(--color-status-active)] bg-[var(--color-status-active)]/10'
                  : 'text-[var(--color-status-error)] bg-[var(--color-status-error)]/10'
              }`}
            >
              {c.ready ? 'Ready' : 'Not Ready'}
            </span>
          </div>
          <div className="space-y-1.5 text-[12px]">
            <div className="flex gap-2">
              <span className="text-[var(--color-text-muted)] w-20 shrink-0">Image</span>
              <span className="font-mono text-[var(--color-text-secondary)] truncate">{c.image}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-[var(--color-text-muted)] w-20 shrink-0">Restarts</span>
              <span className={c.restartCount > 0 ? 'text-[var(--color-status-warning)] font-semibold' : 'text-[var(--color-text-secondary)]'}>
                {c.restartCount}
              </span>
            </div>
            {c.ports && c.ports.length > 0 && (
              <div className="flex gap-2">
                <span className="text-[var(--color-text-muted)] w-20 shrink-0">Ports</span>
                <div className="flex flex-wrap gap-1">
                  {c.ports.map((p) => (
                    <span
                      key={p.containerPort}
                      className="px-1.5 py-0.5 rounded-md bg-[var(--color-bg-secondary)] font-mono text-[11px]"
                    >
                      {p.containerPort}/{p.protocol ?? 'TCP'}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {c.lastState && (
              <div className="flex gap-2">
                <span className="text-[var(--color-text-muted)] w-20 shrink-0">Last State</span>
                <span className="text-[var(--color-text-secondary)]">{c.lastState}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function EventsTab({
  events,
}: {
  events: Array<{
    reason?: string | null
    message?: string | null
    timestamp?: string
    type?: string | null
  }>
}) {
  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">No events for this pod</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {events.map((evt, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--color-border)]/50 p-3 bg-[var(--surface,#14141f)] text-[12px]"
        >
          <div className="flex items-center justify-between mb-1">
            <span
              className={
                evt.type === 'Warning'
                  ? 'text-[var(--color-status-warning)] font-semibold'
                  : 'text-[var(--color-text-secondary)] font-semibold'
              }
            >
              {evt.reason ?? 'Event'}
            </span>
            {evt.timestamp && (
              <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                {timeAgo(evt.timestamp)}
              </span>
            )}
          </div>
          {evt.message && (
            <p className="text-[var(--color-text-muted)] line-clamp-3">{evt.message}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function YamlTab({ pod }: { pod: PodInfo }) {
  const [copied, setCopied] = useState(false)

  const yamlContent = [
    `apiVersion: v1`,
    `kind: Pod`,
    `metadata:`,
    `  name: ${pod.name}`,
    `  namespace: ${pod.namespace}`,
    pod.labels && Object.keys(pod.labels).length > 0
      ? `  labels:\n${Object.entries(pod.labels)
          .map(([k, v]) => `    ${k}: "${v}"`)
          .join('\n')}`
      : null,
    pod.annotations && Object.keys(pod.annotations).length > 0
      ? `  annotations:\n${Object.entries(pod.annotations)
          .slice(0, 10)
          .map(([k, v]) => `    ${k}: "${v}"`)
          .join('\n')}`
      : null,
    `  creationTimestamp: "${pod.createdAt ?? 'unknown'}"`,
    `spec:`,
    `  nodeName: ${pod.nodeName ?? 'unknown'}`,
    pod.containers && pod.containers.length > 0
      ? `  containers:\n${pod.containers
          .map(
            (c) =>
              `  - name: ${c.name}\n    image: ${c.image}${
                c.ports && c.ports.length > 0
                  ? `\n    ports:\n${c.ports.map((p) => `    - containerPort: ${p.containerPort}`).join('\n')}`
                  : ''
              }`,
          )
          .join('\n')}`
      : `  containers: []`,
    `status:`,
    `  phase: ${pod.status}`,
    pod.cpuMillis != null ? `  # CPU usage: ${pod.cpuMillis}m` : null,
    pod.memoryMi != null ? `  # Memory usage: ${pod.memoryMi}Mi` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const handleCopy = () => {
    navigator.clipboard.writeText(yamlContent).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        {copied ? (
          <Check className="h-3 w-3 text-[var(--color-status-active)]" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="font-mono text-xs text-[var(--color-text-secondary)] bg-[var(--surface,#14141f)] border border-[var(--color-border)] rounded-xl p-4 overflow-x-auto overflow-y-auto max-h-[50vh] leading-relaxed whitespace-pre-wrap break-all">
        {yamlContent}
      </pre>
    </div>
  )
}

export function PodDetailSheet({
  pod,
  open,
  onOpenChange,
  events,
}: {
  pod: PodInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  events?: Array<{
    reason?: string | null
    message?: string | null
    timestamp?: string
    type?: string | null
  }>
}) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  if (!pod) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-lg flex flex-col" onClose={() => onOpenChange(false)}>
        <SheetHeader>
          <SheetTitle className="font-mono text-base">{pod.name}</SheetTitle>
          <p className="text-sm text-[var(--color-text-muted)]">Pod details</p>
        </SheetHeader>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-[var(--color-border)] pb-0 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-[var(--color-text-primary)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {tab.label}
              {tab.id === 'events' && events && events.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-indigo-500/20 text-[10px] text-indigo-400">
                  {events.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-4">
          {activeTab === 'overview' && <OverviewTab pod={pod} />}
          {activeTab === 'containers' && <ContainersTab pod={pod} />}
          {activeTab === 'logs' && (
            <div className="space-y-3">
              <PodLogStream podName={pod.name} namespace={pod.namespace} />
              <Link
                href={`/logs?pod=${encodeURIComponent(pod.name)}&namespace=${encodeURIComponent(pod.namespace)}`}
                className="flex items-center justify-center w-full rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
              >
                Open Full Logs
              </Link>
            </div>
          )}
          {activeTab === 'events' && <EventsTab events={events ?? []} />}
          {activeTab === 'yaml' && <YamlTab pod={pod} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}
