'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink, Globe, Info, KeyRound, Layers, Server, Wifi } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { DataTable } from '@/components/DataTable'
import { ApiTokensSection } from '@/components/settings/ApiTokens'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { APP_VERSION } from '@/config/constants'
import {
  type AiProvider,
  getAiKeySettings,
  maskApiKey,
  testAiKeyConnection,
  upsertAiKeySettings,
} from '@/lib/ai-keys-client'
import { normalizeLiveHealthStatus, healthBadgeLabel } from '@/lib/cluster-status'
import { trpc } from '@/lib/trpc'
import { useClusterContext } from '@/stores/cluster-context'

interface ClusterRow {
  id: string
  name: string
  provider: string
  endpoint: string
  status: string
}

interface ProviderConfig {
  value: AiProvider
  label: string
  models: string[]
}

const PROVIDERS: ProviderConfig[] = [
  {
    value: 'claude',
    label: 'Claude (Anthropic)',
    models: ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-latest'],
  },
  { value: 'openai', label: 'OpenAI', models: ['gpt-4.1', 'gpt-4o-mini'] },
]

const clusterColumns: ColumnDef<ClusterRow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-primary)] font-medium text-[12px]">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'provider',
    header: 'Provider',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-secondary)] text-[12px]">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: 'endpoint',
    header: 'Endpoint',
    cell: ({ getValue }) => (
      <span className="text-[var(--color-text-muted)] font-mono text-[11px]">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const status = getValue<string>()
      const color =
        status === 'active' || status === 'healthy' || status === 'Connected'
          ? 'var(--color-status-active)'
          : status === 'warning'
            ? 'var(--color-status-warning)'
            : 'var(--color-status-error)'
      return (
        <span className="text-[11px] font-semibold" style={{ color }}>
          {status}
        </span>
      )
    },
  },
]

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--color-border)]/50 last:border-b-0">
      <span className="text-[12px] text-[var(--color-text-muted)] font-mono uppercase tracking-wider">
        {label}
      </span>
      <span className="text-[13px] text-[var(--color-text-primary)] font-medium">{value}</span>
    </div>
  )
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl p-6 border border-[var(--glass-border)] hover:border-[var(--glass-border-hover)] animate-slide-up"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        boxShadow: 'var(--shadow-card)',
        transition: 'border-color var(--duration-normal) ease',
      }}
    >
      <div className="flex items-center gap-2.5 mb-5">
        <span className="text-[var(--color-accent)]">{icon}</span>
        <h3 className="text-[14px] font-bold text-[var(--color-text-primary)] tracking-tight">
          {title}
        </h3>
      </div>
      {children}
    </div>
  )
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={`h-2.5 w-2.5 rounded-full ${connected ? 'animate-pulse-slow' : ''}`}
        style={{
          backgroundColor: connected ? 'var(--color-status-active)' : 'var(--color-status-error)',
          boxShadow: connected
            ? '0 0 8px rgba(0, 229, 153, 0.4)'
            : '0 0 8px rgba(255, 77, 106, 0.4)',
        }}
      />
      <span
        style={{ color: connected ? 'var(--color-status-active)' : 'var(--color-status-error)' }}
        className="text-[13px] font-semibold"
      >
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </span>
  )
}

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  const activeClusterId = useClusterContext((s) => s.activeClusterId)

  const liveQuery = trpc.clusters.live.useQuery({ clusterId: activeClusterId ?? '' }, {
    enabled: Boolean(activeClusterId),
    refetchInterval: 30000,
  })
  const listQuery = trpc.clusters.list.useQuery(undefined, {
    refetchInterval: 60000,
  })

  const [provider, setProvider] = useState<AiProvider>('claude')
  const [model, setModel] = useState(PROVIDERS[0].models[0])
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [storedMaskedKey, setStoredMaskedKey] = useState<string | null>(null)
  const [storedKeyProvider, setStoredKeyProvider] = useState<AiProvider | null>(null)
  const [storedKeyModel, setStoredKeyModel] = useState<string | null>(null)
  const [isKeyLoading, setIsKeyLoading] = useState(true)
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [actionStatus, setActionStatus] = useState<{
    type: 'success' | 'error'
    message: string
    action: 'save' | 'test'
    at: string
  } | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const [lastSyncLabel, setLastSyncLabel] = useState('—')

  const hasStoredKeyForProvider = Boolean(storedMaskedKey) && storedKeyProvider === provider
  const hasStoredKeyForSelection = hasStoredKeyForProvider && storedKeyModel === model
  const hasRawKeyInput = apiKeyInput.trim().length > 0

  const providerConfig = useMemo(
    () => PROVIDERS.find((item) => item.value === provider) ?? PROVIDERS[0],
    [provider],
  )

  const live = liveQuery.data
  const clusters = listQuery.data ?? []
  const isConnected = !!live

  useEffect(() => {
    if (!providerConfig.models.includes(model)) {
      setModel(providerConfig.models[0])
    }
  }, [model, providerConfig])

  // Keep latest action status visible until a newer save/test result replaces it.

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated || !isConnected) {
      setLastSyncLabel('—')
      return
    }

    const formatSyncTime = () =>
      new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })

    setLastSyncLabel(formatSyncTime())
    const timer = window.setInterval(() => {
      setLastSyncLabel(formatSyncTime())
    }, 1_000)

    return () => window.clearInterval(timer)
  }, [isConnected, isHydrated])

  useEffect(() => {
    let cancelled = false

    const loadAiKeySettings = async () => {
      setIsKeyLoading(true)

      try {
        const keySettings = await getAiKeySettings()
        if (cancelled) return

        if (keySettings) {
          setProvider(keySettings.provider)
          setModel(keySettings.model)
          setStoredMaskedKey(keySettings.maskedKey || null)
          setStoredKeyProvider(keySettings.provider)
          setStoredKeyModel(keySettings.model)
        }
      } catch (error) {
        if (cancelled) return

        console.error('[Settings/BYOK] Failed to load saved AI key settings', {
          area: 'settings/byok',
          operation: 'loadAiKeySettings',
          error,
        })

        setStoredMaskedKey(null)
        setStoredKeyProvider(null)
        setStoredKeyModel(null)
      } finally {
        if (!cancelled) {
          setIsKeyLoading(false)
        }
      }
    }

    void loadAiKeySettings()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AppLayout>
      <PageTransition>
        <Breadcrumbs />

        <div className="mb-8">
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
            Settings
          </h1>
          <p className="text-[12px] text-[var(--color-text-dim)] font-mono uppercase tracking-wider mt-1">
            Platform configuration & information
          </p>
        </div>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="ai">AI Configuration</TabsTrigger>
            <TabsTrigger value="tokens">API Tokens</TabsTrigger>
            <TabsTrigger value="clusters">Clusters</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <SectionCard icon={<Wifi className="h-4 w-4" />} title="Cluster Connection">
                <InfoRow label="Status" value={<StatusDot connected={isConnected} />} />
                <InfoRow
                  label="API Endpoint"
                  value={
                    <span className="text-[12px] font-mono text-[var(--color-text-secondary)]">
                      {isConnected ? (live.endpoint ?? '/trpc') : '—'}
                    </span>
                  }
                />
                <InfoRow label="K8s Version" value={isConnected ? live.version : '—'} />
                <InfoRow
                  label="Last Sync"
                  value={<span suppressHydrationWarning>{isConnected ? lastSyncLabel : '—'}</span>}
                />
              </SectionCard>

              <SectionCard icon={<Server className="h-4 w-4" />} title="Platform Info">
                <InfoRow
                  label="Voyager Version"
                  value={
                    <span
                      className="gradient-text font-bold"
                      style={{ backgroundImage: 'var(--gradient-text-default)' }}
                    >
                      {APP_VERSION}
                    </span>
                  }
                />
                <InfoRow label="API Version" value="v1" />
                <InfoRow label="Runtime" value="Next.js 16 + tRPC 11" />
                <InfoRow
                  label="Status"
                  value={
                    <span className="text-[var(--color-status-active)] text-[12px] font-semibold">
                      Operational
                    </span>
                  }
                />
              </SectionCard>

              <SectionCard icon={<Info className="h-4 w-4" />} title="About">
                <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed mb-4">
                  <strong className="text-[var(--color-text-primary)]">Voyager Platform</strong> —
                  Unified Kubernetes Operations Dashboard.
                </p>
                <div className="flex flex-col gap-2">
                  <a
                    href="https://github.com/vkzone/voyager-platform"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[12px] text-[var(--color-accent)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    GitHub Repository
                    <ExternalLink className="h-3 w-3 opacity-50" />
                  </a>
                </div>
              </SectionCard>
            </div>
          </TabsContent>

          <TabsContent value="ai">
          <SectionCard icon={<Info className="h-4 w-4" />} title="AI Bring Your Own Key (BYOK)">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (!apiKeyInput.trim() || isSaving) return

                setIsSaving(true)
                void upsertAiKeySettings({ provider, model, apiKey: apiKeyInput.trim() })
                  .then((saved) => {
                    setStoredMaskedKey(saved.maskedKey)
                    setStoredKeyProvider(saved.provider)
                    setStoredKeyModel(saved.model)
                    setApiKeyInput('')
                    const message = `AI key saved for ${saved.provider}/${saved.model}`
                    setActionStatus({
                      type: 'success',
                      message,
                      action: 'save',
                      at: new Date().toISOString(),
                    })
                    toast.success('AI key saved')
                  })
                  .catch((error) => {
                    const message = error instanceof Error ? error.message : 'Failed to save AI key'
                    setActionStatus({
                      type: 'error',
                      message,
                      action: 'save',
                      at: new Date().toISOString(),
                    })
                    toast.error(message)
                  })
                  .finally(() => setIsSaving(false))
              }}
            >
              <div>
                <label
                  htmlFor="provider"
                  className="mb-1 block text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-mono"
                >
                  Provider
                </label>
                <select
                  id="provider"
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as AiProvider)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                >
                  {PROVIDERS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="model"
                  className="mb-1 block text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-mono"
                >
                  Model
                </label>
                <select
                  id="model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                >
                  {providerConfig.models.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="api-key"
                  className="mb-1 block text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-mono"
                >
                  API Key
                </label>
                <input
                  id="api-key"
                  type="password"
                  value={apiKeyInput}
                  onChange={(event) => setApiKeyInput(event.target.value)}
                  placeholder={provider === 'claude' ? 'sk-ant-...' : 'sk-...'}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                />
                <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
                  We never show your full key in the UI.
                </p>
                {(storedMaskedKey || apiKeyInput) && (
                  <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
                    Key preview:{' '}
                    <span className="font-mono">{storedMaskedKey ?? maskApiKey(apiKeyInput)}</span>
                  </p>
                )}
              </div>

              <div
                data-testid="byok-actions"
                className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2"
              >
                <button
                  type="submit"
                  data-testid="byok-save"
                  disabled={!apiKeyInput.trim() || isSaving}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[var(--color-accent)]/20 hover:opacity-90 disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : 'Save Key'}
                </button>

                <button
                  type="button"
                  data-testid="byok-test"
                  disabled={(!hasRawKeyInput && !hasStoredKeyForProvider) || isTesting}
                  onClick={() => {
                    setIsTesting(true)
                    void testAiKeyConnection({
                      provider,
                      model,
                      apiKey: hasRawKeyInput ? apiKeyInput.trim() : undefined,
                    })
                      .then((result) => {
                        if (result.ok) {
                          setActionStatus({
                            type: 'success',
                            message: result.message,
                            action: 'test',
                            at: new Date().toISOString(),
                          })
                          toast.success(result.message)
                        } else {
                          setActionStatus({
                            type: 'error',
                            message: result.message,
                            action: 'test',
                            at: new Date().toISOString(),
                          })
                          toast.error(result.message)
                        }
                      })
                      .finally(() => setIsTesting(false))
                  }}
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-white/[0.04] disabled:opacity-60"
                >
                  {isTesting
                    ? hasRawKeyInput
                      ? 'Testing new key...'
                      : 'Testing saved key...'
                    : hasRawKeyInput
                      ? 'Test New Key'
                      : 'Test Saved Key'}
                </button>
              </div>

              {hasStoredKeyForProvider && !hasRawKeyInput && (
                <p className="text-xs text-[var(--color-text-dim)]">
                  You can test your saved key, or enter a new key and save to replace it.
                </p>
              )}

              {!hasRawKeyInput &&
                storedMaskedKey &&
                storedKeyProvider &&
                storedKeyProvider !== provider && (
                  <p className="text-xs text-[var(--color-text-dim)]">
                    Saved key exists for {storedKeyProvider}, switch provider to test it.
                  </p>
                )}

              <div
                data-testid="byok-saved-state"
                className={`rounded-xl border px-3 py-2 text-xs ${
                  isKeyLoading
                    ? 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-dim)]'
                    : hasStoredKeyForSelection
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : hasStoredKeyForProvider
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-dim)]'
                }`}
              >
                {isKeyLoading
                  ? 'Loading saved key status…'
                  : hasStoredKeyForSelection
                    ? `Saved key active for ${provider}/${model}`
                    : hasStoredKeyForProvider
                      ? `Saved key exists for ${provider}/${storedKeyModel ?? 'another model'} (selected model is ${model})`
                      : 'No saved key for selected provider'}
              </div>

              {actionStatus && (
                <div
                  data-testid="byok-action-status"
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    actionStatus.type === 'success'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-red-500/40 bg-red-500/10 text-red-300'
                  }`}
                >
                  <div className="font-medium">
                    {actionStatus.action === 'save' ? 'Save result' : 'Test result'}
                  </div>
                  <div>{actionStatus.message}</div>
                  <div className="mt-0.5 opacity-80">
                    {new Date(actionStatus.at).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </div>
                </div>
              )}
            </form>
          </SectionCard>

          </TabsContent>

          <TabsContent value="tokens">
            <SectionCard icon={<KeyRound className="h-4 w-4" />} title="API Tokens">
              <ApiTokensSection />
            </SectionCard>
          </TabsContent>

          <TabsContent value="clusters">
            <SectionCard icon={<Layers className="h-4 w-4" />} title="Registered Clusters">
              <ClusterTable live={live} clusters={clusters} />
            </SectionCard>
          </TabsContent>
        </Tabs>
      </PageTransition>
    </AppLayout>
  )
}

function ClusterTable({
  live,
  clusters,
}: {
  live: Record<string, unknown> | null | undefined
  clusters: Array<Record<string, unknown>>
}) {
  const rows: ClusterRow[] = useMemo(() => {
    const result: ClusterRow[] = []
    if (live) {
      result.push({
        id: 'live',
        name: (live.name as string) ?? '',
        provider: (live.provider as string) ?? '',
        endpoint: (live.endpoint as string) ?? 'in-cluster',
        status: 'Connected',
      })
    }
    for (const c of clusters) {
      if (
        live &&
        ((c.name as string) === (live.name as string) || (c.name as string) === 'minikube-dev')
      )
        continue
      result.push({
        id: (c.id as string) ?? '',
        name: (c.name as string) ?? '',
        provider: (c.provider as string) ?? '',
        endpoint: (c.endpoint as string) ?? '—',
        status: healthBadgeLabel(normalizeLiveHealthStatus(((c as Record<string, unknown>).healthStatus as string) ?? (c.status as string))),
      })
    }
    return result
  }, [live, clusters])

  if (rows.length === 0) {
    return (
      <p className="text-[12px] text-[var(--color-text-muted)] py-4">No clusters registered.</p>
    )
  }

  return <DataTable data={rows} columns={clusterColumns} />
}
