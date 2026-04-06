'use client'

import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { AnimatedList } from '@/components/animations'
import { Dialog } from '@/components/ui/dialog'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cardHover, cardTap } from '@/lib/animation-constants'
import { trpc } from '@/lib/trpc'
import type { ColumnDef } from '@tanstack/react-table'
import { ChevronDown, ChevronUp, Copy, Link2, Plus, Trash2, Webhook } from 'lucide-react'
import { motion } from 'motion/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { usePageTitle } from '@/hooks/usePageTitle'

// TODO: Fetch available event types from backend once webhooks API is connected.
const WEBHOOK_EVENTS = [
  'cluster.health.changed',
  'deployment.restarted',
  'alert.triggered',
  'user.created',
] as const

type WebhookRow = {
  id: string
  name: string
  url: string
  events: string[]
  enabled: boolean
  lastTriggeredAt: string | Date | null
  successRate: number
  deliveries: Array<{
    id: string
    responseStatus: string | null
    deliveredAt: string | Date
    event: string
  }>
}

function formatDate(date: string | Date | null) {
  if (!date) return '—'
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildSecret() {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `whsec_${uuid.replaceAll('-', '')}`
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  return `whsec_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export const dynamic = 'force-dynamic'

function WebhooksContent() {
  const isAdmin = useIsAdmin()
  const reduced = useReducedMotion()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [showAdd, setShowAdd] = useState(false)
  const [expandedWebhookId, setExpandedWebhookId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; url: string } | null>(null)

  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['cluster.health.changed'])
  const [secret, setSecret] = useState(buildSecret())
  const [active, setActive] = useState(true)

  useEffect(() => {
    if (isAdmin === false) router.replace('/')
  }, [isAdmin, router])

  const webhooksQuery = trpc.webhooks.list.useQuery(undefined, { enabled: isAdmin === true })
  const createMutation = trpc.webhooks.create.useMutation()
  const deleteMutation = trpc.webhooks.delete.useMutation()

  const webhooks: WebhookRow[] = useMemo(() => {
    if (!webhooksQuery.data) return []
    return webhooksQuery.data.map((w) => ({
      id: w.id,
      name: w.name,
      url: w.url,
      events: (w.events as string[]) ?? [],
      enabled: w.enabled,
      lastTriggeredAt: w.lastTriggeredAt,
      successRate: w.successRate,
      deliveries: (w.deliveries ?? []).map((d) => ({
        id: d.id,
        responseStatus: d.responseStatus,
        deliveredAt: d.deliveredAt,
        event: d.event,
      })),
    }))
  }, [webhooksQuery.data])

  useEffect(() => {
    const onNew = () => setShowAdd(true)
    document.addEventListener('voyager:new', onNew)
    return () => document.removeEventListener('voyager:new', onNew)
  }, [])

  useEffect(() => {
    if (searchParams.get('new') === '1') setShowAdd(true)
  }, [searchParams])

  const resetForm = () => {
    setUrl('')
    setEvents(['cluster.health.changed'])
    setSecret(buildSecret())
    setActive(true)
  }

  const columns = useMemo<ColumnDef<WebhookRow, unknown>[]>(
    () => [
      {
        accessorKey: 'url',
        header: 'URL',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-[var(--color-text-primary)]">
            {row.original.url}
          </span>
        ),
      },
      {
        id: 'events',
        header: 'Events',
        cell: ({ row }) => (
          <span className="text-xs text-[var(--color-text-secondary)]">
            {row.original.events.join(', ')}
          </span>
        ),
      },
      {
        accessorKey: 'enabled',
        header: 'Status',
        cell: ({ row }) => (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.original.enabled ? 'bg-[var(--color-status-active)]/20 text-[var(--color-status-active)]' : 'bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]'}`}
          >
            {row.original.enabled ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        accessorKey: 'lastTriggeredAt',
        header: 'Last Triggered',
        cell: ({ row }) => (
          <span className="text-xs text-[var(--color-text-muted)]">
            {formatDate(row.original.lastTriggeredAt)}
          </span>
        ),
      },
      {
        accessorKey: 'successRate',
        header: 'Success Rate',
        cell: ({ row }) => {
          const rate = row.original.successRate
          const color =
            rate > 90
              ? 'var(--color-status-active, #22c55e)'
              : rate >= 70
                ? 'var(--color-status-warning, #f59e0b)'
                : 'var(--color-status-error, #ef4444)'
          return (
            <div className="flex items-center gap-2 min-w-[80px]">
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${rate}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-xs font-medium tabular-nums" style={{ color }}>
                {rate}%
              </span>
            </div>
          )
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() =>
                setExpandedWebhookId((prev) => (prev === row.original.id ? null : row.original.id))
              }
              className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors duration-150"
              aria-label="Toggle delivery details"
            >
              {expandedWebhookId === row.original.id ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget({ id: row.original.id, url: row.original.url })}
              className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-red-400 cursor-pointer transition-colors duration-150"
              aria-label="Delete webhook"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    [expandedWebhookId],
  )

  const btnPrimary =
    'inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity cursor-pointer'
  const inputClass =
    'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]'

  if (isAdmin === null)
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  if (isAdmin === false) return null

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
            Webhooks
          </h2>
          <p className="mt-1 text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
            {webhooks.length} endpoints
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/settings/webhooks?new=1')}
          className={btnPrimary}
        >
          <Plus className="h-4 w-4" />
          Add Webhook
        </button>
      </div>

      <DataTable
        data={webhooks}
        columns={columns}
        loading={webhooksQuery.isLoading}
        searchable
        searchPlaceholder="Search webhooks…"
        emptyIcon={<Webhook className="h-10 w-10" />}
        emptyTitle="No webhooks configured"
        mobileCard={(hook) => (
          <motion.div
            whileHover={reduced ? undefined : cardHover}
            whileTap={reduced ? undefined : cardTap}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs text-[var(--color-text-primary)] break-all">
                {hook.url}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${hook.enabled ? 'bg-[var(--color-status-active)]/20 text-[var(--color-status-active)]' : 'bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]'}`}
              >
                {hook.enabled ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">{hook.events.join(', ')}</p>
          </motion.div>
        )}
      />

      <AnimatedList
        className="mt-3 space-y-3"
        items={expandedWebhookId ? webhooks.filter((w) => w.id === expandedWebhookId) : []}
        keyExtractor={(item) => item.id}
        renderItem={(item) => (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
              Recent deliveries for {item.url}
            </h3>
            {item.deliveries.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">No deliveries yet</p>
            ) : (
              <div className="space-y-2">
                {item.deliveries.map((d) => (
                  <div
                    key={d.id}
                    className="grid grid-cols-3 gap-2 rounded-md border border-[var(--color-border)]/70 bg-[var(--color-bg-surface)] px-3 py-2 text-xs"
                  >
                    <span className="text-[var(--color-text-secondary)]">
                      Status: {d.responseStatus}
                    </span>
                    <span className="text-[var(--color-text-muted)]">
                      {formatDate(d.deliveredAt)}
                    </span>
                    <span className="text-[var(--color-text-muted)]">{d.event}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      />

      <Dialog open={showAdd} onClose={() => setShowAdd(false)} title="Add Webhook">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            let parsed: URL
            try {
              parsed = new URL(url)
            } catch {
              toast.error('Invalid webhook URL')
              return
            }
            if (!(parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
              toast.error('Webhook URL must be http/https')
              return
            }
            if (events.length === 0) {
              toast.error('Select at least one event')
              return
            }
            try {
              await createMutation.mutateAsync({ url, events, secret, active })
              webhooksQuery.refetch()
              toast.success('Webhook created')
              setShowAdd(false)
              resetForm()
            } catch {
              toast.error('Failed to create webhook')
            }
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">URL</span>
            <input
              type="url"
              required
              placeholder="https://example.com/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={inputClass}
            />
          </label>

          <fieldset>
            <legend className="mb-2 text-xs text-[var(--color-text-secondary)]">Events</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {WEBHOOK_EVENTS.map((eventName) => (
                <label
                  key={eventName}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2.5 py-2 text-xs text-[var(--color-text-primary)]"
                >
                  <input
                    type="checkbox"
                    checked={events.includes(eventName)}
                    onChange={(e) =>
                      setEvents((prev) =>
                        e.target.checked
                          ? [...prev, eventName]
                          : prev.filter((it) => it !== eventName),
                      )
                    }
                  />
                  {eventName}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">Secret</span>
            <div className="flex gap-2">
              <input readOnly value={secret} className={`${inputClass} font-mono text-xs`} />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(secret)
                  toast.success('Secret copied')
                }}
                className="rounded-lg border border-[var(--color-border)] px-3 text-[var(--color-text-secondary)] hover:bg-white/[0.06] cursor-pointer transition-colors duration-150"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-white/[0.06] cursor-pointer transition-colors duration-150"
            >
              Cancel
            </button>
            <button type="submit" className={btnPrimary}>
              <Link2 className="h-4 w-4" />
              Create
            </button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await deleteMutation.mutateAsync({ id: deleteTarget.id })
            webhooksQuery.refetch()
            toast.success('Webhook deleted')
            setDeleteTarget(null)
          } catch {
            toast.error('Failed to delete webhook')
          }
        }}
        title="Delete webhook"
        description={
          <>
            Delete{' '}
            <span className="font-semibold text-[var(--color-text-primary)]">
              {deleteTarget?.url}
            </span>
            ? This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  )
}

export default function SettingsWebhooksPage() {
  usePageTitle('Settings — Webhooks')

  return (
    <Suspense
      fallback={
        <div className="h-24 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]" />
      }
    >
      <WebhooksContent />
    </Suspense>
  )
}
