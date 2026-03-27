'use client'

import { Copy, KeyRound, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { TableSkeleton } from '@/components/TableSkeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

function getMcpSnippet(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? window.location.origin
  return JSON.stringify(
    {
      mcpServers: {
        voyager: {
          url: `${baseUrl}/mcp`,
          headers: {
            Authorization: 'Bearer <your-token>',
          },
        },
      },
    },
    null,
    2,
  )
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return 'Never'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const PAGE_SIZE = 10

export function ApiTokensSection() {
  const utils = trpc.useUtils()

  const listTokens = trpc.tokens.listTokens.useQuery()
  const createToken = trpc.tokens.createToken.useMutation({
    onSuccess: (result) => {
      setTokenName('')
      setCreatedToken(result.token ?? null)
      void utils.tokens.listTokens.invalidate()
      toast.success('API token generated')
    },
    onError: (error) => {
      toast.error(error.message ?? 'Failed to generate token')
    },
  })

  const revokeToken = trpc.tokens.revokeToken.useMutation({
    onSuccess: () => {
      setConfirmRevokeId(null)
      void utils.tokens.listTokens.invalidate()
      toast.success('Token revoked')
    },
    onError: (error) => {
      toast.error(error.message ?? 'Failed to revoke token')
    },
  })

  const revokeTestTokens = trpc.tokens.revokeTestTokens.useMutation({
    onSuccess: (result) => {
      void utils.tokens.listTokens.invalidate()
      toast.success(`Revoked ${result.count} test token(s)`)
    },
    onError: (error) => {
      toast.error(error.message ?? 'Failed to revoke test tokens')
    },
  })

  const [tokenName, setTokenName] = useState('')
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)

  const allTokens = listTokens.data ?? []

  const filteredTokens = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return allTokens
    return allTokens.filter((t) => t.name.toLowerCase().includes(q))
  }, [allTokens, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredTokens.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const pagedTokens = filteredTokens.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  const testTokenCount = allTokens.filter(
    (t) => t.name.startsWith('test-token-') || t.name.startsWith('list-test-'),
  ).length

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`)
    }
  }

  const handleCreate = () => {
    const name = tokenName.trim()
    if (!name || createToken.isPending) return
    createToken.mutate({ name })
  }

  return (
    <TooltipProvider>
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
              Existing Tokens ({allTokens.length})
            </h4>
            {testTokenCount > 0 && (
              <button
                type="button"
                onClick={() => revokeTestTokens.mutate()}
                disabled={revokeTestTokens.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-2.5 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                aria-label="Revoke all test tokens"
              >
                <Trash2 className="h-3 w-3" />
                {revokeTestTokens.isPending
                  ? 'Revoking...'
                  : `Revoke ${testTokenCount} Test Tokens`}
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Search tokens…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(0)
              }}
              aria-label="Search tokens"
              autoComplete="off"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-ring transition-colors"
            />
          </div>

          {listTokens.isLoading ? (
            <TableSkeleton rows={3} columns={3} />
          ) : pagedTokens.length === 0 ? (
            <p className="text-xs text-[var(--color-text-dim)]">
              {searchQuery ? 'No tokens match your search.' : 'No API tokens yet.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {pagedTokens.map((token) => {
                const isConfirming = confirmRevokeId === token.id
                return (
                  <div
                    key={token.id}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/60 p-3"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                          {token.name}
                        </div>
                        <p className="text-xs text-[var(--color-text-dim)]">
                          Created: {formatDate(token.createdAt)}
                        </p>
                        <p className="text-xs text-[var(--color-text-dim)]">
                          Last used: {formatDate(token.lastUsedAt)}
                        </p>
                      </div>

                      {isConfirming ? (
                        <div className="grid min-w-[160px] grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => revokeToken.mutate({ id: token.id })}
                            disabled={revokeToken.isPending}
                            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRevokeId(null)}
                            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-primary)] hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setConfirmRevokeId(token.id)}
                              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-red-500/50 px-3 text-sm font-medium text-red-300 hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`Revoke token ${token.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                              Revoke
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Revoke this token</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] pt-2">
              <span>
                {currentPage * PAGE_SIZE + 1}–
                {Math.min((currentPage + 1) * PAGE_SIZE, filteredTokens.length)} of{' '}
                {filteredTokens.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="px-2 py-1 rounded-xl border border-[var(--color-border)] disabled:opacity-30 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Previous page"
                >
                  ←
                </button>
                <span className="px-2 font-mono tabular-nums">
                  {currentPage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                  className="px-2 py-1 rounded-xl border border-[var(--color-border)] disabled:opacity-30 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Next page"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-[var(--color-border)]/60 pt-4">
          <h4 className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
            Create Token
          </h4>

          <div>
            <label
              htmlFor="token-name"
              className="mb-1 block text-xs font-mono uppercase tracking-wider text-[var(--color-text-muted)]"
            >
              Token name
            </label>
            <input
              id="token-name"
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
              placeholder="e.g. Claude Desktop"
              autoComplete="off"
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <button
            type="button"
            onClick={handleCreate}
            disabled={!tokenName.trim() || createToken.isPending}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[var(--color-accent)]/20 hover:opacity-90 disabled:opacity-60 sm:w-auto focus-visible:ring-2 focus-visible:ring-ring"
          >
            <KeyRound className="h-4 w-4" />
            {createToken.isPending ? 'Generating...' : 'Generate Token'}
          </button>

          {createdToken && (
            <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-amber-200">
                  This token will only be shown once. Copy it now and store it securely.
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setCreatedToken(null)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-amber-200 hover:bg-amber-500/10 focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Dismiss token"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Dismiss</TooltipContent>
                </Tooltip>
              </div>
              <div className="rounded-lg border border-amber-500/40 bg-black/20 p-2">
                <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-amber-100">
                  {createdToken}
                </pre>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => copyText(createdToken, 'Token')}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-amber-400/60 px-3 text-sm font-medium text-amber-100 hover:bg-amber-500/10 focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Copy token to clipboard"
                  >
                    <Copy className="h-4 w-4" />
                    Copy Token
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy to clipboard</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-[var(--color-border)]/60 pt-4">
          <h4 className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
            MCP Integration (Claude Desktop)
          </h4>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-[var(--color-text-secondary)]">
              {getMcpSnippet()}
            </pre>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => copyText(getMcpSnippet(), 'Snippet')}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-text-primary)] hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Copy MCP snippet to clipboard"
              >
                <Copy className="h-4 w-4" />
                Copy Snippet
              </button>
            </TooltipTrigger>
            <TooltipContent>Copy to clipboard</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}
