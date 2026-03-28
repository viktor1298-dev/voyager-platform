'use client'

import { useState, useEffect } from 'react'

interface DataFreshnessBadgeProps {
  /** Timestamp in ms from historyQuery.dataUpdatedAt */
  dataUpdatedAt: number
  /** Whether auto-refresh is currently active */
  autoRefresh: boolean
}

type FreshnessState = 'live' | 'recent' | 'stale'

function computeFreshness(dataUpdatedAt: number, autoRefresh: boolean): FreshnessState | null {
  if (dataUpdatedAt === 0) return null
  const age = Date.now() - dataUpdatedAt
  if (age < 0) return null
  if (autoRefresh && age < 120_000) return 'live'
  if (age < 300_000) return 'recent'
  return 'stale'
}

function formatAge(dataUpdatedAt: number): string {
  const age = Date.now() - dataUpdatedAt
  const minutes = Math.floor(age / 60_000)
  if (minutes < 1) return '<1m ago'
  return `${minutes}m ago`
}

export function DataFreshnessBadge({ dataUpdatedAt, autoRefresh }: DataFreshnessBadgeProps) {
  const [freshness, setFreshness] = useState<FreshnessState | null>(() =>
    computeFreshness(dataUpdatedAt, autoRefresh),
  )
  const [ageLabel, setAgeLabel] = useState(() =>
    dataUpdatedAt > 0 ? formatAge(dataUpdatedAt) : '',
  )

  useEffect(() => {
    // Compute immediately
    setFreshness(computeFreshness(dataUpdatedAt, autoRefresh))
    setAgeLabel(dataUpdatedAt > 0 ? formatAge(dataUpdatedAt) : '')

    // Re-compute every 5 seconds
    const interval = setInterval(() => {
      setFreshness(computeFreshness(dataUpdatedAt, autoRefresh))
      setAgeLabel(dataUpdatedAt > 0 ? formatAge(dataUpdatedAt) : '')
    }, 5_000)

    return () => clearInterval(interval)
  }, [dataUpdatedAt, autoRefresh])

  if (!freshness) return null

  const config = {
    live: {
      color: 'var(--color-status-active)',
      label: 'Live',
      pulse: true,
    },
    recent: {
      color: 'var(--color-status-warning)',
      label: ageLabel,
      pulse: false,
    },
    stale: {
      color: 'var(--color-status-error)',
      label: 'Stale',
      pulse: false,
    },
  } as const

  const { color, label, pulse } = config[freshness]

  return (
    <span
      data-freshness={freshness}
      className="inline-flex items-center gap-1.5 text-xs font-mono"
      style={{ color }}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full${pulse ? ' animate-pulse' : ''}`}
        style={{ background: color }}
      />
      {label}
    </span>
  )
}
