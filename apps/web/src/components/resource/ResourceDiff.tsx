'use client'

import { Check, Copy, GitCompare, Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { stringify } from 'yaml'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { trpc } from '@/lib/trpc'

const YAML_RESOURCE_TYPES = [
  'pods',
  'deployments',
  'services',
  'configmaps',
  'secrets',
  'statefulsets',
  'daemonsets',
  'jobs',
  'cronjobs',
  'ingresses',
  'hpa',
  'pvcs',
  'namespaces',
  'nodes',
  'networkpolicies',
  'resourcequotas',
] as const

type YamlResourceType = (typeof YAML_RESOURCE_TYPES)[number]

interface ResourceDiffProps {
  clusterId: string
  resourceType: string
  resourceName: string
  namespace?: string
}

/**
 * Strip managed fields and status from a K8s resource for cleaner diff display.
 * Keeps metadata.annotations, labels, etc. but removes noise.
 */
function cleanResourceForDiff(resource: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...resource }
  if (cleaned.metadata && typeof cleaned.metadata === 'object') {
    const meta = { ...(cleaned.metadata as Record<string, unknown>) }
    delete meta.managedFields
    delete meta.uid
    delete meta.resourceVersion
    delete meta.generation
    delete meta.creationTimestamp
    delete meta.selfLink
    cleaned.metadata = meta
  }
  delete cleaned.status
  return cleaned
}

