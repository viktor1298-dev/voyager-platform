'use client'

import {
  ChevronDown,
  Clock,
  Copy,
  FileText,
  GitBranch,
  GitCompare,
  Info,
  Package,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { stringify } from 'yaml'
import { DetailGrid, DetailTabs, ExpandableCard } from '@/components/expandable'
import { RelatedResourceLink } from '@/components/resource'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'
import { AnimatePresence, motion } from 'motion/react'
import { expandVariants, chevronVariants, DURATION, EASING } from '@/lib/animation-constants'
import { HelmRevisionDiff, type RevisionData } from './HelmRevisionDiff'

interface HelmReleaseDetailProps {
  clusterId: string
  releaseName: string
  namespace: string
}

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'deployed':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    case 'failed':
      return 'bg-red-500/15 text-red-400 border-red-500/30'
    case 'pending-install':
    case 'pending-upgrade':
    case 'pending-rollback':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    case 'superseded':
      return 'bg-[var(--color-text-dim)]/15 text-[var(--color-text-muted)] border-[var(--color-border)]'
    case 'uninstalled':
      return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
    default:
      return 'bg-[var(--color-text-dim)]/15 text-[var(--color-text-muted)] border-[var(--color-border)]'
  }
}

// ---------------------------------------------------------------------------
// Values JSON viewer
// ---------------------------------------------------------------------------

