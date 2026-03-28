'use client'

import { Check, Copy, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { stringify } from 'yaml'
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

interface YamlViewerProps {
  clusterId: string
  resourceType: string
  resourceName: string
  namespace?: string
}

// Token types for YAML syntax highlighting
type TokenType =
  | 'key'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'comment'
  | 'punctuation'
  | 'plain'

interface Token {
  text: string
  type: TokenType
}

/**
 * Tokenize a single line of YAML into typed tokens for syntax highlighting.
 * Uses CSS custom properties (--color-yaml-*) for theme-aware colors.
 */
function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = []

  // Comment line
  if (line.trimStart().startsWith('#')) {
    tokens.push({ text: line, type: 'comment' })
    return tokens
  }

  // Check for key: value pattern
  // Leading whitespace is preserved as plain text
  const leadingMatch = line.match(/^(\s*)/)
  const indent = leadingMatch?.[1] ?? ''
  const rest = line.slice(indent.length)

  if (indent) {
    tokens.push({ text: indent, type: 'plain' })
  }

  // Handle list items (- key: value or - value)
  const listMatch = rest.match(/^(-\s+)(.*)/)
  if (listMatch) {
    tokens.push({ text: listMatch[1], type: 'punctuation' })
    const listContent = listMatch[2]
    tokens.push(...tokenizeValue(listContent))
    return tokens
  }

  // Key: value pair
  const kvMatch = rest.match(/^([^:]+?)(:)(\s+)(.*)/)
  if (kvMatch) {
    tokens.push({ text: kvMatch[1], type: 'key' })
    tokens.push({ text: kvMatch[2], type: 'punctuation' })
    tokens.push({ text: kvMatch[3], type: 'plain' })
    tokens.push(...tokenizeValue(kvMatch[4]))
    return tokens
  }

  // Key with no value (mapping key only, e.g. "metadata:")
  const keyOnlyMatch = rest.match(/^([^:]+?)(:)\s*$/)
  if (keyOnlyMatch) {
    tokens.push({ text: keyOnlyMatch[1], type: 'key' })
    tokens.push({ text: keyOnlyMatch[2], type: 'punctuation' })
    return tokens
  }

  // Fallback: plain text
  tokens.push({ text: rest, type: 'plain' })
  return tokens
}

function tokenizeValue(value: string): Token[] {
  if (!value) return []

  // Check for key: value within the value (nested inline)
  const kvMatch = value.match(/^([^:]+?)(:)(\s+)(.*)/)
  if (kvMatch) {
    return [
      { text: kvMatch[1], type: 'key' },
      { text: kvMatch[2], type: 'punctuation' },
      { text: kvMatch[3], type: 'plain' },
      ...tokenizeValue(kvMatch[4]),
    ]
  }

  // Quoted strings
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return [{ text: value, type: 'string' }]
  }

  // Multi-line string indicators
  if (value === '|' || value === '>' || value === '|-' || value === '>-') {
    return [{ text: value, type: 'punctuation' }]
  }

  // Boolean
  if (/^(true|false)$/i.test(value)) {
    return [{ text: value, type: 'boolean' }]
  }

  // Null
  if (/^(null|~)$/i.test(value)) {
    return [{ text: value, type: 'null' }]
  }

  // Number
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) {
    return [{ text: value, type: 'number' }]
  }

  // Unquoted strings (catch-all)
  return [{ text: value, type: 'string' }]
}

const TOKEN_CSS_VAR: Record<TokenType, string> = {
  key: 'var(--color-yaml-key)',
  string: 'var(--color-yaml-string)',
  number: 'var(--color-yaml-number)',
  boolean: 'var(--color-yaml-boolean)',
  null: 'var(--color-yaml-null)',
  comment: 'var(--color-yaml-comment)',
  punctuation: 'var(--color-log-dim)',
  plain: 'inherit',
}

export function YamlViewer({ clusterId, resourceType, resourceName, namespace }: YamlViewerProps) {
  const [copied, setCopied] = useState(false)

  const query = trpc.yaml.get.useQuery(
    { clusterId, resourceType: resourceType as YamlResourceType, name: resourceName, namespace },
    { staleTime: 15_000, refetchOnWindowFocus: false },
  )

  const yamlString = useMemo(() => {
    if (!query.data) return ''
    try {
      return stringify(query.data, { lineWidth: 120 })
    } catch {
      return JSON.stringify(query.data, null, 2)
    }
  }, [query.data])

  const tokenizedLines = useMemo(() => {
    if (!yamlString) return []
    return yamlString.split('\n').map((line) => ({
      tokens: tokenizeLine(line),
      raw: line,
    }))
  }, [yamlString])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(yamlString)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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
          Failed to load resource YAML. The resource may have been deleted.
        </p>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
            bg-[var(--color-bg-card-hover)] text-[var(--color-text-secondary)]
            hover:text-[var(--color-text-primary)] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    )
  }

  const lineNumberWidth = String(tokenizedLines.length).length

  return (
    <div className="relative">
      {/* Copy button */}
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs
          bg-[var(--color-bg-card-hover)] text-[var(--color-text-muted)]
          hover:text-[var(--color-text-primary)] transition-colors border border-[var(--color-border)]"
        title="Copy YAML to clipboard"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-[var(--color-status-healthy)]" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
        {copied ? 'Copied' : 'Copy'}
      </button>

      {/* YAML content */}
      <div
        className="overflow-auto font-mono text-[13px] leading-relaxed"
        style={{
          maxHeight: 500,
          background: 'var(--color-log-bg)',
          borderRadius: '0.375rem',
        }}
      >
        <pre className="p-4 pr-16">
          {tokenizedLines.map((line, i) => (
            <div
              key={i}
              className="flex hover:bg-[var(--color-hover-overlay)]"
              style={{ minHeight: '1.625rem' }}
            >
              {/* Line number */}
              <span
                className="shrink-0 select-none text-right pr-4"
                style={{
                  color: 'var(--color-log-line-number)',
                  width: `${Math.max(lineNumberWidth, 2) + 2}ch`,
                  minWidth: `${Math.max(lineNumberWidth, 2) + 2}ch`,
                  userSelect: 'none',
                }}
              >
                {i + 1}
              </span>

              {/* Tokens */}
              <span className="flex-1 min-w-0">
                {line.tokens.map((token, j) => (
                  <span key={j} style={{ color: TOKEN_CSS_VAR[token.type] }}>
                    {token.text}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}