export function ResourceDiff({
  clusterId,
  resourceType,
  resourceName,
  namespace,
}: ResourceDiffProps) {
  const [copiedSide, setCopiedSide] = useState<'left' | 'right' | null>(null)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const query = trpc.yaml.get.useQuery(
    { clusterId, resourceType: resourceType as YamlResourceType, name: resourceName, namespace },
    { staleTime: 15_000, refetchOnWindowFocus: false },
  )

  const { lastAppliedYaml, currentYaml, isHelmManaged, hasDiff, hasAnnotation } = useMemo(() => {
    if (!query.data) {
      return {
        lastAppliedYaml: '',
        currentYaml: '',
        isHelmManaged: false,
        hasDiff: false,
        hasAnnotation: false,
      }
    }

    const resource = query.data as Record<string, unknown>
    const metadata = resource.metadata as Record<string, unknown> | undefined
    const annotations = metadata?.annotations as Record<string, string> | undefined
    const labels = metadata?.labels as Record<string, string> | undefined

    // Check for Helm-managed resources
    const helmManaged = labels?.['app.kubernetes.io/managed-by'] === 'Helm'

    // Extract last-applied-configuration annotation
    const lastAppliedRaw = annotations?.['kubectl.kubernetes.io/last-applied-configuration']

    if (!lastAppliedRaw) {
      // Convert current to YAML for display in "no annotation" state
      const cleaned = cleanResourceForDiff(resource)
      const current = stringify(cleaned, { lineWidth: 120 })
      return {
        lastAppliedYaml: '',
        currentYaml: current,
        isHelmManaged: helmManaged,
        hasDiff: false,
        hasAnnotation: false,
      }
    }

    try {
      const lastAppliedObj = JSON.parse(lastAppliedRaw) as Record<string, unknown>
      const cleanedCurrent = cleanResourceForDiff(resource)

      // Remove the last-applied annotation from current for cleaner comparison
      if (cleanedCurrent.metadata && typeof cleanedCurrent.metadata === 'object') {
        const meta = { ...(cleanedCurrent.metadata as Record<string, unknown>) }
        if (meta.annotations && typeof meta.annotations === 'object') {
          const annots = { ...(meta.annotations as Record<string, string>) }
          delete annots['kubectl.kubernetes.io/last-applied-configuration']
          meta.annotations = Object.keys(annots).length > 0 ? annots : undefined
        }
        cleanedCurrent.metadata = meta
      }

      const lastYaml = stringify(lastAppliedObj, { lineWidth: 120 })
      const currYaml = stringify(cleanedCurrent, { lineWidth: 120 })

      return {
        lastAppliedYaml: lastYaml,
        currentYaml: currYaml,
        isHelmManaged: helmManaged,
        hasDiff: lastYaml !== currYaml,
        hasAnnotation: true,
      }
    } catch {
      return {
        lastAppliedYaml: '',
        currentYaml: '',
        isHelmManaged: helmManaged,
        hasDiff: false,
        hasAnnotation: false,
      }
    }
  }, [query.data])

  async function handleCopy(side: 'left' | 'right') {
    const text = side === 'left' ? lastAppliedYaml : currentYaml
    try {
      await navigator.clipboard.writeText(text)
      setCopiedSide(side)
      setTimeout(() => setCopiedSide(null), 2000)
    } catch {
      // Clipboard API may not be available
    }
  }

  // Loading state
  if (query.isLoading) {
    return (
      <div className="p-4 space-y-2">
        <div className="skeleton-shimmer h-4 w-3/4" />
        <div className="skeleton-shimmer h-4 w-1/2" />
        <div className="skeleton-shimmer h-4 w-5/8" />
      </div>
    )
  }

  // Error state
  if (query.isError) {
    return (
      <div className="p-4 flex flex-col items-center justify-center gap-3 text-sm">
        <p className="text-[var(--color-text-muted)]">
          Failed to load resource data for diff comparison.
        </p>
      </div>
    )
  }

  // No last-applied annotation
  if (!hasAnnotation) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 gap-3">
        <div className="rounded-full bg-[var(--color-bg-card-hover)] p-3">
          <Info className="h-5 w-5 text-[var(--color-text-muted)]" />
        </div>
        <p className="text-sm font-medium text-[var(--color-text-secondary)] text-center">
          No last-applied configuration found
        </p>
        <p className="text-xs text-[var(--color-text-muted)] text-center max-w-sm">
          Resource was not created with{' '}
          <code className="font-mono px-1 py-0.5 rounded bg-[var(--color-bg-card-hover)]">
            kubectl apply
          </code>
          . Diff comparison requires the{' '}
          <code className="font-mono px-1 py-0.5 rounded bg-[var(--color-bg-card-hover)]">
            kubectl.kubernetes.io/last-applied-configuration
          </code>{' '}
          annotation.
        </p>
        {isHelmManaged && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/[0.04]">
            <GitCompare className="h-4 w-4 text-[var(--color-accent)]" />
            <span className="text-xs text-[var(--color-accent)]">
              Helm-managed resource — revision comparison coming soon
            </span>
          </div>
        )}
      </div>
    )
  }

  // No diff detected
  if (!hasDiff) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 gap-3">
        <div className="rounded-full bg-emerald-500/10 p-3">
          <Check className="h-5 w-5 text-emerald-500" />
        </div>
        <p className="text-sm font-medium text-[var(--color-text-secondary)] text-center">
          No changes detected
        </p>
        <p className="text-xs text-[var(--color-text-muted)] text-center max-w-sm">
          Resource matches last-applied configuration.
        </p>
      </div>
    )
  }

  // Custom styles for the diff viewer
  const diffStyles = {
    variables: {
      dark: {
        diffViewerBackground: 'transparent',
        diffViewerTitleBackground: 'var(--color-bg-card)',
        diffViewerTitleColor: 'var(--color-text-secondary)',
        diffViewerTitleBorderColor: 'var(--color-border)',
        diffViewerColor: 'var(--color-text-primary)',
        addedBackground: 'var(--color-diff-added-bg)',
        addedColor: 'var(--color-diff-added-text)',
        removedBackground: 'var(--color-diff-removed-bg)',
        removedColor: 'var(--color-diff-removed-text)',
        changedBackground: 'var(--color-diff-modified-bg)',
        wordAddedBackground: 'rgba(16, 185, 129, 0.25)',
        wordRemovedBackground: 'rgba(239, 68, 68, 0.25)',
        addedGutterBackground: 'rgba(16, 185, 129, 0.08)',
        removedGutterBackground: 'rgba(239, 68, 68, 0.08)',
        gutterBackground: 'transparent',
        gutterBackgroundDark: 'transparent',
        codeFoldBackground: 'var(--color-bg-card-hover)',
        codeFoldGutterBackground: 'var(--color-bg-card-hover)',
        codeFoldContentColor: 'var(--color-text-muted)',
      },
      light: {
        diffViewerBackground: 'transparent',
        diffViewerTitleBackground: 'var(--color-bg-card)',
        diffViewerTitleColor: 'var(--color-text-secondary)',
        diffViewerTitleBorderColor: 'var(--color-border)',
        diffViewerColor: 'var(--color-text-primary)',
        addedBackground: 'var(--color-diff-added-bg)',
        addedColor: 'var(--color-diff-added-text)',
        removedBackground: 'var(--color-diff-removed-bg)',
        removedColor: 'var(--color-diff-removed-text)',
        changedBackground: 'var(--color-diff-modified-bg)',
        wordAddedBackground: 'rgba(5, 150, 105, 0.2)',
        wordRemovedBackground: 'rgba(220, 38, 38, 0.2)',
        addedGutterBackground: 'rgba(5, 150, 105, 0.06)',
        removedGutterBackground: 'rgba(220, 38, 38, 0.06)',
        gutterBackground: 'transparent',
        gutterBackgroundDark: 'transparent',
        codeFoldBackground: 'var(--color-bg-card-hover)',
        codeFoldGutterBackground: 'var(--color-bg-card-hover)',
        codeFoldContentColor: 'var(--color-text-muted)',
      },
    },
    contentText: {
      fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
      fontSize: '13px',
      lineHeight: '1.4',
    },
    lineNumber: {
      fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
      fontSize: '13px',
      color: 'var(--color-text-dim)',
    },
    diffContainer: {
      borderRadius: '0.375rem',
      overflow: 'hidden',
    },
    titleBlock: {
      padding: '8px 12px',
      fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
      fontSize: '12px',
      fontWeight: 600,
    },
  }

  return (
    <div className="relative space-y-2">
      {/* Helm managed indicator */}
      {isHelmManaged && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/[0.04]">
          <GitCompare className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          <span className="text-xs text-[var(--color-accent)]">
            Helm-managed resource — revision comparison coming soon
          </span>
        </div>
      )}

      {/* Copy buttons */}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => handleCopy('left')}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs
            bg-[var(--color-bg-card-hover)] text-[var(--color-text-muted)]
            hover:text-[var(--color-text-primary)] transition-colors border border-[var(--color-border)]"
          title="Copy last-applied YAML"
        >
          {copiedSide === 'left' ? (
            <Check className="w-3 h-3 text-[var(--color-status-healthy)]" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
          Last Applied
        </button>
        <button
          type="button"
          onClick={() => handleCopy('right')}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs
            bg-[var(--color-bg-card-hover)] text-[var(--color-text-muted)]
            hover:text-[var(--color-text-primary)] transition-colors border border-[var(--color-border)]"
          title="Copy current YAML"
        >
          {copiedSide === 'right' ? (
            <Check className="w-3 h-3 text-[var(--color-status-healthy)]" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
          Current
        </button>
      </div>

      {/* Diff viewer */}
      <div className="overflow-auto rounded-md" style={{ maxHeight: 500 }}>
        <ReactDiffViewer
          oldValue={lastAppliedYaml}
          newValue={currentYaml}
          splitView={true}
          leftTitle="Last Applied"
          rightTitle="Current"
          useDarkTheme={isDark}
          styles={diffStyles}
          showDiffOnly={false}
          extraLinesSurroundingDiff={3}
        />
      </div>
    </div>
  )
}
