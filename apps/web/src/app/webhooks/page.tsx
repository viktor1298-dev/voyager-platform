'use client'

import { AppLayout } from '@/components/AppLayout'
import { AnimatedList, PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { Dialog } from '@/components/ui/dialog'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { mockAdminApi, type WebhookRow } from '@/lib/mock-admin-api'
import type { ColumnDef } from '@tanstack/react-table'
import { ChevronDown, ChevronUp, Copy, Link2, Plus, Trash2, Webhook } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

const WEBHOOK_EVENTS = ['cluster.health.changed', 'deployment.restarted', 'alert.triggered', 'user.created'] as const

function formatDate(date: string | null) {
  if (!date) return '—'
  return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function buildSecret() {
  return `whsec_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

export default function WebhooksPage() {
  const isAdmin = useIsAdmin()
  const router = useRouter()

  const [webhooks, setWebhooks] = useState<WebhookRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
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

  useEffect(() => {
    if (!isAdmin) return
    let mounted = true
    const run = async () => {
      setIsLoading(true)
      try {
        const data = await mockAdminApi.webhooks.listWithDeliveries()
        if (mounted) setWebhooks(data)
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    void run()
    return () => { mounted = false }
  }, [isAdmin])

  useEffect(() => {
    const onNew = () => setShowAdd(true)
    document.addEventListener('voyager:new', onNew)
    return () => document.removeEventListener('voyager:new', onNew)
  }, [])

  if (!isAdmin) return null

  const resetForm = () => {
    setUrl('')
    setEvents(['cluster.health.changed'])
    setSecret(buildSecret())
    setActive(true)
  }

  const columns = useMemo<ColumnDef<WebhookRow, unknown>[]>(() => [
    {
      accessorKey: 'url',
      header: 'URL',
      cell: ({ row }) => <span className="font-mono text-[12px] text-[var(--color-text-primary)]">{row.original.url}</span>,
    },
    {
      id: 'events',
      header: 'Events',
      cell: ({ row }) => <span className="text-[11px] text-[var(--color-text-secondary)]">{row.original.events.join(', ')}</span>,
    },
    {
      accessorKey: 'active',
      header: 'Status',
      cell: ({ row }) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.original.active ? 'bg-[var(--color-status-active)]/20 text-[var(--color-status-active)]' : 'bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]'}`}>
          {row.original.active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      accessorKey: 'lastTriggeredAt',
      header: 'Last Triggered',
      cell: ({ row }) => <span className="text-[11px] text-[var(--color-text-muted)]">{formatDate(row.original.lastTriggeredAt)}</span>,
    },
    {
      accessorKey: 'successRate',
      header: 'Success Rate',
      cell: ({ row }) => <span className="text-[11px] font-medium text-[var(--color-text-primary)]">{row.original.successRate}%</span>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setExpandedWebhookId((prev) => (prev === row.original.id ? null : row.original.id))}
            className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-white/[0.08] hover:text-[var(--color-text-primary)] cursor-pointer"
            aria-label="Toggle delivery details"
          >
            {expandedWebhookId === row.original.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setDeleteTarget({ id: row.original.id, url: row.original.url })}
            className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
            aria-label="Delete webhook"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ], [expandedWebhookId])

  const btnPrimary = 'inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity cursor-pointer'
  const inputClass = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]'

  return (
    <AppLayout>
      <PageTransition>
        <Breadcrumbs />
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">Webhooks</h1>
            <p className="mt-1 text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-dim)]">{webhooks.length} endpoints</p>
          </div>
          <button type="button" onClick={() => setShowAdd(true)} className={btnPrimary}>
            <Plus className="h-4 w-4" />Add Webhook
          </button>
        </div>

        <DataTable
          data={webhooks}
          columns={columns}
          loading={isLoading}
          searchable
          searchPlaceholder="Search webhooks…"
          emptyIcon={<Webhook className="h-10 w-10" />}
          emptyTitle="No webhooks configured"
          mobileCard={(hook) => (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs text-[var(--color-text-primary)] break-all">{hook.url}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${hook.active ? 'bg-[var(--color-status-active)]/20 text-[var(--color-status-active)]' : 'bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]'}`}>{hook.active ? 'Active' : 'Inactive'}</span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">{hook.events.join(', ')}</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <span className="text-[var(--color-text-muted)]">Last</span>
                <span className="text-[var(--color-text-primary)]">{formatDate(hook.lastTriggeredAt)}</span>
                <span className="text-[var(--color-text-muted)]">Success</span>
                <span className="text-[var(--color-text-primary)]">{hook.successRate}%</span>
              </div>
            </div>
          )}
        />

        <AnimatedList
          className="mt-3 space-y-3"
          items={expandedWebhookId ? webhooks.filter((w) => w.id === expandedWebhookId) : []}
          keyExtractor={(item) => item.id}
          renderItem={(item) => (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
              <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">Recent deliveries for {item.url}</h3>
              {item.deliveries.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">No deliveries yet</p>
              ) : (
                <div className="space-y-2">
                  {item.deliveries.map((d) => (
                    <div key={d.id} className="grid grid-cols-3 gap-2 rounded-md border border-[var(--color-border)]/70 bg-[var(--color-bg-surface)] px-3 py-2 text-xs">
                      <span className="text-[var(--color-text-secondary)]">Status: {d.statusCode}</span>
                      <span className="text-[var(--color-text-muted)]">{formatDate(d.timestamp)}</span>
                      <span className="text-[var(--color-text-muted)]">Retry: {d.retryCount}</span>
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
                // Placeholder for: trpc.webhooks.create.useMutation()
                await mockAdminApi.webhooks.create({ url, events, secret, active })
                const updated = await mockAdminApi.webhooks.listWithDeliveries()
                setWebhooks(updated)
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
              <input type="url" required placeholder="https://example.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} />
            </label>

            <fieldset>
              <legend className="mb-2 text-xs text-[var(--color-text-secondary)]">Events</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {WEBHOOK_EVENTS.map((eventName) => (
                  <label key={eventName} className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2.5 py-2 text-xs text-[var(--color-text-primary)]">
                    <input
                      type="checkbox"
                      checked={events.includes(eventName)}
                      onChange={(e) => {
                        setEvents((prev) => (e.target.checked ? [...prev, eventName] : prev.filter((it) => it !== eventName)))
                      }}
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
                  className="rounded-lg border border-[var(--color-border)] px-3 text-[var(--color-text-secondary)] hover:bg-white/[0.06] cursor-pointer"
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
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-white/[0.06] cursor-pointer">Cancel</button>
              <button type="submit" className={btnPrimary}><Link2 className="h-4 w-4" />Create</button>
            </div>
          </form>
        </Dialog>

        <ConfirmDialog
          open={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            if (!deleteTarget) return
            try {
              // Placeholder for: trpc.webhooks.delete.useMutation()
              await mockAdminApi.webhooks.delete({ id: deleteTarget.id })
              setWebhooks((prev) => prev.filter((item) => item.id !== deleteTarget.id))
              toast.success('Webhook deleted')
              setDeleteTarget(null)
            } catch {
              toast.error('Failed to delete webhook')
            }
          }}
          title="Delete webhook"
          description={<>Delete <span className="font-semibold text-[var(--color-text-primary)]">{deleteTarget?.url}</span>? This action cannot be undone.</>}
          confirmLabel="Delete"
          variant="danger"
        />
      </PageTransition>
    </AppLayout>
  )
}
