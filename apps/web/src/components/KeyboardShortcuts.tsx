'use client'

import { Dialog } from '@/components/ui/dialog'
import { useCallback, useEffect, useState } from 'react'

const shortcuts = [
  { keys: ['Ctrl', 'K'], description: 'Open command palette' },
  { keys: ['R'], description: 'Refresh data' },
  { keys: ['N'], description: 'New item (context-dependent)' },
  { keys: ['/'], description: 'Focus search' },
  { keys: ['?'], description: 'Show this help' },
]

export function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip when focused on input/textarea/select
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      // Skip when modifier keys are held (except for Ctrl+K which is handled by CommandPalette)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      switch (e.key) {
        case '?':
          e.preventDefault()
          setShowHelp((s) => !s)
          break
        case 'r':
        case 'R':
          e.preventDefault()
          // Dispatch custom event for pages to listen to
          document.dispatchEvent(new CustomEvent('voyager:refresh'))
          break
        case 'n':
        case 'N':
          e.preventDefault()
          document.dispatchEvent(new CustomEvent('voyager:new'))
          break
        case '/':
          e.preventDefault()
          // Focus first search input on page
          const searchInput = document.querySelector<HTMLInputElement>(
            'input[type="text"][placeholder*="earch"]',
          )
          searchInput?.focus()
          break
      }
    },
    [],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Listen for custom event from command palette
  useEffect(() => {
    const handler = () => setShowHelp(true)
    document.addEventListener('voyager:show-shortcuts', handler)
    return () => document.removeEventListener('voyager:show-shortcuts', handler)
  }, [])

  return (
    <Dialog open={showHelp} onClose={() => setShowHelp(false)} title="Keyboard Shortcuts">
      <div className="space-y-2">
        {shortcuts.map((s) => (
          <div key={s.description} className="flex items-center justify-between py-2">
            <span className="text-sm text-[var(--color-text-secondary)]">{s.description}</span>
            <div className="flex items-center gap-1">
              {s.keys.map((key) => (
                <kbd
                  key={key}
                  className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-mono text-[var(--color-text-muted)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
                >
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
