'use client'

import { Copy, KeyRound, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'

const MCP_SNIPPET = `{
  "mcpServers": {
    "voyager": {
      "url": "http://voyager-platform.voyagerlabs.co/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}`

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

export function ApiTokensSection() {
  const utils = trpc.useUtils()
  type TokensApi = {
    listTokens?: { useQuery?: () => { data?: unknown[]; isLoading?: boolean } }
    createToken?: {
      useMutation?: (options?: {
        onSuccess?: (result: { token?: string }) => void
        onError?: (error: Error) => void
      }) => {
        mutate: (input: { name: string }) => void
        isPending?: boolean
      }
    }
    revokeToken?: {
      useMutation?: (options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
        mutate: (input: { id: string }) => void
        isPending?: boolean
      }
    }
  }

  const tokensApi = (trpc as unknown as { tokens?: TokensApi }).tokens

  const listTokens = tokensApi?.listTokens?.useQuery?.()
  const createToken = tokensApi?.createToken?.useMutation?.({
    onSuccess: (result: { token?: string }) => {
      setTokenName('')
      setCreatedToken(result?.token ?? null)
      void utils.invalidate()
      toast.success('API token generated')
    },
    onError: (error: Error) => {
      toast.error(error?.message ?? 'Failed to generate token')
    },
  })

  const revokeToken = tokensApi?.revokeToken?.useMutation?.({
    onSuccess: () => {
      setConfirmRevokeId(null)
      void utils.invalidate()
      toast.success('Token revoked')
    },
    onError: (error: Error) => {
      toast.error(error?.message ?? 'Failed to revoke token')
    },
  })

  const [tokenName, setTokenName] = useState('')
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)

  const tokens = (listTokens?.data ?? []) as Array<{
    id: string
    name: string
    createdAt: string | Date
    lastUsedAt?: string | Date | null
  }>

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
    if (!name || !createToken) return
    createToken.mutate({ name })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h4 className="text-[12px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
          Existing Tokens
        </h4>

        {listTokens?.isLoading ? (
          <p className="text-[12px] text-[var(--color-text-dim)]">Loading tokens…</p>
        ) : tokens.length === 0 ? (
          <p className="text-[12px] text-[var(--color-text-dim)]">No API tokens yet.</p>
        ) : (
          <div className="space-y-2.5">
            {tokens.map((token) => {
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
                      <p className="text-[11px] text-[var(--color-text-dim)]">
                        Created: {formatDate(token.createdAt)}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-dim)]">
                        Last used: {formatDate(token.lastUsedAt)}
                      </p>
                    </div>

                    {isConfirming ? (
                      <div className="grid min-w-[160px] grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => revokeToken?.mutate({ id: token.id })}
                          disabled={revokeToken?.isPending}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRevokeId(null)}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--color-border)] px-3 text-sm text-[var(--color-text-primary)] hover:bg-white/[0.04]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRevokeId(token.id)}
                        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-red-500/50 px-3 text-sm font-medium text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-[var(--color-border)]/60 pt-4">
        <h4 className="text-[12px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
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
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)]"
          />
        </div>

        <button
          type="button"
          onClick={handleCreate}
          disabled={!tokenName.trim() || createToken?.isPending}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[var(--color-accent)]/20 hover:opacity-90 disabled:opacity-60 sm:w-auto"
        >
          <KeyRound className="h-4 w-4" />
          {createToken?.isPending ? 'Generating...' : 'Generate Token'}
        </button>

        {createdToken && (
          <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-amber-200">
                This token will only be shown once. Copy it now and store it securely.
              </p>
              <button
                type="button"
                onClick={() => setCreatedToken(null)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-amber-200 hover:bg-amber-500/10"
                aria-label="Dismiss token"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-lg border border-amber-500/40 bg-black/20 p-2">
              <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-amber-100">
                {createdToken}
              </pre>
            </div>
            <button
              type="button"
              onClick={() => copyText(createdToken, 'Token')}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-amber-400/60 px-3 text-sm font-medium text-amber-100 hover:bg-amber-500/10"
            >
              <Copy className="h-4 w-4" />
              Copy Token
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-[var(--color-border)]/60 pt-4">
        <h4 className="text-[12px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
          MCP Integration (Claude Desktop)
        </h4>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-[var(--color-text-secondary)]">
            {MCP_SNIPPET}
          </pre>
        </div>

        <button
          type="button"
          onClick={() => copyText(MCP_SNIPPET, 'Snippet')}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-text-primary)] hover:bg-white/[0.04]"
        >
          <Copy className="h-4 w-4" />
          Copy Snippet
        </button>
      </div>
    </div>
  )
}
