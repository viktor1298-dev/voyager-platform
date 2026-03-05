'use client'

import { Dialog } from '@/components/ui/dialog'
import { GLOBAL_SHORTCUTS, useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useCallback, useEffect, useState } from 'react'

export function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false)

  // Register ? shortcut, R refresh, N new, / search, J/K navigation, G-prefix nav
  useKeyboardShortcuts([
    {
      keys: ['?'],
      description: 'Show keyboard shortcuts',
      handler: () => setShowHelp((s) => !s),
    },
    {
      keys: ['r'],
      description: 'Refresh',
      handler: () => document.dispatchEvent(new CustomEvent('voyager:refresh')),
    },
    {
      keys: ['n'],
      description: 'New item',
      handler: () => document.dispatchEvent(new CustomEvent('voyager:new')),
    },
    {
      keys: ['/'],
      description: 'Focus search',
      handler: () => {
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[type="text"][placeholder*="earch"], input[placeholder*="ilter"], input[placeholder*="Search"]',
        )
        searchInput?.focus()
      },
    },
    {
      keys: ['j'],
      description: 'Move down in list',
      handler: () => document.dispatchEvent(new CustomEvent('voyager:list-down')),
    },
    {
      keys: ['k'],
      description: 'Move up in list',
      handler: () => document.dispatchEvent(new CustomEvent('voyager:list-up')),
    },
  ])

  // Listen for show-shortcuts custom event (from command palette)
  useEffect(() => {
    const handler = () => setShowHelp(true)
    document.addEventListener('voyager:show-shortcuts', handler)
    return () => document.removeEventListener('voyager:show-shortcuts', handler)
  }, [])

  // Group shortcuts
  const groups = GLOBAL_SHORTCUTS.reduce<Record<string, typeof GLOBAL_SHORTCUTS>>((acc, s) => {
    if (!acc[s.group]) acc[s.group] = []
    acc[s.group].push(s)
    return acc
  }, {})

  return (
    <Dialog open={showHelp} onClose={() => setShowHelp(false)} title="Keyboard Shortcuts">
      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-dim)] mb-2">
              {group}
            </h4>
            <div className="space-y-1">
              {items.map((s) => (
                <div key={s.description} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-[var(--color-text-secondary)]">{s.description}</span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((key) => (
                      <kbd
                        key={key}
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono text-[var(--color-text-muted)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
