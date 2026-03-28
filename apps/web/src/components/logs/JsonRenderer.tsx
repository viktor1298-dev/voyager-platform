'use client'

import { useCallback, useState } from 'react'

interface JsonRendererProps {
  json: string
  searchQuery?: string
}

export function JsonRenderer({ json, searchQuery }: JsonRendererProps) {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return <span>{highlightText(json, searchQuery)}</span>
  }

  return (
    <span className="inline">
      <JsonValue value={parsed} depth={0} searchQuery={searchQuery} />
    </span>
  )
}

function JsonValue({
  value,
  depth,
  searchQuery,
}: {
  value: unknown
  depth: number
  searchQuery?: string
}) {
  if (depth > 5) {
    return (
      <span style={{ color: 'var(--color-log-bracket)' }}>
        {typeof value === 'object' ? (Array.isArray(value) ? '[...]' : '{...}') : String(value)}
      </span>
    )
  }

  if (value === null) {
    return <span style={{ color: 'var(--color-log-null)' }}>null</span>
  }

  if (typeof value === 'boolean') {
    return <span style={{ color: 'var(--color-log-boolean)' }}>{String(value)}</span>
  }

  if (typeof value === 'number') {
    return <span style={{ color: 'var(--color-log-number)' }}>{value}</span>
  }

  if (typeof value === 'string') {
    return (
      <span style={{ color: 'var(--color-log-string)' }}>
        &quot;{highlightText(value, searchQuery)}&quot;
      </span>
    )
  }

  if (Array.isArray(value)) {
    return <JsonArray items={value} depth={depth} searchQuery={searchQuery} />
  }

  if (typeof value === 'object') {
    return (
      <JsonObject obj={value as Record<string, unknown>} depth={depth} searchQuery={searchQuery} />
    )
  }

  return <span>{String(value)}</span>
}

function JsonObject({
  obj,
  depth,
  searchQuery,
}: {
  obj: Record<string, unknown>
  depth: number
  searchQuery?: string
}) {
  const entries = Object.entries(obj)
  const [collapsed, setCollapsed] = useState(depth > 1)
  const indent = '  '.repeat(depth + 1)
  const closingIndent = '  '.repeat(depth)

  const toggle = useCallback(() => setCollapsed((c) => !c), [])

  if (entries.length === 0) {
    return <span style={{ color: 'var(--color-log-bracket)' }}>{'{}'}</span>
  }

  return (
    <span>
      <button
        type="button"
        onClick={toggle}
        className="inline cursor-pointer hover:opacity-70 transition-opacity select-none"
        style={{ color: 'var(--color-log-bracket)' }}
        aria-label={collapsed ? 'Expand object' : 'Collapse object'}
      >
        {collapsed ? '{...}' : '{'}
      </button>
      {!collapsed && (
        <>
          {'\n'}
          {entries.map(([key, val], i) => (
            <span key={key}>
              {indent}
              <span style={{ color: 'var(--color-log-key)' }}>
                &quot;{highlightText(key, searchQuery)}&quot;
              </span>
              <span style={{ color: 'var(--color-log-bracket)' }}>: </span>
              <JsonValue value={val} depth={depth + 1} searchQuery={searchQuery} />
              {i < entries.length - 1 && (
                <span style={{ color: 'var(--color-log-bracket)' }}>,</span>
              )}
              {'\n'}
            </span>
          ))}
          <span style={{ color: 'var(--color-log-bracket)' }}>
            {closingIndent}
            {'}'}
          </span>
        </>
      )}
    </span>
  )
}

function JsonArray({
  items,
  depth,
  searchQuery,
}: {
  items: unknown[]
  depth: number
  searchQuery?: string
}) {
  const [collapsed, setCollapsed] = useState(depth > 1)
  const indent = '  '.repeat(depth + 1)
  const closingIndent = '  '.repeat(depth)

  const toggle = useCallback(() => setCollapsed((c) => !c), [])

  if (items.length === 0) {
    return <span style={{ color: 'var(--color-log-bracket)' }}>{'[]'}</span>
  }

  return (
    <span>
      <button
        type="button"
        onClick={toggle}
        className="inline cursor-pointer hover:opacity-70 transition-opacity select-none"
        style={{ color: 'var(--color-log-bracket)' }}
        aria-label={collapsed ? 'Expand array' : 'Collapse array'}
      >
        {collapsed ? '[...]' : '['}
      </button>
      {!collapsed && (
        <>
          {'\n'}
          {items.map((item, i) => (
            <span key={i}>
              {indent}
              <JsonValue value={item} depth={depth + 1} searchQuery={searchQuery} />
              {i < items.length - 1 && <span style={{ color: 'var(--color-log-bracket)' }}>,</span>}
              {'\n'}
            </span>
          ))}
          <span style={{ color: 'var(--color-log-bracket)' }}>
            {closingIndent}
            {']'}
          </span>
        </>
      )}
    </span>
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