function ValuesViewer({ values }: { values: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false)
  const formatted = useMemo(() => stringify(values, { indent: 2, lineWidth: 120 }), [values])
  const isEmpty = Object.keys(values).length === 0

  const handleCopy = () => {
    navigator.clipboard.writeText(formatted).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (isEmpty) {
    return (
      <p className="text-[11px] text-[var(--color-text-muted)] italic">
        No custom values configured — using chart defaults.
      </p>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono bg-white/[0.06] hover:bg-white/[0.10] text-[var(--color-text-muted)] transition-colors"
      >
        <Copy className="h-3 w-3" />
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="text-[11px] font-mono text-[var(--color-text-secondary)] bg-black/20 rounded-lg p-4 overflow-auto max-h-[400px] leading-relaxed">
        {formatted}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Manifest resource parser
// ---------------------------------------------------------------------------

interface ManifestResource {
  kind: string
  name: string
  namespace?: string
}

function parseManifestResources(manifest: string): ManifestResource[] {
  if (!manifest) return []
  const resources: ManifestResource[] = []

  // Split by YAML document separator
  const docs = manifest.split(/^---$/m)
  for (const doc of docs) {
    const trimmed = doc.trim()
    if (!trimmed) continue

    // Simple regex extraction for kind, name, namespace
    const kindMatch = trimmed.match(/^kind:\s*(.+)$/m)
    const nameMatch = trimmed.match(/^\s+name:\s*(.+)$/m)
    const nsMatch = trimmed.match(/^\s+namespace:\s*(.+)$/m)

    if (kindMatch && nameMatch) {
      resources.push({
        kind: kindMatch[1].trim(),
        name: nameMatch[1].trim().replace(/^["']|["']$/g, ''),
        namespace: nsMatch?.[1]?.trim().replace(/^["']|["']$/g, ''),
      })
    }
  }

  return resources
}

function kindToTab(kind: string): string | null {
  const mapping: Record<string, string> = {
    Deployment: 'deployments',
    Service: 'services',
    ConfigMap: 'configmaps',
    Secret: 'secrets',
    Ingress: 'ingresses',
    StatefulSet: 'statefulsets',
    DaemonSet: 'daemonsets',
    Job: 'jobs',
    CronJob: 'cronjobs',
    HorizontalPodAutoscaler: 'hpa',
    PersistentVolumeClaim: 'pvcs',
    Pod: 'pods',
    Namespace: 'namespaces',
  }
  return mapping[kind] ?? null
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HelmReleaseDetail({ clusterId, releaseName, namespace }: HelmReleaseDetailProps) {
  const releaseQuery = trpc.helm.get.useQuery(
    { clusterId, releaseName, namespace },
    { staleTime: 30_000 },
  )

  const revisionsQuery = trpc.helm.revisions.useQuery(
    { clusterId, releaseName, namespace },
    { staleTime: 30_000 },
  )

  type ReleaseData = {
    name: string
    namespace: string
    chartName: string
    chartVersion: string
    appVersion: string
    status: string
    revision: number
    firstDeployed: string | null
    lastDeployed: string | null
    values: Record<string, unknown>
    notes: string
    manifest: string
  }
  const release = (releaseQuery.data ?? null) as ReleaseData | null
  const revisions = (revisionsQuery.data ?? []) as RevisionData[]

  const [expandedRevision, setExpandedRevision] = useState<number | null>(null)
  const [diffMode, setDiffMode] = useState(false)

  const revisionValuesQuery = trpc.helm.revisionValues.useQuery(
    { clusterId, releaseName, namespace, revision: expandedRevision! },
    {
      enabled: expandedRevision !== null,
      staleTime: 30_000,
    },
  )

  if (releaseQuery.isLoading) {
    return (
      <div className="p-4 space-y-2">
        <div className="h-4 w-32 rounded bg-white/[0.06] animate-pulse" />
        <div className="h-4 w-48 rounded bg-white/[0.04] animate-pulse" />
      </div>
    )
  }

  if (!release) {
    return (
      <p className="p-4 text-[11px] text-[var(--color-text-muted)]">Release data unavailable.</p>
    )
  }

  const manifestResources = parseManifestResources(release.manifest)

  const tabs = [
    {
      id: 'info',
      label: 'Info',
      icon: <Info className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-[11px] font-mono">
            <span className="text-[var(--color-text-muted)]">Chart</span>
            <span className="text-[var(--color-text-secondary)]">
              {release.chartName}-{release.chartVersion}
            </span>
            {release.appVersion && (
              <>
                <span className="text-[var(--color-text-muted)]">App Version</span>
                <span className="text-[var(--color-text-secondary)]">{release.appVersion}</span>
              </>
            )}
            <span className="text-[var(--color-text-muted)]">Namespace</span>
            <span className="text-[var(--color-text-secondary)]">{release.namespace}</span>
            <span className="text-[var(--color-text-muted)]">Revision</span>
            <span className="text-[var(--color-text-secondary)]">{release.revision}</span>
            {release.firstDeployed && (
              <>
                <span className="text-[var(--color-text-muted)]">First Deployed</span>
                <span className="text-[var(--color-text-secondary)]">
                  {timeAgo(release.firstDeployed)}
                </span>
              </>
            )}
            {release.lastDeployed && (
              <>
                <span className="text-[var(--color-text-muted)]">Last Deployed</span>
                <span className="text-[var(--color-text-secondary)]">
                  {timeAgo(release.lastDeployed)}
                </span>
              </>
            )}
          </div>
          {release.notes && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
                Notes
              </p>
              <pre className="text-[11px] font-mono text-[var(--color-text-secondary)] bg-black/20 rounded-lg p-3 overflow-auto max-h-[200px] whitespace-pre-wrap">
                {release.notes}
              </pre>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'values',
      label: 'Values',
      icon: <FileText className="h-3.5 w-3.5" />,
      content: <ValuesViewer values={release.values} />,
    },
    {
      id: 'revisions',
      label: 'Revisions',
      icon: <GitBranch className="h-3.5 w-3.5" />,
      content: diffMode ? (
        <HelmRevisionDiff
          clusterId={clusterId}
          releaseName={releaseName}
          namespace={namespace}
          revisions={revisions}
          onBack={() => setDiffMode(false)}
        />
      ) : (
        <div className="space-y-1.5">
          {revisionsQuery.isLoading ? (
            <div className="h-4 w-32 rounded bg-white/[0.06] animate-pulse" />
          ) : revisions.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)]">No revision history.</p>
          ) : (
            <>
              {revisions.length >= 2 && (
                <div className="flex justify-end mb-2">
                  <button
                    type="button"
                    onClick={() => setDiffMode(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
                      bg-white/[0.04] border border-[var(--color-border)]/40 text-[var(--color-text-muted)]
                      hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/40 transition-colors"
                  >
                    <GitCompare className="h-3 w-3" />
                    Compare
                  </button>
                </div>
              )}
              {revisions.map((rev) => (
                <div key={rev.revision}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedRevision(expandedRevision === rev.revision ? null : rev.revision)
                    }
                    className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--color-border)]/40 bg-white/[0.01] w-full text-left cursor-pointer hover:bg-white/[0.03] transition-colors duration-150"
                  >
                    <span className="text-[12px] font-bold font-mono text-[var(--color-accent)] w-8 shrink-0">
                      #{rev.revision}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded border ${statusColor(rev.status)}`}
                    >
                      {rev.status}
                    </span>
                    {rev.updatedAt && (
                      <span className="text-[11px] font-mono text-[var(--color-text-dim)] flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(rev.updatedAt)}
                      </span>
                    )}
                    {rev.description && (
                      <span className="text-[11px] text-[var(--color-text-muted)] truncate flex-1">
                        {rev.description}
                      </span>
                    )}
                    <motion.span
                      variants={chevronVariants}
                      animate={expandedRevision === rev.revision ? 'expanded' : 'collapsed'}
                      transition={{ duration: DURATION.fast, ease: EASING.default }}
                      className="shrink-0 text-[var(--color-text-dim)]"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {expandedRevision === rev.revision && (
                      <motion.div
                        key={`values-${rev.revision}`}
                        variants={expandVariants}
                        initial="collapsed"
                        animate="expanded"
                        exit="exit"
                        className="overflow-hidden"
                      >
                        <div className="ml-1 border-l-2 border-emerald-500/60 bg-black/20 rounded-r-lg mt-1 mb-2">
                          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04]">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                              Values — Revision #{rev.revision}
                            </span>
                          </div>
                          <div className="px-4 py-3">
                            {revisionValuesQuery.isLoading ? (
                              <div className="space-y-2">
                                <div className="h-3 w-48 rounded bg-white/[0.06] animate-pulse" />
                                <div className="h-3 w-64 rounded bg-white/[0.04] animate-pulse" />
                                <div className="h-3 w-40 rounded bg-white/[0.04] animate-pulse" />
                              </div>
                            ) : (
                              <ValuesViewer
                                values={
                                  (revisionValuesQuery.data?.values as Record<string, unknown>) ??
                                  {}
                                }
                              />
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </>
          )}
        </div>
      ),
    },
    {
      id: 'resources',
      label: 'Resources',
      icon: <Package className="h-3.5 w-3.5" />,
      content: (
        <div className="space-y-1.5">
          {manifestResources.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              No managed resources found in manifest.
            </p>
          ) : (
            manifestResources.map((res) => {
              const tab = kindToTab(res.kind)
              const key = `${res.kind}/${res.namespace ?? ''}/${res.name}`
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--color-border)]/40 bg-white/[0.01]"
                >
                  <span className="text-[10px] font-medium font-mono px-2 py-0.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20 shrink-0">
                    {res.kind}
                  </span>
                  {tab ? (
                    <RelatedResourceLink
                      tab={tab}
                      resourceKey={res.namespace ? `${res.namespace}/${res.name}` : res.name}
                      label={res.name}
                    />
                  ) : (
                    <span className="text-[12px] font-mono text-[var(--color-text-secondary)]">
                      {res.name}
                    </span>
                  )}
                  {res.namespace && (
                    <span className="text-[10px] font-mono text-[var(--color-text-dim)] ml-auto">
                      {res.namespace}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>
      ),
    },
  ]

  return <DetailTabs id={`helm-${namespace}-${releaseName}`} tabs={tabs} />
}
