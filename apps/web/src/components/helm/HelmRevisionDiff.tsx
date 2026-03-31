'use client'

import { ArrowLeft, Check, GitCompare } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { stringify } from 'yaml'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { trpc } from '@/lib/trpc'
import { timeAgo } from '@/lib/time-utils'

export interface RevisionData {
  revision: number
  status: string
  updatedAt: string | null
  description: string
}

interface HelmRevisionDiffProps {
  clusterId: string
  releaseName: string
  namespace: string
  revisions: RevisionData[]
  onBack: () => void
}

export function HelmRevisionDiff({
  clusterId,
  releaseName,
  namespace,
  revisions,
  onBack,
}: HelmRevisionDiffProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Default: compare two most recent (revisions are sorted descending)
  // Parent guarantees revisions.length >= 2, so these are always defined
  const [fromRev, setFromRev] = useState(revisions[1]!.revision)
  const [toRev, setToRev] = useState(revisions[0]!.revision)
  const [splitView, setSplitView] = useState(true)

  const fromQuery = trpc.helm.revisionValues.useQuery(
    { clusterId, releaseName, namespace, revision: fromRev },
    { staleTime: 30_000 },
  )
  const toQuery = trpc.helm.revisionValues.useQuery(
    { clusterId, releaseName, namespace, revision: toRev },
    { staleTime: 30_000 },
  )

  const { fromYaml, toYaml } = useMemo(() => {
    const fromValues = (fromQuery.data?.values as Record<string, unknown>) ?? {}
    const toValues = (toQuery.data?.values as Record<string, unknown>) ?? {}
    return {
      fromYaml: stringify(fromValues, { indent: 2, lineWidth: 120 }),
      toYaml: stringify(toValues, { indent: 2, lineWidth: 120 }),
    }
  }, [fromQuery.data, toQuery.data])

  const isLoading = fromQuery.isLoading || toQuery.isLoading
  const isError = fromQuery.isError || toQuery.isError
  const hasDiff = fromYaml !== toYaml

  const fromInfo = revisions.find((r) => r.revision === fromRev)
  const toInfo = revisions.find((r) => r.revision === toRev)

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
      fontSize: '12px',
      lineHeight: '1.5',
    },
    lineNumber: {
      fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
      fontSize: '12px',
      color: 'var(--color-text-dim)',
    },
    diffContainer: {
      borderRadius: '0.375rem',
      overflow: 'hidden',
    },
    titleBlock: {
      padding: '8px 12px',
      fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
      fontSize: '11px',
      fontWeight: 600,
    },
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
              bg-white/[0.04] border border-[var(--color-border)]/40 text-[var(--color-text-muted)]
              hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent)]/40 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to list
          </button>
          <div className="h-4 w-px bg-[var(--color-border)]/40" />
          <div className="flex items-center gap-2">
            <select
              value={fromRev}
              onChange={(e) => setFromRev(Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono
                bg-white/[0.04] border border-[var(--color-border)]/40 text-[var(--color-text-secondary)]
                hover:border-[var(--color-accent)]/40 transition-colors cursor-pointer max-h-[200px] overflow-y-auto"
              size={revisions.length > 10 ? 12 : undefined}
            >
              {revisions
                .filter((r) => r.revision !== toRev)
                .map((r) => (
                  <option key={r.revision} value={r.revision}>
                    #{r.revision} {r.status}
                  </option>
                ))}
            </select>
            <span className="text-[var(--color-text-dim)] text-xs">→</span>
            <select
              value={toRev}
              onChange={(e) => setToRev(Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono
                bg-white/[0.04] border border-[var(--color-border)]/40 text-[var(--color-text-secondary)]
                hover:border-[var(--color-accent)]/40 transition-colors cursor-pointer max-h-[200px] overflow-y-auto"
              size={revisions.length > 10 ? 12 : undefined}
            >
              {revisions
                .filter((r) => r.revision !== fromRev)
                .map((r) => (
                  <option key={r.revision} value={r.revision}>
                    #{r.revision} {r.status}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-[var(--color-border)]/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setSplitView(true)}
              className={`px-3 py-1 text-[10px] font-medium transition-colors ${
                splitView
                  ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              Split
            </button>
            <button
              type="button"
              onClick={() => setSplitView(false)}
              className={`px-3 py-1 text-[10px] font-medium transition-colors border-l border-[var(--color-border)]/40 ${
                !splitView
                  ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              Unified
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="p-4 space-y-2">
          <div className="h-4 w-3/4 rounded bg-white/[0.06] animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-white/[0.04] animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-white/[0.04] animate-pulse" />
        </div>
      ) : isError ? (
        <div className="p-4 flex flex-col items-center justify-center gap-3">
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Failed to load revision values for comparison.
          </p>
        </div>
      ) : !hasDiff ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="rounded-full bg-emerald-500/10 p-3">
            <Check className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">
            Values are identical
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Revisions #{fromRev} and #{toRev} have the same values.
          </p>
        </div>
      ) : (
        <div
          className="overflow-auto rounded-lg border border-[var(--color-border)]/40"
          style={{ maxHeight: 500 }}
        >
          <ReactDiffViewer
            oldValue={fromYaml}
            newValue={toYaml}
            splitView={splitView}
            leftTitle={`Revision #${fromRev} — ${fromInfo?.status ?? ''} ${fromInfo?.updatedAt ? `(${timeAgo(fromInfo.updatedAt)})` : ''}`}
            rightTitle={`Revision #${toRev} — ${toInfo?.status ?? ''} ${toInfo?.updatedAt ? `(${timeAgo(toInfo.updatedAt)})` : ''}`}
            useDarkTheme={isDark}
            styles={diffStyles}
            showDiffOnly={false}
            extraLinesSurroundingDiff={3}
          />
        </div>
      )}
    </div>
  )
}
