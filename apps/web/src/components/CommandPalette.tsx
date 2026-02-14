'use client'

import { Command } from 'cmdk'
import { navItems } from '@/config/navigation'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const router = useRouter()
  const isAdmin = useIsAdmin()

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
    (path: string) => {
      router.push(path)
      setOpen(false)
      setSearch('')
    },
    [router],
  )

  const filteredItems = navItems.filter(
    (item) => !('adminOnly' in item && item.adminOnly) || isAdmin,
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100]" role="presentation">
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
              placeholder="Type a command or search…"
              className="w-full py-3 text-sm bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
            />
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--color-text-dim)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-[var(--color-text-muted)]">
              No results found.
            </Command.Empty>

            <Command.Group heading="Navigation" className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--color-text-dim)] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
              {filteredItems.map((item) => {
                const Icon = item.icon
                return (
                  <Command.Item
                    key={item.id}
                    value={`Go to ${item.label}`}
                    onSelect={() => navigate(item.id)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--color-text-secondary)] cursor-pointer data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-[var(--color-text-primary)] transition-colors"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                    <span className="ml-auto text-[10px] text-[var(--color-text-dim)] font-mono">{item.id}</span>
                  </Command.Item>
                )
              })}
            </Command.Group>

            <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--color-text-dim)] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
              <Command.Item
                value="Toggle theme"
                onSelect={() => {
                  document.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]')?.click()
                  setOpen(false)
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--color-text-secondary)] cursor-pointer data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-[var(--color-text-primary)] transition-colors"
              >
                🎨 Toggle Theme
              </Command.Item>
              <Command.Item
                value="Show keyboard shortcuts"
                onSelect={() => {
                  setOpen(false)
                  document.dispatchEvent(new CustomEvent('voyager:show-shortcuts'))
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--color-text-secondary)] cursor-pointer data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-[var(--color-text-primary)] transition-colors"
              >
                ⌨️ Keyboard Shortcuts
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
