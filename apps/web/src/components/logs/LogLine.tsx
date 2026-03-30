'use client'

import { useMemo } from 'react'
import { JsonRenderer } from './JsonRenderer'
import {
  type LogLevel,
  detectLogLevel,
  extractTimestamp,
  formatRelativeTime,
  isJsonLine,
} from './log-utils'

interface LogLineProps {
  line: string
  lineNumber: number
  searchQuery?: string
  wordWrap: boolean
  beautify?: boolean
}

const LOG_LEVEL_STYLES: Record<
  Exclude<LogLevel, null>,
  { color: string; bg: string; label: string }
> = {
  ERROR: {
    color: 'var(--color-log-error)',
    bg: 'color-mix(in srgb, var(--color-log-error) 15%, transparent)',
    label: 'ERR',
  },
  WARN: {
    color: 'var(--color-log-warn)',
    bg: 'color-mix(in srgb, var(--color-log-warn) 15%, transparent)',
    label: 'WRN',
  },
  INFO: {
    color: 'var(--color-log-info)',
    bg: 'color-mix(in srgb, var(--color-log-info) 15%, transparent)',
    label: 'INF',
  },
  DEBUG: {
    color: 'var(--color-log-debug)',
    bg: 'color-mix(in srgb, var(--color-log-debug) 15%, transparent)',
    label: 'DBG',
  },
}

export function LogLine({
  line,
  lineNumber,
  searchQuery,
  wordWrap,
  beautify = true,
}: LogLineProps) {
  const parsed = useMemo(() => {
    if (!beautify)
      return { timestamp: null, content: line, level: null as LogLevel, jsonDetected: false }
    const { timestamp, content } = extractTimestamp(line)
    const level = detectLogLevel(content)
    const jsonDetected = isJsonLine(content)
    return { timestamp, content, level, jsonDetected }
  }, [line, beautify])

  const levelStyle = parsed.level ? LOG_LEVEL_STYLES[parsed.level] : null

  return (
    <div
      className="flex gap-0 font-mono text-xs leading-5 hover:bg-[var(--color-hover-overlay)] group"
      style={{
        whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
        wordBreak: wordWrap ? 'break-all' : undefined,
      }}
    >
      {/* Line number gutter */}
      <span
        className="shrink-0 select-none text-right pr-3 pl-2"
        style={{
          color: 'var(--color-log-line-number)',
          width: '3.5rem',
          minWidth: '3.5rem',
          userSelect: 'none',
        }}
      >
        {lineNumber}
      </span>

      {/* Timestamp */}
      {beautify && parsed.timestamp && (
        <span
          className="shrink-0 pr-2"
          style={{ color: 'var(--color-log-timestamp)' }}
          title={parsed.timestamp}
        >
          {formatRelativeTime(parsed.timestamp)}
        </span>
      )}

      {/* Level badge */}
      {beautify && levelStyle && (
        <span
          className="shrink-0 inline-flex items-center justify-center rounded px-1.5 mr-2 text-[10px] font-semibold leading-4"
          style={{
            color: levelStyle.color,
            background: levelStyle.bg,
          }}
        >
          {levelStyle.label}
        </span>
      )}

      {/* Content */}
      <span className="flex-1 min-w-0" style={{ color: 'var(--color-log-text)' }}>
        {beautify && parsed.jsonDetected ? (
          <JsonRenderer json={parsed.content} searchQuery={searchQuery} />
        ) : (
          highlightText(parsed.content, searchQuery)
        )}
      </span>
    </div>
  )
}

function highlightText(text: string, query?: string): React.ReactNode {
  if (!query || query.length === 0) return text
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi')
  const parts = text.split(regex)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark
        key={i}
        style={{
          background: 'var(--color-log-highlight)',
          color: 'inherit',
          borderRadius: '2px',
          padding: '0 1px',
        }}
      >
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
