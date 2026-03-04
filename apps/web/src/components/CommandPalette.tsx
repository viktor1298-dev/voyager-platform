'use client'

import { Command } from 'cmdk'
import { Bot, Box, Clock, Key, Layers, Search, Server } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { navItems } from '@/config/navigation'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { trpc } from '@/lib/trpc'

const MAX_RECENT = 5
const RECENT_KEY = 'voyager-command-palette-recent'

interface RecentItem {
  label: string
  path: string
  type: string
  timestamp: number
}

function getRecentItems(): RecentItem[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

function addRecentItem(item: Omit<RecentItem, 'timestamp'>) {
  const items = getRecentItems().filter((r) => r.path !== item.path)
  items.unshift({ ...item, timestamp: Date.now() })
  localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT)))
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])

  // Fetch resource data for fuzzy search
  const clustersQuery = trpc.clusters.list.useQuery(undefined, { enabled: open, staleTime: 30000 })
  const deploymentsQuery = trpc.deployments.list.useQuery(undefined, {
    enabled: open,
    staleTime: 30000,
  })
  const servicesQuery = trpc.services.list.useQuery(undefined, { enabled: open, staleTime: 30000 })

  useEffect(() => {
    if (open) {
      setRecentItems(getRecentItems())
    }
  }, [open])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const navigate = useCallback(
    (path: string, label: string, type: string) => {
      addRecentItem({ label, path, type })
      router.push(path)
      setOpen(false)
      setSearch('')
    },
    [router],
  )

  const filteredItems = navItems.filter(
    (item) => !('adminOnly' in item && item.adminOnly) || isAdmin,
  )

  const resourceItems = useMemo(() => {
    const items: { label: string; path: string; type: string; icon: typeof Server }[] = []

    for (const c of clustersQuery.data ?? []) {
      if (c.name && c.id)
        items.push({ label: c.name, path: `/clusters/${c.id}`, type: 'Cluster', icon: Server })
    }

    for (const d of deploymentsQuery.data ?? []) {
      if (d.name && d.id)
        items.push({ label: d.name, path: `/deployments/${d.id}`, type: 'Deployment', icon: Box })
    }

    for (const s of servicesQuery.data ?? []) {
      if (s.name && s.id)
        items.push({ label: s.name, path: `/services/${s.id}`, type: 'Service', icon: Layers })
    }

    return items
  }, [clustersQuery.data, deploymentsQuery.data, servicesQuery.data])

  if (!open) return null

  const itemClass =
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--color-text-secondary)] cursor-pointer data-[selected=true]:bg-indigo-500/10 data-[selected=true]:text-[var(--color-text-primary)] transition-colors'
  const headingClass =
    '[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--color-text-dim)] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5'

  return (
    <div className="fixed inset-0 z-[100]" role="presentation">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="relative flex items-start justify-center pt-[20vh]">
        <Command
          className="w-full max-w-lg mx-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-2xl overflow-hidden animate-slide-up"
          label="Command Palette"
          shouldFilter
        >
          <div className="flex items-center gap-2 px-4 border-b border-[var(--color-border)]">
            <Search className="h-4 w-4 text-[var(--color-text-muted)] shrink-0" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search commands, clusters, services…"
              className="w-full py-3 text-sm bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
            />
            <div className="hidden sm:inline-flex items-center gap-1.5">
              <kbd className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--color-text-dim)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                ↑↓
              </kbd>
              <kbd className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--color-text-dim)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                ↵
              </kbd>
              <kbd className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--color-text-dim)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                ESC
              </kbd>
            </div>
          </div>
          <Command.List className="max-h-[400px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-[var(--color-text-muted)]">
              No results found.
            </Command.Empty>

            {/* Recent Items */}
            {recentItems.length > 0 && !search && (
              <Command.Group heading="Recent" className={headingClass}>
                {recentItems.map((item) => (
                  <Command.Item
                    key={`recent-${item.path}`}
                    value={`Recent ${item.label} ${item.type}`}
                    onSelect={() => navigate(item.path, item.label, item.type)}
                    className={itemClass}
                  >
                    <Clock className="h-4 w-4 shrink-0 text-[var(--color-text-dim)]" />
                    <span>{item.label}</span>
                    <span className="ml-auto text-[10px] text-[var(--color-text-dim)] font-mono">
                      {item.type}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Navigation */}
            <Command.Group heading="Navigation" className={headingClass}>
              {filteredItems.map((item) => {
                const Icon = item.icon
                return (
                  <Command.Item
                    key={item.id}
                    value={`Go to ${item.label}`}
                    onSelect={() => navigate(item.id, item.label, 'Navigation')}
                    className={itemClass}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                    <span className="ml-auto text-[10px] text-[var(--color-text-dim)] font-mono">
                      {item.id}
                    </span>
                  </Command.Item>
                )
              })}
              <Command.Item
                value="Go to API Tokens"
                onSelect={() => navigate('/api-tokens', 'API Tokens', 'Navigation')}
                className={itemClass}
              >
                <Key className="h-4 w-4 shrink-0" />
                <span>API Tokens</span>
                <span className="ml-auto text-[10px] text-[var(--color-text-dim)] font-mono">
                  /api-tokens
                </span>
              </Command.Item>
            </Command.Group>

            {/* Clusters */}
            {resourceItems.filter((i) => i.type === 'Cluster').length > 0 && (
              <Command.Group heading="Clusters" className={headingClass}>
                {resourceItems
                  .filter((i) => i.type === 'Cluster')
                  .map((item) => {
                    const RIcon = item.icon
                    return (
                      <Command.Item
                        key={`resource-${item.path}`}
                        value={`Cluster ${item.label}`}
                        onSelect={() => navigate(item.path, item.label, item.type)}
                        className={itemClass}
                      >
                        <RIcon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                        <span className="ml-auto text-[10px] text-[var(--color-text-dim)] font-mono">
                          cluster
                        </span>
                      </Command.Item>
                    )
                  })}
              </Command.Group>
            )}

            {/* Resources — deployments, services */}
            {resourceItems.filter((i) => i.type !== 'Cluster').length > 0 && (
              <Command.Group heading="Resources" className={headingClass}>
                {resourceItems
                  .filter((i) => i.type !== 'Cluster')
                  .map((item) => {
                    const RIcon = item.icon
                    return (
                      <Command.Item
                        key={`resource-${item.path}`}
                        value={`${item.type} ${item.label}`}
                        onSelect={() => navigate(item.path, item.label, item.type)}
                        className={itemClass}
                      >
                        <RIcon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                        <span className="ml-auto text-[10px] text-[var(--color-text-dim)] font-mono">
                          {item.type.toLowerCase()}
                        </span>
                      </Command.Item>
                    )
                  })}
              </Command.Group>
            )}

            {/* Actions */}
            <Command.Group heading="Actions" className={headingClass}>
              <Command.Item
                value="Toggle theme"
                onSelect={() => {
                  document.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]')?.click()
                  setOpen(false)
                }}
                className={itemClass}
              >
                🎨 Toggle Theme
              </Command.Item>
              <Command.Item
                value="Show keyboard shortcuts"
                onSelect={() => {
                  setOpen(false)
                  document.dispatchEvent(new CustomEvent('voyager:show-shortcuts'))
                }}
                className={itemClass}
              >
                ⌨️ Keyboard Shortcuts
              </Command.Item>
              <Command.Item
                value="Open AI Assistant"
                onSelect={() => navigate('/ai', 'AI Assistant', 'Navigation')}
                className={itemClass}
              >
                <Bot className="h-4 w-4 shrink-0" />
                <span>AI Assistant</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
